exports.handler = async (event) => {
  // This pulls the secret key from your Netlify Dashboard
  const API_KEY = process.env.API_KEY; 
  const body = JSON.parse(event.body);

  try {
    // This sends the request to Google Gemini from the server
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: body.messages })
    });

    const data = await response.json();
    
    // This sends the AI's answer back to your website
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "Expoloom AI is currently offline." }) 
    };
  }
};
      
