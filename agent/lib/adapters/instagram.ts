// Instagram (Meta official API) contract (stage 4). Includes the metric rules
// that reports must follow so missing data is never shown as zero.

import { NotConnectedError } from "./not-connected.ts";

export type MetricPeriod = "day" | "week" | "days_28" | "lifetime";

export interface MetricValue {
  name: string;
  value: number | null; // null = source did not return it
  period: MetricPeriod;
  unit: string;
  account: string;
  source: string;
  fetchedAt: Date;
}

export function formatMetric(m: MetricValue): string {
  const value = m.value === null ? "ma’lumot yo‘q" : `${m.value} ${m.unit}`.trim();
  return `${m.name}: ${value} (davr: ${m.period}, akkaunt: ${m.account}, manba: ${m.source}, yangilangan: ${m.fetchedAt.toISOString()})`;
}

/** Percentage change, or null when the base is zero/missing (never invented). */
export function pctChange(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Metrics from different periods must never be combined. */
export function assertSamePeriod(values: MetricValue[]): void {
  const periods = new Set(values.map((v) => v.period));
  if (periods.size > 1) throw new Error(`Turli davrdagi ko‘rsatkichlar aralashtirilmaydi: ${[...periods].join(", ")}`);
}

export interface InstagramAdapter {
  readonly name: string;
  fetchAccountInsights(account: string, period: MetricPeriod): Promise<MetricValue[]>;
}

export const instagram: InstagramAdapter = {
  name: "instagram-graph",
  async fetchAccountInsights() {
    throw new NotConnectedError("Instagram", "Jonli statistika yo‘q. Skrinshot yoki CSV yuborsangiz, shu asosda tahlil qilinadi.");
  },
};
