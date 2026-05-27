/**
 * Devvit Blocks registration for ModCluster.
 *
 * This plain TypeScript entry avoids JSX/TSX resolution edge cases while still
 * registering the custom post type for Reddit playtest.
 */

import { Devvit } from '@devvit/public-api';

console.log('[ModCluster] Devvit registration module loaded');

Devvit.configure({
  redditAPI: true,
  redis: true,
});

/**
 * Custom post type is now handled exclusively by Devvit Web entrypoint.
 * See devvit.json for the custom post entrypoint.
 * This file now handles only Blocks-based features (menu items, etc.)
 */
console.log('[ModCluster] Blocks registration layer ready (Web custom post handled separately)');

export default Devvit;
