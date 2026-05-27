import { redis } from '@devvit/web/server';
import YAML from 'yaml';

export const RULE_ACTIONS = [
  'remove_post',
  'filter_review_queue',
  'send_to_jury_review',
  'add_mod_note',
  'lock_thread',
  'temporary_mute',
  'temporary_ban',
  'notify_moderators',
  'mark_high_risk',
] as const;

export type RuleAction = (typeof RULE_ACTIONS)[number];
export type RuleSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ContentKind = 'post' | 'comment';

export type RuleConditions = {
  min_account_age_days?: number;
  max_account_age_days?: number;
  min_combined_karma?: number;
  max_combined_karma?: number;
  max_posts_per_hour?: number;
  max_comments_per_hour?: number;
  repeated_links_threshold?: number;
  repeated_domains_threshold?: number;
  suspicious_domains?: string[];
  suspicious_phrases?: string[];
  suspicious_keywords?: string[];
  spam_phrases?: string[];
  toxicity_keywords?: string[];
  cross_subreddit_activity_threshold?: number;
  rapid_post_burst_threshold?: number;
  ban_evasion_indicators?: boolean;
  new_account_wave_threshold?: number;
  min_toxicity_score?: number;
};

export type RuleDefinition = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: RuleSeverity;
  conditions: RuleConditions;
  actions: RuleAction[];
  createdAt: number;
  updatedAt: number;
  source: 'template' | 'custom';
};

export type RuleTemplate = {
  id: string;
  label: string;
  description: string;
  template: RuleDefinition;
};

export type RuleSet = {
  subredditId: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  rules: RuleDefinition[];
};

export type ContentSample = {
  id: string;
  kind: ContentKind;
  author: string;
  title: string;
  body: string;
  domain: string;
  subredditId: string;
  createdAt: number;
  accountAgeDays: number | null;
  combinedKarma: number | null;
  postFrequencyPerHour: number | null;
  commentFrequencyPerHour: number | null;
  repeatedLinksCount: number | null;
  repeatedDomainsCount: number | null;
  suspiciousDomains: string[];
  suspiciousKeywords: string[];
  toxicityScore: number | null;
  crossSubredditActivityCount: number | null;
  rapidPostBurstCount: number | null;
  banEvasionIndicators: boolean;
  newAccountWaveCount: number | null;
  metadata: Record<string, unknown>;
};

export type TriggeredCondition = {
  key: string;
  label: string;
  detail: string;
};

export type RuleMatch = {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  actions: RuleAction[];
  triggeredConditions: TriggeredCondition[];
  confidence: 'low' | 'medium' | 'high';
  riskScore: number;
};

export type RuleDecision = {
  sample: ContentSample;
  status: 'allowed' | 'escalated' | 'removed';
  topAction: RuleAction | 'allow';
  confidence: 'low' | 'medium' | 'high';
  riskScore: number;
  matchedRules: RuleMatch[];
  conditions: string[];
  explanation: string;
  color: 'green' | 'yellow' | 'red';
};

export type RuleAnalysis = {
  warnings: string[];
  duplicates: string[];
  conflicts: string[];
  shadowed: string[];
  broadRemovals: string[];
  dangerous: string[];
  confirmationRequired: boolean;
  overallRisk: 'low' | 'medium' | 'high';
};

export type RuleAnalytics = {
  deployCount: number;
  rollbackCount: number;
  testRuns: number;
  lastDeployAt: number | null;
  lastRollbackAt: number | null;
  ruleHitFrequency: Record<string, number>;
  falsePositiveCandidates: string[];
  repeatedOffenders: Array<{ author: string; hits: number; lastSeen: number }>;
  queuePressure: number;
  lastUpdatedAt: number | null;
};

export type ModerationEvent = {
  id: string;
  subredditId: string;
  timestamp: number;
  type: 'test' | 'deploy' | 'rollback' | 'hit' | 'flagged';
  ruleId?: string;
  ruleName?: string;
  sampleId?: string;
  author?: string;
  action?: string;
  riskScore?: number;
  details?: string;
};

export type FlaggedUser = {
  author: string;
  hits: number;
  lastSeen: number;
  reasons: string[];
  riskScore: number;
};

export type RuleState = {
  active: RuleSet | null;
  history: Array<{ version: number; updatedAt: number; updatedBy: string; note: string; yaml: string }>;
  analytics: RuleAnalytics;
  flaggedUsers: FlaggedUser[];
  events: ModerationEvent[];
};

export const RULES_ACTIVE_KEY = (subredditId: string) => `rules:${subredditId}`;
export const RULES_HISTORY_KEY = (subredditId: string) => `rules:${subredditId}:history`;
export const RULES_ANALYTICS_KEY = (subredditId: string) => `rules:${subredditId}:analytics`;
export const MODERATION_EVENTS_KEY = (subredditId: string) => `moderation:${subredditId}:events`;
export const FLAGGED_USERS_KEY = (subredditId: string) => `flagged:${subredditId}:users`;

const DEFAULT_ANALYTICS: RuleAnalytics = {
  deployCount: 0,
  rollbackCount: 0,
  testRuns: 0,
  lastDeployAt: null,
  lastRollbackAt: null,
  ruleHitFrequency: {},
  falsePositiveCandidates: [],
  repeatedOffenders: [],
  queuePressure: 0,
  lastUpdatedAt: null,
};

