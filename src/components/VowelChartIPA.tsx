import React, { useState } from 'react';
import { Volume2, ArrowUpRight, Loader2 } from 'lucide-react';
import { playNativeFrench } from '../utils/frenchAudio';

interface VowelChartIPAProps {
  currentSound: string;
  onPracticeWord?: (word: string) => void;
}

interface VowelItem {
  symbol: string;
  example: string;
  translation: string;
  name: string;
  cue: string;
  type: 'oral' | 'nasal';
  rounded: boolean;
  x: number;
  y: number;
}

const FRENCH_VOWELS: VowelItem[] = [
  { symbol: 'i', example: 'lit', translation: 'cama', name: 'Anterior cerrada no redondeada', cue: 'Lengua muy adelante y alta, labios en sonrisa tensa.', type: 'oral', rounded: false, x: 16, y: 18 },
  { symbol: 'y', example: 'tu', translation: 'tú', name: 'Anterior cerrada redondeada', cue: 'Lengua en posición de [i], labios proyectados en círculo cerrado.', type: 'oral', rounded: true, x: 37, y: 18 },
  { symbol: 'u', example: 'tout', translation: 'todo', name: 'Posterior cerrada redondeada', cue: 'Lengua retraída atrás, labios redondeados.', type: 'oral', rounded: true, x: 86, y: 18 },

  { symbol: 'e', example: 'été', translation: 'verano', name: 'Anterior semicerrada', cue: 'Lengua adelante media-alta, labios ligeramente estirados.', type: 'oral', rounded: false, x: 25, y: 40 },
  { symbol: 'ø', example: 'deux', translation: 'dos', name: 'Anterior semicerrada redondeada', cue: 'Lengua de [e] cerrada con labios redondeados como en [o].', type: 'oral', rounded: true, x: 45, y: 40 },
  { symbol: 'o', example: 'beau', translation: 'bello', name: 'Posterior semicerrada redondeada', cue: 'Lengua atrás, labios muy redondeados y cerrados.', type: 'oral', rounded: true, x: 84, y: 40 },

  { symbol: 'ə', example: 'le', translation: 'el', name: 'Vocal central neutra (e caduc)', cue: 'Lengua relajada en el centro, labios levemente redondeados.', type: 'oral', rounded: true, x: 58, y: 51 },

  { symbol: 'ɛ', example: 'fête', translation: 'fiesta', name: 'Anterior semiabierta', cue: 'Mandíbula más baja que en [e], lengua plana adelante.', type: 'oral', rounded: false, x: 32, y: 65 },
  { symbol: 'œ', example: 'sœur', translation: 'hermana', name: 'Anterior semiabierta redondeada', cue: 'Lengua de [ɛ] abierta con labios redondeados en óvalo.', type: 'oral', rounded: true, x: 50, y: 65 },
  { symbol: 'ɔ', example: 'porte', translation: 'puerta', name: 'Posterior semiabierta redondeada', cue: 'Boca más abierta que en [o], labios redondeados.', type: 'oral', rounded: true, x: 82, y: 65 },

  { symbol: 'ɛ̃', example: 'pain', translation: 'pan', name: 'Nasal anterior abierta', cue: 'Velo descendido, labios en media sonrisa, sin consonante "N".', type: 'nasal', rounded: false, x: 37, y: 80 },
  { symbol: 'ɔ̃', example: 'bon', translation: 'bueno', name: 'Nasal posterior redondeada', cue: 'Velo descendido, labios en "o" cerrada, sin tocar el paladar.', type: 'nasal', rounded: true, x: 76, y: 78 },
  { symbol: 'ɑ̃', example: 'vent', translation: 'viento', name: 'Nasal posterior abierta', cue: 'La nasal más abierta: mandíbula baja y aire por la nariz.', type: 'nasal', rounded: true, x: 67, y: 92 },

  { symbol: 'a', example: 'chat', translation: 'gato', name: 'Abierta anterior oral', cue: 'Boca abierta, lengua plana y baja, 100% oral.', type: 'oral', rounded: false, x: 48, y: 92 },
];

