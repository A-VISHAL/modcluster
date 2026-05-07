import { Hono } from 'hono';
import { context, redis as webRedis } from '@devvit/web/server';
import {
  createHandoverCard,
  fetchActiveHandover,
  fetchHandoverHistory,
  saveHandover,
} from '../core/handover';
import { fetchRecentActivity } from '../core/activity';
import {
  addVote,
  countVotes,
  createJuryCase,
  fetchActiveCases,
  fetchJuryCase,
  fetchResolvedCases,
  saveNewJuryCase,
  type JuryVoteValue,
} from '../core/jury';

export const api = new Hono();

/**
 * API routes used by the ModPulse custom post webview.
 *
 * Architecture notes:
 * - We keep the webview "dumb": it renders UI + calls these endpoints.
 * - Redis-backed workflows live in `src/core/*` and are reused here.
 * - Endpoints are intentionally small and composable so we can evolve toward a
 *   real moderation platform without rewrites.
 */

type DashboardJuryCase = {
  id: string;
  postId: string;
  createdAt: number;
  createdBy: string;
  reason: string;
  ruleCitation: string;
  contextNotes: string;
  votes: ReturnType<typeof countVotes>;
  finalVerdict: 'approve' | 'remove' | null;
  status: 'pending' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  resolvedAt?: number;
  ai: {
    summary: string;
    category: string;
    similarCases: string[];
    suggestedAction: 'Remove' | 'Approve' | 'Redirect' | 'Lock thread';
    confidence: 'low' | 'medium' | 'high';
  };
};

type DashboardPayload = {
  meta: {
    subredditId: string | null;
    username: string | null;
    now: number;
  };
  status: {
    redisConnected: boolean;
    liveModeration: boolean;
    jurySystemActive: boolean;
  };
  handover: {
    active: Awaited<ReturnType<typeof fetchActiveHandover>>;
    history: Awaited<ReturnType<typeof fetchHandoverHistory>>;
  };
  activity: Awaited<ReturnType<typeof fetchRecentActivity>>;
  jury: {
    pending: DashboardJuryCase[];
    resolved: DashboardJuryCase[];
  };
  communityHealth: {
    reportsToday: number;
    toxicityAlerts: number;
    queueBacklog: number;
    moderatorWorkload: number;
    burnoutRisk: 'low' | 'medium' | 'high';
  };
};

const requireSubredditId = (): string => {
  if (!context.subredditId) {
    // In practice this should always exist in a subreddit-scoped webview.
    throw new Error('Missing subredditId in request context.');
  }
  return context.subredditId;
};

const computeCommunityHealth = (seed: number): DashboardPayload['communityHealth'] => {
  // Deterministic-ish demo numbers, stable per subreddit + time window.
  const rand = (n: number) => Math.abs(Math.sin(seed * 997 + n * 17));
  const queueBacklog = Math.floor(rand(1) * 42) + 6;
  const reportsToday = Math.floor(rand(2) * 35) + 4;
  const toxicityAlerts = Math.floor(rand(3) * 9);
  const moderatorWorkload = Math.min(100, Math.floor(queueBacklog * 2.1 + reportsToday * 1.4));
  const burnoutRisk = moderatorWorkload > 75 ? 'high' : moderatorWorkload > 45 ? 'medium' : 'low';

  return {
    reportsToday,
    toxicityAlerts,
    queueBacklog,
    moderatorWorkload,
    burnoutRisk,
  };
};

const ensureSeedJuryCases = async (subredditId: string, username: string | null) => {
  const existing = await fetchActiveCases(subredditId, 1);
  if (existing.length > 0) return;

  const createdBy = username ?? 'modpulse-bot';
  const now = Date.now();

  const seeds = [
    createJuryCase({
      subredditId,
      postId: 't3_demo_case_1',
      createdBy,
      reason: 'Possible brigading / coordinated voting pattern detected.',
      ruleCitation: 'Rule 2 — No vote manipulation',
      contextNotes: 'Spike in new accounts + identical phrasing across comments.',
      createdAt: now - 1000 * 60 * 22,
      id: `seed-${subredditId}-1`,
    }),
    createJuryCase({
      subredditId,
      postId: 't3_demo_case_2',
      createdBy,
      reason: 'User report cluster suggests targeted harassment.',
      ruleCitation: 'Rule 1 — Be civil',
      contextNotes: 'Multiple reports from different users within 10 minutes.',
      createdAt: now - 1000 * 60 * 9,
      id: `seed-${subredditId}-2`,
    }),
    createJuryCase({
      subredditId,
      postId: 't3_demo_case_3',
      createdBy,
      reason: 'Potential spam: repeated external links in comments.',
      ruleCitation: 'Rule 4 — No spam',
      contextNotes: 'Same domain posted by 3 accounts; may be campaign.',
      createdAt: now - 1000 * 60 * 3,
      id: `seed-${subredditId}-3`,
    }),
  ];

  await Promise.all(seeds.map((juryCase) => saveNewJuryCase(juryCase)));
};

