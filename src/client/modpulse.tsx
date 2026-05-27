import React, { useEffect, useMemo, useState, useTransition, useDeferredValue, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import YAML from 'yaml';

type RuleAction =
  | 'remove_post'
  | 'filter_review_queue'
  | 'send_to_jury_review'
  | 'add_mod_note'
  | 'lock_thread'
  | 'temporary_mute'
  | 'temporary_ban'
  | 'notify_moderators'
  | 'mark_high_risk';

type RuleSeverity = 'low' | 'medium' | 'high' | 'critical';

type RuleConditions = {
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

type RuleDefinition = {
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

type RuleTemplate = {
  id: string;
  label: string;
  description: string;
  template: RuleDefinition;
};

type RuleSet = {
  subredditId: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  rules: RuleDefinition[];
};

type RuleAnalysis = {
  warnings: string[];
  duplicates: string[];
  conflicts: string[];
  shadowed: string[];
  broadRemovals: string[];
  dangerous: string[];
  confirmationRequired: boolean;
  overallRisk: 'low' | 'medium' | 'high';
};

type RuleMatch = {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  actions: string[];
  triggeredConditions: Array<{ key: string; label: string; detail: string }>;
  confidence: 'low' | 'medium' | 'high';
  riskScore: number;
};

type RuleDecision = {
  sample: {
    id: string;
    kind: 'post' | 'comment';
    author: string;
    title: string;
    body: string;
    domain: string;
    createdAt: number;
  };
  status: 'allowed' | 'escalated' | 'removed';
  topAction: string;
  confidence: 'low' | 'medium' | 'high';
  riskScore: number;
  matchedRules: RuleMatch[];
  conditions: string[];
  explanation: string;
  color: 'green' | 'yellow' | 'red';
};

type RuleAnalytics = {
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

type FlaggedUser = {
  author: string;
  hits: number;
  lastSeen: number;
  reasons: string[];
  riskScore: number;
};

type DashboardPayload = {
  ok: boolean;
  meta: {
    subredditId: string | null;
    username: string | null;
    now: number;
  };
  ruleSet: RuleSet;
  yaml: string;
  templates: RuleTemplate[];
  analysis: RuleAnalysis;
  activity: Array<{ id: string; action: string; moderator: string | null; detail: string | null; tone: 'good' | 'warn' | 'bad' | 'soft'; timestamp: number }>;
  history: Array<{ version: number; updatedAt: number; updatedBy: string; note: string; yaml: string }>;
  analytics: RuleAnalytics;
  flaggedUsers: FlaggedUser[];
  events: Array<{ id: string; subredditId: string; timestamp: number; type: string; ruleId?: string; ruleName?: string; sampleId?: string; author?: string; action?: string; riskScore?: number; details?: string }>;
  livePreview: RuleDecision[];
  insights: { headline: string; details: string[] };
  activeHandover: null | { author: string; timestamp: number; activeSituations: string; usersToWatch: string; priorityPosts: string; notes: string };
};

type ValidationResponse = {
  ok: boolean;
  ruleSet: RuleSet;
  analysis: RuleAnalysis;
  yaml: string;
  summary: { enabled: number; removals: number; warnings: number; confirmationRequired: boolean; overallRisk: 'low' | 'medium' | 'high' };
};

type TestResponse = {
  ok: boolean;
  ruleSet: RuleSet;
  analysis: RuleAnalysis;
  corpus: Array<{ id: string; kind: 'post' | 'comment'; author: string; title: string; body: string; domain: string; createdAt: number; metadata: Record<string, unknown> }>;
  decisions: RuleDecision[];
  analytics: RuleAnalytics;
  flaggedUsers: FlaggedUser[];
  events: Array<{ id: string; subredditId: string; timestamp: number; type: string; ruleId?: string; ruleName?: string; sampleId?: string; author?: string; action?: string; riskScore?: number; details?: string }>;
};

type DeployResponse = {
  ok: boolean;
  confirmationRequired?: boolean;
  warnings?: string[];
  analysis?: RuleAnalysis;
  ruleSet?: RuleSet;
  yaml?: string;
  snapshot?: { version: number; updatedAt: number; updatedBy: string; note: string };
  error?: string;
};

type RollbackResponse = {
  ok: boolean;
  ruleSet?: RuleSet;
  yaml?: string;
  snapshot?: { version: number; updatedAt: number; updatedBy: string; note: string };
  error?: string;
};

const ACTIONS: Array<{ value: RuleAction; label: string; tone: 'red' | 'amber' | 'blue' | 'neutral' }> = [
  { value: 'remove_post', label: 'Remove post', tone: 'red' },
  { value: 'filter_review_queue', label: 'Filter into review', tone: 'amber' },
  { value: 'send_to_jury_review', label: 'Send to jury', tone: 'blue' },
  { value: 'add_mod_note', label: 'Add mod note', tone: 'neutral' },
  { value: 'lock_thread', label: 'Lock thread', tone: 'amber' },
  { value: 'temporary_mute', label: 'Temporary mute', tone: 'amber' },
  { value: 'temporary_ban', label: 'Temporary ban', tone: 'red' },
  { value: 'notify_moderators', label: 'Notify moderators', tone: 'blue' },
  { value: 'mark_high_risk', label: 'Mark high risk', tone: 'neutral' },
];

const severityLabels: Record<RuleSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const defaultConditions = (): RuleConditions => ({
  suspicious_domains: [],
  suspicious_phrases: [],
  suspicious_keywords: [],
  spam_phrases: [],
  toxicity_keywords: [],
});

const blankRule = (): RuleDefinition => ({
  id: `rule-${Date.now()}`,
  name: 'new-rule',
  description: 'Describe the moderation intent here.',
  enabled: true,
  severity: 'medium',
  conditions: defaultConditions(),
  actions: ['filter_review_queue'],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  source: 'custom',
});

const normalizeArrayField = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const createRuleFromTemplate = (template: RuleTemplate): RuleDefinition => ({
  ...structuredClone(template.template),
  id: `${template.template.id}-${Date.now()}`,
  name: `${template.template.name} copy`,
  enabled: true,
  source: 'template',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const cloneRuleSet = (ruleSet: RuleSet): RuleSet => structuredClone(ruleSet);

const normalizeYamlRuleSet = (input: unknown, fallbackSubredditId: string): RuleSet => {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const sourceRules = Array.isArray(record.rules)
    ? record.rules
    : record.rule && typeof record.rule === 'object'
      ? [record.rule]
      : [];

  const rules = sourceRules.map((entry, index) => {
    const rule = entry as Record<string, unknown>;
    const conditions = (rule.conditions && typeof rule.conditions === 'object' ? rule.conditions : {}) as RuleConditions;
    return {
      id: String(rule.id ?? `rule-${index + 1}`),
      name: String(rule.name ?? `rule-${index + 1}`),
      description: String(rule.description ?? ''),
      enabled: Boolean(rule.enabled ?? true),
      severity: (rule.severity as RuleSeverity) ?? 'medium',
      conditions: {
        ...defaultConditions(),
        ...conditions,
      },
      actions: Array.isArray(rule.actions)
        ? (rule.actions.map((action) => String(action)) as RuleAction[])
        : ['filter_review_queue'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'custom' as const,
    };
  });

  return {
    subredditId: String(record.subredditId ?? fallbackSubredditId),
    version: Number(record.version ?? 1),
    updatedAt: Number(record.updatedAt ?? Date.now()),
    updatedBy: String(record.updatedBy ?? 'moderator'),
    rules,
  };
};

const serializeRuleSet = (ruleSet: RuleSet) =>
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
        conditions: rule.conditions,
        actions: rule.actions,
      })),
    },
    { indent: 2 }
  );

let isGlobalTestModeActive = false;

const apiFetch = async <T,>(path: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = {};
  if (body) {
    headers['content-type'] = 'application/json';
  }
  if (isGlobalTestModeActive) {
    headers['X-ModPulse-Test-Mode'] = 'true';
  }

  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  return response.json() as Promise<T>;
};

let serverTimeOffset = 0;

const relativeTime = (timestamp: number) => {
  const adjustedNow = Date.now() + serverTimeOffset;
  const deltaSeconds = Math.max(1, Math.floor((adjustedNow - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return `${Math.floor(deltaHours / 24)}d ago`;
};

const actionToneClass: Record<string, string> = {
  remove_post: 'riskRed',
  temporary_ban: 'riskRed',
  temporary_mute: 'riskAmber',
  lock_thread: 'riskAmber',
  filter_review_queue: 'riskBlue',
  send_to_jury_review: 'riskBlue',
  notify_moderators: 'riskBlue',
  add_mod_note: 'riskNeutral',
  mark_high_risk: 'riskNeutral',
};

const App = () => {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [yamlDraft, setYamlDraft] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<string>('Ready');
  const [analysis, setAnalysis] = useState<RuleAnalysis | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const [deployNote, setDeployNote] = useState('');
  const [needsDangerousConfirm, setNeedsDangerousConfirm] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [pendingDeploy, setPendingDeploy] = useState(false);
  const [isRefreshing, startRefreshing] = useTransition();
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind?: 'success' | 'error' | 'info' | 'warn' }>>([]);
  const deferredYaml = useDeferredValue(yamlDraft);
  const [juryPending, setJuryPending] = useState<DashboardPayload['livePreview'] | null>(null);
  const [juryResolved, setJuryResolved] = useState<any[] | null>(null);
  const [handoverHistory, setHandoverHistory] = useState<Array<{ author: string; timestamp: number; activeSituations?: string; notes?: string }>>([]);
  const [flaggedPosts, setFlaggedPosts] = useState<Array<{ postId: string; reason: string; flaggerId: string; timestamp: number; priority: 'low' | 'medium' | 'high' }> | null>(null);
  const [expandedSnapshotIds, setExpandedSnapshotIds] = useState<string[]>([]);
  const [testMode, setTestMode] = useState(false);
  const isFirstRender = useRef(true);

  const pendingSelectRef = useRef<string | null>(null);

  const templates = payload?.templates ?? [];
  const activeRuleSet = ruleSet ?? payload?.ruleSet ?? null;
  const currentAnalysis = validation?.analysis ?? analysis ?? payload?.analysis ?? null;
  const currentRule = activeRuleSet?.rules.find((rule) => rule.id === selectedRuleId) ?? activeRuleSet?.rules[0] ?? null;
  const warningItems = currentAnalysis?.warnings ?? [];
  const visibleWarnings = showAllWarnings ? warningItems : warningItems.slice(0, 4);
  const hiddenWarningCount = Math.max(0, warningItems.length - visibleWarnings.length);

  const activeMetrics = useMemo(() => {
    const rulesCount = activeRuleSet?.rules.length ?? 0;
    const enabledCount = activeRuleSet?.rules.filter((rule) => rule.enabled).length ?? 0;
    const warnings = currentAnalysis?.warnings.length ?? 0;
    const deployments = payload?.analytics.deployCount ?? 0;
    return {
      rulesCount,
      enabledCount,
      warnings,
      deployments,
    };
  }, [activeRuleSet, currentAnalysis?.warnings.length, payload?.analytics.deployCount]);

  const archivedItems = useMemo(() => {
    const items: Array<{
      id: string;
      postId: string;
      type: 'flagged' | 'removed';
      reason: string;
      detail: string;
      timestamp: number;
    }> = [];

    if (flaggedPosts) {
      flaggedPosts.forEach((post) => {
        items.push({
          id: `flag-${post.postId}`,
          postId: post.postId,
          type: 'flagged',
          reason: post.reason,
          detail: `Flagged by ${post.flaggerId}`,
          timestamp: post.timestamp,
        });
      });
    }

    if (juryResolved) {
      juryResolved.forEach((c) => {
        const isRemoval = c.finalVerdict === 'remove' || String(c.finalVerdict).toLowerCase().includes('remove');
        items.push({
          id: `jury-${c.id}`,
          postId: c.postId,
          type: 'removed',
          reason: c.reason || 'Jury resolution completed',
          detail: `Verdict: ${(c.finalVerdict ?? c.status).toUpperCase()} · Created by ${c.createdBy}`,
          timestamp: c.resolvedAt ?? c.createdAt,
        });
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [flaggedPosts, juryResolved]);

  const commitRuleSet = (next: RuleSet, selectRuleId?: string) => {
    startRefreshing(() => {
      setRuleSet(next);
      pendingSelectRef.current = selectRuleId ?? null;
      setYamlDraft(serializeRuleSet(next));
      setAnalysis(null);
      setYamlError(null);
      setParseStatus('Visual editor synced');
      setSelectedRuleId(selectRuleId ?? next.rules[0]?.id ?? null);
      setShowAllWarnings(false);
    });
  };

  const updateCurrentRule = (mutate: (rule: RuleDefinition) => RuleDefinition) => {
    if (!activeRuleSet || !currentRule) return;
    const next = cloneRuleSet(activeRuleSet);
    const index = next.rules.findIndex((rule) => rule.id === currentRule.id);
    if (index === -1) return;
    next.rules[index] = mutate(structuredClone(next.rules[index]));
    next.rules[index].updatedAt = Date.now();
    commitRuleSet(next);
  };

  const showToast = (message: string, kind: 'success' | 'error' | 'info' | 'warn' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  };

  const loadInitial = async () => {
    setIsLoadingDashboard(true);
    try {
      const nextPayload = await apiFetch<DashboardPayload>('/api/rules/dashboard');
      if (nextPayload && nextPayload.meta && nextPayload.meta.now) {
        serverTimeOffset = nextPayload.meta.now - Date.now();
      }
      setPayload(nextPayload);
      setRuleSet(nextPayload.ruleSet);
      setYamlDraft(nextPayload.yaml);
      setAnalysis(nextPayload.analysis);
      setSelectedRuleId(nextPayload.ruleSet.rules[0]?.id ?? null);
      setNeedsDangerousConfirm(nextPayload.analysis.confirmationRequired);
    } catch (err) {
      showToast(`Dashboard refresh failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }

    // Also fetch operational dashboard (jury + handover history + flags)
    try {
      const op = await apiFetch<any>('/api/dashboard');
      setJuryPending(op.jury?.pending ?? []);
      setJuryResolved(op.jury?.resolved ?? []);
      setHandoverHistory(op.handover?.history ?? []);
      setFlaggedPosts(op.flags?.posts ?? []);
      showToast('Dashboard refreshed', 'success');
    } catch (err) {
      showToast(`Operational dashboard fetch failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    isGlobalTestModeActive = testMode;
    void loadInitial();
  }, [testMode]);

  useEffect(() => {
    if (!yamlDraft.trim()) return;
    const timer = window.setTimeout(() => {
      try {
        const parsed = YAML.parse(yamlDraft) as unknown;
        const normalized = normalizeYamlRuleSet(parsed, payload?.meta.subredditId ?? '');
        setYamlError(null);
        setParseStatus('YAML parsed successfully');
        setRuleSet(normalized);
        setSelectedRuleId(pendingSelectRef.current ?? normalized.rules[0]?.id ?? null);
        pendingSelectRef.current = null;
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : String(error));
        setParseStatus('YAML has a parse error');
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [yamlDraft, payload?.meta.subredditId]);

  useEffect(() => {
    if (!yamlError && activeRuleSet) {
      const timer = window.setTimeout(() => {
        apiFetch<ValidationResponse>('/api/rules/validate', { yaml: yamlDraft, ruleSet: activeRuleSet })
          .then((result) => {
            setValidation(result);
            setAnalysis(result.analysis);
            setNeedsDangerousConfirm(result.analysis.confirmationRequired);
          })
          .catch((error) => {
            setYamlError(error instanceof Error ? error.message : String(error));
          });
      }, 450);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [activeRuleSet, yamlDraft, yamlError]);

  const selectRule = (ruleId: string) => setSelectedRuleId(ruleId);

  const addBlankRule = () => {
    if (!activeRuleSet) return;
    const next = cloneRuleSet(activeRuleSet);
    const rule = blankRule();
    next.rules.push(rule);
    commitRuleSet(next, rule.id);
  };

  const addTemplate = (template: RuleTemplate) => {
    if (!activeRuleSet) return;
    const next = cloneRuleSet(activeRuleSet);
    const rule = createRuleFromTemplate(template);
    next.rules.push(rule);
    commitRuleSet(next, rule.id);
  };

  const removeRule = (ruleId: string) => {
    if (!activeRuleSet) return;
    const next = cloneRuleSet(activeRuleSet);
    next.rules = next.rules.filter((rule) => rule.id !== ruleId);
    commitRuleSet(next);
  };

  const moveRule = (ruleId: string, direction: -1 | 1) => {
    if (!activeRuleSet) return;
    const next = cloneRuleSet(activeRuleSet);
    const index = next.rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= next.rules.length) return;
    [next.rules[index], next.rules[target]] = [next.rules[target], next.rules[index]];
    commitRuleSet(next);
  };

  const duplicateRule = (ruleId: string) => {
    if (!activeRuleSet) return;
    const source = activeRuleSet.rules.find((rule) => rule.id === ruleId);
    if (!source) return;
    const next = cloneRuleSet(activeRuleSet);
    const copy = structuredClone(source);
    copy.id = `${source.id}-copy-${Date.now()}`;
    copy.name = `${source.name} copy`;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    next.rules.push(copy);
    commitRuleSet(next, copy.id);
  };

  const toggleAction = (action: RuleAction) => {
    if (!currentRule) return;
    updateCurrentRule((rule) => ({
      ...rule,
      actions: rule.actions.includes(action)
        ? rule.actions.filter((entry) => entry !== action)
        : [...rule.actions, action],
    }));
  };

  const updateCondition = (key: keyof RuleConditions, value: string | boolean) => {
    if (!currentRule) return;
    updateCurrentRule((rule) => ({
      ...rule,
      conditions: {
        ...rule.conditions,
        [key]: typeof value === 'boolean' ? value : value.trim() ? Number(value) || value : undefined,
      },
    }));
  };

  const updateListCondition = (key: keyof RuleConditions, value: string) => {
    if (!currentRule) return;
    updateCurrentRule((rule) => ({
      ...rule,
      conditions: {
        ...rule.conditions,
        [key]: normalizeArrayField(value),
      },
    }));
  };

  const updateRuleField = (key: keyof RuleDefinition, value: string | boolean | RuleSeverity) => {
    if (!currentRule) return;
    updateCurrentRule((rule) => ({
      ...rule,
      [key]: value,
    }));
  };

  const runTest = async () => {
    if (!activeRuleSet) return;
    const response = await apiFetch<TestResponse>('/api/rules/test', { yaml: yamlDraft, ruleSet: activeRuleSet });
    setTestResults(response);
    setPayload((current) => current ? {
      ...current,
      analytics: response.analytics,
      flaggedUsers: response.flaggedUsers,
      events: response.events,
      ruleSet: response.ruleSet,
      yaml: serializeRuleSet(response.ruleSet),
      analysis: response.analysis,
      livePreview: response.decisions,
    } : current);
    setRuleSet(response.ruleSet);
    setYamlDraft(serializeRuleSet(response.ruleSet));
    setAnalysis(response.analysis);
    setShowAllWarnings(false);
  };

  const deployRules = async (confirmDangerous: boolean) => {
    if (!activeRuleSet) return;
    setPendingDeploy(true);
    try {
      const response = await apiFetch<DeployResponse>('/api/rules/deploy', {
        yaml: yamlDraft,
        ruleSet: activeRuleSet,
        confirmDangerous,
        note: deployNote,
      });

      if (response.confirmationRequired) {
        setNeedsDangerousConfirm(true);
        setValidation((current) => current ? { ...current, analysis: response.analysis ?? current.analysis } : current);
        showToast('Deploy requires confirmation for dangerous rules', 'warn');
        return;
      }

      if (response.ok && response.ruleSet && response.yaml) {
        setRuleSet(response.ruleSet);
        setYamlDraft(response.yaml);
        setAnalysis(response.analysis ?? null);
        setNeedsDangerousConfirm(false);
        setShowAllWarnings(false);
        setDeployNote('');
        await loadInitial();
        showToast('Rules deployed', 'success');
      } else {
        showToast('Deploy failed', 'error');
      }
    } catch (err) {
      showToast(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setPendingDeploy(false);
    }
  };

  const rollbackRules = async () => {
    const response = await apiFetch<RollbackResponse>('/api/rules/rollback', {});
    if (response.ok && response.ruleSet && response.yaml) {
      setRuleSet(response.ruleSet);
      setYamlDraft(response.yaml);
      setSelectedRuleId(response.ruleSet.rules[0]?.id ?? null);
      await loadInitial();
    }
  };

  const voteOnCase = async (caseId: string, vote: 'remove' | 'approve' | 'abstain') => {
    try {
      await apiFetch('/api/jury/vote', { caseId, vote });
    } catch (err) {
      console.warn('Vote failed', err);
    }

    // Refresh both dashboards
    try {
      await loadInitial();
    } catch (_) {
      // ignore
    }
  };

  const flagPost = async (postId: string, reason: string, priority: 'low' | 'medium' | 'high' = 'medium') => {
    try {
      await apiFetch('/api/flags/flag', { postId, reason, priority });
    } catch (err) {
      console.warn('Flag failed', err);
    }

    // Refresh dashboard
    try {
      await loadInitial();
    } catch (_) {
      // ignore
    }
  };

  const unflagPost = async (postId: string) => {
    try {
      await apiFetch('/api/flags/unflag', { postId });
    } catch (err) {
      console.warn('Unflag failed', err);
    }

    // Refresh dashboard
    try {
      await loadInitial();
    } catch (_) {
      // ignore
    }
  };

  const recentSnapshots = payload?.history ?? [];
  const previousDeploymentRules = useMemo(() => {
    return recentSnapshots.slice(0, 4).map((snapshot) => {
      try {
        const parsed = YAML.parse(snapshot.yaml) as { rules?: Array<{ name?: string; actions?: string[]; enabled?: boolean; severity?: string; description?: string }> } | null;
        const rules = Array.isArray(parsed?.rules) ? parsed!.rules : [];
        return {
          ...snapshot,
          rules: rules.slice(0, 4).map((rule) => ({
            name: rule.name ?? 'Unnamed rule',
            actions: Array.isArray(rule.actions) ? rule.actions : [],
            enabled: rule.enabled ?? true,
            severity: rule.severity ?? 'low',
          })),
        };
      } catch {
        return {
          ...snapshot,
          rules: [] as Array<{ name: string; actions: string[]; enabled: boolean; severity: string }>,
        };
      }
    });
  }, [recentSnapshots]);

  const toggleSnapshotRules = (snapshotKey: string) => {
    setExpandedSnapshotIds((current) => (
      current.includes(snapshotKey)
        ? current.filter((key) => key !== snapshotKey)
        : [...current, snapshotKey]
    ));
  };

  return (
    <div className="appShell">
      <div className="toastContainer">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? 'info'}`}>
            {t.message}
          </div>
        ))}
      </div>
      <header className="topbar">
        <div>
          <div className="eyebrow">Programmable moderation infrastructure</div>
          <h1>ModPulse Rules Engine</h1>
          <p className="lede">Build, preview, test, deploy, and roll back moderation rules with transparent YAML and visual controls.</p>
        </div>
        <div className="topActions">
          <div className="statusChip">{payload?.meta.username ?? 'moderator'} · r/{payload?.meta.subredditId ?? 'unknown'}</div>
          <button 
            className={`btn ${testMode ? 'primary test-mode-active' : 'secondary'}`} 
            onClick={() => setTestMode(!testMode)}
            title="When Sandbox is active, moderation actions will not affect real Reddit posts"
          >
            {testMode ? '🟢 Sandbox Active' : '⚪ Sandbox Off'}
          </button>
          <button className="btn secondary" onClick={() => void loadInitial()} disabled={isLoadingDashboard || pendingDeploy}>
            {isLoadingDashboard ? <><span className="spinner"/> Refreshing…</> : 'Refresh'}
          </button>
          <button className="btn secondary" onClick={() => void runTest()}>Live test</button>
          <button className="btn primary" onClick={() => void deployRules(needsDangerousConfirm)} disabled={pendingDeploy || isLoadingDashboard}>
            {pendingDeploy ? <><span className="spinner"/> Deploying…</> : 'Deploy rules'}
          </button>
        </div>
      </header>

      <section className="heroGrid">
        <article className="heroCard heroLead">
          <div className="eyebrow">Rule Insights</div>
          <div className="heroTitle" style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Explainable operational summary.</div>
          <div className="insightHeadline">{payload?.insights.headline ?? 'Loading current moderation signals...'}</div>
          <ul className="insightList" style={{ marginBottom: '16px' }}>
            {(payload?.insights.details ?? []).map((detail) => (
              <li key={detail} style={{ fontSize: '13px' }}>{detail}</li>
            ))}
          </ul>
          <div className="heroMetaRow">
            <span>{activeMetrics.rulesCount} rules</span>
            <span>{activeMetrics.enabledCount} enabled</span>
            <span>{activeMetrics.warnings} warnings</span>
            <span>{activeMetrics.deployments} deploys</span>
          </div>
        </article>

        <article className="heroCard compactStats">
          <div className="metricCard">
            <span className="metricLabel">Queue pressure</span>
            <strong>{payload?.analytics.queuePressure ?? 0}</strong>
          </div>
          <div className="metricCard">
            <span className="metricLabel">False-positive candidates</span>
            <strong>{payload?.analytics.falsePositiveCandidates.length ?? 0}</strong>
          </div>
          <div className="metricCard">
            <span className="metricLabel">Repeated offenders</span>
            <strong>{payload?.analytics.repeatedOffenders.length ?? 0}</strong>
          </div>
          <div className="metricCard">
            <span className="metricLabel">Rule hits</span>
            <strong>{Object.keys(payload?.analytics.ruleHitFrequency ?? {}).length}</strong>
          </div>
        </article>
      </section>

      <main className="workspace">
        <aside className="sidebar panel">
          <div className="panelHeader">
            <div>
              <h2>Rule templates</h2>
              <p>Start from a vetted template and edit before deploy.</p>
            </div>
            <button className="btn subtle" onClick={addBlankRule}>New rule</button>
          </div>

          <div className="templateList">
            {templates.map((template) => (
              <button key={template.id} className="templateCard" onClick={() => addTemplate(template)}>
                <div>
                  <strong>{template.label}</strong>
                  <p>{template.description}</p>
                </div>
                <span className="miniPill">Add</span>
              </button>
            ))}
          </div>

          <div className="panelHeader compact">
            <div>
              <h2>Active rules</h2>
              <p>Reorder, enable, or disable rules.</p>
            </div>
          </div>

          <div className="ruleStack">
            {(activeRuleSet?.rules ?? []).map((rule) => (
              <div key={rule.id} className={`ruleListItem ${rule.id === currentRule?.id ? 'active' : ''}`}>
                <button className="ruleSelect" onClick={() => selectRule(rule.id)}>
                  <span className={`ruleDot ${rule.enabled ? 'on' : 'off'}`} />
                  <span>
                    <strong>{rule.name}</strong>
                    <small>{severityLabels[rule.severity]} · {rule.actions.length} actions</small>
                  </span>
                </button>
                <div className="ruleQuickActions">
                  <button className="iconButton" onClick={() => moveRule(rule.id, -1)}>↑</button>
                  <button className="iconButton" onClick={() => moveRule(rule.id, 1)}>↓</button>
                  <button className="iconButton danger" onClick={() => removeRule(rule.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="editorColumn">
          <article className="panel editorPanel">
            <div className="panelHeader">
              <div>
                <h2>Visual rule builder</h2>
                <p>Every change updates the YAML payload live.</p>
              </div>
              <label className="switchRow">
                <input
                  type="checkbox"
                  checked={currentRule?.enabled ?? false}
                  onChange={(event) => updateRuleField('enabled', event.target.checked)}
                />
                <span>Enabled</span>
              </label>
            </div>

            {!currentRule ? (
              <div className="emptyState">Add or select a rule to begin.</div>
            ) : (
              <div className="editorGrid">
                <label className="fieldBlock">
                  <span>Name</span>
                  <input value={currentRule.name} onChange={(event) => updateRuleField('name', event.target.value)} />
                </label>
                <label className="fieldBlock">
                  <span>Severity</span>
                  <select value={currentRule.severity} onChange={(event) => updateRuleField('severity', event.target.value as RuleSeverity)}>
                    {Object.entries(severityLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="fieldBlock span2">
                  <span>Description</span>
                  <textarea rows={2} value={currentRule.description} onChange={(event) => updateRuleField('description', event.target.value)} />
                </label>

                <div className="conditionGroup span2">
                  <h3>Thresholds</h3>
                  <div className="grid2">
                    <label className="fieldBlock"><span>Min account age days</span><input type="number" value={currentRule.conditions.min_account_age_days ?? ''} onChange={(event) => updateCondition('min_account_age_days', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Max combined karma</span><input type="number" value={currentRule.conditions.max_combined_karma ?? ''} onChange={(event) => updateCondition('max_combined_karma', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Max posts per hour</span><input type="number" value={currentRule.conditions.max_posts_per_hour ?? ''} onChange={(event) => updateCondition('max_posts_per_hour', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Repeated links threshold</span><input type="number" value={currentRule.conditions.repeated_links_threshold ?? ''} onChange={(event) => updateCondition('repeated_links_threshold', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Repeated domains threshold</span><input type="number" value={currentRule.conditions.repeated_domains_threshold ?? ''} onChange={(event) => updateCondition('repeated_domains_threshold', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Cross-subreddit activity</span><input type="number" value={currentRule.conditions.cross_subreddit_activity_threshold ?? ''} onChange={(event) => updateCondition('cross_subreddit_activity_threshold', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Rapid post burst</span><input type="number" value={currentRule.conditions.rapid_post_burst_threshold ?? ''} onChange={(event) => updateCondition('rapid_post_burst_threshold', event.target.value)} /></label>
                    <label className="fieldBlock"><span>Min toxicity score</span><input type="number" step="0.05" value={currentRule.conditions.min_toxicity_score ?? ''} onChange={(event) => updateCondition('min_toxicity_score', event.target.value)} /></label>
                  </div>
                </div>

                <div className="conditionGroup span2">
                  <h3>Signal lists</h3>
                  <div className="grid2">
                    <label className="fieldBlock"><span>Suspicious domains</span><input value={(currentRule.conditions.suspicious_domains ?? []).join(', ')} onChange={(event) => updateListCondition('suspicious_domains', event.target.value)} placeholder="bit.ly, shady.site" /></label>
                    <label className="fieldBlock"><span>Suspicious keywords</span><input value={(currentRule.conditions.suspicious_keywords ?? []).join(', ')} onChange={(event) => updateListCondition('suspicious_keywords', event.target.value)} placeholder="promo, click here" /></label>
                    <label className="fieldBlock"><span>Spam phrases</span><input value={(currentRule.conditions.spam_phrases ?? []).join(', ')} onChange={(event) => updateListCondition('spam_phrases', event.target.value)} placeholder="free rewards, act now" /></label>
                    <label className="fieldBlock"><span>Toxicity keywords</span><input value={(currentRule.conditions.toxicity_keywords ?? []).join(', ')} onChange={(event) => updateListCondition('toxicity_keywords', event.target.value)} placeholder="slur, kill yourself" /></label>
                  </div>
                </div>

                <div className="conditionGroup span2">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0 }}>Actions</h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: '700', color: 'var(--muted)', background: 'rgba(0,0,0,0.15)', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--stroke)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#46d160', display: 'inline-block' }} /> Low
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ffb300', display: 'inline-block' }} /> Medium
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ff4500', display: 'inline-block' }} /> High
                      </span>
                    </div>
                  </div>
                  <div className="actionGrid">
                    {ACTIONS.map((action) => (
                      <label key={action.value} className={`actionChip ${actionToneClass[action.value] ?? 'riskNeutral'} ${currentRule.actions.includes(action.value) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={currentRule.actions.includes(action.value)}
                          onChange={() => toggleAction(action.value)}
                        />
                        <span>{action.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="panel yamlPanel">
            <div className="panelHeader">
              <div>
                <h2>Editable YAML</h2>
                <p>Mods can edit the exact rule payload before deployment.</p>
              </div>
              <div className="statusGroup">
                <span className={`statusPill ${yamlError ? 'bad' : 'good'}`}>{yamlError ? 'Parse error' : parseStatus}</span>
                <span className={`statusPill ${currentAnalysis?.overallRisk === 'high' ? 'warn' : 'good'}`}>{currentAnalysis?.overallRisk ?? 'low'} risk</span>
              </div>
            </div>
            <textarea
              className="yamlEditor"
              value={yamlDraft}
              onChange={(event) => {
                setYamlDraft(event.target.value);
                setParseStatus('Editing YAML');
              }}
              spellCheck={false}
            />
            <div className="inlineNote">YAML preview updates live as you edit the visual builder. This field also accepts direct edits.</div>
          </article>
        </section>

        <aside className="inspectorColumn">
          <article className="panel warningPanel">
            <div className="panelHeader compact">
              <div>
                <h2>Conflict detection</h2>
                <p>Plain-English warnings before deployment.</p>
              </div>
            </div>
            <div className="warningList">
              {warningItems.length === 0 ? (
                <div className="emptyState">No conflict warnings yet.</div>
              ) : (
                visibleWarnings.map((warning) => (
                  <div key={warning} className="warningItem">{warning}</div>
                ))
              )}
            </div>
            {warningItems.length > 4 ? (
              <button className="viewMoreButton" type="button" onClick={() => setShowAllWarnings((current) => !current)}>
                {showAllWarnings ? 'Show less' : `View more (${hiddenWarningCount})`}
              </button>
            ) : null}
            <label className="confirmBox">
              <input type="checkbox" checked={needsDangerousConfirm} onChange={(event) => setNeedsDangerousConfirm(event.target.checked)} />
              <span>I understand this rule set can auto-remove, auto-ban, or broadly filter content.</span>
            </label>
          </article>

          <article className="panel testPanel">
            <div className="panelHeader compact">
              <div>
                <h2>Live rule tester</h2>
                <p>Matches the current policy against recent subreddit content.</p>
              </div>
              <button className="btn subtle" onClick={() => void runTest()}>Run</button>
            </div>
            <div className="testerSummary">
              <div className="miniMetric"><span>Allowed</span><strong>{testResults ? testResults.decisions.filter((decision) => decision.status === 'allowed').length : payload?.livePreview.filter((decision) => decision.status === 'allowed').length ?? 0}</strong></div>
              <div className="miniMetric"><span>Escalated</span><strong>{testResults ? testResults.decisions.filter((decision) => decision.status === 'escalated').length : payload?.livePreview.filter((decision) => decision.status === 'escalated').length ?? 0}</strong></div>
              <div className="miniMetric"><span>Removed</span><strong>{testResults ? testResults.decisions.filter((decision) => decision.status === 'removed').length : payload?.livePreview.filter((decision) => decision.status === 'removed').length ?? 0}</strong></div>
            </div>
            <div className="decisionList">
              {(testResults?.decisions ?? payload?.livePreview ?? []).map((decision) => (
                <div key={decision.sample.id} className={`decisionCard ${decision.color}`}>
                  <div className="decisionHeader">
                    <strong>{decision.sample.author}</strong>
                    <span>{decision.status.toUpperCase()}</span>
                  </div>
                  <div className="decisionTitle">{decision.sample.title}</div>
                  <div className="decisionMeta">{decision.explanation}</div>
                  <div className="decisionMeta">{decision.conditions.slice(0, 2).join(' • ') || 'No triggered conditions'}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel dashboardPanel">
            <div className="panelHeader compact">
              <div>
                <h2>Operational dashboard</h2>
                <p>Deployment analytics, offenders, and snapshots.</p>
              </div>
            </div>
            <div className="dashboardGrid">
              <div className="miniMetric"><span>Deploys</span><strong>{payload?.analytics.deployCount ?? 0}</strong></div>
              <div className="miniMetric"><span>Rollbacks</span><strong>{payload?.analytics.rollbackCount ?? 0}</strong></div>
              <div className="miniMetric"><span>Test runs</span><strong>{payload?.analytics.testRuns ?? 0}</strong></div>
              <div className="miniMetric"><span>Snapshots</span><strong>{payload?.events.length ?? 0}</strong></div>
            </div>
            <div className="listBlock">
              <h3>Repeated offenders</h3>
              {(payload?.analytics.repeatedOffenders ?? []).length === 0 ? (
                <div className="emptyState">No repeated offenders yet.</div>
              ) : (
                payload?.analytics.repeatedOffenders.map((offender) => (
                  <div key={offender.author} className="listRow">
                    <span>{offender.author}</span>
                    <span>{offender.hits} hits</span>
                  </div>
                ))
              )}
            </div>
            <div className="listBlock">
              <h3>Previous deployed rules</h3>
              {previousDeploymentRules.length === 0 ? <div className="emptyState">No snapshots yet.</div> : previousDeploymentRules.map((snapshot) => (
                <div key={`${snapshot.version}-${snapshot.updatedAt}`} className="snapshotCard">
                  <div className="snapshotHeader">
                    <strong>v{snapshot.version}</strong>
                    <span>{relativeTime(snapshot.updatedAt)} · {snapshot.updatedBy}</span>
                  </div>
                  <div className="snapshotNote">{snapshot.note}</div>
                  <button
                    className="btn subtle snapshotToggle"
                    onClick={() => toggleSnapshotRules(`${snapshot.version}-${snapshot.updatedAt}`)}
                  >
                    {expandedSnapshotIds.includes(`${snapshot.version}-${snapshot.updatedAt}`) ? 'Hide rules' : 'View rules'}
                  </button>
                  {expandedSnapshotIds.includes(`${snapshot.version}-${snapshot.updatedAt}`) ? (
                    <div className="snapshotRules">
                      {snapshot.rules.length === 0 ? (
                        <div className="emptyState compact">No rule details available.</div>
                      ) : snapshot.rules.map((rule) => (
                        <div key={`${snapshot.version}-${rule.name}`} className="snapshotRuleRow">
                          <div className="snapshotRuleTop">
                            <strong>{rule.name}</strong>
                            <span className={`statusPill ${rule.enabled ? 'good' : 'bad'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                            <span className="statusPill">{rule.severity}</span>
                          </div>
                          <div className="snapshotRuleActions">Actions: {(rule.actions.length ? rule.actions : ['none']).join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <article className="panel deployPanel">
            <div className="panelHeader compact">
              <div>
                <h2>Deploy and rollback</h2>
                <p>Store a snapshot before every deployment.</p>
              </div>
            </div>
            <textarea className="noteField" placeholder="Deployment note" value={deployNote} onChange={(event) => setDeployNote(event.target.value)} />
            <div className="buttonRow">
              <button className="btn subtle" onClick={() => void rollbackRules()}>Rollback latest</button>
              <button className="btn primary" onClick={() => void deployRules(needsDangerousConfirm)} disabled={pendingDeploy}>Deploy live</button>
            </div>
            <div className="inlineNote">Dangerous rules require confirmation before activation.</div>
          </article>

            <article className="panel juryPanel">
              <div className="panelHeader compact">
                <div>
                  <h2>Jury verdict board</h2>
                  <p>Pending cases sent to multi-mod review.</p>
                </div>
                <button className="btn subtle" onClick={() => void loadInitial()} disabled={isLoadingDashboard || pendingDeploy}>{isLoadingDashboard ? <><span className="spinner"/> Refreshing…</> : 'Refresh'}</button>
              </div>
              {(!juryPending || juryPending.length === 0) ? (
                <div className="emptyState">No pending jury cases.</div>
              ) : (
                juryPending.map((c: any) => (
                  <div key={c.id} className="juryCard">
                    <div className="juryHeader">
                      <strong>{c.postId}</strong>
                      <span>{c.priority?.toUpperCase() ?? 'MED'}</span>
                    </div>
                    <div className="juryBody">
                      <div className="juryReason">{c.reason}</div>
                      <div className="juryMeta">{c.contextNotes}</div>
                      <div className="juryVotes">Remove: {c.votes?.remove ?? 0} · Approve: {c.votes?.approve ?? 0} · Abstain: {c.votes?.abstain ?? 0}</div>
                    </div>
                    <div className="juryActions">
                      <button className="btn danger" onClick={() => void voteOnCase(c.id, 'remove')}>Vote Remove</button>
                      <button className="btn" onClick={() => void voteOnCase(c.id, 'approve')}>Vote Approve</button>
                      <button className="btn subtle" onClick={() => void voteOnCase(c.id, 'abstain')}>Abstain</button>
                      <button className="btn subtle" onClick={() => {
                        const reason = prompt('Flag reason:', c.reason || '');
                        if (reason) {
                          void flagPost(c.postId, reason, 'medium');
                        }
                      }}>📍 Flag</button>
                    </div>
                  </div>
                ))
              )}
              <div className="panelHeader compact" style={{ marginTop: 12 }}>
                <div>
                  <h3>Resolved cases</h3>
                </div>
              </div>
              {(juryResolved && juryResolved.length) ? (
                juryResolved.map((c: any) => (
                  <div key={c.id} className="listRow">
                    <span>{c.postId} · {c.finalVerdict ? c.finalVerdict.toUpperCase() : c.status}</span>
                    <span>{relativeTime(c.resolvedAt ?? c.createdAt)}</span>
                  </div>
                ))
              ) : (
                <div className="emptyState">No resolved cases.</div>
              )}
            </article>

            <article className="panel archivedPostsPanel">
              <div className="panelHeader compact">
                <div>
                  <h2>ARCHIVED POSTS</h2>
                  <p>Unified log of flagged content and moderation removals.</p>
                </div>
                <button className="btn subtle" onClick={() => void loadInitial()} disabled={isLoadingDashboard || pendingDeploy}>{isLoadingDashboard ? <><span className="spinner"/> Refreshing…</> : 'Refresh'}</button>
              </div>
              {archivedItems.length === 0 ? (
                <div className="emptyState">No archived or flagged posts.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                  {archivedItems.map((item) => (
                    <div key={item.id} className="flagCard" style={{ borderLeft: item.type === 'removed' ? '4px solid var(--danger)' : '4px solid var(--warning)', padding: '12px' }}>
                      <div className="flagHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{item.postId}</strong>
                        <span className={`priorityBadge ${item.type === 'removed' ? 'high' : 'medium'}`} style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                          {item.type}
                        </span>
                      </div>
                      <div className="flagBody" style={{ marginBottom: '8px' }}>
                        <div className="flagReason" style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>{item.reason}</div>
                        <div className="flagMeta" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {item.detail} · {relativeTime(item.timestamp)}
                        </div>
                      </div>
                      <div className="flagActions" style={{ display: 'flex', gap: '8px' }}>
                        <a
                          className="btn subtle"
                          href={`https://www.reddit.com/r/modcluster_m_dev/comments/${item.postId.replace('t3_', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '11px', padding: '6px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          🔗 Link
                        </a>
                        <button
                          className="btn subtle"
                          onClick={() => {
                            alert(`Post Details:\nPost ID: ${item.postId}\nType: ${item.type.toUpperCase()}\nReason/Verdict: ${item.reason}\nActivity Log: ${item.detail}\nTime: ${new Date(item.timestamp).toLocaleString()}`);
                          }}
                          style={{ fontSize: '11px', padding: '6px 12px' }}
                        >
                          👁 Quick View
                        </button>
                        {item.type === 'flagged' && (
                          <button
                            className="btn subtle"
                            onClick={() => void unflagPost(item.postId)}
                            style={{ fontSize: '11px', padding: '6px 12px', color: '#ffbac0' }}
                          >
                            ✕ Unflag
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>



          <article className="panel feedPanel">
            <div className="panelHeader compact">
              <div>
                <h2>Recent activity</h2>
                <p>Operational events from Redis.</p>
              </div>
            </div>
            <div className="activityFeed">
              {(payload?.activity ?? []).slice(0, 6).map((entry) => (
                <div key={entry.id} className="activityItem">
                  <div>
                    <strong>{entry.action}</strong>
                    <p>{entry.detail ?? 'No detail'}</p>
                  </div>
                  <span>{relativeTime(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          </article>


        </aside>
      </main>

      <footer className="footerBar">
        <span>{parseStatus}</span>
        <span>{yamlError ?? 'Live preview updates as you type'}</span>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
