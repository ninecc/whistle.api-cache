const state = {
  entries: [],
  events: [],
  contentTypePolicy: {},
  profile: {},
  replayHeaderPolicy: {},
  ruleMode: 'record',
  expandedEntryId: undefined,
  eventFilter: 'all',
  fallbackTimer: undefined,
  lastEventId: 0,
  selectedEntryIds: new Set(),
  syncTimer: undefined,
};

const diagnosticsRefreshInterval = 1000;
const fallbackRefreshInterval = 30000;
const eventSyncDelay = 250;

const elements = {
  profileId: document.querySelector('#profileId'),
  entryCount: document.querySelector('#entryCount'),
  totalSize: document.querySelector('#totalSize'),
  dataDir: document.querySelector('#dataDir'),
  statusChips: document.querySelector('#statusChips'),
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
  error: document.querySelector('#error'),
  loadingText: document.querySelector('#loadingText'),
  rulesBlock: document.querySelector('#rulesBlock'),
  refreshBtn: document.querySelector('#refreshBtn'),
  openDataDirBtn: document.querySelector('#openDataDirBtn'),
  saveIgnoredQueryBtn: document.querySelector('#saveIgnoredQueryBtn'),
  exportCacheBtn: document.querySelector('#exportCacheBtn'),
  importCacheBtn: document.querySelector('#importCacheBtn'),
  importCacheInput: document.querySelector('#importCacheInput'),
  deleteSelectedBtn: document.querySelector('#deleteSelectedBtn'),
  ttlSelectedSelect: document.querySelector('#ttlSelectedSelect'),
  clearExpiredBtn: document.querySelector('#clearExpiredBtn'),
  deleteNeverHitBtn: document.querySelector('#deleteNeverHitBtn'),
  clearAllBtn: document.querySelector('#clearAllBtn'),
  clearEventsBtn: document.querySelector('#clearEventsBtn'),
  copyRulesBtn: document.querySelector('#copyRulesBtn'),
};

elements.refreshBtn.addEventListener('click', refresh);
elements.openDataDirBtn.addEventListener('click', openDataDir);
elements.saveIgnoredQueryBtn.addEventListener('click', saveIgnoredQueryNames);
elements.exportCacheBtn.addEventListener('click', exportCache);
elements.importCacheBtn.addEventListener('click', () => elements.importCacheInput.click());
elements.importCacheInput.addEventListener('change', importCache);
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
  state.events = data.events || [];
  state.contentTypePolicy = data.contentTypePolicy || {};
  state.replayHeaderPolicy = data.replayHeaderPolicy || {};
  state.lastEventId = getMaxEventId(state.events, state.lastEventId);
  state.profile = data.profile || {};
  elements.profileId.textContent = state.profile.id || 'default';
  elements.entryCount.textContent = String(data.entryCount || 0);
  elements.totalSize.textContent = formatBytes(data.totalSize || 0);
  elements.dataDir.textContent = data.dataDir || '';
  if (!options.preserveSettingsInput && document.activeElement !== elements.ignoredQueryInput) {
    elements.ignoredQueryInput.value = (state.profile.ignoredQueryNames || []).join(', ');
  }
  renderStatus();
  renderHealth();
  renderEvents();
  renderPolicy();
  renderEntries();
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
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input class="entryCheck" type="checkbox" data-action="select" data-id="${escapeHtml(entry.id)}" ${state.selectedEntryIds.has(entry.id) ? 'checked' : ''} aria-label="选择缓存"></td>
      <td>${escapeHtml(entry.method)}</td>
      <td class="url" title="${escapeHtml(entry.url)}">
        <strong>${escapeHtml(parsed.host)}</strong>
        <span>${escapeHtml(parsed.path)}</span>
        <small>${escapeHtml(entry.contentType || '-')}</small>
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
    }
  }
}

function renderStatus() {
  const profile = state.profile;
  const chips = [
    { label: `录制 ${profile.recordEnabled ? '开启' : '关闭'}`, tone: profile.recordEnabled ? 'ok' : 'muted' },
    { label: `回放 ${profile.replayEnabled ? '开启' : '关闭'}`, tone: profile.replayEnabled ? 'ok' : 'muted' },
    { label: `TTL ${formatDuration(profile.ttlSeconds || 0)}`, tone: 'info' },
    { label: `最大 Body ${formatBytes(profile.maxBodySize || 0)}`, tone: 'info' },
  ];
  elements.statusChips.innerHTML = chips.map((chip) => (
    `<span class="chip ${chip.tone}">${escapeHtml(chip.label)}</span>`
  )).join('');
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
    return `
      <div class="eventItem" title="${escapeHtml(event.url || '')}">
        <span class="badge ${event.type.toLowerCase()}">${escapeHtml(event.type)}</span>
        <div class="eventMain">
          <div class="eventTitle">
            <strong>${escapeHtml(event.method || '-')}</strong>
            <span>${escapeHtml(url.host || '-')}</span>
            ${event.requestId ? `<code>${escapeHtml(event.requestId)}</code>` : ''}
          </div>
          <div class="eventPath">${escapeHtml(url.path || '-')}</div>
          ${url.query ? `<div class="eventQuery">${escapeHtml(url.query)}</div>` : ''}
          <p>${escapeHtml(event.reason || 'ok')} · ${formatRelativeDate(event.timestamp)}</p>
        </div>
      </div>
    `;
  }).join('');
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
      <strong>${escapeHtml(result.reason || '-')}</strong>
    </div>
    ${entry ? renderMatchEntry(entry) : ''}
    ${reasons.length ? `
      <ul>
        ${reasons.map((reason) => `<li>${escapeHtml(reason.message || reason.type || '-')}</li>`).join('')}
      </ul>
    ` : ''}
    ${!result.hit && candidates.length ? `<p class="hint">候选缓存：${escapeHtml(String(candidates.length))} 条</p>` : ''}
  `;
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
    return {
      host: url.host,
      path: `${url.pathname}${url.search}`,
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

function shortUrl(value) {
  if (!value) return '';
  const parsed = parseUrl(value);
  return parsed.host ? `${parsed.host}${parsed.path}` : value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
