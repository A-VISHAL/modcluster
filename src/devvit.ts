/**
 * Devvit Blocks registration for ModPulse AI.
 *
 * This plain TypeScript entry avoids JSX/TSX resolution edge cases while still
 * registering the custom post type for Reddit playtest.
 */

import { Devvit } from '@devvit/public-api';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

/**
 * Minimal custom post dashboard.
 *
 * The renderer uses only stable Devvit Blocks primitives so render errors do
 * not prevent the custom post from appearing or opening during playtest.
 */
Devvit.addCustomPostType({
  name: 'ModPulse',
  description: 'Visible ModPulse AI playtest dashboard.',
  height: 'regular',
  render: (context) =>
    Devvit.createElement(
      'vstack',
      {
        width: '100%',
        height: '100%',
        padding: 'medium',
        gap: 'medium',
        alignment: 'middle center',
      },
      Devvit.createElement(
        'text',
        {
          size: 'xxlarge',
          weight: 'bold',
          alignment: 'center',
          wrap: true,
        },
        'ModPulse AI'
      ),
      Devvit.createElement(
        'hstack',
        {
          width: '100%',
          gap: 'small',
          alignment: 'middle center',
        },
        Devvit.createElement(
          'text',
          {
            size: 'medium',
            alignment: 'center',
            wrap: true,
          },
          'Shift Handover System Active'
        )
      ),
      Devvit.createElement(
        'button',
        {
          onPress: () => {
            context.ui.showToast('ModPulse working');
          },
        },
        'Test ModPulse'
      )
    ),
});

export default Devvit;
