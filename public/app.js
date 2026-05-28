// ═══════════════════════════════════════════════════════════
// AI Agent Admin Panel — Premium Frontend
// Animated counters · Toast notifications · Smooth transitions
// ═══════════════════════════════════════════════════════════
(function() {
  'use strict';

  const API = '';  // same origin
  let token = localStorage.getItem('admin_token');
  let socket = null;
  let currentPage = 'dashboard';
  let stats = {};

  // ─── Provider Config ──────────────────────────────────
  const PROVIDERS = {
    openai:      { name: 'OpenAI GPT',  letter: 'G', color: '#10a37f', bg: 'linear-gradient(135deg,#10a37f,#0d8068)' },
    anthropic:   { name: 'Claude',      letter: 'C', color: '#d97757', bg: 'linear-gradient(135deg,#d97757,#c25a3e)' },
    gemini:      { name: 'Gemini',      letter: 'G', color: '#4285f4', bg: 'linear-gradient(135deg,#4285f4,#1a73e8)' },
    ollama:      { name: 'Ollama',      letter: 'O', color: '#f97316', bg: 'linear-gradient(135deg,#f97316,#ea580c)' },
    openrouter:  { name: 'OpenRouter',  letter: 'R', color: '#ec4899', bg: 'linear-gradient(135deg,#ec4899,#be185d)' },
    unknown:     { name: 'Other',      letter: '?', color: '#6b7280', bg: 'linear-gradient(135deg,#6b7280,#4b5563)' },
  };

  // ─── Animated Counter Cache ───────────────────────────
  const counterCache = {};

  // ─── Init ─────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    if (token) {
      showApp();
      connectSocket();
      loadPage('dashboard');
    } else {
      showLogin();
    }

    // Event listeners
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', () => {
      const btn = document.getElementById('refreshBtn');
      btn.style.transform = 'rotate(360deg)';
      btn.style.transition = 'transform 0.5s ease';
      setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 500);
      loadPage(currentPage);
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => loadPage(item.dataset.page));
    });

    // Settings
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('serverUrl').textContent = window.location.origin + '/api/ingest';
    document.getElementById('saveApiSettingsBtn').addEventListener('click', saveApiSettings);

    // Password visibility toggler
    document.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          btn.textContent = input.type === 'password' ? '👁' : '🙈';
        }
      });
    });

    // Ollama mode toggler
    document.getElementById('ollama_mode_local').addEventListener('click', () => setOllamaMode('local'));
    document.getElementById('ollama_mode_cloud').addEventListener('click', () => setOllamaMode('cloud'));

    // Events filter
    document.getElementById('applyFilter').addEventListener('click', () => loadEvents(1));
    document.getElementById('clearEventsBtn').addEventListener('click', clearEvents);
    document.getElementById('clearUsersBtn').addEventListener('click', clearUsers);
    document.getElementById('userSearch').addEventListener('input', debounce(() => loadUsers(1), 400));
    document.getElementById('filterDate').valueAsDate = new Date();

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', exportEventsCSV);
    }

    // URL box click to copy
    document.getElementById('serverUrl').addEventListener('click', function() {
      navigator.clipboard.writeText(this.textContent).then(() => {
        showToast('📋 URL copied!', 'success');
      });
    });

    // Event delegation for users actions (CSP compliant)
    const usersBody = document.getElementById('usersBody');
    if (usersBody) {
      usersBody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);
        const status = btn.dataset.status;
        if (action === 'ban') {
          toggleBan(id, status);
        } else if (action === 'delete') {
          deleteAccount(id);
        }
      });
    }

    // Event delegation for API key visibility toggling (CSP compliant)
    const apiKeysContainer = document.getElementById('apiKeysContainer');
    if (apiKeysContainer) {
      apiKeysContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action="toggle-visibility"]');
        if (!btn) return;
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    }
  });

  // ─── Auth ─────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;
    const btn = document.getElementById('loginSubmitBtn');
    
    btn.style.opacity = '0.7';
    btn.innerHTML = '<span class="btn-text">⏳ Signing in...</span>';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');

      token = data.token;
      localStorage.setItem('admin_token', token);
      showApp();
      connectSocket();
      loadPage('dashboard');
      showToast('✅ Signed in successfully!', 'success');
    } catch (err) {
      const errEl = document.getElementById('loginError');
      errEl.textContent = '⚠️ ' + err.message;
      errEl.style.display = 'block';
      btn.style.opacity = '1';
      btn.innerHTML = '<span class="btn-text">Sign In</span>';
    }
  }

  function logout() {
    localStorage.removeItem('admin_token');
    token = null;
    if (socket) socket.disconnect();
    showLogin();
    showToast('👋 Signed out successfully', 'success');
  }

  function showLogin() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
    const btn = document.getElementById('loginSubmitBtn');
    if (btn) { btn.style.opacity = '1'; btn.innerHTML = '<span class="btn-text">Sign In</span>'; }
  }

  function showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
  }

  // ─── Socket.IO ────────────────────────────────────────
  function connectSocket() {
    socket = io({ auth: { token } });

    socket.on('connect', () => {
      setConn(true);
    });

    socket.on('disconnect', () => {
      setConn(false);
    });

    socket.on('stats_update', (data) => {
      stats = data;
      if (currentPage === 'dashboard') renderDashboard(data);
    });

    socket.on('recent_events', (events) => {
      renderEventFeed(events);
    });

    socket.on('new_event', (event) => {
      addLiveEvent(event);
      addToEventFeed(event);
    });

    socket.on('connect_error', () => {
      setConn(false);
    });
  }

  function setConn(online) {
    const dot = document.querySelector('.conn-dot');
    const text = document.getElementById('connText');
    dot.className = 'conn-dot ' + (online ? 'online' : 'offline');
    text.textContent = online ? 'Connected' : 'Disconnected';
  }

  // ─── Page Router ──────────────────────────────────────
  function loadPage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(i => {
      const isActive = i.dataset.page === page;
      i.classList.toggle('active', isActive);
      if (isActive) i.setAttribute('aria-current', 'page');
      else i.removeAttribute('aria-current');
    });
    document.querySelectorAll('.page').forEach(p => {
      const show = p.id === 'page-' + page;
      p.classList.toggle('active', show);
      if (show) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });

    const saveBtn = document.getElementById('saveApiSettingsBtn');
    if (saveBtn) {
      saveBtn.style.display = page === 'settings' ? 'inline-flex' : 'none';
    }

    document.getElementById('pageTitle').textContent = {
      dashboard: 'Dashboard',
      accounts: 'Users',
      providers: 'AI Providers',
      events: 'Events log',
      live: 'Real-time',
      settings: 'Settings',
      apikeys: 'API Keys'
    }[page] || page;

    switch(page) {
      case 'dashboard': fetchStats(); break;
      case 'accounts':  loadUsers(1); break;
      case 'providers': renderProviders(stats); break;
      case 'events':    loadEvents(1); break;
      case 'settings':  loadApiSettings(); break;
      case 'apikeys':   loadApiKeys(); break;
    }
  }

  // ─── Dashboard ────────────────────────────────────────
  async function fetchStats() {
    try {
      const res = await apiFetch('/api/stats');
      stats = res;
      renderDashboard(res);
    } catch(e) {
      console.error('Stats fetch error:', e);
    }
  }

  function renderDashboard(data) {
    const total = data.totalRequests || 0;
    
    // Animated counter updates
    animateCounter('s-users', data.totalUsers || 0);
    animateCounter('s-requests', total);
    animateCounter('s-actions', data.totalActions || 0);
    animateCounter('s-errors', data.totalErrors || 0);
    
    // Active indicator
    const activeEl = document.getElementById('s-active');
    const activeCount = data.activeNow || 0;
    activeEl.innerHTML = `<span style="color:var(--green)">●</span> ${activeCount} active now`;
    
    // Today's requests
    const todayReq = data.today?.requests || 0;
    const todayEl = document.getElementById('s-today-req');
    todayEl.textContent = `↑ ${todayReq} today`;
    todayEl.className = 'stat-sub' + (todayReq > 0 ? ' positive' : '');
    
    // Error rate
    const rate = total > 0 ? ((data.totalErrors / total) * 100).toFixed(1) : 0;
    document.getElementById('s-error-rate').textContent = rate + '% error rate';

    renderProviderChart(data.providers || []);
    renderWeeklyChart(data.weekly || []);
    renderProviders(data);
  }

  // ─── Animated Counter ─────────────────────────────────
  function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const currentValue = counterCache[elementId] || 0;
    if (currentValue === targetValue) return;
    
    counterCache[elementId] = targetValue;
    
    const duration = 600;
    const startTime = performance.now();
    const startValue = currentValue;
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (targetValue - startValue) * easedProgress);
      
      el.textContent = fmt(current);
      el.classList.add('counter-animate');
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = fmt(targetValue);
        setTimeout(() => el.classList.remove('counter-animate'), 300);
      }
    }
    
    requestAnimationFrame(update);
  }

  // ─── Provider Chart ───────────────────────────────────
  function renderProviderChart(providers) {
    const el = document.getElementById('providerChart');
    const total = providers.reduce((s, p) => s + (p.calls || 0), 0) || 1;
    const sorted = [...providers].sort((a, b) => b.calls - a.calls);

    if (sorted.length === 0) {
      el.innerHTML = '<div style="padding:24px;color:var(--text-muted);font-size:13px;text-align:center;font-style:italic">📊 No data</div>';
      return;
    }

    el.innerHTML = sorted.map((p, i) => {
      const info = PROVIDERS[p.provider] || PROVIDERS.unknown;
      const pct = ((p.calls / total) * 100).toFixed(0);
      return `
        <div class="prov-row" style="animation-delay:${i * 0.08}s">
          <div class="prov-dot" style="background:${info.color}"></div>
          <div class="prov-name">${info.name}</div>
          <div class="prov-bar-wrap">
            <div class="prov-bar" style="width:${pct}%;background:linear-gradient(90deg, ${info.color}, ${info.color}88)"></div>
          </div>
          <div class="prov-count">${p.calls}</div>
        </div>`;
    }).join('');
  }

  // ─── Weekly Chart ─────────────────────────────────────
  function renderWeeklyChart(weekly) {
    const el = document.getElementById('weeklyChart');
    if (!weekly.length) {
      el.innerHTML = '<div style="padding:24px;color:var(--text-muted);font-size:13px;text-align:center;font-style:italic;width:100%;display:flex;align-items:center;justify-content:center">📈 No data</div>';
      return;
    }
    const max = Math.max(...weekly.map(d => d.requests), 1);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    el.innerHTML = weekly.map((d, i) => {
      const h = Math.max((d.requests / max) * 100, 4);
      const label = d.date ? d.date.slice(5) : '';
      const isToday = d.date === new Date().toISOString().split('T')[0];
      return `
        <div class="week-col" style="animation: barGrow 0.5s ease ${i * 0.07}s both">
          <div class="week-val">${d.requests}</div>
          <div class="week-bar" style="height:${h}%;${isToday ? 'background:linear-gradient(to top, #06b6d4, rgba(6,182,212,0.3));box-shadow:0 0 12px rgba(6,182,212,0.2)' : ''}"></div>
          <div class="week-label" style="${isToday ? 'color:var(--cyan);font-weight:700' : ''}">${label}</div>
        </div>`;
    }).join('');
  }

  // ─── Event Feed ───────────────────────────────────────
  function renderEventFeed(events) {
    const el = document.getElementById('recentFeed');
    if (!events.length) {
      el.innerHTML = '<div class="empty-msg">⏳ No events</div>';
      return;
    }
    el.innerHTML = events.slice().reverse().slice(0, 30).map((e, i) => eventFeedItem(e, i)).join('');
  }

  function addToEventFeed(event) {
    const el = document.getElementById('recentFeed');
    const emptyMsg = el.querySelector('.empty-msg');
    if (emptyMsg) emptyMsg.remove();
    el.insertAdjacentHTML('afterbegin', eventFeedItem(event, 0));
    while (el.children.length > 30) el.removeChild(el.lastChild);
  }

  function eventFeedItem(e, index) {
    const type = e.success === 0 || e.success === false ? 'error' : (e.type || 'request');
    const provInfo = PROVIDERS[e.provider] || PROVIDERS.unknown;
    return `
      <div class="event-item" style="animation-delay:${(index || 0) * 0.03}s">
        <div class="event-dot ${type}"></div>
        <div class="event-text">
          <strong style="color:var(--text-primary)">${esc(e.user_id || e.userId || '').slice(0,12)}</strong> · 
          ${esc(e.message || '')} 
          <span style="color:${provInfo.color}">(${provInfo.name})</span>
        </div>
        <div class="event-time">${e.time || ''}</div>
      </div>`;
  }

  // ─── Live Feed ────────────────────────────────────────
  function addLiveEvent(event) {
    const el = document.getElementById('liveFeed');
    const emptyMsg = el.querySelector('.empty-msg');
    if (emptyMsg) emptyMsg.remove();
    
    const icons = { request: '💬', action: '⚡', error: '❌', user_join: '👤' };
    const icon = icons[event.type] || '📡';
    const provInfo = PROVIDERS[event.provider] || PROVIDERS.unknown;
    
    const item = document.createElement('div');
    item.className = 'live-item';
    item.innerHTML = `
      <div class="live-icon">${icon}</div>
      <div class="live-body">
        <div class="live-title">${esc(event.message || event.type || '')}</div>
        <div class="live-meta">
          <span style="color:${provInfo.color}">${provInfo.name}</span> · 
          ${esc(event.userId || event.user_id || '').slice(0,12)}
        </div>
      </div>
      <div class="live-time">${event.time || 'just now'}</div>`;
    
    el.insertBefore(item, el.firstChild);
    
    const liveCount = document.getElementById('liveCount');
    if (liveCount && stats.activeNow !== undefined) {
      liveCount.textContent = stats.activeNow + ' active users';
    }
    
    while (el.children.length > 50) el.removeChild(el.lastChild);
  }

  // ─── Users ────────────────────────────────────────────
  async function loadUsers(page = 1) {
    const search = document.getElementById('userSearch').value;
    const tbody = document.getElementById('usersBody');
    
    // Show premium skeleton loading state
    tbody.innerHTML = Array(5).fill(0).map(() => `
      <tr>
        <td><div class="skeleton" style="width:20px;height:14px"></div></td>
        <td><div class="skeleton" style="width:120px;height:14px"></div></td>
        <td><div class="skeleton" style="width:100px;height:14px"></div></td>
        <td><div class="skeleton" style="width:80px;height:14px"></div></td>
        <td><div class="skeleton" style="width:90px;height:14px"></div></td>
        <td><div class="skeleton" style="width:60px;height:16px;border-radius:10px"></div></td>
        <td><div class="skeleton" style="width:140px;height:24px"></div></td>
      </tr>
    `).join('');

    try {
      const res = await apiFetch(`/api/accounts?search=${encodeURIComponent(search)}`);
      const now = Date.now();
      
      const filtered = search ? res.accounts.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.name || '').toLowerCase().includes(search.toLowerCase())
      ) : res.accounts;

      tbody.innerHTML = filtered.length ? filtered.map((u, i) => {
        const isOnline = u.last_login && (now - u.last_login) < 10 * 60 * 1000;
        const lastLogin = u.last_login ? timeAgo(u.last_login) : 'Never';
        const createdDate = new Date(u.created_at * 1000).toLocaleDateString('uz');
        return `
          <tr style="animation: pageSlide 0.3s ease ${i * 0.03}s both">
            <td style="color:var(--text-muted);font-weight:600">${i + 1}</td>
            <td><strong>${esc(u.email)}</strong></td>
            <td>${esc(u.name || '—')}</td>
            <td>${createdDate}</td>
            <td>${lastLogin}</td>
            <td><span class="badge ${u.status === 'banned' ? 'error' : isOnline ? 'online' : 'offline'}">${u.status === 'banned' ? '🚫 Banned' : isOnline ? '🟢 Online' : '⚫ Offline'}</span></td>
            <td style="display:flex;gap:6px">
              ${u.status === 'banned'
                ? `<button class="btn-ghost" data-action="ban" data-id="${u.id}" data-status="active">✅ Activate</button>`
                : `<button class="btn-danger-sm" data-action="ban" data-id="${u.id}" data-status="banned">🚫 Block</button>`
              }
              <button class="btn-danger-sm" data-action="delete" data-id="${u.id}" data-tooltip="Delete">🗑</button>
            </td>
          </tr>`;
      }).join('') : '<tr><td colspan="7" class="empty-cell">👤 No users</td></tr>';
    } catch (err) {
      console.error('Users load error:', err);
      tbody.innerHTML = `<tr><td colspan="7" class="empty-cell" style="color:var(--red)">❌ Failed to load users: ${esc(err.message)}</td></tr>`;
    }
  }

  const toggleBan = async (id, status) => {
    if (!confirm(status === 'banned' ? '⚠️ Are you sure you want to block this user?' : '✅ Are you sure you want to activate this user?')) return;
    await apiFetch(`/api/accounts/${id}`, 'PATCH', { status });
    showToast(status === 'banned' ? '🚫 User blocked' : '✅ User activated', status === 'banned' ? 'error' : 'success');
    loadUsers();
  };

  const deleteAccount = async (id) => {
    if (!confirm('⚠️ Are you sure you want to delete this user? This action cannot be undone!')) return;
    await apiFetch(`/api/accounts/${id}`, 'DELETE');
    showToast('🗑 User deleted', 'success');
    loadUsers();
  };

  // ─── Events ───────────────────────────────────────────
  async function loadEvents(page = 1) {
    const provider = document.getElementById('filterProvider').value;
    const date = document.getElementById('filterDate').value;
    const tbody = document.getElementById('eventsBody');
    
    // Show premium skeleton loading state
    tbody.innerHTML = Array(8).fill(0).map(() => `
      <tr>
        <td><div class="skeleton" style="width:110px;height:14px"></div></td>
        <td><div class="skeleton" style="width:70px;height:14px"></div></td>
        <td><div class="skeleton" style="width:70px;height:14px"></div></td>
        <td><div class="skeleton" style="width:180px;height:14px"></div></td>
        <td><div class="skeleton" style="width:20px;height:14px"></div></td>
        <td><div class="skeleton" style="width:50px;height:16px;border-radius:10px"></div></td>
      </tr>
    `).join('');

    try {
      const res = await apiFetch(`/api/events?page=${page}&limit=50&provider=${provider}&date=${date}`);
      
      tbody.innerHTML = res.events.length ? res.events.map((e, i) => {
        const provInfo = PROVIDERS[e.provider] || PROVIDERS.unknown;
        return `
          <tr style="animation: pageSlide 0.3s ease ${i * 0.02}s both">
            <td style="font-size:11px;color:var(--text-tertiary);font-family:var(--mono)">${e.date} ${e.time}</td>
            <td style="font-family:var(--mono);font-size:11px">${esc(e.user_id || '').slice(0,12)}</td>
            <td>
              <span style="color:${provInfo.color};font-weight:600">${provInfo.name}</span>
              ${e.latency ? `<br/><span style="font-size:10px;color:var(--text-tertiary);font-family:var(--mono)">⚡ ${e.latency}ms</span>` : ''}
            </td>
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.message || '')}">${esc(e.message || '')}</td>
            <td><span style="font-weight:700">${e.actions || 0}</span></td>
            <td><span class="badge ${e.success ? 'success' : 'error'}">${e.success ? '✅ OK' : '❌ Error'}</span></td>
          </tr>`;
      }).join('') : '<tr><td colspan="6" class="empty-cell">📋 No events</td></tr>';

      renderPagination('eventsPagination', page, Math.ceil(res.total / 50), loadEvents);
    } catch (err) {
      console.error('Events load error:', err);
      tbody.innerHTML = `<tr><td colspan="6" class="empty-cell" style="color:var(--red)">❌ Failed to load events: ${esc(err.message)}</td></tr>`;
    }
  }

  // ─── Providers ────────────────────────────────────────
  function renderProviders(data) {
    const el = document.getElementById('providersGrid');
    const provStats = data?.providers || [];
    const total = provStats.reduce((s, p) => s + (p.calls || 0), 0) || 1;

    el.innerHTML = Object.keys(PROVIDERS).filter(k => k !== 'unknown').map((key, i) => {
      const info = PROVIDERS[key];
      const p = provStats.find(x => x.provider === key) || { calls: 0, errors: 0 };
      const rate = p.calls > 0 ? Math.round(((p.calls - p.errors) / p.calls) * 100) : 0;
      const share = ((p.calls / total) * 100).toFixed(1);
      
      return `
        <div class="prov-card" style="--prov-color:${info.color};animation: pageSlide 0.4s ease ${i * 0.08}s both">
          <div class="prov-card-head">
            <div class="prov-avatar" style="background:${info.bg}">${info.letter}</div>
            <div>
              <div class="prov-name" style="color:var(--text-primary)">${info.name}</div>
              <div class="prov-model">${key} · ${share}%</div>
            </div>
          </div>
          <div class="prov-stats">
            <div class="prov-stat">
              <div class="prov-stat-val">${fmt(p.calls)}</div>
              <div class="prov-stat-lbl">Requests</div>
            </div>
            <div class="prov-stat">
              <div class="prov-stat-val" style="color:${p.errors > 0 ? 'var(--red)' : ''}">${p.errors}</div>
              <div class="prov-stat-lbl">Errors</div>
            </div>
            <div class="prov-stat">
              <div class="prov-stat-val" style="color:var(--green)">${rate}%</div>
              <div class="prov-stat-lbl">Success</div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ─── Clear data ───────────────────────────────────────
  async function clearEvents() {
    if (!confirm('⚠️ Are you sure you want to clear all events? This action cannot be undone!')) return;
    await apiFetch('/api/events', 'DELETE');
    showToast('🗑 All events cleared', 'success');
    loadPage('events');
  }

  async function clearUsers() {
    if (!confirm('⚠️ Are you sure you want to clear all users?')) return;
    await apiFetch('/api/users', 'DELETE');
    showToast('🗑 All users cleared', 'success');
    loadPage('accounts');
  }

  // ─── Export ───────────────────────────────────────────
  async function exportData() {
    try {
      const res = await apiFetch('/api/events?limit=10000');
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-agent-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('📥 Data exported!', 'success');
    } catch (err) {
      showToast('❌ Export failed', 'error');
    }
  }

  // ─── CSV Export Actions ────────────────────────────────
  function convertEventsToCSV(events) {
    const headers = ['ID', 'Date', 'Time', 'User ID', 'Provider', 'Type', 'Message', 'Actions', 'Success', 'Error', 'Latency'];
    const rows = [headers];

    events.forEach(e => {
      rows.push([
        e.id || '',
        e.date || '',
        e.time || '',
        e.user_id || e.userId || '',
        e.provider || '',
        e.type || '',
        e.message || '',
        e.actions || 0,
        e.success ? 'Success' : 'Error',
        e.error || '',
        e.latency || 0
      ]);
    });

    return rows.map(row => 
      row.map(val => {
        let cell = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(',')
    ).join('\r\n');
  }

  async function exportEventsCSV() {
    const provider = document.getElementById('filterProvider').value;
    const date = document.getElementById('filterDate').value;
    const btn = document.getElementById('exportCsvBtn');
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Exporting...';

    try {
      const res = await apiFetch(`/api/events?limit=10000&provider=${provider}&date=${date}`);
      if (!res.events || !res.events.length) {
        showToast('⚠️ No events to export', 'error');
        return;
      }
      
      const csvContent = convertEventsToCSV(res.events);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-agent-events-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('📥 CSV logs exported successfully!', 'success');
    } catch (err) {
      console.error('CSV Export error:', err);
      showToast('❌ CSV Export failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // ─── Pagination ───────────────────────────────────────
  function renderPagination(elId, current, total, callback) {
    const el = document.getElementById(elId);
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= Math.min(total, 10); i++) {
      html += `<button class="page-btn ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => callback(parseInt(btn.dataset.page)));
    });
  }

  // ─── Toast Notification ───────────────────────────────
  function showToast(message, type = 'success') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── Helpers ──────────────────────────────────────────
  async function apiFetch(url, method = 'GET', body = null) {
    const opts = { method, headers: { Authorization: `Bearer ${token}` } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function fmt(n) {
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return String(n);
  }

  function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' hr ago';
    return Math.floor(h / 24) + ' d ago';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ─── API Settings (Config Keys) ───────────────────────
  const CONFIG_FIELDS = [
    'openai_key', 'openai_model',
    'anthropic_key', 'anthropic_model',
    'gemini_key', 'gemini_model',
    'ollama_url', 'ollama_model', 'ollama_key', 'ollama_mode',
    'openrouter_key', 'openrouter_model'
  ];

  async function loadApiSettings() {
    try {
      const keys = await apiFetch('/api/config/keys');
      CONFIG_FIELDS.forEach(field => {
        const el = document.getElementById(field);
        if (el && keys[field] !== undefined) {
          el.value = keys[field];
        }
      });
      // Sync Ollama layout based on loaded mode
      const mode = keys['ollama_mode'] || 'local';
      setOllamaMode(mode);
    } catch (err) {
      console.error('API Settings load error:', err);
    }
  }

  // ─── API Keys page ────────────────────────────────────
  const PROVIDERS_CONFIG = [
    { id: 'openai',      label: 'OpenAI',      letter: 'G', bg: 'linear-gradient(135deg,#10a37f,#0d8068)', keyField: 'openai_key',      keyPlaceholder: 'sk-proj-...',        modelField: 'openai_model',      models: ['gpt-4o','gpt-4o-mini','gpt-4-turbo'] },
    { id: 'anthropic',   label: 'Anthropic',   letter: 'C', bg: 'linear-gradient(135deg,#d97757,#c25a3e)', keyField: 'anthropic_key',   keyPlaceholder: 'sk-ant-...',         modelField: 'anthropic_model',   models: ['claude-opus-4-5','claude-sonnet-4-5','claude-haiku-3-5'] },
    { id: 'gemini',      label: 'Gemini',      letter: 'G', bg: 'linear-gradient(135deg,#4285f4,#1a73e8)', keyField: 'gemini_key',      keyPlaceholder: 'AIza...',            modelField: 'gemini_model',      models: ['gemini-3.1-flash-lite','gemini-3.1-flash','gemini-2.0-flash'] },
    { id: 'openrouter',  label: 'OpenRouter',  letter: 'R', bg: 'linear-gradient(135deg,#ec4899,#be185d)', keyField: 'openrouter_key',  keyPlaceholder: 'sk-or-v1-...',       modelField: 'openrouter_model',  models: null },
  ];

  async function loadApiKeys() {
    const container = document.getElementById('apiKeysContainer');
    if (!container) return;

    // Load current keys
    let currentKeys = {};
    try { currentKeys = await apiFetch('/api/config/keys'); } catch {}

    // Render UI
    container.innerHTML = `
      <div style="max-width:640px">
        <div class="card" style="margin-bottom:14px">
          <div class="card-head">
            <h3>🔑 AI Provider API Keys</h3>
            <span style="font-size:11px;color:var(--text-tertiary)">Synced to all extension users</span>
          </div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:0">
            ${PROVIDERS_CONFIG.map((p, i) => `
              <div style="padding:16px 0;${i > 0 ? 'border-top:1px solid var(--border)' : ''}">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                  <div style="width:32px;height:32px;border-radius:8px;background:${p.bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">${p.letter}</div>
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${p.label}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                  <div style="position:relative">
                    <input
                      type="password"
                      id="ak_${p.keyField}"
                      class="api-key-input"
                      placeholder="${p.keyPlaceholder}"
                      value="${esc(currentKeys[p.keyField] || '')}"
                      style="padding-right:40px"
                    />
                    <button type="button" data-action="toggle-visibility" data-target="ak_${p.keyField}" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:14px">👁</button>
                  </div>
                  ${p.models ? `
                    <select id="ak_${p.modelField}" class="filter-select" style="width:100%">
                      ${p.models.map(m => `<option value="${m}" ${currentKeys[p.modelField] === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                  ` : `
                    <input type="text" id="ak_${p.modelField}" class="api-key-input" placeholder="e.g. google/gemma-4-31b-it:free" value="${esc(currentKeys[p.modelField] || '')}"/>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
          <div style="padding:14px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px">
            <button type="button" id="saveApiKeysBtn" class="btn-primary" style="min-width:130px">💾 Save All Keys</button>
            <span id="apiKeysSavedMsg" style="font-size:12px;color:var(--green);display:none">✓ Saved & synced to all users</span>
            <span id="apiKeysErrMsg" style="font-size:12px;color:var(--red);display:none"></span>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>ℹ️ How it works</h3></div>
          <div style="padding:14px 18px;font-size:13px;color:var(--text-secondary);line-height:1.8">
            <p>API keys saved here are <strong>automatically synced</strong> to all extension users when they open the extension.</p>
            <p style="margin-top:6px">Users don't need to enter API keys themselves — you manage them centrally from this panel.</p>
          </div>
        </div>
      </div>
    `;

    // Bind save button — use onclick to avoid duplicates
    const saveBtn = document.getElementById('saveApiKeysBtn');
    if (saveBtn) saveBtn.onclick = saveApiKeys_new;
  }

  window.toggleKeyVisibility = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  };

  async function saveApiKeys_new() {
    const btn = document.getElementById('saveApiKeysBtn');
    const savedMsg = document.getElementById('apiKeysSavedMsg');
    const errMsg = document.getElementById('apiKeysErrMsg');

    btn.disabled = true;
    btn.textContent = '⏳ Saving...';
    if (savedMsg) savedMsg.style.display = 'none';
    if (errMsg) errMsg.style.display = 'none';

    const payload = {};
    PROVIDERS_CONFIG.forEach(p => {
      const keyEl = document.getElementById('ak_' + p.keyField);
      const modelEl = document.getElementById('ak_' + p.modelField);
      if (keyEl && keyEl.value.trim()) payload[p.keyField] = keyEl.value.trim();
      if (modelEl && modelEl.value.trim()) payload[p.modelField] = modelEl.value.trim();
    });

    if (Object.keys(payload).length === 0) {
      btn.disabled = false;
      btn.textContent = '💾 Save All Keys';
      if (errMsg) { errMsg.textContent = '⚠️ Enter at least one API key'; errMsg.style.display = 'inline'; }
      return;
    }

    try {
      await apiFetch('/api/config/keys', 'POST', payload);
      btn.disabled = false;
      btn.textContent = '💾 Save All Keys';
      if (savedMsg) { savedMsg.style.display = 'inline'; setTimeout(() => savedMsg.style.display = 'none', 4000); }
      showToast('✅ API keys saved & synced to all users!', 'success');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '💾 Save All Keys';
      if (errMsg) { errMsg.textContent = '❌ ' + err.message; errMsg.style.display = 'inline'; }
      showToast('❌ Save failed: ' + err.message, 'error');
    }
  }

  function setOllamaMode(mode) {
    const hidden = document.getElementById('ollama_mode');
    if (hidden) hidden.value = mode;

    const btnLocal = document.getElementById('ollama_mode_local');
    const btnCloud = document.getElementById('ollama_mode_cloud');
    if (btnLocal) btnLocal.classList.toggle('active', mode === 'local');
    if (btnCloud) btnCloud.classList.toggle('active', mode === 'cloud');

    const localGroup = document.getElementById('ollamaLocalGroup');
    const cloudGroup = document.getElementById('ollamaCloudGroup');
    if (localGroup) localGroup.style.display = mode === 'local' ? '' : 'none';
    if (cloudGroup) cloudGroup.style.display = mode === 'cloud' ? '' : 'none';
  }

  async function saveApiSettings() {
    const btn = document.getElementById('saveApiSettingsBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Saving...';

    const keys = {};
    CONFIG_FIELDS.forEach(field => {
      const el = document.getElementById(field);
      if (el) {
        keys[field] = el.value.trim();
      }
    });

    try {
      const res = await apiFetch('/api/config/keys', 'POST', keys);
      if (res.error) throw new Error(res.error);
      showToast('✅ API settings saved successfully!', 'success');
    } catch (err) {
      showToast('❌ Error saving settings: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save';
    }
  }

})();