const ACTION_WEIGHT: Record<RuleAction | 'allow', number> = {
  allow: 0,
  mark_high_risk: 10,
  add_mod_note: 20,
  notify_moderators: 35,
  filter_review_queue: 50,
  send_to_jury_review: 65,
  lock_thread: 70,
  temporary_mute: 78,
  remove_post: 90,
  temporary_ban: 100,
};

const SEVERITY_WEIGHT: Record<RuleSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const normalizeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rule';

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const normalizeStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['true', 'yes', '1', 'on'].includes(value.toLowerCase())) return true;
    if (['false', 'no', '0', 'off'].includes(value.toLowerCase())) return false;
  }
  return undefined;
};

const uniqueSorted = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

export const createRuleId = (name: string) => normalizeId(name);

export const createEmptyRuleState = (): RuleState => ({
  active: null,
  history: [],
  analytics: structuredClone(DEFAULT_ANALYTICS),
  flaggedUsers: [],
  events: [],
});

export const createRuleTemplateCatalog = (): RuleTemplate[] => {
  const now = Date.now();

  const build = (
    id: string,
    label: string,
    description: string,
    rule: Omit<RuleDefinition, 'id' | 'createdAt' | 'updatedAt' | 'source'>
  ): RuleTemplate => ({
    id,
    label,
    description,
    template: {
      ...rule,
      id,
      createdAt: now,
      updatedAt: now,
      source: 'template',
    },
  });

  return [
    build('anti-spam', 'Anti-spam', 'Low-trust account + repeated link filtering.', {
      name: 'anti-spam',
      description: 'Catch repeated promo posts, suspicious domains, and low-trust links.',
      enabled: true,
      severity: 'high',
      conditions: {
        min_account_age_days: 7,
        max_combined_karma: 50,
        repeated_links_threshold: 3,
        suspicious_domains: ['bit.ly', 'shadypromo.com', 'tinyurl.com'],
        suspicious_keywords: ['free coins', 'promo code', 'click here'],
      },
      actions: ['remove_post', 'send_to_jury_review', 'add_mod_note'],
    }),
    build('repost-detection', 'Repost detection', 'Repeated links and burst posting.', {
      name: 'repost-detection',
      description: 'Detect content that repeats the same links or hits the queue too quickly.',
      enabled: true,
      severity: 'medium',
      conditions: {
        repeated_links_threshold: 2,
        repeated_domains_threshold: 2,
        rapid_post_burst_threshold: 4,
      },
      actions: ['filter_review_queue', 'notify_moderators'],
    }),
    build('self-promo-abuse', 'Self-promotion abuse', 'External link heavy posts from new accounts.', {
      name: 'self-promo-abuse',
      description: 'Escalate repeated external linking and promo-style language.',
      enabled: true,
      severity: 'high',
      conditions: {
        min_account_age_days: 14,
        max_combined_karma: 100,
        repeated_domains_threshold: 2,
        suspicious_keywords: ['subscribe', 'follow my', 'check my channel'],
      },
      actions: ['filter_review_queue', 'add_mod_note', 'notify_moderators'],
    }),
    build('low-karma-filter', 'Low-karma filter', 'Reduce noise from brand new accounts.', {
      name: 'low-karma-filter',
      description: 'Filter low-trust accounts into review before they hit the feed.',
      enabled: true,
      severity: 'medium',
      conditions: {
        min_account_age_days: 3,
        max_combined_karma: 25,
        new_account_wave_threshold: 3,
      },
      actions: ['filter_review_queue', 'mark_high_risk'],
    }),
    build('raid-detection', 'Raid detection', 'Cross-subreddit bursts and coordinated movement.', {
      name: 'raid-detection',
      description: 'Surface coordinated spikes from external communities.',
      enabled: true,
      severity: 'critical',
      conditions: {
        cross_subreddit_activity_threshold: 4,
        rapid_post_burst_threshold: 6,
        new_account_wave_threshold: 5,
      },
      actions: ['lock_thread', 'send_to_jury_review', 'notify_moderators'],
    }),
    build('harassment-escalation', 'Harassment escalation', 'Toxic language and civility hits.', {
      name: 'harassment-escalation',
      description: 'Escalate toxicity signals for mod review or removal.',
      enabled: true,
      severity: 'high',
      conditions: {
        toxicity_keywords: ['slur', 'kill yourself', 'idiot', 'garbage human'],
        min_toxicity_score: 0.7,
      },
      actions: ['remove_post', 'temporary_mute', 'notify_moderators'],
    }),
    build('scam-links', 'Scam links', 'Suspicious domains and shortened links.', {
      name: 'scam-links',
      description: 'Remove known scam domains and alert moderators.',
      enabled: true,
      severity: 'critical',
      conditions: {
        suspicious_domains: ['bit.ly', 'tinyurl.com', 'shadypromo.com', 'grab-free-reward.com'],
        repeated_domains_threshold: 2,
      },
      actions: ['remove_post', 'temporary_ban', 'notify_moderators'],
    }),
    build('political-toxicity', 'Political toxicity escalation', 'Polarizing or abusive political content.', {
      name: 'political-toxicity',
      description: 'Escalate inflammatory political rhetoric for review.',
      enabled: false,
      severity: 'medium',
      conditions: {
        toxicity_keywords: ['traitor', 'genocide', 'sheeple', 'hang them'],
        min_toxicity_score: 0.55,
      },
      actions: ['send_to_jury_review', 'add_mod_note'],
    }),
    build('nsfw-bait', 'NSFW bait filtering', 'Adult bait and click-through hooks.', {
      name: 'nsfw-bait',
      description: 'Catch bait posts that lean on NSFW framing or attention traps.',
      enabled: false,
      severity: 'medium',
      conditions: {
        suspicious_keywords: ['onlyfans', 'nsfw', '18+', 'leak'],
        repeated_links_threshold: 2,
      },
      actions: ['filter_review_queue', 'mark_high_risk', 'notify_moderators'],
    }),
    build('external-linking', 'Excessive external linking', 'High volume of outbound domains.', {
      name: 'external-linking',
      description: 'Flag posts that keep pushing users off Reddit.',
      enabled: true,
      severity: 'medium',
      conditions: {
        repeated_domains_threshold: 3,
        max_posts_per_hour: 5,
      },
      actions: ['filter_review_queue', 'add_mod_note'],
    }),
  ];
};

