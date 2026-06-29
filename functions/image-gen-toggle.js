export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  // GET — anyone can check if image gen is enabled (needed by index.html on load)
  if (request.method === 'GET') {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/app_settings?key=eq.image_gen_enabled&select=value`,
        { headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${env.SUPABASE_KEY}` } }
      );
      const data = await res.json();
      const enabled = Array.isArray(data) && data.length > 0 ? data[0].value !== 'false' : true;
      return new Response(JSON.stringify({ enabled }), { headers });
    } catch (e) {
      // Default to enabled if Supabase unreachable
      return new Response(JSON.stringify({ enabled: true }), { headers });
    }
  }

  // POST — admin only, toggles the setting
  if (request.method === 'POST') {
    if (searchParams.get('key') !== env.ADMIN_KEY) {
      return new Response(JSON.stringify({ error: 'Denied' }), { status: 403, headers });
    }
    try {
      const body = await request.json();
      const newValue = body.enabled ? 'true' : 'false';
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/app_settings?key=eq.image_gen_enabled`,
        {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ value: newValue })
        }
      );
      if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
      return new Response(JSON.stringify({ success: true, enabled: body.enabled }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}
