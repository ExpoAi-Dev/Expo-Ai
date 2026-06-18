export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== env.ADMIN_KEY) return new Response("Denied", { status: 403 });

  const adminKey = searchParams.get('key');
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  let todayTotal = 0;
  let monthTotal = 0;
  let deviceLogs = [];
  
  let gemDataTotal = 0;
  let gDataTotal = 0;
  let imgDataTotal = 0; 
  
  let todayHourly = Array(24).fill(0);
  let monthlyDaily = Array(31).fill(0);
  let weekTotals = Array(7).fill(0);
  let weekHourly = Array(7).fill(0).map(() => Array(24).fill(0));

  let systemErrorMessage = "";
  let diagnosticMessage = "";
  let rawLogsCount = 0;

  // Store raw logs for client-side timezone re-processing
  let rawLogs = [];

  try {
    const supabaseResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ai_usage_logs?select=created_at,device_name&order=id.desc&limit=5000`, 
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

    let logs = [];
    const rawData = await supabaseResponse.json();
    if (Array.isArray(rawData)) {
        logs = rawData;
        rawLogsCount = logs.length;
        rawLogs = logs; // save for client
    } else {
        throw new Error("Invalid data format received from database (Expected an array).");
    }

    // Default: IST offset (used server-side for initial render)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowUtc = new Date();
    const nowPatna = new Date(nowUtc.getTime() + istOffset);
    
    const currentYear = nowPatna.getUTCFullYear();
    const currentMonth = nowPatna.getUTCMonth(); 
    const currentDay = nowPatna.getUTCDate();

    logs.forEach(log => {
      if (log.device_name) {
          if (log.device_name.includes('G Data')) {
              gDataTotal++;
          } else if (log.device_name.includes('Gem Data')) {
              gemDataTotal++;
          } else if (log.device_name.includes('Img Data')) {
              imgDataTotal++;
          }
      }

      if (!log.created_at) return;

      let cleanTimestamp = log.created_at.trim();
      if (cleanTimestamp.includes(' ')) {
        cleanTimestamp = cleanTimestamp.replace(' ', 'T');
      }
      if (!cleanTimestamp.includes('Z') && !cleanTimestamp.includes('+') && !cleanTimestamp.includes('-')) {
        cleanTimestamp += 'Z';
      }

      let logUtcDate = new Date(cleanTimestamp);
      
      if (isNaN(logUtcDate.getTime())) {
         const parts = cleanTimestamp.split(/[-T:.]/);
         if (parts.length >= 5) {
            logUtcDate = new Date(Date.UTC(
              parseInt(parts[0]), 
              parseInt(parts[1]) - 1, 
              parseInt(parts[2]), 
              parseInt(parts[3]), 
              parseInt(parts[4]), 
              parts[5] ? parseInt(parts[5]) : 0
            ));
         }
      }

      if (!isNaN(logUtcDate.getTime())) {
         const pDate = new Date(logUtcDate.getTime() + istOffset);
         const pHour = pDate.getUTCHours();
         const pDay = pDate.getUTCDate();

         let pDayOfWeek = pDate.getUTCDay() - 1; 
         if (pDayOfWeek === -1) pDayOfWeek = 6; 

         if (pDay >= 1 && pDay <= 31) {
           monthlyDaily[pDay - 1]++;
         }
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
           const timeFormatted = `${String(hh).padStart(2, '0')}:${mm}:${ss} ${ampm}`;

           let dLeft = "Unknown Device";
           let dRight = "Data Type";

           if (log.device_name && log.device_name.includes(" | ")) {
               const stringParts = log.device_name.split(" | ");
               dLeft = stringParts[0].trim();
               dRight = stringParts[1].trim();
           } else if (log.device_name) {
               dLeft = log.device_name;
           }

           deviceLogs.push({
             deviceLeft: dLeft,
             time: timeFormatted,
             deviceRight: dRight
           });
         }
      } else {
         monthTotal++;
         todayTotal++;
         if (deviceLogs.length < 50) {
            deviceLogs.push({
              deviceLeft: log.device_name || "Unknown Device",
              time: "Recent Entry",
              deviceRight: "Data Sync"
            });
         }
      }
    });

    if (rawLogsCount === 0) {
      diagnosticMessage = `Connected to Supabase table 'ai_usage_logs' successfully, but the table returned 0 records.`;
    }

  } catch (err) {
    systemErrorMessage = err.message;
  }

  const renderedLogs = deviceLogs.length === 0 
    ? `<div class="no-logs">No messages sent yet today</div>` 
    : deviceLogs.map(log => `
        <div class="log-item">
            <span class="log-col log-left">${log.deviceLeft}</span>
            <span class="log-col log-center">${log.time}</span>
            <span class="log-col log-right">${log.deviceRight}</span>
        </div>
      `).join('');

  const renderedWeekly = days.map((day, idx) => `
    <div class="day-row" onclick="toggle('graph-${day}')">
        <div class="day-flex"><span>${day}</span><span>${weekTotals[idx]}</span></div>
        <div id="graph-${day}" class="day-graph-box" onclick="event.stopPropagation()">
            <canvas id="chart-${day}"></canvas>
        </div>
    </div>
  `).join('');

  const renderedChartsJS = days.map((day, idx) => `
    new Chart(document.getElementById('chart-${day}'), {
        type: 'bar',
        data: { 
            labels: hours, 
            datasets: [{ 
                data: [${weekHourly[idx].join(',')}], 
                backgroundColor: '#000', 
                barThickness: 8, 
                borderRadius: 4 
            }] 
        },
        options: opt
    });
  `).join('\n');

  let noticeHTML = '';
  if (systemErrorMessage) {
    noticeHTML = `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 15px; margin-bottom: 20px; border-radius: 4px; font-size: 14px; word-wrap: break-word;">
                   <strong>⚠️ Critical System Error:</strong> ${systemErrorMessage}
                 </div>`;
  } else if (diagnosticMessage) {
    noticeHTML = `<div style="background-color: #fefcbf; border-left: 4px solid #ecc94b; color: #744210; padding: 15px; margin-bottom: 20px; border-radius: 4px; font-size: 14px; line-height: 1.5;">
                   <strong>ℹ️ Diagnostic Report:</strong> ${diagnosticMessage}
                 </div>`;
  }

  // Embed raw logs as JSON for client-side timezone switching
  const rawLogsJSON = JSON.stringify(rawLogs.map(l => ({ created_at: l.created_at, device_name: l.device_name })));

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
        .graph-container { display: none; margin-top: 15px; height: 200px; border-top: 1px solid #eee; padding-top: 15px; }
        .weekly-list { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; }
        .day-row { padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
        .day-flex { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 16px; }
        .day-graph-box { display: none; height: 180px; margin-top: 10px; padding-top: 10px; }
        .logs-container { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; max-height: 250px; overflow-y: auto; }
        .log-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 5px; border-bottom: 1px solid #f5f5f5; font-size: 13px; font-weight: 600; }
        .log-col { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .log-left { text-align: left; color: #555; }
        .log-center { text-align: center; color: #000; font-weight: 700; }
        .log-right { text-align: right; color: #2563eb; font-weight: 700; }
        .no-logs { text-align: center; color: #999; padding: 20px 0; font-size: 14px; }

        /* ── Timezone Selector ── */
        .tz-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .tz-btn {
            display: flex; align-items: center; gap: 6px;
            background: #000; color: #fff;
            border: none; border-radius: 10px;
            padding: 10px 16px; font-size: 14px; font-weight: 600;
            cursor: pointer; white-space: nowrap;
        }
        .tz-btn svg { flex-shrink: 0; }
        .tz-active-label {
            font-size: 13px; color: #555; font-weight: 500;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Modal overlay */
        .tz-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.45); z-index: 999;
            justify-content: center; align-items: flex-end;
        }
        .tz-overlay.open { display: flex; }
        .tz-modal {
            background: #fff; width: 100%; max-width: 480px;
            border-radius: 20px 20px 0 0; padding: 20px 20px 34px;
            max-height: 80vh; display: flex; flex-direction: column;
            animation: slideUp 0.22s ease;
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .tz-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .tz-modal-title { font-size: 17px; font-weight: 700; }
        .tz-close { background: #f0f0f0; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .tz-search {
            width: 100%; padding: 12px 14px; border: 1.5px solid #000;
            border-radius: 10px; font-size: 15px; outline: none; margin-bottom: 12px;
        }
        .tz-list { overflow-y: auto; flex: 1; }
        .tz-item {
            padding: 13px 10px; border-bottom: 1px solid #f0f0f0;
            cursor: pointer; display: flex; justify-content: space-between;
            align-items: center; font-size: 14px; border-radius: 8px;
        }
        .tz-item:hover { background: #f7f7f7; }
        .tz-item.selected { background: #000; color: #fff; border-radius: 8px; }
        .tz-item .tz-name { font-weight: 600; }
        .tz-item .tz-offset { font-size: 12px; color: #888; }
        .tz-item.selected .tz-offset { color: #ccc; }
        .tz-reprocess-note { font-size: 12px; color: #888; text-align: center; margin-top: 10px; }
    </style>
</head>
<body>
    ${noticeHTML}

    <h1 style="font-size: 24px; margin-bottom: 16px; padding-left: 5px;">Expoloom AI Insights</h1>

    <!-- Timezone Selector Bar -->
    <div class="tz-bar">
        <button class="tz-btn" onclick="openTzModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Time Zone
        </button>
        <span class="tz-active-label" id="tzActiveLabel">🇮🇳 India (IST) — UTC+5:30</span>
    </div>

    <!-- Timezone Modal -->
    <div class="tz-overlay" id="tzOverlay" onclick="closeTzModal(event)">
        <div class="tz-modal">
            <div class="tz-modal-header">
                <span class="tz-modal-title">Select Time Zone</span>
                <button class="tz-close" onclick="closeTzModalDirect()">✕</button>
            </div>
            <input class="tz-search" id="tzSearch" type="text" placeholder="Search country or city…" oninput="filterTz(this.value)" />
            <div class="tz-list" id="tzList"></div>
            <div class="tz-reprocess-note">Dashboard will update instantly on selection</div>
        </div>
    </div>

    <div style="display: flex; gap: 15px; margin-bottom: 15px;">
        <div class="card" style="flex: 1; margin-bottom: 0; cursor: default;">
            <h3>Gem Data</h3>
            <div class="count" style="font-size: 28px; color: #2563eb;">${gemDataTotal}</div>
        </div>
        <div class="card" style="flex: 1; margin-bottom: 0; cursor: default;">
            <h3>G Data</h3>
            <div class="count" style="font-size: 28px; color: #ef4444;">${gDataTotal}</div>
        </div>
    </div>

    <div style="display: flex; gap: 15px; margin-bottom: 15px;">
        <div class="card" style="flex: 1; margin-bottom: 0; cursor: default;">
            <h3>Img Data</h3>
            <div class="count" style="font-size: 28px; color: #10b981;">${imgDataTotal}</div>
        </div>
        <div style="flex: 1;"></div>
    </div>

    <div class="card" onclick="toggle('todayGraph')">
        <h3>Today's Usage</h3>
        <div class="count" id="todayCount">${todayTotal}</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <div class="card" onclick="toggle('liveLogs')">
        <h3>Live Device Activity <span id="tzLiveLabel" style="text-transform:none; font-weight:400; color:#aaa;">(IST)</span></h3>
        <div style="font-size: 13px; margin-top: 5px; color: #666;">Tap to see exact times &amp; devices</div>
        <div id="liveLogs" class="logs-container" onclick="event.stopPropagation()">
            <div id="liveLogsInner">${renderedLogs}</div>
        </div>
    </div>

    <div class="card" onclick="toggle('weeklyMenu')">
        <h3>Weekly Report</h3>
        <div style="font-size: 13px; margin-top: 5px; color: #666;">Tap for daily and hourly info</div>
        <div id="weeklyMenu" class="weekly-list" onclick="event.stopPropagation()">
            ${renderedWeekly}
        </div>
    </div>

    <div class="card" onclick="toggle('monthGraph')">
        <h3>Monthly Total</h3>
        <div class="count" id="monthCount">${monthTotal}</div>
        <div id="monthGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="monthChart"></canvas>
        </div>
    </div>

    <a href="/admin" style="display:block; text-align:center; margin-top:40px; color:#bbb; text-decoration:none; font-size:13px; font-weight:600;">LOGOUT</a>

    <script>
        // ── Raw logs embedded from server ──
        const RAW_LOGS = ${rawLogsJSON};

        // ── Time Zone Database (38 zones) ──
        const TZ_LIST = [
          { label: "🇮🇳 India (IST)", name: "Asia/Kolkata", offset: 5.5, display: "UTC+5:30" },
          { label: "🇺🇸 New York (EST/EDT)", name: "America/New_York", offset: -5, display: "UTC-5:00" },
          { label: "🇺🇸 Los Angeles (PST/PDT)", name: "America/Los_Angeles", offset: -8, display: "UTC-8:00" },
          { label: "🇺🇸 Chicago (CST/CDT)", name: "America/Chicago", offset: -6, display: "UTC-6:00" },
          { label: "🇬🇧 London (GMT/BST)", name: "Europe/London", offset: 0, display: "UTC+0:00" },
          { label: "🇫🇷 Paris (CET/CEST)", name: "Europe/Paris", offset: 1, display: "UTC+1:00" },
          { label: "🇩🇪 Berlin (CET/CEST)", name: "Europe/Berlin", offset: 1, display: "UTC+1:00" },
          { label: "🇷🇺 Moscow (MSK)", name: "Europe/Moscow", offset: 3, display: "UTC+3:00" },
          { label: "🇦🇪 Dubai (GST)", name: "Asia/Dubai", offset: 4, display: "UTC+4:00" },
          { label: "🇵🇰 Karachi (PKT)", name: "Asia/Karachi", offset: 5, display: "UTC+5:00" },
          { label: "🇧🇩 Dhaka (BST)", name: "Asia/Dhaka", offset: 6, display: "UTC+6:00" },
          { label: "🇲🇲 Yangon (MMT)", name: "Asia/Rangoon", offset: 6.5, display: "UTC+6:30" },
          { label: "🇹🇭 Bangkok (ICT)", name: "Asia/Bangkok", offset: 7, display: "UTC+7:00" },
          { label: "🇨🇳 Beijing (CST)", name: "Asia/Shanghai", offset: 8, display: "UTC+8:00" },
          { label: "🇸🇬 Singapore (SGT)", name: "Asia/Singapore", offset: 8, display: "UTC+8:00" },
          { label: "🇭🇰 Hong Kong (HKT)", name: "Asia/Hong_Kong", offset: 8, display: "UTC+8:00" },
          { label: "🇯🇵 Tokyo (JST)", name: "Asia/Tokyo", offset: 9, display: "UTC+9:00" },
          { label: "🇰🇷 Seoul (KST)", name: "Asia/Seoul", offset: 9, display: "UTC+9:00" },
          { label: "🇦🇺 Adelaide (ACST)", name: "Australia/Adelaide", offset: 9.5, display: "UTC+9:30" },
          { label: "🇦🇺 Sydney (AEST)", name: "Australia/Sydney", offset: 10, display: "UTC+10:00" },
          { label: "🇳🇿 Auckland (NZST)", name: "Pacific/Auckland", offset: 12, display: "UTC+12:00" },
          { label: "🌍 UTC (Universal)", name: "UTC", offset: 0, display: "UTC+0:00" },
          { label: "🇧🇷 São Paulo (BRT)", name: "America/Sao_Paulo", offset: -3, display: "UTC-3:00" },
          { label: "🇦🇷 Buenos Aires (ART)", name: "America/Argentina/Buenos_Aires", offset: -3, display: "UTC-3:00" },
          { label: "🇨🇦 Toronto (EST/EDT)", name: "America/Toronto", offset: -5, display: "UTC-5:00" },
          { label: "🇲🇽 Mexico City (CST)", name: "America/Mexico_City", offset: -6, display: "UTC-6:00" },
          { label: "🇿🇦 Johannesburg (SAST)", name: "Africa/Johannesburg", offset: 2, display: "UTC+2:00" },
          { label: "🇳🇬 Lagos (WAT)", name: "Africa/Lagos", offset: 1, display: "UTC+1:00" },
          { label: "🇰🇪 Nairobi (EAT)", name: "Africa/Nairobi", offset: 3, display: "UTC+3:00" },
          { label: "🇪🇬 Cairo (EET)", name: "Africa/Cairo", offset: 2, display: "UTC+2:00" },
          { label: "🇸🇦 Riyadh (AST)", name: "Asia/Riyadh", offset: 3, display: "UTC+3:00" },
          { label: "🇹🇷 Istanbul (TRT)", name: "Europe/Istanbul", offset: 3, display: "UTC+3:00" },
          { label: "🇮🇩 Jakarta (WIB)", name: "Asia/Jakarta", offset: 7, display: "UTC+7:00" },
          { label: "🇵🇭 Manila (PHT)", name: "Asia/Manila", offset: 8, display: "UTC+8:00" },
          { label: "🇳🇵 Kathmandu (NPT)", name: "Asia/Kathmandu", offset: 5.75, display: "UTC+5:45" },
          { label: "🇱🇰 Colombo (SLST)", name: "Asia/Colombo", offset: 5.5, display: "UTC+5:30" },
          { label: "🇺🇸 Honolulu (HST)", name: "Pacific/Honolulu", offset: -10, display: "UTC-10:00" },
          { label: "🇺🇸 Anchorage (AKST)", name: "America/Anchorage", offset: -9, display: "UTC-9:00" },
        ];

        let selectedTz = TZ_LIST[0]; // Default: India
        let todayChartInstance = null;
        let monthChartInstance = null;
        let weekChartInstances = {};

        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const hours = ["12a","1","2","3","4","5","6","7","8","9","10","11","12p","1","2","3","4","5","6","7","8","9","10","11"];

        const opt = {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { beginAtZero: true, grid: { color: '#f5f5f5' }, ticks: { color: '#ccc', font: { size: 10 }, stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#999', font: { size: 10 }, maxRotation: 0 } }
            }
        };

        // ── Reprocess logs for any timezone offset ──
        function processLogs(offsetHours) {
            const offsetMs = offsetHours * 60 * 60 * 1000;
            let todayHourly = Array(24).fill(0);
            let monthlyDaily = Array(31).fill(0);
            let weekTotals = Array(7).fill(0);
            let weekHourly = Array(7).fill(0).map(() => Array(24).fill(0));
            let todayTotal = 0;
            let monthTotal = 0;
            let deviceLogs = [];

            RAW_LOGS.forEach(log => {
                if (!log.created_at) return;
                let cleanTimestamp = log.created_at.trim();
                if (cleanTimestamp.includes(' ')) cleanTimestamp = cleanTimestamp.replace(' ', 'T');
                if (!cleanTimestamp.includes('Z') && !cleanTimestamp.includes('+') && !cleanTimestamp.includes('-')) {
                    cleanTimestamp += 'Z';
                }
                let logUtcDate = new Date(cleanTimestamp);
                if (isNaN(logUtcDate.getTime())) return;

                const pDate = new Date(logUtcDate.getTime() + offsetMs);
                const pHour = pDate.getUTCHours();
                const pDay = pDate.getUTCDate();
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
                    let hh = pHour % 12; if (hh === 0) hh = 12;
                    const mm = String(pDate.getUTCMinutes()).padStart(2, '0');
                    const ss = String(pDate.getUTCSeconds()).padStart(2, '0');
                    const ampm = pHour >= 12 ? 'PM' : 'AM';
                    const timeFormatted = String(hh).padStart(2,'0') + ':' + mm + ':' + ss + ' ' + ampm;
                    let dLeft = "Unknown Device", dRight = "Data Type";
                    if (log.device_name && log.device_name.includes(" | ")) {
                        const sp = log.device_name.split(" | ");
                        dLeft = sp[0].trim(); dRight = sp[1].trim();
                    } else if (log.device_name) { dLeft = log.device_name; }
                    deviceLogs.push({ deviceLeft: dLeft, time: timeFormatted, deviceRight: dRight });
                }
            });

            return { todayHourly, monthlyDaily, weekTotals, weekHourly, todayTotal, monthTotal, deviceLogs };
        }

        function applyTimezone(tz) {
            selectedTz = tz;
            document.getElementById('tzActiveLabel').textContent = tz.label + ' — ' + tz.display;
            document.getElementById('tzLiveLabel').textContent = '(' + tz.display + ')';

            const d = processLogs(tz.offset);

            // Update counts
            document.getElementById('todayCount').textContent = d.todayTotal;
            document.getElementById('monthCount').textContent = d.monthTotal;

            // Update live logs
            const inner = document.getElementById('liveLogsInner');
            if (d.deviceLogs.length === 0) {
                inner.innerHTML = '<div class="no-logs">No messages sent yet</div>';
            } else {
                inner.innerHTML = d.deviceLogs.map(log =>
                    '<div class="log-item">' +
                    '<span class="log-col log-left">' + log.deviceLeft + '</span>' +
                    '<span class="log-col log-center">' + log.time + '</span>' +
                    '<span class="log-col log-right">' + log.deviceRight + '</span>' +
                    '</div>'
                ).join('');
            }

            // Update today chart
            if (todayChartInstance) {
                todayChartInstance.data.datasets[0].data = d.todayHourly;
                todayChartInstance.update();
            }

            // Update month chart
            if (monthChartInstance) {
                monthChartInstance.data.datasets[0].data = d.monthlyDaily;
                monthChartInstance.update();
            }

            // Update weekly charts
            days.forEach((day, idx) => {
                const el = document.getElementById('day-flex-count-' + day);
                if (el) el.textContent = d.weekTotals[idx];
                if (weekChartInstances[day]) {
                    weekChartInstances[day].data.datasets[0].data = d.weekHourly[idx];
                    weekChartInstances[day].update();
                }
            });

            // Re-render weekly totals in day rows
            days.forEach((day, idx) => {
                const countEl = document.getElementById('day-count-' + day);
                if (countEl) countEl.textContent = d.weekTotals[idx];
            });

            closeTzModalDirect();
            renderTzList();
        }

        // ── Toggle cards ──
        function toggle(id) {
            const el = document.getElementById(id);
            el.style.display = (el.style.display === 'block') ? 'none' : 'block';
        }

        // ── Charts init ──
        todayChartInstance = new Chart(document.getElementById('todayChart'), {
            type: 'bar',
            data: { labels: hours, datasets: [{ data: [${todayHourly.join(',')}], backgroundColor: '#000', barThickness: 8, borderRadius: 4 }] },
            options: opt
        });

        monthChartInstance = new Chart(document.getElementById('monthChart'), {
            type: 'bar',
            data: { labels: Array.from({length: 31}, (_, i) => i + 1), datasets: [{ data: [${monthlyDaily.join(',')}], backgroundColor: '#000', borderRadius: 2 }] },
            options: opt
        });

        ${renderedChartsJS.replace(/new Chart\(document\.getElementById\('chart-(\w+)'\)/g, (match, day) => 
          `weekChartInstances['${day}'] = new Chart(document.getElementById('chart-${day}')`
        )}

        // ── TZ Modal ──
        function renderTzList(filter) {
            const list = document.getElementById('tzList');
            const q = (filter || '').toLowerCase();
            const filtered = TZ_LIST.filter(t => t.label.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.display.toLowerCase().includes(q));
            list.innerHTML = filtered.map((tz, i) => {
                const isSel = tz.name === selectedTz.name;
                return '<div class="tz-item' + (isSel ? ' selected' : '') + '" onclick="applyTimezone(TZ_LIST.find(t=>t.name===\'' + tz.name + '\'))">' +
                    '<span class="tz-name">' + tz.label + '</span>' +
                    '<span class="tz-offset">' + tz.display + '</span>' +
                    '</div>';
            }).join('');
        }

        function openTzModal() {
            document.getElementById('tzOverlay').classList.add('open');
            document.getElementById('tzSearch').value = '';
            renderTzList();
            setTimeout(() => document.getElementById('tzSearch').focus(), 100);
        }

        function closeTzModal(e) {
            if (e.target === document.getElementById('tzOverlay')) closeTzModalDirect();
        }

        function closeTzModalDirect() {
            document.getElementById('tzOverlay').classList.remove('open');
        }

        function filterTz(val) { renderTzList(val); }

        // Init
        renderTzList();
    </script>
</body>
</html>`;

  return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
