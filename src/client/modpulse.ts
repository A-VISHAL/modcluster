console.log('[ModPulse Web] NEW DASHBOARD BUILD ACTIVE - JavaScript runtime initializing');

type DashboardPayload = {
  meta: {
    subredditId: string | null;
    username: string | null;
    now: number;
  };
  status: {
    redisConnected: boolean;
    liveModeration: boolean;
    jurySystemActive: boolean;
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
  activity: Array<{
    id: string;
    subredditId: string;
    action: string;
    moderator: string | null;
    detail: string | null;
    tone: 'good' | 'warn' | 'bad' | 'soft';
    timestamp: number;
  }>;
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
      finalVerdict: 'approve' | 'remove' | null;
      status: 'pending' | 'resolved';
      priority: 'low' | 'medium' | 'high';
      resolvedAt?: number;
      ai: {
        summary: string;
        category: string;
        similarCases: string[];
        suggestedAction: 'Remove' | 'Approve' | 'Redirect' | 'Lock thread';
        confidence: 'low' | 'medium' | 'high';
      };
    }>;
    resolved: Array<{
      id: string;
      postId: string;
      createdAt: number;
      createdBy: string;
      reason: string;
      ruleCitation: string;
      contextNotes: string;
      votes: { approve: number; remove: number; abstain: number };
      finalVerdict: 'approve' | 'remove' | null;
      status: 'pending' | 'resolved';
      priority: 'low' | 'medium' | 'high';
      resolvedAt?: number;
      ai: {
        summary: string;
        category: string;
        similarCases: string[];
        suggestedAction: 'Remove' | 'Approve' | 'Redirect' | 'Lock thread';
        confidence: 'low' | 'medium' | 'high';
      };
    }>;
  };
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
  insights: {
    headline: string;
    details: string[];
  };
};

// ============================================================================
// DEVELOPER TEST MODE
// ============================================================================
// Allows solo developers to simulate collaborative voting during testing.
// Only enabled in dev/playtest environments.

type DevModeState = {
  enabled: boolean;
  moderatorIndex: number;
};

const devModeState: DevModeState = {
  enabled: false,
  moderatorIndex: 0,
};

const devModeratorNames = ['TestMod_1', 'TestMod_2', 'TestMod_3'];

const getNextDevModerator = (): string => {
  const name = devModeratorNames[devModeState.moderatorIndex] ?? devModeratorNames[0] ?? 'TestMod_1';
  devModeState.moderatorIndex = (devModeState.moderatorIndex + 1) % devModeratorNames.length;
  return name;
};

const enableDevMode = () => {
  devModeState.enabled = true;
  devModeState.moderatorIndex = 0;
  const indicator = byId<HTMLDivElement>('devModeIndicator');
  indicator.style.display = 'block';
  console.log('[ModPulse Web] Developer Test Mode ENABLED');
};

