const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- 設定 API ----

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const { key, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ success: true });
});

// ---- 今日の記録 ----

app.get('/api/today', (req, res) => {
  const today = new Date().toLocaleDateString('sv-SE');
  const record = db.prepare('SELECT * FROM records WHERE date = ?').get(today);
  res.json(record || { date: today, clock_in: null, clock_out: null, scheduled_in: null, scheduled_out: null, memo: '' });
});

// ---- 出勤 ----

app.post('/api/clock-in', (req, res) => {
  const now = new Date();
  const date = now.toLocaleDateString('sv-SE');
  const time = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const existing = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  if (existing && existing.clock_in) {
    return res.status(400).json({ error: '既に出勤済みです' });
  }

  if (existing) {
    db.prepare('UPDATE records SET clock_in = ?, updated_at = datetime("now", "localtime") WHERE date = ?').run(time, date);
  } else {
    db.prepare('INSERT INTO records (date, clock_in) VALUES (?, ?)').run(date, time);
  }

  const record = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  res.json(record);
});

// ---- 退勤 ----

app.post('/api/clock-out', (req, res) => {
  const now = new Date();
  const date = now.toLocaleDateString('sv-SE');
  const time = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const existing = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  if (!existing || !existing.clock_in) {
    return res.status(400).json({ error: '先に出勤してください' });
  }
  if (existing.clock_out) {
    return res.status(400).json({ error: '既に退勤済みです' });
  }

  db.prepare('UPDATE records SET clock_out = ?, updated_at = datetime("now", "localtime") WHERE date = ?').run(time, date);

  const record = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  res.json(record);
});

// ---- 記録の編集（任意の日付） ----

app.put('/api/records/:date', (req, res) => {
  const { date } = req.params;
  const { clock_in, clock_out, memo } = req.body;

  const existing = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  if (existing) {
    db.prepare(`
      UPDATE records SET clock_in = ?, clock_out = ?, memo = ?, updated_at = datetime('now', 'localtime')
      WHERE date = ?
    `).run(clock_in || null, clock_out || null, memo || '', date);
  } else {
    db.prepare('INSERT INTO records (date, clock_in, clock_out, memo) VALUES (?, ?, ?, ?)').run(
      date, clock_in || null, clock_out || null, memo || ''
    );
  }

  const record = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  res.json(record);
});

// ---- 予定の編集 ----

app.put('/api/schedule/:date', (req, res) => {
  const { date } = req.params;
  const { scheduled_in, scheduled_out } = req.body;

  const existing = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  if (existing) {
    db.prepare(`
      UPDATE records SET scheduled_in = ?, scheduled_out = ?, updated_at = datetime('now', 'localtime')
      WHERE date = ?
    `).run(scheduled_in || null, scheduled_out || null, date);
  } else {
    db.prepare('INSERT INTO records (date, scheduled_in, scheduled_out) VALUES (?, ?, ?)').run(
      date, scheduled_in || null, scheduled_out || null
    );
  }

  const record = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  res.json(record);
});

// ---- メモ更新 ----

app.put('/api/memo', (req, res) => {
  const { date, memo } = req.body;
  const existing = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  if (!existing) {
    return res.status(404).json({ error: '記録が見つかりません' });
  }
  db.prepare('UPDATE records SET memo = ?, updated_at = datetime("now", "localtime") WHERE date = ?').run(memo, date);
  res.json({ success: true });
});

// ---- 月別履歴取得 ----

function calcMinutes(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  const m = (outH * 60 + outM) - (inH * 60 + inM);
  return m > 0 ? m : 0;
}

app.get('/api/records/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const mm = month.padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-31`;
  const today = new Date().toLocaleDateString('sv-SE');

  const records = db.prepare(
    'SELECT * FROM records WHERE date >= ? AND date <= ? ORDER BY date ASC'
  ).all(startDate, endDate);

  const hourlyWage = Number(
    (db.prepare("SELECT value FROM settings WHERE key = 'hourly_wage'").get() || {}).value || 1000
  );

  let actualMinutes = 0;   // 実績勤務分
  let workDays = 0;
  let scheduledMinutes = 0; // 予定勤務分（未実績の将来日分）

  for (const r of records) {
    const hasActual = r.clock_in && r.clock_out;
    if (hasActual) {
      actualMinutes += calcMinutes(r.clock_in, r.clock_out);
      workDays++;
    } else if (r.scheduled_in && r.scheduled_out && r.date > today) {
      scheduledMinutes += calcMinutes(r.scheduled_in, r.scheduled_out);
    }
  }

  const actualSalary = Math.round((actualMinutes / 60) * hourlyWage);
  const projectedSalary = Math.round(((actualMinutes + scheduledMinutes) / 60) * hourlyWage);

  res.json({
    records,
    summary: {
      workDays,
      totalHours: Math.floor(actualMinutes / 60),
      totalMinutes: actualMinutes % 60,
      hourlyWage,
      actualSalary,
      projectedSalary,
      scheduledHours: Math.floor(scheduledMinutes / 60),
      scheduledMinutes: scheduledMinutes % 60,
    },
  });
});

app.listen(PORT, () => {
  console.log(`出退勤アプリ起動: http://localhost:${PORT}`);
});
