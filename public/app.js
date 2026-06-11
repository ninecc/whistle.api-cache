const state = {
  entries: [],
  events: [],
  contentTypePolicy: {},
  profile: {},
  replayHeaderPolicy: {},
  dataDir: '',
  ruleMode: 'record',
  expandedEntryId: undefined,
  eventFilter: 'all',
  fallbackTimer: undefined,
  lastEventId: 0,
  selectedEntryIds: new Set(),
  syncTimer: undefined,
  lastSyncAt: undefined,
  workspaceTab: 'list',
  managerSelectedId: undefined,
  managerBody: undefined,
  managerOriginalBody: undefined,
  managerMode: 'preview',
  managerDraft: '',
  managerSavedDraft: '',
  managerDirty: false,
  managerFilters: {
    search: '',
    method: 'all',
    modifiedOnly: false,
    editableOnly: false,
  },
};

const diagnosticsRefreshInterval = 1000;
const fallbackRefreshInterval = 30000;
const eventSyncDelay = 250;

const elements = {
  profileId: document.querySelector('#profileId'),
  entryCount: document.querySelector('#entryCount'),
  totalSize: document.querySelector('#totalSize'),
  statusOverview: document.querySelector('#statusOverview'),
  matchInput: document.querySelector('#matchInput'),
  currentRuleMode: document.querySelector('#currentRuleMode'),
  freshCount: document.querySelector('#freshCount'),
  expiredCount: document.querySelector('#expiredCount'),
  hitEntryCount: document.querySelector('#hitEntryCount'),
  eventsList: document.querySelector('#eventsList'),
  eventFilterSelect: document.querySelector('#eventFilterSelect'),
  matchMethodSelect: document.querySelector('#matchMethodSelect'),
  matchUrlInput: document.querySelector('#matchUrlInput'),
  matchBodyInput: document.querySelector('#matchBodyInput'),
  matchTestBtn: document.querySelector('#matchTestBtn'),
  matchResult: document.querySelector('#matchResult'),
  searchInput: document.querySelector('#searchInput'),
  filterSelect: document.querySelector('#filterSelect'),
  ignoredQueryInput: document.querySelector('#ignoredQueryInput'),
  policyList: document.querySelector('#policyList'),
  contentTypePolicyList: document.querySelector('#contentTypePolicyList'),
  replayHeaderPolicyList: document.querySelector('#replayHeaderPolicyList'),
  toast: document.querySelector('#toast'),
  appMain: document.querySelector('#appMain'),
  cacheTable: document.querySelector('#cacheTable'),
  cacheRows: document.querySelector('#cacheRows'),
  empty: document.querySelector('#empty'),
  cacheListTab: document.querySelector('#cacheListTab'),
  requestManagerTab: document.querySelector('#requestManagerTab'),
  cacheListView: document.querySelector('#cacheListView'),
  requestManagerView: document.querySelector('#requestManagerView'),
  managerSearchInput: document.querySelector('#managerSearchInput'),
  managerMethodSelect: document.querySelector('#managerMethodSelect'),
  managerModifiedOnly: document.querySelector('#managerModifiedOnly'),
  managerEditableOnly: document.querySelector('#managerEditableOnly'),
  managerPrevBtn: document.querySelector('#managerPrevBtn'),
  managerNextBtn: document.querySelector('#managerNextBtn'),
  managerRequestList: document.querySelector('#managerRequestList'),
  managerEntryInfo: document.querySelector('#managerEntryInfo'),
  managerPreviewModeBtn: document.querySelector('#managerPreviewModeBtn'),
  managerEditModeBtn: document.querySelector('#managerEditModeBtn'),
  managerOriginalModeBtn: document.querySelector('#managerOriginalModeBtn'),
  managerFormatJsonBtn: document.querySelector('#managerFormatJsonBtn'),
  managerSaveBtn: document.querySelector('#managerSaveBtn'),
  managerRestoreBtn: document.querySelector('#managerRestoreBtn'),
  managerBodyEditor: document.querySelector('#managerBodyEditor'),
  managerBodyPreview: document.querySelector('#managerBodyPreview'),
  managerBodyNotice: document.querySelector('#managerBodyNotice'),
  error: document.querySelector('#error'),
  loadingText: document.querySelector('#loadingText'),
  syncStatusText: document.querySelector('#syncStatusText'),
  rulesBlock: document.querySelector('#rulesBlock'),
  refreshBtn: document.querySelector('#refreshBtn'),
  openDataDirBtn: undefined,
  saveIgnoredQueryBtn: document.querySelector('#saveIgnoredQueryBtn'),
  exportCacheBtn: document.querySelector('#exportCacheBtn'),
  importCacheBtn: document.querySelector('#importCacheBtn'),
  importCacheInput: document.querySelector('#importCacheInput'),
  clearE2eBtn: document.querySelector('#clearE2eBtn'),
  deleteSelectedBtn: document.querySelector('#deleteSelectedBtn'),
  ttlSelectedSelect: document.querySelector('#ttlSelectedSelect'),
  clearExpiredBtn: document.querySelector('#clearExpiredBtn'),
  deleteNeverHitBtn: document.querySelector('#deleteNeverHitBtn'),
  clearAllBtn: document.querySelector('#clearAllBtn'),
  clearEventsBtn: document.querySelector('#clearEventsBtn'),
  copyRulesBtn: document.querySelector('#copyRulesBtn'),
};

