const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

let viewYear, viewMonth;

// ---- 現在時刻 ----

function updateClock() {
  const now = new Date();
  document.getElementById('current-time').textContent =
    now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ---- 今日の日付 ----

function showTodayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const day = DAY_NAMES[now.getDay()];
  document.getElementById('today-date').textContent = `${y}年${m}月${d}日 (${day})`;
}
showTodayDate();

// ---- ユーティリティ ----

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

function formatYen(n) {
  return n.toLocaleString('ja-JP') + '円';
}

// ---- 設定 ----

async function loadSettings() {
  const res = await fetch('/api/settings');
  const data = await res.json();
  document.getElementById('hourly-wage').value = data.hourly_wage || 1000;
}

async function saveWage() {
  const value = document.getElementById('hourly-wage').value;
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'hourly_wage', value }),
  });
  showToast('時給を保存しました');
  loadHistory();
}

// ---- 今日の記録 ----

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

// ---- 出勤・退勤 ----

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

// ---- メモ保存 ----

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

// ---- トースト ----

function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #333; color: #fff; padding: 10px 20px; border-radius: 8px;
    font-size: 0.9rem; z-index: 2000; opacity: 0; transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ---- モーダル（編集・予定入力） ----

function openEditModal(dateStr, record) {
  const d = new Date(dateStr + 'T00:00:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dayName = DAY_NAMES[d.getDay()];

  document.getElementById('modal-title').textContent = `${m}/${day} (${dayName}) の編集`;
  document.getElementById('edit-date').value = dateStr;

  // 出退勤の実績
  const ci = record?.clock_in || '';
  const co = record?.clock_out || '';
  document.getElementById('edit-clock-in').value = ci ? ci.substring(0, 5) : '';
  document.getElementById('edit-clock-out').value = co ? co.substring(0, 5) : '';
  document.getElementById('edit-memo').value = record?.memo || '';

  // 予定
  const si = record?.scheduled_in || '';
  const so = record?.scheduled_out || '';
  document.getElementById('edit-scheduled-in').value = si ? si.substring(0, 5) : '';
  document.getElementById('edit-scheduled-out').value = so ? so.substring(0, 5) : '';

  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

async function saveEdit() {
  const date = document.getElementById('edit-date').value;
  const clockIn = document.getElementById('edit-clock-in').value;
  const clockOut = document.getElementById('edit-clock-out').value;
  const memo = document.getElementById('edit-memo').value;
  const scheduledIn = document.getElementById('edit-scheduled-in').value;
  const scheduledOut = document.getElementById('edit-scheduled-out').value;

  // 実績を保存
  await fetch(`/api/records/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      memo: memo || '',
    }),
  });

  // 予定を保存
  await fetch(`/api/schedule/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scheduled_in: scheduledIn || null,
      scheduled_out: scheduledOut || null,
    }),
  });

  closeModal();
  showToast('保存しました');

  // 今日の表示も更新
  const today = new Date().toLocaleDateString('sv-SE');
  if (date === today) {
    await loadToday();
  }
  loadHistory();
}

// ---- 月別履歴 ----

async function loadHistory() {
  document.getElementById('current-month').textContent = `${viewYear}年${viewMonth}月`;

  const res = await fetch(`/api/records/${viewYear}/${viewMonth}`);
  const data = await res.json();
  const { summary } = data;

  // 給料サマリー
  const salaryEl = document.getElementById('salary-summary');
  salaryEl.innerHTML = `
    <div class="salary-item">
      <span class="salary-label">時給</span>
      <span class="salary-value">${formatYen(summary.hourlyWage)}</span>
    </div>
    <div class="salary-item">
      <span class="salary-label">確定給料（実績）</span>
      <span class="salary-value">${formatYen(summary.actualSalary)}</span>
    </div>
    <div class="salary-item">
      <span class="salary-label">見込給料（実績+予定）</span>
      <span class="salary-value">${formatYen(summary.projectedSalary)}</span>
    </div>
  `;

  // 勤務サマリー
  document.getElementById('summary').textContent =
    `出勤日数: ${summary.workDays}日 / 実績勤務: ${summary.totalHours}時間${summary.totalMinutes}分` +
    (summary.scheduledHours || summary.scheduledMinutes
      ? ` / 予定勤務: ${summary.scheduledHours}時間${summary.scheduledMinutes}分`
      : '');

  // テーブル
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const record = data.records.find(r => r.date === dateStr) || null;
    const dateObj = new Date(viewYear, viewMonth - 1, d);
    const dayOfWeek = dateObj.getDay();
    const dayName = DAY_NAMES[dayOfWeek];

    const tr = document.createElement('tr');
    if (dayOfWeek === 0) tr.classList.add('day-sun');
    if (dayOfWeek === 6) tr.classList.add('day-sat');

    const ci = record?.clock_in || '';
    const co = record?.clock_out || '';
    const duration = calcDuration(ci, co) || '';
    const memo = record?.memo || '';

    // 予定表示
    const si = record?.scheduled_in || '';
    const so = record?.scheduled_out || '';
    let scheduleText = '';
    if (si && so) {
      scheduleText = `${si.substring(0, 5)}-${so.substring(0, 5)}`;
    } else if (si) {
      scheduleText = `${si.substring(0, 5)}-`;
    } else if (so) {
      scheduleText = `-${so.substring(0, 5)}`;
    }

    tr.innerHTML = `
      <td>${viewMonth}/${d}</td>
      <td class="${dayOfWeek === 0 ? 'day-sun' : dayOfWeek === 6 ? 'day-sat' : ''}">${dayName}</td>
      <td>${ci}</td>
      <td>${co}</td>
      <td>${duration}</td>
      <td class="schedule-text">${scheduleText}</td>
      <td style="text-align:left; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${memo}</td>
      <td><button class="btn btn-edit" data-date="${dateStr}">編集</button></td>
    `;
    tbody.appendChild(tr);
  }

  // 編集ボタンのイベント
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const dateStr = btn.dataset.date;
      const record = data.records.find(r => r.date === dateStr) || null;
      openEditModal(dateStr, record);
    });
  });
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

// ---- 初期化 ----

const now = new Date();
viewYear = now.getFullYear();
viewMonth = now.getMonth() + 1;
loadSettings();
loadToday();
loadHistory();
