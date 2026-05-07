/**
 * Devvit Blocks registration for ModPulse AI.
 *
 * This plain TypeScript entry avoids JSX/TSX resolution edge cases while still
 * registering the custom post type for Reddit playtest.
 */

import { Devvit } from '@devvit/public-api';

console.log('[ModPulse] Devvit registration module loaded');

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addMenuItem({
  label: 'ModPulse Debug Ping',
  description: 'Confirms the Devvit registration layer is active.',
  location: 'post',
  forUserType: 'moderator',
  onPress: (_event, context) => {
    console.log('[ModPulse] debug menu item pressed');
    context.ui.showToast('ModPulse menu working');
  },
});

/**
 * Custom post type is now handled exclusively by Devvit Web entrypoint.
 * See devvit.json: post.entrypoints.default.entry = modpulse.html
 * This file now handles only Blocks-based features (menu items, etc.)
 */
console.log('[ModPulse] Blocks registration layer ready (Web custom post handled separately)');

export default Devvit;
