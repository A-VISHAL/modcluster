import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import {
  actionLabel,
  analyzeRuleSet,
  appendModerationEvent,
  appendRuleHistory,
  createDemoCorpus,
  createStarterRuleSet,
  evaluateRuleSet,
  getRuleSetFromYaml,
  getRuleSetYaml,
  loadRuleState,
  normalizeRuleSet,
  persistRuleState,
  summarizeDecision,
  trimModerationEvents,
  type ContentSample,
  type ModerationEvent,
  type RuleDefinition,
  type RuleSet,
  type RuleDecision,
  type FlaggedUser,
  updateRuleAnalytics,
  upsertFlaggedUser,
  createRuleTemplateCatalog,
} from '../core/rules';
import { sendToJuryReview } from '../core/moderation';
import { fetchRecentActivity, logActivity } from '../core/activity';
import { fetchActiveHandover } from '../core/handover';
import { generateInsights } from '../core/insights';
import { getCurrentModerator } from '../core/security';

async function createJuryCase(
  post: { id: string; author: string; title: string; body: string; createdAt: number },
  rule: { ruleName: string; severity: 'low' | 'medium' | 'high' | 'critical' },
  context: { subredditId: string; username: string; explanation: string; conditions: string[]; isTestMode: boolean }
) {
  return await sendToJuryReview({
    postId: post.id,
    subredditId: context.subredditId,
    createdBy: context.username,
    reason: context.explanation,
    ruleCitation: rule.ruleName,
    contextNotes: [
      `Rule: ${rule.ruleName}`,
      `Severity: ${rule.severity}`,
      ...context.conditions,
    ].join('\n'),
    author: post.author,
    title: post.title,
    body: post.body,
    severity: rule.severity,
    deadline: Date.now() + 24 * 60 * 60 * 1000,
    triggeredRule: rule.ruleName,
    triggeredAction: 'send_to_jury_review',
    createdAt: post.createdAt,
    testMode: context.isTestMode,
  });
}

export const rules = new Hono();

type RuleBody = {
  yaml?: string;
  ruleSet?: RuleSet;
  rules?: RuleDefinition[];
  confirmDangerous?: boolean;
  note?: string;
};

type TestRequest = {
  yaml?: string;
  ruleSet?: RuleSet;
  samples?: ContentSample[];
};

type DeployResponse = {
  ok: boolean;
  confirmationRequired?: boolean;
  warnings?: string[];
  analysis?: ReturnType<typeof analyzeRuleSet>;
  ruleSet?: RuleSet;
  yaml?: string;
  snapshot?: {
    version: number;
    updatedAt: number;
    updatedBy: string;
    note: string;
  };
};

const requireSubredditId = (): string => {
  if (!context.subredditId) {
    throw new Error('Missing subredditId in request context.');
  }

  return context.subredditId;
};

const requireModerator = (): string => getCurrentModerator();

const getRuleSetFromBody = (body: RuleBody, subredditId: string, updatedBy: string): RuleSet => {
  if (body.ruleSet) {
    return normalizeRuleSet(body.ruleSet, subredditId, updatedBy);
  }

  if (body.yaml) {
    return getRuleSetFromYaml(body.yaml, subredditId, updatedBy);
  }

  return createStarterRuleSet(subredditId, updatedBy);
};

const mapDecisionForClient = (decision: RuleDecision) => ({
  ...decision,
  topAction: actionLabel(decision.topAction),
  matchedRules: decision.matchedRules.map((match) => ({
    ...match,
    actions: match.actions.map((action) => actionLabel(action)),
  })),
});

