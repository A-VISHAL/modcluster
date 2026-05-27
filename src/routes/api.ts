import { Hono } from 'hono';
import { context, reddit, redis as webRedis } from '@devvit/web/server';
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
  type JuryCase,
  type JuryVoteValue,
} from '../core/jury';
import {
  getCurrentModerator,
  validateSubredditScope,
  logSecurityEvent,
  getAuditContext,
} from '../core/security';
import { executeImmediateAction } from '../core/moderation';
import { generateInsights } from '../core/insights';
import {
  flagPost,
  unflagPost,
  getFlaggedPosts,
  getFlagStats,
  type FlaggedPost,
} from '../core/flags';

export const api = new Hono();

/**
 * API routes used by the ModCluster custom post webview.
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
  votedModerators: string[]; // List of mods who voted
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
  flags: {
    posts: FlaggedPost[];
    stats: { total: number; high: number; medium: number; low: number };
  };
  communityHealth: {
    reportsToday: number;
    toxicityAlerts: number;
    queueBacklog: number;
    moderatorWorkload: number;
    burnoutRisk: 'low' | 'medium' | 'high';
    unresolvedReports: number;
    activeJuryCases: number;
    moderationActions24h: number;
    removalsToday: number;
    escalationFrequency: number;
    avgResponseMinutes: number | null;
    metricsSource: 'redis' | 'reddit';
  };
  insights: {
    headline: string;
    details: string[];
  };
};

const requireSubredditId = (): string => {
  if (!context.subredditId) {
    // In practice this should always exist in a subreddit-scoped webview.
    throw new Error('Missing subredditId in request context.');
  }
  return context.subredditId;
};

const DEMO_CASE_PATTERNS = ['t3_demo_case_', 'seed-'];

const isDemoText = (value: string | null | undefined): boolean => {
  const normalized = (value ?? '').toLowerCase();
  return (
    normalized.includes('demo_case') ||
    normalized.includes('seed-') ||
    normalized.includes('possible brigading / coordinated voting pattern detected') ||
    normalized.includes('clustered reports') ||
    normalized.includes('t3_prev_')
  );
};

const isDemoCase = (juryCase: JuryCase): boolean => {
  const id = juryCase.id.toLowerCase();
  const postId = juryCase.postId.toLowerCase();

  if (DEMO_CASE_PATTERNS.some((pattern) => id.includes(pattern) || postId.includes(pattern))) {
    return true;
  }

  return (
    isDemoText(juryCase.reason) ||
    isDemoText(juryCase.contextNotes) ||
    isDemoText(juryCase.ruleCitation)
  );
};

const isDemoActivity = (event: Awaited<ReturnType<typeof fetchRecentActivity>>[number]): boolean => {
  return isDemoText(event.action) || isDemoText(event.detail);
};

const cleanupLegacyDemoQueueEntries = async (subredditId: string): Promise<void> => {
  const legacyIds = [
    `seed-${subredditId}-1`,
    `seed-${subredditId}-2`,
    `seed-${subredditId}-3`,
    't3_demo_case_1',
    't3_demo_case_2',
    't3_demo_case_3',
  ];

  try {
    await Promise.all([
      webRedis.zRem(`jury:${subredditId}:active`, legacyIds),
      webRedis.zRem(`jury:${subredditId}:history`, legacyIds),
    ]);
  } catch (error) {
    console.warn('[ModPulse][api] Demo queue cleanup skipped', {
      subredditId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const callRedditCount = async (
  methodNames: string[],
  argSets: unknown[][]
): Promise<number | undefined> => {
  const api = reddit as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  for (const methodName of methodNames) {
    const method = api[methodName];
    if (typeof method !== 'function') continue;

    for (const args of argSets) {
      try {
        const output = await method(...args);

        if (Array.isArray(output)) {
          return output.length;
        }

        if (output && typeof output === 'object') {
          const maybeCount = (output as { count?: unknown }).count;
          if (typeof maybeCount === 'number') {
            return maybeCount;
          }

          const maybeItems = (output as { items?: unknown }).items;
          if (Array.isArray(maybeItems)) {
            return maybeItems.length;
          }
        }
      } catch (error) {
        console.warn('[ModPulse][api] Reddit metrics method failed', {
          methodName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return undefined;
};

const fetchRedditOperationalSignals = async (subredditId: string | null) => {
  if (!subredditId) {
    return {
      queueBacklog: undefined,
      reportedContent: undefined,
      removedToday: undefined,
    };
  }

  const argSets = [[subredditId], []];

  const [queueBacklog, reportedContent, removedToday] = await Promise.all([
    callRedditCount(['getModerationQueue', 'getModQueue', 'getModqueue'], argSets),
    callRedditCount(['getReportedContent', 'getReports', 'getModReports'], argSets),
    callRedditCount(['getRemovedPosts', 'getRemovedContent'], argSets),
  ]);

  return {
    queueBacklog,
    reportedContent,
    removedToday,
  };
};

const computeCommunityHealth = async (input: {
  subredditId: string | null;
  now: number;
  pendingCases: JuryCase[];
  resolvedCases: JuryCase[];
  activity: Awaited<ReturnType<typeof fetchRecentActivity>>;
}): Promise<DashboardPayload['communityHealth']> => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const windowStart = input.now - DAY_MS;
  const activity24h = input.activity.filter((event) => event.timestamp >= windowStart);

  const reportSignals = activity24h.filter((event) => {
    const action = event.action.toLowerCase();
    return (
      action.includes('jury case opened') ||
      action.includes('case escalated') ||
      action.includes('spam cluster flagged') ||
      action.includes('toxicity spike detected')
    );
  });

  const toxicitySignals = activity24h.filter((event) => {
    const action = event.action.toLowerCase();
    return (
      action.includes('toxicity') ||
      action.includes('spam cluster') ||
      action.includes('case escalated') ||
      action.includes('removal executed') ||
      action.includes('post removed per jury verdict') ||
      action.includes('emergency action: remove') ||
      action.includes('moderator voted remove')
    );
  });

  const removalsToday = activity24h.filter((event) => {
    const action = event.action.toLowerCase();
    return (
      action.includes('remove') ||
      action.includes('removal') ||
      action.includes('post removed per jury verdict')
    );
  }).length;

  const escalationEvents = activity24h.filter((event) => {
    const action = event.action.toLowerCase();
    return (
      action.includes('case escalated') ||
      action.includes('spam cluster flagged') ||
      action.includes('toxicity spike detected') ||
      action.includes('emergency action')
    );
  }).length;

  const resolvedLast24h = input.resolvedCases.filter((juryCase) => {
    return typeof juryCase.resolvedAt === 'number' && juryCase.resolvedAt >= windowStart;
  }).length;

  const avgResponseMinutes = (() => {
    const allCases = [...input.pendingCases, ...input.resolvedCases];
    const responseDurations = allCases
      .map((juryCase) => {
        if (!juryCase.votes.length) return null;
        const firstVoteTs = Math.min(...juryCase.votes.map((vote) => vote.timestamp));
        return Math.max(0, Math.round((firstVoteTs - juryCase.createdAt) / (1000 * 60)));
      })
      .filter((duration): duration is number => duration !== null);

    if (!responseDurations.length) return null;
    const total = responseDurations.reduce((sum, duration) => sum + duration, 0);
    return Math.round(total / responseDurations.length);
  })();

  const redisQueueBacklog = input.pendingCases.length + Math.max(0, reportSignals.length - resolvedLast24h);
  const redditSignals = await fetchRedditOperationalSignals(input.subredditId);

  const queueBacklog = redditSignals.queueBacklog ?? redisQueueBacklog;
  const reportsToday = redditSignals.reportedContent ?? reportSignals.length;
  const unresolvedReports = Math.max(0, reportsToday - resolvedLast24h);
  const moderationActions24h = activity24h.length;
  const escalationFrequency =
    moderationActions24h > 0 ? Math.round((escalationEvents / moderationActions24h) * 100) : 0;

  const workloadScore =
    queueBacklog * 4 +
    input.pendingCases.length * 7 +
    Math.min(35, moderationActions24h) +
    escalationEvents * 8;
  const moderatorWorkload = Math.min(100, Math.round(workloadScore));

  const burnoutScore =
    moderatorWorkload +
    Math.min(25, unresolvedReports * 3) +
    Math.round(escalationFrequency * 0.35);
  const burnoutRisk: DashboardPayload['communityHealth']['burnoutRisk'] =
    burnoutScore >= 85 ? 'high' : burnoutScore >= 45 ? 'medium' : 'low';

  return {
    reportsToday,
    toxicityAlerts: toxicitySignals.length,
    queueBacklog,
    moderatorWorkload,
    burnoutRisk,
    unresolvedReports,
    activeJuryCases: input.pendingCases.length,
    moderationActions24h,
    removalsToday: redditSignals.removedToday ?? removalsToday,
    escalationFrequency,
    avgResponseMinutes,
    metricsSource:
      redditSignals.queueBacklog !== undefined ||
      redditSignals.reportedContent !== undefined ||
      redditSignals.removedToday !== undefined
        ? 'reddit'
        : 'redis',
  };
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
  similarCases: string[];
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

  return {
    summary:
      `Signals suggest: ${category}. ` +
      `Primary concern: ${input.reason || 'unspecified'}. ` +
      `Context: ${input.contextNotes || 'no additional notes'}.`,
    category,
    similarCases: input.similarCases,
    suggestedAction,
    confidence,
  };
};

api.get('/dashboard', async (c) => {
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
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
  let activityForMetrics: Awaited<ReturnType<typeof fetchRecentActivity>> = [];
  let juryCases: JuryCase[] = [];
  let resolvedCases: JuryCase[] = [];
  let flagsRaw: FlaggedPost[] = [];
  let flagStatsRaw = { total: 0, high: 0, medium: 0, low: 0 };

  if (subredditId && redisConnected) {
    await cleanupLegacyDemoQueueEntries(subredditId);

    const [activeHandoverRaw, historyRaw, juryCasesRaw, resolvedCasesRaw, activityRaw, flagsRawFetched, flagStatsRawFetched] = await Promise.all([
      fetchActiveHandover(subredditId, isTestMode),
      fetchHandoverHistory(subredditId, 20, isTestMode),
      fetchActiveCases(subredditId, 20, isTestMode),
      fetchResolvedCases(subredditId, 20, isTestMode),
      fetchRecentActivity(subredditId, 80, isTestMode),
      getFlaggedPosts(subredditId, isTestMode),
      getFlagStats(subredditId, isTestMode),
    ]);

    activeHandover = activeHandoverRaw;
    history = historyRaw;
    juryCases = juryCasesRaw.filter((juryCase) => !isDemoCase(juryCase));
    resolvedCases = resolvedCasesRaw.filter((juryCase) => !isDemoCase(juryCase));
    activityForMetrics = activityRaw.filter((event) => !isDemoActivity(event));
    activity = activityForMetrics.slice(0, 12);
    flagsRaw = flagsRawFetched;
    flagStatsRaw = flagStatsRawFetched;
  }

  const communityHealth = await computeCommunityHealth({
    subredditId,
    now,
    pendingCases: juryCases,
    resolvedCases,
    activity: activityForMetrics,
  });

  const insights = generateInsights({
    now,
    communityHealth,
    activity: activityForMetrics,
    pendingCases: juryCases,
    resolvedCases,
  });

  const renderUniverse = [...resolvedCases, ...juryCases];

  const mapToDashboardCase = (juryCase: JuryCase): DashboardJuryCase => {
    const votes = countVotes(juryCase.votes);
    const ageMinutes = (now - juryCase.createdAt) / (1000 * 60);
    const priority: DashboardJuryCase['priority'] =
      juryCase.status === 'resolved'
        ? 'low'
        : ageMinutes > 30
          ? 'high'
          : ageMinutes > 12
            ? 'medium'
            : 'low';

    const similarCases = renderUniverse
      .filter((candidate) => candidate.id !== juryCase.id)
      .slice(0, 3)
      .map((candidate) => {
        const verdict = candidate.finalVerdict ? candidate.finalVerdict.toUpperCase() : 'PENDING';
        return `Case: ${candidate.postId} • Verdict: ${verdict}`;
      });

    const base: DashboardJuryCase = {
      id: juryCase.id,
      postId: juryCase.postId,
      createdAt: juryCase.createdAt,
      createdBy: juryCase.createdBy,
      reason: juryCase.reason,
      ruleCitation: juryCase.ruleCitation,
      contextNotes: juryCase.contextNotes,
      votes,
      votedModerators: juryCase.votes.map(v => v.moderator),
      finalVerdict: juryCase.finalVerdict,
      status: juryCase.status,
      priority,
      ai: buildAiOutput({
        reason: juryCase.reason,
        ruleCitation: juryCase.ruleCitation,
        contextNotes: juryCase.contextNotes,
        postId: juryCase.postId,
        similarCases: similarCases.length ? similarCases : ['No comparable historical cases yet.'],
      }),
    };

    if (typeof juryCase.resolvedAt === 'number') {
      base.resolvedAt = juryCase.resolvedAt;
    }

    return base;
  };

  const pending: DashboardJuryCase[] = juryCases.slice(0, 10).map(mapToDashboardCase);
  const resolved: DashboardJuryCase[] = resolvedCases.slice(0, 5).map(mapToDashboardCase);

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
    flags: {
      posts: flagsRaw,
      stats: flagStatsRaw,
    },
    communityHealth,
    insights,
  };

  return c.json(payload, 200);
});

api.post('/handover', async (c) => {
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
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

  await saveHandover(subredditId, card, isTestMode);

  // Log the handover creation for auditability
  await logActivity({
    subredditId,
    action: 'Shift handover created',
    moderator: username,
    tone: 'good',
    detail: `Handover recorded for shift transition • Situations: ${card.activeSituations?.substring(0, 40) || 'none'}...`,
    timestamp: card.timestamp,
    testMode: isTestMode,
  });

  console.log('[ModPulse][security] Handover successfully persisted', {
    subredditId,
    author: username,
    timestamp: card.timestamp,
  });

  return c.json({ ok: true }, 200);
});

api.post('/jury/case', async (c) => {
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
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

  await saveNewJuryCase(juryCase, isTestMode);

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
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
  const subredditId = requireSubredditId();
  const username = getCurrentModerator();
  const auditContext = getAuditContext();

  const input = await c.req.json<{
    caseId: string;
    vote: JuryVoteValue;
    devMode?: boolean;
    simulatedModerator?: string;
  }>();

  // Check if dev mode is being requested
  const isDevModeRequested = input.devMode === true || isTestMode;
  const isDevelopmentEnvironment = process.env.NODE_ENV !== 'production';

  let effectiveModeratorName = username;

  // Dev mode handling: only allow in dev environments, use simulated moderator
  if (isDevModeRequested) {
    if (!isDevelopmentEnvironment) {
      console.warn('[ModPulse][security] DEV MODE REJECTED - Production environment', {
        subredditId,
        attemptedBy: username,
      });
      return c.json(
        { ok: false, error: 'Developer mode is not available in production.' },
        403
      );
    }

    if (!input.simulatedModerator) {
      return c.json(
        { ok: false, error: 'simulatedModerator is required when devMode is enabled.' },
        400
      );
    }

    effectiveModeratorName = input.simulatedModerator;
    console.log('[ModPulse][dev] DEV MODE VOTE using simulated moderator', {
      subredditId,
      realModerator: username,
      simulatedModerator: effectiveModeratorName,
      caseId: input.caseId,
      vote: input.vote,
    });
  }

  console.log('[ModPulse][security] vote request initiated', {
    subredditId,
    moderator: effectiveModeratorName,
    caseId: input.caseId,
    vote: input.vote,
    devMode: isDevModeRequested,
    timestamp: auditContext.timestamp,
  });

  // Validate case exists
  const existingCase = await fetchJuryCase(input.caseId, isTestMode);
  if (!existingCase) {
    console.warn('[ModPulse][security] vote rejected - case missing', {
      caseId: input.caseId,
      subredditId,
      moderator: effectiveModeratorName,
    });
    return c.json({ ok: false, error: 'Jury case not found.' }, 404);
  }

  // CRITICAL SAFETY CHECK: Verify case belongs to current subreddit
  const scopeCheck = validateSubredditScope(existingCase.subredditId, 'Jury case');
  if (!scopeCheck.valid) {
    logSecurityEvent({
      type: 'scope-mismatch',
      moderator: effectiveModeratorName,
      subredditId: subredditId,
      resourceId: input.caseId,
      resourceType: 'jury-case',
      reason: 'Case subreddit ID does not match current subreddit context',
      details: {
        caseSubredditId: existingCase.subredditId,
        currentSubredditId: subredditId,
        voteAttempted: input.vote,
        devMode: isDevModeRequested,
      },
    });

    console.error('[ModPulse][security] CROSS-SUBREDDIT VOTE BLOCKED', {
      caseId: input.caseId,
      caseSubredditId: existingCase.subredditId,
      requestSubredditId: subredditId,
      moderator: effectiveModeratorName,
      vote: input.vote,
      devMode: isDevModeRequested,
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
  // In dev mode, allow duplicate votes by passing devMode flag
  // IMPORTANT: Always pass the real moderator for execution context
  const { juryCase, duplicate, resolved } = await addVote({
    caseId: input.caseId,
    moderator: effectiveModeratorName,  // For display (could be simulated in dev mode)
    vote: input.vote,
    devMode: isDevModeRequested,
    realModerator: username,  // For actual Reddit execution (always real)
  });

  // Log the vote for transparency
  const voteAction = isDevModeRequested
    ? `Jury vote: ${input.vote.toUpperCase()} [DEV MODE - ${effectiveModeratorName}]`
    : `Jury vote: ${input.vote.toUpperCase()}`;

  await logActivity({
    subredditId,
    action: voteAction,
    moderator: effectiveModeratorName,
    tone: input.vote === 'abstain' ? 'soft' : input.vote === 'remove' ? 'bad' : 'good',
    detail: `Post: ${existingCase.postId} • Case: ${input.caseId.substring(0, 20)}...${isDevModeRequested ? ' [DEV]' : ''}`,
    timestamp: auditContext.timestamp,
  });

  console.log('[ModPulse][security] vote mutation completed', {
    caseId: juryCase.id,
    caseSubredditId: juryCase.subredditId,
    vote: input.vote,
    moderator: effectiveModeratorName,
    duplicate,
    resolved,
    devMode: isDevModeRequested,
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
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
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
      testMode: isTestMode,
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

/**
 * FLAG A POST
 * Allows moderators to mark posts for review without jury deliberation
 */
