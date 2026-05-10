export async function onRequest(context) {
  const { request, env } = context;

  // 1. Safety check for the API key
  if (!env.API_KEY) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "Error: API_KEY is missing in Cloudflare settings." } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }

  try {
    const { messages } = await request.json();
    const userMsg = messages[messages.length - 1].content;

    // 2. Exact URL for Gemini 2.5 Flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMsg }] }]
      })
    });

    const data = await response.json();

    // 3. Error handling for the API response
    if (data.error) {
      return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "API Error: " + data.error.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }

    const botText = data.candidates[0].content.parts[0].text;

    // 4. Send the response in the format index.html expects
    const streamData = `data: ${JSON.stringify({ choices: [{ delta: { content: botText } }] })}\n\ndata: [DONE]\n\n`;
    
    return new Response(streamData, {
      headers: { "Content-Type": "text/event-stream" }
    });

  } catch (err) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "System Error: " + err.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }
}
