export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS Preflight checks for mobile requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // --- SESSION AUTHORIZATION VALIDATION ---
    const authHeader = request.headers.get("Authorization");
    if (authHeader && env.SUPABASE_URL && env.SUPABASE_KEY) {
      const token = authHeader.replace("Bearer ", "");
      const verifyRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (!verifyRes.ok) throw new Error("Unauthorized request. Please log in again.");
    } else {
      throw new Error("Missing authentication credentials.");
    }

    const contentType = request.headers.get("content-type") || "";
    
    // NEW BLOCK: Detect Voice Recording and send to Groq Whisper API
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      
      if (!file) throw new Error("No audio file provided.");
      if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing from Cloudflare.");

      const groqAudioData = new FormData();
      groqAudioData.append("file", file);
      groqAudioData.append("model", "whisper-large-v3-turbo");

      const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`
          // Fetch automatically sets the correct Content-Type boundary for FormData
        },
        body: groqAudioData
      });

      if (!groqResponse.ok) {
         const errText = await groqResponse.text();
         throw new Error("Whisper API Error: " + errText);
      }

      const result = await groqResponse.json();
      return new Response(JSON.stringify({ text: result.text }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // --- EXISTING CHAT LOGIC BELOW ---
    const { messages, mode } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Invalid messages array.");
    }

    // 1. EXTRACT SYSTEM PROMPT AND CLEAN/TRUNCATE HISTORY (Keep last 15 messages)
    let systemInstructionText = "Your name is Expoloom AI. You were created by the Expoloom Team. Always identify as Expoloom AI.";
    
    let conversationHistory = messages.filter(m => {
      if (m.role === "system") {
        const textContent = m.content || m.parts?.[0]?.text;
        if (textContent) systemInstructionText = textContent;
        return false; 
      }
      return true;
    });

    const maxHistory = 15;
    if (conversationHistory.length > maxHistory) {
      conversationHistory = conversationHistory.slice(-maxHistory);
    }

    if (conversationHistory.length === 0) {
      throw new Error("No valid message content found.");
    }

    // 2. SMART ROUTER: IMAGE GEN vs GROQ vs GEMINI
    const isGroq = mode === "ultrafast" || mode === "coder";
    const isImageGen = mode === "image_gen";
    
    let aiResponse;
    let base64ImageResponse = null;

    if (isImageGen) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      const prompt = lastMessage.content || lastMessage.parts?.[0]?.text || "";
      const encodedPrompt = encodeURIComponent(prompt);

      try {
        if (!env.POLLINATIONS_API_KEY) {
          throw new Error("POLLINATIONS_API_KEY variable is missing from Cloudflare.");
        }

        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
        
        const imageFetch = await fetch(pollinationsUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${env.POLLINATIONS_API_KEY}`
          }
        });
        
        if (!imageFetch.ok) throw new Error(`Image API error status: ${imageFetch.status}`);
        
        const arrayBuffer = await imageFetch.arrayBuffer();
        const buffer = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        base64ImageResponse = `data:image/jpeg;base64,${buffer}`;

      } catch (imageError) {
        throw new Error("Image generation failed. Please try again. " + imageError.message);
      }

    } else if (isGroq) {
      if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing from Cloudflare variables.");
      
      const groqModel = mode === "coder" ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant";
      
      const groqMessages = [
        { role: "system", content: systemInstructionText },
        ...conversationHistory.map(m => ({
          role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
          content: m.content || m.parts?.[0]?.text || ""
        }))
      ];

      aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groqModel,
          messages: groqMessages,
          stream: true
        })
      });

    } else {
      if (!env.API_KEY) throw new Error("API_KEY (Gemini) is missing.");

      const formattedMessages = conversationHistory.map(m => ({
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: m.content || m.parts?.[0]?.text || "" }]
      })).filter(m => m.parts[0].text.trim() !== "");

      aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${env.API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: formattedMessages,
            systemInstruction: { parts: [{ text: systemInstructionText }] }
          })
        }
      );
    }

    if (!isImageGen && !aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`${isGroq ? 'Groq' : 'Gemini'} API Error (${aiResponse.status}): ${errText}`);
    }

    // 3. BACKGROUND LOGGING TO SUPABASE
    try {
      const rawDevice = request.headers.get('user-agent') || 'Unknown Device';
      let deviceName = "PC / Laptop";
      if (rawDevice.includes('iPad')) deviceName = "iPad";
      else if (rawDevice.includes('iPhone')) deviceName = "iPhone";
      else if (rawDevice.includes('Android')) {
        deviceName = rawDevice.includes('Mobile') ? "Android Phone" : "Android Tablet";
      }

      let providerTag = "Gem Data";
      if (isGroq) providerTag = "G Data";
      if (isImageGen) providerTag = "Img Data";
      
      const finalDeviceName = `${deviceName} | ${providerTag}`;

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
            body: JSON.stringify({ device_name: finalDeviceName })
          }).catch(e => console.log("Supabase background log failed", e.message))
        );
      }
    } catch (sbErr) {
      console.log("Supabase configuration exception:", sbErr.message);
    }

    // 4. RETURN IMMEDIATELY FOR IMAGE GENERATION
    if (isImageGen) {
      return new Response(JSON.stringify({ image: base64ImageResponse }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // 5. TRANSFORMS GROQ & GEMINI TOKENS INTO COMPATIBLE SSE FORMAT
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder("utf-8");

    (async () => {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          if (isGroq) {
            let lines = buffer.split('\n');
            buffer = lines.pop(); 
            
            for (let line of lines) {
              line = line.trim();
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const parsed = JSON.parse(line.substring(6));
                  const textDelta = parsed.choices[0]?.delta?.content || "";
                  if (textDelta) {
                    const ssePayload = { choices: [{ delta: { content: textDelta } }] };
                    await writer.write(encoder.encode(`data: ${JSON.stringify(ssePayload)}\n\n`));
                  }
                } catch (e) {}
              }
            }
          } else {
            let match;
            while ((match = buffer.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/)) !== null) {
              let rawText = match[1];
              let cleanText = JSON.parse(`"${rawText}"`);

              if (cleanText) {
                const ssePayload = { choices: [{ delta: { content: cleanText } }] };
                await writer.write(encoder.encode(`data: ${JSON.stringify(ssePayload)}\n\n`));
              }
              buffer = buffer.substring(match.index + match[0].length);
            }
          }
        }
      } catch (streamErr) {
        const errPayload = { choices: [{ delta: { content: `\n[Stream Error: ${streamErr.message}]` } }] };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errPayload)}\n\n`));
      } finally {
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
