// ============================================
// AI Agent — Admin Panel (Firebase Real-time)
// ============================================
// 
// SETUP:
// 1. Firebase Console: https://console.firebase.google.com
// 2. Yangi project yarating
// 3. Realtime Database yarating (test mode)
// 4. Quyidagi config'ni o'z Firebase ma'lumotlaringiz bilan almashtiring
// ============================================

// ─── Firebase Config ──────────────────────────────────
// ⚠️ BU YERGA O'Z FIREBASE CONFIG'INGIZNI QOYING
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ─── State ────────────────────────────────────────────
let currentRange = 'today';
let allData = { users: {}, requests: [], providers: {} };

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupFilters();
  connectRealtime();
  loadAllData();
});

// ─── Navigation ───────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${item.dataset.page}`).classList.add('active');
      document.getElementById('pageTitle').textContent = item.querySelector('span:last-child').textContent;
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', loadAllData);
}

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = btn.dataset.range;
      renderDashboard();
    });
  });

  document.getElementById('filterProvider').addEventListener('change', renderRequests);
}

// ─── Firebase Real-time Listeners ─────────────────────
function connectRealtime() {
  // Listen for new events (real-time feed)
  db.ref('events').orderByChild('timestamp').limitToLast(50).on('child_added', (snap) => {
    const event = snap.val();
    addLiveEvent(event);
    addActivityItem(event);
  });

  // Listen for user count changes
  db.ref('users').on('value', (snap) => {
    const users = snap.val() || {};
    allData.users = users;
    renderDashboard();
    renderUsers();
  });

  // Listen for stats
  db.ref('stats').on('value', (snap) => {
    const stats = snap.val() || {};
    allData.stats = stats;
    renderDashboard();
    renderProviders();
  });

  // Connection status
  db.ref('.info/connected').on('value', (snap) => {
    const el = document.getElementById('connectionStatus');
    if (snap.val()) {
      el.innerHTML = '<span class="conn-dot" style="background:var(--green)"></span><span>Firebase ulangan</span>';
    } else {
      el.innerHTML = '<span class="conn-dot" style="background:var(--red)"></span><span>Uzilgan</span>';
    }
  });
}

// ─── Load All Data ────────────────────────────────────
async function loadAllData() {
  try {
    const [usersSnap, statsSnap, eventsSnap] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('stats').once('value'),
      db.ref('events').orderByChild('timestamp').limitToLast(200).once('value')
    ]);

    allData.users = usersSnap.val() || {};
    allData.stats = statsSnap.val() || {};

    const events = [];
    eventsSnap.forEach(child => events.push(child.val()));
    allData.events = events;

    renderDashboard();
    renderUsers();
    renderProviders();
    renderRequests();
  } catch (e) {
    console.error('Data load error:', e);
  }
}

// ─── Render Dashboard ─────────────────────────────────
function renderDashboard() {
  const users = allData.users || {};
  const stats = allData.stats || {};
  const events = allData.events || [];

  const userCount = Object.keys(users).length;
  const totalRequests = stats.totalRequests || 0;
  const totalActions = stats.totalActions || 0;

  // Count today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = events.filter(e => e.date === today);
  const newUsersToday = Object.values(users).filter(u => u.firstSeen?.startsWith(today)).length;

  document.getElementById('totalUsers').textContent = userCount;
  document.getElementById('totalRequests').textContent = formatNumber(totalRequests);
  document.getElementById('totalActions').textContent = formatNumber(totalActions);
  document.getElementById('newUsersToday').textContent = `+${newUsersToday} bugun`;
  document.getElementById('requestsToday').textContent = `+${todayEvents.length} bugun`;
  document.getElementById('actionsToday').textContent = `+${todayEvents.filter(e => e.actions > 0).length} bugun`;

  // Active now (last 5 min)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeNow = Object.values(users).filter(u => u.lastActive > fiveMinAgo).length;
  document.getElementById('activeNow').textContent = activeNow;

  renderProviderChart(stats.providers || {});
  renderDailyChart(events);
}

