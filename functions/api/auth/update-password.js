export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { password, access_token } = await request.json();

    if (!access_token) {
      return new Response(JSON.stringify({ error: "Authorization security token is missing." }), { status: 400 });
    }

    const supabaseResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: password })
    });

    if (!supabaseResponse.ok) {
      const errData = await supabaseResponse.json();
      return new Response(JSON.stringify({ error: errData.msg || "Failed to finalize new password data." }), {
        status: supabaseResponse.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" }});
  }
}
