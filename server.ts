import express from 'express';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

// Body parser with 50mb limit for audio payloads
app.use(express.json({ limit: '50mb' }));

// Shared Gemini client instance with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1beta',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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

async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.code;
      const msg = String(err?.message || '');
      const isTransient =
        status === 503 ||
        status === 500 ||
        status === 429 ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand');

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 750 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function formatGeminiErrorMessage(err: any): string {
  const msg = String(err?.message || '');
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'El servicio de análisis de voz tiene alta demanda temporal. Intenta nuevamente en unos segundos.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Se alcanzó el límite temporal de solicitudes. Espera unos segundos e inténtalo de nuevo.';
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
    return 'Clave API de Gemini inválida o sin permisos. Verifica la configuración del proyecto.';
  }
  return msg || 'Error interno del servidor';
}

// API Route 1: Analyze Student French Pronunciation from Microphone Audio
app.post(['/api/analyze-phonetics', '/analyze-phonetics'], async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType,
      targetText,
      targetIpa,
      category,
      audioMetrics,
    } = req.body;

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

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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
        responseSchema: {
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
                    description: { type: Type.STRING, description: 'Exact diagnosis of mouth opening (too open / too closed) and lip rounding' },
                    targetPosition: { type: Type.STRING, description: 'Target lip and jaw configuration' },
                  },
                  required: ['status', 'description', 'targetPosition'],
                },
                nasalityAndVelum: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                    description: { type: Type.STRING, description: 'Diagnosis of velum lowering, nasal resonance, or parasitic N/M consonant' },
                    targetPosition: { type: Type.STRING, description: 'Target velum and airflow configuration' },
                  },
                  required: ['status', 'description', 'targetPosition'],
                },
                accentuationAndRhythm: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                    description: { type: Type.STRING, description: 'Diagnosis of oxytonic final stress, rhythm, and silent final letters' },
                  },
                  required: ['status', 'description'],
                },
                uvulaOrConsonants: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING, description: 'correct, needs_adjustment, or incorrect' },
                    description: { type: Type.STRING, description: 'Diagnosis of uvular R [ʁ], liaisons, voiced sibilants [z]/[ʒ], or consonants' },
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
              description: 'How to read the spectrogram F1 (mouth opening) and F2 (tongue position) for this specific word',
            },
            recommendedExercises: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 3 French practice words targeting the exact phoneme that needs reinforcement',
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
        },
      },
    }));

    const responseText = (response.text || '{}').trim();
    const parsedData = JSON.parse(responseText);

    // Clamp score safely and normalize status values
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

    return res.json(parsedData);
  } catch (err: any) {
    console.error('Error analyzing phonetics:', err);
    return res.status(500).json({
      error: 'Error al analizar la pronunciación fonética',
      details: formatGeminiErrorMessage(err),
    });
  }
});

// API Route 2: Generate Phonetic Guide (IPA, Formants & Articulatory Targets) for Custom French Words
app.post(['/api/phonetic-guide', '/phonetic-guide'], async (req, res) => {
  try {
    const { word, translation } = req.body;
    if (!word || typeof word !== 'string' || !word.trim()) {
      return res.status(400).json({ error: 'Se requiere una palabra o frase en francés.' });
    }

    const cleanWord = word.trim().slice(0, 120);

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
      contents: `Genera la ficha fonética técnica del francés estándar para: "${cleanWord}"${translation ? ` (significado sugerido: "${translation}")` : ''}.
Incluye la transcripción AFI precisa, traducción al español, fonema más difícil para hispanohablantes, guía articulatoria (lengua, labios, mandíbula, nasalidad, acento) y formantes vocálicos F1 y F2 objetivo en Hz del núcleo vocálico principal.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
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
        },
      },
    }));

    const data = JSON.parse((response.text || '{}').trim());
    const validDiff = ['Débutant', 'Intermédiaire', 'Avancé'].includes(data.difficulty)
      ? data.difficulty
      : 'Intermédiaire';

    return res.json({
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
});

// API Route 3: Generate Native French Reference Speech using Gemini 3.8 Flash Lite TTS
app.post(['/api/french-tts', '/french-tts'], async (req, res) => {
  try {
    const { text, slow = false } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Se requiere texto en francés.' });
    }

    const cleanText = text.trim().slice(0, 180);

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
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
      })
    );

    // Unary Gemini 3.8 TTS returns a complete WAV file (audio/wav, 24kHz mono 16-bit)
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    }
    return res.status(502).json({ error: 'El modelo TTS no devolvió audio.' });
  } catch (err: any) {
    console.error('Error in Gemini TTS:', err);
    return res.status(500).json({ error: 'TTS fallback required', details: formatGeminiErrorMessage(err) });
  }
});

// Setup Vite dev server or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
