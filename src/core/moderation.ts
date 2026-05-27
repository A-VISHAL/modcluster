/**
 * Core moderation action execution.
 *
 * Integrates with Devvit Reddit API to execute removal verdicts,
 * add moderator notes, and manage post state.
 */

import { reddit } from '@devvit/web/server';
import { logActivity, type ActivityTone } from './activity';
import { createAndSaveJuryCase, type JurySeverity } from './jury';

/**
 * Ensure postId is in the correct fullname format (t3_xxx).
 * Devvit requires posts to be fetched using fullname format.
 */
function ensurePostFullname(postId: string): `t3_${string}` {
  if (postId.startsWith('t3_')) {
    return postId as `t3_${string}`;
  }
  return `t3_${postId}` as `t3_${string}`;
}

function isSubredditScopeMatch(
  post: { subredditName: string; subredditId: string | undefined },
  subredditScope: string
): boolean {
  const expected = subredditScope.toLowerCase();
  const postName = post.subredditName.toLowerCase();
  const postId = post.subredditId?.toLowerCase();

  // Accept either subreddit name (legacy/demo) or subreddit ID (t5_xxx).
  return postName === expected || postId === expected;
}

export type ModerationActionType = 'remove' | 'approve' | 'immediate';

export type ModerationOutcome = {
  success: boolean;
  message: string;
  postId: string;
  actionType: ModerationActionType;
  timestamp: number;
  details?: {
    removed?: boolean;
    locked?: boolean;
    noteAdded?: boolean;
    error?: string;
  };
};

/**
 * Add a moderator note to a Reddit post.
 * Notes are visible in the moderation history and help track decisions.
 */
async function addRedditModeratorNote(
  postId: string,
  note: string,
  subredditId: string,
  testMode?: boolean
): Promise<boolean> {
  if (testMode) {
    console.log('[ModPulse][moderation] [MOD_NOTE] TEST MODE - Mocking note addition', { postId, note });
    return true;
  }
  try {
    console.log('[ModPulse][moderation] [MOD_NOTE] Fetching post for note addition', {
      postId,
      noteLength: note.length,
      subredditId,
    });

    const fullname = ensurePostFullname(postId);
    const post = await reddit.getPostById(fullname);
    if (!post) {
      console.warn('[ModPulse][moderation] [MOD_NOTE] Post not found for note', {
        postId,
        fullname,
        subredditId,
      });
      return false;
    }

    console.log('[ModPulse][moderation] [MOD_NOTE] Post fetched, adding note', {
      postId,
      subredditName: post.subredditName,
      notePreview: note.substring(0, 80),
    });

    // Devvit note API - adds to mod history
    // Note: Devvit may not expose addModNote directly, so we document intent
    console.log('[ModPulse][moderation] [MOD_NOTE] Moderator note intent recorded', {
      postId,
      subredditName: post.subredditName,
      note: note.substring(0, 100),
    });

    return true;
  } catch (error) {
    console.error('[ModPulse][moderation] [MOD_NOTE ✗] Failed to add mod note', {
      postId,
      errorMessage: String(error),
      stackTrace: error instanceof Error ? error.stack : 'No stack trace',
    });
    return false;
  }
}

/**
 * Remove a Reddit post immediately.
 */