const clampPriority = (value: unknown): 'low' | 'medium' | 'high' => {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
};

const buildAiOutput = (input: {
  reason: string;
  ruleCitation: string;
  contextNotes: string;
  postId: string;
}): DashboardJuryCase['ai'] => {
  const text = `${input.reason} ${input.ruleCitation} ${input.contextNotes}`.toLowerCase();

  const category = text.includes('spam')
    ? 'Spam / self-promo'
    : text.includes('harass') || text.includes('abuse') || text.includes('civil')
      ? 'Harassment / civility'
      : text.includes('vote') || text.includes('brigad')
        ? 'Manipulation / brigading'
        : text.includes('nsfw')
          ? 'NSFW / safety'
          : 'Needs moderator review';

  const suggestedAction: DashboardJuryCase['ai']['suggestedAction'] =
    category === 'Harassment / civility'
      ? 'Remove'
      : category === 'Spam / self-promo'
        ? 'Remove'
        : category === 'Manipulation / brigading'
          ? 'Lock thread'
          : 'Redirect';

  const confidence: DashboardJuryCase['ai']['confidence'] =
    category === 'Needs moderator review' ? 'low' : 'medium';

  const similarCases = [
    `Case: ${input.postId} • Pattern match: “clustered reports”`,
    `Case: t3_prev_2 • Pattern match: “repeat phrasing”`,
    `Case: t3_prev_3 • Pattern match: “link repetition”`,
  ];

  return {
    summary:
      `Signals suggest: ${category}. ` +
      `Primary concern: ${input.reason || 'unspecified'}. ` +
      `Context: ${input.contextNotes || 'no additional notes'}.`,
    category,
    similarCases,
    suggestedAction,
    confidence,
  };
};

api.get('/dashboard', async (c) => {
  const now = Date.now();
  const subredditId = context.subredditId ?? null;
  const username = context.username ?? null;

  console.log('[ModPulse][api] dashboard refresh', {
    subredditId,
    username,
    now,
  });

  let redisConnected = false;
  try {
    // Simple connectivity check. If Redis is down/misconfigured, this will throw.
    await webRedis.set('modpulse:healthcheck', String(now));
    redisConnected = true;
  } catch (err) {
    console.error('Redis connectivity check failed', err);
  }

  let activeHandover = null;
  let history: Awaited<ReturnType<typeof fetchHandoverHistory>> = [];
  let activity: Awaited<ReturnType<typeof fetchRecentActivity>> = [];
  let juryCases: Awaited<ReturnType<typeof fetchActiveCases>> = [];
  let resolvedCases: Awaited<ReturnType<typeof fetchResolvedCases>> = [];

  if (subredditId && redisConnected) {
    await ensureSeedJuryCases(subredditId, username);
    [activeHandover, history, juryCases, resolvedCases] = await Promise.all([
      fetchActiveHandover(subredditId),
      fetchHandoverHistory(subredditId, 5),
      fetchActiveCases(subredditId, 10),
      fetchResolvedCases(subredditId, 5),
    ]);
    activity = await fetchRecentActivity(subredditId, 12);
  }

  const seed = subredditId ? subredditId.length : 13;
  const communityHealth = computeCommunityHealth(seed + Math.floor(now / (1000 * 60 * 10)));

  const mapToDashboardCase = (juryCase: (typeof juryCases)[number]): DashboardJuryCase => {
    const votes = countVotes(juryCase.votes);
    const ageMinutes = (now - juryCase.createdAt) / (1000 * 60);
    const priority: DashboardJuryCase['priority'] =
      ageMinutes > 30 ? 'high' : ageMinutes > 12 ? 'medium' : 'low';

    const base: DashboardJuryCase = {
      id: juryCase.id,
      postId: juryCase.postId,
      createdAt: juryCase.createdAt,
      createdBy: juryCase.createdBy,
      reason: juryCase.reason,
      ruleCitation: juryCase.ruleCitation,
      contextNotes: juryCase.contextNotes,
      votes,
      finalVerdict: juryCase.finalVerdict,
      status: juryCase.status,
      priority,
      ai: buildAiOutput({
        reason: juryCase.reason,
        ruleCitation: juryCase.ruleCitation,
        contextNotes: juryCase.contextNotes,
        postId: juryCase.postId,
      }),
    };

    if (typeof juryCase.resolvedAt === 'number') {
      base.resolvedAt = juryCase.resolvedAt;
    }

    return base;
  };

  const pending: DashboardJuryCase[] = juryCases.map(mapToDashboardCase);
  const resolved: DashboardJuryCase[] = resolvedCases.map(mapToDashboardCase);

  const payload: DashboardPayload = {
    meta: {
      subredditId,
      username,
      now,
    },
    status: {
      redisConnected,
      liveModeration: true,
      jurySystemActive: true,
    },
    handover: {
      active: activeHandover,
      history,
    },
    activity,
    jury: {
      pending,
      resolved,
    },
    communityHealth,
  };

  return c.json(payload, 200);
});

