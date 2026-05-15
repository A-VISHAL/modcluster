import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createStarterRuleSet, loadRuleState, persistRuleState } from '../core/rules';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  console.log('App installed to subreddit: r/' + input.subreddit?.name);

  if (context.subredditId) {
    const state = await loadRuleState(context.subredditId);
    if (!state.active) {
      state.active = createStarterRuleSet(context.subredditId, context.username ?? 'system');
      await persistRuleState(context.subredditId, state);
    }
  }

  return c.json<TriggerResponse>(
    {
      status: 'success',
    },
    200
  );
});
