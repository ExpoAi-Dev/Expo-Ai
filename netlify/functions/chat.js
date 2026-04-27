const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const GEMINI_KEY = process.env.API_KEY;
  const GROQ_KEY = process.env.GROQ_API_KEY;

  try {
    const body = JSON.parse(event.body);
    const { messages, mode } = body;

    // 1. PRO MODE (Coming Soon)
    if (mode === 'pro') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          candidates: [{ content: { role: "model", parts: [{ text: "Expoloom Pro is coming soon! Stay tuned." }] } }]
        })
      };
    }

    // --- MAP MODELS TO YOUR PLAN ---
    let groqModel = "";
    if (mode === 'ultrafast') groqModel = "llama-3.1-8b-instant";
    if (mode === 'fast') groqModel = "llama-3.3-70b-versatile";
    if (mode === 'thinking') groqModel = "qwen-2.5-32b"; 
    if (mode === 'coder') groqModel = "deepseek-r1-distill-qwen-32b";
    if (mode === 'deep-thinking') groqModel = "deepseek-r1-distill-llama-70b";

    // --- EXECUTE GROQ WITH STREAMING ---
    if (groqModel) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groqModel,
          messages: messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts[0].text
          })),
          stream: true // CRITICAL: This enables the word-by-word flow
        })
      });

      // Pass the stream directly from Groq to your index.html
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        },
        body: response.body
      };
    }

    // --- DEFAULT: GEMINI 2.5 FLASH (Standard & Image Gen) ---
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: messages })
    });

    const data = await geminiRes.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Expoloom AI Error: " + error.message })
    };
  }
};
