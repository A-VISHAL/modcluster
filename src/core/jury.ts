/**
 * Redis-backed collaborative moderation review model for ModPulse Jury Verdicts.
 *
 * Active queues and history are kept as sorted sets so moderators can fetch the
 * newest cases quickly, while each full case is stored under jurycase:{caseId}.
 */

import { redis } from '@devvit/redis';

export type JuryVoteValue = 'approve' | 'remove' | 'abstain';
export type JuryCaseStatus = 'pending' | 'resolved';
export type JuryFinalVerdict = 'approve' | 'remove' | null;

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

export const juryActiveKey = (subredditId: string) =>
  `jury:${subredditId}:active`;
export const juryHistoryKey = (subredditId: string) =>
  `jury:${subredditId}:history`;
export const juryCaseKey = (caseId: string) => `jurycase:${caseId}`;

const JURY_THRESHOLD = 2;
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

const saveJuryCase = async (juryCase: JuryCase) => {
  await redis.set(juryCaseKey(juryCase.id), JSON.stringify(juryCase));
};

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
  createdAt?: number;
  id?: string;
}): JuryCase {
  const createdAt = input.createdAt ?? Date.now();
  const id =
    input.id ??
    `${safeIdPart(input.subredditId)}-${safeIdPart(input.postId)}-${createdAt}`;

  return {
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
}

/** Store a new pending case and add it to the subreddit active jury queue. */
export async function saveNewJuryCase(juryCase: JuryCase): Promise<void> {
  await saveJuryCase(juryCase);
  await redis.zAdd(juryActiveKey(juryCase.subredditId), {
    score: juryCase.createdAt,
    member: juryCase.id,
  });
  await trimQueue(juryActiveKey(juryCase.subredditId));
}

export async function fetchJuryCase(caseId: string): Promise<JuryCase | null> {
  const data = await redis.get(juryCaseKey(caseId));
  return data ? parseCase(data) : null;
}

const fetchCasesFromQueue = async (
  key: string,
  limit: number
): Promise<JuryCase[]> => {
  const ids = await redis.zRange(key, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });

  const cases = await Promise.all(
    ids.map((entry: { member: string }) => fetchJuryCase(entry.member))
  );

  return cases.filter((juryCase): juryCase is JuryCase => juryCase !== null);
};

/** Fetch active unresolved jury cases for the dashboard and vote forms. */
export async function fetchActiveCases(
  subredditId: string,
  limit = 10
): Promise<JuryCase[]> {
  return fetchCasesFromQueue(juryActiveKey(subredditId), limit);
}

/** Fetch recently resolved cases for demo stats and auditability. */
export async function fetchResolvedCases(
  subredditId: string,
  limit = 10
): Promise<JuryCase[]> {
  return fetchCasesFromQueue(juryHistoryKey(subredditId), limit);
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
 */
export async function addVote(input: {
  caseId: string;
  moderator: string;
  vote: JuryVoteValue;
  timestamp?: number;
}): Promise<{ juryCase: JuryCase; duplicate: boolean; resolved: boolean }> {
  const juryCase = await fetchJuryCase(input.caseId);

  if (!juryCase) {
    throw new Error('Jury case not found.');
  }

  if (juryCase.status === 'resolved') {
    return { juryCase, duplicate: false, resolved: true };
  }

  const hasExistingVote = juryCase.votes.some(
    (vote) => vote.moderator === input.moderator
  );

  if (hasExistingVote) {
    return { juryCase, duplicate: true, resolved: false };
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

  const verdict = calculateVerdict(updatedCase.votes);

  if (verdict) {
    updatedCase.status = 'resolved';
    updatedCase.finalVerdict = verdict;
    updatedCase.resolvedAt = Date.now();
    updatedCase.moderationSummary = generateModerationSummary(updatedCase);
  }

  await saveJuryCase(updatedCase);

  if (updatedCase.status === 'resolved') {
    await redis.zRem(juryActiveKey(updatedCase.subredditId), [updatedCase.id]);
    await redis.zAdd(juryHistoryKey(updatedCase.subredditId), {
      score: updatedCase.resolvedAt ?? Date.now(),
      member: updatedCase.id,
    });
    await trimQueue(juryHistoryKey(updatedCase.subredditId));
  }

  return {
    juryCase: updatedCase,
    duplicate: false,
    resolved: updatedCase.status === 'resolved',
  };
}