function renderProviderChart(providers) {
  const el = document.getElementById('providerChart');
  const total = Object.values(providers).reduce((s, v) => s + (v.calls || 0), 0) || 1;

  const colors = {
    openai: '#10a37f',
    anthropic: '#d97757',
    gemini: '#4285f4',
    ollama: '#f97316',
    openrouter: '#ec4899'
  };

  const names = {
    openai: 'OpenAI',
    anthropic: 'Claude',
    gemini: 'Gemini',
    ollama: 'Ollama',
    openrouter: 'OpenRouter'
  };

  const sorted = Object.entries(providers).sort((a, b) => (b[1].calls || 0) - (a[1].calls || 0));

  el.innerHTML = sorted.map(([key, val]) => {
    const pct = ((val.calls || 0) / total * 100).toFixed(0);
    return `
      <div class="prov-row">
        <div class="prov-dot" style="background:${colors[key] || '#666'}"></div>
        <div class="prov-name">${names[key] || key}</div>
        <div class="prov-bar-wrap">
          <div class="prov-bar" style="width:${pct}%;background:${colors[key] || '#666'}"></div>
        </div>
        <div class="prov-count">${val.calls || 0}</div>
      </div>
    `;
  }).join('') || '<div class="empty-state">Ma\'lumot yo\'q</div>';
}

function renderDailyChart(events) {
  const el = document.getElementById('dailyChart');
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('uz', { weekday: 'short' });
    const count = events.filter(e => e.date === key).length;
    days.push({ key, label, count });
  }

  const max = Math.max(...days.map(d => d.count), 1);

  el.innerHTML = days.map(d => {
    const h = Math.max((d.count / max) * 100, 4);
    return `
      <div class="bar-col">
        <div class="bar-value">${d.count}</div>
        <div class="bar" style="height:${h}%"></div>
        <div class="bar-label">${d.label}</div>
      </div>
    `;
  }).join('');
}

// ─── Render Users ─────────────────────────────────────
function renderUsers() {
  const users = allData.users || {};
  const tbody = document.getElementById('usersTableBody');
  const entries = Object.entries(users);

  document.getElementById('usersCount').textContent = `${entries.length} ta user`;

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Userlar yo\'q</td></tr>';
    return;
  }

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;

  tbody.innerHTML = entries
    .sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0))
    .map(([id, user]) => {
      const isOnline = user.lastActive > fiveMinAgo;
      const shortId = id.slice(0, 12) + '...';
      return `
        <tr>
          <td style="font-family:var(--mono);font-size:11px" title="${id}">${shortId}</td>
          <td>${user.firstSeen || '—'}</td>
          <td>${user.lastActive ? timeAgo(user.lastActive) : '—'}</td>
          <td>${user.requestCount || 0}</td>
          <td>${user.mainProvider || '—'}</td>
          <td><span class="badge ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
        </tr>
      `;
    }).join('');
}