const collectRedditItems = async (subredditId: string): Promise<ContentSample[]> => {
  const api = reddit as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  const methodSets = [
    ['getNewPosts', 'getHotPosts', 'getPosts'],
    ['getNewComments', 'getComments'],
    ['getModerationQueue', 'getModQueue', 'getModqueue'],
  ];

  const argsSets = [[subredditId], []];
  const samples: ContentSample[] = [];

  const toArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const maybeItems = (value as { items?: unknown }).items;
      if (Array.isArray(maybeItems)) return maybeItems;
      const maybeData = (value as { data?: unknown }).data;
      if (Array.isArray(maybeData)) return maybeData;
    }

    return [];
  };

  const normalize = (item: unknown, index: number, kind: 'post' | 'comment'): ContentSample | null => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const title = String(record.title ?? record.subject ?? record.linkTitle ?? '').trim();
    const body = String(record.body ?? record.selftext ?? record.content ?? record.text ?? '').trim();
    const author = String(record.authorName ?? record.author ?? record.username ?? 'unknown').trim();
    const id = String(record.id ?? record.name ?? record.postId ?? `${kind}-${index}`).trim();
    const domain = String(record.domain ?? record.urlDomain ?? (kind === 'comment' ? 'reddit.com' : 'self.post')).trim();
    const ageDays = typeof record.accountAgeDays === 'number'
      ? record.accountAgeDays
      : typeof record.authorAgeDays === 'number'
        ? record.authorAgeDays
        : null;
    const karma = typeof record.combinedKarma === 'number'
      ? record.combinedKarma
      : typeof record.karma === 'number'
        ? record.karma
        : null;

    return {
      id,
      kind,
      author,
      title,
      body,
      domain,
      subredditId,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      accountAgeDays: ageDays,
      combinedKarma: karma,
      postFrequencyPerHour: typeof record.postFrequencyPerHour === 'number' ? record.postFrequencyPerHour : null,
      commentFrequencyPerHour: typeof record.commentFrequencyPerHour === 'number' ? record.commentFrequencyPerHour : null,
      repeatedLinksCount: typeof record.repeatedLinksCount === 'number' ? record.repeatedLinksCount : null,
      repeatedDomainsCount: typeof record.repeatedDomainsCount === 'number' ? record.repeatedDomainsCount : null,
      suspiciousDomains: Array.isArray(record.suspiciousDomains) ? record.suspiciousDomains.map((value) => String(value)) : [],
      suspiciousKeywords: Array.isArray(record.suspiciousKeywords) ? record.suspiciousKeywords.map((value) => String(value)) : [],
      toxicityScore: typeof record.toxicityScore === 'number' ? record.toxicityScore : null,
      crossSubredditActivityCount: typeof record.crossSubredditActivityCount === 'number' ? record.crossSubredditActivityCount : null,
      rapidPostBurstCount: typeof record.rapidPostBurstCount === 'number' ? record.rapidPostBurstCount : null,
      banEvasionIndicators: Boolean(record.banEvasionIndicators),
      newAccountWaveCount: typeof record.newAccountWaveCount === 'number' ? record.newAccountWaveCount : null,
      metadata: record,
    };
  };

  for (const methodNames of methodSets) {
    for (const methodName of methodNames) {
      const method = api[methodName];
      if (typeof method !== 'function') continue;

      for (const args of argsSets) {
        try {
          const result = await method(...args);
          const items = toArray(result);
          if (!items.length) continue;

          const kind = methodName.toLowerCase().includes('comment') ? 'comment' : 'post';
          const mapped = items.map((item, index) => normalize(item, index, kind)).filter((value): value is ContentSample => value !== null);
          samples.push(...mapped);
        } catch (error) {
          console.warn('[ModPulse][rules] Live fetch method failed', {
            methodName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  if (!samples.length) {
    samples.push(...createDemoCorpus(subredditId));
  }

  return samples.slice(0, 12);
};

const logModerationEvent = async (
  subredditId: string,
  event: ModerationEvent,
  flaggedUsers?: FlaggedUser[]
) => {
  await appendModerationEvent(subredditId, event);
  await trimModerationEvents(subredditId, 80);

  if (flaggedUsers) {
    const state = await loadRuleState(subredditId);
    state.flaggedUsers = flaggedUsers;
    await persistRuleState(subredditId, state);
  }
};

rules.get('/dashboard', async () => {
  const subredditId = context.subredditId ?? null;
  const username = context.username ?? null;

  if (!subredditId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing subreddit context.' }), { status: 400 });
  }

  const [state, activeHandover, activity] = await Promise.all([
    loadRuleState(subredditId),
    fetchActiveHandover(subredditId),
    fetchRecentActivity(subredditId, 40),
  ]);

  const ruleSet = state.active ?? createStarterRuleSet(subredditId, username ?? 'system');
  const analysis = analyzeRuleSet(ruleSet);
  const templates = createRuleTemplateCatalog();
  const demoCorpus = createDemoCorpus(subredditId);
  const decisions = evaluateRuleSet(ruleSet, demoCorpus);
  const insights = generateInsights({
    now: Date.now(),
    communityHealth: {
      reportsToday: decisions.filter((decision) => decision.status !== 'allowed').length,
      toxicityAlerts: decisions.filter((decision) => decision.topAction === 'remove_post').length,
      queueBacklog: decisions.filter((decision) => decision.status === 'escalated').length,
      moderatorWorkload: Math.min(100, Math.round((state.analytics.queuePressure + decisions.length * 8 + activity.length) / 2)),
      burnoutRisk: state.analytics.queuePressure > 70 ? 'high' : state.analytics.queuePressure > 35 ? 'medium' : 'low',
      unresolvedReports: decisions.filter((decision) => decision.status !== 'allowed').length,
      activeJuryCases: decisions.filter((decision) => decision.topAction === 'send_to_jury_review').length,
      moderationActions24h: state.events.filter((event) => Date.now() - event.timestamp < 24 * 60 * 60 * 1000).length,
      removalsToday: state.events.filter((event) => event.action === 'remove_post').length,
      escalationFrequency: Math.min(100, analysis.warnings.length * 12),
      avgResponseMinutes: null,
      metricsSource: 'redis',
    },
    activity,
    pendingCases: [],
    resolvedCases: [],
  });

  return new Response(JSON.stringify({
    ok: true,
    meta: {
      subredditId,
      username,
      now: Date.now(),
    },
    ruleSet,
    yaml: getRuleSetYaml(ruleSet),
    templates,
    analysis,
    activeHandover,
    activity,
    history: state.history,
    analytics: state.analytics,
    flaggedUsers: state.flaggedUsers,
    events: state.events,
    livePreview: decisions.map((decision) => mapDecisionForClient(decision)),
    insights,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});

rules.get('/templates', async () => {
  return new Response(JSON.stringify({ ok: true, templates: createRuleTemplateCatalog() }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

rules.post('/validate', async (c) => {
  const subredditId = context.subredditId ?? null;
  const username = requireModerator();
  const body = await c.req.json<RuleBody>();

  if (!subredditId) {
    return c.json({ ok: false, error: 'Missing subreddit context.' }, 400);
  }

  const ruleSet = getRuleSetFromBody(body, subredditId, username);
  const analysis = analyzeRuleSet(ruleSet);
  const yaml = getRuleSetYaml(ruleSet);
  const summary = {
    enabled: ruleSet.rules.filter((rule) => rule.enabled).length,
    removals: ruleSet.rules.filter((rule) => rule.actions.includes('remove_post') || rule.actions.includes('temporary_ban')).length,
    warnings: analysis.warnings.length,
    confirmationRequired: analysis.confirmationRequired,
    overallRisk: analysis.overallRisk,
  };

  return c.json({ ok: true, ruleSet, analysis, yaml, summary }, 200);
});

rules.post('/test', async (c) => {
  const isTestMode = c.req.header('X-ModPulse-Test-Mode') === 'true';
  const subredditId = requireSubredditId();
  const username = requireModerator();
  const body = await c.req.json<TestRequest>();
  const ruleSet = body.ruleSet
    ? normalizeRuleSet(body.ruleSet, subredditId, username)
    : body.yaml
      ? getRuleSetFromYaml(body.yaml, subredditId, username)
      : (await loadRuleState(subredditId)).active ?? createStarterRuleSet(subredditId, username);

  const corpus = body.samples?.length ? body.samples : await collectRedditItems(subredditId);
  const decisions = evaluateRuleSet(ruleSet, corpus);
  const state = await loadRuleState(subredditId);
  const analysis = analyzeRuleSet(ruleSet);

  const hitFrequency: Record<string, number> = { ...state.analytics.ruleHitFrequency };
  const repeatedOffendersMap = new Map<string, { author: string; hits: number; lastSeen: number }>();
  const falsePositiveCandidates: string[] = [...state.analytics.falsePositiveCandidates];
  const flaggedUsers = [...state.flaggedUsers];

  const events: ModerationEvent[] = [];

  for (const decision of decisions) {
    if (decision.status === 'allowed') continue;

    for (const match of decision.matchedRules) {
      hitFrequency[match.ruleId] = (hitFrequency[match.ruleId] ?? 0) + 1;
      events.push({
        id: `${Date.now()}-${decision.sample.id}-${match.ruleId}`,
        subredditId,
        timestamp: Date.now(),
        type: 'hit',
        ruleId: match.ruleId,
        ruleName: match.ruleName,
        sampleId: decision.sample.id,
        author: decision.sample.author,
        action: decision.topAction,
        riskScore: decision.riskScore,
        details: summarizeDecision(decision),
      });
    }

    if (decision.status === 'escalated' && decision.riskScore < 100) {
      falsePositiveCandidates.push(`${decision.sample.author} • ${decision.sample.title.slice(0, 48)}`);
    }

    const offender = repeatedOffendersMap.get(decision.sample.author.toLowerCase()) ?? {
      author: decision.sample.author,
      hits: 0,
      lastSeen: decision.sample.createdAt,
    };
    offender.hits += 1;
    offender.lastSeen = Math.max(offender.lastSeen, decision.sample.createdAt);
    repeatedOffendersMap.set(decision.sample.author.toLowerCase(), offender);

    if (decision.topAction === 'remove_post' || decision.topAction === 'temporary_ban') {
      flaggedUsers.splice(0, flaggedUsers.length, ...upsertFlaggedUser(flaggedUsers, {
        author: decision.sample.author,
        reason: decision.conditions[0] ?? decision.explanation,
        riskScore: decision.riskScore,
        timestamp: decision.sample.createdAt,
      }));
    }

    for (const match of decision.matchedRules) {
      for (const action of match.actions) {
        if (action === 'send_to_jury_review') {
          const post = {
            id: decision.sample.id,
            author: decision.sample.author,
            title: decision.sample.title,
            body: decision.sample.body,
            createdAt: decision.sample.createdAt,
          };
          const rule = {
            ruleName: match.ruleName,
            severity: match.severity as 'low' | 'medium' | 'high' | 'critical',
          };
          const ctx = {
            subredditId,
            username,
            explanation: decision.explanation,
            conditions: decision.conditions,
            isTestMode,
          };
          const juryOutcome = await createJuryCase(post, rule, ctx);

          console.log('[ModPulse][rules] jury escalation executed', {
            postId: decision.sample.id,
            ruleName: match.ruleName,
            success: juryOutcome.success,
            caseId: juryOutcome.caseId,
          });
        }
      }
    }
  }

  const nextAnalytics = updateRuleAnalytics(state.analytics, {
    testRuns: state.analytics.testRuns + 1,
    lastUpdatedAt: Date.now(),
    queuePressure: Math.min(100, decisions.filter((decision) => decision.status !== 'allowed').length * 15 + analysis.warnings.length * 10),
    ruleHitFrequency: hitFrequency,
    falsePositiveCandidates: [...new Set(falsePositiveCandidates)].slice(0, 12),
    repeatedOffenders: [...repeatedOffendersMap.values()].sort((left, right) => right.hits - left.hits).slice(0, 12),
  });

  state.analytics = nextAnalytics;
  state.flaggedUsers = flaggedUsers;
  state.events = [...events, ...state.events].slice(0, 80);
  await persistRuleState(subredditId, state);
  for (const event of events.slice(0, 15)) {
    await appendModerationEvent(subredditId, event);
  }
  await trimModerationEvents(subredditId, 80);

  await logActivity({
    subredditId,
    moderator: username,
    action: 'Rule set tested',
    tone: 'soft',
    detail: `${decisions.filter((decision) => decision.status !== 'allowed').length} of ${decisions.length} items would escalate or remove.`,
  });

  return c.json({
    ok: true,
    ruleSet,
    analysis,
    corpus,
    decisions: decisions.map((decision) => mapDecisionForClient(decision)),
    analytics: nextAnalytics,
    flaggedUsers,
    events,
  }, 200);
});

rules.post('/deploy', async (c) => {
  const subredditId = requireSubredditId();
  const username = requireModerator();
  const body = await c.req.json<RuleBody>();
  const nextRuleSet = getRuleSetFromBody(body, subredditId, username);
  const analysis = analyzeRuleSet(nextRuleSet);

  if (analysis.confirmationRequired && body.confirmDangerous !== true) {
    return c.json<DeployResponse>({
      ok: false,
      confirmationRequired: true,
      warnings: analysis.warnings,
      analysis,
      ruleSet: nextRuleSet,
      yaml: getRuleSetYaml(nextRuleSet),
    }, 200);
  }

  const currentState = await loadRuleState(subredditId);
  const snapshot = currentState.active
    ? {
        version: currentState.active.version,
        updatedAt: currentState.active.updatedAt,
        updatedBy: currentState.active.updatedBy,
        note: body.note ?? 'Auto-saved snapshot before deploy',
        yaml: getRuleSetYaml(currentState.active),
      }
    : {
        version: 1,
        updatedAt: Date.now(),
        updatedBy: username,
        note: body.note ?? 'Initial deploy snapshot',
        yaml: getRuleSetYaml(createStarterRuleSet(subredditId, username)),
      };

  await appendRuleHistory(subredditId, snapshot);

  const deployedRuleSet: RuleSet = {
    ...nextRuleSet,
    version: (currentState.active?.version ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: username,
  };

  const nextAnalytics = updateRuleAnalytics(currentState.analytics, {
    deployCount: currentState.analytics.deployCount + 1,
    lastDeployAt: Date.now(),
    lastUpdatedAt: Date.now(),
  });

  currentState.active = deployedRuleSet;
  currentState.analytics = nextAnalytics;
  await persistRuleState(subredditId, currentState);

  await logActivity({
    subredditId,
    moderator: username,
    action: 'Rule set deployed',
    tone: analysis.overallRisk === 'high' ? 'warn' : 'good',
    detail: `${deployedRuleSet.rules.length} rules active. ${analysis.warnings.length} warnings.`,
  });

  const event: ModerationEvent = {
    id: `${Date.now()}-deploy`,
    subredditId,
    timestamp: Date.now(),
    type: 'deploy',
    action: 'deploy',
    details: body.note ?? 'Rules deployed',
  };
  await logModerationEvent(subredditId, event);

  return c.json<DeployResponse>({
    ok: true,
    analysis,
    ruleSet: deployedRuleSet,
    yaml: getRuleSetYaml(deployedRuleSet),
    snapshot,
  }, 200);
});

rules.post('/rollback', async (c) => {
  const subredditId = requireSubredditId();
  const username = requireModerator();
  const body = await c.req.json<{ version?: number; note?: string }>();
  const state = await loadRuleState(subredditId);

  if (!state.history.length) {
    return c.json({ ok: false, error: 'No rule snapshots available for rollback.' }, 400);
  }

  const snapshot = body.version
    ? state.history.find((entry) => entry.version === body.version)
    : state.history[0];

  if (!snapshot) {
    return c.json({ ok: false, error: 'Requested snapshot not found.' }, 404);
  }

  const restored = getRuleSetFromYaml(snapshot.yaml, subredditId, username);
  restored.version = snapshot.version;
  restored.updatedAt = Date.now();
  restored.updatedBy = username;

  state.active = restored;
  state.analytics = updateRuleAnalytics(state.analytics, {
    rollbackCount: state.analytics.rollbackCount + 1,
    lastRollbackAt: Date.now(),
    lastUpdatedAt: Date.now(),
  });

  await persistRuleState(subredditId, state);
  await logActivity({
    subredditId,
    moderator: username,
    action: 'Rule set rolled back',
    tone: 'warn',
    detail: `Restored version ${snapshot.version}.`,
  });

  await logModerationEvent(subredditId, {
    id: `${Date.now()}-rollback`,
    subredditId,
    timestamp: Date.now(),
    type: 'rollback',
    action: 'rollback',
    details: body.note ?? `Restored version ${snapshot.version}`,
  });

  return c.json({ ok: true, ruleSet: restored, yaml: getRuleSetYaml(restored), snapshot }, 200);
});

rules.post('/seed', async (c) => {
  const subredditId = requireSubredditId();
  const username = requireModerator();
  const state = await loadRuleState(subredditId);

  if (!state.active) {
    state.active = createStarterRuleSet(subredditId, username);
    await persistRuleState(subredditId, state);
  }

  return c.json({ ok: true, ruleSet: state.active, templates: createRuleTemplateCatalog() }, 200);
});