const disableDevMode = () => {
  devModeState.enabled = false;
  const indicator = byId<HTMLDivElement>('devModeIndicator');
  indicator.style.display = 'none';
  console.log('[ModPulse Web] Developer Test Mode DISABLED');
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const toastEl = byId<HTMLDivElement>('toast');

const showToast = (message: string) => {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  window.setTimeout(() => toastEl.classList.remove('show'), 2200);
};

const chip = (label: string, tone: 'good' | 'warn' | 'bad' | 'soft') => {
  const el = document.createElement('span');
  el.className =
    tone === 'good'
      ? 'chip chipGood'
      : tone === 'warn'
        ? 'chip chipWarn'
        : tone === 'bad'
          ? 'chip chipBad'
          : 'chip chipSoft';
  el.textContent = label;
  return el;
};

const fmtTime = (ts: number) => new Date(ts).toLocaleString();

const relativeTime = (timestamp: number) => {
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
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

const renderStatus = (payload: DashboardPayload) => {
  const row = byId<HTMLDivElement>('statusRow');
  row.innerHTML = '';

  row.append(
    chip(payload.status.redisConnected ? 'Redis Connected' : 'Redis Offline', payload.status.redisConnected ? 'good' : 'bad'),
    chip(payload.status.liveModeration ? 'Live Moderation' : 'Paused', payload.status.liveModeration ? 'good' : 'warn'),
    chip(payload.status.jurySystemActive ? 'Jury System Active' : 'Jury Disabled', payload.status.jurySystemActive ? 'good' : 'warn')
  );
};

const renderMeta = (payload: DashboardPayload) => {
  const meta = byId<HTMLDivElement>('metaPill');
  const who = payload.meta.username ? `u/${payload.meta.username}` : 'unknown user';
  const where = payload.meta.subredditId ? payload.meta.subredditId : 'unknown subreddit';
  meta.textContent = `${who} • ${where} • ${new Date(payload.meta.now).toLocaleTimeString()}`;
};

const renderHeroMetrics = (payload: DashboardPayload) => {
  byId<HTMLDivElement>('mQueue').textContent = String(payload.communityHealth.queueBacklog);
  byId<HTMLDivElement>('mReports').textContent = String(payload.communityHealth.reportsToday);
  byId<HTMLDivElement>('mToxic').textContent = String(payload.communityHealth.toxicityAlerts);
  byId<HTMLDivElement>('mBurnout').textContent = payload.communityHealth.burnoutRisk.toUpperCase();
};

const renderHeroSummary = (payload: DashboardPayload) => {
  const titleEl = document.querySelector<HTMLDivElement>('.heroTitle');
  const bodyEl = document.querySelector<HTMLDivElement>('.heroBody');
  if (!titleEl || !bodyEl) return;

  const ins = payload.insights;
  titleEl.textContent = ins.headline || 'Operational update';

  if (!ins.details || ins.details.length === 0) {
    bodyEl.textContent = 'No significant moderation escalations detected in the recent operational window.';
    return;
  }

  const bullets = ins.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('');
  bodyEl.innerHTML = `
    <ul class="heroInsights">
      ${bullets}
    </ul>
  `;
};

const renderHandover = (payload: DashboardPayload) => {
  const body = byId<HTMLDivElement>('handoverBody');
  const active = payload.handover.active;

  if (!active) {
    body.innerHTML = `
      <div class="kv">
        <div class="kvLabel">No active handover</div>
        <div class="kvValue">Create one to share shift context with the next moderator. This is persisted in Redis per subreddit.</div>
      </div>
      <div class="kvGrid">
        <div class="kv"><div class="kvLabel">Active situations</div><div class="kvValue">—</div></div>
        <div class="kv"><div class="kvLabel">Users to watch</div><div class="kvValue">—</div></div>
        <div class="kv"><div class="kvLabel">Priority posts</div><div class="kvValue">—</div></div>
        <div class="kv"><div class="kvLabel">Moderator notes</div><div class="kvValue">—</div></div>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div class="kv">
      <div class="kvLabel">Active handover</div>
      <div class="kvValue"><b>${escapeHtml(active.author)}</b> • ${escapeHtml(fmtTime(active.timestamp))}</div>
    </div>
    <div class="kvGrid">
      <div class="kv"><div class="kvLabel">Active situations</div><div class="kvValue">${escapeHtml(active.activeSituations || 'None')}</div></div>
      <div class="kv"><div class="kvLabel">Users to watch</div><div class="kvValue">${escapeHtml(active.usersToWatch || 'None')}</div></div>
      <div class="kv"><div class="kvLabel">Priority posts</div><div class="kvValue">${escapeHtml(active.priorityPosts || 'None')}</div></div>
      <div class="kv"><div class="kvLabel">Moderator notes</div><div class="kvValue">${escapeHtml(active.notes || 'None')}</div></div>
    </div>
  `;
};

const renderJury = (payload: DashboardPayload) => {
  const list = byId<HTMLDivElement>('juryList');
  const cases = payload.jury.pending;
  const resolved = payload.jury.resolved;

  if (!cases.length && !resolved.length) {
    list.innerHTML = `
      <div class="case">
        <div class="caseTitle">No active jury cases</div>
        <div class="caseMeta">Flagged moderation cases will appear here for collaborative voting when needed.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  const renderCase = (juryCase: (typeof cases)[number], bucket: 'pending' | 'resolved') => {
    const el = document.createElement('div');
    el.className = 'case';

    const priorityTone = juryCase.priority === 'high' ? 'chipBad' : juryCase.priority === 'medium' ? 'chipWarn' : 'chipSoft';
    const verdictTone = juryCase.finalVerdict === 'remove' ? 'chipBad' : juryCase.finalVerdict === 'approve' ? 'chipGood' : 'chipSoft';
    const verdictLabel =
      bucket === 'resolved'
        ? `Verdict: ${(juryCase.finalVerdict ?? 'PENDING').toUpperCase()}`
        : juryCase.finalVerdict
          ? `Verdict: ${juryCase.finalVerdict.toUpperCase()}`
          : 'Verdict: PENDING';

    const threshold = 2;
    const progress = Math.min(100, Math.round((Math.max(juryCase.votes.approve, juryCase.votes.remove) / threshold) * 100));
    const progressTone =
      juryCase.votes.remove >= threshold
        ? 'linear-gradient(90deg, rgba(255,92,122,0.75), rgba(255,204,102,0.55))'
        : juryCase.votes.approve >= threshold
          ? 'linear-gradient(90deg, rgba(67,243,197,0.75), rgba(45,212,255,0.55))'
          : 'linear-gradient(90deg, rgba(67,243,197,0.55), rgba(124,92,255,0.55))';

    el.innerHTML = `
      <div class="caseTop">
        <div>
          <div class="caseTitle">${escapeHtml(juryCase.reason || 'Jury review')}</div>
          <div class="caseMeta">
            <b>Post</b>: ${escapeHtml(juryCase.postId)} • <b>Rule</b>: ${escapeHtml(juryCase.ruleCitation || '—')}<br/>
            <b>Opened</b>: ${escapeHtml(fmtTime(juryCase.createdAt))} by ${escapeHtml(juryCase.createdBy)}
            ${bucket === 'resolved' && juryCase.resolvedAt ? `<br/><b>Resolved</b>: ${escapeHtml(fmtTime(juryCase.resolvedAt))}` : ``}
          </div>
        </div>
        <div class="caseTags">
          <span class="chip ${priorityTone}">Priority: ${juryCase.priority.toUpperCase()}</span>
          <span class="chip ${verdictTone}">${verdictLabel}</span>
        </div>
      </div>
      <div class="progress" aria-hidden="true"><div class="progressFill" style="width:${progress}%;background:${progressTone}"></div></div>
      <div class="voteRow">
        <div class="voteCounts">
          Votes: <b>${juryCase.votes.approve}</b> approve / <b>${juryCase.votes.remove}</b> remove / <b>${juryCase.votes.abstain}</b> abstain
        </div>
        <div class="btnGroup">
          ${
            bucket === 'pending'
              ? `
          <button class="btn btnGhost" data-action="approve" data-id="${escapeHtml(juryCase.id)}" type="button">Approve</button>
          <button class="btn btnGhost" data-action="remove" data-id="${escapeHtml(juryCase.id)}" type="button">Remove</button>
          <button class="btn btnGhost" data-action="abstain" data-id="${escapeHtml(juryCase.id)}" type="button">Abstain</button>
          `
              : `<span class="chip chipSoft"><span class="pulseDot"></span>&nbsp;Resolved</span>`
          }
        </div>
      </div>
      <div class="aiPanel" data-ai="${escapeHtml(juryCase.id)}">
        <div class="aiTitleRow">
          <div class="aiTitle">AI moderation summary</div>
          <span class="chip chipSoft">Suggest: ${escapeHtml(juryCase.ai.suggestedAction)} • ${escapeHtml(juryCase.ai.confidence.toUpperCase())}</span>
        </div>
        <div class="aiBody">
          <div class="aiLine"><b>Category</b>: ${escapeHtml(juryCase.ai.category)}</div>
          <div class="aiLine"><b>Summary</b>: ${escapeHtml(juryCase.ai.summary)}</div>
          <div>
            <div class="aiLine"><b>Similar cases</b>:</div>
            <ul class="aiList">
              ${juryCase.ai.similarCases.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;

    list.appendChild(el);
  };

  if (cases.length) {
    for (const juryCase of cases) renderCase(juryCase, 'pending');
  }

  if (resolved.length) {
    const divider = document.createElement('div');
    divider.className = 'skeleton';
    divider.textContent = 'Recently resolved';
    list.appendChild(divider);
    for (const juryCase of resolved) renderCase(juryCase, 'resolved');
  }

  list.querySelectorAll<HTMLButtonElement>('button[data-action][data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action || !id) return;

      await vote(id, action as 'approve' | 'remove' | 'abstain');
    });
  });

  list.querySelectorAll<HTMLElement>('.aiPanel').forEach((panel) => {
    const title = panel.querySelector<HTMLElement>('.aiTitleRow');
    if (!title) return;
    title.addEventListener('click', () => panel.classList.toggle('open'));
  });
};

const renderHealth = (payload: DashboardPayload) => {
  const grid = byId<HTMLDivElement>('healthGrid');
  const h = payload.communityHealth;
  const burnoutTone = h.burnoutRisk === 'high' ? 'chipBad' : h.burnoutRisk === 'medium' ? 'chipWarn' : 'chipGood';
  const hasOperationalSignals =
    h.reportsToday > 0 ||
    h.toxicityAlerts > 0 ||
    h.queueBacklog > 0 ||
    h.activeJuryCases > 0 ||
    h.moderationActions24h > 0;

  grid.innerHTML = '';
  const stat = (label: string, value: string, extraChip?: HTMLElement) => {
    const el = document.createElement('div');
    el.className = 'stat';
    el.innerHTML = `<div class="statLabel">${escapeHtml(label)}</div><div class="statValue">${escapeHtml(value)}</div>`;
    if (extraChip) {
      extraChip.style.marginTop = '10px';
      el.appendChild(extraChip);
    }
    return el;
  };

  if (!hasOperationalSignals) {
    const empty = document.createElement('div');
    empty.className = 'activityEmpty';
    empty.innerHTML = `
      <div class="activityEmptyTitle">Community operating normally</div>
      <div class="activityEmptyBody">No active jury cases, unresolved reports, or escalation signals in the last 24 hours.</div>
    `;
    grid.appendChild(empty);
    return;
  }

  const responseMinutes = h.avgResponseMinutes === null ? 'N/A' : `${h.avgResponseMinutes}m`;

  grid.append(
    stat('Reports today', String(h.reportsToday)),
    stat('Toxicity alerts', String(h.toxicityAlerts)),
    stat('Queue backlog', String(h.queueBacklog)),
    stat('Unresolved reports', String(h.unresolvedReports)),
    stat('Active jury cases', String(h.activeJuryCases)),
    stat('Moderation actions (24h)', String(h.moderationActions24h)),
    stat('Removals today', String(h.removalsToday)),
    stat('Escalation frequency', `${h.escalationFrequency}%`),
    stat('Avg response time', responseMinutes, (() => {
      const sourceChip = document.createElement('span');
      sourceChip.className = 'chip chipSoft';
      sourceChip.textContent = `Source: ${h.metricsSource.toUpperCase()}`;
      return sourceChip;
    })()),
    stat('Moderator workload', `${h.moderatorWorkload}%`, (() => {
      const el = document.createElement('span');
      el.className = `chip ${burnoutTone}`;
      el.textContent = `Burnout: ${h.burnoutRisk.toUpperCase()}`;
      return el;
    })())
  );
};

const renderActivity = (payload: DashboardPayload) => {
  const feed = byId<HTMLDivElement>('activityFeed');
  const items = payload.activity;

  if (!items.length) {
    feed.innerHTML = `
      <div class="activityEmpty">
        <div class="activityEmptyTitle">No recent escalations</div>
        <div class="activityEmptyBody">Community operating normally. Jury votes, handovers, and moderation lifecycle events will appear here as activity occurs.</div>
      </div>
    `;
    return;
  }

  feed.innerHTML = items
    .slice(0, 12)
    .map((item, index, list) => {
      const toneClass =
        item.tone === 'good' ? 'activityDotGood' : item.tone === 'bad' ? 'activityDotBad' : item.tone === 'warn' ? 'activityDotWarn' : 'activityDotSoft';
      const chipClass =
        item.tone === 'good' ? 'chipGood' : item.tone === 'bad' ? 'chipBad' : item.tone === 'warn' ? 'chipWarn' : 'chipSoft';

      return `
        <div class="activityItem" style="animation-delay:${Math.min(index * 45, 180)}ms">
          <div class="activityRail">
            <div class="activityDot ${toneClass}"></div>
            ${index === list.length - 1 ? '' : '<div class="activityLine"></div>'}
          </div>
          <div class="activityBody">
            <div class="activityTop">
              <div class="activityAction">${escapeHtml(item.action)}</div>
              <div class="activityTime">${escapeHtml(relativeTime(item.timestamp))}</div>
            </div>
            <div class="activityMeta">
              <span class="chip ${chipClass}">${item.moderator ? escapeHtml(item.moderator) : 'system'}</span>
              <span class="activityDetail">${escapeHtml(item.detail || 'Operational update recorded.')}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
};

const fetchDashboard = async (): Promise<DashboardPayload> => {
  console.log('[ModPulse Web] dashboard refresh requested');
  const res = await fetch('/api/dashboard', { method: 'GET' });
  if (!res.ok) throw new Error(`dashboard fetch failed: ${res.status}`);
  const payload = (await res.json()) as DashboardPayload;
  console.log('[ModPulse Web] dashboard refresh received', {
    subredditId: payload.meta.subredditId,
    activityCount: payload.activity.length,
    pendingCases: payload.jury.pending.length,
    resolvedCases: payload.jury.resolved.length,
  });
  return payload;
};

const postJson = async (path: string, body: unknown) => {
  console.log('[ModPulse Web] POST request', { path, body });
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  const payload = (await res.json()) as unknown;
  console.log('[ModPulse Web] POST response', { path, status: res.status, payload });
  return payload;
};

const vote = async (caseId: string, vote: 'approve' | 'remove' | 'abstain') => {
  try {
    console.log('[ModPulse Web] jury vote clicked', { caseId, vote, devMode: devModeState.enabled });

    const payload: { caseId: string; vote: string; devMode?: boolean; simulatedModerator?: string } = {
      caseId,
      vote,
    };

    // If dev mode is enabled, generate simulated moderator and include flag
    if (devModeState.enabled) {
      payload.devMode = true;
      payload.simulatedModerator = getNextDevModerator();
      console.log('[ModPulse Web] Dev mode vote:', { moderator: payload.simulatedModerator });
    }

    const result = (await postJson('/api/jury/vote', payload)) as { ok: boolean; duplicate?: boolean; resolved?: boolean };
    if (result.duplicate) showToast('Already voted on this case.');
    else showToast(result.resolved ? 'Vote recorded — case resolved.' : 'Vote recorded.');
    await refresh();
  } catch (err) {
    console.error(err);
    showToast('Vote failed. Check logs.');
  }
};

const modalBack = byId<HTMLDivElement>('handoverModalBack');
const openHandoverModal = () => {
  modalBack.classList.add('open');
  modalBack.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modalOpen');
};
const closeHandoverModal = () => {
  modalBack.classList.remove('open');
  modalBack.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modalOpen');
};

const juryModalBack = byId<HTMLDivElement>('juryModalBack');
const openJuryModal = () => {
  juryModalBack.classList.add('open');
  juryModalBack.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modalOpen');
};
const closeJuryModal = () => {
  juryModalBack.classList.remove('open');
  juryModalBack.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modalOpen');
};

const handoverHistoryModalBack = byId<HTMLDivElement>('handoverHistoryModalBack');
const openHandoverHistoryModal = () => {
  handoverHistoryModalBack.classList.add('open');
  handoverHistoryModalBack.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modalOpen');
};
const closeHandoverHistoryModal = () => {
  handoverHistoryModalBack.classList.remove('open');
  handoverHistoryModalBack.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modalOpen');
};

const wireModal = () => {
  byId<HTMLButtonElement>('handoverOpenBtn').addEventListener('click', () => openHandoverModal());
  byId<HTMLButtonElement>('handoverCloseBtn').addEventListener('click', () => closeHandoverModal());
  byId<HTMLButtonElement>('handoverCancelBtn').addEventListener('click', () => closeHandoverModal());
  modalBack.addEventListener('click', (e) => {
    if (e.target === modalBack) closeHandoverModal();
  });
  modalBack.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHandoverModal();
  });

  const form = byId<HTMLFormElement>('handoverForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      activeSituations: String(fd.get('activeSituations') ?? ''),
      usersToWatch: String(fd.get('usersToWatch') ?? ''),
      priorityPosts: String(fd.get('priorityPosts') ?? ''),
      notes: String(fd.get('notes') ?? ''),
    };

    try {
      await postJson('/api/handover', payload);
      showToast('Handover saved.');
      form.reset();
      closeHandoverModal();
      await refresh();
    } catch (err) {
      console.error(err);
      showToast('Failed to save handover. Check logs.');
    }
  });
};

const renderHandoverTimeline = (payload: DashboardPayload) => {
  const body = byId<HTMLDivElement>('handoverHistoryBody');
  const items = payload.handover.history;

  if (!items.length) {
    body.innerHTML = `<div class="skeleton">No handovers yet for this subreddit.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="timeline">
      ${items
        .slice(0, 5)
        .map((card) => {
          const summary = [
            card.activeSituations ? `Active: ${card.activeSituations}` : '',
            card.usersToWatch ? `Watch: ${card.usersToWatch}` : '',
            card.priorityPosts ? `Priority: ${card.priorityPosts}` : '',
            card.notes ? `Notes: ${card.notes}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          const compact = summary.length > 260 ? `${summary.slice(0, 260)}…` : summary || 'No details.';
          return `
          <div class="tlItem">
            <div class="tlTop">
              <div class="tlTitle">${escapeHtml(card.author)}</div>
              <div class="tlTime">${escapeHtml(fmtTime(card.timestamp))}</div>
            </div>
            <div class="tlSummary">${escapeHtml(compact)}</div>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
};

const wireTopActions = () => {
  byId<HTMLButtonElement>('refreshBtn').addEventListener('click', async () => {
    showToast('Refreshing…');
    await refresh();
  });

  byId<HTMLButtonElement>('handoverViewBtn').addEventListener('click', async () => {
    // Keep it simple/reliable in playtest: just scroll to the panel.
    byId<HTMLElement>('handoverCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  byId<HTMLButtonElement>('handoverHistoryBtn').addEventListener('click', async () => {
    if (lastPayload) {
      renderHandoverTimeline(lastPayload);
      openHandoverHistoryModal();
    } else {
      showToast('Loading… try again in a moment.');
    }
  });

  // Dev mode toggle
  const devModeCheckbox = byId<HTMLInputElement>('devModeCheckbox');
  devModeCheckbox.addEventListener('change', (e) => {
    const isChecked = (e.target as HTMLInputElement).checked;
    if (isChecked) {
      enableDevMode();
      showToast('🛠 Developer Test Mode enabled. Simulated votes bypass duplicate checks.');
    } else {
      disableDevMode();
      showToast('Developer Test Mode disabled. Back to production behavior.');
    }
  });
};

let lastPayload: DashboardPayload | null = null;

const refresh = async () => {
  console.log('[ModPulse Web] refreshing dashboard state');
  const payload = await fetchDashboard();
  lastPayload = payload;

  renderStatus(payload);
  renderMeta(payload);
  renderHeroMetrics(payload);
  renderHeroSummary(payload);
  renderHandover(payload);
  renderJury(payload);
  renderHealth(payload);
  renderActivity(payload);
};

const wireJuryModal = () => {
  byId<HTMLButtonElement>('juryCreateBtn').addEventListener('click', () => openJuryModal());
  byId<HTMLButtonElement>('juryCloseBtn').addEventListener('click', () => closeJuryModal());
  byId<HTMLButtonElement>('juryCancelBtn').addEventListener('click', () => closeJuryModal());
  juryModalBack.addEventListener('click', (e) => {
    if (e.target === juryModalBack) closeJuryModal();
  });
  juryModalBack.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeJuryModal();
  });

  const form = byId<HTMLFormElement>('juryForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      postId: String(fd.get('postId') ?? '').trim(),
      reason: String(fd.get('reason') ?? '').trim(),
      ruleCitation: String(fd.get('ruleCitation') ?? '').trim(),
      contextNotes: String(fd.get('contextNotes') ?? '').trim(),
      priority: String(fd.get('priority') ?? 'medium'),
    };

    try {
      const result = (await postJson('/api/jury/case', payload)) as { ok: boolean; id?: string; error?: string };
      if (!result.ok) {
        showToast(result.error ?? 'Failed to create case.');
        return;
      }
      showToast('Jury case created.');
      form.reset();
      closeJuryModal();
      await refresh();
      byId<HTMLElement>('juryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      showToast('Failed to create case. Check logs.');
    }
  });
};

const wireHistoryModal = () => {
  byId<HTMLButtonElement>('handoverHistoryCloseBtn').addEventListener('click', () => closeHandoverHistoryModal());
  byId<HTMLButtonElement>('handoverHistoryDoneBtn').addEventListener('click', () => closeHandoverHistoryModal());
  handoverHistoryModalBack.addEventListener('click', (e) => {
    if (e.target === handoverHistoryModalBack) closeHandoverHistoryModal();
  });
  handoverHistoryModalBack.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHandoverHistoryModal();
  });
};

const boot = async () => {
  wireModal();
  wireTopActions();
  wireJuryModal();
  wireHistoryModal();

  try {
    await refresh();
    // Keep operational state reasonably fresh without excessive API load.
    window.setInterval(async () => {
      try {
        await refresh();
      } catch {
        // ignore background refresh failures
      }
    }, 15000);
  } catch (err) {
    console.error(err);
    showToast('Failed to load dashboard. Check server logs.');
  }
};

void boot();