export const normalizeRule = (input: Partial<RuleDefinition>, fallbackIndex = 0): RuleDefinition => {
  const now = Date.now();
  const name = String(input.name ?? `rule-${fallbackIndex + 1}`).trim() || `rule-${fallbackIndex + 1}`;
  const actions = uniqueSorted((input.actions ?? []).map((value) => String(value) as RuleAction)).filter((action) => RULE_ACTIONS.includes(action as RuleAction)) as RuleAction[];

  return {
    id: String(input.id ?? createRuleId(name)),
    name,
    description: String(input.description ?? '').trim(),
    enabled: Boolean(input.enabled),
    severity: input.severity ?? 'medium',
    conditions: normalizeConditions(input.conditions ?? {}),
    actions: actions.length ? actions : ['filter_review_queue'],
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : now,
    source: input.source ?? 'custom',
  };
};

export const normalizeConditions = (input: Partial<RuleConditions>): RuleConditions => {
  const output: RuleConditions = {};

  const assignNumber = (key: keyof RuleConditions, value: unknown) => {
    const parsed = toNumber(value);
    if (parsed !== undefined) {
      output[key] = parsed as never;
    }
  };

  const assignStringList = (key: keyof RuleConditions, value: unknown) => {
    const parsed = uniqueSorted(normalizeStrings(value));
    if (parsed.length) {
      output[key] = parsed as never;
    }
  };

  assignNumber('min_account_age_days', input.min_account_age_days);
  assignNumber('max_account_age_days', input.max_account_age_days);
  assignNumber('min_combined_karma', input.min_combined_karma);
  assignNumber('max_combined_karma', input.max_combined_karma);
  assignNumber('max_posts_per_hour', input.max_posts_per_hour);
  assignNumber('max_comments_per_hour', input.max_comments_per_hour);
  assignNumber('repeated_links_threshold', input.repeated_links_threshold);
  assignNumber('repeated_domains_threshold', input.repeated_domains_threshold);
  assignStringList('suspicious_domains', input.suspicious_domains);
  assignStringList('suspicious_phrases', input.suspicious_phrases);
  assignStringList('suspicious_keywords', input.suspicious_keywords);
  assignStringList('spam_phrases', input.spam_phrases);
  assignStringList('toxicity_keywords', input.toxicity_keywords);
  assignNumber('cross_subreddit_activity_threshold', input.cross_subreddit_activity_threshold);
  assignNumber('rapid_post_burst_threshold', input.rapid_post_burst_threshold);

  const banEvasion = parseBoolean(input.ban_evasion_indicators);
  if (banEvasion !== undefined) {
    output.ban_evasion_indicators = banEvasion;
  }

  assignNumber('new_account_wave_threshold', input.new_account_wave_threshold);
  assignNumber('min_toxicity_score', input.min_toxicity_score);

  return output;
};

export const normalizeRuleSet = (input: unknown, subredditId: string, updatedBy = 'system'): RuleSet => {
  const now = Date.now();
  const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const sourceRules = Array.isArray(raw.rules)
    ? raw.rules
    : raw.rule && typeof raw.rule === 'object'
      ? [raw.rule]
      : [];

  const rules = sourceRules.map((entry, index) => normalizeRule(entry as Partial<RuleDefinition>, index));

  return {
    subredditId,
    version: toNumber(raw.version) ?? 1,
    updatedAt: toNumber(raw.updatedAt) ?? now,
    updatedBy: String(raw.updatedBy ?? updatedBy),
    rules,
  };
};

export const parseRuleSetYaml = (yamlText: string, subredditId: string, updatedBy = 'system'): RuleSet => {
  const parsed = YAML.parse(yamlText);
  return normalizeRuleSet(parsed, subredditId, updatedBy);
};

export const serializeRuleSetYaml = (ruleSet: RuleSet): string =>
  YAML.stringify(
    {
      subredditId: ruleSet.subredditId,
      version: ruleSet.version,
      updatedAt: ruleSet.updatedAt,
      updatedBy: ruleSet.updatedBy,
      rules: ruleSet.rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        severity: rule.severity,
        conditions: compactConditions(rule.conditions),
        actions: rule.actions,
      })),
    },
    { indent: 2 }
  );

