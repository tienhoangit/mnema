/**
 * Simplified SuperMemo SM-2 algorithm for Daily Reviews
 */
export interface SRSState {
  reviewCount: number;
  easeFactor: number;
  intervalDays: number;
}

export function calculateNextReview(
  current: SRSState,
  action: 'remember' | 'forget' | 'discard'
): {
  reviewCount: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: string;
  isInReviewQueue: boolean;
} {
  if (action === 'discard') {
    return {
      reviewCount: current.reviewCount,
      easeFactor: current.easeFactor,
      intervalDays: current.intervalDays,
      nextReviewAt: new Date(Date.now() + 365 * 10 * 86400000).toISOString(),
      isInReviewQueue: false,
    };
  }

  let { reviewCount, easeFactor, intervalDays } = current;

  if (action === 'remember') {
    if (reviewCount === 0) {
      intervalDays = 1;
    } else if (reviewCount === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    reviewCount += 1;
    // Ease factor slightly increases on successful recall (max 2.8)
    easeFactor = Math.min(2.8, easeFactor + 0.1);
  } else {
    // Forgot: reset review count and set short interval
    reviewCount = 0;
    intervalDays = 1;
    // Ease factor penalizes lapse (min 1.3)
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + intervalDays);

  return {
    reviewCount,
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    nextReviewAt: nextDate.toISOString(),
    isInReviewQueue: true,
  };
}

export type SM2Quality = 0 | 3 | 4 | 5;

/**
 * Full SuperMemo SM-2 calculation for graded recall quality (0, 3, 4, 5).
 */
export function calculateSM2ByQuality(
  current: SRSState,
  quality: SM2Quality
): {
  reviewCount: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: string;
  isInReviewQueue: boolean;
} {
  let { reviewCount, easeFactor, intervalDays } = current;

  if (quality < 3) {
    reviewCount = 0;
    intervalDays = 1;
  } else {
    if (reviewCount === 0) {
      intervalDays = 1;
    } else if (reviewCount === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }
    reviewCount += 1;
  }

  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  easeFactor = Math.min(2.8, Math.max(1.3, easeFactor + delta));

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + intervalDays);

  return {
    reviewCount,
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    nextReviewAt: nextDate.toISOString(),
    isInReviewQueue: true,
  };
}
