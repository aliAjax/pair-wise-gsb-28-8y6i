// 规则层：时段工具。日期 + HH:mm 转可比较的分钟数。
import type { TimeWindow } from "../types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function windowStart(w: TimeWindow): number {
  const [h, m] = w.start.split(":").map(Number);
  return new Date(`${w.date}T00:00:00`).getTime() / 60000 + h * 60 + m;
}

export function windowEnd(w: TimeWindow): number {
  const [h, m] = w.end.split(":").map(Number);
  return new Date(`${w.date}T00:00:00`).getTime() / 60000 + h * 60 + m;
}

/** 半开区间重叠判定：[aStart,aEnd) 与 [bStart,bEnd) */
export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return windowStart(a) < windowEnd(b) && windowStart(b) < windowEnd(a);
}

export function formatWindow(w: TimeWindow): string {
  return `${w.date} ${w.start}–${w.end}`;
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 证照是否有效：有效期当天仍视为有效，次日 00:00 起过期 */
export function isCertValid(expiry: string, at: Date = new Date()): boolean {
  const end = new Date(`${expiry}T23:59:59`);
  return at.getTime() <= end.getTime();
}

export function daysUntil(date: string, at: Date = new Date()): number {
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(at).setHours(0, 0, 0, 0)) / 86400000);
}
