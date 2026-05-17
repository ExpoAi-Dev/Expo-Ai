export async function onRequest(context) {
  const { env } = context;

  try {
    // 1. Fetch total count of logs from Supabase
    const countResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_logs?select=id`, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Range-Unit': 'items',
        'Range': '0-0' // Efficient way to get total row count header
      }
    });
    
    // Parse total from Content-Range header (e.g., "0-0/42")
    const contentRange = countResponse.headers.get('content-range') || '';
    const totalCount = contentRange.split('/')[1] || '0';

    // 2. Fetch the last 50 detailed rows for device logging
    const logsResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_logs?select=created_at,device_name&order=id.desc&limit=50`, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`
      }
    });
    
    const rawLogs = await logsResponse.json();

    // Format logs nicely with local time for the admin UI
    const formattedLogs = rawLogs.map(log => {
      const dateObj = new Date(log.created_at);
      const timeStr = dateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
      return {
        time: timeStr,
        device: log.device_name
      };
    });

    // Return the bundled data to your admin panel
    return new Response(JSON.stringify({
      totalMessages: totalCount,
      recentLogs: formattedLogs
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