export const compactConditions = (conditions: RuleConditions): Record<string, unknown> => {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && !value.length) continue;
    output[key] = value;
  }

  return output;
};

export const createStarterRuleSet = (subredditId: string, updatedBy: string): RuleSet => ({
  subredditId,
  version: 1,
  updatedAt: Date.now(),
  updatedBy,
  rules: [],
});

export const ruleSignature = (rule: RuleDefinition): string =>
  JSON.stringify({
    enabled: rule.enabled,
    severity: rule.severity,
    actions: [...rule.actions].sort(),
    conditions: compactConditions(rule.conditions),
  });

const countSpecificity = (conditions: RuleConditions): number =>
  Object.values(conditions).reduce<number>((score, value) => {
    if (value === undefined || value === null) return score;
    if (Array.isArray(value)) return value.length ? score + 1 : score;
    return score + 1;
  }, 0);

const thresholdRisk = (rule: RuleDefinition): number => {
  const specificity = countSpecificity(rule.conditions);
  const actions = Math.max(...rule.actions.map((action) => ACTION_WEIGHT[action]), 0);
  const severity = SEVERITY_WEIGHT[rule.severity];
  return specificity * 10 + severity * 15 + actions;
};

const isRemovalRule = (rule: RuleDefinition): boolean =>
  rule.actions.includes('remove_post') || rule.actions.includes('temporary_ban');

const isBroadRemoval = (rule: RuleDefinition): boolean => {
  if (!isRemovalRule(rule)) return false;

  const conditions = rule.conditions;
  const specificity = countSpecificity(conditions);
  const hasStrongSignals =
    Boolean(conditions.suspicious_domains?.length) ||
    Boolean(conditions.suspicious_keywords?.length) ||
    Boolean(conditions.toxicity_keywords?.length) ||
    Boolean(conditions.spam_phrases?.length);

  return specificity <= 2 && !hasStrongSignals;
};

const sharedConditionCount = (left: RuleDefinition, right: RuleDefinition): number => {
  const leftConditions = compactConditions(left.conditions);
  const rightConditions = compactConditions(right.conditions);
  let shared = 0;

  for (const key of Object.keys(leftConditions)) {
    if (!(key in rightConditions)) continue;
    const leftValue = leftConditions[key];
    const rightValue = rightConditions[key];

    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      const overlap = leftValue.some((value) => rightValue.includes(value));
      if (overlap) shared += 1;
      continue;
    }

    if (leftValue === rightValue) {
      shared += 1;
      continue;
    }

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      shared += 1;
    }
  }

  return shared;
};

const isShadowingPair = (broad: RuleDefinition, narrow: RuleDefinition): boolean => {
  if (!broad.enabled || !narrow.enabled) return false;
  if (ruleSignature(broad) === ruleSignature(narrow)) return false;
  if (broad.actions.join(',') !== narrow.actions.join(',')) return false;

  const broadSpecificity = countSpecificity(broad.conditions);
  const narrowSpecificity = countSpecificity(narrow.conditions);
  const overlap = sharedConditionCount(broad, narrow);

  return broadSpecificity <= narrowSpecificity && overlap >= Math.min(2, narrowSpecificity);
};

export const analyzeRuleSet = (ruleSet: RuleSet): RuleAnalysis => {
  const warnings: string[] = [];
  const duplicates: string[] = [];
  const conflicts: string[] = [];
  const shadowed: string[] = [];
  const broadRemovals: string[] = [];
  const dangerous: string[] = [];

  const seenNames = new Map<string, string>();
  const seenSignatures = new Map<string, string>();

  for (const rule of ruleSet.rules) {
    const lowerName = rule.name.toLowerCase();
    const signature = ruleSignature(rule);

    if (seenNames.has(lowerName)) {
      duplicates.push(`Rule "${rule.name}" duplicates "${seenNames.get(lowerName)}" by name.`);
    } else {
      seenNames.set(lowerName, rule.name);
    }

    if (seenSignatures.has(signature)) {
      duplicates.push(`Rule "${rule.name}" duplicates "${seenSignatures.get(signature)}" by behavior.`);
    } else {
      seenSignatures.set(signature, rule.name);
    }

    if (isBroadRemoval(rule)) {
      broadRemovals.push(`Rule "${rule.name}" can remove or ban with only broad signals. Add a stronger keyword, domain, or trust threshold.`);
    }

    if (isRemovalRule(rule) && (rule.severity === 'high' || rule.severity === 'critical')) {
      dangerous.push(`Rule "${rule.name}" can remove or ban automatically.`);
    }
  }

  for (let index = 0; index < ruleSet.rules.length; index += 1) {
    const left = ruleSet.rules[index];
    if (!left) continue;

    for (let otherIndex = index + 1; otherIndex < ruleSet.rules.length; otherIndex += 1) {
      const right = ruleSet.rules[otherIndex];
      if (!right) continue;

      if (ruleSignature(left) === ruleSignature(right)) {
        continue;
      }

      if (left.name.toLowerCase() === right.name.toLowerCase()) {
        conflicts.push(`Rules "${left.name}" and "${right.name}" share the same name but differ in behavior.`);
      }

      const sameConditions = sharedConditionCount(left, right) >= Math.min(countSpecificity(left.conditions), countSpecificity(right.conditions));
      if (sameConditions && left.actions.join(',') !== right.actions.join(',')) {
        conflicts.push(`Rules "${left.name}" and "${right.name}" target similar conditions but prescribe different actions.`);
      }

      if (isShadowingPair(left, right)) {
        shadowed.push(`Rule "${right.name}" may never trigger because "${left.name}" already matches the same pattern first.`);
      }

      if (isShadowingPair(right, left)) {
        shadowed.push(`Rule "${left.name}" may never trigger because "${right.name}" already matches the same pattern first.`);
      }
    }
  }

  const confirmationRequired = broadRemovals.length > 0 || ruleSet.rules.some((rule) => rule.actions.includes('temporary_ban'));

  if (duplicates.length) warnings.push(...duplicates);
  if (conflicts.length) warnings.push(...conflicts);
  if (shadowed.length) warnings.push(...shadowed);
  if (broadRemovals.length) warnings.push(...broadRemovals);
  if (dangerous.length) warnings.push(...dangerous);

  const overallRisk: RuleAnalysis['overallRisk'] =
    confirmationRequired || dangerous.length > 0
      ? 'high'
      : warnings.length > 2
        ? 'medium'
        : 'low';

  return {
    warnings,
    duplicates,
    conflicts,
    shadowed,
    broadRemovals,
    dangerous,
    confirmationRequired,
    overallRisk,
  };
};