api.post('/flags/flag', async (c) => {
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
  const subredditId = requireSubredditId();
  const username = getCurrentModerator();
  const auditContext = getAuditContext();

  const input = await c.req.json<{
    postId: string;
    reason: string;
    priority?: 'low' | 'medium' | 'high';
  }>();

  if (!input.postId || !input.reason) {
    return c.json({ ok: false, error: 'Missing postId or reason' }, 400);
  }

  try {
    const flag = await flagPost(
      subredditId,
      input.postId,
      input.reason,
      username,
      input.priority ?? 'medium',
      isTestMode
    );

    await logActivity({
      subredditId,
      action: 'Post flagged for review',
      moderator: username,
      tone: 'warn',
      detail: `Post: ${input.postId} • Reason: ${input.reason} • Priority: ${input.priority ?? 'medium'}`,
      timestamp: auditContext.timestamp,
      testMode: isTestMode,
    });

    console.log('[ModPulse][flags] post flagged', {
      subredditId,
      postId: input.postId,
      reason: input.reason,
      priority: input.priority,
      moderator: username,
      timestamp: auditContext.timestamp,
    });

    return c.json({ ok: true, flag }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[ModPulse][flags] flag failed', {
      subredditId,
      postId: input.postId,
      moderator: username,
      error: errorMessage,
      timestamp: auditContext.timestamp,
    });

    return c.json(
      {
        ok: false,
        error: `Failed to flag post: ${errorMessage}`,
      },
      500
    );
  }
});

/**
 * UNFLAG A POST
 * Allows moderators to remove flags from posts
 */
api.post('/flags/unflag', async (c) => {
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
  const subredditId = requireSubredditId();
  const username = getCurrentModerator();
  const auditContext = getAuditContext();

  const input = await c.req.json<{
    postId: string;
  }>();

  if (!input.postId) {
    return c.json({ ok: false, error: 'Missing postId' }, 400);
  }

  try {
    await unflagPost(subredditId, input.postId, isTestMode);

    await logActivity({
      subredditId,
      action: 'Post flag removed',
      moderator: username,
      tone: 'good',
      detail: `Post: ${input.postId}`,
      timestamp: auditContext.timestamp,
      testMode: isTestMode,
    });

    console.log('[ModPulse][flags] post unflagged', {
      subredditId,
      postId: input.postId,
      moderator: username,
      timestamp: auditContext.timestamp,
    });

    return c.json({ ok: true }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[ModPulse][flags] unflag failed', {
      subredditId,
      postId: input.postId,
      moderator: username,
      error: errorMessage,
      timestamp: auditContext.timestamp,
    });

    return c.json(
      {
        ok: false,
        error: `Failed to unflag post: ${errorMessage}`,
      },
      500
    );
  }
});
