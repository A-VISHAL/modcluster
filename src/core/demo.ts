import { redis } from '@devvit/redis';
import { activityKey, logActivity } from './activity';
import { flagPost, getFlaggedPosts } from './flags';
import {
  appendModerationEvent,
  appendRuleHistory,
  createDemoCorpus,
  createRuleId,
  getRuleSetYaml,
  loadRuleState,
  persistRuleState,
  updateRuleAnalytics,
  upsertFlaggedUser,
  type ModerationEvent,
  type RuleDefinition,
  type RuleSet,
} from './rules';
import {
  createAndSaveJuryCase,
  createJuryCase,
  juryCaseKey,
  juryHistoryKey,
  juryLegacyActiveKey,
  juryQueueKey,
  juryVerdictKey,
  type JuryCase,
  type JurySeverity,
} from './jury';

const DEMO_SEED_VERSION = 'v1';

const demoSeedKey = (subredditId: string, testMode?: boolean) =>
  `${testMode ? 'test:' : ''}demo:${subredditId}:${DEMO_SEED_VERSION}`;

const buildDemoRuleSet = (subredditId: string, updatedBy: string): RuleSet => {
  const now = Date.now();

  const rules: RuleDefinition[] = [
    {
      id: createRuleId('self-promo-abuse copy'),
      name: 'self-promo-abuse copy',
      description: 'Catch repeated promo language and low-trust self-promotion.',
      enabled: true,
      severity: 'high',
      conditions: { suspicious_keywords: ['subscribe', 'follow my', 'check my channel'] },
      actions: ['add_mod_note', 'filter_review_queue', 'notify_moderators', 'send_to_jury_review'],
      createdAt: now,
      updatedAt: now,
      source: 'custom',
    },
    {
      id: createRuleId('nsfw-bait copy'),
      name: 'nsfw-bait copy',
      description: 'Flag adult bait, leak hooks, and attention traps.',
      enabled: true,
      severity: 'medium',
      conditions: { suspicious_keywords: ['onlyfans', 'nsfw', '18+', 'leak'] },
      actions: ['filter_review_queue', 'mark_high_risk', 'notify_moderators'],
      createdAt: now,
      updatedAt: now,
      source: 'custom',
    },
    {
      id: createRuleId('raid-detection copy'),
      name: 'raid-detection copy',
      description: 'Detect coordinated cross-subreddit bursts and recruit waves.',
      enabled: true,
      severity: 'critical',
      conditions: {
        cross_subreddit_activity_threshold: 4,
        rapid_post_burst_threshold: 6,
        new_account_wave_threshold: 5,
      },
      actions: ['remove_post', 'lock_thread', 'send_to_jury_review', 'notify_moderators'],
      createdAt: now,
      updatedAt: now,
      source: 'custom',
    },
  ];

  return {
    subredditId,
    version: 1,
    updatedAt: now,
    updatedBy,
    rules,
  };
};

const saveResolvedCase = async (juryCase: JuryCase, testMode?: boolean) => {
  await redis.set(juryCaseKey(juryCase.id, testMode), JSON.stringify(juryCase));
  await redis.set(juryVerdictKey(juryCase.subredditId, juryCase.postId, testMode), JSON.stringify(juryCase));
  await redis.zAdd(juryHistoryKey(juryCase.subredditId, testMode), {
    score: juryCase.resolvedAt ?? juryCase.createdAt,
    member: juryCase.postId,
  });
  await redis.zRem(juryQueueKey(juryCase.subredditId, testMode), [juryCase.postId]);
  await redis.zRem(juryLegacyActiveKey(juryCase.subredditId, testMode), [juryCase.postId]);
};

