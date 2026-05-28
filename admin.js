// ═══════════════════════════════════════════════════════════════════════
// AI Agent — Admin Panel  v2.0
// Server: server.js (Express + SQLite + Socket.IO)
// Bu fayl Firebase EMA — server.js REST API + Socket.IO bilan ishlaydi
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ─── Holat ──────────────────────────────────────────────────────────────
let authToken   = null;
let socket      = null;
let allData     = { stats: {}, events: [], users: [], accounts: [] };
let currentPage = 'dashboard';

const API = ''; // Xuddi shu serverdan — relative URL

// ─── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('admin_token');
  if (saved) {
    authToken = saved;
    showPanel();
  } else {
    showLogin();
  }
});

// ═══════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════
function showLogin() {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0d0d;">
      <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:40px;width:360px;text-align:center;">
        <div style="font-size:40px;margin-bottom:12px;">🤖</div>
        <h1 style="font-family:Inter,sans-serif;color:#fff;font-size:20px;font-weight:700;margin:0 0 4px">AI Agent</h1>
        <p style="color:#666;font-size:13px;margin:0 0 28px">Admin Panel</p>

        <input type="text" id="loginUser" placeholder="Username" autocomplete="username"
          style="width:100%;box-sizing:border-box;padding:12px 14px;background:#111;border:1px solid #333;border-radius:10px;color:#fff;font-size:14px;font-family:Inter,sans-serif;outline:none;margin-bottom:12px;">
        <input type="password" id="loginPass" placeholder="Parol" autocomplete="current-password"
          style="width:100%;box-sizing:border-box;padding:12px 14px;background:#111;border:1px solid #333;border-radius:10px;color:#fff;font-size:14px;font-family:Inter,sans-serif;outline:none;margin-bottom:16px;">

        <button id="loginBtn"
          style="width:100%;padding:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">
          Kirish
        </button>
        <div id="loginErr" style="color:#f87171;font-size:12px;margin-top:12px;min-height:18px;"></div>
      </div>
    </div>
  `;
  // CSP: inline onclick ISHLAMAYDI — addEventListener ishlatamiz
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
}

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  const errEl    = document.getElementById('loginErr');
  const btn      = document.getElementById('loginBtn');

  if (!username || !password) { errEl.textContent = 'Username va parol kiriting'; return; }

  btn.textContent = 'Kirilmoqda...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API}/api/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Login xato'; btn.textContent = 'Kirish'; btn.disabled = false; return; }

    authToken = data.token;
    sessionStorage.setItem('admin_token', authToken);
    showPanel();
  } catch (e) {
    errEl.textContent = 'Server bilan ulanib bo\'lmadi';
    btn.textContent   = 'Kirish';
    btn.disabled      = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PANEL — Asosiy kontent
// ═══════════════════════════════════════════════════════════════════════
function showPanel() {
  // Panel HTML ni index.html dan yuklaymiz (allaqachon bor)
  // admin.js panel ichida ishlaydi — faqat data yuklaymiz
  setupNavigation();
  setupFilters();
  connectSocket();
  loadAllData();
}

// ─── Navigation ──────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const page = document.getElementById(`page-${item.dataset.page}`);
      if (page) page.classList.add('active');
      const titleEl = document.getElementById('pageTitle');
      if (titleEl) titleEl.textContent = item.querySelector('span:last-child')?.textContent || '';
      currentPage = item.dataset.page;
    });
  });

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadAllData);
}

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDashboard();
    });
  });

  const fp = document.getElementById('filterProvider');
  if (fp) fp.addEventListener('change', renderRequests);
}

// ═══════════════════════════════════════════════════════════════════════
// SOCKET.IO — Real-time
// ═══════════════════════════════════════════════════════════════════════
function connectSocket() {
  if (typeof io === 'undefined') return;

  socket = io({ auth: { token: authToken } });

  socket.on('connect', () => {
    updateConnectionStatus(true);
  });

  socket.on('disconnect', () => {
    updateConnectionStatus(false);
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket xatolik:', err.message);
    updateConnectionStatus(false);
  });

  // Real-time yangilanishlar
  socket.on('stats_update', (stats) => {
    allData.stats = stats;
    renderDashboard();
  });

  socket.on('new_event', (event) => {
    allData.events.unshift(event);
    if (allData.events.length > 200) allData.events.pop();
    addLiveEvent(event);
    addActivityItem(event);
    renderRequests();
  });

  socket.on('recent_events', (events) => {
    allData.events = events.slice().reverse();
    renderRequests();
    renderDashboard();
  });

  socket.on('new_account', (account) => {
    // Yangi ro'yxatdan o'tgan foydalanuvchi
    loadAccounts();
  });
}

function updateConnectionStatus(connected) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  if (connected) {
    el.innerHTML = '<span class="conn-dot" style="background:#22c55e"></span><span>Server ulangan</span>';
  } else {
    el.innerHTML = '<span class="conn-dot" style="background:#ef4444"></span><span>Uzilgan</span>';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DATA YUKLOVCHI
// ═══════════════════════════════════════════════════════════════════════
async function apiGet(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  if (res.status === 401) { sessionStorage.removeItem('admin_token'); showLogin(); throw new Error('Token muddati tugagan'); }
  return res.json();
}

async function loadAllData() {
  try {
    await Promise.all([
      loadStats(),
      loadEvents(),
      loadUsers(),
      loadAccounts(),
    ]);
  } catch (e) {
    console.error('Data yuklash xatoligi:', e.message);
  }
}

async function loadStats() {
  const data = await apiGet('/api/stats');
  allData.stats = data;
  renderDashboard();
}

async function loadEvents() {
  const data = await apiGet('/api/events?limit=200');
  allData.events = data.events || [];
  renderRequests();
}

async function loadUsers() {
  // Analytics users (extension'dan kelgan user_id lar)
  const data = await apiGet('/api/users?limit=100');
  allData.users = data.users || [];
  renderUsers();
}

async function loadAccounts() {
  // Ro'yxatdan o'tgan userlar (email + parol bilan)
  const data = await apiGet('/api/accounts');
  allData.accounts = data.accounts || [];
  renderAccounts();
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const s = allData.stats;
  if (!s) return;

  setEl('totalUsers',    s.totalUsers   ?? 0);
  setEl('totalRequests', formatNumber(s.totalRequests ?? 0));
  setEl('totalActions',  formatNumber(s.totalActions  ?? 0));
  setEl('activeNow',     s.activeNow    ?? 0);
  setEl('newUsersToday', `+${s.newToday ?? 0} bugun`);
  setEl('requestsToday', `+${s.today?.requests ?? 0} bugun`);
  setEl('actionsToday',  `+${s.today?.actions  ?? 0} bugun`);

  renderProviderChart(s.providers || []);
  renderWeeklyChart(s.weekly || []);
}

function renderProviderChart(providers) {
  const el = document.getElementById('providerChart');
  if (!el) return;

  const colors = { openai: '#10a37f', anthropic: '#d97757', gemini: '#4285f4', ollama: '#f97316', openrouter: '#ec4899' };
  const names  = { openai: 'OpenAI',  anthropic: 'Claude',  gemini: 'Gemini',  ollama: 'Ollama',  openrouter: 'OpenRouter' };

  const total = providers.reduce((s, p) => s + (p.calls || 0), 0) || 1;

  el.innerHTML = providers.length
    ? providers.map(p => {
        const pct = ((p.calls || 0) / total * 100).toFixed(0);
        return `
          <div class="prov-row">
            <div class="prov-dot" style="background:${colors[p.provider]||'#666'}"></div>
            <div class="prov-name">${names[p.provider]||p.provider}</div>
            <div class="prov-bar-wrap"><div class="prov-bar" style="width:${pct}%;background:${colors[p.provider]||'#666'}"></div></div>
            <div class="prov-count">${p.calls||0}</div>
          </div>`;
      }).join('')
    : '<div class="empty-state">Ma\'lumot yo\'q</div>';
}

function renderWeeklyChart(weekly) {
  const el = document.getElementById('dailyChart');
  if (!el) return;

  const max = Math.max(...weekly.map(d => d.requests || 0), 1);
  el.innerHTML = weekly.map(d => {
    const h = Math.max(((d.requests || 0) / max) * 100, 4);
    const label = d.date ? d.date.slice(5) : '';
    return `
      <div class="bar-col">
        <div class="bar-value">${d.requests||0}</div>
        <div class="bar" style="height:${h}%"></div>
        <div class="bar-label">${label}</div>
      </div>`;
  }).join('') || '<div class="empty-state">Ma\'lumot yo\'q</div>';
}

// ═══════════════════════════════════════════════════════════════════════
// ACCOUNTS — Ro'yxatdan o'tgan foydalanuvchilar
// ═══════════════════════════════════════════════════════════════════════
function renderAccounts() {
  let tbody = document.getElementById('accountsTableBody');

  if (!tbody) {
    const usersSection = document.getElementById('page-users');
    if (!usersSection) return;

    const accountsCard = document.createElement('div');
    accountsCard.className = 'card';
    accountsCard.style.marginTop = '18px';
    accountsCard.innerHTML = `
      <div class="card-header">
        <h3>🔐 Ro'yxatdan o'tgan foydalanuvchilar</h3>
        <div class="header-meta">
          <span id="accountsCount">0 ta</span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Ism</th>
              <th>Holat</th>
              <th>Ro'yxatdan o'tgan</th>
              <th>Oxirgi kirish</th>
              <th>Amal</th>
            </tr>
          </thead>
          <tbody id="accountsTableBody">
            <tr><td colspan="6" class="empty-cell">Yuklanmoqda...</td></tr>
          </tbody>
        </table>
      </div>
    `;
    usersSection.appendChild(accountsCard);
    tbody = document.getElementById('accountsTableBody');

    // Event delegation — CSP sababli inline onclick ishlatmaymiz
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      if (action === 'ban')    toggleBan(parseInt(id), btn.dataset.status);
      if (action === 'delete') deleteAccount(parseInt(id));
    });
  }

  const accounts = allData.accounts || [];
  setEl('accountsCount', `${accounts.length} ta`);

  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Hali ro\'yxatdan o\'tgan foydalanuvchi yo\'q</td></tr>';
    return;
  }

  tbody.innerHTML = accounts.map(acc => {
    const created   = acc.created_at ? new Date(acc.created_at * 1000).toLocaleDateString('uz') : '—';
    const lastLogin = acc.last_login  ? timeAgo(acc.last_login) : '—';
    const isBanned  = acc.status === 'banned';
    const newStatus = isBanned ? 'active' : 'banned';
    return `
      <tr>
        <td style="font-weight:500">${escHtml(acc.email)}</td>
        <td>${escHtml(acc.name || '—')}</td>
        <td><span class="badge ${isBanned ? 'error' : 'success'}">${isBanned ? 'Bloklangan' : 'Aktiv'}</span></td>
        <td>${created}</td>
        <td>${lastLogin}</td>
        <td>
          <button data-action="ban" data-id="${acc.id}" data-status="${newStatus}"
            style="padding:4px 10px;border-radius:6px;border:1px solid ${isBanned ? '#22c55e44' : '#ef444444'};background:transparent;color:${isBanned ? '#22c55e' : '#ef4444'};font-size:11px;cursor:pointer;font-family:Inter,sans-serif">
            ${isBanned ? '✅ Faollashtir' : '🚫 Bloklash'}
          </button>
          <button data-action="delete" data-id="${acc.id}"
            style="margin-left:4px;padding:4px 10px;border-radius:6px;border:1px solid #33333388;background:transparent;color:#888;font-size:11px;cursor:pointer;font-family:Inter,sans-serif">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleBan(id, newStatus) {
  try {
    await fetch(`${API}/api/accounts/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body:    JSON.stringify({ status: newStatus }),
    });
    await loadAccounts();
  } catch (e) {
    alert('Xatolik: ' + e.message);
  }
}

async function deleteAccount(id) {
  if (!confirm('Bu foydalanuvchini o\'chirishni tasdiqlaysizmi?')) return;
  try {
    await fetch(`${API}/api/accounts/${id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    await loadAccounts();
    await loadStats();
  } catch (e) {
    alert('Xatolik: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ANALYTICS USERS — Extension user_id lar
// ═══════════════════════════════════════════════════════════════════════
function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const users    = allData.users || [];
  const countEl  = document.getElementById('usersCount');
  if (countEl) countEl.textContent = `${users.length} ta user`;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Analytics userlar yo\'q</td></tr>';
    return;
  }

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  tbody.innerHTML = users.map(u => {
    const isOnline = u.last_active > fiveMinAgo;
    const shortId  = (u.user_id || '').slice(0, 12) + '...';
    return `
      <tr>
        <td style="font-family:monospace;font-size:11px" title="${escHtml(u.user_id||'')}">${shortId}</td>
        <td>${u.first_seen || '—'}</td>
        <td>${u.last_active ? timeAgo(u.last_active) : '—'}</td>
        <td>${u.request_count || 0}</td>
        <td>${u.main_provider || '—'}</td>
        <td><span class="badge ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
      </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════════════
function renderProviders() {
  const el       = document.getElementById('providersGrid');
  if (!el) return;
  const providers = allData.stats?.providers || [];

  const colors = { openai: '#10a37f', anthropic: '#d97757', gemini: '#4285f4', ollama: '#f97316', openrouter: '#ec4899' };
  const names  = { openai: 'OpenAI',  anthropic: 'Anthropic', gemini: 'Gemini', ollama: 'Ollama', openrouter: 'OpenRouter' };

  const list = ['openai','anthropic','gemini','ollama','openrouter'];

  el.innerHTML = list.map(pid => {
    const data = providers.find(p => p.provider === pid) || { calls: 0, errors: 0 };
    const successRate = data.calls > 0 ? Math.round(((data.calls - data.errors) / data.calls) * 100) : 0;
    return `
      <div class="prov-card">
        <div class="prov-card-header">
          <div class="prov-card-icon ${pid}">${names[pid][0]}</div>
          <div>
            <div class="prov-card-name">${names[pid]}</div>
            <div class="prov-card-model">API</div>
          </div>
        </div>
        <div class="prov-card-stats">
          <div class="prov-stat"><div class="prov-stat-val">${formatNumber(data.calls||0)}</div><div class="prov-stat-label">So'rovlar</div></div>
          <div class="prov-stat"><div class="prov-stat-val" style="color:${(data.errors||0)>0?'var(--red)':''}">${data.errors||0}</div><div class="prov-stat-label">Xatolar</div></div>
          <div class="prov-stat"><div class="prov-stat-val" style="color:var(--green)">${successRate}%</div><div class="prov-stat-label">Muvaffaqiyat</div></div>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// REQUESTS
// ═══════════════════════════════════════════════════════════════════════
function renderRequests() {
  const tbody  = document.getElementById('requestsTableBody');
  if (!tbody) return;
  const filter = document.getElementById('filterProvider')?.value || 'all';

  let events = (allData.events || []).filter(e => e.type === 'request');
  if (filter !== 'all') events = events.filter(e => e.provider === filter);

  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">So\'rovlar yo\'q</td></tr>';
    return;
  }

  tbody.innerHTML = events.slice(0, 100).map(e => `
    <tr>
      <td style="font-size:11px">${e.time||'—'}</td>
      <td style="font-family:monospace;font-size:10px">${(e.user_id||'').slice(0,8)}...</td>
      <td><span class="badge" style="background:var(--bg-3)">${e.provider||'—'}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(e.message||'—')}</td>
      <td>${e.actions||0}</td>
      <td><span class="badge ${e.success?'success':'error'}">${e.success?'OK':'Xato'}</span></td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// LIVE FEED
// ═══════════════════════════════════════════════════════════════════════
function addLiveEvent(event) {
  const feed = document.getElementById('liveFeed');
  if (!feed) return;
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  const icons = { request: '💬', action: '⚡', error: '❌', user_join: '👤' };
  const item  = document.createElement('div');
  item.className = 'live-item';
  item.innerHTML = `
    <div class="l-icon">${icons[event.type]||'📡'}</div>
    <div class="l-body">
      <div class="l-title">${escHtml(event.message||event.type)}</div>
      <div class="l-meta">${event.provider||''} · User: ${(event.user_id||'').slice(0,8)}</div>
    </div>
    <div class="l-time">${event.time||'hozir'}</div>
  `;
  feed.insertBefore(item, feed.firstChild);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);

  // Aktiv userlar soni
  const fiveMinAgo   = Date.now() - 5 * 60 * 1000;
  const activeCount  = (allData.accounts||[]).filter(u => u.last_login > fiveMinAgo).length;
  const liveCountEl  = document.getElementById('liveCount');
  if (liveCountEl) liveCountEl.textContent = `${activeCount} ta aktiv user`;
}

function addActivityItem(event) {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  const icons = { request: '💬', action: '⚡', error: '❌', user_join: '👤' };
  const item  = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="a-icon">${icons[event.type]||'📡'}</div>
    <div class="a-text"><strong>${(event.user_id||'').slice(0,8)}</strong> — ${escHtml(event.message||event.type)}</div>
    <div class="a-time">${event.time||''}</div>
  `;
  feed.insertBefore(item, feed.firstChild);
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n || 0);
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'hozir';
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
