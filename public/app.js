const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

let viewYear, viewMonth;

// 現在時刻の更新
function updateClock() {
  const now = new Date();
  document.getElementById('current-time').textContent =
    now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// 今日の日付表示
function showTodayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const day = DAY_NAMES[now.getDay()];
  document.getElementById('today-date').textContent = `${y}年${m}月${d}日 (${day})`;
}
showTodayDate();

// 勤務時間計算
function calcDuration(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  const mins = (outH * 60 + outM) - (inH * 60 + inM);
  if (mins < 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// 今日の記録を取得
async function loadToday() {
  const res = await fetch('/api/today');
  const data = await res.json();

  document.getElementById('clock-in-time').textContent = data.clock_in || '--:--:--';
  document.getElementById('clock-out-time').textContent = data.clock_out || '--:--:--';

  const duration = calcDuration(data.clock_in, data.clock_out);
  document.getElementById('work-duration').textContent = duration || '--:--';

  document.getElementById('memo').value = data.memo || '';

  const btnIn = document.getElementById('btn-clock-in');
  const btnOut = document.getElementById('btn-clock-out');

  if (!data.clock_in) {
    btnIn.disabled = false;
    btnOut.disabled = true;
  } else if (!data.clock_out) {
    btnIn.disabled = true;
    btnOut.disabled = false;
  } else {
    btnIn.disabled = true;
    btnOut.disabled = true;
  }
}

// 出勤
async function clockIn() {
  const res = await fetch('/api/clock-in', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error);
    return;
  }
  await loadToday();
  loadHistory();
}

// 退勤
async function clockOut() {
  const res = await fetch('/api/clock-out', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error);
    return;
  }
  await loadToday();
  loadHistory();
}

// メモ保存
async function saveMemo() {
  const now = new Date();
  const date = now.toLocaleDateString('sv-SE');
  const memo = document.getElementById('memo').value;
  const res = await fetch('/api/memo', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, memo }),
  });
  if (res.ok) {
    showToast('メモを保存しました');
  }
}

// トースト通知
function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #333; color: #fff; padding: 10px 20px; border-radius: 8px;
    font-size: 0.9rem; z-index: 1000; opacity: 0; transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 月別履歴
async function loadHistory() {
  document.getElementById('current-month').textContent = `${viewYear}年${viewMonth}月`;

  const res = await fetch(`/api/records/${viewYear}/${viewMonth}`);
  const data = await res.json();

  // サマリー
  const { workDays, totalHours, totalMinutes } = data.summary;
  document.getElementById('summary').textContent =
    `出勤日数: ${workDays}日 / 合計勤務時間: ${totalHours}時間${totalMinutes}分`;

  // テーブル
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';

  // 月の全日を表示
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const record = data.records.find(r => r.date === dateStr);
    const dateObj = new Date(viewYear, viewMonth - 1, d);
    const dayOfWeek = dateObj.getDay();
    const dayName = DAY_NAMES[dayOfWeek];

    const tr = document.createElement('tr');
    if (dayOfWeek === 0) tr.classList.add('day-sun');
    if (dayOfWeek === 6) tr.classList.add('day-sat');

    const clockIn = record?.clock_in || '';
    const clockOut = record?.clock_out || '';
    const duration = calcDuration(clockIn, clockOut) || '';
    const memo = record?.memo || '';

    tr.innerHTML = `
      <td>${viewMonth}/${d}</td>
      <td class="${dayOfWeek === 0 ? 'day-sun' : dayOfWeek === 6 ? 'day-sat' : ''}">${dayName}</td>
      <td>${clockIn}</td>
      <td>${clockOut}</td>
      <td>${duration}</td>
      <td style="text-align:left; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${memo}</td>
    `;
    tbody.appendChild(tr);
  }
}

function prevMonth() {
  viewMonth--;
  if (viewMonth < 1) { viewMonth = 12; viewYear--; }
  loadHistory();
}

function nextMonth() {
  viewMonth++;
  if (viewMonth > 12) { viewMonth = 1; viewYear++; }
  loadHistory();
}

// 初期化
const now = new Date();
viewYear = now.getFullYear();
viewMonth = now.getMonth() + 1;
loadToday();
loadHistory();