const buildResolvedCase = (input: {
  postId: string;
  subredditId: string;
  createdBy: string;
  reason: string;
  ruleCitation: string;
  contextNotes: string;
  author: string;
  title: string;
  body: string;
  severity: JurySeverity;
  verdict: 'approve' | 'remove' | null;
  createdAt: number;
  triggeredRule: string;
}) => {
  const juryCase = createJuryCase({
    postId: input.postId,
    subredditId: input.subredditId,
    createdBy: input.createdBy,
    reason: input.reason,
    ruleCitation: input.ruleCitation,
    contextNotes: input.contextNotes,
    author: input.author,
    title: input.title,
    body: input.body,
    severity: input.severity,
    deadline: input.createdAt + 24 * 60 * 60 * 1000,
    triggeredRule: input.triggeredRule,
    triggeredAction: 'send_to_jury_review',
    createdAt: input.createdAt,
  });

  juryCase.status = 'resolved';
  juryCase.finalVerdict = input.verdict;
  juryCase.resolvedAt = input.createdAt + 12 * 60 * 1000;
  juryCase.votes = input.verdict
    ? [{ moderator: input.createdBy, vote: input.verdict, timestamp: input.createdAt + 10 * 60 * 1000 }]
    : [{ moderator: input.createdBy, vote: 'abstain', timestamp: input.createdAt + 10 * 60 * 1000 }];
  juryCase.moderationSummary = input.verdict
    ? `Jury verdict: ${input.verdict.toUpperCase()}\nPost: ${input.postId}\nReason: ${input.reason}`
    : `Jury verdict: PENDING\nPost: ${input.postId}\nReason: ${input.reason}\nModerator abstained after review.`;

  return juryCase;
};

const seedActivity = async (subredditId: string, updatedBy: string, testMode?: boolean) => {
  const now = Date.now();
  const events: ModerationEvent[] = [
    {
      id: `${now}-deploy`,
      subredditId,
      timestamp: now - 7 * 60 * 1000,
      type: 'deploy',
      action: 'Rule deployed',
      details: 'Demo rules loaded for the first moderation walkthrough.',
    },
    {
      id: `${now}-jury`,
      subredditId,
      timestamp: now - 5 * 60 * 1000,
      type: 'hit',
      action: 'Case escalated to Jury Review',
      author: 'newpromoaccount',
      details: 'Please support my content • self-promo-abuse copy',
      ruleId: 'self-promo-abuse-copy',
      ruleName: 'self-promo-abuse copy',
      sampleId: 'demo-post-1',
    },
    {
      id: `${now}-remove`,
      subredditId,
      timestamp: now - 4 * 60 * 1000,
      type: 'flagged',
      action: 'Post removed',
      author: 'raidwaveuser',
      details: 'Everyone join from the other subreddit • removed after coordination review.',
      sampleId: 'demo-post-3',
    },
    {
      id: `${now}-notify`,
      subredditId,
      timestamp: now - 3 * 60 * 1000,
      type: 'flagged',
      action: 'Moderator notified',
      author: updatedBy,
      details: 'Moderators alerted to self-promo and raid patterns.',
    },
    {
      id: `${now}-risk`,
      subredditId,
      timestamp: now - 2 * 60 * 1000,
      type: 'flagged',
      action: 'High-risk content detected',
      author: 'content-watch',
      details: 'NSFW bait content and leak hooks elevated the risk score.',
    },
  ];

  for (const event of events) {
    await appendModerationEvent(subredditId, event);
    await logActivity({
      subredditId,
      action: event.action ?? 'Demo activity',
      moderator: updatedBy,
      detail: event.details ?? null,
      timestamp: event.timestamp,
      testMode,
    });
  }
};

