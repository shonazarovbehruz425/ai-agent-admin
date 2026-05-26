const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
console.log('Database path:', dbPath);

try {
  const db = new Database(dbPath);
  const rows = db.prepare('SELECT * FROM config').all();
  console.log('Config rows in database:');
  console.log(rows);
} catch (e) {
  console.error('Error reading database:', e);
}
