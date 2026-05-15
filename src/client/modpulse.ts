console.log('[ModPulse Web] DASHBOARD V2.3 PROGRESSIVE DISCLOSURE ACTIVE');

type DashboardPayload = {
  meta: {
    subredditId: string | null;
    username: string | null;
    now: number;
  };
  handover: {
    active: {
      author: string;
      timestamp: number;
      activeSituations: string;
      usersToWatch: string;
      priorityPosts: string;
      notes: string;
    } | null;
    history: Array<{
      author: string;
      timestamp: number;
      activeSituations: string;
      usersToWatch: string;
      priorityPosts: string;
      notes: string;
    }>;
  };
  jury: {
    pending: Array<{
      id: string;
      postId: string;
      createdAt: number;
      createdBy: string;
      reason: string;
      ruleCitation: string;
      contextNotes: string;
      votes: { approve: number; remove: number; abstain: number };
      votedModerators: string[];
      finalVerdict: 'approve' | 'remove' | null;
      status: 'pending' | 'resolved';
      priority: 'low' | 'medium' | 'high';
      resolvedAt?: number;
      ai: {
        summary: string;
        suggestedAction: string;
        confidence: string;
      };
    }>;
  };
  activity: Array<{
    id: string;
    action: string;
    moderator: string | null;
    detail: string | null;
    tone: 'good' | 'warn' | 'bad' | 'soft';
    timestamp: number;
  }>;
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
    metricsSource: 'reddit' | 'redis';
  };
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const toastEl = byId<HTMLDivElement>('toast');
const showToast = (message: string) => {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  window.setTimeout(() => toastEl.classList.remove('show'), 2200);
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });

const relativeTime = (timestamp: number) => {
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return `${Math.floor(deltaHours / 24)}d ago`;
};

const formatClockTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
};

const getInsight = (juryCases: any[], usersToWatch: string) => {
  const userCount = usersToWatch ? usersToWatch.split(',').filter(u => u.trim()).length : 0;
  if (juryCases.length > 0 && userCount > 0) {
    return "⚠️ Multiple moderation signals active — review recommended";
  }
  if (juryCases.length > 0) {
    return "⚠️ Active review in progress — community decisions pending";
  }
  if (userCount > 0) {
    return "👀 Monitoring flagged users across shifts";
  }
  return "No ongoing issues detected across recent moderation activity";
};

const getHandoverConfidence = (active: any) => {
  if (!active) return "⚠️ No active handover";
  const now = Date.now();
  const age = now - active.timestamp;
  const ONE_HOUR = 60 * 60 * 1000;
  if (age < ONE_HOUR) return "🟢 Handover up to date";
  if (age < 4 * ONE_HOUR) return "🟡 Handover may be outdated";
  return "⚠️ Handover likely outdated";
};
const renderHero = (payload: DashboardPayload) => {
  const heroTextEl = byId<HTMLDivElement>('heroText');
  const heroSubEl = byId<HTMLDivElement>('heroSub');
  const heroPanelEl = byId<HTMLDivElement>('heroPanel');
  const insightEl = byId<HTMLDivElement>('insightLine');
  
  const juryCount = payload.jury.pending.length;
  const activeHandover = payload.handover.active;
  const usersToWatch = (activeHandover?.usersToWatch || '').trim();
  
  if (juryCount > 0) {
    heroTextEl.innerHTML = `⚠️ ${juryCount} case${juryCount > 1 ? 's' : ''} pending`;
    heroSubEl.innerHTML = `Active jury review required for consistency.`;
    heroPanelEl.classList.add('warn');
  } else {
    heroTextEl.innerHTML = `🟢 System clear`;
    heroSubEl.innerHTML = `No pending actions. You're good to go.`;
    heroPanelEl.classList.remove('warn');
  }

  insightEl.textContent = getInsight(payload.jury.pending, usersToWatch);
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  byId('lastUpdated').textContent = `Last updated: ${timeStr}`;
};

