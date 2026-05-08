/**
 * ModPulse AI Security Module
 *
 * Centralized subreddit-scoped validation and safety checks to ensure all
 * moderation actions are explicitly restricted to the currently active subreddit.
 *
 * This module prevents accidental or malicious cross-subreddit moderation actions
 * and provides comprehensive auditability for all moderation workflows.
 */

import { context } from '@devvit/web/server';

export type SecurityCheckResult = {
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
};

/**
 * Get the current subreddit ID from context.
 * Throws if the request is not subreddit-scoped.
 */
export const getCurrentSubreddit = (): string => {
  if (!context.subredditId) {
    throw new Error(
      '[ModPulse Security] Request is not subreddit-scoped. ' +
        'Moderation actions can only be performed from within a subreddit context.'
    );
  }
  return context.subredditId;
};

/**
 * Get the current moderator username.
 * Falls back to 'system' if not available.
 */
export const getCurrentModerator = (): string => {
  return context.username ?? 'system-action';
};

/**
 * Verify that an object's subreddit ID matches the current active subreddit.
 *
 * Use this before ANY moderation action to ensure cross-subreddit safety.
 */
export const validateSubredditScope = (
  resourceSubredditId: string | undefined | null,
  resourceType: string
): SecurityCheckResult => {
  try {
    const currentSubreddit = getCurrentSubreddit();

    if (!resourceSubredditId) {
      return {
        valid: false,
        error: `[Security] ${resourceType} has no subreddit ID. Cannot validate scope.`,
        details: {
          currentSubreddit,
          resourceType,
          resourceSubredditId,
        },
      };
    }

    if (resourceSubredditId !== currentSubreddit) {
      return {
        valid: false,
        error:
          `[Security] ${resourceType} belongs to r/${resourceSubredditId}, ` +
          `but current context is r/${currentSubreddit}. ` +
          `Cross-subreddit moderation actions are not permitted.`,
        details: {
          currentSubreddit,
          resourceSubredditId,
          resourceType,
          mismatch: true,
        },
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `[Security] Subreddit scope validation failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { resourceType },
    };
  }
};

/**
 * Log a security event for auditability.
 * Use for validation failures, scope mismatches, and suspicious patterns.
 */
export const logSecurityEvent = (event: {
  type: 'scope-mismatch' | 'validation-failure' | 'cross-subreddit-attempt' | 'access-denied';
  moderator?: string;
  subredditId?: string;
  resourceId?: string;
  resourceType?: string;
  reason?: string;
  details?: Record<string, unknown>;
}): void => {
  console.warn('[ModPulse Security Event]', {
    timestamp: new Date().toISOString(),
    type: event.type,
    moderator: event.moderator ?? 'unknown',
    subredditId: event.subredditId ?? 'unknown',
    resourceId: event.resourceId ?? 'unknown',
    resourceType: event.resourceType ?? 'unknown',
    reason: event.reason ?? 'unspecified',
    details: event.details,
  });
};

/**
 * Extract audit info for logging moderation actions.
 */
export const getAuditContext = () => {
  return {
    moderator: getCurrentModerator(),
    subreddit: try_get_subreddit(),
    timestamp: Date.now(),
    context: {
      userId: context.userId,
      isModeratorAction: true,
    },
  };
};

/**
 * Helper to safely get subreddit without throwing.
 */
const try_get_subreddit = (): string | null => {
  try {
    return getCurrentSubreddit();
  } catch {
    return null;
  }
};
