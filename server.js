const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 今日の記録を取得
app.get('/api/today', (req, res) => {
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const record = db.prepare('SELECT * FROM records WHERE date = ?').get(today);
  res.json(record || { date: today, clock_in: null, clock_out: null, memo: '' });
});

// 出勤
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

// 退勤
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

// メモ更新
app.put('/api/memo', (req, res) => {
  const { date, memo } = req.body;
  const existing = db.prepare('SELECT * FROM records WHERE date = ?').get(date);
  if (!existing) {
    return res.status(404).json({ error: '記録が見つかりません' });
  }
  db.prepare('UPDATE records SET memo = ?, updated_at = datetime("now", "localtime") WHERE date = ?').run(memo, date);
  res.json({ success: true });
});

// 月別履歴取得
app.get('/api/records/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const startDate = `${year}-${month.padStart(2, '0')}-01`;
  const endDate = `${year}-${month.padStart(2, '0')}-31`;

  const records = db.prepare(
    'SELECT * FROM records WHERE date >= ? AND date <= ? ORDER BY date ASC'
  ).all(startDate, endDate);

  // 勤務時間の合計を計算
  let totalMinutes = 0;
  let workDays = 0;
  for (const r of records) {
    if (r.clock_in && r.clock_out) {
      const [inH, inM] = r.clock_in.split(':').map(Number);
      const [outH, outM] = r.clock_out.split(':').map(Number);
      totalMinutes += (outH * 60 + outM) - (inH * 60 + inM);
      workDays++;
    }
  }

  res.json({
    records,
    summary: {
      workDays,
      totalHours: Math.floor(totalMinutes / 60),
      totalMinutes: totalMinutes % 60,
    },
  });
});

app.listen(PORT, () => {
  console.log(`出退勤アプリ起動: http://localhost:${PORT}`);
});
