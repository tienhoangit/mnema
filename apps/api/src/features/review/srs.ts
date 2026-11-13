import { createEmptyCard, fsrs, Grade, Rating, State, type Card } from 'ts-fsrs';

/**
 * Spaced Repetition Scheduler powered by FSRS (ts-fsrs) with seamless SM-2 migration.
 */
export interface SRSState {
  reviewCount: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt?: string | null;
  fsrsState?: number | null;
  fsrsStability?: number | null;
  fsrsDifficulty?: number | null;
  fsrsReps?: number | null;
  fsrsLapses?: number | null;
  fsrsLastReview?: string | null;
}

export interface SRSResult {
  reviewCount: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: string;
  isInReviewQueue: boolean;
  fsrsState: number;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsReps: number;
  fsrsLapses: number;
  fsrsLastReview: string;
}

export type ReviewAction =
  | 'remember'
  | 'forget'
  | 'discard'
  | 'again'
  | 'hard'
  | 'good'
  | 'easy';

export type SM2Quality = 0 | 3 | 4 | 5;

const scheduler = fsrs({ enable_fuzz: true });

function toFsrsCard(current: SRSState, now: Date): Card {
  if (
    current.fsrsState !== null &&
    current.fsrsState !== undefined &&
    current.fsrsStability !== null &&
    current.fsrsStability !== undefined &&
    current.fsrsDifficulty !== null &&
    current.fsrsDifficulty !== undefined
  ) {
    const lastReview = current.fsrsLastReview ? new Date(current.fsrsLastReview) : undefined;
    return {
      due: current.nextReviewAt ? new Date(current.nextReviewAt) : now,
      stability: current.fsrsStability,
      difficulty: current.fsrsDifficulty,
      scheduled_days: Math.max(0, current.intervalDays || 0),
      learning_steps: 0,
      reps: current.fsrsReps ?? current.reviewCount ?? 0,
      lapses: current.fsrsLapses ?? 0,
      state: current.fsrsState as State,
      last_review: lastReview,
    };
  }

  // Migrate legacy SM-2 reviewed highlights seamlessly into FSRS Review state
  if ((current.reviewCount || 0) > 0) {
    const interval = Math.max(1, current.intervalDays || 1);
    const difficulty = Math.min(10, Math.max(1, 5 + (2.5 - (current.easeFactor || 2.5)) * 4));
    const lastReview = new Date(now.getTime() - interval * 86400000);
    return {
      due: current.nextReviewAt ? new Date(current.nextReviewAt) : now,
      stability: interval,
      difficulty,
      scheduled_days: interval,
      learning_steps: 0,
      reps: current.reviewCount,
      lapses: 0,
      state: State.Review,
      last_review: lastReview,
    };
  }

  return createEmptyCard(now);
}

function actionToGrade(action: Exclude<ReviewAction, 'discard'>): Grade {
  switch (action) {
    case 'again':
    case 'forget':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'easy':
      return Rating.Easy;
    case 'good':
    case 'remember':
    default:
      return Rating.Good;
  }
}

export function calculateNextReview(
  current: SRSState,
  action: ReviewAction,
  now: Date = new Date()
): SRSResult {
  if (action === 'discard') {
    return {
      reviewCount: current.reviewCount,
      easeFactor: current.easeFactor,
      intervalDays: current.intervalDays,
      nextReviewAt: new Date(now.getTime() + 365 * 10 * 86400000).toISOString(),
      isInReviewQueue: false,
      fsrsState: current.fsrsState ?? State.New,
      fsrsStability: current.fsrsStability ?? 0,
      fsrsDifficulty: current.fsrsDifficulty ?? 0,
      fsrsReps: current.fsrsReps ?? current.reviewCount,
      fsrsLapses: current.fsrsLapses ?? 0,
      fsrsLastReview: current.fsrsLastReview ?? now.toISOString(),
    };
  }

  const card = toFsrsCard(current, now);
  const grade = actionToGrade(action);
  const { card: nextCard } = scheduler.next(card, now, grade);

  const intervalDays = Math.max(
    0,
    Math.round((nextCard.due.getTime() - now.getTime()) / 86400000)
  );
  const roundedDifficulty = Math.round(nextCard.difficulty * 1000) / 1000;
  const roundedStability = Math.round(nextCard.stability * 1000) / 1000;

  return {
    reviewCount: nextCard.reps,
    easeFactor: current.easeFactor || 2.5,
    intervalDays,
    nextReviewAt: nextCard.due.toISOString(),
    isInReviewQueue: true,
    fsrsState: nextCard.state,
    fsrsStability: roundedStability,
    fsrsDifficulty: roundedDifficulty,
    fsrsReps: nextCard.reps,
    fsrsLapses: nextCard.lapses,
    fsrsLastReview: (nextCard.last_review || now).toISOString(),
  };
}

/**
 * Graded SM-2 quality (0, 3, 4, 5) mapped onto FSRS for Telegram inline callbacks.
 */
export function calculateSM2ByQuality(current: SRSState, quality: SM2Quality): SRSResult {
  const actionMap: Record<SM2Quality, Exclude<ReviewAction, 'discard'>> = {
    0: 'again',
    3: 'hard',
    4: 'good',
    5: 'easy',
  };
  return calculateNextReview(current, actionMap[quality]);
}
