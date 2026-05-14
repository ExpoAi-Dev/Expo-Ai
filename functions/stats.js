export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== env.ADMIN_KEY) return new Response("Denied", { status: 403 });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`;

  // Fetch Today's Hourly Data (00:00 to 23:00)
  let hourlyData = [];
  for (let i = 0; i < 24; i++) {
    const val = await env.USAGE_KV.get(`hourly_${dateStr}_${i}`) || 0;
    hourlyData.push(val);
  }

  // Fetch Monthly Data (Day 1 to 31)
  let monthlyData = [];
  for (let i = 1; i <= 31; i++) {
    const val = await env.USAGE_KV.get(`daycount_${monthKey}_${i}`) || 0;
    monthlyData.push(val);
  }

  // Weekly Rows
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let weeklyRows = "";
  for (const day of days) {
    const val = await env.USAGE_KV.get(`weekly_${day}`) || 0;
    weeklyRows += `<div class="day-row"><span>${day}</span><b>${val}</b></div>`;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Expoloom AI Analytics</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { font-family: -apple-system, sans-serif; padding: 15px; background: #fff; color: #000; }
            .card { border: 1px solid #000; padding: 20px; border-radius: 15px; margin-bottom: 15px; cursor: pointer; transition: 0.2s; }
            .card:active { background: #f0f0f0; }
            h3 { margin: 0; font-size: 12px; text-transform: uppercase; color: #666; letter-spacing: 1px; }
            .count { font-size: 32px; font-weight: bold; margin: 5px 0; }
            .graph-container { display: none; margin-top: 15px; height: 180px; border-top: 1px solid #eee; padding-top: 10px; }
            details { border: 1px solid #000; border-radius: 15px; padding: 15px; margin-bottom: 15px; }
            summary { font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; }
            summary::after { content: "v"; font-size: 12px; }
            .day-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px dotted #ccc; }
        </style>
    </head>
    <body>
        <h2 style="margin-bottom: 25px;">Expoloom AI Insights</h2>

        <div class="card" onclick="toggleGraph('todayGraph')">
            <h3>Today's Usage</h3>
            <div class="count">${await env.USAGE_KV.get(`daily_${dateStr}`) || 0}</div>
            <div style="font-size: 11px; color: #888;">Tap to see hourly graph</div>
            <div id="todayGraph" class="graph-container"><canvas id="todayChart"></canvas></div>
        </div>

        <details>
            <summary>Weekly Reports</summary>
            <div style="margin-top:10px;">${weeklyRows}</div>
        </details>

        <div class="card" onclick="toggleGraph('monthGraph')">
            <h3>Monthly Total</h3>
            <div class="count">${await env.USAGE_KV.get(monthKey) || 0}</div>
            <div style="font-size: 11px; color: #888;">Tap to see daily breakdown</div>
            <div id="monthGraph" class="graph-container"><canvas id="monthChart"></canvas></div>
        </div>

        <a href="/admin" style="display:block; text-align:center; margin-top:30px; color:#999; text-decoration:none; font-size:14px;">Logout</a>

        <script>
            function toggleGraph(id) {
                const el = document.getElementById(id);
                el.style.display = el.style.display === 'block' ? 'none' : 'block';
            }

            // Create Today Chart (Line)
            new Chart(document.getElementById('todayChart'), {
                type: 'line',
                data: {
                    labels: Array.from({length: 24}, (_, i) => i + ':00'),
                    datasets: [{ 
                        label: 'Requests', 
                        data: [${hourlyData.join(',')}], 
                        borderColor: '#000', 
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.3,
                        fill: true,
                        backgroundColor: 'rgba(0,0,0,0.05)'
                    }]
                },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });

            // Create Month Chart (Bar)
            new Chart(document.getElementById('monthChart'), {
                type: 'bar',
                data: {
                    labels: Array.from({length: 31}, (_, i) => i + 1),
                    datasets: [{ 
                        label: 'Requests', 
                        data: [${monthlyData.join(',')}], 
                        backgroundColor: '#000',
                        borderRadius: 4
                    }]
                },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        </script>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
