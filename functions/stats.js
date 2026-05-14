export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response("Access Denied", { status: 403 });
  }

  const now = new Date();
  const todayKey = `daily_${now.toISOString().split('T')[0]}`;
  const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`;

  const daily = await env.USAGE_KV.get(todayKey) || 0;
  const monthly = await env.USAGE_KV.get(monthKey) || 0;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let weeklyRows = "";
  for (const day of days) {
    const val = await env.USAGE_KV.get(`weekly_${day}`) || 0;
    weeklyRows += `
      <div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
        <span>${day}</span>
        <b>${val}</b>
      </div>`;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Expoloom AI Stats</title>
        <style>
            body { font-family: sans-serif; padding: 20px; background: #fff; line-height: 1.5; color: #000; }
            .card { border: 1px solid #000; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
            h3 { margin-top: 0; font-size: 14px; text-transform: uppercase; color: #666; }
            .count { font-size: 32px; font-weight: bold; }
            details { border: 1px solid #000; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
            summary { font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; }
            /* Mobile-friendly arrows using standard text */
            summary::after { content: "v"; font-size: 14px; font-weight: normal; }
            details[open] summary::after { content: "^"; }
            summary::-webkit-details-marker { display: none; } /* Hides default small arrow */
        </style>
    </head>
    <body>
        <h2>Expoloom AI Analytics</h2>

        <div class="card">
            <h3>Today's Usage</h3>
            <div class="count">${daily}</div>
        </div>

        <details>
            <summary>Weekly Reports</summary>
            <div style="margin-top: 15px;">
                <div style="display:flex; justify-content:space-between; color:#666; font-size:11px; margin-bottom:5px; font-weight:bold;">
                    <span>DAYS</span><span>USAGE</span>
                </div>
                ${weeklyRows}
            </div>
        </details>

        <div class="card">
            <h3>Monthly Total</h3>
            <div class="count">${monthly}</div>
        </div>

        <a href="/admin" style="color: #666; text-decoration: none; font-size: 14px; display: inline-block;">Log out</a>
    </body>
    </html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
