export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS Preflight if needed
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (!env.API_KEY) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "Error: API_KEY is missing." } }] }) + "\n\ndata: [DONE]\n\n", { 
      headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" } 
    });
  }

  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Invalid messages payload.");
    }

    // 1. EXTRACT SYSTEM PROMPT & TRUNCATE HISTORY (Keep last 15 messages)
    let systemInstructionText = "Your name is Expoloom AI. You were created by the Expoloom Team. Always identify as Expoloom AI and never as a Google model.";
    
    // Filter out any incoming custom system roles from the structural history tracking
    let conversationHistory = messages.filter(m => {
      if (m.role === "system") {
        const textContent = m.content || m.parts?.[0]?.text;
        if (textContent) systemInstructionText = textContent;
        return false; // Remove from structural contents array
      }
      return true;
    });

    // Truncate payload safely to prevent exceeding token limits or causing payload bloat
    const maxHistory = 15;
    if (conversationHistory.length > maxHistory) {
      conversationHistory = conversationHistory.slice(-maxHistory);
    }

    // 2. MAP TO STRICT GEMINI STRUCTURE
    const formattedMessages = conversationHistory.map(m => {
      // Normalize roles to user/model
      const rawRole = m.role === "assistant" ? "model" : m.role;
      const cleanRole = rawRole === "model" ? "model" : "user";
      
      // Handle potential variation in incoming payload keys safely
      const messageText = m.parts?.[0]?.text || m.content || "";

      return {
        role: cleanRole,
        parts: [{ text: messageText }]
      };
    }).filter(m => m.parts[0].text.trim() !== "");

    if (formattedMessages.length === 0) {
      throw new Error("No valid message content available to send.");
    }

    // 3. BUILD GEMINI STREAMING REQUEST
    const payload = {
      contents: formattedMessages,
      systemInstruction: {
        parts: [{ text: systemInstructionText }]
      }
    };

    // Calling streamGenerateContent endpoint instead of standard generateContent
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${env.API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Google API Error (${geminiResponse.status}): ${errText}`);
    }

    // 4. SUPABASE BACKGROUND LOGGING (Fire & Forget / Non-blocking)
    try {
      const rawDevice = request.headers.get('user-agent') || 'Unknown Device';
      let deviceName = "PC / Laptop";
      if (rawDevice.includes('iPad')) deviceName = "iPad";
      else if (rawDevice.includes('iPhone')) deviceName = "iPhone";
      else if (rawDevice.includes('Android')) {
        deviceName = rawDevice.includes('Mobile') ? "Android Phone" : "Android Tablet";
      }

      if (env.SUPABASE_URL && env.SUPABASE_KEY) {
        context.waitUntil(
          fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_logs`, {
            method: 'POST',
            headers: {
              'apikey': env.SUPABASE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ device_name: deviceName })
          }).catch(e => console.log("Supabase background log failed", e.message))
        );
      }
    } catch (sbErr) {
      console.log("Supabase setup error:", sbErr.message);
    }

    // 5. TRUE SERVER-SENT EVENTS (SSE) STREAM TRANSFORM
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();

    // Process stream asynchronously so the worker returns the response stream immediately
    (async () => {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Gemini returns JSON arrays or streaming chunks enclosed in brackets.
          // We break it down dynamically by parsing complete JSON objects safely.
          // Since it's a JSON array token stream, we handle incoming objects clean.
          let match;
          // Look for complete JSON objects in the stream array
          while ((match = buffer.match(/^[\s,]*(\{[\s\S]*?\})/)) !== null) {
            const jsonString = match[1];
            buffer = buffer.substring(match[0].length);

            try {
              const chunkData = JSON.parse(jsonString);
              const textChunk = chunkData.candidates?.[0]?.content?.parts?.[0]?.text || "";
              
              if (textChunk) {
                // Map the output directly to match your frontend SSE expectations: data: {"choices":[{"delta":{"content":"..."}}]}
                const ssePayload = {
                  choices: [{ delta: { content: textChunk } }]
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(ssePayload)}\n\n`));
              }
            } catch (e) {
              // Fragment handling: if JSON is incomplete, break loop and wait for more data chunks
            }
          }
        }
      } catch (streamErr) {
        const errPayload = { choices: [{ delta: { content: `\n[Stream Error: ${streamErr.message}]` } }] };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errPayload)}\n\n`));
      } finally {
        // Always send final closure token to signal frontend to stop tracking chunks
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: "System Error: " + err.message } }] }) + "\n\ndata: [DONE]\n\n", { 
      headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" } 
    });
  }
}
