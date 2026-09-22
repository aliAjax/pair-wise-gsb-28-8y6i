// 界面层根组件：编排待分配池、车辆通行证准入台车道、台账与拖拽落点判定。

import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { message, Popconfirm, Tabs, Tag } from "antd";
import type { Assignment } from "./data/types";
import { activeOccupancy, buildChains, orderOccupiedBy, summarizeLanes } from "./rules/occupancy";
import { useScheduleStore } from "./state/store";
import { OrderCard } from "./ui/OrderCard";
import { VehicleLane } from "./ui/VehicleLane";
import { ReassignModal } from "./ui/ReassignModal";
import { OrderEntry } from "./ui/OrderEntry";
import { RegistryPanel } from "./ui/RegistryPanel";
import { AuditPanel } from "./ui/AuditPanel";
import { rejectText } from "./ui/meta";

function toastResult(r: { ok: boolean; codes: import("./data/types").RejectCode[] }) {
  if (r.ok) {
    message.success("准入通过，已排入车道");
  } else if (r.codes.length) {
    message.error(`整单拒绝：${rejectText(r.codes)}`);
  }
}

export default function App() {
  const vehicles = useScheduleStore((s) => s.vehicles);
  const drivers = useScheduleStore((s) => s.drivers);
  const orders = useScheduleStore((s) => s.orders);
  const assignments = useScheduleStore((s) => s.assignments);
  const rejections = useScheduleStore((s) => s.rejections);
  const assign = useScheduleStore((s) => s.assign);
  const reorder = useScheduleStore((s) => s.reorder);
  const moveToLane = useScheduleStore((s) => s.moveToLane);
  const resetDemo = useScheduleStore((s) => s.resetDemo);

  const [reassignTarget, setReassignTarget] = useState<Assignment | null>(null);
  const [tab, setTab] = useState("registry-drivers");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
  );

  const lanes = useMemo(() => summarizeLanes(vehicles, assignments, orders), [vehicles, assignments, orders]);
  const occupancy = activeOccupancy(assignments);
  const pendingOrders = orders.filter((o) => !orderOccupiedBy(assignments, o.id));

  const chains = buildChains(assignments);
  const dispatchedCount = assignments.filter((a) => a.status === "dispatched").length;
  const revisingCount = assignments.filter((a) => a.status === "revising").length;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData) return;

    // 订单卡 → 车道
    if (activeData.kind === "order" && (overData.kind === "lane" || overData.kind === "slot")) {
      const targetVehicleId = overData.vehicleId as string;
      toastResult(assign(activeData.orderId as string, targetVehicleId));
      return;
    }

    // 派单卡 → 另一车道 / 同车道插槽
    if (activeData.kind === "assignment") {
      const sourceVehicleId = activeData.vehicleId as string;
      const targetVehicleId = overData.vehicleId as string;
      if (overData.kind === "slot" && sourceVehicleId === targetVehicleId) {
        reorder(sourceVehicleId, activeData.assignmentId as string, overData.assignmentId as string);
        return;
      }
      if (overData.kind === "lane" || overData.kind === "slot") {
        toastResult(moveToLane(activeData.assignmentId as string, targetVehicleId));
      }
    }
  };

  const metrics = [
    { label: "待分配订单", value: pendingOrders.length },
    { label: "车辆占用中", value: occupancy.length },
    { label: "已发车锁定", value: dispatchedCount },
    { label: "改派待生效", value: revisingCount },
    { label: "整单拒绝留痕", value: rejections.length },
  ];

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">物流行业前端闭环 · 数据 / 规则 / 界面分层</p>
            <h1>车辆通行证准入台</h1>
            <p className="subtitle">
              待分配订单拖入车辆车道即执行准入：证照有效期、准驾资质、载重、温层、通行证区域与车辆时段重叠，
              任一不符整单拒绝并留痕。发车后锁定司机、车辆与顺序；改派须填原因生成新版本，原占用到修订生效才释放。
            </p>
          </div>
          <div className="head-side">
            <div className="stack">
              {["React", "dnd-kit", "Zustand", "Ant Design"].map((t) => (
                <span className="tag" key={t}>{t}</span>
              ))}
            </div>
            <Popconfirm
              title="重置演示数据？所有派单、版本链与留痕将清空"
              onConfirm={resetDemo}
            >
              <button className="reset-btn" type="button">重置演示数据</button>
            </Popconfirm>
          </div>
        </header>

        <section className="metrics">
          {metrics.map((m) => (
            <article className="metric" key={m.label}>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </article>
          ))}
        </section>

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <section className="board">
            <aside className="pool">
              <h2>
                待分配订单
                <Tag>{pendingOrders.length}</Tag>
              </h2>
              <div className="pool-list">
                {pendingOrders.length === 0 ? (
                  <div className="empty">所有订单均已占用或完成</div>
                ) : (
                  pendingOrders.map((o) => <OrderCard key={o.id} order={o} />)
                )}
              </div>
              <OrderEntry />
            </aside>

            <div className="lanes">
              {lanes.map((lane) => (
                <VehicleLane
                  key={lane.vehicle.id}
                  vehicle={lane.vehicle}
                  items={lane.items}
                  loadKg={lane.loadKg}
                  drivers={drivers}
                  onReassign={setReassignTarget}
                />
              ))}
            </div>
          </section>
        </DndContext>

        <section className="ledgers">
          <h2>登记与审计台账</h2>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: "registry-drivers",
                label: "司机登记",
                children: <RegistryPanel tab="drivers" />,
              },
              {
                key: "registry-vehicles",
                label: "车辆通行证",
                children: <RegistryPanel tab="vehicles" />,
              },
              {
                key: "audit-rejections",
                label: `准入拒绝${rejections.length ? `（${rejections.length}）` : ""}`,
                children: <AuditPanel tab="rejections" />,
              },
              {
                key: "audit-chains",
                label: `改派版本链${chains.size ? `（${chains.size}）` : ""}`,
                children: <AuditPanel tab="chains" />,
              },
            ]}
          />
        </section>
      </div>

      <ReassignModal assignment={reassignTarget} onClose={() => setReassignTarget(null)} />
    </main>
  );
}
