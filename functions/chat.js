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

    // --- ADVANCED KV COUNTER START ---
    try {
      const now = new Date();
      
      // 1. Get Date Strings for Keys
      const todayKey = `daily_${now.toISOString().split('T')[0]}`; // e.g., daily_2026-05-14
      const monthKey = `monthly_${now.getFullYear()}-${now.getMonth() + 1}`; // e.g., monthly_2026-5
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = dayNames[now.getDay()]; // e.g., Monday
      const weekKey = `weekly_${dayName}`;

      // Helper function to increment a key
      async function increment(key) {
        const val = await env.USAGE_KV.get(key) || 0;
        await env.USAGE_KV.put(key, (parseInt(val) + 1).toString());
      }

      // 2. Run all increments
      await increment(todayKey);
      await increment(monthKey);
      await increment(weekKey);
      
      // Also keep your original total count if you want it
      const total = await env.USAGE_KV.get("gemini_count") || 0;
      await env.USAGE_KV.put("gemini_count", (parseInt(total) + 1).toString());

    } catch (kvErr) {
      console.log("KV Storage Error:", kvErr.message);
    }
    // --- ADVANCED KV COUNTER END ---

    const streamData = `data: ${JSON.stringify({ choices: [{ delta: { content: botText } }] })}\n\ndata: [DONE]\n\n`;
    
    return new Response(streamData, {
      headers: { "Content-Type": "text/event-stream" }
    });

  } catch (err) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "System Error: " + err.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }
}
