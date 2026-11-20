import { GoogleGenAI } from '@google/genai';

function formatGeminiErrorMessage(err: any): string {
  const msg = String(err?.message || '');
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'El servicio de voz tiene alta demanda temporal.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Límite temporal alcanzado en la API.';
  }
  return msg || 'Error interno del servidor';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utiliza POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'TTS fallback required',
      details: 'Falta la clave GEMINI_API_KEY.',
    });
  }

  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
  });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // keep as is
      }
    }

    const { text, slow = false } = body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Se requiere texto en francés.' });
    }

    const cleanText = text.trim().slice(0, 180);

    const candidateModels = ['gemini-3.8-flash-lite-tts'];
    let base64Audio: string | undefined;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText,
                  speechMetadata: {
                    style: slow
                      ? 'Native Parisian French phonetics teacher speaking slowly, clearly, and articulately'
                      : 'Native Parisian French speaker with natural, crisp standard pronunciation',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });

        base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`TTS Model ${model} failed, trying fallback...`, err?.message);
      }
    }

    if (base64Audio) {
      return res.status(200).json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    }

    return res.status(502).json({
      error: 'TTS fallback required',
      details: formatGeminiErrorMessage(lastError),
    });
  } catch (err: any) {
    console.error('Error in Gemini TTS:', err);
    return res.status(500).json({
      error: 'TTS fallback required',
      details: formatGeminiErrorMessage(err),
    });
  }
}
