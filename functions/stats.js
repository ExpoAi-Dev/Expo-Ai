export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response("Denied", { status: 403 });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`;

  // 1. Fetch Main Totals
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

  // 4. Fetch Weekly Data (Counts only for the row display)
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
        .card { border: 1px solid #000; padding: 18px; border-radius: 12px; margin-bottom: 15px; cursor: pointer; }
        h3 { margin: 0; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 1px; }
        .count { font-size: 28px; font-weight: bold; margin: 5px 0; }
        .graph-container { display: none; margin-top: 15px; height: 180px; border-top: 1px solid #eee; padding-top: 10px; }
        
        /* Weekly Section */
        .weekly-title { font-weight: bold; margin: 25px 0 10px 5px; font-size: 18px; }
        .day-card { border: 1px solid #ddd; padding: 12px; border-radius: 10px; margin-bottom: 8px; cursor: pointer; transition: 0.2s; }
        .day-header { display: flex; justify-content: space-between; align-items: center; }
        .day-label { font-weight: 600; }
        .day-usage { font-size: 14px; background: #000; color: #fff; padding: 2px 8px; border-radius: 5px; }
        .day-details { display: none; margin-top: 10px; font-size: 12px; color: #666; text-align: center; border-top: 1px solid #f0f0f0; padding-top: 10px; }
    </style>
</head>
<body>
    <h2 style="margin-bottom: 20px;">Expoloom AI Insights</h2>

    <div class="card" onclick="toggleElement('todayGraph')">
        <h3>Today's Usage</h3>
        <div class="count">${todayTotal}</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <div class="weekly-title">Weekly Report</div>
    ${days.map(day => `
        <div class="day-card" onclick="toggleElement('details-${day}')">
            <div class="day-header">
                <span class="day-label">${day}</span>
                <span class="day-usage">${weekCounts[day]}</span>
            </div>
            <div id="details-${day}" class="day-details" onclick="event.stopPropagation()">
                Detailed graph for ${day} will appear here as you collect more data.
            </div>
        </div>
    `).join('')}

    <div class="card" style="margin-top:20px;" onclick="toggleElement('monthGraph')">
        <h3>Monthly Total</h3>
        <div class="count">${monthTotal}</div>
        <div id="monthGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="monthChart"></canvas>
        </div>
    </div>

    <a href="/admin" style="display:block; text-align:center; margin-top:30px; color:#999; text-decoration:none; font-size:14px;">Logout</a>

    <script>
        function toggleElement(id) {
            const el = document.getElementById(id);
            el.style.display = (el.style.display === 'block') ? 'none' : 'block';
        }

        // Today Chart (Bar)
        new Chart(document.getElementById('todayChart'), {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => i + ':00'),
                datasets: [{ data: [${hourlyData.join(',')}], backgroundColor: '#000', borderRadius: 4 }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        // Month Chart (Bar)
        new Chart(document.getElementById('monthChart'), {
            type: 'bar',
            data: {
                labels: Array.from({length: 31}, (_, i) => i + 1),
                datasets: [{ data: [${monthlyData.join(',')}], backgroundColor: '#000', borderRadius: 2 }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    </script>
</body>
</html>`;

  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
