const {GoogleGenAI} = require('@google/genai');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY || ''});
async function listModels() {
  try {
    const models = await ai.models.list();
    console.log('=== Available Gemini Models ===');
    for (const m of models.models || []) {
      const name = m.name || m.id || 'unknown';
      const displayName = m.displayName || '';
      console.log(`ID: ${name} | Display: ${displayName} | Description: ${m.description || ''}`);
    }
  } catch (err) {
    console.error('Error listing models:', err);
  }
}
listModels();