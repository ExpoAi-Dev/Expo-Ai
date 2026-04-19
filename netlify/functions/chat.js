const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const API_KEY = process.env.API_KEY;
  
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "API_KEY is missing in Netlify settings" }) };
  }

  try {
    const { messages } = JSON.parse(event.body);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: messages })
    });

    const data = await response.json();
    
    // This will print the actual error from Google to your black screen!
    if (data.error) {
      console.error("Google API Error:", data.error);
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Function Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
