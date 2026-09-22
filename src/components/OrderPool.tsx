import { useMemo, useState } from "react";
import type { TempClass } from "../types";
import { useGate } from "../store/useGate";
import { DraggableOrder } from "./DraggableOrder";
import { TempBadge } from "./shared";

const FILTERS = ["全部温层", "常温", "冷藏", "冷冻"] as const;

export function OrderPool() {
  const orders = useGate((s) => s.orders);
  const trips = useGate((s) => s.trips);
  const drafts = useGate((s) => s.drafts);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("全部温层");

  // 已分配 = 已在车次任意现行/待生效版本或车道草稿中的订单
  const assigned = useMemo(() => {
    const set = new Set<string>();
    for (const trip of trips) {
      trip.versions[trip.versions.length - 1].stops.forEach((s) => set.add(s.orderId));
      trip.pendingRevision?.stops.forEach((s) => set.add(s.orderId));
    }
    for (const draft of drafts) draft.stops.forEach((s) => set.add(s.orderId));
    return set;
  }, [trips, drafts]);

  const pool = orders
    .filter((o) => !assigned.has(o.id))
    .filter((o) => filter === "全部温层" || o.tempClass === (filter as TempClass));

  return (
    <section className="panel pool-panel">
      <div className="panel-head">
        <div>
          <h2>待分配订单池</h2>
          <p className="panel-hint">拖入任一车辆车道即触发准入校验；任一规则不通过则整单拒绝，订单留在池中。</p>
        </div>
        <div className="pool-tools">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${filter === f ? " chip-on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "全部温层" ? f : <TempBadge value={f as TempClass} />}
            </button>
          ))}
          <span className="pool-count">{pool.length} 单</span>
        </div>
      </div>
      <div className="pool-grid">
        {pool.length === 0 ? (
          <div className="empty-inline">没有待分配订单（全部已排班或被温层过滤）</div>
        ) : (
          pool.map((order) => <DraggableOrder key={order.id} order={order} />)
        )}
      </div>
    </section>
  );
}