const seedDemoJuryBoard = async (subredditId: string, updatedBy: string, testMode?: boolean) => {
  const now = Date.now();
  const demoCorpus = createDemoCorpus(subredditId);
  const selfPromo = demoCorpus[0];
  const nsfw = demoCorpus[1];
  const raid = demoCorpus[2];
  const control = demoCorpus[3];

  if (!selfPromo || !nsfw || !raid || !control) {
    throw new Error('Demo corpus is missing one or more required samples.');
  }

  await createAndSaveJuryCase({
    postId: 'demo-post-1',
    subredditId,
    createdBy: updatedBy,
    reason: 'Self promotion needs review before it reaches the feed.',
    ruleCitation: 'self-promo-abuse copy',
    contextNotes: 'Please subscribe and follow my page. Check my channel for more updates.',
    author: selfPromo.author,
    title: selfPromo.title,
    body: selfPromo.body,
    severity: 'high',
    deadline: now + 24 * 60 * 60 * 1000,
    triggeredRule: 'self-promo-abuse copy',
    triggeredAction: 'send_to_jury_review',
    createdAt: selfPromo.createdAt,
    ...(typeof testMode === 'boolean' ? { testMode } : {}),
  });

  const removedCase = buildResolvedCase({
    postId: 'demo-post-3',
    subredditId,
    createdBy: updatedBy,
    reason: 'Coordinated raid activity removed after review.',
    ruleCitation: 'raid-detection copy',
    contextNotes: 'Cross-subreddit movement and burst posting detected.',
    author: raid.author,
    title: raid.title,
    body: raid.body,
    severity: 'critical',
    verdict: 'remove',
    createdAt: raid.createdAt,
    triggeredRule: 'raid-detection copy',
  });
  await saveResolvedCase(removedCase, testMode);

  const approvedCase = buildResolvedCase({
    postId: 'demo-post-4',
    subredditId,
    createdBy: updatedBy,
    reason: 'Routine community question approved after review.',
    ruleCitation: 'community-review copy',
    contextNotes: 'No suspicious signals found. Community guidance request only.',
    author: control.author,
    title: control.title,
    body: control.body,
    severity: 'low',
    verdict: 'approve',
    createdAt: control.createdAt,
    triggeredRule: 'community-review copy',
  });
  await saveResolvedCase(approvedCase, testMode);

  const abstainCase = buildResolvedCase({
    postId: 'demo-post-5',
    subredditId,
    createdBy: updatedBy,
    reason: 'Borderline example left unresolved after abstention.',
    ruleCitation: 'review-abstain copy',
    contextNotes: 'Moderator abstained because the evidence was inconclusive.',
    author: 'borderline_case',
    title: 'Needs more context before verdict',
    body: 'This is a deliberate borderline example for the archived board.',
    severity: 'medium',
    verdict: null,
    createdAt: now - 30 * 60 * 1000,
    triggeredRule: 'review-abstain copy',
  });
  await saveResolvedCase(abstainCase, testMode);

  await flagPost(subredditId, 'demo-post-1', `${selfPromo.title} flagged for review.`, updatedBy, 'high', testMode);
  await flagPost(subredditId, 'demo-post-2', `${nsfw.title} flagged for review.`, updatedBy, 'medium', testMode);

  // User-provided demo sample: Private 18+ media shared
  const privateNsfwCreatedAt = now - 10 * 60 * 1000;
  const privateNsfwTitle = 'Private 18+ media shared';
  const privateNsfwBody = `NSFW warning.\n\n18+ content has surfaced online.\n\nOnlyFans material and a private leak are being discussed here.\n\nView it before the post gets taken down.`;

  await createAndSaveJuryCase({
    postId: 'demo-post-6',
    subredditId,
    createdBy: updatedBy,
    reason: 'Private 18+ media leak reported; community safety risk.',
    ruleCitation: 'nsfw-bait copy',
    contextNotes: 'Potential private content leak; review for removal.',
    author: 'demo_user',
    title: privateNsfwTitle,
    body: privateNsfwBody,
    severity: 'high',
    deadline: now + 24 * 60 * 60 * 1000,
    triggeredRule: 'nsfw-bait copy',
    triggeredAction: 'send_to_jury_review',
    createdAt: privateNsfwCreatedAt,
    ...(typeof testMode === 'boolean' ? { testMode } : {}),
  });

  await flagPost(subredditId, 'demo-post-6', `${privateNsfwTitle} flagged for review.`, updatedBy, 'high', testMode);

  await appendModerationEvent(subredditId, {
    id: `${now}-private-nsfw`,
    subredditId,
    timestamp: now - 8 * 60 * 1000,
    type: 'hit',
    action: 'Private media leak reported',
    author: 'demo_user',
    details: 'Private 18+ media surfaced and reported by community.',
    sampleId: 'demo-post-6',
  });
};