elements.refreshBtn.addEventListener('click', refresh);
elements.saveIgnoredQueryBtn.addEventListener('click', saveIgnoredQueryNames);
elements.exportCacheBtn.addEventListener('click', exportCache);
elements.importCacheBtn.addEventListener('click', () => elements.importCacheInput.click());
elements.importCacheInput.addEventListener('change', importCache);
elements.clearE2eBtn.addEventListener('click', clearE2eEntries);
elements.deleteSelectedBtn.addEventListener('click', () => deleteBatch({ scope: 'ids', ids: Array.from(state.selectedEntryIds) }));
elements.ttlSelectedSelect.addEventListener('change', () => updateSelectedTtl(elements.ttlSelectedSelect.value));
elements.clearExpiredBtn.addEventListener('click', clearExpired);
elements.deleteNeverHitBtn.addEventListener('click', () => deleteBatch({ scope: 'never-hit' }));
elements.clearAllBtn.addEventListener('click', clearAll);
elements.clearEventsBtn.addEventListener('click', clearEvents);
elements.copyRulesBtn.addEventListener('click', copyRules);
elements.matchTestBtn.addEventListener('click', testMatch);
elements.matchInput.addEventListener('input', updateRule);
elements.searchInput.addEventListener('input', renderEntries);
elements.filterSelect.addEventListener('change', renderEntries);
elements.cacheListTab.addEventListener('click', () => switchWorkspaceTab('list'));
elements.requestManagerTab.addEventListener('click', () => switchWorkspaceTab('manager'));
elements.managerSearchInput.addEventListener('input', () => {
  state.managerFilters.search = elements.managerSearchInput.value;
  renderRequestManager();
});
elements.managerMethodSelect.addEventListener('change', () => {
  state.managerFilters.method = elements.managerMethodSelect.value;
  renderRequestManager();
});
elements.managerModifiedOnly.addEventListener('change', () => {
  state.managerFilters.modifiedOnly = elements.managerModifiedOnly.checked;
  renderRequestManager();
});
elements.managerEditableOnly.addEventListener('change', () => {
  state.managerFilters.editableOnly = elements.managerEditableOnly.checked;
  renderRequestManager();
});
elements.managerPrevBtn.addEventListener('click', () => selectAdjacentManagedEntry(-1));
elements.managerNextBtn.addEventListener('click', () => selectAdjacentManagedEntry(1));
elements.managerPreviewModeBtn.addEventListener('click', () => setManagerMode('preview'));
elements.managerEditModeBtn.addEventListener('click', () => setManagerMode('edit'));
elements.managerOriginalModeBtn.addEventListener('click', () => setManagerMode('original'));
elements.managerFormatJsonBtn.addEventListener('click', formatManagedJson);
elements.managerSaveBtn.addEventListener('click', saveManagedBody);
elements.managerRestoreBtn.addEventListener('click', restoreManagedBody);
elements.managerBodyEditor.addEventListener('input', () => {
  state.managerDraft = elements.managerBodyEditor.value;
  state.managerDirty = Boolean(state.managerBody && state.managerDraft !== state.managerSavedDraft);
  renderManagerActions();
});
window.addEventListener('beforeunload', (event) => {
  if (!state.managerDirty) return;
  event.preventDefault();
  event.returnValue = '';
});
elements.eventFilterSelect.addEventListener('change', () => {
  state.eventFilter = elements.eventFilterSelect.value;
  renderEvents();
});

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    state.ruleMode = button.dataset.mode;
    for (const item of document.querySelectorAll('[data-mode]')) {
      item.classList.toggle('active', item === button);
    }
    updateRule();
  });
}

for (const button of document.querySelectorAll('[data-query-name]')) {
  button.addEventListener('click', () => addIgnoredQueryName(button.dataset.queryName));
}

refresh();
startDiagnosticsSync();
startFallbackRefresh();
updateRule();

async function refresh(options = {}) {
  const silent = Boolean(options.silent);
  if (!silent) setLoading(true);
  try {
    hideError();
    applyState(await requestJson('cgi-bin/state'), { preserveSettingsInput: silent });
  } catch (error) {
    if (!silent) showError(error);
  } finally {
    if (!silent) setLoading(false);
  }
}

function applyState(data, options = {}) {
  state.entries = data.entries || [];
  state.selectedEntryIds = new Set(Array.from(state.selectedEntryIds).filter((id) => state.entries.some((entry) => entry.id === id)));
  reconcileManagedSelection();
  state.events = data.events || [];
  state.contentTypePolicy = data.contentTypePolicy || {};
  state.replayHeaderPolicy = data.replayHeaderPolicy || {};
  state.lastEventId = getMaxEventId(state.events, state.lastEventId);
  state.lastSyncAt = new Date().toISOString();
  state.profile = data.profile || {};
  elements.profileId.textContent = state.profile.id || 'default';
  elements.entryCount.textContent = String(data.entryCount || 0);
  elements.totalSize.textContent = formatBytes(data.totalSize || 0);
  state.dataDir = data.dataDir || '';
  if (!options.preserveSettingsInput && document.activeElement !== elements.ignoredQueryInput) {
    elements.ignoredQueryInput.value = (state.profile.ignoredQueryNames || []).join(', ');
  }
  renderStatus();
  renderHealth();
  renderEvents();
  renderSyncStatus();
  renderPolicy();
  renderEntries();
  if (state.workspaceTab === 'manager') {
    renderRequestManager();
    renderManagedBody();
  }
}

function startDiagnosticsSync() {
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const data = await requestJson(`cgi-bin/events?after=${encodeURIComponent(state.lastEventId)}`);
      const events = data.events || [];
      for (const event of events.slice().reverse()) {
        appendEvent(event);
      }
      state.lastSyncAt = new Date().toISOString();
      renderSyncStatus(events.length ? '收到新诊断，正在同步缓存' : undefined);
      if (events.length) scheduleSilentRefresh();
    } catch {
      scheduleSilentRefresh();
    }
  }, diagnosticsRefreshInterval);
}

function startFallbackRefresh() {
  state.fallbackTimer = setInterval(() => {
    if (document.hidden) return;
    refresh({ silent: true });
  }, fallbackRefreshInterval);
}

function scheduleSilentRefresh() {
  clearTimeout(state.syncTimer);
  renderSyncStatus('收到新诊断，正在同步缓存');
  state.syncTimer = setTimeout(() => {
    if (document.hidden) return;
    refresh({ silent: true });
  }, eventSyncDelay);
}

function appendEvent(event) {
  if (!event || state.events.some((item) => item.id === event.id)) return;
  state.events.unshift(event);
  state.events = state.events.slice(0, 20);
  state.lastEventId = getMaxEventId([event], state.lastEventId);
  renderEvents();
}

function getMaxEventId(events, fallback = 0) {
  return events.reduce((maxId, event) => Math.max(maxId, Number(event.id || 0)), fallback);
}

