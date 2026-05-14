export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Fetch all counts
  const daily = await env.USAGE_KV.get("daily_count") || 0;
  const monthly = await env.USAGE_KV.get("monthly_count") || 0;
  
  // Weekly Data (Example of how to fetch multiple days)
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let weeklyHtml = "";
  for (let day of days) {
    const count = await env.USAGE_KV.get(`usage_${day}`) || 0;
    weeklyHtml += `<div class="day-row"><span>${day}</span><span>${count}</span></div>`;
  }

  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f4f4f4; }
            .card { background: white; padding: 20px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 { margin: 0 0 10px 0; font-size: 18px; }
            .big-num { font-size: 32px; font-weight: bold; color: #000; }
            details { cursor: pointer; }
            summary { font-weight: bold; padding: 10px 0; list-style: none; display: flex; justify-content: space-between; }
            summary::after { content: "▼"; font-size: 12px; }
            .day-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        </style>
    </head>
    <body>
        <h1>Expoloom Stats</h1>

        <div class="card">
            <h2>Today's Usage</h2>
            <div class="big-num">${daily}</div>
        </div>

        <div class="card">
            <details>
                <summary>Weekly Usage Report</summary>
                <div style="margin-top:10px;">
                    ${weeklyHtml}
                </div>
            </details>
        </div>

        <div class="card">
            <h2>Monthly Total</h2>
            <div class="big-num">${monthly}</div>
        </div>

        <a href="/admin" style="display:block; text-align:center; margin-top:20px; color:#666; text-decoration:none;">Logout</a>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}
