export async function onRequest(context) {
  const { request, env } = context;

  if (!env.API_KEY) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "Error: API_KEY is missing." } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }

  try {
    const { messages } = await request.json();

    // CLEANUP: Ensure every part has text and the roles are correct for Gemini
    const formattedMessages = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || m.parts?.[0]?.text || "" }]
    })).filter(m => m.parts[0].text.trim() !== ""); // Remove any empty messages

    if (formattedMessages.length === 0) {
        throw new Error("No message content found.");
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: formattedMessages
      })
    });

    const data = await response.json();

    if (data.error) {
      return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "Gemini Error: " + data.error.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }

    const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

    // --- KV COUNTER LOGIC START ---
    try {
      // Get current count, default to 0 if it doesn't exist
      const currentCount = await env.USAGE_KV.get("gemini_count") || 0;
      // Add 1 and save back to KV
      await env.USAGE_KV.put("gemini_count", (parseInt(currentCount) + 1).toString());
    } catch (kvErr) {
      console.log("KV Storage Error:", kvErr.message);
      // We don't stop the chat just because the counter failed
    }
    // --- KV COUNTER LOGIC END ---

    const streamData = `data: ${JSON.stringify({ choices: [{ delta: { content: botText } }] })}\n\ndata: [DONE]\n\n`;
    
    return new Response(streamData, {
      headers: { "Content-Type": "text/event-stream" }
    });

  } catch (err) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "System Error: " + err.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }
}
