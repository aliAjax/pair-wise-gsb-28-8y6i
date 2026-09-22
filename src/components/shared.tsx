import type { Order, TempClass, TimeWindow } from "../types";
import { daysUntil, formatWindow, isCertValid } from "../rules/time";

export const tempColor: Record<TempClass, string> = {
  常温: "#445069",
  冷藏: "#176b87",
  冷冻: "#5a4fcf"
};

export function TempBadge({ value }: { value: TempClass }) {
  return (
    <span className="pill" style={{ color: tempColor[value], background: `${tempColor[value]}18`, borderColor: `${tempColor[value]}44` }}>
      {value}
    </span>
  );
}

export function WindowText({ window }: { window: TimeWindow }) {
  return <span className="window-text">{formatWindow(window)}</span>;
}

export function OrderCardBody({ order, compact }: { order: Order; compact?: boolean }) {
  return (
    <>
      <div className="card-line">
        <span className="order-no">{order.orderNo}</span>
        <TempBadge value={order.tempClass} />
      </div>
      <div className="card-line sub">
        <span>📍 {order.region}{compact ? "" : ` · ${order.address}`}</span>
        <span className="weight">{order.weight}kg</span>
      </div>
      <div className="card-line sub">
        <WindowText window={order.window} />
      </div>
      {!compact && order.note && <p className="card-note">{order.note}</p>}
    </>
  );
}

export function certState(expiry: string): { cls: string; text: string } {
  if (!isCertValid(expiry)) return { cls: "cert-expired", text: `已过期 · ${expiry}` };
  const days = daysUntil(expiry);
  if (days <= 7) return { cls: "cert-warn", text: `${days} 天后到期 · ${expiry}` };
  return { cls: "cert-ok", text: `有效至 ${expiry}` };
}
