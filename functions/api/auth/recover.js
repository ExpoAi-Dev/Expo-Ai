export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email } = await request.json();
    const origin = new URL(request.url).origin;

    const supabaseResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email,
        redirectTo: `${origin}/reset-password` 
      })
    });

    if (!supabaseResponse.ok) {
      const errData = await supabaseResponse.json();
      return new Response(JSON.stringify({ error: errData.msg || "Failed to trigger recovery sequence." }), {
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
