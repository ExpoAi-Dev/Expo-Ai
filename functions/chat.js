export async function onRequest(context) {
  const { request, env } = context;

  if (!env.API_KEY) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "Error: API_KEY is missing." } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }

  try {
    const { messages } = await request.json();

    const formattedMessages = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || m.parts?.[0]?.text || "" }]
    })).filter(m => m.parts[0].text.trim() !== "");

    if (formattedMessages.length === 0) {
        throw new Error("No message content found.");
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: formattedMessages })
    });

    const data = await response.json();

    if (data.error) {
      return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "Gemini Error: " + data.error.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }

    const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

    // --- UNLIMITED SUPABASE LOGGING ---
    try {
      const rawDevice = request.headers.get('user-agent') || 'Unknown Device';
      let deviceName = "PC / Laptop";
      if (rawDevice.includes('iPad')) deviceName = "iPad";
      else if (rawDevice.includes('iPhone')) deviceName = "iPhone";
      else if (rawDevice.includes('Android')) {
        deviceName = rawDevice.includes('Mobile') ? "Android Phone" : "Android Tablet";
      }

      // Send log to Supabase via a clean HTTP POST fetch
      await fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_logs`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ device_name: deviceName })
      });

    } catch (sbErr) {
      console.log("Supabase Logging Error:", sbErr.message);
    }
    // --- END SUPABASE LOGGING ---

    const streamData = `data: ${JSON.stringify({ choices: [{ delta: { content: botText } }] })}\n\ndata: [DONE]\n\n`;
    
    return new Response(streamData, {
      headers: { "Content-Type": "text/event-stream" }
    });

  } catch (err) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "System Error: " + err.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }
}
