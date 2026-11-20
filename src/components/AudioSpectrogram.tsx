import React, { useEffect, useRef, useState } from 'react';
import { Activity, BarChart2, Play, Pause, Waves } from 'lucide-react';
import { AcousticMetrics, FrenchExercise } from '../types/phonetics';

interface AudioSpectrogramProps {
  analyserNode: AnalyserNode | null;
  audioUrl: string | null;
  exercise: FrenchExercise;
  isRecording: boolean;
  measuredMetrics: AcousticMetrics | null;
  captureSessionId: number;
}

const MAX_DISPLAY_HZ = 5500;
const MAX_HISTORY_SLICES = 240;

export const AudioSpectrogram: React.FC<AudioSpectrogramProps> = ({
  analyserNode,
  audioUrl,
  exercise,
  isRecording,
  measuredMetrics,
  captureSessionId,
}) => {
  const [viewMode, setViewMode] = useState<'waterfall' | 'spectrum' | 'waveform'>('waterfall');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Preserved captured buffers so the student's word spectrum stays visible after stopping
  const spectrogramHistoryRef = useRef<Uint8Array[]>([]);
  const avgSpectrumRef = useRef<Float32Array | null>(null);
  const avgSpectrumCountRef = useRef<number>(0);
  const waveformEnvelopeRef = useRef<number[]>([]);
  const sampleRateRef = useRef<number>(48000);
  const fftSizeRef = useRef<number>(2048);

  // Reset captured buffers when exercise changes or a brand new recording starts
  useEffect(() => {
    spectrogramHistoryRef.current = [];
    avgSpectrumRef.current = null;
    avgSpectrumCountRef.current = 0;
    waveformEnvelopeRef.current = [];
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [exercise.id, captureSessionId]);

  // Helper: Scientific Inferno/Magma thermal map
  const getSpectrogramColor = (val: number): string => {
    if (val < 16) return 'rgb(10, 14, 24)';
    if (val < 58) return `rgb(${Math.round(val * 1.1)}, 22, ${Math.round(55 + val * 1.8)})`;
    if (val < 118) return `rgb(${Math.round(64 + (val - 58) * 2.6)}, ${Math.round(28 + (val - 58) * 0.7)}, ${Math.round(160 - (val - 58) * 0.8)})`;
    if (val < 185) return `rgb(236, ${Math.round(70 + (val - 118) * 2.2)}, ${Math.round(110 - (val - 118) * 1.1)})`;
    if (val < 232) return `rgb(252, ${Math.round(218 + (val - 185) * 0.75)}, ${Math.round(38 + (val - 185) * 2.8)})`;
    return 'rgb(255, 252, 235)';
  };

  // Accurate Hz -> FFT bin index
  const hzToBin = (hz: number, sampleRate: number, fftSize: number): number => {
    return Math.max(0, Math.round((hz * fftSize) / sampleRate));
  };

  const drawWaterfall = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    history: Uint8Array[],
    sampleRate: number,
    fftSize: number,
    playheadRatio: number | null
  ) => {
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    const slices = history.length;
    const maxBin = Math.max(
      16,
      Math.min(history[0]?.length || 256, hzToBin(MAX_DISPLAY_HZ, sampleRate, fftSize))
    );

    if (slices > 0) {
      const renderSlots = isRecording ? MAX_HISTORY_SLICES : Math.max(slices, 1);
      const sliceWidth = width / renderSlots;
      const cellH = Math.ceil(height / maxBin) + 1;

      for (let s = 0; s < slices; s++) {
        const sliceData = history[s];
        const x = s * sliceWidth;
        for (let f = 0; f < maxBin; f++) {
          const val = sliceData[f] || 0;
          if (val < 16) continue;
          const y = height - (f / maxBin) * height;
          ctx.fillStyle = getSpectrogramColor(val);
          ctx.fillRect(x, y - cellH, Math.ceil(sliceWidth) + 1, cellH);
        }
      }
    }

    // Frequency reference grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;

    const markFreqs = [
      { hz: 500, label: '500 Hz' },
      { hz: 1500, label: '1.5 kHz' },
      { hz: 2500, label: '2.5 kHz' },
      { hz: 4000, label: '4.0 kHz' },
    ];

    ctx.font = '10px "JetBrains Mono", monospace';
    markFreqs.forEach((m) => {
      const y = height - (m.hz / MAX_DISPLAY_HZ) * height;
      if (y > 14 && y < height - 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
        ctx.fillText(m.label, 8, y - 4);
      }
    });
    ctx.setLineDash([]);

    // Formant Target Bands (F1 mouth opening, F2 tongue front/back)
    if (exercise.targetFormants) {
      const f1Y = height - (exercise.targetFormants.f1 / MAX_DISPLAY_HZ) * height;
      const f2Y = height - (exercise.targetFormants.f2 / MAX_DISPLAY_HZ) * height;

      // F1 Band
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(0, f1Y - 9, width, 18);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, f1Y);
      ctx.lineTo(width, f1Y);
      ctx.stroke();

      ctx.fillStyle = '#7dd3fc';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`F1 Meta ${exercise.targetFormants.f1} Hz (Boca)`, width - 10, Math.max(14, f1Y - 4));

      // F2 Band
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(0, f2Y - 11, width, 22);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, f2Y);
      ctx.lineTo(width, f2Y);
      ctx.stroke();

      ctx.fillStyle = '#fcd34d';
      ctx.fillText(`F2 Meta ${exercise.targetFormants.f2} Hz (Lengua)`, width - 10, Math.max(26, f2Y - 4));
      ctx.textAlign = 'start';
    }

    // Playback playhead cursor when listening back
    if (playheadRatio !== null && playheadRatio >= 0 && playheadRatio <= 1 && slices > 0) {
      const px = playheadRatio * width;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
  };

  const drawSpectrum = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    spectrumData: ArrayLike<number>,
    sampleRate: number,
    fftSize: number
  ) => {
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    const maxBin = Math.max(
      16,
      Math.min(spectrumData.length, hzToBin(MAX_DISPLAY_HZ, sampleRate, fftSize))
    );
    const barWidth = width / maxBin;

    // Subtle vertical frequency grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    [500, 1000, 2000, 3000, 4000, 5000].forEach((hz) => {
      const x = (hz / MAX_DISPLAY_HZ) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 18);
      ctx.stroke();
      ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x + 3, height - 5);
    });

    const gradient = ctx.createLinearGradient(0, height - 20, 0, 16);
    gradient.addColorStop(0, '#0284c7');
    gradient.addColorStop(0.55, '#38bdf8');
    gradient.addColorStop(1, '#f59e0b');

    ctx.fillStyle = gradient;
    for (let i = 0; i < maxBin; i++) {
      const val = spectrumData[i] || 0;
      const barH = (val / 255) * (height - 42);
      const x = i * barWidth;
      ctx.fillRect(x, height - 20 - barH, Math.max(1, barWidth - 0.6), barH);
    }

    // Smooth spectral envelope line
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < maxBin; i++) {
      const val = spectrumData[i] || 0;
      const barH = (val / 255) * (height - 42);
      const x = i * barWidth + barWidth / 2;
      const y = height - 20 - barH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Target Formant Vertical Lines
    if (exercise.targetFormants) {
      const f1X = (exercise.targetFormants.f1 / MAX_DISPLAY_HZ) * width;
      const f2X = (exercise.targetFormants.f2 / MAX_DISPLAY_HZ) * width;

      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;

      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(f1X, 14);
      ctx.lineTo(f1X, height - 20);
      ctx.stroke();
      ctx.fillStyle = '#7dd3fc';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillText(`F1 Meta ${exercise.targetFormants.f1}Hz`, Math.min(width - 115, f1X + 5), 24);

      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(f2X, 14);
      ctx.lineTo(f2X, height - 20);
      ctx.stroke();
      ctx.fillStyle = '#fcd34d';
      ctx.fillText(`F2 Meta ${exercise.targetFormants.f2}Hz`, Math.min(width - 115, f2X + 5), 40);
      ctx.setLineDash([]);
    }

    // Measured F1/F2 peaks if available
    if (measuredMetrics?.estimatedF1Hz) {
      const mf1X = (measuredMetrics.estimatedF1Hz / MAX_DISPLAY_HZ) * width;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(mf1X, height - 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (measuredMetrics?.estimatedF2Hz) {
      const mf2X = (measuredMetrics.estimatedF2Hz / MAX_DISPLAY_HZ) * width;
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(mf2X, height - 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawLiveWaveform = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeData: Uint8Array
  ) => {
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    const sliceW = width / timeData.length;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * sliceW, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Ritmo oxítono francés: busca mayor energía y duración en la sílaba final', 14, 22);
  };

  const drawCapturedEnvelope = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    envelope: number[],
    playheadRatio: number | null
  ) => {
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    const mid = height / 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    if (envelope.length > 0) {
      const barW = Math.max(2, width / envelope.length);
      const maxAmp = Math.max(0.08, ...envelope);

      envelope.forEach((rms, idx) => {
        const norm = Math.min(1, rms / maxAmp);
        const h = Math.max(2, norm * (height * 0.78));
        const x = (idx / envelope.length) * width;
        const isLastQuarter = idx > envelope.length * 0.68;
        ctx.fillStyle = isLastQuarter ? '#38bdf8' : 'rgba(56, 189, 248, 0.52)';
        ctx.fillRect(x, mid - h / 2, Math.max(1.5, barW - 1), h);
      });
    }

    if (playheadRatio !== null && playheadRatio >= 0 && playheadRatio <= 1) {
      const px = playheadRatio * width;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Envolvente de intensidad de tu grabación (zona azul brillante = sílaba tónica final)', 14, 22);
  };

  const drawIdleCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    // Subtle measurement grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (exercise.targetFormants) {
      const f1Y = height - (exercise.targetFormants.f1 / MAX_DISPLAY_HZ) * height;
      const f2Y = height - (exercise.targetFormants.f2 / MAX_DISPLAY_HZ) * height;

      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.2;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, f1Y);
      ctx.lineTo(width, f1Y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, f2Y);
      ctx.lineTo(width, f2Y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(`F1 Objetivo: ${exercise.targetFormants.f1} Hz (apertura vocal)`, 12, Math.max(14, f1Y - 5));
      ctx.fillStyle = '#fcd34d';
      ctx.fillText(`F2 Objetivo: ${exercise.targetFormants.f2} Hz (avance lingual)`, 12, Math.max(26, f2Y - 5));
    }

    ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
    ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Pulsa "Grabar pronunciación" para capturar el espectro acústico de tu voz',
      width / 2,
      height / 2 - 6
    );
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
    ctx.fillText(
      `Objetivo: "${exercise.word}" ${exercise.ipa} · Fonema ${exercise.focusSound}`,
      width / 2,
      height / 2 + 16
    );
    ctx.textAlign = 'start';
  };

  // Real-time recording loop OR static frozen review render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Live capture mode
    if (analyserNode && isRecording) {
      sampleRateRef.current = analyserNode.context.sampleRate || 48000;
      fftSizeRef.current = analyserNode.fftSize || 2048;

      const bufferLength = analyserNode.frequencyBinCount;
      const freqData = new Uint8Array(bufferLength);
      const timeData = new Uint8Array(bufferLength);

      const renderLive = () => {
        analyserNode.getByteFrequencyData(freqData);
        analyserNode.getByteTimeDomainData(timeData);

        // Compute slice RMS to track envelope and weight spectral average to voiced frames
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        waveformEnvelopeRef.current.push(rms);
        if (waveformEnvelopeRef.current.length > MAX_HISTORY_SLICES) {
          waveformEnvelopeRef.current.shift();
        }

        // Always record waterfall slice regardless of active viewMode so user can switch views after!
        spectrogramHistoryRef.current.push(new Uint8Array(freqData));
        if (spectrogramHistoryRef.current.length > MAX_HISTORY_SLICES) {
          spectrogramHistoryRef.current.shift();
        }

        // Accumulate voiced average spectrum for frozen FFT inspection
        if (rms > 0.015) {
          if (!avgSpectrumRef.current || avgSpectrumRef.current.length !== bufferLength) {
            avgSpectrumRef.current = new Float32Array(bufferLength);
            avgSpectrumCountRef.current = 0;
          }
          for (let i = 0; i < bufferLength; i++) {
            avgSpectrumRef.current[i] += freqData[i];
          }
          avgSpectrumCountRef.current += 1;
        }

        if (viewMode === 'waterfall') {
          drawWaterfall(
            ctx,
            canvas.width,
            canvas.height,
            spectrogramHistoryRef.current,
            sampleRateRef.current,
            fftSizeRef.current,
            null
          );
        } else if (viewMode === 'spectrum') {
          drawSpectrum(
            ctx,
            canvas.width,
            canvas.height,
            freqData,
            sampleRateRef.current,
            fftSizeRef.current
          );
        } else {
          drawLiveWaveform(ctx, canvas.width, canvas.height, timeData);
        }

        animationFrameId.current = requestAnimationFrame(renderLive);
      };

      animationFrameId.current = requestAnimationFrame(renderLive);

      return () => {
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
        }
      };
    }

    // Frozen review mode: keep the captured word spectrogram visible!
    const hasCaptured = spectrogramHistoryRef.current.length > 0;
    const playheadRatio = duration > 0 ? currentTime / duration : null;

    if (!hasCaptured) {
      drawIdleCanvas(ctx, canvas.width, canvas.height);
      return;
    }

    if (viewMode === 'waterfall') {
      drawWaterfall(
        ctx,
        canvas.width,
        canvas.height,
        spectrogramHistoryRef.current,
        sampleRateRef.current,
        fftSizeRef.current,
        playheadRatio
      );
    } else if (viewMode === 'spectrum') {
      let displaySpectrum: Uint8Array;
      if (avgSpectrumRef.current && avgSpectrumCountRef.current > 0) {
        displaySpectrum = new Uint8Array(avgSpectrumRef.current.length);
        for (let i = 0; i < avgSpectrumRef.current.length; i++) {
          displaySpectrum[i] = Math.min(255, Math.round(avgSpectrumRef.current[i] / avgSpectrumCountRef.current));
        }
      } else {
        displaySpectrum = spectrogramHistoryRef.current[Math.floor(spectrogramHistoryRef.current.length / 2)];
      }
      drawSpectrum(
        ctx,
        canvas.width,
        canvas.height,
        displaySpectrum,
        sampleRateRef.current,
        fftSizeRef.current
      );
    } else {
      drawCapturedEnvelope(
        ctx,
        canvas.width,
        canvas.height,
        waveformEnvelopeRef.current,
        playheadRatio
      );
    }
  }, [analyserNode, isRecording, viewMode, exercise, currentTime, duration, measuredMetrics, captureSessionId]);

  // Synchronize HTMLAudioElement playback
  useEffect(() => {
    const player = audioPlayerRef.current;
    if (!player) return;

    const onTimeUpdate = () => setCurrentTime(player.currentTime);
    const onLoadedMetadata = () => {
      if (Number.isFinite(player.duration)) {
        setDuration(player.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    player.addEventListener('timeupdate', onTimeUpdate);
    player.addEventListener('loadedmetadata', onLoadedMetadata);
    player.addEventListener('durationchange', onLoadedMetadata);
    player.addEventListener('ended', onEnded);

    return () => {
      player.removeEventListener('timeupdate', onTimeUpdate);
      player.removeEventListener('loadedmetadata', onLoadedMetadata);
      player.removeEventListener('durationchange', onLoadedMetadata);
      player.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    const player = audioPlayerRef.current;
    if (!player || !audioUrl) return;
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const player = audioPlayerRef.current;
    if (!player) return;
    const t = parseFloat(e.target.value);
    player.currentTime = t;
    setCurrentTime(t);
  };

  const hasCapturedData = spectrogramHistoryRef.current.length > 0;

  return (
    <section className="bg-[#111827] border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between h-full">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-slate-100">
              Espectrograma acústico de tu voz
            </h3>
            {isRecording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                Grabando en vivo
              </span>
            )}
            {!isRecording && hasCapturedData && (
              <span className="text-xs font-medium text-emerald-400">
                Espectro capturado
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            F1 refleja la apertura mandibular y F2 la posición anterior o posterior de la lengua (0–5.5 kHz)
          </p>
        </div>

        {/* Interactive Mode Segmented Tabs */}
        <div className="inline-flex p-1 bg-[#0B0F17] rounded-lg border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('waterfall')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'waterfall'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            Cascada
          </button>
          <button
            type="button"
            onClick={() => setViewMode('spectrum')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'spectrum'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Espectro FFT
          </button>
          <button
            type="button"
            onClick={() => setViewMode('waveform')}
            className={`px-2.5 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'waveform'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Oscilograma
          </button>
        </div>
      </div>

      {/* Acoustic Readout Strip (Unboxed Tabular Metadata) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 py-2.5 text-xs text-slate-400 font-mono tabular-nums">
        <div>
          <span className="text-sky-400 font-semibold">F1 Boca:</span>{' '}
          <span className="text-slate-200">
            {measuredMetrics?.estimatedF1Hz ? `${measuredMetrics.estimatedF1Hz} Hz` : '—'}
          </span>
          {exercise.targetFormants && (
            <span className="text-slate-500"> / meta {exercise.targetFormants.f1} Hz</span>
          )}
        </div>
        <span aria-hidden="true" className="text-slate-700">·</span>
        <div>
          <span className="text-amber-400 font-semibold">F2 Lengua:</span>{' '}
          <span className="text-slate-200">
            {measuredMetrics?.estimatedF2Hz ? `${measuredMetrics.estimatedF2Hz} Hz` : '—'}
          </span>
          {exercise.targetFormants && (
            <span className="text-slate-500"> / meta {exercise.targetFormants.f2} Hz</span>
          )}
        </div>
        {measuredMetrics && (
          <>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <div>
              <span className="text-slate-400">Duración:</span>{' '}
              <span className="text-slate-200">{measuredMetrics.durationSeconds.toFixed(1)}s</span>
            </div>
          </>
        )}
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#090D16]">
        <canvas
          ref={canvasRef}
          width={800}
          height={250}
          className="w-full h-[230px] sm:h-[250px] block"
        />
      </div>

      {/* Playback Bar for Recorded Student Audio */}
      {audioUrl && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={togglePlayback}
              className="w-9 h-9 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={isPlaying ? 'Pausar tu grabación' : 'Reproducir tu grabación'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div className="text-xs">
              <div className="font-medium text-slate-200">Tu grabación</div>
              <div className="text-slate-400 font-mono tabular-nums">
                {currentTime.toFixed(1)}s / {(duration || measuredMetrics?.durationSeconds || 0).toFixed(1)}s
              </div>
            </div>
          </div>

          <div className="w-full sm:flex-1 sm:max-w-md flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={duration || measuredMetrics?.durationSeconds || 1}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Posición de reproducción de tu grabación"
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <audio ref={audioPlayerRef} src={audioUrl} preload="auto" />
        </div>
      )}
    </section>
  );
};
