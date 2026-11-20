import React, { useState, useRef, useEffect } from 'react';
import { AcousticMetrics, FrenchExercise, PhoneticAnalysisResult } from '../types/phonetics';
import { playNativeFrench, stopNativeFrench } from '../utils/frenchAudio';
import {
  Mic,
  Square,
  Volume2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface PracticePanelProps {
  exercise: FrenchExercise;
  exerciseIndex: number;
  totalExercises: number;
  onAnalysisComplete: (
    result: PhoneticAnalysisResult,
    audioBlob: Blob,
    audioUrl: string,
    metrics: AcousticMetrics
  ) => void;
  onRecordingStateChange: (isRecording: boolean, analyser: AnalyserNode | null, newSession?: boolean) => void;
  onPrevExercise: () => void;
  onNextExercise: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export const PracticePanel: React.FC<PracticePanelProps> = ({
  exercise,
  exerciseIndex,
  totalExercises,
  onAnalysisComplete,
  onRecordingStateChange,
  onPrevExercise,
  onNextExercise,
  hasPrev,
  hasNext,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [liveLevel, setLiveLevel] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isPlayingNative, setIsPlayingNative] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const recordedMimeRef = useRef<string>('audio/webm');

  // Real-time acoustic accumulator during recording
  const metricsAccRef = useRef<{
    peakRms: number;
    sumRms: number;
    frames: number;
    f1Samples: number[];
    f2Samples: number[];
    centroids: number[];
  }>({
    peakRms: 0,
    sumRms: 0,
    frames: 0,
    f1Samples: [],
    f2Samples: [],
    centroids: [],
  });

  // Clean up on unmount or exercise switch
  useEffect(() => {
    setErrorMsg(null);
    return () => {
      stopNativeFrench();
      cleanupMediaResources(true);
    };
  }, [exercise.id]);

  const cleanupMediaResources = (abortRecorder: boolean) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    if (abortRecorder && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setLiveLevel(0);
    setIsRecording(false);
    onRecordingStateChange(false, null, false);
  };

  const handlePlayNative = async () => {
    setErrorMsg(null);
    setIsPlayingNative(true);
    try {
      await playNativeFrench(exercise.word, playbackSpeed);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo reproducir el modelo nativo.');
    } finally {
      setIsPlayingNative(false);
    }
  };

  const computeFinalMetrics = (): AcousticMetrics => {
    const acc = metricsAccRef.current;
    const elapsed = Math.max(0.2, (Date.now() - startTimeRef.current) / 1000);
    const median = (arr: number[]): number | null => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return Math.round(sorted[Math.floor(sorted.length / 2)]);
    };

    return {
      durationSeconds: Number(elapsed.toFixed(2)),
      peakRms: Number(acc.peakRms.toFixed(4)),
      avgRms: acc.frames > 0 ? Number((acc.sumRms / acc.frames).toFixed(4)) : 0,
      estimatedF1Hz: median(acc.f1Samples),
      estimatedF2Hz: median(acc.f2Samples),
      dominantCentroidHz: median(acc.centroids),
      targetF1: exercise.targetFormants?.f1,
      targetF2: exercise.targetFormants?.f2,
    };
  };

  const startRecording = async () => {
    setErrorMsg(null);
    stopNativeFrench();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Tu navegador no permite acceso al micrófono en este entorno.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Reset acoustic accumulator
      metricsAccRef.current = {
        peakRms: 0,
        sumRms: 0,
        frames: 0,
        f1Samples: [],
        f2Samples: [],
        centroids: [],
      };

      // Track live level and estimate dominant F1 (220-900 Hz) & F2 (900-2700 Hz) peaks during voiced speech
      const freqBins = new Uint8Array(analyser.frequencyBinCount);
      const timeBins = new Uint8Array(analyser.frequencyBinCount);
      const sampleRate = audioCtx.sampleRate || 48000;
      const hzPerBin = sampleRate / analyser.fftSize;

      const f1Start = Math.max(1, Math.floor(220 / hzPerBin));
      const f1End = Math.min(freqBins.length - 1, Math.ceil(900 / hzPerBin));
      const f2Start = Math.max(f1End + 1, Math.floor(900 / hzPerBin));
      const f2End = Math.min(freqBins.length - 1, Math.ceil(2700 / hzPerBin));

      const sampleAcousticFrame = () => {
        analyser.getByteTimeDomainData(timeBins);
        analyser.getByteFrequencyData(freqBins);

        let sumSq = 0;
        for (let i = 0; i < timeBins.length; i++) {
          const v = (timeBins[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeBins.length);
        setLiveLevel(Math.min(1, rms * 4.5));

        const acc = metricsAccRef.current;
        acc.peakRms = Math.max(acc.peakRms, rms);
        acc.sumRms += rms;
        acc.frames += 1;

        if (rms > 0.025) {
          let f1MaxVal = 0;
          let f1Bin = f1Start;
          for (let b = f1Start; b <= f1End; b++) {
            if (freqBins[b] > f1MaxVal) {
              f1MaxVal = freqBins[b];
              f1Bin = b;
            }
          }
          if (f1MaxVal > 40) {
            acc.f1Samples.push(Math.round(f1Bin * hzPerBin));
          }

          let f2MaxVal = 0;
          let f2Bin = f2Start;
          for (let b = f2Start; b <= f2End; b++) {
            if (freqBins[b] > f2MaxVal) {
              f2MaxVal = freqBins[b];
              f2Bin = b;
            }
          }
          if (f2MaxVal > 35) {
            acc.f2Samples.push(Math.round(f2Bin * hzPerBin));
          }

          let weightedSum = 0;
          let magSum = 0;
          const centroidLimit = Math.min(freqBins.length, Math.ceil(5000 / hzPerBin));
          for (let b = 2; b < centroidLimit; b++) {
            weightedSum += freqBins[b] * (b * hzPerBin);
            magSum += freqBins[b];
          }
          if (magSum > 0) {
            acc.centroids.push(Math.round(weightedSum / magSum));
          }
        }

        meterFrameRef.current = requestAnimationFrame(sampleAcousticFrame);
      };
      meterFrameRef.current = requestAnimationFrame(sampleAcousticFrame);

      // Signal parent & spectrogram that a fresh recording session started
      onRecordingStateChange(true, analyser, true);

      const supportedMime = getSupportedAudioMimeType();
      recordedMimeRef.current = supportedMime || 'audio/webm';
      const mediaRecorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalMetrics = computeFinalMetrics();
        const actualMime = mediaRecorder.mimeType || recordedMimeRef.current || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Immediately release mic and freeze spectrogram
        cleanupMediaResources(false);

        if (finalMetrics.peakRms < 0.009 || audioBlob.size < 600) {
          URL.revokeObjectURL(audioUrl);
          setErrorMsg(
            'No se detectó voz suficiente en el micrófono. Acércate al micrófono y pronuncia la palabra en voz clara.'
          );
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await analyzePronunciation(base64Audio, actualMime, audioBlob, audioUrl, finalMetrics);
        };
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 7) {
            stopRecording();
            return 7;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      cleanupMediaResources(true);
      setErrorMsg(
        err?.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado. Habilita el micrófono en tu navegador para grabar.'
          : 'No se pudo acceder al micrófono. Verifica que esté conectado.'
      );
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupMediaResources(false);
    }
  };

  const analyzePronunciation = async (
    base64Audio: string,
    mimeType: string,
    audioBlob: Blob,
    audioUrl: string,
    metrics: AcousticMetrics
  ) => {
    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/analyze-phonetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType,
          targetText: exercise.word,
          targetIpa: exercise.ipa,
          category: exercise.category,
          audioMetrics: metrics,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Error de conexión con el servidor');
      }

      const result: PhoneticAnalysisResult = await response.json();
      onAnalysisComplete(result, audioBlob, audioUrl, metrics);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setErrorMsg(`No se pudo completar el diagnóstico: ${err?.message || 'Inténtalo de nuevo.'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <section className="bg-[#111827] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between h-full">
      {/* Top Unboxed Metadata + Exercise Stepper */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0 truncate">
          <span className="text-sky-400 font-medium">{exercise.category}</span>
          <span aria-hidden="true">·</span>
          <span>{exercise.difficulty}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {exerciseIndex + 1}/{totalExercises}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onPrevExercise}
            disabled={!hasPrev || isRecording || isAnalyzing}
            className="w-8 h-8 rounded-lg bg-[#0B0F17] border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Palabra anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onNextExercise}
            disabled={!hasNext || isRecording || isAnalyzing}
            className="w-8 h-8 rounded-lg bg-[#0B0F17] border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Siguiente palabra"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Focal Target Word & Phonetic Transcription */}
      <div className="py-5 space-y-3">
        <div>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-white tracking-tight leading-tight text-balance">
            {exercise.word}
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">
            {exercise.translation}
          </p>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 pt-1">
          <span className="font-mono text-xl font-semibold text-sky-400 tracking-wide">
            {exercise.ipa}
          </span>
          <span className="text-xs text-slate-400">
            Fonema foco:{' '}
            <strong className="font-mono text-amber-300 font-semibold">{exercise.focusSound}</strong>
          </span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed max-w-prose">
          {exercise.focusDescription}
        </p>

        <p className="text-xs text-slate-400 leading-relaxed pt-1">
          <span className="text-slate-200 font-medium">Consejo muscular:</span> {exercise.sampleTip}
        </p>
      </div>

      {/* Controls Footer: Native Reference Audio + Primary Mic Record CTA */}
      <div className="pt-4 border-t border-slate-800/80 space-y-4">
        {/* Native Model Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePlayNative}
            disabled={isPlayingNative || isRecording}
            className="px-4 py-2 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700/90 text-slate-100 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {isPlayingNative ? (
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4 text-sky-400" />
            )}
            <span>{isPlayingNative ? 'Reproduciendo modelo...' : 'Escuchar nativo'}</span>
          </button>

          <div className="inline-flex p-0.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setPlaybackSpeed(1.0)}
              className={`px-2.5 py-1 rounded-md font-mono tabular-nums transition-colors cursor-pointer ${
                playbackSpeed === 1.0 ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1.0x
            </button>
            <button
              type="button"
              onClick={() => setPlaybackSpeed(0.7)}
              className={`px-2.5 py-1 rounded-md font-mono tabular-nums transition-colors cursor-pointer ${
                playbackSpeed === 0.7 ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Velocidad lenta didáctica"
            >
              0.7x
            </button>
          </div>
        </div>

        {/* Primary Recording Button + Live Input Level Bar */}
        <div className="space-y-2.5">
          {isRecording ? (
            <button
              type="button"
              onClick={stopRecording}
              className="w-full py-3 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Square className="w-4 h-4 fill-current" />
              <span className="font-mono tabular-nums">Detener y analizar ({recordingSeconds}s / 7s)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={isAnalyzing}
              className="w-full py-3 px-5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analizando tu articulación...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Grabar pronunciación</span>
                </>
              )}
            </button>
          )}

          {/* Real-time Microphone Input Level Bar when recording */}
          {isRecording && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                <span>Nivel de micrófono</span>
                <span>{Math.round(liveLevel * 100)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#0B0F17] overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-sky-400 transition-transform duration-75 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.03, liveLevel)})` }}
                />
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-start justify-between gap-2"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-300 hover:text-white font-semibold px-1 cursor-pointer"
              aria-label="Cerrar error"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
