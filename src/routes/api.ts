import { Hono } from 'hono';
import { context, redis as webRedis } from '@devvit/web/server';
import {
  createHandoverCard,
  fetchActiveHandover,
  fetchHandoverHistory,
  saveHandover,
} from '../core/handover';
import { fetchRecentActivity, logActivity } from '../core/activity';
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
import {
  getCurrentSubreddit,
  getCurrentModerator,
  validateSubredditScope,
  logSecurityEvent,
  getAuditContext,
} from '../core/security';
import { executeImmediateAction } from '../core/moderation';

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
  const username = getCurrentModerator();
  const auditContext = getAuditContext();

  const input = await c.req.json<{
    activeSituations?: string;
    usersToWatch?: string;
    priorityPosts?: string;
    notes?: string;
  }>();

  console.log('[ModPulse][security] Handover creation initiated', {
    subredditId,
    username,
    timestamp: auditContext.timestamp,
  });

  const card = createHandoverCard({
    author: username,
    activeSituations: input.activeSituations ?? '',
    usersToWatch: input.usersToWatch ?? '',
    priorityPosts: input.priorityPosts ?? '',
    notes: input.notes ?? '',
  });

  await saveHandover(subredditId, card);

  // Log the handover creation for auditability
  await logActivity({
    subredditId,
    action: 'Shift handover created',
    moderator: username,
    tone: 'good',
    detail: `Handover recorded for shift transition • Situations: ${card.activeSituations?.substring(0, 40) || 'none'}...`,
    timestamp: card.timestamp,
  });

  console.log('[ModPulse][security] Handover successfully persisted', {
    subredditId,
    author: username,
    timestamp: card.timestamp,
  });

  return c.json({ ok: true }, 200);
});

