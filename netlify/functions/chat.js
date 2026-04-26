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
          candidates: [{ content: { role: "model", parts: [{ text: "Expoloom Pro is coming soon! Stay tuned for even more advanced features." }] } }]
        })
      };
    }

    // --- YOUR MULTI-MODEL PLAN MAPPING ---
    let groqModel = "";
    
    // Main Toggle Button
    if (mode === 'ultrafast') groqModel = "llama-3.1-8b-instant";
    if (mode === 'fast') groqModel = "llama-3.3-70b-versatile";
    
    // Special Sheet Options
    if (mode === 'thinking') groqModel = "qwen-qwq-32b"; 
    if (mode === 'coder') groqModel = "deepseek-r1-distill-qwen-32b";
    if (mode === 'deep-thinking') groqModel = "deepseek-r1-distill-llama-70b";

    // --- EXECUTE GROQ IF SELECTED ---
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
          }))
        })
      });

      const data = await response.json();
      
      // Formatting Groq response for your index.html
      return {
        statusCode: 200,
        body: JSON.stringify({
          candidates: [{
            content: {
              role: "model",
              parts: [{ text: data.choices[0].message.content }]
            }
          }]
        })
      };
    }

    // --- DEFAULT: GEMINI 2.5 FLASH (Standard Chat & Image Generation Prompting) ---
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: messages })
    });

    const data = await response.json();
    return {
      statusCode: response.ok ? 200 : response.status,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Function Error:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
