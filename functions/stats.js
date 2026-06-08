export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== env.ADMIN_KEY) return new Response("Denied", { status: 403 });

  // Array of days for formatting references
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  let todayTotal = 0;
  let monthTotal = 0;
  let deviceLogs = [];
  
  // Tracking counters for the API Key usage
  let gemDataTotal = 0;
  let gDataTotal = 0;
  let imgDataTotal = 0; // NEW: Image Data Tracker
  
  // Initialize graphs datasets with 0s
  let todayHourly = Array(24).fill(0);
  let monthlyDaily = Array(31).fill(0);
  let weekTotals = Array(7).fill(0);
  let weekHourly = Array(7).fill(0).map(() => Array(24).fill(0));

  try {
    // 1. Fetch ALL logs for the current calendar month from Supabase
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

    const logs = await supabaseResponse.json();

    // 2. Parse logs to extract real-time Patna metric states
    const targetTimeZone = 'Asia/Kolkata';
    const nowPatna = new Date(new Date().toLocaleString("en-US", { timeZone: targetTimeZone }));
    
    const currentYear = nowPatna.getFullYear();
    const currentMonth = nowPatna.getMonth(); // 0-11
    const currentDay = nowPatna.getDate();

    logs.forEach(log => {
      const logDate = new Date(log.created_at);
      // Convert database timestamp cleanly into individual localized Patna integers
      const patnaStr = logDate.toLocaleString("en-US", { timeZone: targetTimeZone });
      const pDate = new Date(patnaStr);

      const pYear = pDate.getFullYear();
      const pMonth = pDate.getMonth();
      const pDay = pDate.getDate();
      const pHour = pDate.getHours();

      // Increment API Key tracking safely based on the tags we added in chat.js
      if (log.device_name) {
          if (log.device_name.includes('G Data')) {
              gDataTotal++;
          } else if (log.device_name.includes('Gem Data')) {
              gemDataTotal++;
          } else if (log.device_name.includes('Img Data')) {
              imgDataTotal++;
          }
      }

      // Adjust day of week string index matching standard days array mapping
      let pDayOfWeek = pDate.getDay() - 1; 
      if (pDayOfWeek === -1) pDayOfWeek = 6; // Shift Sunday to last element position

      // Evaluate data bounds matches
      if (pYear === currentYear && pMonth === currentMonth) {
        // Increment global monthly stats
        monthTotal++;
        if (pDay >= 1 && pDay <= 31) {
          monthlyDaily[pDay - 1]++;
        }

        // Aggregate running weekly chart distributions
        if (pDayOfWeek >= 0 && pDayOfWeek < 7) {
          weekTotals[pDayOfWeek]++;
          weekHourly[pDayOfWeek][pHour]++;
        }

        // Aggregate running explicit daily timeline bounds
        if (pDay === currentDay) {
          todayTotal++;
          todayHourly[pHour]++;

          // Build item formatting for the "Live Device Activity" section
          if (deviceLogs.length < 50) {
            // FIXED: Added explicitly structured timeZone parameter to enforce exact local matching
            const timeFormatted = logDate.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: targetTimeZone
            });
            deviceLogs.push({ time: timeFormatted, device: log.device_name });
          }
        }
      }
    });

  } catch (err) {
    console.log("Supabase analytics processing error: ", err.message);
  }

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
        
        /* Device log styles */
        .logs-container { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; max-height: 250px; overflow-y: auto; }
        .log-item { display: flex; justify-content: space-between; padding: 10px 5px; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
        .log-time { font-weight: 700; color: #000; }
        .log-device { background: #f0f0f0; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
        .no-logs { text-align: center; color: #999; padding: 20px 0; font-size: 14px; }
    </style>
</head>
<body>
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
            ${deviceLogs.length === 0 ? `<div class="no-logs">No messages sent yet today</div>` : 
                deviceLogs.map(log => `
                    <div class="log-item">
                        <span class="log-time">${log.time}</span>
                        <span class="log-device">${log.device}</span>
                    </div>
                `).join('')
            }
        </div>
    </div>

    <div class="card" onclick="toggle('weeklyMenu')">
        <h3>Weekly Report</h3>
        <div style="font-size: 13px; margin-top: 5px; color: #666;">Tap for daily and hourly info</div>
        <div id="weeklyMenu" class="weekly-list" onclick="event.stopPropagation()">
            ${days.map((day, idx) => `
                <div class="day-row" onclick="toggle('graph-${day}')">
                    <div class="day-flex"><span>${day}</span><span>${weekTotals[idx]}</span></div>
                    <div id="graph-${day}" class="day-graph-box" onclick="event.stopPropagation()">
                        <canvas id="chart-${day}"></canvas>
                    </div>
                </div>
            `).join('')}
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

        ${days.map((day, idx) => `
            new Chart(document.getElementById('chart-${day}'), {
                type: 'bar',
                data: { 
                    labels: hours, 
                    datasets: [{ 
                        data: [${weekHourly[idx].join(',')}], 
                        backgroundColor: '#000', 
                        barThickness: 8, \n                        borderRadius: 4 
                    }] 
                },
                options: opt
            });
        `).join('')}
    </script>
</body>
</html>`;

  return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