const textSignals = (sample: ContentSample): string[] => {
  const text = `${sample.title}\n${sample.body}`.toLowerCase();
  const domain = sample.domain.toLowerCase();
  return [text, domain];
};

const containsAny = (haystacks: string[], needles: string[] | undefined): boolean => {
  if (!needles?.length) return false;
  return needles.some((needle) => haystacks.some((haystack) => haystack.includes(needle.toLowerCase())));
};

const evaluateCondition = (
  label: string,
  matched: boolean,
  detail: string,
  bucket: TriggeredCondition[]
) => {
  if (matched) {
    bucket.push({ key: label, label, detail });
  }
};

export const evaluateRule = (rule: RuleDefinition, sample: ContentSample): RuleMatch | null => {
  if (!rule.enabled) return null;

  const triggeredConditions: TriggeredCondition[] = [];
  const conditions = rule.conditions;
  const haystacks = textSignals(sample);

  const checks: boolean[] = [];

  if (conditions.min_account_age_days !== undefined) {
    const value = sample.accountAgeDays;
    const ok = value !== null && value >= conditions.min_account_age_days;
    checks.push(ok);
    evaluateCondition('min_account_age_days', ok, `Account age ${value ?? 'unknown'}d meets the ${conditions.min_account_age_days}d minimum.`, triggeredConditions);
  }

  if (conditions.max_account_age_days !== undefined) {
    const value = sample.accountAgeDays;
    const ok = value !== null && value <= conditions.max_account_age_days;
    checks.push(ok);
    evaluateCondition('max_account_age_days', ok, `Account age ${value ?? 'unknown'}d is within the ${conditions.max_account_age_days}d cap.`, triggeredConditions);
  }

  if (conditions.min_combined_karma !== undefined) {
    const value = sample.combinedKarma;
    const ok = value !== null && value >= conditions.min_combined_karma;
    checks.push(ok);
    evaluateCondition('min_combined_karma', ok, `Combined karma ${value ?? 'unknown'} meets the ${conditions.min_combined_karma} minimum.`, triggeredConditions);
  }

  if (conditions.max_combined_karma !== undefined) {
    const value = sample.combinedKarma;
    const ok = value !== null && value <= conditions.max_combined_karma;
    checks.push(ok);
    evaluateCondition('max_combined_karma', ok, `Combined karma ${value ?? 'unknown'} stays under ${conditions.max_combined_karma}.`, triggeredConditions);
  }

  if (conditions.max_posts_per_hour !== undefined) {
    const value = sample.postFrequencyPerHour;
    const ok = value !== null && value <= conditions.max_posts_per_hour;
    checks.push(ok);
    evaluateCondition('max_posts_per_hour', ok, `Posting rate ${value ?? 'unknown'}/h stays under ${conditions.max_posts_per_hour}/h.`, triggeredConditions);
  }

  if (conditions.max_comments_per_hour !== undefined) {
    const value = sample.commentFrequencyPerHour;
    const ok = value !== null && value <= conditions.max_comments_per_hour;
    checks.push(ok);
    evaluateCondition('max_comments_per_hour', ok, `Comment rate ${value ?? 'unknown'}/h stays under ${conditions.max_comments_per_hour}/h.`, triggeredConditions);
  }

  if (conditions.repeated_links_threshold !== undefined) {
    const value = sample.repeatedLinksCount;
    const ok = value !== null && value >= conditions.repeated_links_threshold;
    checks.push(ok);
    evaluateCondition('repeated_links_threshold', ok, `Repeated links ${value ?? 'unknown'} reached threshold ${conditions.repeated_links_threshold}.`, triggeredConditions);
  }

  if (conditions.repeated_domains_threshold !== undefined) {
    const value = sample.repeatedDomainsCount;
    const ok = value !== null && value >= conditions.repeated_domains_threshold;
    checks.push(ok);
    evaluateCondition('repeated_domains_threshold', ok, `Repeated domains ${value ?? 'unknown'} reached threshold ${conditions.repeated_domains_threshold}.`, triggeredConditions);
  }

  if (conditions.suspicious_domains?.length) {
    const ok = conditions.suspicious_domains.some((domain) => haystacks.some((haystack) => haystack.includes(domain.toLowerCase())) || sample.suspiciousDomains.some((value) => value.toLowerCase() === domain.toLowerCase()));
    checks.push(ok);
    evaluateCondition('suspicious_domains', ok, `Suspicious domains matched (${conditions.suspicious_domains.join(', ')}).`, triggeredConditions);
  }

  if (conditions.suspicious_phrases?.length) {
    const ok = containsAny(haystacks, conditions.suspicious_phrases);
    checks.push(ok);
    evaluateCondition('suspicious_phrases', ok, `Suspicious phrase matched (${conditions.suspicious_phrases.join(', ')}).`, triggeredConditions);
  }

  if (conditions.suspicious_keywords?.length) {
    const ok = containsAny(haystacks, conditions.suspicious_keywords) || conditions.suspicious_keywords.some((keyword) => sample.suspiciousKeywords.map((entry) => entry.toLowerCase()).includes(keyword.toLowerCase()));
    checks.push(ok);
    evaluateCondition('suspicious_keywords', ok, `Suspicious keyword matched (${conditions.suspicious_keywords.join(', ')}).`, triggeredConditions);
  }

  if (conditions.spam_phrases?.length) {
    const ok = containsAny(haystacks, conditions.spam_phrases);
    checks.push(ok);
    evaluateCondition('spam_phrases', ok, `Spam phrase matched (${conditions.spam_phrases.join(', ')}).`, triggeredConditions);
  }

  if (conditions.toxicity_keywords?.length) {
    const ok = containsAny(haystacks, conditions.toxicity_keywords);
    checks.push(ok);
    evaluateCondition('toxicity_keywords', ok, `Toxicity keyword matched (${conditions.toxicity_keywords.join(', ')}).`, triggeredConditions);
  }

  if (conditions.cross_subreddit_activity_threshold !== undefined) {
    const value = sample.crossSubredditActivityCount;
    const ok = value !== null && value >= conditions.cross_subreddit_activity_threshold;
    checks.push(ok);
    evaluateCondition('cross_subreddit_activity_threshold', ok, `Cross-subreddit activity ${value ?? 'unknown'} reached ${conditions.cross_subreddit_activity_threshold}.`, triggeredConditions);
  }

  if (conditions.rapid_post_burst_threshold !== undefined) {
    const value = sample.rapidPostBurstCount;
    const ok = value !== null && value >= conditions.rapid_post_burst_threshold;
    checks.push(ok);
    evaluateCondition('rapid_post_burst_threshold', ok, `Burst count ${value ?? 'unknown'} reached ${conditions.rapid_post_burst_threshold}.`, triggeredConditions);
  }

  if (conditions.ban_evasion_indicators !== undefined) {
    const ok = sample.banEvasionIndicators === conditions.ban_evasion_indicators;
    checks.push(ok);
    evaluateCondition('ban_evasion_indicators', ok, `Ban evasion indicator state matched the rule.`, triggeredConditions);
  }

  if (conditions.new_account_wave_threshold !== undefined) {
    const value = sample.newAccountWaveCount;
    const ok = value !== null && value >= conditions.new_account_wave_threshold;
    checks.push(ok);
    evaluateCondition('new_account_wave_threshold', ok, `New account wave count ${value ?? 'unknown'} reached ${conditions.new_account_wave_threshold}.`, triggeredConditions);
  }

  if (conditions.min_toxicity_score !== undefined) {
    const value = sample.toxicityScore;
    const ok = value !== null && value >= conditions.min_toxicity_score;
    checks.push(ok);
    evaluateCondition('min_toxicity_score', ok, `Toxicity score ${value ?? 'unknown'} meets ${conditions.min_toxicity_score}.`, triggeredConditions);
  }

  const matched = checks.length > 0 && checks.every(Boolean);
  if (!matched) {
    return null;
  }

  const riskScore = thresholdRisk(rule) + triggeredConditions.length * 8;
  const confidence: RuleMatch['confidence'] =
    riskScore >= 140 ? 'high' : riskScore >= 90 ? 'medium' : 'low';

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    actions: [...rule.actions],
    triggeredConditions,
    confidence,
    riskScore,
  };
};