const renderJury = (payload: DashboardPayload) => {
  const list = byId<HTMLDivElement>('juryList');
  const cases = payload.jury.pending;

  if (!cases.length) {
    list.innerHTML = `
      <div class="emptyState">
        <span class="dim">No active jury cases. 💡 Tip: Flag borderline posts to avoid inconsistent decisions.</span>
      </div>`;
    return;
  }

  list.innerHTML = cases.map(c => {
    const hasVoted = payload.meta.username && c.votedModerators.includes(payload.meta.username);
    
    return `
      <div class="juryCard">
        <div class="juryTitle">${escapeHtml(c.postId)}</div>
        <div class="juryReason">${escapeHtml(c.reason || 'Pending review')}</div>
        <div class="juryMeta">
          Flagged ${relativeTime(c.createdAt)} • ${escapeHtml(c.ruleCitation || 'General review')}
        </div>
        <div class="juryActions">
          ${hasVoted ? `
            <div class="voteStatus">✅ Your vote recorded</div>
          ` : `
            <button class="btn btnApprove btnSmall" data-id="${c.id}" data-action="approve">Approve</button>
            <button class="btn btnRemove btnSmall" data-id="${c.id}" data-action="remove">Remove</button>
          `}
        </div>
      </div>
    `;
  }).join('');
};

const renderHandover = (payload: DashboardPayload) => {
  const summary = byId<HTMLDivElement>('handoverSummary');
  const watchlist = byId<HTMLDivElement>('watchlistContent');
  const watchlistTitle = byId<HTMLHeadingElement>('watchlistTitle');
  const shiftContextPanel = byId<HTMLDivElement>('shiftContext');
  const confidenceEl = byId<HTMLSpanElement>('handoverConfidence');
  const active = payload.handover.active;

  confidenceEl.textContent = getHandoverConfidence(active);

  if (!active) {
    summary.innerHTML = `
      <div class="emptyState">
        <span class="dim">Start your shift by adding context for the next moderator.</span>
      </div>`;
    watchlist.innerHTML = `<div class="emptyState">No users on watchlist</div>`;
    watchlistTitle.textContent = 'Watchlist • 0 users';
    shiftContextPanel.classList.remove('watchlistActive');
    return;
  }

  summary.innerHTML = `
    <div class="summaryItem">
      <div class="summaryLabel">Active Situations</div>
      <div class="summaryValue">${escapeHtml(active.activeSituations || 'None')}</div>
    </div>
    <div class="summaryItem">
      <div class="summaryLabel">Priority Posts</div>
      <div class="summaryValue">${escapeHtml(active.priorityPosts || 'None')}</div>
    </div>
    <div class="summaryItem">
      <div class="summaryLabel">Notes</div>
      <div class="summaryValue">${escapeHtml(active.notes || 'None')}</div>
    </div>
  `;

  const usersToWatch = (active.usersToWatch || '').trim();
  if (usersToWatch) {
    const users = usersToWatch.split(',').filter(u => u.trim());
    watchlistTitle.textContent = `Watchlist • ${users.length} user${users.length > 1 ? 's' : ''}`;
    watchlist.innerHTML = users.map(u => `
      <div class="watchItem">
        <span class="watchUser">${escapeHtml(u.trim())}</span>
        <span class="watchReason">Shift Monitor</span>
      </div>
    `).join('');
    shiftContextPanel.classList.add('watchlistActive');
  } else {
    watchlistTitle.textContent = 'Watchlist • 0 users';
    watchlist.innerHTML = `<div class="emptyState">No users on watchlist</div>`;
    shiftContextPanel.classList.remove('watchlistActive');
  }
};

