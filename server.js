require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// ─── Database setup ──────────────────────────────────────
const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    user_id TEXT,
    provider TEXT,
    message TEXT,
    actions INTEGER DEFAULT 0,
    success INTEGER DEFAULT 1,
    error TEXT,
    url TEXT,
    date TEXT,
    time TEXT,
    timestamp INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    first_seen TEXT,
    last_active INTEGER,
    request_count INTEGER DEFAULT 0,
    main_provider TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    requests INTEGER DEFAULT 0,
    actions INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'active',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    last_login INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    token TEXT UNIQUE NOT NULL,
    device_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT UNIQUE PRIMARY KEY,
    value TEXT
  );
`);

// Prepared statements
const stmts = {
  insertEvent: db.prepare(`
    INSERT INTO events (type, user_id, provider, message, actions, success, error, url, date, time, timestamp)
    VALUES (@type, @userId, @provider, @message, @actions, @success, @error, @url, @date, @time, @timestamp)
  `),
  upsertUser: db.prepare(`
    INSERT INTO users (user_id, first_seen, last_active, request_count, main_provider)
    VALUES (@userId, @firstSeen, @lastActive, 1, @provider)
    ON CONFLICT(user_id) DO UPDATE SET
      last_active = @lastActive,
      request_count = request_count + 1,
      main_provider = @provider
  `),
  upsertDaily: db.prepare(`
    INSERT INTO daily_stats (date, requests, actions, errors)
    VALUES (@date, @requests, @actions, @errors)
    ON CONFLICT(date) DO UPDATE SET
      requests = requests + @requests,
      actions = actions + @actions,
      errors = errors + @errors
  `)
};

// ─── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(compression()); // gzip — text compression
app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  // Cross-Origin-Opener-Policy — origin isolation
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Cross-Origin-Embedder-Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Content Security Policy with Trusted Types
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' ws: wss:; " +
    "font-src 'self' data:; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none'; " +
    "form-action 'self'; " +
    "upgrade-insecure-requests;"
  );
  // HSTS — strong policy
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Cache control for HTML
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (/\.(js|css|png|jpg|svg|woff2?)$/.test(req.path)) {
    // Long cache for static assets
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /api/\nAllow: /\n');
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token kerak' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token yaroqsiz' });
  }
}

// ─── Auth Routes ─────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = username === (process.env.ADMIN_USERNAME || 'admin');
  const validPass = password === (process.env.ADMIN_PASSWORD || 'admin123');

  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Login yoki parol xato' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username });
});

// ─── User Auth (Extension users) ─────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email va parol kerak' });
  if (!email.includes('@')) return res.status(400).json({ error: 'Email noto\'g\'ri' });
  if (password.length < 6) return res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak' });

  const exists = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO accounts (email, password_hash, name) VALUES (?, ?, ?)').run(email, hash, name || email.split('@')[0]);

  const token = jwt.sign({ accountId: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '30d' });
  db.prepare('INSERT INTO user_sessions (account_id, token) VALUES (?, ?)').run(result.lastInsertRowid, token);

  // Log to analytics
  io.to('admins').emit('new_account', { email, name, createdAt: Date.now() });
  io.to('admins').emit('stats_update', getStats());

  res.json({ token, user: { id: result.lastInsertRowid, email, name: name || email.split('@')[0] } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email va parol kerak' });

  const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
  if (!account) return res.status(401).json({ error: 'Email topilmadi' });
  if (account.status === 'banned') return res.status(403).json({ error: 'Sizning hisobingiz bloklangan' });

  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) return res.status(401).json({ error: 'Parol xato' });

  db.prepare('UPDATE accounts SET last_login = ? WHERE id = ?').run(Date.now(), account.id);

  const token = jwt.sign({ accountId: account.id, email }, JWT_SECRET, { expiresIn: '30d' });
  db.prepare('INSERT INTO user_sessions (account_id, token) VALUES (?, ?)').run(account.id, token);

  res.json({ token, user: { id: account.id, email: account.email, name: account.name } });
});

app.post('/api/auth/verify', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.body?.token;
  if (!token) return res.status(401).json({ error: 'Token kerak' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const account = db.prepare('SELECT id, email, name, status FROM accounts WHERE id = ?').get(decoded.accountId);
    if (!account) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
    if (account.status === 'banned') return res.status(403).json({ error: 'Hisob bloklangan' });
    res.json({ valid: true, user: account });
  } catch {
    res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// ─── Admin: Accounts management ──────────────────────────
app.get('/api/accounts', authMiddleware, (req, res) => {
  const accounts = db.prepare('SELECT id, email, name, status, created_at, last_login FROM accounts ORDER BY created_at DESC').all();
  res.json({ accounts, total: accounts.length });
});

app.patch('/api/accounts/:id', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!['active', 'banned'].includes(status)) return res.status(400).json({ error: 'Status: active yoki banned' });
  db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, req.params.id);
  io.to('admins').emit('stats_update', getStats());
  res.json({ ok: true });
});

app.delete('/api/accounts/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM user_sessions WHERE account_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Analytics Ingestion (from extension) ────────────────
app.post('/api/ingest', (req, res) => {
  const { type, userId, provider, message, actions, success, error, url, date, time, timestamp } = req.body;

  if (!type || !userId) return res.status(400).json({ error: 'type va userId kerak' });

  const now = new Date();
  const eventDate = date || now.toISOString().split('T')[0];
  const eventTime = time || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  db.transaction(() => {
    // Insert event
    const result = stmts.insertEvent.run({
      type, userId, provider: provider || 'unknown',
      message: (message || '').slice(0, 200),
      actions: actions || 0,
      success: success ? 1 : 0,
      error: error ? error.slice(0, 200) : null,
      url: url || null,
      date: eventDate, time: eventTime,
      timestamp: timestamp || Date.now()
    });

    // Upsert user
    stmts.upsertUser.run({
      userId, firstSeen: eventDate,
      lastActive: Date.now(),
      provider: provider || 'unknown'
    });

    // Update daily stats
    stmts.upsertDaily.run({
      date: eventDate,
      requests: 1,
      actions: actions || 0,
      errors: success ? 0 : 1
    });

    // Emit to connected admins in real-time
    const eventObj = { id: result.lastInsertRowid, type, userId, provider, message, actions, success, date: eventDate, time: eventTime };
    io.to('admins').emit('new_event', eventObj);
    io.to('admins').emit('stats_update', getStats());
  })();

  res.json({ ok: true });
});

// ─── Dashboard Stats API ─────────────────────────────────
app.get('/api/stats', authMiddleware, (req, res) => {
  res.json(getStats());
});

function getStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
  const totalRequests = db.prepare("SELECT COUNT(*) as c FROM events WHERE type='request'").get().c;
  const totalActions = db.prepare('SELECT SUM(actions) as c FROM events').get().c || 0;
  const totalErrors = db.prepare('SELECT COUNT(*) as c FROM events WHERE success=0').get().c;

  const today = new Date().toISOString().split('T')[0];
  const todayStats = db.prepare('SELECT * FROM daily_stats WHERE date=?').get(today);

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeNow = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE last_login > ?').get(fiveMinAgo).c;
  const newToday = db.prepare("SELECT COUNT(*) as c FROM accounts WHERE date(datetime(created_at, 'unixepoch')) = ?").get(today).c;

  const providers = db.prepare(`
    SELECT provider, COUNT(*) as calls,
    SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as errors
    FROM events WHERE type='request'
    GROUP BY provider
  `).all();

  const weekly = db.prepare(`
    SELECT date, requests, errors FROM daily_stats
    ORDER BY date DESC LIMIT 7
  `).all().reverse();

  return { totalUsers, totalRequests, totalActions, totalErrors, today: todayStats, activeNow, newToday, providers, weekly };
}

// ─── Users API ───────────────────────────────────────────
app.get('/api/users', authMiddleware, (req, res) => {
  const { page = 1, limit = 50, search = '' } = req.query;
  const offset = (page - 1) * limit;

  const users = db.prepare(`
    SELECT u.*, COUNT(e.id) as total_requests
    FROM users u
    LEFT JOIN events e ON e.user_id = u.user_id
    WHERE u.user_id LIKE ?
    GROUP BY u.id
    ORDER BY u.last_active DESC
    LIMIT ? OFFSET ?
  `).all(`%${search}%`, parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM users WHERE user_id LIKE ?').get(`%${search}%`).c;

  res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
});

// ─── Events API ──────────────────────────────────────────
app.get('/api/events', authMiddleware, (req, res) => {
  const { page = 1, limit = 100, provider = '', type = '', date = '' } = req.query;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];

  if (provider) { where += ' AND provider = ?'; params.push(provider); }
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (date) { where += ' AND date = ?'; params.push(date); }

  const events = db.prepare(`
    SELECT * FROM events WHERE ${where}
    ORDER BY timestamp DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM events WHERE ${where}`).get(...params).c;

  res.json({ events, total });
});

// ─── Clear data ──────────────────────────────────────────
app.delete('/api/events', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM events').run();
  db.prepare('DELETE FROM daily_stats').run();
  io.to('admins').emit('stats_update', getStats());
  res.json({ ok: true });
});

app.delete('/api/users', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM users').run();
  io.to('admins').emit('stats_update', getStats());
  res.json({ ok: true });
});

// ─── API Config Keys (Settings) ──────────────────────────
app.get('/api/config/keys', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM config').all();
    const keysObj = {};
    rows.forEach(row => {
      keysObj[row.key] = row.value;
    });
    res.json(keysObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/keys', authMiddleware, (req, res) => {
  const keys = req.body;
  if (!keys || typeof keys !== 'object') {
    return res.status(400).json({ error: 'Nomalum kalitlar formati' });
  }

  const insert = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  
  try {
    db.transaction(() => {
      for (const [k, v] of Object.entries(keys)) {
        insert.run(k, String(v === null || v === undefined ? '' : v).trim());
      }
    })();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.IO ───────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Auth kerak'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Token yaroqsiz'));
  }
});

io.on('connection', (socket) => {
  socket.join('admins');
  console.log(`Admin ulandi: ${socket.id}`);

  // Send initial stats
  socket.emit('stats_update', getStats());

  // Send last 20 events
  const recentEvents = db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT 20').all();
  socket.emit('recent_events', recentEvents.reverse());

  socket.on('disconnect', () => {
    console.log(`Admin uzildi: ${socket.id}`);
  });
});

// ─── Serve admin panel ────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║  AI Agent Admin Panel               ║
║  http://localhost:${PORT}                ║
║  Login: ${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'admin123'}         ║
╚══════════════════════════════════════╝
  `);
});