export const VowelChartIPA: React.FC<VowelChartIPAProps> = ({
  currentSound,
  onPracticeWord,
}) => {
  const [selectedVowel, setSelectedVowel] = useState<VowelItem>(
    () => FRENCH_VOWELS.find((v) => currentSound.includes(v.symbol)) || FRENCH_VOWELS[1]
  );
  const [playingSymbol, setPlayingSymbol] = useState<string | null>(null);

  const handleVowelClick = async (vowel: VowelItem) => {
    setSelectedVowel(vowel);
    setPlayingSymbol(vowel.symbol);
    try {
      await playNativeFrench(vowel.example, 0.9);
    } finally {
      setPlayingSymbol(null);
    }
  };

  return (
    <section
      id="trapecio"
      className="bg-[#111827] border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between h-full"
    >
      <div className="pb-3.5 border-b border-slate-800/80">
        <h3 className="text-sm font-semibold text-slate-100">
          Trapecio vocálico interactivo del francés (AFI)
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Pulsa cualquier vocal para escuchar su modelo nativo y consultar su articulación
        </p>
      </div>

      {/* Trapezoid Plot */}
      <div className="relative w-full h-[250px] bg-[#090D16] rounded-xl border border-slate-800 mt-4 overflow-hidden">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points="14,16 88,16 74,94 46,94"
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth="0.7"
          />
          <line x1="23" y1="40" x2="85" y2="40" stroke="rgba(148, 163, 184, 0.08)" strokeWidth="0.5" strokeDasharray="1.2,1.2" />
          <line x1="31" y1="65" x2="82" y2="65" stroke="rgba(148, 163, 184, 0.08)" strokeWidth="0.5" strokeDasharray="1.2,1.2" />
          <line x1="16" y1="18" x2="37" y2="18" stroke="#38bdf8" strokeWidth="0.7" strokeDasharray="1.2,1.2" />
          <line x1="37" y1="18" x2="86" y2="18" stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="1.2,1.2" />
        </svg>

        <div className="absolute top-1.5 left-2.5 text-[10px] font-mono text-sky-400/85">
          ← Anterior (lengua adelante)
        </div>
        <div className="absolute top-1.5 right-2.5 text-[10px] font-mono text-amber-400/85">
          Posterior (lengua atrás) →
        </div>
        <div className="absolute bottom-1.5 left-2.5 text-[10px] font-mono text-slate-500">
          ↓ Mandíbula abierta
        </div>

        {FRENCH_VOWELS.map((v) => {
          const isFocus = currentSound.includes(v.symbol);
          const isSelected = selectedVowel.symbol === v.symbol;
          const isPlaying = playingSymbol === v.symbol;

          return (
            <button
              key={v.symbol}
              type="button"
              onClick={() => handleVowelClick(v)}
              style={{
                left: `${v.x}%`,
                top: `${v.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              title={`Escuchar [${v.symbol}] en "${v.example}" (${v.name})`}
              className={`absolute rounded-lg px-1.5 py-0.5 border transition-transform cursor-pointer flex flex-col items-center leading-tight ${
                isFocus || isSelected
                  ? 'z-20 scale-110 bg-sky-600 text-white border-sky-300'
                  : v.type === 'nasal'
                  ? 'z-10 hover:scale-105 bg-amber-950/75 border-amber-500/45 text-amber-200'
                  : v.rounded
                  ? 'z-10 hover:scale-105 bg-slate-800 border-sky-500/40 text-sky-200'
                  : 'z-10 hover:scale-105 bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <span className="font-mono text-xs font-bold flex items-center gap-0.5">
                {isPlaying ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : `[${v.symbol}]`}
              </span>
              <span className={`text-[9px] ${isFocus || isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                {v.example}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Vowel Contextual Inspector */}
      <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs">
            <span className="font-mono font-bold text-sky-400 text-sm mr-2">[{selectedVowel.symbol}]</span>
            <span className="font-semibold text-slate-100">{selectedVowel.example}</span>
            <span className="text-slate-400"> ({selectedVowel.translation}) · {selectedVowel.name}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleVowelClick(selectedVowel)}
              className="p-1.5 rounded-md bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-sky-400 transition-colors cursor-pointer"
              aria-label={`Escuchar ${selectedVowel.example}`}
              title="Escuchar ejemplo"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
            {onPracticeWord && (
              <button
                type="button"
                onClick={() => onPracticeWord(selectedVowel.example)}
                className="px-2.5 py-1.5 rounded-md bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Practicar</span>
                <ArrowUpRight className="w-3 h-3 text-sky-400" />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{selectedVowel.cue}</p>

        {/* Compact Unboxed Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-xs bg-slate-700 border border-slate-500" />
            No redondeada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-xs bg-sky-500/40 border border-sky-400" />
            Labios redondeados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-xs bg-amber-500/40 border border-amber-400" />
            Vocal nasal
          </span>
        </div>
      </div>
    </section>
  );
};