const renderHealth = (payload: DashboardPayload) => {
  const h = payload.communityHealth;
  const jury = payload.jury;
  
  // 1. Update Cards
  byId('healthResponseTime').textContent = h.avgResponseMinutes ? `${h.avgResponseMinutes}m` : 'N/A';
  byId('healthSource').textContent = `Source: ${h.metricsSource.toUpperCase()}`;
  
  // Calculate Consensus Rate (Resolved / Total)
  const totalCases = (jury.pending?.length || 0) + (jury.resolved?.length || 0);
  const consensusRate = totalCases > 0 ? Math.round((jury.resolved?.length || 0) / totalCases * 100) : 100;
  byId('healthConsensus').textContent = `${consensusRate}%`;
  
  byId('healthEscalations').textContent = String(h.activeJuryCases || 0);

  // 2. Update Signals List
  const signalsList = byId<HTMLUListElement>('healthSignals');
  const signals = [];
  if (h.activeJuryCases === 0) signals.push('No active jury escalations');
  else signals.push(`${h.activeJuryCases} active jury escalation${h.activeJuryCases > 1 ? 's' : ''}`);
  
  if (h.moderatorWorkload < 30) signals.push('Low moderation workload');
  else if (h.moderatorWorkload < 70) signals.push('Moderate workload pressure');
  else signals.push('High workload detected — support may be needed');

  if (h.queueBacklog < 5) signals.push('Minimal queue pressure detected');
  else signals.push(`${h.queueBacklog} items awaiting review`);

  signalsList.innerHTML = signals.map(s => `<li>${escapeHtml(s)}</li>`).join('');

  // 3. Update Metrics Table with Status Badges
  const updateMetric = (id: string, text: string, type: 'good' | 'warn' | 'error' | 'dim') => {
    const el = byId(id);
    el.textContent = text;
    el.className = 'statusBadge ' + (type === 'good' ? '' : type);
  };

  const queueType = h.queueBacklog > 20 ? 'error' : h.queueBacklog > 10 ? 'warn' : 'good';
  updateMetric('healthQueueStatus', h.queueBacklog > 10 ? 'High' : 'Low', queueType);
  
  updateMetric('healthFillRate', '100%', 'good');
  updateMetric('healthBanBacklog', '0 open', 'good');
  updateMetric('healthReversalRate', 'N/A', 'dim');
  
  const slaType = (h.avgResponseMinutes || 0) > 30 ? 'error' : (h.avgResponseMinutes || 0) > 15 ? 'warn' : 'good';
  updateMetric('healthSlaStatus', (h.avgResponseMinutes || 0) > 30 ? 'CRITICAL' : 'OK', slaType);
};

// ── ACTIVITY TIMELINE ────────────────────────────────────
let activityTab: 'live' | 'recent' = 'live';

const renderActivity = (payload: DashboardPayload) => {
  const list = byId<HTMLDivElement>('activityList');
  const events = payload.activity ?? [];

  if (!events.length) {
    list.innerHTML = `<div class="emptyState"><span class="dim">No activity logged yet. Actions will appear here as the queue moves.</span></div>`;
    return;
  }

  // "Live feed" = most recent 6 events (newest first, already sorted by API)
  // "Recent 12" = up to 12 events
  const shown = activityTab === 'live' ? events.slice(0, 6) : events.slice(0, 12);

  list.innerHTML = shown.map(e => {
    const dotClass = `dot-${e.tone}`;
    const modBadge = e.moderator
      ? `<span class="activityMod">${escapeHtml(e.moderator)}</span>`
      : '';
    const detail = e.detail
      ? `<span class="activityDetail">${escapeHtml(e.detail)}</span>`
      : '';
    return `
      <div class="activityItem">
        <div class="activityDot ${dotClass}"></div>
        <div class="activityBody">
          <div class="activityAction">${escapeHtml(e.action)}</div>
          <div class="activityMeta">
            ${modBadge}
            ${detail}
          </div>
        </div>
        <div class="activityTime">
          <div class="timeAbsolute">${formatClockTime(e.timestamp)}</div>
          <div class="timeRelative">${relativeTime(e.timestamp)}</div>
        </div>
      </div>
    `;
  }).join('');
};

const refresh = async () => {
  try {
    const res = await fetch('/api/dashboard');
    const payload = (await res.json()) as DashboardPayload;
    
    byId('metaPill').textContent = `${payload.meta.username} • r/${payload.meta.subredditId}`;
    
    renderHero(payload);
    renderJury(payload);
    renderHandover(payload);
    renderActivity(payload);
    renderHealth(payload);
    
    (window as any).lastPayload = payload;
  } catch (err) {
    console.error('Refresh failed', err);
  }
};

const postJson = async (path: string, body: unknown) => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