api.post('/handover', async (c) => {
  const subredditId = requireSubredditId();
  const username = context.username ?? 'moderator';

  const input = await c.req.json<{
    activeSituations?: string;
    usersToWatch?: string;
    priorityPosts?: string;
    notes?: string;
  }>();

  const card = createHandoverCard({
    author: username,
    activeSituations: input.activeSituations ?? '',
    usersToWatch: input.usersToWatch ?? '',
    priorityPosts: input.priorityPosts ?? '',
    notes: input.notes ?? '',
  });

  await saveHandover(subredditId, card);

  return c.json({ ok: true }, 200);
});

api.post('/jury/case', async (c) => {
  const subredditId = requireSubredditId();
  const username = context.username ?? 'moderator';
  const now = Date.now();

  const input = await c.req.json<{
    postId?: string;
    reason?: string;
    ruleCitation?: string;
    contextNotes?: string;
    priority?: 'low' | 'medium' | 'high';
  }>();

  const postId = (input.postId ?? '').trim();
  if (!postId) {
    return c.json({ ok: false, error: 'postId is required.' }, 400);
  }

  console.log('[ModPulse][api] create jury case request', {
    subredditId,
    username,
    postId,
  });

  const juryCase = createJuryCase({
    subredditId,
    postId,
    createdBy: username,
    reason: (input.reason ?? '').trim() || 'Flagged for jury review.',
    ruleCitation: (input.ruleCitation ?? '').trim() || 'Unspecified',
    contextNotes: (input.contextNotes ?? '').trim(),
    createdAt: now,
  });

  // For hackathon/demo polish we persist priority as a hint inside contextNotes.
  // (We keep the core model stable; UI uses this only as a display cue.)
  const priority = clampPriority(input.priority);
  if (priority !== 'medium') {
    juryCase.contextNotes = `${juryCase.contextNotes}\n\n[Priority: ${priority}]`.trim();
  }

  await saveNewJuryCase(juryCase);

  console.log('[ModPulse][api] jury case created', {
    caseId: juryCase.id,
    subredditId: juryCase.subredditId,
    postId: juryCase.postId,
  });

  return c.json({ ok: true, id: juryCase.id }, 200);
});

api.post('/jury/vote', async (c) => {
  const subredditId = requireSubredditId();
  const username = context.username ?? 'moderator';

  const input = await c.req.json<{
    caseId: string;
    vote: JuryVoteValue;
  }>();

  console.log('[ModPulse][api] vote request', {
    subredditId,
    username,
    caseId: input.caseId,
    vote: input.vote,
  });

  const existingCase = await fetchJuryCase(input.caseId);
  if (!existingCase) {
    console.log('[ModPulse][api] vote rejected - case missing', { caseId: input.caseId });
    return c.json({ ok: false, error: 'Jury case not found.' }, 404);
  }

  if (existingCase.subredditId !== subredditId) {
    console.log('[ModPulse][api] vote rejected - subreddit mismatch', {
      caseId: input.caseId,
      caseSubredditId: existingCase.subredditId,
      requestSubredditId: subredditId,
    });
    return c.json({ ok: false, error: 'Case does not belong to this subreddit.' }, 400);
  }

  const { juryCase, duplicate, resolved } = await addVote({
    caseId: input.caseId,
    moderator: username,
    vote: input.vote,
  });

  console.log('[ModPulse][api] vote mutation completed', {
    caseId: juryCase.id,
    duplicate,
    resolved,
    status: juryCase.status,
    finalVerdict: juryCase.finalVerdict,
  });

  return c.json({ ok: true, duplicate, resolved }, 200);
});