export async function ensureDemoSeed(input: {
  subredditId: string;
  updatedBy: string;
  testMode?: boolean;
  force?: boolean;
}): Promise<{ seeded: boolean; reason: 'forced' | 'empty' | 'already-seeded' }> {
  const markerKey = demoSeedKey(input.subredditId, input.testMode);
  const existingMarker = await redis.get(markerKey);

  const [state, flaggedPosts, queueCount, historyCount, activityCount] = await Promise.all([
    loadRuleState(input.subredditId),
    getFlaggedPosts(input.subredditId, input.testMode),
    redis.zCard(juryQueueKey(input.subredditId, input.testMode)),
    redis.zCard(juryHistoryKey(input.subredditId, input.testMode)),
    redis.zCard(activityKey(input.subredditId, input.testMode)),
  ]);

  const hasExistingData = Boolean(
    state.active ||
      state.history.length ||
      state.events.length ||
      state.flaggedUsers.length ||
      flaggedPosts.length ||
      queueCount ||
      historyCount ||
      activityCount
  );

  if (!input.force && existingMarker && hasExistingData) {
    return { seeded: false, reason: 'already-seeded' };
  }

  if (!input.force && hasExistingData) {
    return { seeded: false, reason: 'already-seeded' };
  }

  const now = Date.now();
  const ruleSet = buildDemoRuleSet(input.subredditId, input.updatedBy);

  state.active = ruleSet;
  state.analytics = updateRuleAnalytics(state.analytics, {
    deployCount: Math.max(1, state.analytics.deployCount + 1),
    lastDeployAt: now,
    lastUpdatedAt: now,
    queuePressure: 78,
    falsePositiveCandidates: [
      'newpromoaccount • Please support my content',
      'borderline_case • Needs more context before verdict',
    ],
    repeatedOffenders: [
      { author: 'newpromoaccount', hits: 3, lastSeen: now - 5 * 60 * 1000 },
      { author: 'raidwaveuser', hits: 4, lastSeen: now - 90 * 60 * 1000 },
    ],
    ruleHitFrequency: {
      'self-promo-abuse copy': 2,
      'nsfw-bait copy': 1,
      'raid-detection copy': 1,
    },
  });
  state.flaggedUsers = [
    ...upsertFlaggedUser(state.flaggedUsers, {
      author: 'newpromoaccount',
      reason: 'Self-promo content flagged for jury review.',
      riskScore: 82,
      timestamp: now - 5 * 60 * 1000,
    }),
    ...upsertFlaggedUser(state.flaggedUsers, {
      author: 'raidwaveuser',
      reason: 'Raid content removed and escalated.',
      riskScore: 95,
      timestamp: now - 90 * 60 * 1000,
    }),
  ];

  await persistRuleState(input.subredditId, state);
  await appendRuleHistory(input.subredditId, {
    version: 1,
    updatedAt: now,
    updatedBy: input.updatedBy,
    note: 'Demo moderation workflow seeded',
    yaml: getRuleSetYaml(ruleSet),
  });
  await redis.set(markerKey, JSON.stringify({ seededAt: now, updatedBy: input.updatedBy }));

  await logActivity({
    subredditId: input.subredditId,
    action: 'Rule deployed',
    moderator: input.updatedBy,
    tone: 'good',
    detail: 'Demo rules loaded and demo moderation cases seeded.',
    timestamp: now,
    testMode: input.testMode,
  });

  await appendModerationEvent(input.subredditId, {
    id: `${now}-deploy`,
    subredditId: input.subredditId,
    timestamp: now - 7 * 60 * 1000,
    type: 'deploy',
    action: 'Rule deployed',
    details: 'Demo rules loaded for the first moderation walkthrough.',
  });

  await seedActivity(input.subredditId, input.updatedBy, input.testMode);
  await seedDemoJuryBoard(input.subredditId, input.updatedBy, input.testMode);

  return { seeded: true, reason: input.force ? 'forced' : 'empty' };
}