api.post('/jury/case', async (c) => {
  const subredditId = requireSubredditId();
  const username = getCurrentModerator();
  const auditContext = getAuditContext();
  const now = auditContext.timestamp;

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

  console.log('[ModPulse][security] create jury case request', {
    subredditId,
    username,
    postId,
    timestamp: now,
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

  console.log('[ModPulse][security] jury case created', {
    caseId: juryCase.id,
    subredditId: juryCase.subredditId,
    postId: juryCase.postId,
    createdBy: username,
    timestamp: now,
  });

  return c.json({ ok: true, id: juryCase.id }, 200);
});

api.post('/jury/vote', async (c) => {
  const subredditId = requireSubredditId();
  const username = getCurrentModerator();
  const auditContext = getAuditContext();

  const input = await c.req.json<{
    caseId: string;
    vote: JuryVoteValue;
  }>();

  console.log('[ModPulse][security] vote request initiated', {
    subredditId,
    username,
    caseId: input.caseId,
    vote: input.vote,
    timestamp: auditContext.timestamp,
  });

  // Validate case exists
  const existingCase = await fetchJuryCase(input.caseId);
  if (!existingCase) {
    console.warn('[ModPulse][security] vote rejected - case missing', {
      caseId: input.caseId,
      subredditId,
      moderator: username,
    });
    return c.json({ ok: false, error: 'Jury case not found.' }, 404);
  }

  // CRITICAL SAFETY CHECK: Verify case belongs to current subreddit
  const scopeCheck = validateSubredditScope(existingCase.subredditId, 'Jury case');
  if (!scopeCheck.valid) {
    logSecurityEvent({
      type: 'scope-mismatch',
      moderator: username,
      subredditId: subredditId,
      resourceId: input.caseId,
      resourceType: 'jury-case',
      reason: 'Case subreddit ID does not match current subreddit context',
      details: {
        caseSubredditId: existingCase.subredditId,
        currentSubredditId: subredditId,
        voteAttempted: input.vote,
      },
    });

    console.error('[ModPulse][security] CROSS-SUBREDDIT VOTE BLOCKED', {
      caseId: input.caseId,
      caseSubredditId: existingCase.subredditId,
      requestSubredditId: subredditId,
      moderator: username,
      vote: input.vote,
      timestamp: auditContext.timestamp,
    });

    return c.json(
      {
        ok: false,
        error:
          'Security validation failed: Case belongs to a different subreddit. ' +
          'Cross-subreddit moderation actions are not permitted.',
      },
      403
    );
  }

  // Record vote with full auditability
  const { juryCase, duplicate, resolved } = await addVote({
    caseId: input.caseId,
    moderator: username,
    vote: input.vote,
  });

  // Log the vote for transparency
  await logActivity({
    subredditId,
    action: `Jury vote: ${input.vote.toUpperCase()}`,
    moderator: username,
    tone: input.vote === 'abstain' ? 'soft' : input.vote === 'remove' ? 'bad' : 'good',
    detail: `Post: ${existingCase.postId} • Case: ${input.caseId.substring(0, 20)}...`,
    timestamp: auditContext.timestamp,
  });

  console.log('[ModPulse][security] vote mutation completed', {
    caseId: juryCase.id,
    caseSubredditId: juryCase.subredditId,
    vote: input.vote,
    moderator: username,
    duplicate,
    resolved,
    status: juryCase.status,
    finalVerdict: juryCase.finalVerdict,
    timestamp: auditContext.timestamp,
  });

  return c.json({ ok: true, duplicate, resolved }, 200);
});

/**
 * IMMEDIATE ACTION MODE: Emergency moderation
 *
 * Allows a single moderator to take emergency moderation action without jury review.
 * Used for critical safety situations:
 * - Doxxing, violent threats
 * - Explicit/illegal content
 * - Active spam/malware attacks
 * - Ban evasion
 *
 * ACTION TYPES:
 * - "remove": Delete the post immediately
 * - "lock": Lock post to prevent new comments
 * - "both": Remove and lock
 *
 * Security: Full subreddit-scoped validation + activity logging
 */
api.post('/moderation/immediate', async (c) => {
  const subredditId = requireSubredditId();
  const username = getCurrentModerator();
  const auditContext = getAuditContext();

  const input = await c.req.json<{
    postId?: string;
    actionType?: 'remove' | 'lock' | 'both';
    reason?: string;
    lockComments?: boolean;
  }>();

  const postId = (input.postId ?? '').trim();
  const actionType = input.actionType ?? 'remove';
  const reason = (input.reason ?? '').trim() || 'Emergency moderation action';
  const lockComments = input.lockComments !== false;

  // Validation
  if (!postId) {
    return c.json({ ok: false, error: 'postId is required.' }, 400);
  }

  if (!['remove', 'lock', 'both'].includes(actionType)) {
    return c.json(
      { ok: false, error: "actionType must be 'remove', 'lock', or 'both'." },
      400
    );
  }

  console.log('[ModPulse][security] immediate action initiated', {
    subredditId,
    moderator: username,
    postId,
    actionType,
    reason,
    timestamp: auditContext.timestamp,
  });

  try {
    // Execute the immediate action
    const outcome = await executeImmediateAction({
      postId,
      subredditId,
      actionType,
      reason,
      lockComments,
      moderator: username,
    });

    console.log('[ModPulse][security] immediate action completed', {
      subredditId,
      moderator: username,
      postId,
      actionType,
      success: outcome.success,
      timestamp: auditContext.timestamp,
    });

    if (!outcome.success) {
      return c.json(
        {
          ok: false,
          error: outcome.message,
          details: outcome.details,
        },
        400
      );
    }

    return c.json(
      {
        ok: true,
        message: outcome.message,
        actionType: outcome.actionType,
        details: outcome.details,
      },
      200
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[ModPulse][security] immediate action failed', {
      subredditId,
      moderator: username,
      postId,
      actionType,
      error: errorMessage,
      timestamp: auditContext.timestamp,
    });

    return c.json(
      {
        ok: false,
        error: `Immediate action failed: ${errorMessage}`,
      },
      500
    );
  }
});
