/**
 * Post flagging system - Allow moderators to mark posts for review
 */

import { redis } from '@devvit/web/server';

export interface FlaggedPost {
  postId: string;
  reason: string;
  flaggerId: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
}

const FLAGS_KEY = (subredditId: string) => `flags:${subredditId}:posts`;
const FLAG_DETAIL_KEY = (subredditId: string, postId: string) => `flags:${subredditId}:${postId}`;

/**
 * Flag a post for review
 */
export const flagPost = async (
  subredditId: string,
  postId: string,
  reason: string,
  flaggerId: string,
  priority: 'low' | 'medium' | 'high' = 'medium'
): Promise<FlaggedPost> => {
  const flag: FlaggedPost = {
    postId,
    reason,
    flaggerId,
    timestamp: Date.now(),
    priority,
  };

  try {
    // Add to sorted set (sorted by timestamp for easy retrieval)
    await redis.zAdd(FLAGS_KEY(subredditId), {
      member: postId,
      score: Date.now(),
    });

    // Store full flag details
    await redis.set(FLAG_DETAIL_KEY(subredditId, postId), JSON.stringify(flag));

    return flag;
  } catch (error) {
    console.error('[Flags] Error flagging post', {
      subredditId,
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Unflag a post
 */
export const unflagPost = async (subredditId: string, postId: string): Promise<void> => {
  try {
    await Promise.all([
      redis.zRem(FLAGS_KEY(subredditId), [postId]),
      redis.del(FLAG_DETAIL_KEY(subredditId, postId)),
    ]);
  } catch (error) {
    console.error('[Flags] Error unflagging post', {
      subredditId,
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get all flagged posts for a subreddit
 */
export const getFlaggedPosts = async (subredditId: string): Promise<FlaggedPost[]> => {
  try {
    const items = await redis.zRange(FLAGS_KEY(subredditId), 0, -1, {
      by: 'rank',
      reverse: true, // Most recent first
    });

    if (!items || items.length === 0) {
      return [];
    }

    const flagDetails = await Promise.all(
      items.map((item: { member: string }) =>
        redis
          .get(FLAG_DETAIL_KEY(subredditId, item.member))
          .then((data) => {
            try {
              return data ? (JSON.parse(data) as FlaggedPost) : null;
            } catch {
              return null;
            }
          })
          .catch(() => null)
      )
    );

    return flagDetails.filter((flag): flag is FlaggedPost => flag !== null);
  } catch (error) {
    console.error('[Flags] Error fetching flagged posts', {
      subredditId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

/**
 * Get a specific flagged post
 */
export const getFlaggedPost = async (subredditId: string, postId: string): Promise<FlaggedPost | null> => {
  try {
    const data = await redis.get(FLAG_DETAIL_KEY(subredditId, postId));
    if (!data) return null;
    return JSON.parse(data) as FlaggedPost;
  } catch (error) {
    console.error('[Flags] Error fetching flagged post', {
      subredditId,
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Clear all flags for a subreddit (e.g., when handing over or completing shift)
 */
export const clearFlags = async (subredditId: string): Promise<void> => {
  try {
    const flagsKey = FLAGS_KEY(subredditId);
    const items = await redis.zRange(flagsKey, 0, -1, { by: 'rank' });

    if (items && items.length > 0) {
      const detailKeys = items.map((item: { member: string }) => FLAG_DETAIL_KEY(subredditId, item.member));
      if (detailKeys.length > 0) {
        await redis.del(...detailKeys);
      }
    }

    await redis.del(flagsKey);
  } catch (error) {
    console.error('[Flags] Error clearing flags', {
      subredditId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get flag count by priority
 */
export const getFlagStats = async (
  subredditId: string
): Promise<{ total: number; high: number; medium: number; low: number }> => {
  try {
    const flags = await getFlaggedPosts(subredditId);
    return {
      total: flags.length,
      high: flags.filter((f) => f.priority === 'high').length,
      medium: flags.filter((f) => f.priority === 'medium').length,
      low: flags.filter((f) => f.priority === 'low').length,
    };
  } catch (error) {
    console.error('[Flags] Error getting flag stats', {
      subredditId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { total: 0, high: 0, medium: 0, low: 0 };
  }
};
