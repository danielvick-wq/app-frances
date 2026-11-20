import React, { useEffect, useRef, useState } from 'react';
import { FRENCH_LESSONS } from './data/frenchLessons';
import {
  AcousticMetrics,
  FrenchExercise,
  PhoneticAnalysisResult,
  PhoneticLesson,
  PracticeHistoryItem,
} from './types/phonetics';
import { PracticePanel } from './components/PracticePanel';
import { AudioSpectrogram } from './components/AudioSpectrogram';
import { ArticulatoryDiagram } from './components/ArticulatoryDiagram';
import { DiagnosticCard } from './components/DiagnosticCard';
import { VowelChartIPA } from './components/VowelChartIPA';
import { CustomWordModal } from './components/CustomWordModal';
import { Plus, RotateCcw } from 'lucide-react';

export default function App() {
  const [currentLessonIndex, setCurrentLessonIndex] = useState<number>(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState<number>(0);
  const [activeExercise, setActiveExercise] = useState<FrenchExercise>(
    FRENCH_LESSONS[0].exercises[0]
  );

  // Audio & Diagnostic States
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [captureSessionId, setCaptureSessionId] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [measuredMetrics, setMeasuredMetrics] = useState<AcousticMetrics | null>(null);
  const [diagnosis, setDiagnosis] = useState<PhoneticAnalysisResult | null>(null);

  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [loadingRecommendedWord, setLoadingRecommendedWord] = useState<string | null>(null);
  const [history, setHistory] = useState<PracticeHistoryItem[]>([]);

  const diagnosisSectionRef = useRef<HTMLDivElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const currentLesson: PhoneticLesson = FRENCH_LESSONS[currentLessonIndex];

  // Clean up object URLs on replacement or unmount
  const replaceAudioUrl = (nextUrl: string | null) => {
    if (audioUrlRef.current && audioUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  };

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const resetAttemptState = () => {
    setDiagnosis(null);
    setMeasuredMetrics(null);
    replaceAudioUrl(null);
    setCaptureSessionId((prev) => prev + 1);
  };

  const handleSelectLesson = (index: number) => {
    setCurrentLessonIndex(index);
    setCurrentExerciseIndex(0);
    setActiveExercise(FRENCH_LESSONS[index].exercises[0]);
    resetAttemptState();
  };

  const handleSelectExercise = (exercise: FrenchExercise, index: number) => {
    setCurrentExerciseIndex(index);
    setActiveExercise(exercise);
    resetAttemptState();
  };

  const handlePrevExercise = () => {
    if (currentExerciseIndex > 0) {
      handleSelectExercise(
        currentLesson.exercises[currentExerciseIndex - 1],
        currentExerciseIndex - 1
      );
    }
  };

  const handleNextExercise = () => {
    if (currentExerciseIndex < currentLesson.exercises.length - 1) {
      handleSelectExercise(
        currentLesson.exercises[currentExerciseIndex + 1],
        currentExerciseIndex + 1
      );
    }
  };

  const handleRecordingStateChange = (
    recording: boolean,
    analyser: AnalyserNode | null,
    newSession?: boolean
  ) => {
    setIsRecording(recording);
    setAnalyserNode(analyser);
    if (newSession) {
      setDiagnosis(null);
      setMeasuredMetrics(null);
      replaceAudioUrl(null);
      setCaptureSessionId((prev) => prev + 1);
    }
  };

  const handleAnalysisComplete = (
    result: PhoneticAnalysisResult,
    _blob: Blob,
    url: string,
    metrics: AcousticMetrics
  ) => {
    setDiagnosis(result);
    replaceAudioUrl(url);
    setMeasuredMetrics(metrics);

    // If custom word had placeholder IPA, upgrade it with Gemini's authoritative French IPA
    if (result.targetIpa && activeExercise.id.startsWith('custom-')) {
      setActiveExercise((prev) => ({
        ...prev,
        ipa: result.targetIpa,
      }));
    }

    if (result.isAudible) {
      setHistory((prev) => [
        {
          id: `${Date.now()}-${activeExercise.id}`,
          word: activeExercise.word,
          detectedIpa: result.detectedIpa,
          targetIpa: result.targetIpa || activeExercise.ipa,
          score: result.overallScore,
          sound: activeExercise.focusSound,
          summary: result.summaryFeedback,
          date: Date.now(),
        },
        ...prev.slice(0, 11),
      ]);
    }

    // Bring diagnosis into clear focus smoothly
    setTimeout(() => {
      diagnosisSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const handleCustomExercise = (exercise: FrenchExercise) => {
    setActiveExercise(exercise);
    resetAttemptState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load any French word (from recommended words, vowel chart, or history) with real IPA & formants
  const handleLoadWordByText = async (wordText: string) => {
    const clean = wordText.trim();
    if (!clean) return;

    // First check if the word already exists in our curated lessons
    for (let lIdx = 0; lIdx < FRENCH_LESSONS.length; lIdx++) {
      const exIdx = FRENCH_LESSONS[lIdx].exercises.findIndex(
        (ex) => ex.word.toLowerCase() === clean.toLowerCase()
      );
      if (exIdx !== -1) {
        setCurrentLessonIndex(lIdx);
        handleSelectExercise(FRENCH_LESSONS[lIdx].exercises[exIdx], exIdx);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    setLoadingRecommendedWord(clean);
    try {
      const res = await fetch('/api/phonetic-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: clean }),
      });
      if (res.ok) {
        const guidedExercise: FrenchExercise = await res.json();
        handleCustomExercise(guidedExercise);
        return;
      }
    } catch {
      // Fallback below
    } finally {
      setLoadingRecommendedWord(null);
    }

    handleCustomExercise({
      id: `custom-${Date.now()}`,
      word: clean,
      translation: 'Palabra de refuerzo',
      ipa: `/${clean}/`,
      difficulty: 'Intermédiaire',
      category: activeExercise.category,
      focusSound: activeExercise.focusSound,
      focusDescription: `Práctica de refuerzo para ${activeExercise.focusSound}.`,
      articulatoryGuide: activeExercise.articulatoryGuide,
      sampleTip: activeExercise.sampleTip,
      targetFormants: activeExercise.targetFormants,
    });
  };

  const avgScore =
    history.length > 0
      ? Math.round(history.reduce((sum, item) => sum + item.score, 0) / history.length)
      : null;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans pb-16">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#0B0F17]/90 border-b border-slate-800/80 backdrop-blur-md">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#laboratorio"
            className="font-display text-xl font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Phonétique
          </a>

          {/* Zone 2: 4 Clean Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
            <a
              href="#laboratorio"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Laboratorio
            </a>
            <a
              href="#anatomia"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Anatomía vocal
            </a>
            <a
              href="#trapecio"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Trapecio AFI
            </a>
            <a
              href="#historial"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Historial{history.length > 0 ? ` (${history.length})` : ''}
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setIsCustomModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Palabra libre</span>
            </button>
          </div>
        </div>
      </header>

      {/* Module & Word Curriculum Strip */}
      <div className="border-b border-slate-800/80 bg-[#0E1420]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-3 space-y-2.5">
          {/* Modules Segmented Row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {FRENCH_LESSONS.map((lesson, idx) => {
              const isActive = currentLessonIndex === idx;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => handleSelectLesson(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    isActive
                      ? 'bg-sky-600 text-white border-sky-500'
                      : 'bg-[#111827] hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  <span className="font-mono font-semibold mr-1.5">{lesson.targetSound}</span>
                  <span className={isActive ? 'text-sky-100' : 'text-slate-400'}>{lesson.title}</span>
                </button>
              );
            })}
          </div>

          {/* Exercise Picker & Lesson Physical Rule */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {currentLesson.exercises.map((ex, idx) => {
                const isSelected = activeExercise.id === ex.id;
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => handleSelectExercise(ex, idx)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-800 text-white border-sky-500/70 font-semibold'
                        : 'bg-transparent hover:bg-slate-800/60 text-slate-400 border-transparent hover:text-slate-200'
                    }`}
                  >
                    <span>{ex.word}</span>
                    <span className="font-mono text-[11px] text-sky-400/90 ml-1.5">{ex.ipa}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 truncate max-w-xl" title={currentLesson.physicalSecret}>
              <span className="text-slate-200 font-medium">Clave física:</span>{' '}
              {currentLesson.physicalSecret}
            </p>
          </div>
        </div>
      </div>

      {/* Main 1440px Laboratory Workspace */}
      <main id="laboratorio" className="max-w-[1360px] mx-auto w-full px-4 sm:px-8 pt-6 space-y-6">
        {/* Row 1: Above-the-Fold 2-Column Focal Stage (Practice Deck + Acoustic Spectrogram) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5">
            <PracticePanel
              exercise={activeExercise}
              exerciseIndex={currentExerciseIndex}
              totalExercises={currentLesson.exercises.length}
              onAnalysisComplete={handleAnalysisComplete}
              onRecordingStateChange={handleRecordingStateChange}
              onPrevExercise={handlePrevExercise}
              onNextExercise={handleNextExercise}
              hasPrev={currentExerciseIndex > 0}
              hasNext={currentExerciseIndex < currentLesson.exercises.length - 1}
            />
          </div>

          <div className="lg:col-span-7">
            <AudioSpectrogram
              analyserNode={analyserNode}
              audioUrl={audioUrl}
              exercise={activeExercise}
              isRecording={isRecording}
              measuredMetrics={measuredMetrics}
              captureSessionId={captureSessionId}
            />
          </div>
        </div>

        {/* Row 2: AI Articulatory Diagnostic Report (appears directly after voice analysis) */}
        {diagnosis && (
          <div ref={diagnosisSectionRef}>
            <DiagnosticCard
              diagnosis={diagnosis}
              exercise={activeExercise}
              loadingWord={loadingRecommendedWord}
              onSelectWord={handleLoadWordByText}
            />
          </div>
        )}

        {/* Row 3: Interactive Vocal Tract Anatomy + Clickable French IPA Vowel Trapeze */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7">
            <ArticulatoryDiagram
              exercise={activeExercise}
              diagnosis={diagnosis?.isAudible ? diagnosis.anatomicalDiagnosis : null}
              detectedPose={diagnosis?.isAudible ? diagnosis.detectedPose : null}
            />
          </div>

          <div className="lg:col-span-5">
            <VowelChartIPA
              currentSound={activeExercise.focusSound}
              onPracticeWord={handleLoadWordByText}
            />
          </div>
        </div>

        {/* Row 4: Session Progress & Practice History */}
        <section
          id="historial"
          className="bg-[#111827] border border-slate-800/90 rounded-2xl p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Historial de intentos en esta sesión
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Compara tu evolución entre el AFI detectado y el estándar francés nativo
              </p>
            </div>

            {avgScore !== null && (
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                Promedio de sesión:{' '}
                <strong className="text-emerald-400 font-semibold">{avgScore}/100</strong>
                <span aria-hidden="true" className="mx-2 text-slate-700">·</span>
                <span>{history.length} {history.length === 1 ? 'intento' : 'intentos'}</span>
              </div>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              Aún no has grabado intentos en esta sesión. Graba una palabra en el laboratorio superior para registrar tu evolución fonética.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Palabra</th>
                    <th className="py-2.5 pr-4 font-medium">AFI detectado</th>
                    <th className="py-2.5 pr-4 font-medium">AFI nativo</th>
                    <th className="py-2.5 pr-4 font-medium text-right">Puntaje</th>
                    <th className="py-2.5 pl-4 font-medium">Diagnóstico</th>
                    <th className="py-2.5 pl-4 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-4 font-medium text-slate-100 whitespace-nowrap">
                        {item.word}
                      </td>
                      <td className="py-3 pr-4 font-mono text-amber-300 whitespace-nowrap">
                        {item.detectedIpa}
                      </td>
                      <td className="py-3 pr-4 font-mono text-emerald-400 whitespace-nowrap">
                        {item.targetIpa}
                      </td>
                      <td className="py-3 pr-4 font-mono tabular-nums font-semibold text-right whitespace-nowrap">
                        <span
                          className={
                            item.score >= 85
                              ? 'text-emerald-400'
                              : item.score >= 65
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {item.score}/100
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-slate-300 max-w-md truncate" title={item.summary}>
                        {item.summary}
                      </td>
                      <td className="py-3 pl-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleLoadWordByText(item.word)}
                          className="text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reintentar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Custom Word Modal */}
      <CustomWordModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSubmit={handleCustomExercise}
      />
    </div>
  );
}
