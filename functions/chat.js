// --- IDENTITY SHORTCUT HELPERS ---
// Matches short "who are you / who made you / are you gpt / are you gemini"
// style questions so they can be answered without ever calling Groq/Gemini.
// Kept deliberately narrow (short message + clear pattern) so real questions
// that merely mention "you" don't get hijacked.
function isIdentityQuestion(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim().replace(/[?!.]+$/g, "");

  // Only short messages qualify — avoids false-positives on longer real questions.
  if (t.split(/\s+/).length > 8) return false;

  const patterns = [
    /^(who|what)\s+(are|r)\s+(you|u)$/,
    /^(who|what)\s+(are|r)\s+(you|u)\s+(exactly|really)$/,
    /^tell me (who|what) (you are|u are)$/,
    /^(who|what)\s+made\s+(you|u)$/,
    /^(who|what)\s+created\s+(you|u)$/,
    /^(who|what)\s+built\s+(you|u)$/,
    /^(who|what)\s+developed\s+(you|u)$/,
    /^(who|what)('s| is)\s+your\s+(creator|maker|developer|owner|company)$/,
    /^what('s| is)\s+your\s+name$/,
    /^(are|r)\s+(you|u)\s+(chatgpt|gpt|gemini|claude|llama|groq|openai|google|meta|bard)$/,
    /^which\s+(ai|model|llm)\s+(are|r)\s+(you|u)$/,
    /^what\s+(ai|model|llm)\s+(are|r)\s+(you|u)$/,
    /^introduce yourself$/,
  ];

  return patterns.some((re) => re.test(t));
}

// Pool of varied identity responses — one is picked at random each time so
// replies don't look like a single hardcoded canned message.
const IDENTITY_REPLIES = [
  "I am Expoloom AI, a creation of the Expoloom Team. I am designed to assist and provide information to users in a helpful and effective manner.",
  "I'm Expoloom AI, built by the Expoloom Team. My purpose is to help you with information, tasks, and questions as effectively as I can.",
  "My name is Expoloom AI. The Expoloom Team created me to assist users like you with helpful, accurate, and efficient support.",
  "I go by Expoloom AI, developed by the Expoloom Team. I'm here to make finding information and getting things done easier for you.",
  "I'm Expoloom AI — a product of the Expoloom Team, designed to be a helpful assistant for whatever you need.",
  "You're talking to Expoloom AI, created and maintained by the Expoloom Team. I aim to be genuinely useful in every conversation.",
  "I am Expoloom AI, made by the Expoloom Team. I exist to help users with information, answers, and everyday tasks.",
  "Expoloom AI — that's me, brought to you by the Expoloom Team. I'm here to assist however I can.",
  "I'm Expoloom AI, an assistant developed by the Expoloom Team to help people find information and get things done efficiently.",
  "This is Expoloom AI speaking, created by the Expoloom Team. My job is to be a helpful, reliable assistant for you.",
];

function getRandomIdentityReply() {
  return IDENTITY_REPLIES[Math.floor(Math.random() * IDENTITY_REPLIES.length)];
}

// Emits the same SSE shape the frontend already expects from the
// Groq/Gemini streaming path, so no client changes are needed.
function streamLocalReply(text) {
  const encoder = new TextEncoder();
  const ssePayload = { choices: [{ delta: { content: text } }] };
  const body = `data: ${JSON.stringify(ssePayload)}\n\ndata: [DONE]\n\n`;
  return new Response(encoder.encode(body), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

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

  // Determine content type up front so auth failures can be reported in the
  // right format (JSON for voice transcription, SSE for chat).
  const contentType = request.headers.get("content-type") || "";
  const isVoiceRequest = contentType.includes("multipart/form-data");

  try {
    // --- SESSION AUTHORIZATION VALIDATION ---
    const authHeader = request.headers.get("Authorization");
    let userEmail = null;
    if (authHeader && env.SUPABASE_URL && env.SUPABASE_KEY) {
      const token = authHeader.replace("Bearer ", "");
      const verifyRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': env.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (!verifyRes.ok) {
        const authErr = "Unauthorized request. Please log in again.";
        if (isVoiceRequest) {
          return new Response(JSON.stringify({ error: authErr }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }
        throw new Error(authErr);
      }
      // Capture the email so we can log it with the request
      const userData = await verifyRes.json();
      userEmail = userData?.email || null;
    } else {
      const missingErr = "Missing authentication credentials.";
      if (isVoiceRequest) {
        return new Response(JSON.stringify({ error: missingErr }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }
      throw new Error(missingErr);
    }

    // VOICE TRANSCRIPTION — has its own error handler returning JSON (not SSE)
    if (isVoiceRequest) {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        
        if (!file) return new Response(JSON.stringify({ error: "No audio file received." }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        if (!env.GROQ_API_KEY) return new Response(JSON.stringify({ error: "GROQ_API_KEY missing from Cloudflare." }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

        const groqAudioData = new FormData();
        // Rename to .wav if webm not supported, Groq accepts both
        const fileName = file.name || "audio.webm";
        groqAudioData.append("file", file, fileName);
        groqAudioData.append("model", "whisper-large-v3-turbo");
        groqAudioData.append("language", "en");

        const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}` },
          body: groqAudioData
        });

        if (!groqResponse.ok) {
          const errText = await groqResponse.text();
          return new Response(JSON.stringify({ error: "Whisper API Error: " + errText }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        const result = await groqResponse.json();
        return new Response(JSON.stringify({ text: result.text || "" }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (audioErr) {
        return new Response(JSON.stringify({ error: "Transcription exception: " + audioErr.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }
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

    // 1b. IDENTITY SHORTCUT — answer "who are you / who made you" locally.
    // This never touches Groq or Gemini, so it costs 0 API input/output tokens
    // no matter how many users ask it or how large the system prompt is.
    const lastUserMsg = conversationHistory[conversationHistory.length - 1];
    const lastUserText = (lastUserMsg.content || lastUserMsg.parts?.[0]?.text || "").trim();

    if (isIdentityQuestion(lastUserText)) {
      return streamLocalReply(getRandomIdentityReply());
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
            body: JSON.stringify({ device_name: finalDeviceName, email: userEmail })
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
