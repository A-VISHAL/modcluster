/**
 * Handover persistence and types using Devvit Redis client
 * Stores active handover and history lists per subreddit.
 */

import { redis } from '@devvit/redis';
import { logActivity } from './activity';

/**
 * Shift handover storage for ModPulse.
 *
 * The first MVP persists structured moderator handovers in Redis so incoming
 * moderators can quickly recover the current shift context.
 */

export type HandoverCard = {
  author: string;
  timestamp: number;
  activeSituations: string;
  usersToWatch: string;
  priorityPosts: string;
  notes: string;
};

export const handoverActiveKey = (subredditId: string, testMode?: boolean) => `${testMode ? 'test:' : ''}handover:${subredditId}:active`;
export const handoverHistoryKey = (subredditId: string, testMode?: boolean) => `${testMode ? 'test:' : ''}handover:${subredditId}:history`;

/** Normalize form values into the persisted card structure. */
export function createHandoverCard(input: {
  author: string;
  activeSituations: string;
  usersToWatch: string;
  priorityPosts: string;
  notes: string;
  timestamp?: number;
}): HandoverCard {
  return {
    author: input.author,
    timestamp: input.timestamp ?? Date.now(),
    activeSituations: input.activeSituations,
    usersToWatch: input.usersToWatch,
    priorityPosts: input.priorityPosts,
    notes: input.notes,
  };
}

/** Save the active card and append it to history. */
export async function saveHandover(subredditId: string, handover: HandoverCard, testMode?: boolean): Promise<void> {
  const payload = JSON.stringify(handover);
  await redis.set(handoverActiveKey(subredditId, testMode), payload);
  await redis.zAdd(handoverHistoryKey(subredditId, testMode), {
    score: handover.timestamp,
    member: payload,
  });

  await logActivity({
    subredditId,
    action: 'Shift handover submitted',
    moderator: handover.author,
    tone: 'soft',
    detail: handover.notes || handover.activeSituations || 'Shift handover recorded.',
    timestamp: handover.timestamp,
  });

  const historyCount = await redis.zCard(handoverHistoryKey(subredditId, testMode));
  if (historyCount > 100) {
    await redis.zRemRangeByRank(handoverHistoryKey(subredditId, testMode), 0, historyCount - 101);
  }
}

/** Fetch the current active handover card. */
export async function fetchActiveHandover(subredditId: string, testMode?: boolean): Promise<HandoverCard | null> {
  const data = await redis.get(handoverActiveKey(subredditId, testMode));
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as HandoverCard;
  } catch (error) {
    console.error('Failed to parse active handover', error);
    return null;
  }
}

/** Fetch recent handover history entries, most recent first. */
export async function fetchHandoverHistory(subredditId: string, limit = 50, testMode?: boolean): Promise<HandoverCard[]> {
  const raw = await redis.zRange(handoverHistoryKey(subredditId, testMode), 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });

  return raw
    .map((value: { member: string; score: number }) => {
      try {
        return JSON.parse(value.member) as HandoverCard;
      } catch {
        return null;
      }
    })
    .filter((value: HandoverCard | null): value is HandoverCard => value !== null);
}

/** Escape user content for safe HTML display. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

/** Render a compact card-style HTML block for the current handover view. */
export function renderHandoverCard(card: HandoverCard): string {
  const timestamp = new Date(card.timestamp).toLocaleString();

  return `
    <section style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:16px 18px;box-shadow:0 10px 24px rgba(15,23,42,0.06);margin:16px 0;">
      <header style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Moderator</div>
          <div style="font-size:18px;font-weight:700;color:#0f172a;">${escapeHtml(card.author)}</div>
        </div>
        <div style="font-size:12px;color:#64748b;text-align:right;">${escapeHtml(timestamp)}</div>
      </header>
      <div style="display:grid;gap:12px;">
        <div><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Active situations</div><div style="white-space:pre-wrap;color:#0f172a;">${escapeHtml(card.activeSituations || 'None')}</div></div>
        <div><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Users to watch</div><div style="white-space:pre-wrap;color:#0f172a;">${escapeHtml(card.usersToWatch || 'None')}</div></div>
        <div><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Priority posts</div><div style="white-space:pre-wrap;color:#0f172a;">${escapeHtml(card.priorityPosts || 'None')}</div></div>
        <div><div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Notes</div><div style="white-space:pre-wrap;color:#0f172a;">${escapeHtml(card.notes || 'None')}</div></div>
      </div>
    </section>
  `;
}
