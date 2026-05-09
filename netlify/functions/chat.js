export default async (req, context) => {
  const GEMINI_KEY = process.env.API_KEY;
  const GROQ_KEY = process.env.GROQ_API_KEY;

  try {
    const { messages, mode } = await req.json();

    if (mode === 'pro') {
      return new Response(JSON.stringify({ 
        candidates: [{ content: { role: "model", parts: [{ text: "Expoloom Pro is coming soon!" }] } }] 
      }), { headers: { "Content-Type": "application/json" } });
    }

    let groqModel = "";
    if (mode === 'ultrafast') groqModel = "llama-3.1-8b-instant";
    if (mode === 'fast') groqModel = "llama-3.3-70b-versatile";
    if (mode === 'thinking') groqModel = "qwen-2.5-32b"; 
    if (mode === 'coder') groqModel = "deepseek-r1-distill-qwen-32b";
    if (mode === 'deep-thinking') groqModel = "deepseek-r1-distill-llama-70b";

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
          stream: true 
        })
      });

      // This returns the stream directly to your index.html
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // Default to Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: messages })
    });
    
    const data = await geminiRes.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
                                                          
