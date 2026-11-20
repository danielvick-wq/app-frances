import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

function normalizeAudioMimeType(rawMime?: string): string {
  if (!rawMime) return 'audio/webm';
  const base = rawMime.split(';')[0].trim().toLowerCase();
  const allowed = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp3'];
  return allowed.includes(base) ? base : 'audio/webm';
}

function stripDataUrlPrefix(dataUrlOrBase64: string): string {
  const commaIdx = dataUrlOrBase64.indexOf(',');
  if (dataUrlOrBase64.startsWith('data:') && commaIdx !== -1) {
    return dataUrlOrBase64.slice(commaIdx + 1).trim();
  }
  return dataUrlOrBase64.trim();
}

function formatGeminiErrorMessage(err: any): string {
  const msg = String(err?.message || '');
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'El servicio de análisis de voz tiene alta demanda temporal. Intenta nuevamente en unos segundos.';
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
  // CORS headers
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

    const {
      audioBase64,
      mimeType,
      targetText,
      targetIpa,
      category,
      audioMetrics,
    } = body || {};

    if (!targetText || typeof targetText !== 'string') {
      return res.status(400).json({ error: 'Se requiere la palabra o frase objetivo (targetText).' });
    }

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Se requiere la grabación de audio del estudiante.' });
    }

    const cleanBase64 = stripDataUrlPrefix(audioBase64);
    const cleanMime = normalizeAudioMimeType(mimeType);

    if (!cleanBase64 || cleanBase64.length < 100) {
      return res.status(400).json({ error: 'El audio grabado está vacío o es demasiado corto.' });
    }

    const systemInstruction = `Eres un fonetista clínico y logopeda especialista en corrección fonética del francés (FLE) para estudiantes hispanohablantes.
Escucha con máxima atención la grabación REAL del estudiante y compárala con la pronunciación francesa estándar de la palabra o frase objetivo.

Reglas estrictas de honestidad y rigor acústico:
1. Si en el audio solo hay silencio, ruido ambiental o no se distingue ninguna voz humana intentando pronunciar, marca isAudible: false, overallScore: 0, detectedIpa: "(sin voz detectada)", y explica amablemente que no se captó voz clara.
2. Si el estudiante SÍ habló, analiza acústicamente su voz real y diagnostica con precisión anatómica qué está haciendo bien y qué está haciendo mal físicamente:
   - Lengua: ¿La colocó demasiado atrás (posterior) o adelante (anterior)? ¿Tocó el paladar/alvéolos donde no debía (como decir "n" al final de una vocal nasal o una "r" vibrante española)?
   - Boca y Labios: ¿Está abriendo demasiado la boca o cerrándola demasiado? ¿Falta redondeo y proyección labial hacia adelante (labialización para [y], [ø], [œ], [ɔ̃])?
   - Velo del Paladar y Nasalidad: ¿Bajó el velo para resonar en la cavidad nasal sin pronunciar consonante "n"/"m" en [ɑ̃], [ɛ̃], [ɔ̃]? ¿O nasalizó una vocal que debía ser oral?
   - Acentuación y Ritmo: ¿Colocó el acento tónico en la última sílaba del grupo (ritmo oxítono francés) o acentuó como en español (palabra grave/llana)? ¿Pronunció letras finales mudas (-s, -t, -d, -x, -e caduc)?
   - Consonantes y Úvula: ¿Articuló la "R" francesa uvular [ʁ] en el fondo de la garganta o usó la "R" alveolar española? ¿Hizo correctamente la liaison o la vibración sonora [z]/[ʒ]?
3. Además de la explicación en español claro y didáctico, devuelve el objeto detectedPose para actualizar el diagrama anatómico sagital en pantalla reflejando la articulación REAL que detectaste en el audio del estudiante.
4. Sé conciso, concreto y accionable: evita relleno genérico.`;

    const promptText = `Evalúa la grabación adjunta del estudiante pronunciando en francés:
- Palabra/Frase objetivo: "${targetText}"
- AFI (IPA) objetivo de referencia: "${targetIpa || 'Determina el AFI estándar francés'}"
- Categoría fonética: "${category || 'General'}"
- Métricas espectrales captadas del micrófono: ${JSON.stringify(audioMetrics || {})}

Analiza el audio adjunto y responde estrictamente siguiendo el esquema JSON configurado.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        isAudible: {
          type: Type.BOOLEAN,
          description: 'True if human speech attempting the phrase was heard; false if silent or only noise.',
        },
        overallScore: { type: Type.NUMBER, description: 'Pronunciation score from 0 to 100' },
        detectedIpa: { type: Type.STRING, description: 'Approximate IPA transcription of what the student actually pronounced' },
        targetIpa: { type: Type.STRING, description: 'Correct standard French IPA transcription' },
        summaryFeedback: { type: Type.STRING, description: 'Clear 1-2 sentence overall diagnostic summary in Spanish' },
        anatomicalDiagnosis: {
          type: Type.OBJECT,
          properties: {
            tongue: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                description: { type: Type.STRING, description: 'Exact diagnosis of what the student did with their tongue' },
                targetPosition: { type: Type.STRING, description: 'Target anatomical tongue position' },
              },
              required: ['status', 'description', 'targetPosition'],
            },
            lipsAndMouth: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                description: { type: Type.STRING, description: 'Exact diagnosis of mouth opening and lip rounding' },
                targetPosition: { type: Type.STRING, description: 'Target lip and jaw configuration' },
              },
              required: ['status', 'description', 'targetPosition'],
            },
            nasalityAndVelum: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                description: { type: Type.STRING, description: 'Diagnosis of velum lowering, nasal resonance, or parasitic N/M' },
                targetPosition: { type: Type.STRING, description: 'Target velum and airflow configuration' },
              },
              required: ['status', 'description', 'targetPosition'],
            },
            accentuationAndRhythm: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                description: { type: Type.STRING, description: 'Diagnosis of oxytonic final stress and silent final letters' },
              },
              required: ['status', 'description'],
            },
            uvulaOrConsonants: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                description: { type: Type.STRING, description: 'Diagnosis of uvular R, liaisons, or consonants' },
              },
              required: ['status', 'description'],
            },
          },
          required: ['tongue', 'lipsAndMouth', 'nasalityAndVelum', 'accentuationAndRhythm', 'uvulaOrConsonants'],
        },
        detectedPose: {
          type: Type.OBJECT,
          description: 'Anatomical vocal tract pose detected from the student audio to drive the sagittal SVG diagram',
          properties: {
            tonguePosition: {
              type: Type.STRING,
              description: 'One of: front_high, front_mid, back_high, low_flat, alveolar_tap, uvular_back',
            },
            mouthOpening: {
              type: Type.STRING,
              description: 'One of: closed, medium, too_open',
            },
            lipShape: {
              type: Type.STRING,
              description: 'One of: rounded, spread, open, neutral',
            },
            velumLowered: {
              type: Type.BOOLEAN,
              description: 'True if nasal airflow was open (velum lowered), false if closed (oral)',
            },
          },
          required: ['tonguePosition', 'mouthOpening', 'lipShape', 'velumLowered'],
        },
        physicalExerciseTip: {
          type: Type.STRING,
          description: 'Step-by-step physical muscle exercise to fix the primary detected error',
        },
        commonMistakeExplanation: {
          type: Type.STRING,
          description: 'Why Spanish speakers commonly make this error on this French sound',
        },
        acousticFormantsAdvice: {
          type: Type.STRING,
          description: 'How to read the spectrogram F1 and F2 for this specific word',
        },
        recommendedExercises: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '2 to 3 French practice words targeting the exact phoneme',
        },
      },
      required: [
        'isAudible',
        'overallScore',
        'detectedIpa',
        'targetIpa',
        'summaryFeedback',
        'anatomicalDiagnosis',
        'detectedPose',
        'physicalExerciseTip',
        'commonMistakeExplanation',
        'acousticFormantsAdvice',
        'recommendedExercises',
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
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMime,
                  data: cleanBase64,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        if (response && response.text) {
          break; // successfully generated
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} failed, trying next fallback...`, err?.message);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo obtener respuesta del modelo de Gemini.');
    }

    const responseText = response.text.trim();
    const parsedData = JSON.parse(responseText);

    const normalizeStatus = (s: string): 'correct' | 'needs_adjustment' | 'incorrect' => {
      if (s === 'correct' || s === 'needs_adjustment' || s === 'incorrect') return s;
      return 'needs_adjustment';
    };

    if (parsedData.anatomicalDiagnosis) {
      const ad = parsedData.anatomicalDiagnosis;
      ad.tongue.status = normalizeStatus(ad.tongue.status);
      ad.lipsAndMouth.status = normalizeStatus(ad.lipsAndMouth.status);
      ad.nasalityAndVelum.status = normalizeStatus(ad.nasalityAndVelum.status);
      ad.accentuationAndRhythm.status = normalizeStatus(ad.accentuationAndRhythm.status);
      ad.uvulaOrConsonants.status = normalizeStatus(ad.uvulaOrConsonants.status);
    }

    parsedData.overallScore = Math.max(0, Math.min(100, Math.round(Number(parsedData.overallScore) || 0)));
    parsedData.timestamp = Date.now();

    return res.status(200).json(parsedData);
  } catch (err: any) {
    console.error('Error analyzing phonetics:', err);
    return res.status(500).json({
      error: 'Error al analizar la pronunciación fonética',
      details: formatGeminiErrorMessage(err),
    });
  }
}
