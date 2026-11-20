import React, { useEffect, useState } from 'react';
import {
  ArticulatoryDiagnosis,
  DetectedArticulatoryPose,
  DiagnosisStatus,
  FrenchExercise,
} from '../types/phonetics';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

interface ArticulatoryDiagramProps {
  exercise: FrenchExercise;
  diagnosis?: ArticulatoryDiagnosis | null;
  detectedPose?: DetectedArticulatoryPose | null;
}

const TONGUE_PATHS: Record<string, string> = {
  neutral: 'M 192 292 Q 232 252 280 242 Q 320 238 358 272 Q 378 320 370 362 L 260 362 Z',
  front_high: 'M 196 296 Q 232 206 270 188 Q 302 212 332 292 Q 360 330 362 362 L 260 362 Z',
  front_mid: 'M 196 296 Q 236 226 274 212 Q 312 242 344 294 Q 364 332 364 362 L 260 362 Z',
  back_high: 'M 206 316 Q 242 292 282 260 Q 326 194 352 240 Q 372 310 370 362 L 260 362 Z',
  low_flat: 'M 198 324 Q 248 312 290 294 Q 332 268 354 314 Q 368 342 366 362 L 260 362 Z',
  alveolar_tap: 'M 194 238 Q 228 248 272 250 Q 312 262 344 302 Q 366 332 366 362 L 260 362 Z',
  uvular_back: 'M 200 312 Q 240 282 272 260 Q 322 184 348 202 Q 366 290 366 362 L 260 362 Z',
};

