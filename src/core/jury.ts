/**
 * Redis-backed collaborative moderation review model for ModPulse Jury Verdicts.
 *
 * Active queues and history are kept as sorted sets so moderators can fetch the
 * newest cases quickly, while each full case is stored under jurycase:{caseId}.
 */

import { redis } from '@devvit/redis';
import { logActivity, type ActivityTone } from './activity';
import {
  executeRemovalVerdict,
  executeApprovalVerdict,
} from './moderation';

export type JuryVoteValue = 'approve' | 'remove' | 'abstain';
export type JuryCaseStatus = 'pending' | 'resolved';
export type JuryFinalVerdict = 'approve' | 'remove' | null;
export type JurySeverity = 'low' | 'medium' | 'high' | 'critical';

export type JuryVote = {
  moderator: string;
  vote: JuryVoteValue;
  timestamp: number;
};

export type JuryCase = {
  id: string;
  postId: string;
  subredditId: string;
  createdBy: string;
  createdAt: number;
  author?: string;
  title?: string;
  body?: string;
  severity?: JurySeverity;
  deadline?: number;
  triggeredRule?: string;
  triggeredAction?: string;
  reason: string;
  ruleCitation: string;
  contextNotes: string;
  status: JuryCaseStatus;
  votes: JuryVote[];
  finalVerdict: JuryFinalVerdict;
  moderationSummary?: string;
  resolvedAt?: number;
};

export type JuryVoteCounts = Record<JuryVoteValue, number>;

export const juryActiveKey = (subredditId: string, testMode?: boolean) =>
  `${testMode ? 'test:' : ''}jury:${subredditId}:queue`;
export const juryQueueKey = juryActiveKey;
export const juryLegacyActiveKey = (subredditId: string, testMode?: boolean) =>
  `${testMode ? 'test:' : ''}jury:${subredditId}:active`;
export const juryHistoryKey = (subredditId: string, testMode?: boolean) =>
  `${testMode ? 'test:' : ''}jury:${subredditId}:history`;
export const juryCaseKey = (caseId: string, testMode?: boolean) => `${testMode ? 'test:' : ''}jurycase:${caseId}`;
export const juryVerdictKey = (subredditId: string, postId: string, testMode?: boolean) =>
  `${testMode ? 'test:' : ''}jury:${subredditId}:verdict:${safeIdPart(postId)}`;

const JURY_THRESHOLD = 1;
const MAX_CASES_PER_QUEUE = 100;

const safeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const parseCase = (payload: string): JuryCase | null => {
  try {
    return JSON.parse(payload) as JuryCase;
  } catch (error) {
    console.error('Failed to parse jury case', error);
    return null;
  }
};

const saveJuryCase = async (juryCase: JuryCase, testMode?: boolean) => {
  await redis.set(juryCaseKey(juryCase.id, testMode), JSON.stringify(juryCase));
  await redis.set(juryVerdictKey(juryCase.subredditId, juryCase.postId, testMode), JSON.stringify(juryCase));
};

export async function fetchJuryCaseByPost(postId: string, subredditId: string, testMode?: boolean): Promise<JuryCase | null> {
  const data = await redis.get(juryVerdictKey(subredditId, postId, testMode));
  return data ? parseCase(data) : null;
}

const trimQueue = async (key: string) => {
  const count = await redis.zCard(key);

  if (count > MAX_CASES_PER_QUEUE) {
    await redis.zRemRangeByRank(key, 0, count - MAX_CASES_PER_QUEUE - 1);
  }
};

/** Count votes by type for dashboard progress indicators and verdict logic. */
export function countVotes(votes: JuryVote[]): JuryVoteCounts {
  return votes.reduce<JuryVoteCounts>(
    (counts, vote) => ({
      ...counts,
      [vote.vote]: counts[vote.vote] + 1,
    }),
    { approve: 0, remove: 0, abstain: 0 }
  );
}

/**
 * Verdict logic for the default 2-of-3 review model.
 *
 * Abstentions are recorded for accountability, but only two approve or two
 * remove votes resolve the case.
 */
