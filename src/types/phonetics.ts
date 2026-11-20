export interface FrenchExercise {
  id: string;
  word: string;
  translation: string;
  ipa: string;
  difficulty: 'Débutant' | 'Intermédiaire' | 'Avancé';
  category: string;
  focusSound: string;
  focusDescription: string;
  articulatoryGuide: {
    tongue: string;
    lips: string;
    jaw: string;
    nasality: string;
    stress: string;
  };
  sampleTip: string;
  targetFormants?: {
    f1: number; // Hz (apertura de boca / mandíbula)
    f2: number; // Hz (posición anterior/posterior de la lengua)
  };
}

export interface PhoneticLesson {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  targetSound: string;
  ipaSymbol: string;
  description: string;
  physicalSecret: string;
  acousticHint: string;
  exercises: FrenchExercise[];
}

export interface AcousticMetrics {
  durationSeconds: number;
  peakRms: number;
  avgRms: number;
  estimatedF1Hz: number | null;
  estimatedF2Hz: number | null;
  dominantCentroidHz: number | null;
  targetF1?: number;
  targetF2?: number;
}

export type DiagnosisStatus = 'correct' | 'needs_adjustment' | 'incorrect';

export interface AnatomicalDiagnosisItem {
  status: DiagnosisStatus;
  description: string;
  targetPosition?: string;
}

export interface ArticulatoryDiagnosis {
  tongue: AnatomicalDiagnosisItem;
  lipsAndMouth: AnatomicalDiagnosisItem;
  nasalityAndVelum: AnatomicalDiagnosisItem;
  accentuationAndRhythm: AnatomicalDiagnosisItem;
  uvulaOrConsonants: AnatomicalDiagnosisItem;
}

export interface DetectedArticulatoryPose {
  tonguePosition: 'front_high' | 'front_mid' | 'back_high' | 'low_flat' | 'alveolar_tap' | 'uvular_back';
  mouthOpening: 'closed' | 'medium' | 'too_open';
  lipShape: 'rounded' | 'spread' | 'open' | 'neutral';
  velumLowered: boolean;
}

export interface PhoneticAnalysisResult {
  isAudible: boolean;
  overallScore: number;
  detectedIpa: string;
  targetIpa: string;
  summaryFeedback: string;
  anatomicalDiagnosis: ArticulatoryDiagnosis;
  detectedPose?: DetectedArticulatoryPose;
  physicalExerciseTip: string;
  commonMistakeExplanation: string;
  acousticFormantsAdvice: string;
  recommendedExercises: string[];
  timestamp?: number;
}

export interface PracticeHistoryItem {
  id: string;
  word: string;
  detectedIpa: string;
  targetIpa: string;
  score: number;
  sound: string;
  summary: string;
  date: number;
}
