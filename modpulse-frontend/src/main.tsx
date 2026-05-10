import { Devvit } from '@devvit/public-api';
import { App } from './App.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addMenuItem({
  label: 'ModPulse: Open Command Center',
  location: 'subreddit',
  onPress: async (_, context) => {
    context.ui.showToast('Opening ModPulse...');
  },
});

Devvit.addCustomPostType({
  name: 'ModPulse Command Center',
  height: 'tall',
  render: App,
});

export default Devvit;