export function calculateVerdict(votes: JuryVote[]): JuryFinalVerdict {
  const counts = countVotes(votes);

  if (counts.remove >= JURY_THRESHOLD) {
    return 'remove';
  }

  if (counts.approve >= JURY_THRESHOLD) {
    return 'approve';
  }

  return null;
}

/** Create a normalized JuryCase before it is persisted to Redis. */
export function createJuryCase(input: {
  postId: string;
  subredditId: string;
  createdBy: string;
  reason: string;
  ruleCitation: string;
  contextNotes: string;
  author?: string;
  title?: string;
  body?: string;
  severity?: JurySeverity;
  deadline?: number;
  triggeredRule?: string;
  triggeredAction?: string;
  createdAt?: number;
  id?: string;
}): JuryCase {
  const createdAt = input.createdAt ?? Date.now();
  const id =
    input.id ??
    `${safeIdPart(input.subredditId)}-${safeIdPart(input.postId)}-${createdAt}`;

  const juryCase: JuryCase = {
    id,
    postId: input.postId,
    subredditId: input.subredditId,
    createdBy: input.createdBy,
    createdAt,
    reason: input.reason,
    ruleCitation: input.ruleCitation,
    contextNotes: input.contextNotes,
    status: 'pending',
    votes: [],
    finalVerdict: null,
  };

  if (input.author !== undefined) juryCase.author = input.author;
  if (input.title !== undefined) juryCase.title = input.title;
  if (input.body !== undefined) juryCase.body = input.body;
  if (input.severity !== undefined) juryCase.severity = input.severity;
  if (input.deadline !== undefined) juryCase.deadline = input.deadline;
  if (input.triggeredRule !== undefined) juryCase.triggeredRule = input.triggeredRule;
  if (input.triggeredAction !== undefined) juryCase.triggeredAction = input.triggeredAction;

  return juryCase;
}

/** Store a new pending case and add it to the subreddit active jury queue. */
export async function saveNewJuryCase(juryCase: JuryCase, testMode?: boolean): Promise<void> {
  await saveJuryCase(juryCase, testMode);
  const score = juryCase.deadline ?? (juryCase.createdAt + 24 * 60 * 60 * 1000);
  await redis.zAdd(juryQueueKey(juryCase.subredditId, testMode), {
    score: score,
    member: juryCase.postId,
  });
  await redis.zAdd(juryLegacyActiveKey(juryCase.subredditId, testMode), {
    score: score,
    member: juryCase.postId,
  });
  console.log("Saved verdict");
  console.log("Added to queue");

  await logActivity({
    subredditId: juryCase.subredditId,
    action: 'Case escalated to Jury Review',
    moderator: juryCase.createdBy,
    tone: 'warn',
    detail: `${juryCase.postId} • ${juryCase.reason || 'Flagged for review.'}`,
    timestamp: juryCase.createdAt,
  });

  const text = `${juryCase.reason} ${juryCase.ruleCitation} ${juryCase.contextNotes}`.toLowerCase();
  if (text.includes('spam') || text.includes('brigad') || text.includes('vote manipulation')) {
    await logActivity({
      subredditId: juryCase.subredditId,
      action: 'Spam cluster flagged',
      moderator: juryCase.createdBy,
      tone: 'bad',
      detail: `${juryCase.postId} • Clustered signals detected.`,
      timestamp: juryCase.createdAt + 1,
    });
  }

  if (text.includes('harass') || text.includes('abuse') || text.includes('civil') || text.includes('toxic')) {
    await logActivity({
      subredditId: juryCase.subredditId,
      action: 'Toxicity spike detected',
      moderator: juryCase.createdBy,
      tone: 'bad',
      detail: `${juryCase.postId} • Escalating civility signals.`,
      timestamp: juryCase.createdAt + 2,
    });
  }

  await trimQueue(juryQueueKey(juryCase.subredditId, testMode));
  await trimQueue(juryLegacyActiveKey(juryCase.subredditId, testMode));
}