(window as any).vote = async (caseId: string, action: string) => {
  console.log(`[ModPulse] Voting: ${caseId} -> ${action}`);
  try {
    const res = await postJson('/api/jury/vote', { caseId, vote: action });
    console.log('[ModPulse] Vote response:', res);
    showToast('Vote recorded');
    await refresh();
  } catch (err) {
    console.error('[ModPulse] Vote failed:', err);
    showToast('Vote failed');
  }
};

const modalBack = byId('handoverModalBack');
const juryModalBack = byId('juryModalBack');
const historyModalBack = byId('handoverHistoryModalBack');

const openModal = (el: HTMLElement) => { 
  el.classList.add('open'); 
  document.body.classList.add('modalOpen'); 
  // Auto-focus first input
  const firstInput = el.querySelector('input, textarea, select') as HTMLElement;
  if (firstInput) window.setTimeout(() => firstInput.focus(), 50);
};
const closeModal = (el: HTMLElement) => { 
  el.classList.remove('open'); 
  document.body.classList.remove('modalOpen'); 
};

const wire = () => {
  byId('refreshBtn').onclick = () => refresh();
  
  const openHandover = () => openModal(modalBack);
  const openJury = () => openModal(juryModalBack);

  byId('handoverOpenBtn').onclick = openHandover;
  byId('handoverOpenBtnQuick').onclick = openHandover;
  
  byId('handoverCloseBtn').onclick = () => closeModal(modalBack);
  byId('handoverCancelBtn').onclick = () => closeModal(modalBack);
  
  byId('handoverViewBtn').onclick = () => {
    const payload = (window as any).lastPayload as DashboardPayload;
    if (payload) {
      const body = byId('handoverHistoryBody');
      body.innerHTML = payload.handover.history.map(h => `
        <div style="border-bottom: 1px solid var(--stroke); padding: 8px 0;">
          <div style="font-weight:700; color:var(--primary); font-size:11px;">${escapeHtml(h.author)} • ${relativeTime(h.timestamp)}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:1px;">${escapeHtml(h.activeSituations || 'No context provided')}</div>
        </div>
      `).join('');
      openModal(historyModalBack);
    }
  };
  
  byId('handoverHistoryCloseBtn').onclick = () => closeModal(historyModalBack);
  byId('handoverHistoryDoneBtn').onclick = () => closeModal(historyModalBack);

  byId('juryCreateBtnQuick').onclick = openJury;
  
  byId('juryCloseBtn').onclick = () => closeModal(juryModalBack);
  byId('juryCancelBtn').onclick = () => closeModal(juryModalBack);

  // Activity Timeline Tabs
  document.querySelectorAll<HTMLButtonElement>('.activityTabBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activityTabBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activityTab = (btn.dataset.tab as 'live' | 'recent') ?? 'live';
      const payload = (window as any).lastPayload as DashboardPayload | undefined;
      if (payload) renderActivity(payload);
    });
  });
  // Health Dashboard Tabs
  document.querySelectorAll<HTMLButtonElement>('.healthTabBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.healthTabBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // For now, these just toggle visual state as the data is shared
      showToast(`${btn.textContent} view activated`);
    });
  });

  // Progressive Disclosure Toggle
  const signalsToggle = byId<HTMLButtonElement>('signalsToggle');
  const detailedSignals = byId<HTMLDivElement>('detailedSignals');

  signalsToggle.addEventListener('click', () => {
    const isHidden = detailedSignals.classList.toggle('hidden');
    signalsToggle.textContent = isHidden ? 'View detailed signals' : 'Hide detailed signals';
  });
  // Jury List Event Delegation
  const juryList = byId('juryList');
  juryList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('btnApprove') || target.classList.contains('btnRemove')) {
      const caseId = target.getAttribute('data-id');
      const action = target.getAttribute('data-action');
      if (caseId && action) {
        (window as any).vote(caseId, action);
      }
    }
  });

  byId('handoverForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await postJson('/api/handover', Object.fromEntries(fd));
    closeModal(modalBack);
    await refresh();
  };

  byId('juryForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await postJson('/api/jury/case', Object.fromEntries(fd));
    closeModal(juryModalBack);
    await refresh();
  };
};

wire();
refresh();
setInterval(refresh, 15000);
