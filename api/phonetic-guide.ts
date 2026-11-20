import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

function formatGeminiErrorMessage(err: any): string {
  const msg = String(err?.message || '');
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'El servicio de análisis tiene alta demanda temporal. Intenta nuevamente en unos segundos.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Se alcanzó el límite temporal de solicitudes. Espera unos segundos e inténtalo de nuevo.';
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('API key not valid')) {
    return 'Clave API de Gemini inválida o sin permisos. Verifica la configuración en Vercel.';
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
      error: 'Falta la clave GEMINI_API_KEY.',
      details: 'No se encontró la variable GEMINI_API_KEY en Vercel. Ve a Settings > Environment Variables y agrégala.',
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

    const { word, translation } = body || {};
    if (!word || typeof word !== 'string' || !word.trim()) {
      return res.status(400).json({ error: 'Se requiere una palabra o frase en francés.' });
    }

    const cleanWord = word.trim().slice(0, 120);

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        translation: { type: Type.STRING },
        ipa: { type: Type.STRING },
        difficulty: { type: Type.STRING, description: 'Débutant, Intermédiaire, or Avancé' },
        category: { type: Type.STRING },
        focusSound: { type: Type.STRING, description: 'Primary target IPA sound in brackets e.g. [y], [ɑ̃], [ʁ]' },
        focusDescription: { type: Type.STRING },
        articulatoryGuide: {
          type: Type.OBJECT,
          properties: {
            tongue: { type: Type.STRING },
            lips: { type: Type.STRING },
            jaw: { type: Type.STRING },
            nasality: { type: Type.STRING },
            stress: { type: Type.STRING },
          },
          required: ['tongue', 'lips', 'jaw', 'nasality', 'stress'],
        },
        sampleTip: { type: Type.STRING },
        targetFormants: {
          type: Type.OBJECT,
          properties: {
            f1: { type: Type.NUMBER, description: 'Target F1 formant in Hz (250-850)' },
            f2: { type: Type.NUMBER, description: 'Target F2 formant in Hz (750-2400)' },
          },
          required: ['f1', 'f2'],
        },
      },
      required: [
        'translation',
        'ipa',
        'difficulty',
        'category',
        'focusSound',
        'focusDescription',
        'articulatoryGuide',
        'sampleTip',
        'targetFormants',
      ],
    };

    // Gemini 4 generation models
    const candidateModels = ['gemini-4-hydrogen', 'gemini-4-neon'];
    let response: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: `Genera la ficha fonética técnica del francés estándar para: "${cleanWord}"${translation ? ` (significado sugerido: "${translation}")` : ''}.
Incluye la transcripción AFI precisa, traducción al español, fonema más difícil para hispanohablantes, guía articulatoria (lengua, labios, mandíbula, nasalidad, acento) y formantes vocálicos F1 y F2 objetivo en Hz del núcleo vocálico principal.`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next fallback...`, err?.message);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo generar la ficha fonética.');
    }

    const data = JSON.parse(response.text.trim());
    const validDiff = ['Débutant', 'Intermédiaire', 'Avancé'].includes(data.difficulty)
      ? data.difficulty
      : 'Intermédiaire';

    return res.status(200).json({
      id: `custom-${Date.now()}`,
      word: cleanWord,
      translation: translation?.trim() || data.translation || 'Frase en francés',
      ipa: data.ipa || `/${cleanWord}/`,
      difficulty: validDiff,
      category: data.category || 'Práctica Libre',
      focusSound: data.focusSound || '[ʁ]',
      focusDescription: data.focusDescription || 'Práctica personalizada de articulación francesa.',
      articulatoryGuide: data.articulatoryGuide,
      sampleTip: data.sampleTip,
      targetFormants: {
        f1: Math.max(220, Math.min(900, Math.round(data.targetFormants?.f1 || 400))),
        f2: Math.max(700, Math.min(2500, Math.round(data.targetFormants?.f2 || 1650))),
      },
    });
  } catch (err: any) {
    console.error('Error generating phonetic guide:', err);
    return res.status(500).json({
      error: 'No se pudo generar la ficha fonética',
      details: formatGeminiErrorMessage(err),
    });
  }
}