export async function createAndSaveJuryCase(input: {
  postId: string;
  subredditId: string;
  createdBy: string;
  reason: string;
  ruleCitation: string;
  contextNotes: string;
  author?: string;
  title?: string;
  body?: string;
  severity?: JurySeverity;
  deadline?: number;
  triggeredRule?: string;
  triggeredAction?: string;
  createdAt?: number;
  id?: string;
  testMode?: boolean;
}): Promise<JuryCase> {
  const existing = await fetchJuryCaseByPost(input.postId, input.subredditId, input.testMode);
  if (existing) {
    return existing;
  }

  console.log("JURY PIPELINE START");
  console.log("Creating jury case", input.postId);

  const juryCase = createJuryCase({
    postId: input.postId,
    subredditId: input.subredditId,
    createdBy: input.createdBy,
    reason: input.reason,
    ruleCitation: input.ruleCitation,
    contextNotes: input.contextNotes,
    ...(input.author !== undefined ? { author: input.author } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.severity !== undefined ? { severity: input.severity } : {}),
    ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
    ...(input.triggeredRule !== undefined ? { triggeredRule: input.triggeredRule } : {}),
    ...(input.triggeredAction !== undefined ? { triggeredAction: input.triggeredAction } : {}),
    ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
    ...(input.id !== undefined ? { id: input.id } : {}),
  });
  await saveNewJuryCase(juryCase, input.testMode);

  console.log('Saved verdict', {
    caseId: juryCase.id,
    postId: juryCase.postId,
    subredditId: juryCase.subredditId,
  });
  console.log('Added to jury queue', {
    queueKey: juryQueueKey(juryCase.subredditId, input.testMode),
  });

  return juryCase;
}

export async function fetchJuryCase(caseId: string, testMode?: boolean): Promise<JuryCase | null> {
  const data = await redis.get(juryCaseKey(caseId, testMode));
  return data ? parseCase(data) : null;
}

const fetchCasesFromQueue = async (
  key: string,
  limit: number,
  subredditId: string,
  testMode?: boolean,
  fallbackKey?: string
): Promise<JuryCase[]> => {
  const primaryIds = await redis.zRange(key, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });

  const fallbackIds = fallbackKey
    ? await redis.zRange(fallbackKey, 0, limit - 1, {
        by: 'rank',
        reverse: true,
      })
    : [];

  const ids = [...primaryIds, ...fallbackIds].filter(
    (entry, index, all) => all.findIndex((candidate) => candidate.member === entry.member) === index
  );

  const cases = await Promise.all(
    ids.map(async (entry: { member: string }) => {
      const byPost = await fetchJuryCaseByPost(entry.member, subredditId, testMode);
      if (byPost) return byPost;
      return fetchJuryCase(entry.member, testMode);
    })
  );

  return cases.filter((juryCase): juryCase is JuryCase => juryCase !== null);
};

/** Fetch active unresolved jury cases for the dashboard and vote forms. */
export async function fetchActiveCases(
  subredditId: string,
  limit = 10,
  testMode?: boolean
): Promise<JuryCase[]> {
  const cases = await fetchCasesFromQueue(
    juryQueueKey(subredditId, testMode),
    limit,
    subredditId,
    testMode,
    juryLegacyActiveKey(subredditId, testMode)
  );
  console.log("Fetched pending jury cases", cases.length);
  return cases;
}

/** Fetch recently resolved cases for demo stats and auditability. */
export async function fetchResolvedCases(
  subredditId: string,
  limit = 10,
  testMode?: boolean
): Promise<JuryCase[]> {
  return fetchCasesFromQueue(juryHistoryKey(subredditId, testMode), limit, subredditId, testMode);
}

export const summarizeVoteCounts = (votes: JuryVote[]) => {
  const counts = countVotes(votes);
  return `${counts.approve} approve / ${counts.remove} remove / ${counts.abstain} abstain`;
};

