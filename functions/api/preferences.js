// Reads or writes the UPDT ("Ultra Power Deep Thinking" mode) preference for the
// currently authenticated user. UPDT is stored as a single character, "T" or "F",
// on the user's row in the `user_profiles` table -- "T" means the user should
// land on the Ultra Power page on login, "F" means the normal app.
//
// The user's own access_token is used for the Supabase request (not the service
// key), so Supabase's Row Level Security naturally restricts this to the
// caller's own row -- the same pattern used by update-password.js.

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing access token." }), {
        status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      throw new Error("Supabase credentials are not configured on the backend.");
    }

    // Identify the calling user from their token (mirrors the pattern in update-password.js)
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": env.SUPABASE_KEY, "Authorization": `Bearer ${accessToken}` }
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid or expired session." }), {
        status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    const userData = await userRes.json();
    const userId = userData.id;

    if (request.method === "GET") {
      const profileRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=updt`,
        { headers: { "apikey": env.SUPABASE_KEY, "Authorization": `Bearer ${accessToken}` } }
      );
      const rows = await profileRes.json();
      const updt = (Array.isArray(rows) && rows[0] && rows[0].updt) ? rows[0].updt : "F";
      return new Response(JSON.stringify({ updt }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    if (request.method === "POST") {
      const { updt } = await request.json();
      if (updt !== "T" && updt !== "F") {
        return new Response(JSON.stringify({ error: "updt must be 'T' or 'F'." }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      // Upsert rather than a plain PATCH: some accounts created before this
      // table existed have no row yet. This creates one if missing (with the
      // RLS insert policy allowing it since auth.uid() = id), or updates the
      // existing row otherwise.
      const updateRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
        method: "POST",
        headers: {
          "apikey": env.SUPABASE_KEY,
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({ id: userId, email: userData.email, updt })
      });
      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to update preference.");
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
