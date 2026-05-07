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
 * Minimal custom post dashboard.
 *
 * The renderer intentionally uses only vstack and text while debugging custom
 * post visibility. This rules out unsupported Blocks props as the failure mode.
 */
Devvit.addCustomPostType({
  name: 'ModPulse',
  render: () => {
    console.log('[ModPulse] custom post render executed');

    return Devvit.createElement(
      'vstack',
      undefined,
      Devvit.createElement('text', undefined, 'ModPulse Working')
    );
  },
});

console.log('[ModPulse] custom post type registered');

export default Devvit;