export const ArticulatoryDiagram: React.FC<ArticulatoryDiagramProps> = ({
  exercise,
  diagnosis,
  detectedPose,
}) => {
  const [viewMode, setViewMode] = useState<'ideal' | 'student'>('ideal');
  const [activeHotspot, setActiveHotspot] = useState<'tongue' | 'lips' | 'velum' | 'uvula'>('tongue');

  // Auto-switch to student articulation view when a fresh diagnosis arrives, and reset on exercise switch
  useEffect(() => {
    if (diagnosis) {
      setViewMode('student');
    } else {
      setViewMode('ideal');
    }
  }, [diagnosis, exercise.id]);

  // Determine ideal articulatory parameters for the active French exercise
  const isUvularR = exercise.focusSound.includes('ʁ') || exercise.category.includes('R Uvular');
  const isFrenchU = exercise.focusSound.includes('y');
  const isFrenchOU = exercise.focusSound.includes('u') && !exercise.focusSound.includes('y');
  const isNasal = exercise.category.includes('Nasal') || exercise.focusSound.includes('̃');
  const isEU = exercise.focusSound.includes('ø') || exercise.focusSound.includes('œ');

  let idealTongueKey: keyof typeof TONGUE_PATHS = 'neutral';
  let idealVelumLowered = false;
  let idealLipShape: 'rounded' | 'spread' | 'open' | 'neutral' = 'neutral';
  let idealMouthOpening: 'closed' | 'medium' | 'too_open' = 'medium';
  let tongueTipLabel = 'Punta baja apoyada tras los incisivos inferiores';
  let tongueDorsumLabel = 'Dorso en posición neutra';

  if (isFrenchU) {
    idealTongueKey = 'front_high';
    idealLipShape = 'rounded';
    idealMouthOpening = 'closed';
    tongueTipLabel = 'Punta firme contra los incisivos inferiores';
    tongueDorsumLabel = 'Dorso anterior elevado hacia el paladar duro';
  } else if (isFrenchOU) {
    idealTongueKey = 'back_high';
    idealLipShape = 'rounded';
    idealMouthOpening = 'closed';
    tongueTipLabel = 'Punta retraída lejos de los dientes';
    tongueDorsumLabel = 'Dorso posterior elevado hacia el paladar blando';
  } else if (isNasal) {
    idealVelumLowered = true;
    if (exercise.focusSound.includes('ɑ̃')) {
      idealTongueKey = 'low_flat';
      idealLipShape = 'open';
      idealMouthOpening = 'medium';
      tongueTipLabel = 'Lengua plana y baja sin tocar el paladar';
      tongueDorsumLabel = 'Apertura vertical amplia con resonancia nasal';
    } else if (exercise.focusSound.includes('ɛ̃')) {
      idealTongueKey = 'front_mid';
      idealLipShape = 'spread';
      idealMouthOpening = 'medium';
      tongueTipLabel = 'Lengua adelantada sin cierre alveolar';
      tongueDorsumLabel = 'Labios en media sonrisa, flujo oral y nasal simultáneo';
    } else {
      idealTongueKey = 'back_high';
      idealLipShape = 'rounded';
      idealMouthOpening = 'closed';
      tongueTipLabel = 'Lengua atrás, sin articular consonante "N"';
      tongueDorsumLabel = 'Labios redondeados con velo descendido';
    }
  } else if (isUvularR) {
    idealTongueKey = 'uvular_back';
    idealLipShape = 'neutral';
    idealMouthOpening = 'medium';
    tongueTipLabel = 'Punta inmóvil abajo (sin vibrar en dientes)';
    tongueDorsumLabel = 'Fricción suave entre el dorso posterior y la úvula';
  } else if (isEU) {
    idealTongueKey = 'front_mid';
    idealLipShape = 'rounded';
    idealMouthOpening = exercise.focusSound.includes('œ') ? 'medium' : 'closed';
    tongueTipLabel = 'Lengua en posición de [e]/[ɛ] anterior';
    tongueDorsumLabel = 'Vocal anterior con labialización marcada';
  }

  // Resolve active pose (ideal vs student's actual detected pose from Gemini)
  let activeTonguePath = TONGUE_PATHS[idealTongueKey];
  let activeVelumLowered = idealVelumLowered;
  let activeLipShape: 'rounded' | 'spread' | 'open' | 'neutral' = idealLipShape;
  let activeMouthOpening: 'closed' | 'medium' | 'too_open' = idealMouthOpening;

  if (viewMode === 'student' && diagnosis) {
    if (detectedPose) {
      activeTonguePath = TONGUE_PATHS[detectedPose.tonguePosition] || activeTonguePath;
      activeVelumLowered = detectedPose.velumLowered;
      activeLipShape = detectedPose.lipShape || activeLipShape;
      activeMouthOpening = detectedPose.mouthOpening || activeMouthOpening;
    } else {
      // Fallback heuristic if pose wasn't returned
      if (isFrenchU && diagnosis.tongue.status !== 'correct') activeTonguePath = TONGUE_PATHS.back_high;
      if (isNasal && diagnosis.nasalityAndVelum.status !== 'correct') {
        activeVelumLowered = false;
        activeTonguePath = TONGUE_PATHS.alveolar_tap;
      }
      if (isUvularR && diagnosis.uvulaOrConsonants.status !== 'correct') {
        activeTonguePath = TONGUE_PATHS.alveolar_tap;
      }
      if (diagnosis.lipsAndMouth.status !== 'correct' && idealLipShape === 'rounded') {
        activeLipShape = 'spread';
      }
    }
  }

  const jawDropOffset = activeMouthOpening === 'too_open' ? 22 : activeMouthOpening === 'closed' ? -4 : 6;

  const renderStatus = (status: DiagnosisStatus) => {
    switch (status) {
      case 'correct':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Correcto
          </span>
        );
      case 'needs_adjustment':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Ajustar
          </span>
        );
      case 'incorrect':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <XCircle className="w-3.5 h-3.5" />
            Corregir
          </span>
        );
    }
  };

  const hotspotTabs: { id: 'tongue' | 'lips' | 'velum' | 'uvula'; label: string }[] = [
    { id: 'tongue', label: 'Lengua' },
    { id: 'lips', label: 'Labios / Boca' },
    { id: 'velum', label: 'Velo Nasal' },
    { id: 'uvula', label: 'Úvula / Acento' },
  ];

  return (
    <section
      id="anatomia"
      className="bg-[#111827] border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between h-full"
    >
      {/* Header + Ideal/Student Segmented Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Corte sagital del aparato fonador
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Articulación de lengua, apertura mandibular, labios y velo para{' '}
            <span className="font-mono text-sky-400 font-medium">{exercise.focusSound}</span>
          </p>
        </div>

        <div className="inline-flex p-1 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('ideal')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'ideal' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modelo nativo
          </button>
          <button
            type="button"
            onClick={() => diagnosis && setViewMode('student')}
            disabled={!diagnosis}
            title={!diagnosis ? 'Graba tu voz primero para ver tu articulación detectada' : undefined}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              !diagnosis
                ? 'text-slate-600 cursor-not-allowed'
                : viewMode === 'student'
                ? 'bg-sky-600 text-white cursor-pointer'
                : 'text-slate-400 hover:text-slate-200 cursor-pointer'
            }`}
          >
            Tu articulación
          </button>
        </div>
      </div>

      {/* Main Split: SVG Canvas + Organ Inspector */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mt-4 items-start flex-1">
        {/* Sagittal Diagram SVG (7 Cols) */}
        <div className="md:col-span-7 relative bg-[#090D16] rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5 px-1">
            <span>
              {viewMode === 'ideal' ? 'Referencia anatómica francesa' : 'Posición detectada en tu audio'}
            </span>
            {activeMouthOpening === 'too_open' && viewMode === 'student' && (
              <span className="text-rose-400 font-semibold">Boca muy abierta</span>
            )}
          </div>

          <svg
            viewBox="0 0 500 410"
            className="w-full max-h-[330px] select-none"
            role="img"
            aria-label="Diagrama sagital del tracto vocal francés"
          >
            <defs>
              <linearGradient id="tongueFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>
              <linearGradient id="nasalAir" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.08" />
              </linearGradient>
              <pattern id="sagittalGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#1e293b" strokeWidth="0.6" />
              </pattern>
            </defs>

            <rect width="500" height="410" fill="url(#sagittalGrid)" />

            {/* 1. Nasal Cavity */}
            <path
              d="M 122 126 C 132 86, 182 58, 260 64 C 320 68, 360 90, 388 138 C 368 144, 328 138, 270 138 C 202 138, 152 138, 122 126 Z"
              fill={activeVelumLowered ? 'url(#nasalAir)' : '#0f172a'}
              stroke="#475569"
              strokeWidth="1.5"
            />
            <text x="242" y="102" fill={activeVelumLowered ? '#7dd3fc' : '#94a3b8'} fontSize="11" fontWeight="600" textAnchor="middle">
              Cavidad nasal · {activeVelumLowered ? 'Flujo abierto' : 'Cerrada'}
            </text>

            {/* Nasal Airflow Trajectory */}
            {activeVelumLowered && (
              <g>
                <path
                  d="M 378 278 Q 368 188 318 118 Q 258 88 142 118"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.8"
                  strokeDasharray="6,4"
                />
                <polygon points="132,119 144,113 142,124" fill="#38bdf8" />
              </g>
            )}

            {/* 2. Hard Palate & Upper Incisor */}
            <path
              d="M 170 228 C 182 212, 204 188, 242 168 C 282 154, 320 158, 340 178"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path d="M 166 228 L 168 248 L 178 246 L 175 228 Z" fill="#f8fafc" stroke="#64748b" strokeWidth="1" />

            {/* 3. Velum (Soft Palate) & Uvula */}
            {!activeVelumLowered ? (
              <path
                d="M 340 178 C 360 178, 376 188, 386 202 C 380 216, 370 226, 366 236 C 360 226, 354 208, 340 178"
                fill="#fda4af"
                fillOpacity="0.85"
                stroke="#f43f5e"
                strokeWidth="1.4"
              />
            ) : (
              <path
                d="M 340 178 C 350 198, 354 220, 348 250 C 344 260, 334 254, 334 238 C 334 214, 334 194, 340 178"
                fill="#38bdf8"
                fillOpacity="0.85"
                stroke="#7dd3fc"
                strokeWidth="1.6"
              />
            )}

            {/* Posterior Pharyngeal Wall */}
            <path d="M 388 138 Q 394 238 394 318 L 388 378" fill="none" stroke="#64748b" strokeWidth="3" />

            {/* Uvular R Friction Zone */}
            {isUvularR && (
              <g>
                <circle cx="358" cy="232" r="14" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3,3" />
                <text x="358" y="210" fill="#fcd34d" fontSize="10" fontWeight="600" textAnchor="middle">
                  Fricción [ʁ]
                </text>
              </g>
            )}

            {/* 4. Lower Incisor & Jaw (moves vertically with mouthOpening) */}
            <g transform={`translate(0, ${jawDropOffset})`}>
              <path d="M 186 294 L 188 274 L 198 276 L 196 294 Z" fill="#f8fafc" stroke="#64748b" strokeWidth="1" />
              <path d="M 172 338 L 196 304" fill="none" stroke="#64748b" strokeWidth="2.5" />
            </g>

            {/* 5. Upper & Lower Lips */}
            {activeLipShape === 'rounded' ? (
              <g>
                <path d="M 166 228 C 145 228, 114 222, 108 236 C 114 246, 140 246, 160 240" fill="#fb7185" stroke="#fda4af" strokeWidth="1.3" />
                <path
                  d={`M 186 ${294 + jawDropOffset} C 160 ${294 + jawDropOffset}, 118 ${284 + jawDropOffset}, 112 ${270 + jawDropOffset} C 118 ${260 + jawDropOffset}, 145 ${258 + jawDropOffset}, 180 ${274 + jawDropOffset}`}
                  fill="#fb7185"
                  stroke="#fda4af"
                  strokeWidth="1.3"
                />
                <ellipse cx="109" cy={253 + jawDropOffset / 2} rx="6" ry="11" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="2,2" />
                <text x="20" y="256" fill="#7dd3fc" fontSize="10" fontWeight="600">
                  Labios en beso
                </text>
              </g>
            ) : activeLipShape === 'spread' ? (
              <g>
                <path d="M 166 228 C 150 228, 130 224, 126 236 C 130 244, 150 244, 160 240" fill="#fb7185" stroke="#fda4af" strokeWidth="1.3" />
                <path
                  d={`M 186 ${294 + jawDropOffset} C 165 ${294 + jawDropOffset}, 136 ${284 + jawDropOffset}, 130 ${270 + jawDropOffset} C 136 ${260 + jawDropOffset}, 155 ${264 + jawDropOffset}, 180 ${274 + jawDropOffset}`}
                  fill="#fb7185"
                  stroke="#fda4af"
                  strokeWidth="1.3"
                />
                <text x="24" y="256" fill="#cbd5e1" fontSize="10" fontWeight="600">
                  Labios extendidos
                </text>
              </g>
            ) : activeLipShape === 'open' || activeMouthOpening === 'too_open' ? (
              <g>
                <path d="M 166 222 C 145 218, 125 208, 120 218 C 125 232, 150 238, 160 238" fill="#fb7185" stroke="#fda4af" strokeWidth="1.3" />
                <path
                  d={`M 186 ${316 + jawDropOffset} C 165 ${316 + jawDropOffset}, 136 ${310 + jawDropOffset}, 130 ${296 + jawDropOffset} C 136 ${282 + jawDropOffset}, 155 ${282 + jawDropOffset}, 180 ${292 + jawDropOffset}`}
                  fill="#fb7185"
                  stroke="#fda4af"
                  strokeWidth="1.3"
                />
                <text x="20" y="266" fill="#fcd34d" fontSize="10" fontWeight="600">
                  Apertura amplia
                </text>
              </g>
            ) : (
              <g>
                <path d="M 166 228 C 146 228, 126 228, 122 238 C 132 248, 150 244, 160 240" fill="#fb7185" stroke="#fda4af" strokeWidth="1.3" />
                <path
                  d={`M 186 ${294 + jawDropOffset} C 165 ${294 + jawDropOffset}, 136 ${288 + jawDropOffset}, 132 ${274 + jawDropOffset} C 136 ${264 + jawDropOffset}, 155 ${264 + jawDropOffset}, 180 ${274 + jawDropOffset}`}
                  fill="#fb7185"
                  stroke="#fda4af"
                  strokeWidth="1.3"
                />
              </g>
            )}

            {/* 6. Dynamic Tongue Body */}
            <path
              d={activeTonguePath}
              fill="url(#tongueFill)"
              stroke="#fda4af"
              strokeWidth="1.8"
            />

            {/* Oral Airflow Path */}
            <path
              d="M 366 326 Q 316 266 248 238 Q 182 228 118 248"
              fill="none"
              stroke="#38bdf8"
              strokeOpacity="0.45"
              strokeWidth="2.4"
              strokeDasharray="4,4"
            />

            {/* Interactive Numbered Anatomical Hotspots */}
            {[
              { id: 'tongue' as const, x: 268, y: 222, num: '1' },
              { id: 'lips' as const, x: 122, y: 256, num: '2' },
              { id: 'velum' as const, x: 350, y: 180, num: '3' },
              { id: 'uvula' as const, x: 374, y: 236, num: '4' },
            ].map((hs) => {
              const selected = activeHotspot === hs.id;
              return (
                <g
                  key={hs.id}
                  onClick={() => setActiveHotspot(hs.id)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={hs.x}
                    cy={hs.y}
                    r={selected ? 14 : 11}
                    fill={selected ? '#0284c7' : '#0f172a'}
                    fillOpacity={selected ? '0.92' : '0.85'}
                    stroke={selected ? '#7dd3fc' : '#64748b'}
                    strokeWidth={selected ? 2 : 1.3}
                  />
                  <text
                    x={hs.x}
                    y={hs.y + 3.5}
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {hs.num}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Organ Detail Inspector (5 Cols) */}
        <div className="md:col-span-5 flex flex-col gap-3">
          {/* Interactive Organ Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0B0F17] rounded-lg border border-slate-800">
            {hotspotTabs.map((tab, idx) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveHotspot(tab.id)}
                className={`py-1.5 px-2.5 rounded-md text-xs font-medium text-left transition-colors cursor-pointer truncate ${
                  activeHotspot === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-mono text-sky-400 mr-1.5">{idx + 1}.</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Contextual Organ Guidance (No Nested Heavy Cards) */}
          <div className="pt-1 space-y-3">
            {activeHotspot === 'tongue' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">Posición de la lengua</h4>
                  {diagnosis && renderStatus(diagnosis.tongue.status)}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {diagnosis ? diagnosis.tongue.description : exercise.articulatoryGuide.tongue}
                </p>
                <div className="pt-2.5 border-t border-slate-800/80 flex items-start gap-2 text-xs text-slate-300">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-100 block mb-0.5">Meta anatómica</span>
                    {diagnosis?.tongue.targetPosition || `${tongueDorsumLabel}. ${tongueTipLabel}.`}
                  </div>
                </div>
              </div>
            )}

            {activeHotspot === 'lips' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">Labios y apertura mandibular</h4>
                  {diagnosis && renderStatus(diagnosis.lipsAndMouth.status)}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {diagnosis ? diagnosis.lipsAndMouth.description : exercise.articulatoryGuide.lips}
                </p>
                <div className="pt-2.5 border-t border-slate-800/80 flex items-start gap-2 text-xs text-slate-300">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-100 block mb-0.5">Configuración objetivo</span>
                    {diagnosis?.lipsAndMouth.targetPosition || exercise.articulatoryGuide.jaw}
                  </div>
                </div>
              </div>
            )}

            {activeHotspot === 'velum' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">Velo del paladar y nasalidad</h4>
                  {diagnosis && renderStatus(diagnosis.nasalityAndVelum.status)}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {diagnosis ? diagnosis.nasalityAndVelum.description : exercise.articulatoryGuide.nasality}
                </p>
                <div className="pt-2.5 border-t border-slate-800/80 flex items-start gap-2 text-xs text-slate-300">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-100 block mb-0.5">Control del aire nasal</span>
                    {diagnosis?.nasalityAndVelum.targetPosition ||
                      (isNasal
                        ? 'Baja el velo para resonar en la nariz sin tocar el paladar con la lengua (no pronuncies la "N").'
                        : 'Mantén el velo elevado para un sonido oral limpio sin resonancia nasal.')}
                  </div>
                </div>
              </div>
            )}

            {activeHotspot === 'uvula' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">
                    {isUvularR ? 'Fricción uvular [ʁ]' : 'Acentuación y consonantes'}
                  </h4>
                  {diagnosis && renderStatus(diagnosis.uvulaOrConsonants.status)}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {diagnosis
                    ? diagnosis.uvulaOrConsonants.description
                    : isUvularR
                    ? 'Produce el roce suave entre el dorso posterior de la lengua y la úvula, manteniendo la punta quieta atrás de los dientes inferiores.'
                    : exercise.articulatoryGuide.stress}
                </p>
                <div className="pt-2.5 border-t border-slate-800/80 flex items-start gap-2 text-xs text-slate-300">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-100 block mb-0.5">Ritmo oxítono francés</span>
                    El acento tónico recae siempre en la última sílaba pronunciada del grupo rítmico.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
