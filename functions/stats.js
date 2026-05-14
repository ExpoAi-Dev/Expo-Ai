export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response("Denied", { status: 403 });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`;

  // 1. Fetch Main Data
  const todayTotal = await env.USAGE_KV.get(`daily_${dateStr}`) || 0;
  const monthTotal = await env.USAGE_KV.get(monthKey) || 0;

  // 2. Fetch Today's Hourly Data
  let hourlyData = [];
  for (let i = 0; i < 24; i++) {
    const val = await env.USAGE_KV.get(`hourly_${dateStr}_${i}`) || 0;
    hourlyData.push(val);
  }

  // 3. Fetch Monthly Data
  let monthlyData = [];
  for (let i = 1; i <= 31; i++) {
    const val = await env.USAGE_KV.get(`daycount_${monthKey}_${i}`) || 0;
    monthlyData.push(val);
  }

  // 4. Fetch Weekly Data & Hourly breakdown for each day
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let weekCounts = {};
  for (const day of days) {
    weekCounts[day] = await env.USAGE_KV.get(`weekly_${day}`) || 0;
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Expoloom AI Analytics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, sans-serif; padding: 15px; background: #fff; color: #000; -webkit-tap-highlight-color: transparent; }
        .card { border: 1.5px solid #000; padding: 20px; border-radius: 18px; margin-bottom: 15px; cursor: pointer; }
        h3 { margin: 0; font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 1px; font-weight: 700; }
        .count { font-size: 34px; font-weight: bold; margin: 5px 0; }
        .graph-container { display: none; margin-top: 15px; height: 200px; border-top: 1px solid #eee; padding-top: 15px; }
        .weekly-list { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; }
        .day-row { padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
        .day-row:last-child { border: none; }
        .day-flex { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 16px; }
        .day-graph-box { display: none; height: 180px; margin-top: 10px; padding-top: 10px; }
    </style>
</head>
<body>
    <h1 style="font-size: 24px; margin-bottom: 25px; padding-left: 5px;">Expoloom AI Insights</h1>

    <div class="card" onclick="toggle('todayGraph')">
        <h3>Today's Usage</h3>
        <div class="count">${todayTotal}</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <div class="card" onclick="toggle('weeklyMenu')">
        <h3>Weekly Report</h3>
        <div style="font-size: 13px; margin-top: 5px; color: #666;">Tap for daily and hourly info</div>
        <div id="weeklyMenu" class="weekly-list" onclick="event.stopPropagation()">
            ${days.map(day => `
                <div class="day-row" onclick="toggle('graph-${day}')">
                    <div class="day-flex">
                        <span>${day}</span>
                        <span>${weekCounts[day]}</span>
                    </div>
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

        const commonOptions = {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { beginAtZero: true, grid: { color: '#f5f5f5' }, ticks: { color: '#ccc', font: { size: 10 }, stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#999', font: { size: 10 } } }
            }
        };

        const hoursLabels = Array.from({length: 24}, (_, i) => i + ':00');

        // Today Chart
        new Chart(document.getElementById('todayChart'), {
            type: 'bar',
            data: { labels: hoursLabels, datasets: [{ data: [${hourlyData.join(',')}], backgroundColor: '#000', barThickness: 8, borderRadius: 4 }] },
            options: commonOptions
        });

        // Monthly Chart
        new Chart(document.getElementById('monthChart'), {
            type: 'bar',
            data: { labels: Array.from({length: 31}, (_, i) => i + 1), datasets: [{ data: [${monthlyData.join(',')}], backgroundColor: '#000', borderRadius: 2 }] },
            options: commonOptions
        });

        // Weekly Day Charts - Now exactly like the Today Graph
        ${days.map(day => `
            new Chart(document.getElementById('chart-${day}'), {
                type: 'bar',
                data: { 
                    labels: hoursLabels, 
                    datasets: [{ 
                        data: [${hourlyData.join(',')}], // Using today's hourly format
                        backgroundColor: '#000', 
                        barThickness: 8, 
                        borderRadius: 4 
                    }] 
                },
                options: commonOptions
            });
        `).join('')}
    </script>
</body>
</html>`;

  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
