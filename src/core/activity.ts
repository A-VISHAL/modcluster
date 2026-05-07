/**
 * Redis-backed recent activity feed for the ModPulse dashboard.
 *
 * Each subreddit stores a compact chronological stream under
 * `activity:{subredditId}` so the web dashboard can surface real operational
 * events without inventing UI-only state.
 */

import { redis } from '@devvit/redis';

export type ActivityTone = 'good' | 'warn' | 'bad' | 'soft';

export type ActivityEvent = {
  id: string;
  subredditId: string;
  action: string;
  moderator: string | null;
  detail: string | null;
  tone: ActivityTone;
  timestamp: number;
};

export const activityKey = (subredditId: string) => `activity:${subredditId}`;

const MAX_ACTIVITY_ITEMS = 40;

const createActivityId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const parseActivity = (payload: string): ActivityEvent | null => {
  try {
    return JSON.parse(payload) as ActivityEvent;
  } catch (error) {
    console.error('Failed to parse activity event', error);
    return null;
  }
};

const trimActivityQueue = async (subredditId: string) => {
  const key = activityKey(subredditId);
  const count = await redis.zCard(key);

  if (count > MAX_ACTIVITY_ITEMS) {
    await redis.zRemRangeByRank(key, 0, count - MAX_ACTIVITY_ITEMS - 1);
  }
};

export async function logActivity(input: {
  subredditId: string;
  action: string;
  moderator?: string | null;
  detail?: string | null;
  tone?: ActivityTone;
  timestamp?: number;
  id?: string;
}): Promise<ActivityEvent> {
  const event: ActivityEvent = {
    id: input.id ?? createActivityId(),
    subredditId: input.subredditId,
    action: input.action,
    moderator: input.moderator ?? null,
    detail: input.detail ?? null,
    tone: input.tone ?? 'soft',
    timestamp: input.timestamp ?? Date.now(),
  };

  console.log('[ModPulse][activity] writing event', {
    subredditId: event.subredditId,
    action: event.action,
    moderator: event.moderator,
    tone: event.tone,
    timestamp: event.timestamp,
  });

  await redis.zAdd(activityKey(event.subredditId), {
    score: event.timestamp,
    member: JSON.stringify(event),
  });

  console.log('[ModPulse][activity] redis zAdd complete', {
    key: activityKey(event.subredditId),
    id: event.id,
  });

  await trimActivityQueue(event.subredditId);

  return event;
}

export async function fetchRecentActivity(
  subredditId: string,
  limit = 15
): Promise<ActivityEvent[]> {
  const items = await redis.zRange(activityKey(subredditId), 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });

  return items
    .map((entry: { member: string; score: number }) => parseActivity(entry.member))
    .filter((event: ActivityEvent | null): event is ActivityEvent => event !== null);
}