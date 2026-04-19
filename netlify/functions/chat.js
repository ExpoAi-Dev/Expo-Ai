const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const API_KEY = process.env.API_KEY;
  
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "API_KEY is missing" }) };
  }

  try {
    const body = JSON.parse(event.body);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: body.messages })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("Google API Error:", JSON.stringify(data.error));
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Function Error:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
