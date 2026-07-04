export const numberField = {
  money: {
    min: "0",
    step: "1",
  },
  ratePerMinute: {
    min: "0",
    step: "1",
  },
  count: {
    min: "0",
    step: "1",
  },
  positiveCount: {
    min: "1",
    step: "1",
  },
  workDays: {
    min: "1",
    max: "31",
    step: "1",
  },
  minutes: {
    min: "0",
    step: "1",
  },
  percent: {
    min: "0",
    max: "100",
    step: "0.01",
  },
} as const;

export function wholeNumber(value: string, fallback = 0) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

export function positiveWholeNumber(value: string, fallback = 1) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
}

export function moneyNumber(value: string, fallback = 0) {
  return wholeNumber(value, fallback);
}

export function percentToFraction(value: string, fallback = 0) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) / 100 : fallback / 100;
}

export function fractionToPercent(value: number | null | undefined, fallback = 0) {
  const parsed = Number(value ?? fallback);
  const fraction = Number.isFinite(parsed) ? parsed : fallback;
  return String(Number((fraction * 100).toFixed(2)));
}
