(() => {
  'use strict';

  const STORAGE_KEY = 'personal-uric-acid-records-v1';
  const DATABASE_NAME = 'personal-uric-acid-journal';
  const DATABASE_STORE = 'state';
  const DATABASE_RECORD_KEY = 'records';
  const THEME_KEY = 'personal-uric-acid-theme-v1';
  const LOW_THRESHOLD = 210;
  const HIGH_THRESHOLD = 420;
  const $ = selector => document.querySelector(selector);
  const els = {
    metricCard: $('#metricCard'), metricValue: $('#metricValue'), metricDate: $('#metricDate'), metricState: $('#metricState'), statusDot: $('#statusDot'), changePill: $('#changePill'),
    rangeCaption: $('#rangeCaption'), chartSummary: $('#chartSummary'), chartGrid: $('#chartGrid'), chartArea: $('#chartArea'), chartLine: $('#chartLine'), chartPoints: $('#chartPoints'), chartLabels: $('#chartLabels'), chartHint: $('#chartHint'),
    weekAverage: $('#weekAverage'), recordCount: $('#recordCount'), daysSince: $('#daysSince'), historyList: $('#historyList'), showAllRecords: $('#showAllRecords'),
    recordDialog: $('#recordDialog'), recordForm: $('#recordForm'), recordDialogEyebrow: $('#recordDialogEyebrow'), recordDialogTitle: $('#recordDialogTitle'), saveRecordButton: $('#saveRecordButton'), valueInput: $('#valueInput'), dateInput: $('#dateInput'), noteInput: $('#noteInput'), detailDialog: $('#detailDialog'), detailValue: $('#detailValue'), detailContent: $('#detailContent'), editRecord: $('#editRecord'), deleteRecord: $('#deleteRecord'),
    settingsDialog: $('#settingsDialog'), themeSelect: $('#themeSelect'), offlineStatus: $('#offlineStatus'), importData: $('#importData'), toast: $('#toast')
  };

  let records = loadRecords();
  let activeRange = 'week';
  let selectedId = null;
  let editingId = null;
  let toastTimer;
  let recordsChangedBeforeRestore = false;
  let historyExpanded = false;

  function getThemePreference() { return localStorage.getItem(THEME_KEY) || 'system'; }
  function applyTheme(preference = getThemePreference()) {
    const dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = $('#themeColor');
    if (themeColor) themeColor.setAttribute('content', dark ? '#000000' : '#f5f5f7');
    if (els.themeSelect) els.themeSelect.value = preference;
  }

  function loadRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(validRecord).sort(byDateDesc) : [];
    } catch { return []; }
  }
  function validRecord(record) { return record && Number.isFinite(Number(record.value)) && record.date && !Number.isNaN(new Date(record.date).getTime()); }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DATABASE_STORE)) request.result.createObjectStore(DATABASE_STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function completeTransaction(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
  function completeRequest(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function readIndexedRecords() {
    const database = await openDatabase();
    const transaction = database.transaction(DATABASE_STORE, 'readonly');
    const result = await completeRequest(transaction.objectStore(DATABASE_STORE).get(DATABASE_RECORD_KEY));
    database.close();
    return Array.isArray(result) ? result.filter(validRecord).sort(byDateDesc) : null;
  }
  async function saveRecords() {
    const snapshot = records.filter(validRecord).sort(byDateDesc);
    try {
      const database = await openDatabase();
      const transaction = database.transaction(DATABASE_STORE, 'readwrite');
      transaction.objectStore(DATABASE_STORE).put(snapshot, DATABASE_RECORD_KEY);
      await completeTransaction(transaction);
      database.close();
    } catch { /* LocalStorage is retained as the secondary persistence layer. */ }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* The current in-memory record remains usable for this session. */ }
    return snapshot;
  }
  async function restoreRecords() {
    try {
      const indexedRecords = await readIndexedRecords();
      if (recordsChangedBeforeRestore) await saveRecords();
      else if (indexedRecords !== null) records = indexedRecords;
      else if (records.length) await saveRecords();
    } catch { /* The LocalStorage fallback was already loaded. */ }
    render();
  }
  function byDateDesc(a, b) { return new Date(b.date) - new Date(a.date); }
  function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  function toLocalInputValue(date = new Date()) { const d = new Date(date); const offset = d.getTimezoneOffset() * 60000; return new Date(d - offset).toISOString().slice(0, 16); }
  function formatDate(value, withTime = true) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(value)); }
  function formatShortDate(value) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)); }
  function dateDiffDays(value) { return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)); }
  function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('show'); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200); }
  function getRangeStart(range) { const now = new Date(); const days = range === 'week' ? 7 : range === 'month' ? 30 : range === 'sixMonths' ? 183 : 365; return new Date(now.getTime() - days * 86400000); }
  function rangeRecords() { return records.filter(record => new Date(record.date) >= getRangeStart(activeRange)).slice().sort((a, b) => new Date(a.date) - new Date(b.date)); }
  function condition(value) { const numeric = Number(value); return numeric > HIGH_THRESHOLD ? '偏高' : numeric < LOW_THRESHOLD ? '偏低' : '在参考范围内'; }

  function renderMetric() {
    const latest = records[0];
    if (!latest) {
      els.metricValue.textContent = '--'; els.metricDate.textContent = '还没有记录'; els.metricState.textContent = '最新记录'; els.changePill.classList.add('hidden');
      els.metricCard.classList.remove('elevated'); return;
    }
    const elevated = Number(latest.value) > HIGH_THRESHOLD;
    els.metricValue.textContent = latest.value;
    els.metricDate.textContent = `${formatDate(latest.date)}${latest.note ? ` · ${latest.note}` : ''}`;
    els.metricState.textContent = condition(latest.value);
    els.metricCard.classList.toggle('elevated', elevated);
    const prior = records[1];
    if (prior) {
      const delta = Number(latest.value) - Number(prior.value);
      els.changePill.textContent = `${delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} ${Math.abs(delta)} vs 上次`;
      els.changePill.classList.remove('hidden');
    } else els.changePill.classList.add('hidden');
  }

  function renderStats() {
    const sevenDays = records.filter(record => new Date(record.date) >= getRangeStart('week'));
    els.weekAverage.textContent = sevenDays.length ? Math.round(sevenDays.reduce((sum, record) => sum + Number(record.value), 0) / sevenDays.length) : '--';
    els.recordCount.textContent = records.length;
    if (!records.length) els.daysSince.textContent = '--';
    else { const days = dateDiffDays(records[0].date); els.daysSince.textContent = days === 0 ? '今天' : `${days} 天`; }
  }

  function chartDateLabel(record) { return activeRange === 'year' ? new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(new Date(record.date)) : formatShortDate(record.date); }
  function renderChart() {
    const points = rangeRecords();
    const names = { week: '最近 7 天', month: '最近 30 天', sixMonths: '最近 6 个月', year: '最近 1 年' };
    els.rangeCaption.textContent = names[activeRange];
    els.chartGrid.replaceChildren(); els.chartPoints.replaceChildren(); els.chartLabels.replaceChildren(); els.chartLine.setAttribute('d', ''); els.chartArea.setAttribute('d', '');
    if (!points.length) {
      els.chartSummary.innerHTML = `<strong>${names[activeRange]}暂无记录</strong><span>添加数据后趋势会在这里出现</span>`;
      els.chartHint.textContent = '数据只保存在这台设备中';
      drawEmptyGrid(); return;
    }
    const values = points.map(point => Number(point.value));
    const min = Math.floor((Math.min(...values) - 20) / 20) * 20;
    const max = Math.ceil((Math.max(...values) + 20) / 20) * 20;
    const low = Math.min(min, 280); const high = Math.max(max, 440); const span = Math.max(high - low, 80);
    const pad = { left: 31, right: 10, top: 11, bottom: 29 }; const width = 340 - pad.left - pad.right; const height = 202 - pad.top - pad.bottom;
    const x = index => points.length === 1 ? pad.left + width / 2 : pad.left + (width * index) / (points.length - 1);
    const y = value => pad.top + ((high - value) / span) * height;
    [low, Math.round((low + high) / 2), high].forEach(value => {
      const yy = y(value); const line = svg('line', { x1: pad.left, x2: 330, y1: yy, y2: yy, class: 'grid-line' }); const label = svg('text', { x: 0, y: yy + 3, class: 'grid-label' }); label.textContent = value; els.chartGrid.append(line, label);
    });
    const coords = points.map((point, index) => [x(index), y(Number(point.value))]);
    const lineD = smoothPath(coords); els.chartLine.setAttribute('d', lineD); els.chartLine.setAttribute('class', 'trend-line');
    const areaD = `${lineD} L ${coords[coords.length - 1][0]} ${pad.top + height} L ${coords[0][0]} ${pad.top + height} Z`; els.chartArea.setAttribute('d', areaD);
    points.forEach((point, index) => {
      const [cx, cy] = coords[index]; const selected = point.id === selectedId;
      const dot = svg('circle', { cx, cy, r: selected ? 5.6 : 4, class: `chart-dot${selected ? ' selected' : ''}` });
      const hit = svg('circle', { cx, cy, r: 16, class: 'chart-hit', tabindex: 0, role: 'button', 'aria-label': `${point.value} 微摩尔每升，${formatDate(point.date)}` });
      hit.addEventListener('click', () => openDetail(point.id)); hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openDetail(point.id); }); els.chartPoints.append(dot, hit);
      if (index === 0 || index === points.length - 1 || (points.length > 5 && index === Math.floor(points.length / 2))) { const label = svg('text', { x: cx, y: 196, class: 'x-label', 'text-anchor': 'middle' }); label.textContent = chartDateLabel(point); els.chartLabels.append(label); }
    });
    const selected = points.find(point => point.id === selectedId) || points[points.length - 1];
    els.chartSummary.innerHTML = `<strong>${selected.value} μmol/L</strong><span>${formatDate(selected.date)}${selected.note ? ` · ${selected.note}` : ''}</span>`;
    els.chartHint.textContent = '轻点曲线上的点查看或删除记录';
  }
  function drawEmptyGrid() { [35, 90, 145].forEach((yy, index) => { const line = svg('line', { x1: 31, x2: 330, y1: yy, y2: yy, class: 'grid-line' }); const label = svg('text', { x: 0, y: yy + 3, class: 'grid-label' }); label.textContent = [450, 350, 250][index]; els.chartGrid.append(line, label); }); }
  function svg(tag, attrs) { const element = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value)); return element; }
  function smoothPath(coords) { if (coords.length === 1) return `M ${coords[0][0]} ${coords[0][1]}`; return coords.reduce((path, point, index) => { if (!index) return `M ${point[0]} ${point[1]}`; const previous = coords[index - 1]; const midX = (previous[0] + point[0]) / 2; return `${path} C ${midX} ${previous[1]}, ${midX} ${point[1]}, ${point[0]} ${point[1]}`; }, ''); }

  function renderHistory() {
    els.historyList.replaceChildren();
    const visible = historyExpanded ? records : records.slice(0, 5);
    if (!visible.length) { els.historyList.innerHTML = '<p class="empty-history">还没有检测记录</p>'; return; }
    visible.forEach(record => {
      const item = document.createElement('article'); item.className = 'history-row'; item.tabIndex = 0; item.setAttribute('role', 'button'); item.setAttribute('aria-label', `查看 ${record.value} 的记录`);
      item.innerHTML = `<div class="history-main"><strong>${record.value} μmol/L</strong><p>${record.note || condition(record.value)}</p></div><time class="history-date">${formatDate(record.date)}</time>`;
      item.addEventListener('click', () => openDetail(record.id)); item.addEventListener('keydown', event => { if (event.key === 'Enter') openDetail(record.id); }); els.historyList.append(item);
    });
  }
  function render() { renderMetric(); renderStats(); renderChart(); renderHistory(); }

  function openRecordDialog(id = null) {
    editingId = id; const record = id ? records.find(item => item.id === id) : null;
    els.recordDialogEyebrow.textContent = record ? '修改数据' : '新数据'; els.recordDialogTitle.textContent = record ? '编辑尿酸记录' : '记录尿酸'; els.saveRecordButton.textContent = record ? '保存修改' : '保存记录';
    if (record) { els.dateInput.value = toLocalInputValue(record.date); els.valueInput.value = record.value; els.noteInput.value = record.note || ''; }
    else { const defaultDate = new Date(); defaultDate.setHours(8, 0, 0, 0); els.dateInput.value = toLocalInputValue(defaultDate); els.valueInput.value = ''; els.noteInput.value = '空腹'; }
    els.recordDialog.showModal(); setTimeout(() => els.valueInput.focus(), 160);
  }
  function openDetail(id) {
    const record = records.find(item => item.id === id); if (!record) return; selectedId = id;
    els.detailValue.textContent = `${record.value} μmol/L`;
    els.detailContent.innerHTML = `<div class="detail-row"><span>检测时间</span><strong>${formatDate(record.date)}</strong></div><div class="detail-row"><span>状态</span><strong>${condition(record.value)}</strong></div><div class="detail-row"><span>备注</span><strong>${record.note || '无'}</strong></div>`;
    els.detailDialog.showModal(); renderChart();
  }
  async function deleteActiveRecord() {
    if (!selectedId) return;
    records = records.filter(record => record.id !== selectedId);
    recordsChangedBeforeRestore = true;
    records = await saveRecords();
    selectedId = null; els.detailDialog.close(); render(); showToast('记录已删除');
  }

  $('#addRecord').addEventListener('click', openRecordDialog);
  els.recordForm.addEventListener('submit', async event => {
    event.preventDefault(); const value = Number(els.valueInput.value); const date = new Date(els.dateInput.value);
    if (!Number.isFinite(value) || value < 50 || value > 1500 || Number.isNaN(date.getTime())) { showToast('请输入有效的尿酸数值和时间'); return; }
    const recordId = editingId || uid();
    const nextRecord = { id: recordId, value: Math.round(value), date: date.toISOString(), note: els.noteInput.value.trim() };
    if (editingId) records = records.map(record => record.id === recordId ? nextRecord : record);
    else records = [nextRecord, ...records];
    records.sort(byDateDesc);
    recordsChangedBeforeRestore = true;
    records = await saveRecords();
    els.recordDialog.close(); selectedId = recordId; editingId = null; render(); showToast(`已保存到本机，共 ${records.length} 条`);
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
  els.deleteRecord.addEventListener('click', deleteActiveRecord);
  els.editRecord.addEventListener('click', () => { if (!selectedId) return; els.detailDialog.close(); openRecordDialog(selectedId); });
  document.querySelectorAll('.segment').forEach(button => button.addEventListener('click', () => { activeRange = button.dataset.range; selectedId = null; document.querySelectorAll('.segment').forEach(segment => { const active = segment === button; segment.classList.toggle('active', active); segment.setAttribute('aria-selected', active); }); renderChart(); }));
  $('#openSettings').addEventListener('click', () => els.settingsDialog.showModal());
  if (els.themeSelect) els.themeSelect.addEventListener('change', () => { localStorage.setItem(THEME_KEY, els.themeSelect.value); applyTheme(); });
  els.showAllRecords.addEventListener('click', () => { historyExpanded = true; renderHistory(); window.scrollTo({ top: document.querySelector('.history-section').offsetTop - 18, behavior: 'smooth' }); });
  $('#exportData').addEventListener('click', () => { const payload = { app: '个人尿酸记录', version: 1, exportedAt: new Date().toISOString(), records }; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); link.download = `尿酸记录备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); showToast('备份文件已生成'); });
  els.importData.addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const content = JSON.parse(await file.text()); const imported = Array.isArray(content) ? content : content.records; if (!Array.isArray(imported) || !imported.every(validRecord)) throw new Error('invalid'); const existing = new Map(records.map(record => [record.id, record])); imported.forEach(record => existing.set(record.id || uid(), { id: record.id || uid(), value: Math.round(Number(record.value)), date: new Date(record.date).toISOString(), note: String(record.note || '').slice(0, 80) })); records = [...existing.values()].sort(byDateDesc); recordsChangedBeforeRestore = true; records = await saveRecords(); render(); showToast(`已导入 ${imported.length} 条记录`); } catch { showToast('无法识别这个备份文件'); } finally { event.target.value = ''; } });
  $('#clearData').addEventListener('click', async () => { if (!confirm('确定清空这台设备上的全部尿酸记录吗？此操作无法撤销。')) return; records = []; selectedId = null; recordsChangedBeforeRestore = true; records = await saveRecords(); els.settingsDialog.close(); render(); showToast('本机记录已清空'); });
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const handleColorSchemeChange = () => { if (getThemePreference() === 'system') applyTheme(); };
  if (colorScheme.addEventListener) colorScheme.addEventListener('change', handleColorSchemeChange);
  else if (colorScheme.addListener) colorScheme.addListener(handleColorSchemeChange);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=8').then(() => { els.offlineStatus.textContent = '已缓存，断网也可使用'; }).catch(() => { els.offlineStatus.textContent = '浏览器未启用离线缓存'; }); else els.offlineStatus.textContent = '当前浏览器不支持离线缓存';
  applyTheme();
  render();
  restoreRecords();
})();
