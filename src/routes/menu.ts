import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import type { FormField } from '@devvit/shared-types/shared/form.js';
import { context, reddit } from '@devvit/web/server';
import { fetchActiveHandover, fetchHandoverHistory } from '../core/handover';

export const menu = new Hono();

const buildNukeFields = (targetId: string): FormField[] => [
  {
    name: 'targetId',
    label: 'Target ID',
    type: 'string',
    helpText: 'Auto-filled from the selected item.',
    required: true,
    defaultValue: targetId,
  },
  {
    name: 'remove',
    label: 'Remove comments',
    type: 'boolean',
    defaultValue: true,
  },
  {
    name: 'lock',
    label: 'Lock comments',
    type: 'boolean',
    defaultValue: false,
  },
  {
    name: 'skipDistinguished',
    label: 'Skip distinguished comments',
    type: 'boolean',
    defaultValue: false,
  },
];

const buildNukeForm = (title: string, targetId: string) => ({
  fields: buildNukeFields(targetId),
  title,
  acceptLabel: 'Mop',
  cancelLabel: 'Cancel',
});

menu.post('/mop-comment', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  console.log('request', request.targetId);
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mopComment',
        form: buildNukeForm('Mop Comments', request.targetId),
      },
    },
    200
  );
});

menu.post('/mop-post', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mopPost',
        form: buildNukeForm('Mop Post Comments', request.targetId),
      },
    },
    200
  );
});

// Menu: End Shift & Handover -> show the handover submission form
menu.post('/handover-end', async (c) => {
  await c.req.json<MenuItemRequest>();

  const handoverFields: FormField[] = [
    { name: 'activeSituations', label: 'Active Situations', type: 'string', helpText: 'Describe any ongoing issues' },
    { name: 'usersToWatch', label: 'Users to Watch', type: 'string', helpText: 'Users to monitor' },
    { name: 'priorityPosts', label: 'Priority Posts', type: 'string', helpText: 'Post IDs or links' },
    { name: 'notes', label: 'Additional Notes', type: 'string', helpText: 'Anything else moderators should know' },
  ];

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'handoverForm',
        form: {
          fields: handoverFields,
          title: 'End Shift & Handover',
          acceptLabel: 'Submit Handover',
          cancelLabel: 'Cancel',
        },
      },
    },
    200
  );
});

// Menu: View Current Handover -> fetch active handover and show as read-only form
menu.post('/handover-view', async (c) => {
  await c.req.json<MenuItemRequest>();
  const subId = context.subredditId || 'global';
  const active = await fetchActiveHandover(subId);
  const history = await fetchHandoverHistory(subId, 20);

  if (!active) {
    return c.json<UiResponse>({ showToast: 'No active handover for this subreddit.' }, 200);
  }

  const title = 'Current Handover';

  const handoverFields: FormField[] = [
    { name: 'activeSituations', label: 'Active Situations', type: 'string', defaultValue: active.activeSituations, disabled: true },
    { name: 'usersToWatch', label: 'Users to Watch', type: 'string', defaultValue: active.usersToWatch, disabled: true },
    { name: 'priorityPosts', label: 'Priority Posts', type: 'string', defaultValue: active.priorityPosts, disabled: true },
    { name: 'notes', label: 'Additional Notes', type: 'string', defaultValue: active.notes, disabled: true },
  ];

  const historySummary = history
    .map((handover) => `${handover.author} @ ${new Date(handover.timestamp).toLocaleString()}`)
    .join('\n');

  handoverFields.push({
    name: 'history',
    label: 'Recent Handover History',
    type: 'string',
    defaultValue: historySummary,
    helpText: 'Most recent handovers (author @ time)',
  });

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'viewHandover',
        form: {
          fields: handoverFields,
          title,
          description: `Moderator: ${active.author}\nTimestamp: ${new Date(active.timestamp).toLocaleString()}`,
          acceptLabel: 'Close',
          cancelLabel: 'Back',
        },
      },
    },
    200
  );
});

menu.post('/modcluster-create', async (c) => {
  await c.req.json<MenuItemRequest>();

  try {
    const created = await reddit.submitCustomPost({
      title: `ModCluster (${new Date().toLocaleString()})`,
      entry: 'default',
    });

    return c.json<UiResponse>(
      {
        showToast: `Created ModCluster post: ${created.id}`,
      },
      200
    );
  } catch (err) {
    console.error('Failed to create ModCluster custom post', err);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create ModCluster post. Check logs for details.',
      },
      200
    );
  }
});