export const evaluateRuleSet = (ruleSet: RuleSet, samples: ContentSample[]): RuleDecision[] => {
  return samples.map((sample) => {
    const matchedRules = ruleSet.rules
      .map((rule) => evaluateRule(rule, sample))
      .filter((match): match is RuleMatch => match !== null)
      .sort((left, right) => right.riskScore - left.riskScore);

    const highestAction = matchedRules
      .flatMap((match) => match.actions)
      .sort((left, right) => ACTION_WEIGHT[right] - ACTION_WEIGHT[left])[0] ?? 'allow';

    const riskScore = matchedRules.reduce((sum, match) => sum + match.riskScore, 0);
    const confidence: RuleDecision['confidence'] =
      riskScore >= 160 ? 'high' : riskScore >= 90 ? 'medium' : 'low';

    const status: RuleDecision['status'] =
      highestAction === 'remove_post' || highestAction === 'temporary_ban'
        ? 'removed'
        : matchedRules.length > 0
          ? 'escalated'
          : 'allowed';

    const color: RuleDecision['color'] =
      status === 'removed' ? 'red' : status === 'escalated' ? 'yellow' : 'green';

    const conditions = matchedRules.flatMap((match) => match.triggeredConditions.map((trigger) => `${match.ruleName}: ${trigger.detail}`));

    const explanation =
      status === 'allowed'
        ? 'No enabled rule matched this item.'
        : `${matchedRules.length} rule${matchedRules.length === 1 ? '' : 's'} matched and would execute ${highestAction.replace(/_/g, ' ')}.`;

    return {
      sample,
      status,
      topAction: highestAction,
      confidence,
      riskScore,
      matchedRules,
      conditions,
      explanation,
      color,
    };
  });
};

