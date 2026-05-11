export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  
  // 1. Safety Check: Does the password in the link match your Cloudflare Secret?
  const submittedPass = searchParams.get('key');
  if (submittedPass !== env.ADMIN_KEY) {
    return new Response("Access Denied: Incorrect Password", { status: 403 });
  }

  // 2. Fetch the numbers from your USAGE_KV storage
  const gemini = await env.USAGE_KV.get("gemini_count") || 0;
  const groq = await env.USAGE_KV.get("groq_count") || 0;

  // 3. The Dashboard Page (Clean and mobile-friendly for your Poco)
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Expoloom AI Stats</title>
        <style>
            body { font-family: -apple-system, sans-serif; padding: 25px; background: #fff; color: #000; }
            h2 { font-weight: 700; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .card { border: 1px solid #ddd; padding: 20px; border-radius: 12px; margin-top: 20px; background: #f9f9f9; }
            .stat-line { font-size: 18px; margin: 10px 0; display: flex; justify-content: space-between; }
            .logout { display: block; margin-top: 30px; color: #888; text-decoration: none; font-size: 14px; }
        </style>
    </head>
    <body>
        <h2>Expoloom AI Usage</h2>
        <div class="card">
            <div class="stat-line"><span>Gemini Requests:</span> <b>${gemini}</b></div>
            <div class="stat-line"><span>Groq Requests:</span> <b>${groq}</b></div>
        </div>
        <a href="/admin" class="logout">← Logout and Go Back</a>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}
