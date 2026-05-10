export async function onRequest(context) {
  const API_KEY = context.env.API_KEY;
  try {
    const data = await context.request.json();
    const userMsg = data.messages[data.messages.length - 1].content;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMsg }] }]
      })
    });

    const resData = await response.json();
    const reply = resData.candidates[0].content.parts[0].text;

    return new Response(JSON.stringify({ content: reply }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ content: "AI is offline. Check Cloudflare Keys." }), { status: 500 });
  }
}
