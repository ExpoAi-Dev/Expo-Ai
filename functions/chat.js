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

        // --- ENHANCED KV COUNTER WITH PATNA DEVICE TRACKING ---
    try {
      // Create explicit Patna, Bihar local time
      const patnaDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      
      const dateStr = patnaDate.getFullYear() + '-' + String(patnaDate.getMonth() + 1).padStart(2, '0') + '-' + String(patnaDate.getDate()).padStart(2, '0');
      const hour = patnaDate.getHours(); 
      const dayOfMonth = patnaDate.getDate(); 
      const monthKey = `monthly_${patnaDate.getFullYear()}-${patnaDate.getMonth() + 1}`;
      
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = dayNames[patnaDate.getDay()];

      async function increment(key) {
        const val = await env.USAGE_KV.get(key) || 0;
        await env.USAGE_KV.put(key, (parseInt(val) + 1).toString());
      }

      // Standard graph tracking
      await increment(`daily_${dateStr}`);              
      await increment(`hourly_${dateStr}_${hour}`);     
      await increment(`weekly_${dayName}`);             
      await increment(`weekly_hourly_${dayName}_${hour}`); 
      await increment(monthKey);                        
      await increment(`daycount_${monthKey}_${dayOfMonth}`); 
      
      const total = await env.USAGE_KV.get("gemini_count") || 0;
      await env.USAGE_KV.put("gemini_count", (parseInt(total) + 1).toString());

      // DEVICE & ACCURATE LOG TRACKING
      const rawDevice = request.headers.get('user-agent') || 'Unknown Device';
      let deviceName = "PC / Laptop";
      if (rawDevice.includes('iPad')) deviceName = "iPad";
      else if (rawDevice.includes('iPhone')) deviceName = "iPhone";
      else if (rawDevice.includes('Android')) {
        deviceName = rawDevice.includes('Mobile') ? "Android Phone" : "Android Tablet";
      }

      const accurateTimeStr = patnaDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      // Fetch existing logs list for today, keep last 50 entries
      const logKey = `devicelogs_${dateStr}`;
      const existingLogsRaw = await env.USAGE_KV.get(logKey) || "[]";
      const logsArray = JSON.parse(existingLogsRaw);
      
      logsArray.unshift({ time: accurateTimeStr, device: deviceName });
      if (logsArray.length > 50) logsArray.pop(); // Keep it clean and optimized

      await env.USAGE_KV.put(logKey, JSON.stringify(logsArray));

    } catch (kvErr) {
      console.log("KV Storage Error:", kvErr.message);
    }
    // --- END ENHANCED COUNTER ---


    const streamData = `data: ${JSON.stringify({ choices: [{ delta: { content: botText } }] })}\n\ndata: [DONE]\n\n`;
    
    return new Response(streamData, {
      headers: { "Content-Type": "text/event-stream" }
    });

  } catch (err) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "System Error: " + err.message } }] }) + "\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  }
}
