import React from 'react';
import { DiagnosisStatus, FrenchExercise, PhoneticAnalysisResult } from '../types/phonetics';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  MicOff,
  Loader2,
} from 'lucide-react';

interface DiagnosticCardProps {
  diagnosis: PhoneticAnalysisResult;
  exercise: FrenchExercise;
  loadingWord?: string | null;
  onSelectWord?: (word: string) => void;
}

export const DiagnosticCard: React.FC<DiagnosticCardProps> = ({
  diagnosis,
  exercise,
  loadingWord,
  onSelectWord,
}) => {
  if (!diagnosis.isAudible) {
    return (
      <section className="bg-[#111827] border border-amber-500/40 rounded-2xl p-6 flex items-start gap-4">
        <MicOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-100">
            No se detectó voz clara en la grabación
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            {diagnosis.summaryFeedback ||
              'Vuelve a pulsar "Grabar pronunciación" y pronuncia la palabra en voz clara frente al micrófono.'}
          </p>
        </div>
      </section>
    );
  }

  const getScoreAccent = (score: number) => {
    if (score >= 85) return { num: 'text-emerald-400', label: 'Pronunciación precisa' };
    if (score >= 65) return { num: 'text-amber-400', label: 'Comprensible · requiere ajustes' };
    return { num: 'text-rose-400', label: 'Requiere corrección articulatoria' };
  };

  const scoreMeta = getScoreAccent(diagnosis.overallScore);

  const renderStatus = (status: DiagnosisStatus) => {
    switch (status) {
      case 'correct':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Correcto
          </span>
        );
      case 'needs_adjustment':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            Ajustar
          </span>
        );
      case 'incorrect':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 shrink-0">
            <XCircle className="w-3.5 h-3.5" />
            Corregir
          </span>
        );
    }
  };

  const ad = diagnosis.anatomicalDiagnosis;

  const diagnosticItems = [
    {
      title: 'Posición de la lengua',
      status: ad.tongue.status,
      description: ad.tongue.description,
      target: ad.tongue.targetPosition,
    },
    {
      title: 'Labios y apertura de boca',
      status: ad.lipsAndMouth.status,
      description: ad.lipsAndMouth.description,
      target: ad.lipsAndMouth.targetPosition,
    },
    {
      title: 'Velo del paladar y nasalidad',
      status: ad.nasalityAndVelum.status,
      description: ad.nasalityAndVelum.description,
      target: ad.nasalityAndVelum.targetPosition,
    },
    {
      title: 'Acentuación y ritmo oxítono',
      status: ad.accentuationAndRhythm.status,
      description: ad.accentuationAndRhythm.description,
      target: undefined,
    },
    {
      title: 'Consonantes, enlaces y úvula',
      status: ad.uvulaOrConsonants.status,
      description: ad.uvulaOrConsonants.description,
      target: undefined,
    },
  ];

  return (
    <section
      aria-label="Diagnóstico fonético y articulatorio"
      className="bg-[#111827] border border-slate-800/90 rounded-2xl p-6 space-y-6"
    >
      {/* Top Evaluation Summary + IPA Comparison */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-slate-800/80">
        <div className="flex items-start gap-5">
          <div className="shrink-0">
            <div className={`font-mono text-4xl font-bold tabular-nums leading-none ${scoreMeta.num}`}>
              {diagnosis.overallScore}
              <span className="text-base font-normal text-slate-500">/100</span>
            </div>
            <div className="text-xs font-medium text-slate-400 mt-1.5">{scoreMeta.label}</div>
          </div>

          <div className="space-y-1 max-w-2xl">
            <h3 className="text-base font-semibold text-white">
              Diagnóstico de "{exercise.word}"
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {diagnosis.summaryFeedback}
            </p>
          </div>
        </div>

        {/* IPA Side-by-Side Comparison */}
        <div className="flex items-center gap-6 shrink-0 pt-2 lg:pt-0 lg:pl-6 lg:border-l border-slate-800">
          <div>
            <div className="text-xs text-slate-400 mb-1">AFI detectado</div>
            <div className="font-mono text-lg font-semibold text-amber-300">
              {diagnosis.detectedIpa || '—'}
            </div>
          </div>
          <div className="h-9 w-px bg-slate-800" aria-hidden="true" />
          <div>
            <div className="text-xs text-slate-400 mb-1">AFI francés nativo</div>
            <div className="font-mono text-lg font-semibold text-emerald-400">
              {diagnosis.targetIpa || exercise.ipa}
            </div>
          </div>
        </div>
      </div>

      {/* 5-Pillar Anatomical Diagnostic Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        {diagnosticItems.map((item, idx) => (
          <div
            key={item.title}
            className={`space-y-1.5 pb-4 border-b border-slate-800/70 ${
              idx === diagnosticItems.length - 1 ? 'md:col-span-2 md:border-b-0 md:pb-0' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-100">{item.title}</h4>
              {renderStatus(item.status)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
            {item.target && (
              <p className="text-xs text-sky-300/90 leading-relaxed pt-0.5">
                <span className="font-semibold text-sky-400">Meta anatómica:</span> {item.target}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Actionable Coaching Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5 border-t border-slate-800/80">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-sky-400">Gimnasia articulatoria paso a paso</h4>
          <p className="text-xs text-slate-200 leading-relaxed">{diagnosis.physicalExerciseTip}</p>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-amber-400">Por qué ocurre este error</h4>
          <p className="text-xs text-slate-300 leading-relaxed">{diagnosis.commonMistakeExplanation}</p>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-emerald-400">Lectura en el espectrograma</h4>
          <p className="text-xs text-slate-300 leading-relaxed">{diagnosis.acousticFormantsAdvice}</p>
        </div>
      </div>

      {/* Recommended Reinforcement Words */}
      {diagnosis.recommendedExercises && diagnosis.recommendedExercises.length > 0 && (
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-slate-400 font-medium">Reforzar con:</span>
          {diagnosis.recommendedExercises.map((recWord, idx) => {
            const isLoadingThis = loadingWord === recWord;
            return (
              <button
                key={`${recWord}-${idx}`}
                type="button"
                disabled={Boolean(loadingWord)}
                onClick={() => onSelectWord && onSelectWord(recWord)}
                className="px-3 py-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700/90 text-xs font-medium text-slate-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{recWord}</span>
                {isLoadingThis ? (
                  <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                ) : (
                  <ArrowRight className="w-3 h-3 text-sky-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
