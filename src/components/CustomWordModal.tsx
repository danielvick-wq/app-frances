import React, { useEffect, useState } from 'react';
import { FrenchExercise } from '../types/phonetics';
import { X, Loader2 } from 'lucide-react';

interface CustomWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (exercise: FrenchExercise) => void;
}

const PRESET_CHALLENGES = [
  { word: 'un écureuil', translation: 'una ardilla', ipa: '/œ̃.n‿e.ky.ʁœj/', cat: 'Vocal [y] + [ʁ] + [œj]', sound: '[y] + [ʁ]', f1: 310, f2: 1880 },
  { word: 'la grenouille', translation: 'la rana', ipa: '/la ɡʁə.nuj/', cat: 'R Uvular + [uj]', sound: '[ʁ] + [uj]', f1: 330, f2: 1120 },
  { word: 'un croissant', translation: 'un cruasán', ipa: '/œ̃ kʁwa.sɑ̃/', cat: 'Nasal [ɑ̃] + R', sound: '[ʁ] + [ɑ̃]', f1: 640, f2: 1180 },
  { word: 'la boulangerie', translation: 'la panadería', ipa: '/la bu.lɑ̃.ʒʁi/', cat: 'Nasal [ɑ̃] + [ʒ]', sound: '[ɑ̃] + [ʒʁi]', f1: 620, f2: 1220 },
  { word: 'chuchoter', translation: 'susurrar', ipa: '/ʃy.ʃɔ.te/', cat: '[ʃ] + Vocal [y]', sound: '[ʃy]', f1: 280, f2: 1940 },
  { word: 'aujourd’hui', translation: 'hoy', ipa: '/o.ʒuʁ.dɥi/', cat: 'Semivocal [ɥ] + [ʁ]', sound: '[ʁ] + [ɥi]', f1: 270, f2: 2050 },
];

export const CustomWordModal: React.FC<CustomWordModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = word.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/phonetic-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: trimmed, translation: translation.trim() }),
      });

      if (response.ok) {
        const enrichedExercise: FrenchExercise = await response.json();
        onSubmit(enrichedExercise);
        setWord('');
        setTranslation('');
        onClose();
        return;
      }
    } catch {
      // Fall back to baseline custom exercise if phonetic guide endpoint fails
    } finally {
      setIsLoading(false);
    }

    onSubmit({
      id: `custom-${Date.now()}`,
      word: trimmed,
      translation: translation.trim() || 'Práctica libre en francés',
      ipa: `/${trimmed}/`,
      difficulty: 'Intermédiaire',
      category: 'Práctica libre',
      focusSound: '[ʁ]',
      focusDescription: 'Graba tu pronunciación para obtener el AFI exacto y el diagnóstico articulatorio.',
      articulatoryGuide: {
        tongue: 'Ajusta la lengua según las vocales y consonantes francesas de la frase.',
        lips: 'Aplica labialización en vocales redondeadas (u, eu, o, on).',
        jaw: 'Mantén una apertura controlada.',
        nasality: 'Baja el velo del paladar en vocales nasales (an, en, in, on, un).',
        stress: 'Coloca el acento tónico en la última sílaba del grupo.',
      },
      sampleTip: 'Escucha primero el modelo nativo y repite a ritmo constante.',
      targetFormants: { f1: 420, f2: 1680 },
    });
    setWord('');
    setTranslation('');
    onClose();
  };

  const handleSelectPreset = (preset: (typeof PRESET_CHALLENGES)[number]) => {
    onSubmit({
      id: `custom-preset-${Date.now()}`,
      word: preset.word,
      translation: preset.translation,
      ipa: preset.ipa,
      difficulty: 'Avancé',
      category: preset.cat,
      focusSound: preset.sound,
      focusDescription: `Reto fonético avanzado enfocado en ${preset.sound}.`,
      articulatoryGuide: {
        tongue: 'Coordina el paso preciso entre la articulación uvular y las vocales anteriores.',
        lips: 'Anticipa el redondeamiento labial en las sílabas redondeadas.',
        jaw: 'Ajusta la apertura mandibular en cada núcleo vocálico.',
        nasality: 'Verifica el descenso limpio del velo en vocales nasales.',
        stress: 'Acento oxítono marcado en la sílaba final.',
      },
      sampleTip: 'Escucha primero a velocidad 0.7x para percibir cada enlace.',
      targetFormants: { f1: preset.f1, f2: preset.f2 },
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-word-title"
        className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5"
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
          <h3 id="custom-word-title" className="text-base font-semibold text-slate-100">
            Practicar palabra o frase libre
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="custom-french-word" className="block text-xs font-medium text-slate-300 mb-1.5">
              Palabra o frase en francés
            </label>
            <input
              id="custom-french-word"
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="Ej: l'eau, je voudrais un café, le miroir..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="custom-french-translation" className="block text-xs font-medium text-slate-300 mb-1.5">
              Significado en español (opcional)
            </label>
            <input
              id="custom-french-translation"
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="Se completará automáticamente si lo dejas vacío"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={!word.trim() || isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generando transcripción AFI y formantes...</span>
              </>
            ) : (
              <span>Cargar en el laboratorio</span>
            )}
          </button>
        </form>

        {/* Preset French Pronunciation Challenges */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
          <p className="text-xs font-medium text-slate-400">
            O selecciona un reto fonético frecuente:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_CHALLENGES.map((preset) => (
              <button
                key={preset.word}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="p-2.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition-colors cursor-pointer"
              >
                <div className="font-semibold text-xs text-slate-100">{preset.word}</div>
                <div className="text-[11px] text-sky-400/90 font-mono mt-0.5">{preset.ipa}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