// ─── Render Providers ─────────────────────────────────
function renderProviders() {
  const stats = allData.stats || {};
  const providers = stats.providers || {};
  const el = document.getElementById('providersGrid');

  const config = [
    { id: 'openai', name: 'OpenAI', icon: 'G' },
    { id: 'anthropic', name: 'Anthropic', icon: 'C' },
    { id: 'gemini', name: 'Gemini', icon: 'G' },
    { id: 'ollama', name: 'Ollama', icon: 'O' },
    { id: 'openrouter', name: 'OpenRouter', icon: 'R' },
  ];

  el.innerHTML = config.map(p => {
    const data = providers[p.id] || { calls: 0, errors: 0, users: 0 };
    const successRate = data.calls > 0 ? Math.round(((data.calls - data.errors) / data.calls) * 100) : 0;
    return `
      <div class="prov-card">
        <div class="prov-card-header">
          <div class="prov-card-icon ${p.id}">${p.icon}</div>
          <div>
            <div class="prov-card-name">${p.name}</div>
            <div class="prov-card-model">${data.model || 'noma\'lum'}</div>
          </div>
        </div>
        <div class="prov-card-stats">
          <div class="prov-stat">
            <div class="prov-stat-val">${formatNumber(data.calls)}</div>
            <div class="prov-stat-label">So'rovlar</div>
          </div>
          <div class="prov-stat">
            <div class="prov-stat-val" style="color:${data.errors > 0 ? 'var(--red)' : ''}">${data.errors}</div>
            <div class="prov-stat-label">Xatolar</div>
          </div>
          <div class="prov-stat">
            <div class="prov-stat-val" style="color:var(--green)">${successRate}%</div>
            <div class="prov-stat-label">Muvaffaqiyat</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Comparison chart
  renderComparison(providers);
}

function renderComparison(providers) {
  const el = document.getElementById('comparisonChart');
  const total = Object.values(providers).reduce((s, v) => s + (v.calls || 0), 0) || 1;

  const colors = { openai: '#10a37f', anthropic: '#d97757', gemini: '#4285f4', ollama: '#f97316', openrouter: '#ec4899' };
  const names = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini', ollama: 'Ollama', openrouter: 'OpenRouter' };

  el.innerHTML = Object.entries(providers)
    .sort((a, b) => (b[1].calls || 0) - (a[1].calls || 0))
    .map(([key, val]) => {
      const pct = ((val.calls || 0) / total * 100).toFixed(1);
      return `
        <div class="prov-row">
          <div class="prov-dot" style="background:${colors[key]}"></div>
          <div class="prov-name">${names[key] || key}</div>
          <div class="prov-bar-wrap">
            <div class="prov-bar" style="width:${pct}%;background:${colors[key]}"></div>
          </div>
          <div class="prov-count">${pct}% (${val.calls})</div>
        </div>
      `;
    }).join('') || '<div class="empty-state">Ma\'lumot yo\'q</div>';
}

// ─── Render Requests ──────────────────────────────────
function renderRequests() {
  const events = allData.events || [];
  const filter = document.getElementById('filterProvider').value;
  const tbody = document.getElementById('requestsTableBody');

  let filtered = events.filter(e => e.type === 'request');
  if (filter !== 'all') {
    filtered = filtered.filter(e => e.provider === filter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">So\'rovlar yo\'q</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.slice().reverse().slice(0, 50).map(e => `
    <tr>
      <td style="font-size:11px">${e.time || '—'}</td>
      <td style="font-family:var(--mono);font-size:10px">${(e.userId || '').slice(0, 8)}...</td>
      <td><span class="badge" style="background:var(--bg-3)">${e.provider || '—'}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.message || '—'}</td>
      <td>${e.actions || 0}</td>
      <td><span class="badge ${e.success ? 'success' : 'error'}">${e.success ? 'OK' : 'Xato'}</span></td>
    </tr>
  `).join('');
}

// ─── Live Feed ────────────────────────────────────────
function addLiveEvent(event) {
  const feed = document.getElementById('liveFeed');
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  const icons = { request: '💬', action: '⚡', error: '❌', user_join: '👤' };
  const icon = icons[event.type] || '📡';

  const item = document.createElement('div');
  item.className = 'live-item';
  item.innerHTML = `
    <div class="l-icon">${icon}</div>
    <div class="l-body">
      <div class="l-title">${event.message || event.type}</div>
      <div class="l-meta">${event.provider || ''} · User: ${(event.userId || '').slice(0, 8)}</div>
    </div>
    <div class="l-time">${event.time || 'hozir'}</div>
  `;

  feed.insertBefore(item, feed.firstChild);

  // Keep max 30 items
  while (feed.children.length > 30) {
    feed.removeChild(feed.lastChild);
  }

  // Update live count
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeCount = Object.values(allData.users || {}).filter(u => u.lastActive > fiveMinAgo).length;
  document.getElementById('liveCount').textContent = `${activeCount} ta aktiv user`;
}

function addActivityItem(event) {
  const feed = document.getElementById('activityFeed');
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  const icons = { request: '💬', action: '⚡', error: '❌', user_join: '👤' };

  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="a-icon">${icons[event.type] || '📡'}</div>
    <div class="a-text"><strong>${(event.userId || '').slice(0, 8)}</strong> — ${event.message || event.type}</div>
    <div class="a-time">${event.time || ''}</div>
  `;

  feed.insertBefore(item, feed.firstChild);
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);
}

// ─── Helpers ──────────────────────────────────────────
function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hozir';
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  return `${days} kun oldin`;
}