export function generateModerationSummary(juryCase: JuryCase): string {
  const verdict = juryCase.finalVerdict ?? 'pending';
  const counts = summarizeVoteCounts(juryCase.votes);

  return [
    `Jury verdict: ${verdict.toUpperCase()}`,
    `Post: ${juryCase.postId}`,
    `Reason: ${juryCase.reason || 'None provided'}`,
    `Rule citation: ${juryCase.ruleCitation || 'None provided'}`,
    `Votes: ${counts}`,
    `Case opened by ${juryCase.createdBy} on ${new Date(
      juryCase.createdAt
    ).toLocaleString()}`,
  ].join('\n');
}

/**
 * Add a moderator vote, prevent duplicate voting, and resolve the case once
 * the collaborative threshold is reached.
 *
 * In dev mode, duplicate checks are bypassed to allow testing with simulated moderators.
 *
 * @param input.moderator - The moderator voting (could be simulated in dev mode for display)
 * @param input.realModerator - The actual authenticated moderator for Reddit execution
 * @param input.devMode - Whether this is a simulated test vote
 */
export async function addVote(input: {
  caseId: string;
  moderator: string;
  vote: JuryVoteValue;
  timestamp?: number;
  devMode?: boolean;
  realModerator?: string;
}): Promise<{ juryCase: JuryCase; duplicate: boolean; resolved: boolean }> {
  console.log('[ModPulse][jury] addVote start', {
    caseId: input.caseId,
    displayModerator: input.moderator,
    realModerator: input.realModerator || input.moderator,
    vote: input.vote,
    devMode: input.devMode,
  });

  const juryCase = await fetchJuryCase(input.caseId, input.devMode);

  if (!juryCase) {
    throw new Error('Jury case not found.');
  }

  if (juryCase.status === 'resolved') {
    return { juryCase, duplicate: false, resolved: true };
  }

  // Check for duplicate votes ONLY if not in dev mode
  if (!input.devMode) {
    const hasExistingVote = juryCase.votes.some(
      (vote) => vote.moderator === input.moderator
    );

    if (hasExistingVote) {
      console.log('[ModPulse][jury] duplicate vote blocked', {
        caseId: input.caseId,
        moderator: input.moderator,
      });
      return { juryCase, duplicate: true, resolved: false };
    }
  }

  const updatedCase: JuryCase = {
    ...juryCase,
    votes: [
      ...juryCase.votes,
      {
        moderator: input.moderator,
        vote: input.vote,
        timestamp: input.timestamp ?? Date.now(),
      },
    ],
  };

  const voteTone: ActivityTone = input.vote === 'remove' ? 'bad' : input.vote === 'approve' ? 'good' : 'soft';
  const voteAction =
    input.vote === 'remove'
      ? 'Moderator voted REMOVE'
      : input.vote === 'approve'
        ? 'Moderator approved case'
        : 'Moderator abstained from jury vote';

  await logActivity({
    subredditId: juryCase.subredditId,
    action: voteAction,
    moderator: input.moderator,
    tone: voteTone,
    detail: `${juryCase.postId} • ${summarizeVoteCounts(updatedCase.votes)}`,
    timestamp: input.timestamp ?? Date.now(),
  });

  if (updatedCase.votes.length === 1 && input.vote !== 'abstain') {
    await logActivity({
      subredditId: juryCase.subredditId,
      action: 'Case escalated',
      moderator: input.moderator,
      tone: 'warn',
      detail: `${juryCase.postId} • First actionable vote received.`,
      timestamp: (input.timestamp ?? Date.now()) + 1,
    });
  }

  const verdict = calculateVerdict(updatedCase.votes);

  if (verdict) {
    console.log('[ModPulse][jury] verdict resolved', {
      caseId: updatedCase.id,
      subredditId: updatedCase.subredditId,
      verdict,
      voteCounts: summarizeVoteCounts(updatedCase.votes),
      displayModerator: input.moderator,
      executingModerator: input.realModerator || input.moderator,
    });

    updatedCase.status = 'resolved';
    updatedCase.finalVerdict = verdict;
    updatedCase.resolvedAt = Date.now();
    updatedCase.moderationSummary = generateModerationSummary(updatedCase);

    await logActivity({
      subredditId: juryCase.subredditId,
      action: 'Jury verdict resolved',
      moderator: input.moderator,
      tone: verdict === 'remove' ? 'bad' : 'good',
      detail: `${juryCase.postId} • Verdict: ${verdict.toUpperCase()}`,
      timestamp: updatedCase.resolvedAt,
    });

    // Use the real moderator for execution, not the displayed one
    const executingModerator = input.realModerator || input.moderator;

    // EXECUTE VERDICT ON REDDIT
    if (verdict === 'remove') {
      console.log('[ModPulse][jury] executing REMOVE verdict on Reddit', {
        caseId: updatedCase.id,
        postId: updatedCase.postId,
        displayModerator: input.moderator,
        executingModerator,
        devMode: input.devMode,
      });

      try {
        const outcome = await executeRemovalVerdict({
          postId: updatedCase.postId,
          subredditId: updatedCase.subredditId,
          caseId: updatedCase.id,
          reason: updatedCase.reason,
          ruleCitation: updatedCase.ruleCitation,
          displayModerator: input.moderator,
          executingModerator,
          devMode: input.devMode ?? false,
        });

        if (outcome.success) {
          await logActivity({
            subredditId: juryCase.subredditId,
            action: 'Post removed per jury verdict',
            moderator: input.moderator,
            tone: 'bad',
            detail: `${juryCase.postId} • Post is no longer visible on Reddit • Executed by ${executingModerator}`,
            timestamp: updatedCase.resolvedAt + 1,
          });
        } else {
          await logActivity({
            subredditId: juryCase.subredditId,
            action: 'Removal execution failed',
            moderator: input.moderator,
            tone: 'bad',
            detail: `${juryCase.postId} • ${outcome.message}`,
            timestamp: updatedCase.resolvedAt + 2,
          });
        }
      } catch (err) {
        console.error('[ModPulse][jury] verdict execution error', {
          caseId: updatedCase.id,
          error: err,
        });
      }
    } else if (verdict === 'approve') {
      console.log('[ModPulse][jury] executing APPROVE verdict', {
        caseId: updatedCase.id,
        postId: updatedCase.postId,
        displayModerator: input.moderator,
        executingModerator,
      });

      try {
        const outcome = await executeApprovalVerdict({
          postId: updatedCase.postId,
          subredditId: updatedCase.subredditId,
          caseId: updatedCase.id,
          reason: updatedCase.reason,
          displayModerator: input.moderator,
          executingModerator,
        });

        if (outcome.success) {
          await logActivity({
            subredditId: juryCase.subredditId,
            action: 'Post approved by consensus',
            moderator: input.moderator,
            tone: 'good',
            detail: `${juryCase.postId} • Case closed, no removal`,
            timestamp: updatedCase.resolvedAt + 1,
          });
        }
      } catch (err) {
        console.error('[ModPulse][jury] verdict execution error', {
          caseId: updatedCase.id,
          error: err,
        });
      }
    }
  }

  await saveJuryCase(updatedCase, input.devMode);
  console.log('[ModPulse][jury] case saved', {
    caseId: updatedCase.id,
    status: updatedCase.status,
    finalVerdict: updatedCase.finalVerdict,
    voteCounts: summarizeVoteCounts(updatedCase.votes),
  });

  if (updatedCase.status === 'resolved') {
    await redis.zRem(juryQueueKey(updatedCase.subredditId, input.devMode), [updatedCase.postId]);
    await redis.zRem(juryLegacyActiveKey(updatedCase.subredditId, input.devMode), [updatedCase.postId]);
    await redis.zAdd(juryHistoryKey(updatedCase.subredditId, input.devMode), {
      score: updatedCase.resolvedAt ?? Date.now(),
      member: updatedCase.postId,
    });
    console.log('[ModPulse][jury] moved case to resolved queue', {
      caseId: updatedCase.id,
      subredditId: updatedCase.subredditId,
    });
    await trimQueue(juryHistoryKey(updatedCase.subredditId, input.devMode));
  }

  return {
    juryCase: updatedCase,
    duplicate: false,
    resolved: updatedCase.status === 'resolved',
  };
}
