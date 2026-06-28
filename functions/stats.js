export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== env.ADMIN_KEY) return new Response("Denied", { status: 403 });

  const adminKey = searchParams.get('key');

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  let systemErrorMessage = "";
  let diagnosticMessage = "";
  let rawLogsCount = 0;
  let rawLogs = [];

  let gemDataTotal = 0;
  let gDataTotal = 0;
  let imgDataTotal = 0;

  try {
    const supabaseResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ai_usage_logs?select=created_at,device_name,email&order=id.desc&limit=5000`,
      {
        method: 'GET',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`
        }
      }
    );

    if (!supabaseResponse.ok) {
      const errText = await supabaseResponse.text();
      throw new Error(`Database connection failed (${supabaseResponse.status}): ${errText}`);
    }

    const rawData = await supabaseResponse.json();
    if (Array.isArray(rawData)) {
      rawLogs = rawData;
      rawLogsCount = rawLogs.length;
    } else {
      throw new Error("Invalid data format received from database (Expected an array).");
    }

    rawLogs.forEach(log => {
      if (log.device_name) {
        if (log.device_name.includes('G Data')) gDataTotal++;
        else if (log.device_name.includes('Gem Data')) gemDataTotal++;
        else if (log.device_name.includes('Img Data')) imgDataTotal++;
      }
    });

    if (rawLogsCount === 0) {
      diagnosticMessage = `Connected to Supabase table 'ai_usage_logs' successfully, but the table returned 0 records.`;
    }

  } catch (err) {
    systemErrorMessage = err.message;
  }

  let noticeHTML = '';
  if (systemErrorMessage) {
    noticeHTML = `<div style="background-color:#fef2f2;border-left:4px solid #ef4444;color:#991b1b;padding:15px;margin-bottom:20px;border-radius:4px;font-size:14px;word-wrap:break-word;">
                   <strong>⚠️ Critical System Error:</strong> ${systemErrorMessage}
                 </div>`;
  } else if (diagnosticMessage) {
    noticeHTML = `<div style="background-color:#fefcbf;border-left:4px solid #ecc94b;color:#744210;padding:15px;margin-bottom:20px;border-radius:4px;font-size:14px;line-height:1.5;">
                   <strong>ℹ️ Diagnostic Report:</strong> ${diagnosticMessage}
                 </div>`;
  }

  const logsJson = JSON.stringify(rawLogs);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expoloom AI Insights</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; padding: 15px; background: #fff; color: #000; -webkit-tap-highlight-color: transparent; }
        .card { border: 1.5px solid #000; padding: 20px; border-radius: 18px; margin-bottom: 15px; cursor: pointer; }
        h3 { margin: 0; font-size: 11px; text-transform: uppercase; color: #888; font-weight: 700; letter-spacing: 1px; }
        .count { font-size: 34px; font-weight: bold; margin: 5px 0; }
        .graph-container { display: none; margin-top: 15px; height: 220px; border-top: 1px solid #eee; padding-top: 15px; }
        .weekly-list { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; }
        .day-row { padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
        .day-flex { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 16px; }
        .day-graph-box { display: none; height: 200px; margin-top: 10px; padding-top: 10px; }
        .logs-container { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; max-height: 250px; overflow-y: auto; }
        .log-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 5px; border-bottom: 1px solid #f5f5f5; font-size: 13px; font-weight: 600; }
        .log-col { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .log-left { text-align: left; color: #555; }
        .log-center { text-align: center; color: #000; font-weight: 700; }
        .log-right { text-align: right; color: #2563eb; font-weight: 700; }
        .no-logs { text-align: center; color: #999; padding: 20px 0; font-size: 14px; }

        /* Email accordion */
        .email-row { border: 1.5px solid #000; border-radius: 18px; margin-bottom: 10px; overflow: hidden; }
        .email-header { display: flex; align-items: center; padding: 16px 18px; cursor: pointer; gap: 12px; }
        .email-avatar { width: 34px; height: 34px; border-radius: 50%; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
        .email-info { flex: 1; min-width: 0; }
        .email-addr { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .email-meta { font-size: 12px; color: #888; margin-top: 2px; }
        .req-badge { background: #000; color: #fff; font-size: 13px; font-weight: 700; padding: 4px 11px; border-radius: 999px; flex-shrink: 0; }
        .email-chevron { width: 18px; height: 18px; flex-shrink: 0; stroke: #aaa; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.25s ease; }
        .email-row.open .email-chevron { transform: rotate(180deg); }
        .email-detail { display: none; border-top: 1px solid #eee; padding: 0 18px; }
        .email-row.open .email-detail { display: block; }
        .email-log-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; font-weight: 600; }
        .email-log-item:last-child { border-bottom: none; margin-bottom: 6px; }
        .email-log-device { color: #555; flex: 1; }
        .email-log-type { color: #2563eb; font-weight: 700; flex-shrink: 0; }
        .email-log-time { color: #000; font-weight: 700; flex-shrink: 0; margin-left: 12px; }

        /* Timezone button */
        #tzBtn {
            position: fixed;
            top: 15px;
            right: 15px;
            background: #000;
            color: #fff;
            border: none;
            border-radius: 50px;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 999;
            box-shadow: 0 2px 12px rgba(0,0,0,0.18);
        }
        #tzBtn svg { width: 15px; height: 15px; fill: #fff; }

        /* Timezone modal overlay */
        #tzOverlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 1000;
            align-items: flex-end;
            justify-content: center;
        }
        #tzOverlay.open { display: flex; }
        #tzPanel {
            background: #fff;
            width: 100%;
            max-width: 480px;
            border-radius: 22px 22px 0 0;
            padding: 24px 20px 36px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            animation: slideUp 0.25s ease;
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        #tzPanel h2 { font-size: 17px; font-weight: 700; margin: 0 0 14px; }
        #tzSearch {
            width: 100%;
            padding: 12px 14px;
            border: 1.5px solid #000;
            border-radius: 12px;
            font-size: 15px;
            outline: none;
            margin-bottom: 12px;
        }
        #tzList {
            overflow-y: auto;
            flex: 1;
        }
        .tz-item {
            padding: 13px 10px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            font-weight: 500;
            border-radius: 8px;
            transition: background 0.1s;
        }
        .tz-item:hover { background: #f5f5f5; }
        .tz-item.selected { background: #000; color: #fff; border-radius: 10px; }
        .tz-item.selected .tz-offset { color: #ccc; }
        .tz-offset { font-size: 12px; color: #888; font-weight: 600; }
        #tzCloseBtn {
            background: none;
            border: 1.5px solid #000;
            border-radius: 12px;
            padding: 12px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            margin-top: 14px;
            width: 100%;
        }
        #currentTzLabel {
            font-size: 11px;
            color: #888;
            margin-bottom: 2px;
            padding-left: 5px;
        }
    </style>
</head>
<body>
    ${noticeHTML}

    <!-- Timezone Selector Button -->
    <button id="tzBtn" onclick="openTz()">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
        </svg>
        <span id="tzBtnLabel">Timezone</span>
    </button>

    <!-- Timezone Modal -->
    <div id="tzOverlay" onclick="handleOverlayClick(event)">
        <div id="tzPanel">
            <h2>🌍 Select Your Timezone</h2>
            <input id="tzSearch" type="text" placeholder="Search country or city..." oninput="filterTz(this.value)" autocomplete="off" />
            <div id="tzList"></div>
            <button id="tzCloseBtn" onclick="closeTz()">Done</button>
        </div>
    </div>

    <div id="currentTzLabel">Showing time in: <strong id="activeTzName">IST (UTC+5:30)</strong></div>
    <h1 style="font-size:24px;margin-bottom:25px;padding-left:5px;">Expoloom AI Insights</h1>

    <div style="display:flex;gap:15px;margin-bottom:15px;">
        <div class="card" style="flex:1;margin-bottom:0;cursor:default;">
            <h3>Gem Data</h3>
            <div class="count" style="font-size:28px;color:#2563eb;">${gemDataTotal}</div>
        </div>
        <div class="card" style="flex:1;margin-bottom:0;cursor:default;">
            <h3>G Data</h3>
            <div class="count" style="font-size:28px;color:#ef4444;">${gDataTotal}</div>
        </div>
    </div>

    <div style="display:flex;gap:15px;margin-bottom:15px;">
        <div class="card" style="flex:1;margin-bottom:0;cursor:default;">
            <h3>Img Data</h3>
            <div class="count" style="font-size:28px;color:#10b981;">${imgDataTotal}</div>
        </div>
        <div style="flex:1;"></div>
    </div>

    <div class="card" style="cursor:default;">
        <h3>Requests by User</h3>
        <div style="font-size:13px;margin-top:5px;margin-bottom:15px;color:#666;">Tap a row to see full details</div>
        <div id="emailList"></div>
    </div>

    <div class="card" onclick="toggle('todayGraph')">
        <h3>Today's Usage</h3>
        <div class="count" id="todayCount">0</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <div class="card" onclick="toggle('liveLogs')">
        <h3>Live Device Activity</h3>
        <div style="font-size:13px;margin-top:5px;color:#666;">Tap to see exact times & devices</div>
        <div id="liveLogs" class="logs-container" onclick="event.stopPropagation()">
            <div id="logsInner"></div>
        </div>
    </div>

    <div class="card" onclick="toggle('weeklyMenu')">
        <h3>Weekly Report</h3>
        <div style="font-size:13px;margin-top:5px;color:#666;">Tap for daily and hourly info</div>
        <div id="weeklyMenu" class="weekly-list" onclick="event.stopPropagation()">
            <div id="weeklyInner"></div>
        </div>
    </div>

    <div class="card" onclick="toggle('monthGraph')">
        <h3>Monthly Total</h3>
        <div class="count" id="monthCount">0</div>
        <div id="monthGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="monthChart"></canvas>
        </div>
    </div>

    <a href="/admin" style="display:block;text-align:center;margin-top:40px;color:#bbb;text-decoration:none;font-size:13px;font-weight:600;">LOGOUT</a>

    <script>
    // ── Raw log data from server ──────────────────────────────────────────────
    const RAW_LOGS = ${logsJson};

    // ── Timezone definitions ──────────────────────────────────────────────────
    const TIMEZONES = [
      { name: "IST — India", city: "Mumbai / New Delhi", offset: 5.5 },
      { name: "UTC — Universal Time", city: "Reykjavik / Accra", offset: 0 },
      { name: "GMT — UK", city: "London", offset: 0 },
      { name: "CET — Central Europe", city: "Paris / Berlin / Rome", offset: 1 },
      { name: "EET — Eastern Europe", city: "Cairo / Athens / Helsinki", offset: 2 },
      { name: "MSK — Moscow", city: "Moscow / Istanbul", offset: 3 },
      { name: "GST — Gulf", city: "Dubai / Abu Dhabi", offset: 4 },
      { name: "PKT — Pakistan", city: "Karachi / Islamabad", offset: 5 },
      { name: "BST — Bangladesh", city: "Dhaka", offset: 6 },
      { name: "ICT — Indochina", city: "Bangkok / Hanoi / Jakarta", offset: 7 },
      { name: "CST — China / Philippines", city: "Beijing / Manila / Singapore", offset: 8 },
      { name: "JST — Japan / Korea", city: "Tokyo / Seoul", offset: 9 },
      { name: "AEST — Australia East", city: "Sydney / Melbourne", offset: 10 },
      { name: "NZST — New Zealand", city: "Auckland / Wellington", offset: 12 },
      { name: "AZOT — Azores", city: "Ponta Delgada", offset: -1 },
      { name: "GST — South Georgia", city: "South Georgia Island", offset: -2 },
      { name: "BRT — Brazil", city: "São Paulo / Brasília", offset: -3 },
      { name: "AST — Atlantic", city: "Halifax / Puerto Rico", offset: -4 },
      { name: "EST — US Eastern", city: "New York / Miami / Toronto", offset: -5 },
      { name: "CST — US Central", city: "Chicago / Dallas / Mexico City", offset: -6 },
      { name: "MST — US Mountain", city: "Denver / Phoenix", offset: -7 },
      { name: "PST — US Pacific", city: "Los Angeles / Vancouver", offset: -8 },
      { name: "AKST — Alaska", city: "Anchorage", offset: -9 },
      { name: "HST — Hawaii", city: "Honolulu", offset: -10 },
      { name: "SST — Samoa", city: "Pago Pago", offset: -11 },
      { name: "LINT — Line Islands", city: "Kiribati", offset: 14 },
      { name: "NPT — Nepal", city: "Kathmandu", offset: 5.75 },
      { name: "MMT — Myanmar", city: "Yangon", offset: 6.5 },
      { name: "CCT — Cocos Islands", city: "Cocos Islands", offset: 6.5 },
      { name: "ACST — Australia Central", city: "Adelaide / Darwin", offset: 9.5 },
      { name: "NFT — Norfolk Island", city: "Norfolk Island", offset: 11 },
      { name: "FJT — Fiji", city: "Suva", offset: 12 },
      { name: "CHAST — Chatham Islands", city: "Chatham Islands", offset: 12.75 },
      { name: "TOT — Tonga", city: "Nuku'alofa", offset: 13 },
      { name: "IRDT — Iran", city: "Tehran", offset: 3.5 },
      { name: "AFT — Afghanistan", city: "Kabul", offset: 4.5 },
      { name: "MVT — Maldives", city: "Malé", offset: 5 },
      { name: "OMST — Omsk", city: "Omsk / Tashkent", offset: 6 },
      { name: "KRAT — Krasnoyarsk", city: "Krasnoyarsk", offset: 7 },
    ];

    // ── State ─────────────────────────────────────────────────────────────────
    let selectedOffset = 5.5; // default IST
    let selectedTzName = "IST — India";
    let todayChartInst = null;
    let monthChartInst = null;
    let weekChartInsts = {};
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

    // ── Chart helpers ─────────────────────────────────────────────────────────
    function makeLineGradient(canvas, h) {
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(0,0,0,0.18)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.04)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        return grad;
    }
    function makeBarGradient(canvas, h) {
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#111');
        grad.addColorStop(1, '#555');
        return grad;
    }
    function lineOpt(maxTicks) {
        return {
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111', titleColor: '#fff', bodyColor: '#ccc',
                    padding: 10, cornerRadius: 10, displayColors: false,
                    callbacks: { label: item => item.raw + ' requests' }
                }
            },
            scales: {
                y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#bbb', font: { size: 10 }, stepSize: 1, maxTicksLimit: 5 } },
                x: { border: { display: false }, grid: { display: false }, ticks: { color: '#bbb', font: { size: 10 }, maxRotation: 0, maxTicksLimit: maxTicks || 12 } }
            }
        };
    }
    function barOpt(maxTicks) {
        return {
            maintainAspectRatio: false,
            animation: { duration: 700, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111', titleColor: '#fff', bodyColor: '#ccc',
                    padding: 10, cornerRadius: 10, displayColors: false,
                    callbacks: { label: item => item.raw + ' requests' }
                }
            },
            scales: {
                y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#bbb', font: { size: 10 }, stepSize: 1, maxTicksLimit: 5 } },
                x: { border: { display: false }, grid: { display: false }, ticks: { color: '#bbb', font: { size: 10 }, maxRotation: 0, maxTicksLimit: maxTicks || 16 } }
            }
        };
    }
    const hours = ["12a","1","2","3","4","5","6","7","8","9","10","11","12p","1","2","3","4","5","6","7","8","9","10","11"];

    // ── Load saved timezone from localStorage ────────────────────────────────
    function loadSavedTz() {
        const saved = localStorage.getItem('adminTzOffset');
        const savedName = localStorage.getItem('adminTzName');
        if (saved !== null) {
            selectedOffset = parseFloat(saved);
            selectedTzName = savedName || selectedTzName;
        }
        updateTzLabel();
    }

    function saveTz(offset, name) {
        localStorage.setItem('adminTzOffset', offset);
        localStorage.setItem('adminTzName', name);
    }

    function updateTzLabel() {
        const sign = selectedOffset >= 0 ? '+' : '';
        const fmtOffset = Number.isInteger(selectedOffset) ? selectedOffset : selectedOffset;
        document.getElementById('activeTzName').textContent = selectedTzName + ' (UTC' + sign + fmtOffset + ')';
        document.getElementById('tzBtnLabel').textContent = selectedTzName.split('—')[0].trim();
    }

    // ── Data processing ───────────────────────────────────────────────────────
    function processLogs(offsetHours) {
        const offsetMs = offsetHours * 60 * 60 * 1000;
        const nowUtc = new Date();
        const nowLocal = new Date(nowUtc.getTime() + offsetMs);

        const currentYear = nowLocal.getUTCFullYear();
        const currentMonth = nowLocal.getUTCMonth();
        const currentDay = nowLocal.getUTCDate();

        let todayTotal = 0;
        let monthTotal = 0;
        let deviceLogs = [];
        let todayHourly = Array(24).fill(0);
        let monthlyDaily = Array(31).fill(0);
        let weekTotals = Array(7).fill(0);
        let weekHourly = Array(7).fill(0).map(() => Array(24).fill(0));
        let emailMap = {};

        RAW_LOGS.forEach(log => {
            if (!log.created_at) return;

            let cleanTimestamp = log.created_at.trim();
            if (cleanTimestamp.includes(' ')) cleanTimestamp = cleanTimestamp.replace(' ', 'T');
            if (!cleanTimestamp.includes('Z') && !cleanTimestamp.includes('+') && !cleanTimestamp.match(/-\\d{2}:\\d{2}$/)) cleanTimestamp += 'Z';

            let logUtcDate = new Date(cleanTimestamp);
            if (isNaN(logUtcDate.getTime())) {
                const parts = cleanTimestamp.split(/[-T:.]/);
                if (parts.length >= 5) {
                    logUtcDate = new Date(Date.UTC(
                        parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]),
                        parseInt(parts[3]), parseInt(parts[4]), parts[5] ? parseInt(parts[5]) : 0
                    ));
                }
            }

            if (!isNaN(logUtcDate.getTime())) {
                const pDate = new Date(logUtcDate.getTime() + offsetMs);
                const pYear = pDate.getUTCFullYear();
                const pMonth = pDate.getUTCMonth();
                const pDay = pDate.getUTCDate();
                const pHour = pDate.getUTCHours();
                let pDayOfWeek = pDate.getUTCDay() - 1;
                if (pDayOfWeek === -1) pDayOfWeek = 6;

                if (pDay >= 1 && pDay <= 31) monthlyDaily[pDay - 1]++;
                if (pDayOfWeek >= 0 && pDayOfWeek < 7) {
                    weekTotals[pDayOfWeek]++;
                    weekHourly[pDayOfWeek][pHour]++;
                }

                monthTotal++;
                todayTotal++;
                todayHourly[pHour]++;

                if (deviceLogs.length < 50) {
                    let hh = pHour % 12;
                    if (hh === 0) hh = 12;
                    const mm = String(pDate.getUTCMinutes()).padStart(2, '0');
                    const ss = String(pDate.getUTCSeconds()).padStart(2, '0');
                    const ampm = pHour >= 12 ? 'PM' : 'AM';
                    const timeFormatted = String(hh).padStart(2,'0') + ':' + mm + ':' + ss + ' ' + ampm;

                    let dLeft = "Unknown Device", dRight = "Data Type";
                    if (log.device_name && log.device_name.includes(" | ")) {
                        const parts2 = log.device_name.split(" | ");
                        dLeft = parts2[0].trim();
                        dRight = parts2[1].trim();
                    } else if (log.device_name) {
                        dLeft = log.device_name;
                    }
                    deviceLogs.push({ deviceLeft: dLeft, time: timeFormatted, deviceRight: dRight });

                    // Email grouping
                    const em = log.email || 'unknown';
                    if (!emailMap[em]) emailMap[em] = { total: 0, logs: [] };
                    emailMap[em].total++;
                    if (emailMap[em].logs.length < 100) emailMap[em].logs.push({ device: dLeft, type: dRight, time: timeFormatted });
                }
            } else {
                monthTotal++;
                todayTotal++;
                if (deviceLogs.length < 50) {
                    deviceLogs.push({ deviceLeft: log.device_name || "Unknown Device", time: "Recent Entry", deviceRight: "Data Sync" });
                }
                const em2 = log.email || 'unknown';
                if (!emailMap[em2]) emailMap[em2] = { total: 0, logs: [] };
                emailMap[em2].total++;
            }
        });

        return { todayTotal, monthTotal, deviceLogs, todayHourly, monthlyDaily, weekTotals, weekHourly, emailMap };
    }

    // ── Render dashboard ──────────────────────────────────────────────────────
    function renderDashboard(offset) {
        const d = processLogs(offset);

        document.getElementById('todayCount').textContent = d.todayTotal;
        document.getElementById('monthCount').textContent = d.monthTotal;

        // Email accordion
        const emailEntries = Object.entries(d.emailMap).sort((a, b) => b[1].total - a[1].total);
        document.getElementById('emailList').innerHTML = emailEntries.length === 0
            ? '<div class="no-logs">No user data yet</div>'
            : emailEntries.map(([email, info], idx) => {
                const initial = email === 'unknown' ? '?' : email[0].toUpperCase();
                const display = email === 'unknown' ? 'Anonymous / Legacy' : email;
                const short   = display.length > 30 ? display.substring(0, 28) + '…' : display;
                const lastTime = info.logs[0] ? info.logs[0].time : '—';
                const logsHtml = info.logs.map(l => \`
                    <div class="email-log-item">
                        <span class="email-log-device">\${l.device}</span>
                        <span class="email-log-type">\${l.type}</span>
                        <span class="email-log-time">\${l.time}</span>
                    </div>\`).join('');
                const moreNote = info.total > info.logs.length
                    ? \`<div style="text-align:center;padding:8px 0 10px;font-size:12px;color:#999;">Showing \${info.logs.length} of \${info.total}</div>\` : '';
                return \`<div class="email-row" id="erow-\${idx}">
                    <div class="email-header" onclick="toggleEmail(\${idx})">
                        <div class="email-avatar">\${initial}</div>
                        <div class="email-info">
                            <div class="email-addr" title="\${display}">\${short}</div>
                            <div class="email-meta">Last: \${lastTime}</div>
                        </div>
                        <div class="req-badge">\${info.total}</div>
                        <svg class="email-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                    <div class="email-detail" id="edetail-\${idx}">\${logsHtml}\${moreNote}</div>
                </div>\`;
            }).join('');

        // Logs
        const logsHtml = d.deviceLogs.length === 0
            ? '<div class="no-logs">No messages sent yet</div>'
            : d.deviceLogs.map(l => \`
                <div class="log-item">
                    <span class="log-col log-left">\${l.deviceLeft}</span>
                    <span class="log-col log-center">\${l.time}</span>
                    <span class="log-col log-right">\${l.deviceRight}</span>
                </div>\`).join('');
        document.getElementById('logsInner').innerHTML = logsHtml;

        // Weekly
        const weeklyHtml = days.map((day, idx) => \`
            <div class="day-row" onclick="toggleWeekDay('\${day}')">
                <div class="day-flex"><span>\${day}</span><span>\${d.weekTotals[idx]}</span></div>
                <div id="graph-\${day}" class="day-graph-box" onclick="event.stopPropagation()">
                    <canvas id="chart-\${day}"></canvas>
                </div>
            </div>\`).join('');
        document.getElementById('weeklyInner').innerHTML = weeklyHtml;
        window._weekHourly = d.weekHourly;

        // Today chart — smooth area line
        if (todayChartInst) todayChartInst.destroy();
        const todayCanvas = document.getElementById('todayChart');
        todayChartInst = new Chart(todayCanvas, {
            type: 'line',
            data: { labels: hours, datasets: [{ data: d.todayHourly, borderColor: '#000', borderWidth: 2.5, fill: true, backgroundColor: makeLineGradient(todayCanvas, 220), tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#000', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
            options: lineOpt(12)
        });

        // Month chart — gradient bars
        if (monthChartInst) monthChartInst.destroy();
        const monthCanvas = document.getElementById('monthChart');
        monthChartInst = new Chart(monthCanvas, {
            type: 'bar',
            data: { labels: Array.from({length: 31}, (_, i) => i + 1), datasets: [{ data: d.monthlyDaily, backgroundColor: makeBarGradient(monthCanvas, 220), borderRadius: 6, borderSkipped: false, barPercentage: 0.65, categoryPercentage: 0.8 }] },
            options: barOpt(16)
        });

        Object.values(weekChartInsts).forEach(c => c.destroy());
        weekChartInsts = {};
    }

    // ── Toggle helpers ────────────────────────────────────────────────────────
    function toggle(id) {
        const el = document.getElementById(id);
        el.style.display = (el.style.display === 'block') ? 'none' : 'block';
    }

    function toggleEmail(idx) {
        document.getElementById('erow-' + idx).classList.toggle('open');
    }

    function toggleWeekDay(day) {
        const box = document.getElementById('graph-' + day);
        const isOpen = box.style.display === 'block';
        box.style.display = isOpen ? 'none' : 'block';
        if (!isOpen && !weekChartInsts[day]) {
            const idx = days.indexOf(day);
            const wCanvas = document.getElementById('chart-' + day);
            weekChartInsts[day] = new Chart(wCanvas, {
                type: 'line',
                data: { labels: hours, datasets: [{ data: window._weekHourly[idx], borderColor: '#000', borderWidth: 2, fill: true, backgroundColor: makeLineGradient(wCanvas, 200), tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#000', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
                options: lineOpt(12)
            });
        }
    }

    // ── Timezone modal ────────────────────────────────────────────────────────
    let filteredTzList = [...TIMEZONES];

    function renderTzList(list) {
        const container = document.getElementById('tzList');
        container.innerHTML = list.map((tz, i) => {
            const sign = tz.offset >= 0 ? '+' : '';
            const isSelected = tz.offset === selectedOffset;
            return \`<div class="tz-item \${isSelected ? 'selected' : ''}" onclick="selectTz(\${tz.offset}, '\${tz.name.replace(/'/g,"\\\\'")}')">
                <div>
                    <div>\${tz.name}</div>
                    <div style="font-size:12px;color:\${isSelected?'#ccc':'#aaa'};font-weight:400;margin-top:2px;">\${tz.city}</div>
                </div>
                <span class="tz-offset">UTC\${sign}\${tz.offset}</span>
            </div>\`;
        }).join('');
    }

    function filterTz(query) {
        const q = query.toLowerCase();
        filteredTzList = TIMEZONES.filter(tz =>
            tz.name.toLowerCase().includes(q) || tz.city.toLowerCase().includes(q)
        );
        renderTzList(filteredTzList);
    }

    function selectTz(offset, name) {
        selectedOffset = offset;
        selectedTzName = name;
        saveTz(offset, name);
        updateTzLabel();
        renderTzList(filteredTzList);
        renderDashboard(offset);
    }

    function openTz() {
        document.getElementById('tzSearch').value = '';
        filteredTzList = [...TIMEZONES];
        renderTzList(filteredTzList);
        document.getElementById('tzOverlay').classList.add('open');
        setTimeout(() => document.getElementById('tzSearch').focus(), 300);
    }

    function closeTz() {
        document.getElementById('tzOverlay').classList.remove('open');
    }

    function handleOverlayClick(e) {
        if (e.target === document.getElementById('tzOverlay')) closeTz();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    loadSavedTz();
    renderDashboard(selectedOffset);
    </script>
</body>
</html>`;

  return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
