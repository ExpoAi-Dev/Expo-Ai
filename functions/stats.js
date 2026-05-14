export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response("Denied", { status: 403 });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`;

  // 1. Fetch data
  const todayTotal = await env.USAGE_KV.get(`daily_${dateStr}`) || 0;
  const monthTotal = await env.USAGE_KV.get(monthKey) || 0;

  let hourlyData = [];
  for (let i = 0; i < 24; i++) {
    const val = await env.USAGE_KV.get(`hourly_${dateStr}_${i}`) || 0;
    hourlyData.push(val);
  }

  let monthlyData = [];
  for (let i = 1; i <= 31; i++) {
    const val = await env.USAGE_KV.get(`daycount_${monthKey}_${i}`) || 0;
    monthlyData.push(val);
  }

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let weeklyRows = "";
  for (const day of days) {
    const val = await env.USAGE_KV.get(`weekly_${day}`) || 0;
    weeklyRows += `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px dotted #ccc;"><span>${day}</span><b>${val}</b></div>`;
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
        .card { border: 1px solid #000; padding: 20px; border-radius: 15px; margin-bottom: 15px; cursor: pointer; }
        h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: #666; letter-spacing: 1px; }
        .count { font-size: 32px; font-weight: bold; margin: 5px 0; }
        .graph-container { display: none; margin-top: 15px; height: 200px; border-top: 1px solid #eee; padding-top: 10px; }
        details { border: 1px solid #000; border-radius: 15px; padding: 15px; margin-bottom: 15px; }
        summary { font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; }
        summary::after { content: "v"; font-size: 12px; }
    </style>
</head>
<body>
    <h2 style="margin-bottom: 25px;">Expoloom AI Insights</h2>

    <div class="card" onclick="toggleGraph('todayGraph')">
        <h3>Today's Usage</h3>
        <div class="count">${todayTotal}</div>
        <div style="font-size: 11px; color: #888;">Tap for hourly breakdown</div>
        <div id="todayGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="todayChart"></canvas>
        </div>
    </div>

    <details>
        <summary>Weekly Reports</summary>
        <div style="margin-top:10px;">${weeklyRows}</div>
    </details>

    <div class="card" onclick="toggleGraph('monthGraph')">
        <h3>Monthly Total</h3>
        <div class="count">${monthTotal}</div>
        <div style="font-size: 11px; color: #888;">Tap for daily breakdown</div>
        <div id="monthGraph" class="graph-container" onclick="event.stopPropagation()">
            <canvas id="monthChart"></canvas>
        </div>
    </div>

    <a href="/admin" style="display:block; text-align:center; margin-top:30px; color:#999; text-decoration:none; font-size:14px;">Logout</a>

    <script>
        function toggleGraph(id) {
            const el = document.getElementById(id);
            el.style.display = el.style.display === 'block' ? 'none' : 'block';
        }

        // Today Chart - Changed to BAR for the "Square" look
        new Chart(document.getElementById('todayChart'), {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => i + ':00'),
                datasets: [{ 
                    label: 'Usage', 
                    data: [${hourlyData.join(',')}], 
                    backgroundColor: '#000',
                    borderRadius: 4
                }]
            },
            options: { 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });

        // Month Chart - Bar
        new Chart(document.getElementById('monthChart'), {
            type: 'bar',
            data: {
                labels: Array.from({length: 31}, (_, i) => i + 1),
                datasets: [{ 
                    label: 'Daily', 
                    data: [${monthlyData.join(',')}], 
                    backgroundColor: '#000',
                    borderRadius: 2
                }]
            },
            options: { 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    </script>
</body>
</html>`;

  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