export const getRuleSetFromYaml = (yamlText: string, subredditId: string, updatedBy = 'system'): RuleSet =>
  parseRuleSetYaml(yamlText, subredditId, updatedBy);

export const getRuleSetYaml = (ruleSet: RuleSet): string => serializeRuleSetYaml(ruleSet);

export const blankAnalytics = (): RuleAnalytics => structuredClone(DEFAULT_ANALYTICS);

export const summarizeRuleSet = (ruleSet: RuleSet) => {
  const analysis = analyzeRuleSet(ruleSet);
  const enabled = ruleSet.rules.filter((rule) => rule.enabled).length;
  const removals = ruleSet.rules.filter((rule) => isRemovalRule(rule)).length;

  return {
    enabled,
    removals,
    warnings: analysis.warnings.length,
    confirmationRequired: analysis.confirmationRequired,
    overallRisk: analysis.overallRisk,
  };
};

export const createDemoCorpus = (subredditId: string): ContentSample[] => {
  const now = Date.now();

  return [
    {
      id: 'demo-post-1',
      kind: 'post',
      author: 'newpromoaccount',
      title: 'Please support my content',
      body: 'Please subscribe and follow my page.\nCheck my channel for more updates.',
      domain: 'youtube.com',
      subredditId,
      createdAt: now - 5 * 60 * 1000,
      accountAgeDays: 2,
      combinedKarma: 15,
      postFrequencyPerHour: 7,
      commentFrequencyPerHour: null,
      repeatedLinksCount: 3,
      repeatedDomainsCount: 2,
      suspiciousDomains: ['youtube.com'],
      suspiciousKeywords: ['subscribe', 'follow my', 'check my channel'],
      toxicityScore: 0.08,
      crossSubredditActivityCount: 1,
      rapidPostBurstCount: 5,
      banEvasionIndicators: false,
      newAccountWaveCount: 4,
      metadata: { source: 'demo' },
    },
    {
      id: 'demo-comment-2',
      kind: 'comment',
      author: 'argument_baiter',
      title: '18+ leak available',
      body: 'NSFW leak available.\nOnlyfans content and private leak inside.',
      domain: 'onlyfans.com',
      subredditId,
      createdAt: now - 12 * 60 * 1000,
      accountAgeDays: 2,
      combinedKarma: 8,
      postFrequencyPerHour: null,
      commentFrequencyPerHour: 12,
      repeatedLinksCount: 0,
      repeatedDomainsCount: 0,
      suspiciousDomains: ['onlyfans.com'],
      suspiciousKeywords: ['onlyfans', 'nsfw', '18+', 'leak'],
      toxicityScore: 0.62,
      crossSubredditActivityCount: 2,
      rapidPostBurstCount: 3,
      banEvasionIndicators: false,
      newAccountWaveCount: 2,
      metadata: { source: 'demo' },
    },
    {
      id: 'demo-post-3',
      kind: 'post',
      author: 'raidwaveuser',
      title: 'Everyone join from the other subreddit',
      body: 'We are all coming here from another subreddit.\nBring more people and keep posting.',
      domain: 'reddit.com',
      subredditId,
      createdAt: now - 90 * 60 * 1000,
      accountAgeDays: 3,
      combinedKarma: 24,
      postFrequencyPerHour: 10,
      commentFrequencyPerHour: null,
      repeatedLinksCount: 1,
      repeatedDomainsCount: 2,
      suspiciousDomains: [],
      suspiciousKeywords: ['another subreddit', 'bring more people', 'keep posting'],
      toxicityScore: 0.18,
      crossSubredditActivityCount: 6,
      rapidPostBurstCount: 7,
      banEvasionIndicators: false,
      newAccountWaveCount: 5,
      metadata: { source: 'demo' },
    },
    {
      id: 'demo-post-4',
      kind: 'post',
      author: 'ordinary_member',
      title: 'Question about community event',
      body: 'Looking for guidance on the pinned rules and event schedule.',
      domain: 'self.post',
      subredditId,
      createdAt: now - 120 * 60 * 1000,
      accountAgeDays: 180,
      combinedKarma: 1190,
      postFrequencyPerHour: 1,
      commentFrequencyPerHour: null,
      repeatedLinksCount: 0,
      repeatedDomainsCount: 0,
      suspiciousDomains: [],
      suspiciousKeywords: [],
      toxicityScore: 0.04,
      crossSubredditActivityCount: 0,
      rapidPostBurstCount: 1,
      banEvasionIndicators: false,
      newAccountWaveCount: 0,
      metadata: { source: 'demo' },
    },
  ];
};

