const state = {
  entries: [],
  events: [],
  profile: {},
  ruleMode: 'record',
  fallbackTimer: undefined,
  lastEventId: 0,
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
  freshCount: document.querySelector('#freshCount'),
  expiredCount: document.querySelector('#expiredCount'),
  hitEntryCount: document.querySelector('#hitEntryCount'),
  eventsList: document.querySelector('#eventsList'),
  searchInput: document.querySelector('#searchInput'),
  filterSelect: document.querySelector('#filterSelect'),
  ignoredQueryInput: document.querySelector('#ignoredQueryInput'),
  policyList: document.querySelector('#policyList'),
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
  clearExpiredBtn: document.querySelector('#clearExpiredBtn'),
  clearAllBtn: document.querySelector('#clearAllBtn'),
  copyRulesBtn: document.querySelector('#copyRulesBtn'),
};

elements.refreshBtn.addEventListener('click', refresh);
elements.openDataDirBtn.addEventListener('click', openDataDir);
elements.saveIgnoredQueryBtn.addEventListener('click', saveIgnoredQueryNames);
elements.clearExpiredBtn.addEventListener('click', clearExpired);
elements.clearAllBtn.addEventListener('click', clearAll);
elements.copyRulesBtn.addEventListener('click', copyRules);
elements.matchInput.addEventListener('input', updateRule);
elements.searchInput.addEventListener('input', renderEntries);
elements.filterSelect.addEventListener('change', renderEntries);

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
  state.events = data.events || [];
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

  for (const entry of entries) {
    const expiry = getExpiryState(entry);
    const parsed = parseUrl(entry.url);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(entry.method)}</td>
      <td class="url" title="${escapeHtml(entry.url)}">
        <strong>${escapeHtml(parsed.host)}</strong>
        <span>${escapeHtml(parsed.path)}</span>
        <small>${escapeHtml(entry.contentType || '-')}</small>
      </td>
      <td><span class="badge">${escapeHtml(String(entry.statusCode))}</span></td>
      <td>${formatBytes(entry.bodySize || 0)}</td>
      <td>${escapeHtml(String(entry.hitCount || 0))}</td>
      <td>${formatRelativeDate(entry.createdAt)}</td>
      <td><span class="badge ${expiry.className}">${escapeHtml(expiry.label)}</span></td>
      <td><button type="button" class="danger" data-id="${escapeHtml(entry.id)}">删除</button></td>
    `;
    row.querySelector('button').addEventListener('click', () => deleteEntry(entry.id));
    elements.cacheRows.appendChild(row);
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
  if (!state.events.length) {
    elements.eventsList.innerHTML = '<div class="empty compact">暂无诊断事件。发起录制或回放请求后会显示最近结果。</div>';
    return;
  }

  elements.eventsList.innerHTML = state.events.map((event) => {
    const url = parseUrlParts(event.url || '');
    return `
      <div class="eventItem" title="${escapeHtml(event.url || '')}">
        <span class="badge ${event.type.toLowerCase()}">${escapeHtml(event.type)}</span>
        <div class="eventMain">
          <div class="eventTitle">
            <strong>${escapeHtml(event.method || '-')}</strong>
            <span>${escapeHtml(url.host || '-')}</span>
          </div>
          <div class="eventPath">${escapeHtml(url.path || '-')}</div>
          ${url.query ? `<div class="eventQuery">${escapeHtml(url.query)}</div>` : ''}
          <p>${escapeHtml(event.reason || 'ok')} · ${formatRelativeDate(event.timestamp)}</p>
        </div>
      </div>
    `;
  }).join('');
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
    await refresh();
  } catch (error) {
    showError(error);
  }
}

async function copyRules() {
  await navigator.clipboard.writeText(elements.rulesBlock.textContent.trim());
  showToast('已复制规则，可粘贴到 Whistle Rules 后发起请求。');
}

function updateRule() {
  const match = elements.matchInput.value.trim() || 'www.example.com/api';
  elements.rulesBlock.textContent = `${match} whistle.api-cache://${state.ruleMode}`;
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