function renderEntries() {
  elements.cacheRows.innerHTML = '';
  const entries = getFilteredEntries();
  elements.empty.hidden = entries.length > 0;
  elements.cacheTable.hidden = entries.length === 0;
  elements.deleteSelectedBtn.disabled = state.selectedEntryIds.size === 0;
  elements.ttlSelectedSelect.disabled = state.selectedEntryIds.size === 0;

  for (const entry of entries) {
    const expiry = getExpiryState(entry);
    const parsed = parseUrl(entry.url);
    const bodyHint = getEntryBodyHint(entry);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input class="entryCheck" type="checkbox" data-action="select" data-id="${escapeHtml(entry.id)}" ${state.selectedEntryIds.has(entry.id) ? 'checked' : ''} aria-label="选择缓存"></td>
      <td>${escapeHtml(entry.method)}</td>
      <td class="url" title="${escapeHtml(entry.url)}">
        <strong>${escapeHtml(parsed.host)}</strong>
        <span>${escapeHtml(parsed.path)}</span>
        ${parsed.hiddenQueryCount ? `<small class="queryHint">已折叠 ${escapeHtml(String(parsed.hiddenQueryCount))} 个忽略参数</small>` : ''}
        <small>${escapeHtml(entry.contentType || '-')}</small>
        ${bodyHint ? `<small class="bodyHint">${escapeHtml(bodyHint)}</small>` : ''}
        ${entry.activeBodyKind === 'editable' ? '<small class="modifiedHint">已修改</small>' : ''}
      </td>
      <td><span class="badge">${escapeHtml(String(entry.statusCode))}</span></td>
      <td>${formatBytes(entry.bodySize || 0)}</td>
      <td>${escapeHtml(String(entry.hitCount || 0))}</td>
      <td>${formatRelativeDate(entry.lastHitAt)}</td>
      <td>${formatRelativeDate(entry.createdAt)}</td>
      <td>
        <span class="badge ${entry.enabled ? expiry.className : 'muted'}">${escapeHtml(entry.enabled ? expiry.label : '已禁用')}</span>
      </td>
      <td class="rowActions">
        <button type="button" data-action="details" data-id="${escapeHtml(entry.id)}">${state.expandedEntryId === entry.id ? '收起' : '详情'}</button>
        <button type="button" data-action="manage" data-id="${escapeHtml(entry.id)}">管理</button>
        <button type="button" data-action="enabled" data-id="${escapeHtml(entry.id)}">${entry.enabled ? '禁用' : '启用'}</button>
        <select data-action="ttl" data-id="${escapeHtml(entry.id)}" aria-label="TTL 操作">
          <option value="">TTL</option>
          <option value="extend-30m">延长 30 分钟</option>
          <option value="never-expire">固定不过期</option>
          <option value="default-ttl">恢复默认 TTL</option>
          <option value="expire-now">立即设为过期</option>
        </select>
        <button type="button" data-action="same-host" data-id="${escapeHtml(entry.id)}">同 Host</button>
        <button type="button" data-action="same-path" data-id="${escapeHtml(entry.id)}">同 Path</button>
        <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(entry.id)}">删除</button>
      </td>
    `;
    row.querySelector('[data-action="select"]').addEventListener('change', (event) => toggleEntrySelection(entry.id, event.target.checked));
    row.querySelector('[data-action="details"]').addEventListener('click', () => toggleEntryDetails(entry.id));
    row.querySelector('[data-action="manage"]').addEventListener('click', () => openEntryManager(entry.id));
    row.querySelector('[data-action="enabled"]').addEventListener('click', () => setEntryEnabled(entry.id, !entry.enabled));
    row.querySelector('[data-action="ttl"]').addEventListener('change', (event) => updateEntryTtl(entry.id, event.target.value, event.target));
    row.querySelector('[data-action="same-host"]').addEventListener('click', () => deleteBatch({ scope: 'same-host', entryId: entry.id }));
    row.querySelector('[data-action="same-path"]').addEventListener('click', () => deleteBatch({ scope: 'same-path', entryId: entry.id }));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntry(entry.id));
    elements.cacheRows.appendChild(row);
    if (state.expandedEntryId === entry.id) {
      const detailRow = document.createElement('tr');
      detailRow.className = 'detailRow';
      detailRow.innerHTML = `<td colspan="10">${renderEntryDetails(entry)}</td>`;
      elements.cacheRows.appendChild(detailRow);
      detailRow.querySelector('[data-action="manage"]').addEventListener('click', () => openEntryManager(entry.id));
    }
  }
}

async function switchWorkspaceTab(tab) {
  if (tab === state.workspaceTab) return;
  if (!(await confirmDiscardManagedChanges())) return;
  state.workspaceTab = tab;
  elements.cacheListTab.classList.toggle('active', tab === 'list');
  elements.cacheListTab.setAttribute('aria-selected', String(tab === 'list'));
  elements.requestManagerTab.classList.toggle('active', tab === 'manager');
  elements.requestManagerTab.setAttribute('aria-selected', String(tab === 'manager'));
  elements.cacheListView.hidden = tab !== 'list';
  elements.requestManagerView.hidden = tab !== 'manager';
  if (tab === 'manager') {
    if (!state.managerSelectedId && state.entries[0]) state.managerSelectedId = state.entries[0].id;
    await loadManagedBody(state.managerSelectedId);
  }
}

async function openEntryManager(entryId) {
  if (!(await confirmDiscardManagedChanges())) return;
  state.managerSelectedId = entryId;
  await switchWorkspaceTab('manager');
  await loadManagedBody(entryId);
}

async function confirmDiscardManagedChanges() {
  if (!state.managerDirty) return true;
  return confirm('当前响应体有未保存修改，确定丢弃并继续吗？');
}

function getManagerEntries() {
  const search = state.managerFilters.search.trim().toLowerCase();
  return state.entries.filter((entry) => {
    if (state.managerFilters.method !== 'all' && entry.method !== state.managerFilters.method) return false;
    if (state.managerFilters.modifiedOnly && entry.activeBodyKind !== 'editable') return false;
    if (state.managerFilters.editableOnly && !isEditableEntry(entry)) return false;
    if (!search) return true;
    return [entry.method, entry.url, entry.contentType].join(' ').toLowerCase().includes(search);
  });
}

function renderRequestManager() {
  const entries = getManagerEntries();
  elements.managerRequestList.innerHTML = entries.length ? entries.map((entry) => {
    const parsed = parseUrl(entry.url);
    const selected = entry.id === state.managerSelectedId;
    return `
      <button type="button" class="managerRequestItem ${selected ? 'active' : ''}" data-id="${escapeHtml(entry.id)}">
        <strong>${escapeHtml(entry.method)} ${escapeHtml(parsed.host)}</strong>
        <span>${escapeHtml(parsed.path)}</span>
        <small>${escapeHtml(entry.contentType || '-')} · ${formatBytes(entry.bodySize || 0)}</small>
        <span class="managerBadges">
          ${entry.activeBodyKind === 'editable' ? '<em>已修改</em>' : '<em>原始</em>'}
          ${new Date(entry.expiresAt).getTime() <= Date.now() ? '<em>已过期</em>' : ''}
          ${entry.enabled ? '' : '<em>已禁用</em>'}
        </span>
      </button>
    `;
  }).join('') : '<div class="empty compact">没有符合条件的缓存请求。</div>';

  for (const item of elements.managerRequestList.querySelectorAll('[data-id]')) {
    item.addEventListener('click', () => selectManagedEntry(item.dataset.id));
  }
  renderManagedEntryInfo();
  renderManagerActions();
}

function isEditableEntry(entry) {
  const type = String(entry.contentType || '').toLowerCase().split(';')[0].trim();
  return type === 'application/json' || type.endsWith('+json') || type.startsWith('text/') ||
    type === 'application/javascript' || type === 'application/xml' || type === 'application/x-www-form-urlencoded';
}

async function selectManagedEntry(entryId) {
  if (!(await confirmDiscardManagedChanges())) return;
  state.managerSelectedId = entryId;
  await loadManagedBody(entryId);
}

async function loadManagedBody(entryId, kind = 'active') {
  if (!entryId) {
    state.managerBody = undefined;
    state.managerOriginalBody = undefined;
    state.managerDraft = '';
    state.managerSavedDraft = '';
    state.managerDirty = false;
    renderRequestManager();
    renderManagedBody();
    return;
  }
  if (!hasEntry(entryId)) {
    clearManagedSelection();
    renderRequestManager();
    renderManagedBody();
    return;
  }
  try {
    hideError();
    const payload = await requestJson(`cgi-bin/cache/body?id=${encodeURIComponent(entryId)}&kind=${kind}`);
    state.managerBody = kind === 'active' ? payload : state.managerBody;
    state.managerOriginalBody = kind === 'original' ? payload : state.managerOriginalBody;
    if (kind === 'active') {
      state.managerOriginalBody = undefined;
      state.managerDraft = getEditableDraft(payload);
      state.managerSavedDraft = state.managerDraft;
      state.managerDirty = false;
    }
    renderRequestManager();
    renderManagedBody();
  } catch (error) {
    showError(error);
  }
}

function reconcileManagedSelection() {
  if (!state.managerSelectedId) {
    if (state.managerBody || state.managerOriginalBody || state.managerDraft || state.managerDirty) {
      clearManagedSelection();
    }
    return;
  }
  if (!hasEntry(state.managerSelectedId)) {
    clearManagedSelection();
    return;
  }
  if (state.managerBody && state.managerBody.entry.id !== state.managerSelectedId) {
    state.managerBody = undefined;
    state.managerOriginalBody = undefined;
    state.managerDraft = '';
    state.managerSavedDraft = '';
    state.managerDirty = false;
  }
}

function clearManagedSelection() {
  state.managerSelectedId = undefined;
  state.managerBody = undefined;
  state.managerOriginalBody = undefined;
  state.managerDraft = '';
  state.managerSavedDraft = '';
  state.managerDirty = false;
  if (state.managerMode === 'original') state.managerMode = 'preview';
}

function hasEntry(entryId) {
  return Boolean(entryId && state.entries.some((entry) => entry.id === entryId));
}

async function setManagerMode(mode) {
  state.managerMode = mode;
  if (mode === 'original' && state.managerSelectedId && !state.managerOriginalBody) {
    await loadManagedBody(state.managerSelectedId, 'original');
  }
  renderManagedBody();
}

function renderManagedBody() {
  const active = state.managerBody;
  const original = state.managerOriginalBody;
  const payload = state.managerMode === 'original' ? original : active;
  elements.managerPreviewModeBtn.classList.toggle('active', state.managerMode === 'preview');
  elements.managerEditModeBtn.classList.toggle('active', state.managerMode === 'edit');
  elements.managerOriginalModeBtn.classList.toggle('active', state.managerMode === 'original');
  elements.managerBodyEditor.hidden = state.managerMode !== 'edit';
  elements.managerBodyPreview.hidden = state.managerMode === 'edit';

  if (!payload) {
    elements.managerBodyEditor.value = '';
    elements.managerBodyPreview.textContent = '请选择一条缓存请求。';
    elements.managerBodyNotice.textContent = '';
    renderManagerActions();
    return;
  }

  const text = payload.encoding === 'utf8' ? (state.managerMode === 'edit' ? state.managerDraft : getFormattedBodyText(payload)) : payload.bodyBase64;
  elements.managerBodyEditor.value = state.managerDraft;
  elements.managerBodyPreview.textContent = text || '';
  elements.managerBodyNotice.textContent = payload.editable
    ? `${payload.kind === 'original' ? '原始响应只读' : '当前响应'} · ${formatBytes(payload.size || 0)} · ${shortHash(payload.hash || '')}`
    : '当前响应无法安全按 UTF-8 文本编辑，已显示 base64 内容。';
  renderManagerActions();
}

function renderManagedEntryInfo() {
  const entry = state.entries.find((item) => item.id === state.managerSelectedId);
  if (!entry) {
    elements.managerEntryInfo.innerHTML = '<div class="empty compact">请选择一条缓存请求。</div>';
    return;
  }
  const expiry = getExpiryState(entry);
  elements.managerEntryInfo.innerHTML = `
    <dl class="detailGrid">
      <div><dt>Method</dt><dd>${escapeHtml(entry.method)}</dd></div>
      <div><dt>URL</dt><dd>${escapeHtml(entry.url)}</dd></div>
      <div><dt>状态码</dt><dd>${escapeHtml(String(entry.statusCode))}</dd></div>
      <div><dt>Content-Type</dt><dd>${escapeHtml(entry.contentType || '-')}</dd></div>
      <div><dt>回放状态</dt><dd>${entry.enabled ? escapeHtml(expiry.label) : '已禁用'}</dd></div>
      <div><dt>响应体状态</dt><dd>${entry.activeBodyKind === 'editable' ? '已修改响应' : '原始响应'}</dd></div>
    </dl>
  `;
}

function renderManagerActions() {
  const active = state.managerBody;
  elements.managerSaveBtn.disabled = !active || !active.editable || !state.managerDirty;
  elements.managerFormatJsonBtn.disabled = !active || !active.editable || state.managerMode !== 'edit' || !isJsonPayload(active);
  elements.managerRestoreBtn.disabled = !active || active.entry.activeBodyKind !== 'editable';
  const entries = getManagerEntries();
  const index = entries.findIndex((entry) => entry.id === state.managerSelectedId);
  elements.managerPrevBtn.disabled = index <= 0;
  elements.managerNextBtn.disabled = index < 0 || index >= entries.length - 1;
}

function formatManagedJson() {
  try {
    state.managerDraft = formatJsonText(elements.managerBodyEditor.value);
    elements.managerBodyEditor.value = state.managerDraft;
    state.managerDirty = Boolean(state.managerBody && state.managerDraft !== state.managerSavedDraft);
    renderManagerActions();
  } catch {
    showToast('JSON 格式错误，无法格式化。');
  }
}

function getEditableDraft(payload) {
  if (!payload || payload.encoding !== 'utf8') return '';
  return getFormattedBodyText(payload);
}

function getFormattedBodyText(payload) {
  if (!payload || payload.encoding !== 'utf8') return '';
  if (!isJsonPayload(payload)) return payload.bodyText || '';
  try {
    return formatJsonText(payload.bodyText || '');
  } catch {
    return payload.bodyText || '';
  }
}

function formatJsonText(value) {
  return JSON.stringify(JSON.parse(value), null, 2);
}

function isJsonPayload(payload) {
  const type = String(payload.contentType || '').toLowerCase().split(';')[0].trim();
  return type === 'application/json' || type.endsWith('+json');
}

async function saveManagedBody() {
  if (!state.managerBody || !state.managerBody.editable) return;
  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/body', {
      method: 'POST',
      body: JSON.stringify({
        id: state.managerBody.entry.id,
        bodyText: state.managerDraft,
        expectedUpdatedAt: state.managerBody.updatedAt,
      }),
    });
    state.entries = state.entries.map((entry) => entry.id === data.entry.id ? data.entry : entry);
    state.managerDirty = false;
    showToast('响应体修改已保存。');
    await loadManagedBody(data.entry.id, 'active');
    renderEntries();
  } catch (error) {
    showError(error);
  }
}

async function restoreManagedBody() {
  if (!state.managerBody || !confirm('确定恢复为原始录制响应吗？')) return;
  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/body/restore-original', {
      method: 'POST',
      body: JSON.stringify({ id: state.managerBody.entry.id }),
    });
    state.entries = state.entries.map((entry) => entry.id === data.entry.id ? data.entry : entry);
    state.managerOriginalBody = undefined;
    state.managerDirty = false;
    showToast('已恢复原始响应。');
    await loadManagedBody(data.entry.id, 'active');
    renderEntries();
  } catch (error) {
    showError(error);
  }
}

async function selectAdjacentManagedEntry(offset) {
  const entries = getManagerEntries();
  const index = entries.findIndex((entry) => entry.id === state.managerSelectedId);
  const next = entries[index + offset];
  if (next) await selectManagedEntry(next.id);
}

function getEntryBodyHint(entry) {
  if (entry.method !== 'POST') return '';
  const variants = getPostBodyVariants(entry.url);
  if (!entry.requestBodyHash) return '';
  const hashLabel = `Body key ${shortHash(entry.requestBodyHash)}`;
  return variants.length > 1 ? `${hashLabel} · 同 URL 多个 Body` : hashLabel;
}

function renderStatus() {
  const profile = state.profile;
  const mode = describeProxyMode(profile);
  const rows = [
    {
      title: '当前处理',
      value: mode.title,
      tone: mode.tone,
      detail: mode.detail,
    },
    {
      title: '缓存边界',
      value: `${formatDuration(profile.ttlSeconds || 0)} / ${formatBytes(profile.maxBodySize || 0)}`,
      tone: 'info',
      detail: '命中缓存前会检查有效期；超过 Body 限制的响应会跳过录制。',
    },
    {
      title: '数据目录',
      value: state.dataDir || '-',
      tone: 'neutral',
      detail: '录制的响应和索引保存在这里，排查缓存文件时可直接打开。',
      action: '<button id="openDataDirBtn" type="button">打开目录</button>',
    },
  ];
  elements.statusOverview.innerHTML = rows.map((row) => `
    <div class="statusItem">
      <span class="label">${escapeHtml(row.title)}</span>
      <div class="statusValueLine">
        <strong class="statusValue ${row.tone}">${escapeHtml(row.value)}</strong>
        ${row.action || ''}
      </div>
      <p>${escapeHtml(row.detail)}</p>
    </div>
  `).join('');
  elements.openDataDirBtn = document.querySelector('#openDataDirBtn');
  elements.openDataDirBtn.addEventListener('click', openDataDir);
}

function describeProxyMode(profile) {
  if (profile.recordEnabled && profile.replayEnabled) {
    return {
      title: '录制与回放都已开启',
      tone: 'ok',
      detail: '有缓存时优先回放，未命中且响应符合策略时会写入本地缓存。',
    };
  }
  if (profile.recordEnabled) {
    return {
      title: '仅录制',
      tone: 'ok',
      detail: '请求会继续访问真实服务，符合策略的响应会写入本地缓存。',
    };
  }
  if (profile.replayEnabled) {
    return {
      title: '仅回放',
      tone: 'info',
      detail: '命中缓存时返回本地响应；未命中时会继续走真实请求。',
    };
  }
  return {
    title: '未接管',
    tone: 'muted',
    detail: '当前规则没有启用录制或回放，插件只会显示诊断信息。',
  };
}

function renderHealth() {
  const now = Date.now();
  const expired = state.entries.filter((entry) => new Date(entry.expiresAt).getTime() <= now);
  const hitEntries = state.entries.filter((entry) => (entry.hitCount || 0) > 0);
  elements.freshCount.textContent = String(state.entries.length - expired.length);
  elements.expiredCount.textContent = String(expired.length);
  elements.hitEntryCount.textContent = String(hitEntries.length);
}

function renderEvents() {
  const events = getFilteredEvents();
  if (!events.length) {
    elements.eventsList.innerHTML = '<div class="empty compact">暂无诊断事件。发起录制或回放请求后会显示最近结果。</div>';
    return;
  }

  elements.eventsList.innerHTML = events.map((event) => {
    const url = parseUrlParts(event.url || '');
    const bodyHint = getEventBodyHint(event);
    const reason = describeEventReason(event);
    return `
      <div class="eventItem" title="${escapeHtml(event.url || '')}">
        <span class="badge ${event.type.toLowerCase()}">${escapeHtml(event.type)}</span>
        <div class="eventMain">
          <div class="eventRequest">
            <div class="eventTitle">
              <strong>${escapeHtml(event.method || '-')}</strong>
              <span>${escapeHtml(url.host || '-')}</span>
            </div>
            <div class="eventPath">${escapeHtml(url.path || '-')}</div>
            ${bodyHint ? `<div class="eventBodyHint">${escapeHtml(bodyHint)}</div>` : ''}
          </div>
          <div class="eventDiagnostics">
            <p>${escapeHtml(reason.primary)} · ${formatRelativeDate(event.timestamp)}</p>
            <div class="eventMeta">
              ${event.requestId ? `<code>${escapeHtml(event.requestId)}</code>` : ''}
              ${reason.detail ? `<span>${escapeHtml(reason.detail)}</span>` : ''}
              ${url.query ? `<span>${escapeHtml(compactQueryLabel(url.query))}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getEventBodyHint(event) {
  if (event.method !== 'POST' || !event.url) return '';
  const hashes = getPostBodyVariants(event.url);
  if (String(event.reason || '').includes('request body unavailable')) {
    if (hashes.length > 1) return '同 URL 多个 Body';
    if (hashes.length === 1) return `Body key ${shortHash(hashes[0])}`;
    return '缺少 Body，已放行真实请求';
  }
  if (hashes.length > 1) return '同 URL 多个 Body';
  if (hashes.length === 1) return `Body key ${shortHash(hashes[0])}`;
  return '';
}

function describeEventReason(event) {
  const reason = String(event.reason || 'ok');
  const type = String(event.type || '');
  if (reason === 'ok') return { primary: '已写入缓存' };
  if (type === 'HIT' || reason.includes('HIT')) return { primary: '命中缓存，跳过写入' };
  if (reason.includes('no cache entries')) {
    return {
      primary: '暂无缓存条目，已写入第一条缓存',
      detail: reason,
    };
  }
  if (reason.includes('request body unavailable for body-bound POST cache')) {
    return {
      primary: '缺少 Body，无法安全回放，已转为录制',
      detail: reason,
    };
  }
  if (reason.includes('no cache entry for')) {
    return {
      primary: '首次请求未命中，已写入缓存',
      detail: reason,
    };
  }
  if (reason.includes('method mismatch')) {
    return {
      primary: '未找到同 Method 的缓存，已写入缓存',
      detail: reason,
    };
  }
  if (reason.includes('request body hash mismatch')) {
    return {
      primary: 'Body 不同，已转为录制',
      detail: reason,
    };
  }
  return { primary: reason };
}

function getPostBodyVariants(url) {
  const normalizedUrl = normalizeUrlForIgnoredQuery(url);
  return Array.from(new Set(
    state.entries
      .filter((entry) => entry.method === 'POST' && normalizeUrlForIgnoredQuery(entry.url) === normalizedUrl)
      .map((entry) => entry.requestBodyHash)
      .filter(Boolean)
  ));
}

function normalizeUrlForIgnoredQuery(value) {
  try {
    const ignored = new Set(state.profile.ignoredQueryNames || []);
    const url = new URL(value);
    url.hash = '';
    const pairs = Array.from(url.searchParams.entries())
      .filter(([name]) => !ignored.has(name))
      .sort(([leftName, leftValue], [rightName, rightValue]) => {
        const nameOrder = leftName.localeCompare(rightName);
        return nameOrder || leftValue.localeCompare(rightValue);
      });
    url.search = '';
    for (const [name, pairValue] of pairs) url.searchParams.append(name, pairValue);
    return url.toString();
  } catch {
    return value || '';
  }
}

function getFilteredEvents() {
  if (state.eventFilter === 'all') return state.events;
  return state.events.filter((event) => event.type === state.eventFilter);
}

function renderPolicy() {
  const profile = state.profile;
  const rows = [
    ['可缓存方法', 'GET, POST'],
    ['可缓存状态', '2xx'],
    ['响应类型', (profile.cacheableContentTypes || []).join(', ')],
    ['忽略 Query', (profile.ignoredQueryNames || []).join(', ') || '-'],
    ['存活时间', formatDuration(profile.ttlSeconds || 0)],
    ['最大 Body', formatBytes(profile.maxBodySize || 0)],
  ];
  elements.policyList.innerHTML = rows.map(([name, value]) => `
    <div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join('');

  const contentTypeRows = [
    ['会缓存 Content-Type', (state.contentTypePolicy.cacheableContentTypes || []).join(', ') || '-'],
    ['会跳过 Content-Type', (state.contentTypePolicy.skippedContentTypes || []).join(', ') || '-'],
  ];
  elements.contentTypePolicyList.innerHTML = contentTypeRows.map(([name, value]) => `
    <div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join('');

  const replayHeaderRows = [
    ['回放移除响应头', (state.replayHeaderPolicy.removedHeaders || []).join(', ') || '-'],
    ['回放注入响应头', (state.replayHeaderPolicy.injectedHeaders || []).join(', ') || '-'],
  ];
  elements.replayHeaderPolicyList.innerHTML = replayHeaderRows.map(([name, value]) => `
    <div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join('');
}

async function saveIgnoredQueryNames() {
  try {
    hideError();
    elements.saveIgnoredQueryBtn.disabled = true;
    const names = parseIgnoredQueryNames(elements.ignoredQueryInput.value);
    const data = await requestJson('cgi-bin/profile/ignored-query-names', {
      method: 'POST',
      body: JSON.stringify({ names }),
    });
    state.profile.ignoredQueryNames = data.ignoredQueryNames || names;
    elements.ignoredQueryInput.value = state.profile.ignoredQueryNames.join(', ');
    renderPolicy();
    showToast('已保存忽略参数，新录制和回放会使用更新后的 cache key。');
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    elements.saveIgnoredQueryBtn.disabled = false;
  }
}

function addIgnoredQueryName(name) {
  const names = parseIgnoredQueryNames(elements.ignoredQueryInput.value);
  if (name && !names.includes(name)) names.push(name);
  elements.ignoredQueryInput.value = names.join(', ');
}

function parseIgnoredQueryNames(value) {
  return Array.from(new Set(value.split(/[,，\s]+/).map((name) => name.trim()).filter(Boolean)));
}

async function clearExpired() {
  try {
    hideError();
    elements.clearExpiredBtn.disabled = true;
    await requestJson('cgi-bin/cache/clear-expired', { method: 'POST' });
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    elements.clearExpiredBtn.disabled = false;
  }
}

async function deleteBatch(input) {
  const labels = {
    ids: `选中的 ${input.ids.length} 条缓存`,
    'same-host': '同 Host 缓存',
    'same-path': '同 Path 缓存',
    expired: '已过期缓存',
    'never-hit': '从未命中过的缓存',
  };
  if (input.scope === 'ids' && !input.ids.length) return;
  if (!confirm(`确定删除${labels[input.scope] || '这些缓存'}吗？此操作不可恢复。`)) return;

  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/delete-batch', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (input.scope === 'ids') state.selectedEntryIds.clear();
    showToast(`已删除缓存：${data.removed || 0} 条`);
    await refresh();
  } catch (error) {
    showError(error);
  }
}

async function clearE2eEntries() {
  const ids = state.entries
    .filter((entry) => String(entry.url || '').includes('/__whistle_api_cache_e2e/'))
    .map((entry) => entry.id);
  if (!ids.length) {
    showToast('暂无测试缓存可清理。');
    return;
  }
  await deleteBatch({ scope: 'ids', ids });
}

async function exportCache() {
  try {
    hideError();
    elements.exportCacheBtn.disabled = true;
    const bundle = await requestJson('cgi-bin/cache/export');
    const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `whistle-api-cache-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`已导出缓存：${(bundle.entries || []).length} 条`);
  } catch (error) {
    showError(error);
  } finally {
    elements.exportCacheBtn.disabled = false;
  }
}

async function importCache() {
  const [file] = elements.importCacheInput.files || [];
  elements.importCacheInput.value = '';
  if (!file) return;

  try {
    hideError();
    elements.importCacheBtn.disabled = true;
    const bundle = JSON.parse(await file.text());
    const data = await requestJson('cgi-bin/cache/import', {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    });
    showToast(`已导入缓存：${data.imported || 0} 条`);
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    elements.importCacheBtn.disabled = false;
  }
}

async function updateSelectedTtl(operation) {
  const ids = Array.from(state.selectedEntryIds);
  elements.ttlSelectedSelect.value = '';
  if (!operation || !ids.length) return;
  await updateTtl({ scope: 'ids', ids, operation });
}

async function updateEntryTtl(id, operation, control) {
  if (control) control.value = '';
  if (!operation) return;
  await updateTtl({ scope: 'ids', ids: [id], operation });
}

async function updateTtl(input) {
  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/ttl', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    showToast(`已更新 TTL：${data.updated || 0} 条`);
    await refresh();
  } catch (error) {
    showError(error);
  }
}

async function clearAll() {
  try {
    const confirmed = confirm('确定清理全部缓存吗？此操作不可恢复。');
    if (!confirmed) return;
    hideError();
    elements.clearAllBtn.disabled = true;
    const data = await requestJson('cgi-bin/cache/clear-all', { method: 'POST' });
    showToast(`已清理全部缓存：${data.removed || 0} 条`);
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    elements.clearAllBtn.disabled = false;
  }
}

async function clearEvents() {
  try {
    hideError();
    elements.clearEventsBtn.disabled = true;
    const data = await requestJson('cgi-bin/events/clear', { method: 'POST' });
    state.events = [];
    state.lastEventId = 0;
    renderEvents();
    showToast(`已清理最近诊断：${data.removed || 0} 条`);
  } catch (error) {
    showError(error);
  } finally {
    elements.clearEventsBtn.disabled = false;
  }
}

async function openDataDir() {
  if (!elements.openDataDirBtn) return;
  try {
    hideError();
    elements.openDataDirBtn.disabled = true;
    const data = await requestJson('cgi-bin/open-data-dir', { method: 'POST' });
    showToast(`已打开缓存目录：${data.dataDir}`);
  } catch (error) {
    showError(error);
  } finally {
    elements.openDataDirBtn.disabled = false;
  }
}

async function deleteEntry(id) {
  try {
    if (!confirm('确定删除这条缓存吗？')) return;
    hideError();
    await requestJson('cgi-bin/cache/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    if (state.expandedEntryId === id) state.expandedEntryId = undefined;
    await refresh();
  } catch (error) {
    showError(error);
  }
}

async function setEntryEnabled(id, enabled) {
  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/enabled', {
      method: 'POST',
      body: JSON.stringify({ id, enabled }),
    });
    showToast(data.updated ? `已${enabled ? '启用' : '禁用'}缓存条目。` : '未找到缓存条目。');
    await refresh();
  } catch (error) {
    showError(error);
  }
}

async function testMatch() {
  const url = elements.matchUrlInput.value.trim();
  if (!url) {
    showMatchResult({ hit: false, reason: '请输入请求 URL', candidates: [], reasons: [] });
    return;
  }

  try {
    hideError();
    elements.matchTestBtn.disabled = true;
    const requestBody = elements.matchBodyInput.value;
    const data = await requestJson('cgi-bin/cache/match', {
      method: 'POST',
      body: JSON.stringify({
        method: elements.matchMethodSelect.value,
        url,
        requestBody: requestBody.trim() ? requestBody : undefined,
      }),
    });
    showMatchResult(data);
  } catch (error) {
    showError(error);
  } finally {
    elements.matchTestBtn.disabled = false;
  }
}

function showMatchResult(result) {
  elements.matchResult.hidden = false;
  const candidates = result.candidates || [];
  const reasons = result.reasons || [];
  const title = result.hit ? '命中缓存' : '未命中';
  const entry = result.entry || candidates[0];

  elements.matchResult.className = `matchResult ${result.hit ? 'hit' : 'miss'}`;
  elements.matchResult.innerHTML = `
    <div class="matchResultHeader">
      <span class="badge ${result.hit ? 'hit' : 'miss'}">${escapeHtml(title)}</span>
      <strong>${escapeHtml(describeMatchReason(result.reason || '-'))}</strong>
    </div>
    ${entry ? renderMatchEntry(entry) : ''}
    ${reasons.length ? `
      <ul>
        ${reasons.map((reason) => `<li>${escapeHtml(describeMatchReason(reason.message || reason.type || '-'))}</li>`).join('')}
      </ul>
    ` : ''}
    ${!result.hit && candidates.length ? `<p class="hint">候选缓存：${escapeHtml(String(candidates.length))} 条</p>` : ''}
  `;
}

function describeMatchReason(reason) {
  const value = String(reason || '-');
  if (value === 'HIT') return '命中缓存';
  if (value === 'no cache entries') return '暂无缓存条目';
  if (value === 'method mismatch' || value.startsWith('no ') && value.endsWith(' cache entries')) return '未找到同 Method 的缓存';
  if (value.includes('no cache entry for')) return '未找到同 URL 的缓存';
  if (value === 'cache entry disabled') return '缓存已禁用';
  if (value === 'cache entry expired') return '缓存已过期';
  if (value === 'request body unavailable for body-bound POST cache') return '缺少 Body，无法安全回放';
  if (value === 'request body hash mismatch') return 'Body 不同';
  if (value.includes('ambiguous POST candidates')) return 'POST 候选缓存不唯一';
  return value;
}

function renderMatchEntry(entry) {
  const parsed = parseUrl(entry.url);
  return `
    <dl class="matchEntry">
      <div><dt>Method</dt><dd>${escapeHtml(entry.method)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(String(entry.statusCode))}</dd></div>
      <div><dt>URL</dt><dd title="${escapeHtml(entry.url)}">${escapeHtml(parsed.host)}${escapeHtml(parsed.path)}</dd></div>
      <div><dt>Request Body Hash</dt><dd>${escapeHtml(entry.requestBodyHash || '-')}</dd></div>
      <div><dt>过期时间</dt><dd>${escapeHtml(formatAbsoluteDate(entry.expiresAt))}</dd></div>
      <div><dt>命中次数</dt><dd>${escapeHtml(String(entry.hitCount || 0))}</dd></div>
    </dl>
  `;
}

async function copyRules() {
  await navigator.clipboard.writeText(elements.rulesBlock.textContent.trim());
  showToast('已复制规则，可粘贴到 Whistle Rules 后发起请求。');
}

function updateRule() {
  const match = elements.matchInput.value.trim() || 'www.example.com/api';
  elements.rulesBlock.textContent = `${match} whistle.api-cache://${state.ruleMode}`;
  elements.currentRuleMode.textContent = getRuleModeLabel(state.ruleMode);
}

function getRuleModeLabel(mode) {
  if (mode === 'replay') return '回放';
  if (mode === 'auto') return '自动';
  return '录制';
}

function toggleEntryDetails(id) {
  state.expandedEntryId = state.expandedEntryId === id ? undefined : id;
  renderEntries();
}

function toggleEntrySelection(id, selected) {
  if (selected) {
    state.selectedEntryIds.add(id);
  } else {
    state.selectedEntryIds.delete(id);
  }
  elements.deleteSelectedBtn.disabled = state.selectedEntryIds.size === 0;
  elements.ttlSelectedSelect.disabled = state.selectedEntryIds.size === 0;
}

function getFilteredEntries() {
  const keyword = elements.searchInput.value.trim().toLowerCase();
  const filter = elements.filterSelect.value;
  const now = Date.now();

  return state.entries.filter((entry) => {
    const haystack = [
      entry.method,
      entry.url,
      entry.normalizedUrl,
      entry.contentType,
      entry.statusCode,
    ].join(' ').toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    const isExpired = new Date(entry.expiresAt).getTime() <= now;
    const matchesFilter =
      filter === 'all' ||
      (filter === 'fresh' && !isExpired) ||
      (filter === 'expired' && isExpired) ||
      (filter === 'hit' && (entry.hitCount || 0) > 0);
    return matchesKeyword && matchesFilter;
  });
}

function renderEntryDetails(entry) {
  const headers = Object.entries(entry.headers || {}).map(([name, value]) => (
    `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`
  )).join('');
  const strategy = getEntryKeyStrategy(entry);
  const fields = [
    ['Cache Key', entry.key],
    ['Normalized URL', entry.normalizedUrl],
    ['Request Body Hash', entry.requestBodyHash || '-'],
    ['Body Hash', entry.bodyHash],
    ['Content Type', entry.contentType || '-'],
    ['响应体状态', entry.activeBodyKind === 'editable' ? '已修改响应' : '原始响应'],
    ['Active Body', `${shortHash(entry.activeBodyHash || entry.bodyHash)} · ${formatBytes(entry.activeBodySize || entry.bodySize || 0)}`],
    ['Original Body', `${shortHash(entry.originalBodyHash || entry.bodyHash)} · ${formatBytes(entry.originalBodySize || entry.bodySize || 0)}`],
    ['启用状态', entry.enabled ? '启用' : '禁用'],
    ['创建时间', formatAbsoluteDate(entry.createdAt)],
    ['过期时间', formatAbsoluteDate(entry.expiresAt)],
    ['最近命中', formatAbsoluteDate(entry.lastHitAt)],
  ];

  return `
    <div class="entryDetails">
      <dl class="detailGrid">
        ${fields.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      <div class="headersBlock">
        <strong>命中策略</strong>
        <dl>
          <div><dt>Method</dt><dd>${escapeHtml(strategy.method)}</dd></div>
          <div><dt>Normalized URL</dt><dd>${escapeHtml(strategy.normalizedUrl)}</dd></div>
          <div><dt>Request Body Hash</dt><dd>${escapeHtml(strategy.includesRequestBodyHash ? '参与匹配' : '不参与匹配')}</dd></div>
          <div><dt>忽略 Query</dt><dd>${escapeHtml(strategy.ignoredQueryNames.join(', ') || '-')}</dd></div>
        </dl>
      </div>
      <div class="headersBlock">
        <strong>Response Headers</strong>
        <dl>${headers || '<div><dt>-</dt><dd>暂无响应头</dd></div>'}</dl>
      </div>
      <div class="headersBlock">
        <strong>响应数据</strong>
        <button type="button" data-action="manage" data-id="${escapeHtml(entry.id)}">在请求管理中打开</button>
      </div>
    </div>
  `;
}

function getEntryKeyStrategy(entry) {
  return {
    method: entry.method || '-',
    normalizedUrl: entry.normalizedUrl || '-',
    includesRequestBodyHash: Boolean(entry.requestBodyHash),
    ignoredQueryNames: state.profile.ignoredQueryNames || [],
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

function showError(error) {
  elements.error.hidden = false;
  elements.error.textContent = error instanceof Error ? error.message : String(error);
}

function hideError() {
  elements.error.hidden = true;
  elements.error.textContent = '';
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 1800);
}

function setLoading(isLoading) {
  elements.appMain.classList.toggle('isLoading', isLoading);
  elements.appMain.setAttribute('aria-busy', String(isLoading));
  elements.loadingText.hidden = !isLoading;
  elements.refreshBtn.disabled = isLoading;
  elements.refreshBtn.textContent = isLoading ? '刷新中...' : '刷新';
}

function renderSyncStatus(message) {
  const suffix = state.lastSyncAt ? ` · 更新于 ${formatClockTime(state.lastSyncAt)}` : '';
  elements.syncStatusText.textContent = `${message || '实时同步'} · 最近 20 条${suffix}`;
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelativeDate(value) {
  if (!value) return '-';
  const diff = new Date(value).getTime() - Date.now();
  const absolute = Math.abs(diff);
  const suffix = diff >= 0 ? '后' : '前';
  if (absolute < 60 * 1000) return diff >= 0 ? '即将' : '刚刚';
  if (absolute < 60 * 60 * 1000) return `${Math.round(absolute / 60 / 1000)} 分钟${suffix}`;
  if (absolute < 24 * 60 * 60 * 1000) return `${Math.round(absolute / 60 / 60 / 1000)} 小时${suffix}`;
  return new Date(value).toLocaleString();
}

function formatAbsoluteDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatDuration(seconds) {
  if (!seconds) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function getExpiryState(entry) {
  const diff = new Date(entry.expiresAt).getTime() - Date.now();
  if (diff <= 0) return { label: '已过期', className: 'muted' };
  if (diff < 5 * 60 * 1000) return { label: formatRelativeDate(entry.expiresAt), className: 'warn' };
  return { label: formatRelativeDate(entry.expiresAt), className: 'ok' };
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    const compact = compactUrl(url);
    return {
      host: url.host,
      path: compact.path,
      query: compact.query,
      hiddenQueryCount: compact.hiddenQueryCount,
    };
  } catch {
    return { host: value, path: '' };
  }
}

function parseUrlParts(value) {
  try {
    const url = new URL(value);
    return {
      host: url.host,
      path: url.pathname,
      query: url.search ? url.search.slice(1) : '',
    };
  } catch {
    return { host: value, path: '', query: '' };
  }
}

function compactUrl(url) {
  const ignoredNames = new Set(state.profile.ignoredQueryNames || []);
  const visible = [];
  let hiddenQueryCount = 0;
  for (const [name, value] of url.searchParams.entries()) {
    if (ignoredNames.has(name)) {
      hiddenQueryCount += 1;
    } else {
      visible.push([name, value]);
    }
  }
  const query = visible.map(([name, value]) => `${name}=${value}`).join('&');
  return {
    path: `${url.pathname}${query ? `?${query}` : ''}`,
    query,
    hiddenQueryCount,
  };
}

function compactQueryLabel(query) {
  if (!query) return '';
  const count = query.split('&').filter(Boolean).length;
  return count > 1 ? `含 ${count} 个 Query 参数` : `Query: ${query}`;
}

function formatClockTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortUrl(value) {
  if (!value) return '';
  const parsed = parseUrl(value);
  return parsed.host ? `${parsed.host}${parsed.path}` : value;
}

function shortHash(value) {
  return value ? String(value).slice(0, 8) : '-';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