const parseJsonArray = <T,>(payload: string | null): T[] => {
  if (!payload) return [];
  try {
    const parsed = JSON.parse(payload) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadRuleState = async (subredditId: string): Promise<RuleState> => {
  const [activeRaw, historyRaw, analyticsRaw, flaggedRaw, eventsRaw] = await Promise.all([
    redis.get(RULES_ACTIVE_KEY(subredditId)),
    redis.zRange(RULES_HISTORY_KEY(subredditId), 0, 19, { by: 'rank', reverse: true }),
    redis.get(RULES_ANALYTICS_KEY(subredditId)),
    redis.get(FLAGGED_USERS_KEY(subredditId)),
    redis.zRange(MODERATION_EVENTS_KEY(subredditId), 0, 39, { by: 'rank', reverse: true }),
  ]);

  const active = activeRaw ? (normalizeRuleSet(JSON.parse(activeRaw), subredditId) as RuleSet) : null;
  const history = historyRaw.map((entry: { member: string; score: number }) => {
    try {
      return JSON.parse(entry.member) as { version: number; updatedAt: number; updatedBy: string; note: string; yaml: string };
    } catch {
      return null;
    }
  }).filter((entry): entry is { version: number; updatedAt: number; updatedBy: string; note: string; yaml: string } => entry !== null);

  const analytics = analyticsRaw ? { ...DEFAULT_ANALYTICS, ...(JSON.parse(analyticsRaw) as Partial<RuleAnalytics>) } : structuredClone(DEFAULT_ANALYTICS);
  const flaggedUsers = parseJsonArray<FlaggedUser>(flaggedRaw ?? null);
  const events = eventsRaw.map((entry: { member: string; score: number }) => {
    try {
      return JSON.parse(entry.member) as ModerationEvent;
    } catch {
      return null;
    }
  }).filter((entry): entry is ModerationEvent => entry !== null);

  return { active, history, analytics, flaggedUsers, events };
};

export const persistRuleState = async (subredditId: string, state: RuleState): Promise<void> => {
  if (state.active) {
    await redis.set(RULES_ACTIVE_KEY(subredditId), JSON.stringify(state.active));
  }

  await redis.set(RULES_ANALYTICS_KEY(subredditId), JSON.stringify(state.analytics));
  await redis.set(FLAGGED_USERS_KEY(subredditId), JSON.stringify(state.flaggedUsers));
};

export const appendRuleHistory = async (
  subredditId: string,
  snapshot: { version: number; updatedAt: number; updatedBy: string; note: string; yaml: string }
): Promise<void> => {
  await redis.zAdd(RULES_HISTORY_KEY(subredditId), {
    score: snapshot.updatedAt,
    member: JSON.stringify(snapshot),
  });
};

export const appendModerationEvent = async (subredditId: string, event: ModerationEvent): Promise<void> => {
  await redis.zAdd(MODERATION_EVENTS_KEY(subredditId), {
    score: event.timestamp,
    member: JSON.stringify(event),
  });
};

export const trimModerationEvents = async (subredditId: string, limit = 60): Promise<void> => {
  const count = await redis.zCard(MODERATION_EVENTS_KEY(subredditId));
  if (count > limit) {
    await redis.zRemRangeByRank(MODERATION_EVENTS_KEY(subredditId), 0, count - limit - 1);
  }
};

export const updateRuleAnalytics = (
  analytics: RuleAnalytics,
  updates: Partial<RuleAnalytics>
): RuleAnalytics => ({
  ...analytics,
  ...updates,
  ruleHitFrequency: {
    ...analytics.ruleHitFrequency,
    ...(updates.ruleHitFrequency ?? {}),
  },
  falsePositiveCandidates: updates.falsePositiveCandidates ?? analytics.falsePositiveCandidates,
  repeatedOffenders: updates.repeatedOffenders ?? analytics.repeatedOffenders,
});

export const upsertFlaggedUser = (
  flaggedUsers: FlaggedUser[],
  input: { author: string; reason: string; riskScore: number; timestamp: number }
): FlaggedUser[] => {
  const existing = flaggedUsers.find((entry) => entry.author.toLowerCase() === input.author.toLowerCase());
  const next = flaggedUsers.filter((entry) => entry.author.toLowerCase() !== input.author.toLowerCase());
  const merged: FlaggedUser = {
    author: input.author,
    hits: (existing?.hits ?? 0) + 1,
    lastSeen: input.timestamp,
    reasons: uniqueSorted([...(existing?.reasons ?? []), input.reason]),
    riskScore: Math.max(existing?.riskScore ?? 0, input.riskScore),
  };
  next.unshift(merged);
  return next.sort((left, right) => right.hits - left.hits || right.riskScore - left.riskScore);
};

export const summarizeDecision = (decision: RuleDecision): string => {
  if (decision.status === 'allowed') {
    return 'Allowed';
  }

  const matchedNames = decision.matchedRules.map((match) => match.ruleName).join(', ');
  return `${decision.status.toUpperCase()} via ${decision.topAction.replace(/_/g, ' ')} from ${matchedNames}`;
};

export const actionLabel = (action: RuleAction | 'allow'): string => action.replace(/_/g, ' ');
