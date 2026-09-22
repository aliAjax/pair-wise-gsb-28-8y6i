import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { useGate } from "./store/useGate";
import { checkConsistency } from "./rules/occupancy";
import { OrderPool } from "./components/OrderPool";
import { GateBoard } from "./components/GateBoard";
import { TripsPanel } from "./components/TripsPanel";
import { Registry } from "./components/Registry";
import { Toasts } from "./components/Toasts";
import { DraggableOrder, type DragData } from "./components/DraggableOrder";
import { OrderCardBody } from "./components/shared";

function ConsistencyBar() {
  const trips = useGate((s) => s.trips);
  const drafts = useGate((s) => s.drafts);
  const vehicles = useGate((s) => s.vehicles);
  const drivers = useGate((s) => s.drivers);
  const orders = useGate((s) => s.orders);
  const hydratedAt = useGate((s) => s.hydratedAt);

  const report = useMemo(
    () =>
      checkConsistency(
        trips,
        drafts,
        new Map(vehicles.map((v) => [v.id, v])),
        new Map(drivers.map((d) => [d.id, d])),
        new Map(orders.map((o) => [o.id, o]))
      ),
    [trips, drafts, vehicles, drivers, orders]
  );

  return (
    <footer className="consistency">
      <span className={`cons-dot ${report.ok ? "ok" : "bad"}`} />
      {report.ok ? (
        <span>
          刷新一致性校验通过：车辆占用由 {report.tripCount} 个车次版本链（含 {report.pendingCount} 个待生效改派）与 {report.draftCount} 条车道统一推导 · 本页数据加载于 {new Date(hydratedAt).toLocaleString("zh-CN")}
        </span>
      ) : (
        <span>一致性异常：{report.issues.join("；")}</span>
      )}
    </footer>
  );
}

function Metrics() {
  const orders = useGate((s) => s.orders);
  const trips = useGate((s) => s.trips);
  const drafts = useGate((s) => s.drafts);
  const drivers = useGate((s) => s.drivers);
  const vehicles = useGate((s) => s.vehicles);

  const assigned = new Set<string>();
  for (const trip of trips) {
    trip.versions[trip.versions.length - 1].stops.forEach((s) => assigned.add(s.orderId));
    trip.pendingRevision?.stops.forEach((s) => assigned.add(s.orderId));
  }
  drafts.forEach((d) => d.stops.forEach((s) => assigned.add(s.orderId)));
  const pendingCount = orders.length - assigned.size;
  const expiredDrivers = drivers.filter((d) =>
    Object.values(d.certExpiries).some((expiry) => new Date(`${expiry}T23:59:59`).getTime() < Date.now())
  ).length;

  const items = [
    { label: "待分配订单", value: pendingCount },
    { label: "在途/完成车次", value: trips.length },
    { label: "待生效改派", value: trips.filter((t) => t.pendingRevision).length },
    { label: "证照过期司机", value: expiredDrivers, danger: expiredDrivers > 0 },
    { label: "车辆车道", value: vehicles.length }
  ];

  return (
    <section className="metrics">
      {items.map((item) => (
        <article className={`metric${item.danger ? " metric-danger" : ""}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}

export default function App() {
  const orders = useGate((s) => s.orders);
  const materialize = useGate((s) => s.materializeDueRevisions);
  const addOrderToDraft = useGate((s) => s.addOrderToDraft);
  const moveStop = useGate((s) => s.moveStopBetweenDrafts);
  const resetDemo = useGate((s) => s.resetDemo);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 每秒检查待生效改派是否到点：到点即物化新版本、释放原占用
  useEffect(() => {
    materialize();
    const timer = window.setInterval(materialize, 1000);
    return () => window.clearInterval(timer);
  }, [materialize]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeOrder = useMemo(() => {
    if (!activeId) return null;
    const match = activeId.match(/^(?:pool|stop:[^:]+):(.+)$/);
    if (!match) return null;
    return orders.find((o) => o.id === match[1]) ?? null;
  }, [activeId, orders]);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const data = event.active.data.current as DragData | undefined;
    const overId = event.over ? String(event.over.id) : null;
    if (!data || !overId || !overId.startsWith("lane:")) return;
    const targetVehicle = overId.slice("lane:".length);
    if (data.from) {
      moveStop(data.from, targetVehicle, data.orderId);
    } else {
      addOrderToDraft(targetVehicle, data.orderId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <main className="app">
        <div className="shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">物流 · 车辆通行证准入台</p>
              <h1>配送排班 × 通行证准入</h1>
              <p className="subtitle">
                订单拖入车道即校验：证照有效期与准驾、核载重、温层、通行证目的地区域、车辆与司机时段重叠——任一不过整单拒绝。
                发车后锁定司机/车辆/顺序；改派必须写原因并生成新版本，原占用保留到修订生效才释放。
              </p>
            </div>
            <div className="top-actions">
              <div className="stack">
                {["React", "TypeScript", "dnd-kit", "zustand", "数据/规则/界面分层"].map((item) => (
                  <span className="tag" key={item}>{item}</span>
                ))}
              </div>
              <button type="button" className="secondary reset-btn" onClick={resetDemo}>重置演示数据</button>
            </div>
          </header>

          <Metrics />
          <OrderPool />
          <GateBoard />
          <TripsPanel />
          <Registry />
          <ConsistencyBar />
        </div>
      </main>

      <DragOverlay dropAnimation={null}>
        {activeOrder ? (
          <div className="drag-overlay-card">
            <article className="order-card">
              <OrderCardBody order={activeOrder} compact />
            </article>
          </div>
        ) : null}
      </DragOverlay>
      <Toasts />
    </DndContext>
  );
}