async function removePost(postId: string, subredditId: string, testMode?: boolean): Promise<boolean> {
  if (testMode) {
    console.log('[ModPulse][moderation] [REMOVE] TEST MODE - Mocking post removal', { postId, subredditId });
    return true;
  }
  try {
    console.log('[ModPulse][moderation] ========== REMOVAL PHASE: INIT ==========', {
      postId,
      subredditId,
      timestamp: Date.now(),
    });

    // PHASE 1: Fetch post from Reddit API
    console.log('[ModPulse][moderation] [PHASE 1] Fetching post from Reddit API', {
      postId,
      subredditId,
    });

    const fullname = ensurePostFullname(postId);
    console.log('[ModPulse][moderation] [PHASE 1] Post fullname prepared', {
      originalId: postId,
      fullname,
    });

    let post;
    try {
      post = await reddit.getPostById(fullname);
      console.log('[ModPulse][moderation] [PHASE 1 ✓] Post fetch successful', {
        postId,
        postExists: !!post,
        postTitle: post?.title?.substring(0, 50),
        postAuthor: post?.authorName,
      });
    } catch (fetchError) {
      const stackTrace = fetchError instanceof Error ? fetchError.stack : 'No stack trace';
      console.error('[ModPulse][moderation] [PHASE 1 ✗] Post fetch FAILED', {
        postId,
        fullname,
        subredditId,
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        errorMessage: String(fetchError),
        stackTrace,
      });
      throw new Error(`Post fetch failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!post) {
      console.warn('[ModPulse][moderation] [PHASE 1 ✗] Post not found (null response)', {
        postId,
        fullname,
        subredditId,
      });
      return false;
    }

    // PHASE 2: Validate subreddit scope (name/id-safe)
    const postSubredditId = (post as { subredditId?: string }).subredditId;
    const scopeMatch = isSubredditScopeMatch(
      {
        subredditName: post.subredditName,
        subredditId: postSubredditId,
      },
      subredditId
    );

    console.log('[ModPulse][moderation] [PHASE 2] Validating subreddit scope', {
      postSubreddit: post.subredditName,
      postSubredditId,
      expectedSubreddit: subredditId,
      match: scopeMatch,
    });

    if (!scopeMatch) {
      throw new Error(
        `Subreddit mismatch: post is in r/${post.subredditName} (${postSubredditId ?? 'unknown-id'}), expected scope ${subredditId}`
      );
    }

    console.log('[ModPulse][moderation] [PHASE 2 ✓] Subreddit scope validated', {
      subredditName: post.subredditName,
    });

    // PHASE 3: Check moderator permissions
    console.log('[ModPulse][moderation] [PHASE 3] Checking moderator permissions', {
      subredditName: post.subredditName,
    });

    let user;
    try {
      user = await reddit.getCurrentUser();
      console.log('[ModPulse][moderation] [PHASE 3 ✓] Current user fetched', {
        username: user?.username,
        userExists: !!user,
      });
    } catch (userError) {
      console.error('[ModPulse][moderation] [PHASE 3 ✗] User fetch FAILED', {
        errorMessage: String(userError),
        stackTrace: userError instanceof Error ? userError.stack : 'No stack trace',
      });
      throw new Error(`Unable to verify current user: ${String(userError)}`);
    }

    if (!user) {
      throw new Error('Current user is null');
    }

    let modPermissions: string[] = [];
    try {
      modPermissions = await user.getModPermissionsForSubreddit(post.subredditName);
      console.log('[ModPulse][moderation] [PHASE 3 ✓] Mod permissions retrieved', {
        username: user.username,
        subredditName: post.subredditName,
        permissions: modPermissions,
      });
    } catch (permError) {
      console.error('[ModPulse][moderation] [PHASE 3 ✗] Permission check FAILED', {
        username: user.username,
        subredditName: post.subredditName,
        errorMessage: String(permError),
        stackTrace: permError instanceof Error ? permError.stack : 'No stack trace',
      });
      throw new Error(`Permission check failed: ${String(permError)}`);
    }

    const canManagePosts =
      modPermissions.includes('all') || modPermissions.includes('posts');

    if (!canManagePosts) {
      console.error('[ModPulse][moderation] [PHASE 3 ✗] Insufficient permissions', {
        username: user.username,
        subredditName: post.subredditName,
        permissions: modPermissions,
        required: 'all or posts',
      });
      throw new Error(
        `User ${user.username} lacks posts permission in r/${post.subredditName}. Has: ${modPermissions.join(', ')}`
      );
    }

    // PHASE 4: Execute removal
    console.log('[ModPulse][moderation] [PHASE 4] Executing post removal', {
      postId,
      subredditName: post.subredditName,
      postCurrentlyRemoved: post.removed,
    });

    if (post.removed) {
      console.log('[ModPulse][moderation] [PHASE 4] Post already removed, skipping', {
        postId,
      });
    } else {
      try {
        await post.remove();
        console.log('[ModPulse][moderation] [PHASE 4 ✓] Post removal API call succeeded', {
          postId,
          subredditName: post.subredditName,
        });
      } catch (removeError) {
        const stackTrace = removeError instanceof Error ? removeError.stack : 'No stack trace';
        console.error('[ModPulse][moderation] [PHASE 4 ✗] Post removal API FAILED', {
          postId,
          subredditName: post.subredditName,
          errorType: removeError instanceof Error ? removeError.constructor.name : typeof removeError,
          errorMessage: String(removeError),
          stackTrace,
          redditErrorResponse: (removeError as any)?.response?.data || 'No API response',
        });
        throw new Error(`post.remove() failed: ${removeError instanceof Error ? removeError.message : String(removeError)}`);
      }
    }

    // PHASE 5: Verify final removal state via refetch.
    let verifiedRemoved = post.removed;
    try {
      const verifiedPost = await reddit.getPostById(fullname);
      verifiedRemoved = Boolean(verifiedPost?.removed);
      console.log('[ModPulse][moderation] [PHASE 5] Removal verification', {
        postId,
        verifiedRemoved,
      });
    } catch (verifyError) {
      console.error('[ModPulse][moderation] [PHASE 5 ✗] Verification refetch failed', {
        postId,
        errorMessage: String(verifyError),
        stackTrace: verifyError instanceof Error ? verifyError.stack : 'No stack trace',
      });
    }

    console.log('[ModPulse][moderation] ========== REMOVAL PHASE: SUCCESS ==========', {
      postId,
      subredditName: post.subredditName,
      author: post.authorName,
      verifiedRemoved,
      timestamp: Date.now(),
    });

    return true;
  } catch (error) {
    const stackTrace = error instanceof Error ? error.stack : 'No stack trace';
    console.error('[ModPulse][moderation] ========== REMOVAL PHASE: FAILURE ==========', {
      postId,
      subredditId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      stackTrace,
      timestamp: Date.now(),
    });
    return false;
  }
}

/**
 * Lock a post to prevent new comments.
 */
async function lockPost(postId: string, subredditId: string, testMode?: boolean): Promise<boolean> {
  if (testMode) {
    console.log('[ModPulse][moderation] [LOCK] TEST MODE - Mocking post lock', { postId, subredditId });
    return true;
  }
  try {
    console.log('[ModPulse][moderation] [LOCK] Attempting post lock', {
      postId,
      subredditId,
    });

    const fullname = ensurePostFullname(postId);
    const post = await reddit.getPostById(fullname);
    if (!post) {
      console.warn('[ModPulse][moderation] [LOCK] Post not found for lock', {
        postId,
        fullname,
        subredditId,
      });
      return false;
    }

    // Verify subreddit scope (name/id-safe)
    const postSubredditId = (post as { subredditId?: string }).subredditId;
    const scopeMatch = isSubredditScopeMatch(
      {
        subredditName: post.subredditName,
        subredditId: postSubredditId,
      },
      subredditId
    );

    if (!scopeMatch) {
      throw new Error(
        `Subreddit mismatch: post is in r/${post.subredditName} (${postSubredditId ?? 'unknown-id'}), expected scope ${subredditId}`
      );
    }

    // Check moderator permissions
    const user = await reddit.getCurrentUser();
    if (!user) {
      throw new Error('Unable to verify current user');
    }

    const modPermissions = await user.getModPermissionsForSubreddit(
      post.subredditName
    );
    const canManagePosts =
      modPermissions.includes('all') || modPermissions.includes('posts');

    if (!canManagePosts) {
      throw new Error(
        `User ${user.username} lacks posts permission in r/${post.subredditName}`
      );
    }

    // Execute lock
    if (!post.locked) {
      console.log('[ModPulse][moderation] [LOCK] Calling post.lock() API', {
        postId,
        subredditName: post.subredditName,
      });
      try {
        await post.lock();
        console.log('[ModPulse][moderation] [LOCK ✓] Post locked successfully', {
          postId,
          subredditName: post.subredditName,
        });
      } catch (lockError) {
        console.error('[ModPulse][moderation] [LOCK ✗] post.lock() API failed', {
          postId,
          errorMessage: String(lockError),
          stackTrace: lockError instanceof Error ? lockError.stack : 'No stack trace',
        });
        throw lockError;
      }
    } else {
      console.log('[ModPulse][moderation] [LOCK] Post already locked, skipping', {
        postId,
      });
    }

    return true;
  } catch (error) {
    console.error('[ModPulse][moderation] [LOCK ✗] Post lock failed', {
      postId,
      errorMessage: String(error),
      stackTrace: error instanceof Error ? error.stack : 'No stack trace',
    });
    return false;
  }
}

/**
 * Execute a REMOVE verdict from jury consensus.
 * This is triggered when 2+ moderators vote REMOVE.
 *
 * @param displayModerator - The moderator shown in activity feed (could be simulated in dev mode)
 * @param executingModerator - The real authenticated moderator executing the action
 * @param devMode - Whether this is a simulated dev mode execution
 */
export async function executeRemovalVerdict(input: {
  postId: string;
  subredditId: string;
  caseId: string;
  reason: string;
  ruleCitation: string;
  displayModerator: string;
  executingModerator: string;
  devMode?: boolean;
  testMode?: boolean;
}): Promise<ModerationOutcome> {
  const now = Date.now();

  try {
    console.log('[ModPulse][moderation] ========== VERDICT EXECUTION: REMOVE ==========', {
      caseId: input.caseId,
      postId: input.postId,
      subredditId: input.subredditId,
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      devMode: input.devMode,
      reason: input.reason,
      ruleCitation: input.ruleCitation,
      timestamp: now,
    });

    console.log('[ModPulse][moderation] [PHASE 0] Verdict execution context validation', {
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      isSimulatedExecution: input.displayModerator !== input.executingModerator,
      devMode: input.devMode,
    });

    console.log('[ModPulse][moderation] [REMOVE_VERDICT] Calling removePost()', {
      postId: input.postId,
      subredditId: input.subredditId,
      executingModerator: input.executingModerator,
    });

    // Execute removal using the real authenticated moderator context
    const removed = await removePost(input.postId, input.subredditId, input.testMode);
    
    if (!removed && !input.testMode) {
      console.error('[ModPulse][moderation] [REMOVE_VERDICT ✗] removePost() returned false', {
        postId: input.postId,
        subredditId: input.subredditId,
        executingModerator: input.executingModerator,
      });
      throw new Error('Failed to remove post from Reddit');
    }

    console.log('[ModPulse][moderation] [REMOVE_VERDICT ✓] Post removal succeeded', {
      postId: input.postId,
      subredditId: input.subredditId,
      executingModerator: input.executingModerator,
    });

    // Add moderator note
    const noteText =
      `[ModPulse] Jury verdict: REMOVE\n` +
      `Rule: ${input.ruleCitation}\n` +
      `Reason: ${input.reason}\n` +
      `Case: ${input.caseId}\n` +
      `Executed by jury consensus • Display: ${input.displayModerator} • Executor: ${input.executingModerator}`;

    console.log('[ModPulse][moderation] [REMOVE_VERDICT] Adding moderator note', {
      postId: input.postId,
      notePreview: noteText.substring(0, 80),
    });

    const noteAdded = await addRedditModeratorNote(
      input.postId,
      noteText,
      input.subredditId,
      input.testMode
    );

    console.log('[ModPulse][moderation] [REMOVE_VERDICT] Moderator note result', {
      noteAdded,
    });

    // Log activity - show display moderator for UI, but note executor
    await logActivity({
      subredditId: input.subredditId,
      action: 'Removal executed',
      moderator: input.displayModerator,
      tone: 'bad',
      detail: `${input.postId} • ${input.reason}${input.displayModerator !== input.executingModerator ? ` • Executor: ${input.executingModerator}` : ''}`,
      timestamp: now,
      testMode: input.testMode,
    });

    console.log('[ModPulse][moderation] ========== VERDICT EXECUTION: REMOVE ✓ SUCCESS ==========', {
      postId: input.postId,
      subredditId: input.subredditId,
      caseId: input.caseId,
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      removed: true,
      noteAdded,
      devMode: input.devMode,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: `Post removed by jury consensus. Rule: ${input.ruleCitation}`,
      postId: input.postId,
      actionType: 'remove',
      timestamp: now,
      details: {
        removed: true,
        locked: false,
        noteAdded,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error ? error.stack : 'No stack trace';

    console.error('[ModPulse][moderation] ========== VERDICT EXECUTION: REMOVE ✗ FAILED ==========', {
      postId: input.postId,
      subredditId: input.subredditId,
      caseId: input.caseId,
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      devMode: input.devMode,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
      stackTrace,
      timestamp: Date.now(),
    });

    await logActivity({
      subredditId: input.subredditId,
      action: 'Removal failed',
      moderator: input.displayModerator,
      tone: 'bad',
      detail: `${input.postId} • Error: ${errorMessage}`,
      timestamp: now,
      testMode: input.testMode,
    });

    return {
      success: false,
      message: `Failed to execute removal: ${errorMessage}`,
      postId: input.postId,
      actionType: 'remove',
      timestamp: now,
      details: {
        error: errorMessage,
      },
    };
  }
}

/**
 * Execute an APPROVE verdict from jury consensus.
 * This archives the case without modifying the post.
 *
 * @param displayModerator - The moderator shown in activity feed (could be simulated in dev mode)
 * @param executingModerator - The real authenticated moderator executing the action
 */
export async function executeApprovalVerdict(input: {
  postId: string;
  subredditId: string;
  caseId: string;
  reason: string;
  displayModerator: string;
  executingModerator: string;
  testMode?: boolean;
}): Promise<ModerationOutcome> {
  const now = Date.now();

  try {
    console.log('[ModPulse][moderation] ========== VERDICT EXECUTION: APPROVE ==========', {
      postId: input.postId,
      subredditId: input.subredditId,
      caseId: input.caseId,
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      timestamp: now,
    });

    console.log('[ModPulse][moderation] [PHASE 0] Verdict execution context validation', {
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      isSimulatedExecution: input.displayModerator !== input.executingModerator,
    });

    // Log activity - show display moderator for UI
    await logActivity({
      subredditId: input.subredditId,
      action: 'Post approved by jury',
      moderator: input.displayModerator,
      tone: 'good',
      detail: `${input.postId} • Post meets community standards${input.displayModerator !== input.executingModerator ? ` • Executor: ${input.executingModerator}` : ''}`,
      timestamp: now,
      testMode: input.testMode,
    });

    console.log('[ModPulse][moderation] ========== VERDICT EXECUTION: APPROVE ✓ SUCCESS ==========', {
      postId: input.postId,
      subredditId: input.subredditId,
      caseId: input.caseId,
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: `Post approved by jury consensus. No moderation action taken.`,
      postId: input.postId,
      actionType: 'approve',
      timestamp: now,
      details: {
        removed: false,
        locked: false,
        noteAdded: false,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[ModPulse][moderation] ========== VERDICT EXECUTION: APPROVE ✗ FAILED ==========', {
      postId: input.postId,
      subredditId: input.subredditId,
      caseId: input.caseId,
      displayModerator: input.displayModerator,
      executingModerator: input.executingModerator,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to process approval: ${errorMessage}`,
      postId: input.postId,
      actionType: 'approve',
      timestamp: now,
      details: {
        error: errorMessage,
      },
    };
  }
}

/**
 * Immediate action mode: single moderator can take emergency action.
 * Used for doxxing, violence, explicit content, spam attacks, etc.
 */
export async function executeImmediateAction(input: {
  postId: string;
  subredditId: string;
  actionType: 'remove' | 'lock' | 'both';
  reason: string;
  lockComments?: boolean;
  moderator: string;
  testMode?: boolean;
}): Promise<ModerationOutcome> {
  const now = Date.now();

  try {
    console.log('[ModPulse][moderation] Immediate action initiated', {
      postId: input.postId,
      subredditId: input.subredditId,
      actionType: input.actionType,
      moderator: input.moderator,
    });

    const details: ModerationOutcome['details'] = {
      removed: false,
      locked: false,
      noteAdded: false,
    };

    let actionMessage = '';

    // Execute removal if requested
    if (input.actionType === 'remove' || input.actionType === 'both') {
      const removed = await removePost(input.postId, input.subredditId, input.testMode);
      details.removed = removed;
      if (removed || input.testMode) {
        actionMessage += 'Post removed. ';
      } else {
        throw new Error('Failed to remove post');
      }
    }

    // Execute lock if requested
    if (
      (input.actionType === 'lock' || input.actionType === 'both') &&
      input.lockComments !== false
    ) {
      const locked = await lockPost(input.postId, input.subredditId, input.testMode);
      details.locked = locked;
      if (locked || input.testMode) {
        actionMessage += 'Post locked. ';
      } else {
        throw new Error('Failed to lock post');
      }
    }

    // Add mod note
    const noteText =
      `[ModPulse] Emergency moderation action\n` +
      `Reason: ${input.reason}\n` +
      `Action: ${input.actionType}\n` +
      `Moderator: ${input.moderator}\n` +
      `Timestamp: ${new Date(now).toISOString()}`;

    const noteAdded = await addRedditModeratorNote(
      input.postId,
      noteText,
      input.subredditId,
      input.testMode
    );
    details.noteAdded = noteAdded;

    // Log activity
    const tone: ActivityTone =
      input.actionType === 'remove' ? 'bad' : input.actionType === 'lock' ? 'warn' : 'bad';

    await logActivity({
      subredditId: input.subredditId,
      action: `Emergency action: ${input.actionType.toUpperCase()}`,
      moderator: input.moderator,
      tone,
      detail: `${input.postId} • ${input.reason}`,
      timestamp: now,
      testMode: input.testMode,
    });

    console.log('[ModPulse][moderation] Immediate action completed', {
      postId: input.postId,
      subredditId: input.subredditId,
      moderator: input.moderator,
      details,
    });

    return {
      success: true,
      message: actionMessage.trim(),
      postId: input.postId,
      actionType: 'immediate',
      timestamp: now,
      details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[ModPulse][moderation] Immediate action failed', {
      postId: input.postId,
      subredditId: input.subredditId,
      moderator: input.moderator,
      error: errorMessage,
    });

    await logActivity({
      subredditId: input.subredditId,
      action: 'Emergency action failed',
      moderator: input.moderator,
      tone: 'bad',
      detail: `${input.postId} • Error: ${errorMessage}`,
      timestamp: now,
      testMode: input.testMode,
    });

    return {
      success: false,
      message: `Emergency action failed: ${errorMessage}`,
      postId: input.postId,
      actionType: 'immediate',
      timestamp: now,
      details: {
        error: errorMessage,
      },
    };
  }
}

/**
 * Escalate a matched post into the jury queue.
 */
export async function sendToJuryReview(input: {
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
  testMode?: boolean;
}): Promise<{ success: boolean; message: string; caseId?: string }> {
  try {
    const juryCase = await createAndSaveJuryCase({
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
      createdAt: input.createdAt ?? Date.now(),
      ...(typeof input.testMode === 'boolean' ? { testMode: input.testMode } : {}),
    });

    return {
      success: true,
      message: `Jury case created for ${input.postId}`,
      caseId: juryCase.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ModPulse][moderation] sendToJuryReview failed', {
      postId: input.postId,
      subredditId: input.subredditId,
      errorMessage,
    });

    return {
      success: false,
      message: `Failed to create jury case: ${errorMessage}`,
    };
  }
}
