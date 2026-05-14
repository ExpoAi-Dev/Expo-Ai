export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response("Denied", { status: 403 });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`;

  // 1. Fetch Totals
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

  // 4. Fetch Weekly Totals
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
    <title>Expoloom AI Insights</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, sans-serif; padding: 15px; background: #fff; color: #000; -webkit-tap-highlight-color: transparent; }
        .card { border: 1px solid #000; padding: 20px; border-radius: 15px; margin-bottom: 15px; cursor: pointer; }
        h3 { margin: 0; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 1px; }
        .count { font-size: 30px; font-weight: bold; margin: 5px 0; }
        .graph-container { display: none; margin-top: 15px; height: 180px; border-top: 1px solid #eee; padding-top: 10px; }
        
        /* Weekly List Style */
        .weekly-list { display: none; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; }
        .day-row { padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
        .day-row:last-child { border: none; }
        .day-flex { display: flex; justify-content: space-between; align-items: center; }
        .day-graph { display: none; height: 120px; margin-top: 10px; background: #fafafa; border-radius: 8px; padding: 5px; }
    </style>
</head>
<body>
    <h2 style="margin-bottom: 20px;">Expoloom AI Insights</h2>

    <div class="card" onclick="toggle('todayGraph')">
        <h3>Today's Usage</h3>
        <div class="count">${todayTotal}</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <div class="card" onclick="toggle('weeklyMenu')">
        <h3>Weekly Report</h3>
        <div style="font-size: 14px; margin-top: 5px; font-weight: 600;">Tap to view days</div>
        
        <div id="weeklyMenu" class="weekly-list" onclick="event.stopPropagation()">
            ${days.map(day => `
                <div class="day-row" onclick="toggle('graph-${day}')">
                    <div class="day-flex">
                        <span>${day}</span>
                        <b>${weekCounts[day]}</b>
                    </div>
                    <div id="graph-${day}" class="day-graph">
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

    <a href="/admin" style="display:block; text-align:center; margin-top:30px; color:#999; text-decoration:none; font-size:14px;">Logout</a>

    <script>
        function toggle(id) {
            const el = document.getElementById(id);
            el.style.display = (el.style.display === 'block') ? 'none' : 'block';
        }

        const chartOptions = { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } };

        // Today Chart
        new Chart(document.getElementById('todayChart'), {
            type: 'bar',
            data: { labels: Array.from({length: 24}, (_, i) => i + ':00'), datasets: [{ data: [${hourlyData.join(',')}], backgroundColor: '#000' }] },
            options: chartOptions
        });

        // Monthly Chart
        new Chart(document.getElementById('monthChart'), {
            type: 'bar',
            data: { labels: Array.from({length: 31}, (_, i) => i + 1), datasets: [{ data: [${monthlyData.join(',')}], backgroundColor: '#000' }] },
            options: chartOptions
        });

        // Placeholder Charts for Days (This will show zero until you track specific day-hours)
        ${days.map(day => `
            new Chart(document.getElementById('chart-${day}'), {
                type: 'bar',
                data: { labels: ['Usage'], datasets: [{ data: [${weekCounts[day]}], backgroundColor: '#444' }] },
                options: chartOptions
            });
        `).join('')}
    </script>
</body>
</html>`;

  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
