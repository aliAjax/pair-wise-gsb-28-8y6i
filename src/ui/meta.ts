// 界面层：展示用小工具

import type { AssignmentStatus, RejectCode } from "../data/types";
import { REJECT_META } from "../rules/validation";

export const STATUS_META: Record<AssignmentStatus, { label: string; color: string }> = {
  scheduled: { label: "待发车", color: "blue" },
  dispatched: { label: "已发车·锁定", color: "green" },
  revising: { label: "改派中", color: "orange" },
  superseded: { label: "已被替代", color: "default" },
  rejected: { label: "修订驳回", color: "red" },
  completed: { label: "已完成", color: "default" },
};

export const TEMP_COLOR: Record<string, string> = {
  常温: "default",
  冷藏: "cyan",
  冷冻: "geekblue",
};

export function rejectLabel(code: RejectCode): string {
  return REJECT_META[code].label;
}

export function rejectText(codes: RejectCode[]): string {
  return codes.map(rejectLabel).join("、") || "校验未通过";
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
