export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405, headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    const body = await request.json();
    const { action, email, password, name, token } = body;
    
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      throw new Error("Supabase credentials are not configured on the backend.");
    }

    let supabaseEndpoint = "";
    let payload = {};

    // Determine the Supabase Auth REST endpoint based on the action
    if (action === "signup") {
      supabaseEndpoint = `${env.SUPABASE_URL}/auth/v1/signup`;
      payload = { email, password, data: { name } };
    } else if (action === "login") {
      supabaseEndpoint = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
      payload = { email, password };
    } else if (action === "google") {
      supabaseEndpoint = `${env.SUPABASE_URL}/auth/v1/token?grant_type=id_token`;
      payload = { provider: 'google', id_token: token };
    } else if (action === "refresh") {
      // Silently renew an expired access token using the stored refresh token
      supabaseEndpoint = `${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
      payload = { refresh_token: token };
    } else {
      throw new Error("Invalid authentication action.");
    }

    // Authenticate against Supabase
    const authRes = await fetch(supabaseEndpoint, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const authData = await authRes.json();

    if (!authRes.ok) {
      throw new Error(authData.error_description || authData.msg || "Authentication failed");
    }

    // Initialize user profile in tracking database if it's a new registration or Google login
    if (action === "google" || action === "signup") {
        const userId = authData.user?.id;
        const userEmail = authData.user?.email;
        if (userId) {
            // Upsert to user_profiles to track usage 
            await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({
                    id: userId,
                    email: userEmail,
                    name: name || authData.user?.user_metadata?.name || authData.user?.user_metadata?.full_name || "New User",
                    created_at: new Date().toISOString()
                })
            }).catch(e => console.log("Profile initialization silently skipped (table might not exist yet).", e));
        }
    }

    return new Response(JSON.stringify({ success: true, session: authData }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
