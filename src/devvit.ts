/**
 * Native Devvit registration layer for ModPulse AI.
 *
 * This module registers moderator menu actions and native forms so the shift
 * handover workflow appears directly inside Reddit's moderation UI. The form
 * handlers reuse the same Redis-backed storage helpers as the web routes.
 */

import { Devvit } from '@devvit/public-api';
import {
  createHandoverCard,
  fetchActiveHandover,
  saveHandover,
  type HandoverCard,
} from './core/handover';

// Enable the APIs required by the handover workflow.
Devvit.configure({
  redditAPI: true,
  redis: true,
});

type ViewHandoverFormData = {
  card: HandoverCard | null;
};

const summarizeHandoverCard = (card: HandoverCard) =>
  [
    `Moderator: ${card.author}`,
    `Timestamp: ${new Date(card.timestamp).toLocaleString()}`,
    '',
    'Active situations:',
    card.activeSituations || 'None',
    '',
    'Users to watch:',
    card.usersToWatch || 'None',
    '',
    'Priority posts:',
    card.priorityPosts || 'None',
    '',
    'Additional notes:',
    card.notes || 'None',
  ].join('\n');

const handoverFormKey = Devvit.createForm(
  {
    title: 'End Shift & Handover',
    description:
      'Use this form to leave a structured handover for the next moderator on duty.',
    acceptLabel: 'Save Handover',
    cancelLabel: 'Cancel',
    fields: [
      {
        type: 'paragraph',
        name: 'activeSituations',
        label: 'Active situations',
        helpText: 'Open issues, ongoing conversations, or anything still in progress.',
        required: true,
      },
      {
        type: 'paragraph',
        name: 'usersToWatch',
        label: 'Users to watch',
        helpText: 'Accounts that may need follow-up, attention, or moderation review.',
      },
      {
        type: 'paragraph',
        name: 'priorityPosts',
        label: 'Priority posts',
        helpText: 'Threads or posts that should be checked first by the incoming mod.',
      },
      {
        type: 'paragraph',
        name: 'notes',
        label: 'Additional notes',
        helpText: 'Anything else the next moderator should know.',
      },
    ],
  },
  async (event, context) => {
    const handover = createHandoverCard({
      author: context.username ?? 'moderator',
      activeSituations: event.values.activeSituations ?? '',
      usersToWatch: event.values.usersToWatch ?? '',
      priorityPosts: event.values.priorityPosts ?? '',
      notes: event.values.notes ?? '',
    });

    await saveHandover(context.subredditId, handover);
    context.ui.showToast('Handover saved successfully.');
  }
);

const viewHandoverFormKey = Devvit.createForm(
  (data) => {
    const card = (data as ViewHandoverFormData).card;

    if (!card) {
      return {
        title: 'Current Handover',
        description: 'No active handover has been saved for this subreddit yet.',
        acceptLabel: 'Close',
        cancelLabel: 'Back',
        fields: [],
      };
    }

    return {
      title: 'Current Handover',
      description: summarizeHandoverCard(card),
      acceptLabel: 'Close',
      cancelLabel: 'Back',
      fields: [
        {
          type: 'paragraph',
          name: 'activeSituations',
          label: 'Active situations',
          defaultValue: card.activeSituations,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'usersToWatch',
          label: 'Users to watch',
          defaultValue: card.usersToWatch,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'priorityPosts',
          label: 'Priority posts',
          defaultValue: card.priorityPosts,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'notes',
          label: 'Additional notes',
          defaultValue: card.notes,
          disabled: true,
        },
      ],
    };
  },
  async (_event, context) => {
    context.ui.showToast('Current handover reviewed.');
  }
);

/**
 * Moderator menu action for outgoing moderators.
 * Opens the native shift handover form.
 */
Devvit.addMenuItem({
  label: 'End Shift & Handover',
  description: 'Leave structured shift notes for the next moderator.',
  location: 'post',
  forUserType: 'moderator',
  onPress: (_event, context) => {
    context.ui.showForm(handoverFormKey);
  },
});

Devvit.addMenuItem({
  label: 'View Current Handover',
  description: 'Review the most recent handover notes for this subreddit.',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const card = await fetchActiveHandover(context.subredditId);
    context.ui.showForm(viewHandoverFormKey, { card });
  },
});
