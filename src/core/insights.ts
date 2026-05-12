/**
 * Operational Insight Engine
 *
 * Deterministic, rules-based summarization computed from Redis-backed
 * moderation signals, jury cases, and recent activity. No external AI.
 */

import type { ActivityEvent } from './activity';
import type { JuryCase } from './jury';

export type Insight = {
  headline: string;
  details: string[];
};

export type SystemLoad = {
  level: 'calm' | 'low' | 'moderate' | 'high';
  score: number;
};

type Input = {
  now: number;
  communityHealth: {
    reportsToday: number;
    toxicityAlerts: number;
    queueBacklog: number;
    moderatorWorkload: number;
    burnoutRisk: 'low' | 'medium' | 'high';
    unresolvedReports: number;
    activeJuryCases: number;
    moderationActions24h: number;
    removalsToday: number;
    escalationFrequency: number;
    avgResponseMinutes: number | null;
    metricsSource: 'redis' | 'reddit';
  };
  activity: ActivityEvent[];
  pendingCases: JuryCase[];
  resolvedCases: JuryCase[];
};

export const generateInsights = (input: Input): Insight => {
  const { communityHealth: h, activity, pendingCases } = input;

  const details: string[] = [];

  // Rule: Spam/Removal patterns
  if ((h.removalsToday ?? 0) >= 3) {
    details.push('Removal activity elevated: multiple removals recorded today.');
  }

  // detect spam-like jury cases (simple pattern: rule text contains spam)
  const spamCases = pendingCases.filter((c) => (c.ruleCitation || '').toLowerCase().includes('spam') || (c.reason || '').toLowerCase().includes('spam'));
  if (spamCases.length >= 2) {
    details.push('Possible spam/repost patterns detected across flagged cases.');
  }

  // Moderator overload
  const backlogThreshold = 10;
  if (h.burnoutRisk === 'high' || (h.queueBacklog ?? 0) > backlogThreshold) {
    details.push('Moderator workload pressure is elevated; pending review volume increasing.');
  } else if (h.burnoutRisk === 'medium') {
    details.push('Moderator workload moderate — monitor queue pressure.');
  }

  // Toxicity escalation
  if ((h.toxicityAlerts ?? 0) >= 5) {
    details.push('Escalating civility concerns detected in recent activity.');
  }

  // Active jury pressure
  const juryThreshold = 3;
  if ((h.activeJuryCases ?? 0) >= juryThreshold) {
    details.push(`Multiple cases (${h.activeJuryCases}) currently awaiting collaborative verdicts.`);
  }

  // High activity window: many events in last hour
  const oneHour = 60 * 60 * 1000;
  const recentWindow = activity.filter((a) => a.timestamp >= input.now - oneHour);
  if (recentWindow.length >= 12) {
    details.push('High moderation activity detected during the last hour.');
  } else if (recentWindow.length >= 5) {
    details.push('Increased moderation events observed in the recent window.');
  }

  // Healthy state
  const lowWorkload = (h.queueBacklog ?? 0) <= 2 && (h.toxicityAlerts ?? 0) <= 1 && (h.activeJuryCases ?? 0) <= 1;
  if (details.length === 0 && lowWorkload) {
    const headline = 'Community operating normally.';
    const healthyDetails = [
      'No active jury escalations',
      'Low moderation workload',
      'Minimal queue pressure detected',
    ];
    return { headline, details: healthyDetails };
  }

  // Build headline from strongest signals
  let headline = 'Operational update';

  if ((h.removalsToday ?? 0) >= 3 || spamCases.length >= 2) {
    headline = 'Possible spam/removal activity increasing.';
  } else if (h.burnoutRisk === 'high' || (h.queueBacklog ?? 0) > backlogThreshold) {
    headline = 'Moderation pressure elevated across current queue.';
  } else if ((h.toxicityAlerts ?? 0) >= 5) {
    headline = 'Civility concerns escalating in recent reports.';
  } else if (recentWindow.length >= 12) {
    headline = 'High moderation activity in the current operational window.';
  } else if (details.length > 0) {
    headline = 'Operational signals detected — review recommended.';
  }

  // Limit details to 3 concise bullets
  const limited = details.slice(0, 3).map((d) => d.replace(/\s+\s+/g, ' ').trim());

  return { headline, details: limited };
};

export function computeSystemLoad(data: {
  activeJuryCases: number;
  queueBacklog: number;
  reportsToday: number;
  toxicityAlerts: number;
}): SystemLoad {
  const {
    activeJuryCases = 0,
    queueBacklog = 0,
    reportsToday = 0,
    toxicityAlerts = 0,
  } = data;

  const score =
    activeJuryCases * 3 + queueBacklog * 2 + reportsToday * 1 + toxicityAlerts * 2;

  let level: 'calm' | 'low' | 'moderate' | 'high' = 'calm';

  if (score === 0) level = 'calm';
  else if (score <= 5) level = 'low';
  else if (score <= 10) level = 'moderate';
  else level = 'high';

  return {
    level,
    score,
  };
}


