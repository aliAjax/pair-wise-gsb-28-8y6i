// 界面层：车辆通行证准入台的一条车道

import { useDroppable } from "@dnd-kit/core";
import { Badge, Button, Select, Tag, Tooltip } from "antd";
import type { Assignment, Driver, Vehicle } from "../data/types";
import { todayStr } from "../rules/validation";
import { useScheduleStore } from "../state/store";
import { AssignmentCard } from "./AssignmentCard";

interface Props {
  vehicle: Vehicle;
  items: Assignment[];
  loadKg: number;
  drivers: Driver[];
  onReassign: (a: Assignment) => void;
}

export function VehicleLane({ vehicle, items, loadKg, drivers, onReassign }: Props) {
  const orders = useScheduleStore((s) => s.orders);
  const laneDrivers = useScheduleStore((s) => s.laneDrivers);
  const setLaneDriver = useScheduleStore((s) => s.setLaneDriver);
  const dispatchLane = useScheduleStore((s) => s.dispatchLane);
  const { setNodeRef, isOver } = useDroppable({
    id: `lane-${vehicle.id}`,
    data: { kind: "lane", vehicleId: vehicle.id },
  });

  const driverId = laneDrivers[vehicle.id];
  const today = todayStr();
  const permitExpired = vehicle.permitExpiry < today;
  const overload = loadKg > vehicle.capacityKg;
  const scheduled = items.filter((a) => a.status === "scheduled");
  const hasDispatched = items.some((a) => a.status === "dispatched");

  return (
    <section className={`lane${isOver ? " over" : ""}`}>
      <header className="lane-head">
        <div>
          <p className="lane-plate">
            {vehicle.plate}{" "}
            <Badge
              status={permitExpired ? "error" : "success"}
              text={permitExpired ? "通行证过期" : "通行证有效"}
            />
          </p>
          <p className="lane-spec">
            {vehicle.type} · 核载 {vehicle.capacityKg}kg · 温区
            {vehicle.zones.map((z) => (
              <Tag key={z} style={{ marginInline: 2 }}>
                {z}
              </Tag>
            ))}
          </p>
          <p className="lane-spec">
            通行证区域：{vehicle.permitRegions.join("、")} · 有效期至 {vehicle.permitExpiry}
          </p>
        </div>
      </header>

      <label className="lane-driver">
        当班司机
        <Select
          size="small"
          style={{ width: "100%" }}
          value={driverId}
          onChange={(value) => setLaneDriver(vehicle.id, value)}
          options={drivers.map((d) => {
            const expired = d.licenseExpiry < today || d.qualificationExpiry < today;
            return {
              value: d.id,
              label: `${d.name}（${d.licenseClass}${expired ? "·证照过期" : ""}）`,
            };
          })}
        />
      </label>

      <div ref={setNodeRef} className="lane-body">
        {items.length === 0 ? <div className="lane-empty">拖入订单 / 待发车任务</div> : null}
        {items.map((a) => (
          <AssignmentCard
            key={a.id}
            assignment={a}
            order={orders.find((o) => o.id === a.orderId)}
            driver={drivers.find((d) => d.id === a.driverId)}
            vehicle={vehicle}
            onReassign={onReassign}
          />
        ))}
      </div>

      <footer className="lane-foot">
        <Tooltip title="当前在途/待发重量（含改派占位）">
          <span className={overload ? "load warn" : "load"}>
            占用 {loadKg}/{vehicle.capacityKg}kg
          </span>
        </Tooltip>
        <Button
          size="small"
          type="primary"
          disabled={scheduled.length === 0}
          onClick={() => dispatchLane(vehicle.id)}
        >
          {hasDispatched ? "发车（剩余待发）" : "整车发车"}
        </Button>
      </footer>
    </section>
  );
}
