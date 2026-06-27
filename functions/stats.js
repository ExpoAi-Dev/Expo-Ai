export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== env.ADMIN_KEY) return new Response("Denied", { status: 403 });

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  let systemErrorMessage = "";
  let diagnosticMessage = "";
  let rawLogs = [];

  let gemDataTotal = 0;
  let gDataTotal   = 0;
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
    } else {
      throw new Error("Invalid data format received from database.");
    }

    rawLogs.forEach(log => {
      if (log.device_name) {
        if (log.device_name.includes('G Data'))   gDataTotal++;
        else if (log.device_name.includes('Gem Data')) gemDataTotal++;
        else if (log.device_name.includes('Img Data')) imgDataTotal++;
      }
    });

    if (rawLogs.length === 0) {
      diagnosticMessage = `Connected to Supabase table 'ai_usage_logs' successfully, but the table returned 0 records.`;
    }
  } catch (err) {
    systemErrorMessage = err.message;
  }

  let noticeHTML = '';
  if (systemErrorMessage) {
    noticeHTML = `<div style="background:#fef2f2;border-left:4px solid #ef4444;color:#991b1b;padding:15px;margin-bottom:20px;border-radius:8px;font-size:14px;word-wrap:break-word;">
                   <strong>⚠️ Critical System Error:</strong> ${systemErrorMessage}
                 </div>`;
  } else if (diagnosticMessage) {
    noticeHTML = `<div style="background:#fefcbf;border-left:4px solid #ecc94b;color:#744210;padding:15px;margin-bottom:20px;border-radius:8px;font-size:14px;">
                   <strong>ℹ️ Diagnostic:</strong> ${diagnosticMessage}
                 </div>`;
  }

  const logsJson = JSON.stringify(rawLogs);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expoloom AI – Admin</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f4f6f9; color: #111; min-height: 100vh; padding: 20px 16px 40px; }

        /* ── Top bar ── */
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .top-bar h1 { font-size: 20px; font-weight: 700; }

        /* ── Summary cards ── */
        .summary-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        .sum-card { background: #fff; border-radius: 14px; padding: 14px 12px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .sum-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: #888; font-weight: 700; margin-bottom: 4px; }
        .sum-card .value { font-size: 26px; font-weight: 800; }
        .sum-card .sub   { font-size: 11px; color: #aaa; margin-top: 2px; }

        /* ── Section heading ── */
        .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: .8px; color: #888; font-weight: 700; margin: 24px 0 10px; }

        /* ── Email accordion ── */
        .email-list { display: flex; flex-direction: column; gap: 8px; }

        .email-row { background: #fff; border-radius: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); overflow: hidden; }

        .email-header {
            display: flex;
            align-items: center;
            padding: 14px 16px;
            cursor: pointer;
            user-select: none;
            gap: 12px;
        }
        .email-header:active { background: #f9f9f9; }

        .email-avatar {
            width: 36px; height: 36px; border-radius: 50%;
            background: #000; color: #fff;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 700; flex-shrink: 0;
        }

        .email-info { flex: 1; min-width: 0; }
        .email-addr { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .email-meta { font-size: 12px; color: #888; margin-top: 2px; }

        .req-badge {
            background: #000; color: #fff;
            font-size: 13px; font-weight: 700;
            padding: 4px 10px; border-radius: 999px;
            flex-shrink: 0;
        }

        .chevron {
            width: 20px; height: 20px; flex-shrink: 0;
            stroke: #aaa; stroke-width: 2.5;
            fill: none; stroke-linecap: round; stroke-linejoin: round;
            transition: transform 0.25s ease;
        }
        .email-row.open .chevron { transform: rotate(180deg); }

        /* ── Detail panel ── */
        .email-detail {
            display: none;
            border-top: 1px solid #f0f0f0;
            padding: 0 16px;
        }
        .email-row.open .email-detail { display: block; }

        /* Stat chips inside detail */
        .detail-chips { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 0 10px; }
        .chip { font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; border: 1.5px solid #e5e7eb; color: #444; }
        .chip.groq  { border-color: #000; color: #000; }
        .chip.gemini{ border-color: #4285f4; color: #4285f4; }
        .chip.img   { border-color: #7c3aed; color: #7c3aed; }

        /* Log entries */
        .log-entry { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
        .log-entry:last-child { border-bottom: none; margin-bottom: 8px; }
        .log-device { font-weight: 600; color: #333; }
        .log-type   { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
        .log-type.groq   { background: #f0fdf4; color: #16a34a; }
        .log-type.gemini { background: #eff6ff; color: #2563eb; }
        .log-type.img    { background: #faf5ff; color: #7c3aed; }
        .log-time { font-size: 12px; color: #999; text-align: right; }

        .detail-more { text-align: center; padding: 8px 0 12px; font-size: 13px; color: #888; }

        /* ── Charts section ── */
        .chart-card { background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 10px; cursor: pointer; }
        .chart-card h3 { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
        .chart-card .count { font-size: 30px; font-weight: 800; margin: 4px 0 0; }
        .chart-box { display: none; margin-top: 14px; height: 180px; border-top: 1px solid #f0f0f0; padding-top: 12px; }

        /* ── Weekly ── */
        .week-card { background: #fff; border-radius: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); overflow: hidden; }
        .day-row { padding: 14px 16px; border-bottom: 1px solid #f5f5f5; cursor: pointer; }
        .day-row:last-child { border-bottom: none; }
        .day-flex { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 15px; }
        .day-graph-box { display: none; height: 160px; margin-top: 10px; padding-top: 10px; }

        /* ── TZ button ── */
        #tzBtn { position: fixed; top: 16px; right: 16px; background: #000; color: #fff; border: none; border-radius: 50px; padding: 9px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; z-index: 999; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
        #tzBtn svg { width: 14px; height: 14px; fill: #fff; }
        #tzOverlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; align-items: flex-end; justify-content: center; }
        #tzOverlay.open { display: flex; }
        #tzPanel { background: #fff; width: 100%; max-width: 480px; border-radius: 22px 22px 0 0; padding: 24px 20px 36px; max-height: 80vh; display: flex; flex-direction: column; animation: slideUp 0.25s ease; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        #tzPanel h2 { font-size: 17px; font-weight: 700; margin: 0 0 14px; }
        #tzSearch { width: 100%; padding: 12px 14px; border: 1.5px solid #000; border-radius: 12px; font-size: 15px; outline: none; margin-bottom: 12px; }
        #tzList { overflow-y: auto; flex: 1; }
        .tz-item { padding: 12px 10px; border-bottom: 1px solid #f0f0f0; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 500; border-radius: 8px; transition: background 0.1s; }
        .tz-item:hover { background: #f5f5f5; }
        .tz-item.selected { background: #000; color: #fff; border-radius: 10px; }
        .tz-item.selected .tz-offset { color: #ccc; }
        .tz-offset { font-size: 12px; color: #888; font-weight: 600; }
        #tzCloseBtn { background: none; border: 1.5px solid #000; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 14px; width: 100%; }
        #currentTzLabel { font-size: 11px; color: #888; margin-bottom: 2px; }
    </style>
</head>
<body>
    ${noticeHTML}

    <div class="top-bar">
        <h1>📊 Admin Panel</h1>
    </div>

    <!-- TZ button -->
    <button id="tzBtn" onclick="openTz()">
        <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
        TZ
    </button>

    <!-- Summary cards -->
    <div class="summary-row">
        <div class="sum-card">
            <div class="label">Today</div>
            <div class="value" id="todayCount">–</div>
            <div class="sub">requests</div>
        </div>
        <div class="sum-card">
            <div class="label">This Month</div>
            <div class="value" id="monthCount">–</div>
            <div class="sub">requests</div>
        </div>
        <div class="sum-card">
            <div class="label">Users</div>
            <div class="value" id="userCount">–</div>
            <div class="sub">unique emails</div>
        </div>
    </div>

    <!-- Email accordion -->
    <div class="section-title">Requests by User</div>
    <div class="email-list" id="emailList"></div>

    <!-- Charts -->
    <div class="section-title">Today's Activity</div>
    <div class="chart-card" onclick="toggle('todayBox')">
        <h3>Hourly Breakdown</h3>
        <div class="count" id="todayCount2">–</div>
        <div class="chart-box" id="todayBox"><canvas id="todayChart"></canvas></div>
    </div>

    <div class="section-title">This Month</div>
    <div class="chart-card" onclick="toggle('monthBox')">
        <h3>Daily Breakdown</h3>
        <div class="count" id="monthCount2">–</div>
        <div class="chart-box" id="monthBox"><canvas id="monthChart"></canvas></div>
    </div>

    <div class="section-title">By Day of Week</div>
    <div class="week-card">
        <div id="weeklyInner"></div>
    </div>

    <!-- TZ Overlay -->
    <div id="tzOverlay" onclick="handleOverlayClick(event)">
        <div id="tzPanel">
            <h2>Select Timezone</h2>
            <div id="currentTzLabel"></div>
            <input id="tzSearch" placeholder="Search timezone or city…" oninput="filterTz(this.value)">
            <div id="tzList"></div>
            <button id="tzCloseBtn" onclick="closeTz()">Done</button>
        </div>
    </div>

    <script>
    const ALL_LOGS = ${logsJson};
    const DAYS = ${JSON.stringify(days)};
    const HOURS = Array.from({length:24},(_,i)=>{ const h=i%12||12; return (h<10?'0':'')+h+(i<12?'a':'p'); });

    // ── Timezone helpers ──────────────────────────────────────────────────────
    const TIMEZONES = [
        {name:"UTC",city:"Universal",offset:0},{name:"Asia/Kolkata",city:"Mumbai / Delhi",offset:5.5},
        {name:"America/New_York",city:"New York",offset:-5},{name:"America/Chicago",city:"Chicago",offset:-6},
        {name:"America/Denver",city:"Denver",offset:-7},{name:"America/Los_Angeles",city:"Los Angeles",offset:-8},
        {name:"Europe/London",city:"London",offset:0},{name:"Europe/Paris",city:"Paris / Berlin",offset:1},
        {name:"Europe/Istanbul",city:"Istanbul",offset:3},{name:"Asia/Dubai",city:"Dubai",offset:4},
        {name:"Asia/Karachi",city:"Karachi",offset:5},{name:"Asia/Dhaka",city:"Dhaka",offset:6},
        {name:"Asia/Bangkok",city:"Bangkok",offset:7},{name:"Asia/Singapore",city:"Singapore",offset:8},
        {name:"Asia/Tokyo",city:"Tokyo",offset:9},{name:"Australia/Sydney",city:"Sydney",offset:10},
        {name:"Pacific/Auckland",city:"Auckland",offset:12},{name:"America/Sao_Paulo",city:"São Paulo",offset:-3},
        {name:"America/Argentina/Buenos_Aires",city:"Buenos Aires",offset:-3},{name:"Africa/Cairo",city:"Cairo",offset:2},
        {name:"Africa/Lagos",city:"Lagos",offset:1},{name:"Asia/Seoul",city:"Seoul",offset:9},
        {name:"Asia/Shanghai",city:"Shanghai",offset:8},{name:"Asia/Riyadh",city:"Riyadh",offset:3},
        {name:"Asia/Tehran",city:"Tehran",offset:3.5},{name:"Asia/Kabul",city:"Kabul",offset:4.5},
        {name:"Asia/Colombo",city:"Colombo",offset:5.5},{name:"Asia/Kathmandu",city:"Kathmandu",offset:5.75}
    ];
    let selectedOffset = 0, selectedTzName = "UTC";
    let filteredTzList = [...TIMEZONES];

    function saveTz(o,n){ try{localStorage.setItem('adminTzOffset',o);localStorage.setItem('adminTzName',n);}catch(e){} }
    function loadSavedTz(){ try{ const o=localStorage.getItem('adminTzOffset'),n=localStorage.getItem('adminTzName'); if(o!==null){selectedOffset=parseFloat(o);selectedTzName=n||"UTC";} }catch(e){} }
    function updateTzLabel(){ const el=document.getElementById('currentTzLabel'); if(el) el.textContent='Current: '+selectedTzName; }

    // ── Date parsing ──────────────────────────────────────────────────────────
    function parseLog(log, offsetMs) {
        let ts = (log.created_at||'').trim();
        if (ts.includes(' ')) ts = ts.replace(' ','T');
        if (!ts.includes('Z') && !ts.includes('+') && !ts.match(/-\\d{2}:\\d{2}$/)) ts += 'Z';
        let utc = new Date(ts);
        if (isNaN(utc.getTime())) return null;
        const local = new Date(utc.getTime() + offsetMs);
        return {
            year: local.getUTCFullYear(),
            month: local.getUTCMonth(),
            day: local.getUTCDate(),
            hour: local.getUTCHours(),
            dow: ((local.getUTCDay()-1+7)%7),
            min: local.getUTCMinutes(),
            sec: local.getUTCSeconds(),
            ampm: local.getUTCHours() >= 12 ? 'PM' : 'AM'
        };
    }

    function fmtTime(p) {
        const h = p.hour % 12 || 12;
        return String(h).padStart(2,'0')+':'+String(p.min).padStart(2,'0')+':'+String(p.sec).padStart(2,'0')+' '+p.ampm;
    }

    // ── Main processing ───────────────────────────────────────────────────────
    let todayChartInst=null, monthChartInst=null, weekChartInsts={};
    const chartOpt = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},ticks:{font:{size:9},maxRotation:0}},y:{grid:{color:'#f0f0f0'},ticks:{font:{size:9}},beginAtZero:true}} };

    function processLogs(offsetHrs) {
        const offsetMs = offsetHrs * 3600000;
        const now = new Date(Date.now() + offsetMs);
        const todayY = now.getUTCFullYear(), todayM = now.getUTCMonth(), todayD = now.getUTCDate();

        let todayTotal=0, monthTotal=0;
        const todayHourly = new Array(24).fill(0);
        const monthlyDaily = new Array(31).fill(0);
        const weekTotals   = new Array(7).fill(0);
        const weekHourly   = Array.from({length:7},()=>new Array(24).fill(0));

        // Email grouping
        const emailMap = {}; // email -> { total, logs: [{device,type,time}] }

        ALL_LOGS.forEach(log => {
            const p = parseLog(log, offsetMs);

            // Device / type parsing
            let device = 'Unknown', typeTag = 'Gem Data';
            if (log.device_name && log.device_name.includes(' | ')) {
                const parts = log.device_name.split(' | ');
                device  = parts[0].trim();
                typeTag = parts[1].trim();
            } else if (log.device_name) {
                device = log.device_name;
            }

            const email = log.email || 'unknown@—';

            if (!emailMap[email]) emailMap[email] = { total:0, groq:0, gemini:0, img:0, logs:[] };
            emailMap[email].total++;
            if (typeTag === 'G Data')    emailMap[email].groq++;
            else if (typeTag === 'Gem Data') emailMap[email].gemini++;
            else if (typeTag === 'Img Data') emailMap[email].img++;
            if (emailMap[email].logs.length < 100) {
                emailMap[email].logs.push({ device, typeTag, time: p ? fmtTime(p) : 'Recent' });
            }

            if (!p) { monthTotal++; todayTotal++; return; }

            monthTotal++;
            if (p.month === todayM && p.year === todayY) {
                if (p.day === todayD) { todayTotal++; todayHourly[p.hour]++; }
                monthlyDaily[p.day-1]++;
            }
            weekTotals[p.dow]++;
            weekHourly[p.dow][p.hour]++;
        });

        return { todayTotal, monthTotal, todayHourly, monthlyDaily, weekTotals, weekHourly, emailMap };
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderDashboard(offsetHrs) {
        const d = processLogs(offsetHrs);

        document.getElementById('todayCount').textContent  = d.todayTotal;
        document.getElementById('monthCount').textContent  = d.monthTotal;
        document.getElementById('todayCount2').textContent = d.todayTotal;
        document.getElementById('monthCount2').textContent = d.monthTotal;

        // Email accordion list
        const emailEntries = Object.entries(d.emailMap).sort((a,b)=>b[1].total-a[1].total);
        document.getElementById('userCount').textContent = emailEntries.length;

        const emailListEl = document.getElementById('emailList');
        emailListEl.innerHTML = emailEntries.map(([email, info], idx) => {
            const initial = email === 'unknown@—' ? '?' : email[0].toUpperCase();
            const displayEmail = email === 'unknown@—' ? 'Anonymous / Legacy' : email;
            const shortEmail = displayEmail.length > 28 ? displayEmail.substring(0,26)+'…' : displayEmail;
            const lastReq = info.logs[0] ? info.logs[0].time : '—';

            const logsHTML = info.logs.map(l => {
                let tClass = 'gemini', tLabel = 'Gemini';
                if      (l.typeTag === 'G Data')   { tClass='groq';   tLabel='Groq'; }
                else if (l.typeTag === 'Img Data')  { tClass='img';    tLabel='Image'; }
                return \`<div class="log-entry">
                    <span class="log-device">\${l.device}</span>
                    <span class="log-type \${tClass}">\${tLabel}</span>
                    <span class="log-time">\${l.time}</span>
                </div>\`;
            }).join('');

            const moreNote = info.total > info.logs.length
                ? \`<div class="detail-more">Showing \${info.logs.length} of \${info.total} total requests</div>\`
                : '';

            return \`<div class="email-row" id="erow-\${idx}">
                <div class="email-header" onclick="toggleEmail(\${idx})">
                    <div class="email-avatar">\${initial}</div>
                    <div class="email-info">
                        <div class="email-addr" title="\${displayEmail}">\${shortEmail}</div>
                        <div class="email-meta">Last request: \${lastReq}</div>
                    </div>
                    <div class="req-badge">\${info.total}</div>
                    <svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div class="email-detail" id="edetail-\${idx}">
                    <div class="detail-chips">
                        \${info.groq   > 0 ? \`<span class="chip groq">⚡ Groq: \${info.groq}</span>\`    : ''}
                        \${info.gemini > 0 ? \`<span class="chip gemini">🔷 Gemini: \${info.gemini}</span>\` : ''}
                        \${info.img    > 0 ? \`<span class="chip img">🖼️ Image: \${info.img}</span>\`  : ''}
                    </div>
                    \${logsHTML}
                    \${moreNote}
                </div>
            </div>\`;
        }).join('');

        // Weekly
        document.getElementById('weeklyInner').innerHTML = DAYS.map((day,idx) => \`
            <div class="day-row" onclick="toggleWeekDay('\${day}')">
                <div class="day-flex"><span>\${day}</span><span>\${d.weekTotals[idx]}</span></div>
                <div id="graph-\${day}" class="day-graph-box" onclick="event.stopPropagation()">
                    <canvas id="chart-\${day}"></canvas>
                </div>
            </div>\`).join('');
        window._weekHourly = d.weekHourly;

        // Today chart
        if (todayChartInst) todayChartInst.destroy();
        todayChartInst = new Chart(document.getElementById('todayChart'), {
            type:'bar',
            data:{ labels:HOURS, datasets:[{data:d.todayHourly, backgroundColor:'#000', barThickness:6, borderRadius:3}] },
            options:chartOpt
        });

        // Month chart
        if (monthChartInst) monthChartInst.destroy();
        monthChartInst = new Chart(document.getElementById('monthChart'), {
            type:'bar',
            data:{ labels:Array.from({length:31},(_,i)=>i+1), datasets:[{data:d.monthlyDaily, backgroundColor:'#000', borderRadius:2}] },
            options:chartOpt
        });

        Object.values(weekChartInsts).forEach(c=>c.destroy());
        weekChartInsts = {};
    }

    // ── Toggle helpers ────────────────────────────────────────────────────────
    function toggle(id) {
        const el = document.getElementById(id);
        el.style.display = (el.style.display === 'block') ? 'none' : 'block';
    }

    function toggleEmail(idx) {
        const row = document.getElementById('erow-'+idx);
        row.classList.toggle('open');
    }

    function toggleWeekDay(day) {
        const box = document.getElementById('graph-'+day);
        const isOpen = box.style.display === 'block';
        box.style.display = isOpen ? 'none' : 'block';
        if (!isOpen && !weekChartInsts[day]) {
            const i = DAYS.indexOf(day);
            weekChartInsts[day] = new Chart(document.getElementById('chart-'+day), {
                type:'bar',
                data:{ labels:HOURS, datasets:[{data:window._weekHourly[i], backgroundColor:'#000', barThickness:6, borderRadius:3}] },
                options:chartOpt
            });
        }
    }

    // ── Timezone modal ────────────────────────────────────────────────────────
    function renderTzList(list) {
        document.getElementById('tzList').innerHTML = list.map(tz => {
            const sign = tz.offset >= 0 ? '+' : '';
            const sel  = tz.offset === selectedOffset;
            return \`<div class="tz-item \${sel?'selected':''}" onclick="selectTz(\${tz.offset},'\${tz.name.replace(/'/g,"\\\\'")}')">
                <div>
                    <div>\${tz.name}</div>
                    <div style="font-size:12px;color:\${sel?'#ccc':'#aaa'};margin-top:2px;">\${tz.city}</div>
                </div>
                <span class="tz-offset">UTC\${sign}\${tz.offset}</span>
            </div>\`;
        }).join('');
    }
    function filterTz(q) {
        filteredTzList = TIMEZONES.filter(tz=>tz.name.toLowerCase().includes(q.toLowerCase())||tz.city.toLowerCase().includes(q.toLowerCase()));
        renderTzList(filteredTzList);
    }
    function selectTz(offset,name) {
        selectedOffset=offset; selectedTzName=name;
        saveTz(offset,name); updateTzLabel();
        renderTzList(filteredTzList); renderDashboard(offset);
    }
    function openTz() {
        document.getElementById('tzSearch').value='';
        filteredTzList=[...TIMEZONES]; renderTzList(filteredTzList);
        document.getElementById('tzOverlay').classList.add('open');
        setTimeout(()=>document.getElementById('tzSearch').focus(),300);
    }
    function closeTz()    { document.getElementById('tzOverlay').classList.remove('open'); }
    function handleOverlayClick(e) { if(e.target===document.getElementById('tzOverlay')) closeTz(); }

    // ── Init ──────────────────────────────────────────────────────────────────
    loadSavedTz(); updateTzLabel(); renderDashboard(selectedOffset);
    <\/script>
</body>
</html>`;

  return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
