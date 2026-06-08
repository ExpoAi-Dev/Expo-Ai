export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== env.ADMIN_KEY) return new Response("Denied", { status: 403 });

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

  // NEW: Variable to hold our error message
  let systemErrorMessage = "";

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

    // NEW: If the database request fails, throw an error so the system catches it
    if (!supabaseResponse.ok) {
      const errText = await supabaseResponse.text();
      throw new Error(`Database connection failed (${supabaseResponse.status}): ${errText}`);
    }

    let logs = [];
    const rawData = await supabaseResponse.json();
    if (Array.isArray(rawData)) {
        logs = rawData;
    } else {
        throw new Error("Invalid data format received from database (Expected an array).");
    }

    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowUtc = new Date();
    const nowPatna = new Date(nowUtc.getTime() + istOffset);
    
    const currentYear = nowPatna.getUTCFullYear();
    const currentMonth = nowPatna.getUTCMonth(); 
    const currentDay = nowPatna.getUTCDate();

    logs.forEach(log => {
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
         const pYear = pDate.getUTCFullYear();
         const pMonth = pDate.getUTCMonth();
         const pDay = pDate.getUTCDate();
         const pHour = pDate.getUTCHours();

         if (log.device_name) {
             if (log.device_name.includes('G Data')) {
                 gDataTotal++;
             } else if (log.device_name.includes('Gem Data')) {
                 gemDataTotal++;
             } else if (log.device_name.includes('Img Data')) {
                 imgDataTotal++;
             }
         }

         let pDayOfWeek = pDate.getUTCDay() - 1; 
         if (pDayOfWeek === -1) pDayOfWeek = 6; 

         if (pYear === currentYear && pMonth === currentMonth) {
           monthTotal++;
           if (pDay >= 1 && pDay <= 31) {
             monthlyDaily[pDay - 1]++;
           }

           if (pDayOfWeek >= 0 && pDayOfWeek < 7) {
             weekTotals[pDayOfWeek]++;
             weekHourly[pDayOfWeek][pHour]++;
           }

           if (pDay === currentDay) {
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
           }
         }
      }
    });

  } catch (err) {
    console.log("Supabase analytics processing error: ", err.message);
    // NEW: Save the error message so we can show it in the HTML
    systemErrorMessage = err.message;
  }

  // Generate logs rows safe from layout breaks
  const renderedLogs = deviceLogs.length === 0 
    ? `<div class="no-logs">No messages sent yet today</div>` 
    : deviceLogs.map(log => `
        <div class="log-item">
            <span class="log-col log-left">${log.deviceLeft}</span>
            <span class="log-col log-center">${log.time}</span>
            <span class="log-col log-right">${log.deviceRight}</span>
        </div>
      `).join('');

  // Generate weekly menus safe from execution breaks
  const renderedWeekly = days.map((day, idx) => `
    <div class="day-row" onclick="toggle('graph-${day}')">
        <div class="day-flex"><span>${day}</span><span>${weekTotals[idx]}</span></div>
        <div id="graph-${day}" class="day-graph-box" onclick="event.stopPropagation()">
            <canvas id="chart-${day}"></canvas>
        </div>
    </div>
  `).join('');

  // Generate inline chart construction directives safe from compilation breaks
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

  // NEW: HTML for the error alert banner
  const errorAlertHTML = systemErrorMessage 
    ? `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 15px; margin-bottom: 20px; border-radius: 4px; font-size: 14px; word-wrap: break-word;">
         <strong>⚠️ System Error:</strong> ${systemErrorMessage}
       </div>`
    : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expoloom AI Insights</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
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
    </style>
</head>
<body>
    ${errorAlertHTML}

    <h1 style="font-size: 24px; margin-bottom: 25px; padding-left: 5px;">Expoloom AI Insights</h1>

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
        <div class="count">${todayTotal}</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <div class="card" onclick="toggle('liveLogs')">
        <h3>Live Device Activity (Patna Time)</h3>
        <div style="font-size: 13px; margin-top: 5px; color: #666;">Tap to see exact times & devices</div>
        <div id="liveLogs" class="logs-container" onclick="event.stopPropagation()">
            ${renderedLogs}
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
        <div class="count">${monthTotal}</div>
        <div id="monthGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="monthChart"></canvas>
        </div>
    </div>

    <a href="/admin" style="display:block; text-align:center; margin-top:40px; color:#bbb; text-decoration:none; font-size:13px; font-weight:600;">LOGOUT</a>

    <script>
        function toggle(id) {
            const el = document.getElementById(id);
            el.style.display = (el.style.display === 'block') ? 'none' : 'block';
        }

        const opt = {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { beginAtZero: true, grid: { color: '#f5f5f5' }, ticks: { color: '#ccc', font: { size: 10 }, stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#999', font: { size: 10 }, maxRotation: 0 } }
            }
        };

        const hours = [
            "12a", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
            "12p", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"
        ];

        new Chart(document.getElementById('todayChart'), {
            type: 'bar',
            data: { labels: hours, datasets: [{ data: [${todayHourly.join(',')}], backgroundColor: '#000', barThickness: 8, borderRadius: 4 }] },
            options: opt
        });

        new Chart(document.getElementById('monthChart'), {
            type: 'bar',
            data: { labels: Array.from({length: 31}, (_, i) => i + 1), datasets: [{ data: [${monthlyDaily.join(',')}], backgroundColor: '#000', borderRadius: 2 }] },
            options: opt
        });

        ${renderedChartsJS}
    </script>
</body>
</html>`;

  return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
