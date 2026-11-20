const ttsCache = new Map<string, string>();
let activeAudioEl: HTMLAudioElement | null = null;

export function stopNativeFrench(): void {
  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl.currentTime = 0;
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function playWithBrowserSpeech(text: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      reject(new Error('Tu navegador no soporta síntesis de voz.'));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = rate;

    const voices = window.speechSynthesis.getVoices();
    const frenchVoice =
      voices.find((v) => v.lang === 'fr-FR') ||
      voices.find((v) => v.lang.toLowerCase().startsWith('fr'));
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function playAudioUrl(url: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    stopNativeFrench();
    const audio = new Audio(url);
    audio.playbackRate = rate;
    activeAudioEl = audio;

    audio.onended = () => {
      if (activeAudioEl === audio) activeAudioEl = null;
      resolve();
    };
    audio.onerror = () => {
      if (activeAudioEl === audio) activeAudioEl = null;
      reject(new Error('Error al reproducir el audio nativo.'));
    };

    audio.play().catch((err) => {
      if (activeAudioEl === audio) activeAudioEl = null;
      reject(err);
    });
  });
}

export async function playNativeFrench(text: string, rate: number = 1.0): Promise<void> {
  const normalized = text.trim();
  if (!normalized) return;

  stopNativeFrench();

  const isSlow = rate < 0.85;
  const cacheKey = `${normalized.toLowerCase()}::${isSlow ? 'slow' : 'normal'}`;

  const cachedUrl = ttsCache.get(cacheKey);
  if (cachedUrl) {
    try {
      await playAudioUrl(cachedUrl, 1.0);
      return;
    } catch {
      // fall through to fallback
    }
  }

  try {
    const response = await fetch('/api/french-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalized, slow: isSlow }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.audioBase64) {
        const binaryString = atob(data.audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        const objectUrl = URL.createObjectURL(blob);
        ttsCache.set(cacheKey, objectUrl);
        await playAudioUrl(objectUrl, 1.0);
        return;
      }
    }
  } catch {
    // Graceful fallback to browser speech synthesis
  }

  await playWithBrowserSpeech(normalized, rate);
}
