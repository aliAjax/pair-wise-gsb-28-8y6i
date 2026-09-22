// 界面层：车道上的派单卡。待发车可拖拽改派/排序；已发车锁定只读。

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button, Popconfirm, Tag, Tooltip } from "antd";
import type { Assignment, Driver, Order, Vehicle } from "../data/types";
import { useScheduleStore } from "../state/store";
import { STATUS_META, TEMP_COLOR } from "./meta";

interface Props {
  assignment: Assignment;
  order: Order | undefined;
  driver: Driver | undefined;
  vehicle: Vehicle;
  onReassign: (a: Assignment) => void;
}

export function AssignmentCard({ assignment, order, driver, vehicle, onReassign }: Props) {
  const cancel = useScheduleStore((s) => s.cancel);
  const complete = useScheduleStore((s) => s.complete);
  const approveRevision = useScheduleStore((s) => s.approveRevision);
  const rejectRevision = useScheduleStore((s) => s.rejectRevision);

  const locked = assignment.status === "dispatched";
  const draggable = useDraggable({
    id: `asg-${assignment.id}`,
    disabled: assignment.status !== "scheduled",
    data: { kind: "assignment", assignmentId: assignment.id, vehicleId: assignment.vehicleId },
  });
  const droppable = useDroppable({
    id: `slot-${assignment.id}`,
    disabled: assignment.status !== "scheduled",
    data: { kind: "slot", vehicleId: assignment.vehicleId, assignmentId: assignment.id },
  });

  const status = STATUS_META[assignment.status];
  const setRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };

  if (!order) return null;

  return (
    <div
      ref={setRef}
      className={[
        "asg-card",
        `asg-${assignment.status}`,
        draggable.isDragging ? "dragging" : "",
        droppable.isOver ? "is-over" : "",
      ].join(" ")}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      {...(locked ? {} : draggable.listeners)}
      {...(locked ? {} : draggable.attributes)}
      title={locked ? "已发车：司机、车辆、顺序已锁定，如需变更请改派" : "可在车道内拖拽排序，或拖到其他车道"}
    >
      <div className="order-card-head">
        <strong>
          {locked ? <span className="lock">🔒</span> : null}
          {order.orderNo}
          <span className="ver">v{assignment.version}</span>
        </strong>
        <Tag color={status.color}>{status.label}</Tag>
      </div>
      <div className="order-card-body">
        <span>📍 {order.region}</span>
        <span>🕒 {assignment.window}</span>
        <span>⚖ {order.weightKg}kg</span>
        <Tag color={TEMP_COLOR[order.tempLayer]} style={{ marginInlineStart: 0 }}>
          {order.tempLayer}
        </Tag>
      </div>
      <p className="asg-meta">
        司机：{driver?.name ?? "—"} · {vehicle.plate}
        {locked && typeof assignment.seq === "number" ? ` · 顺序 ${assignment.seq + 1}` : ""}
      </p>
      {assignment.reason ? <p className="asg-reason">改派原因：{assignment.reason}</p> : null}

      <div className="asg-actions" onClick={(e) => e.stopPropagation()}>
        {assignment.status === "scheduled" && (
          <>
            <Button size="small" onClick={() => onReassign(assignment)}>
              改派
            </Button>
            <Popconfirm title="撤回该待发车派单？占用立即释放" onConfirm={() => cancel(assignment.id)}>
              <Button size="small" danger>
                撤回
              </Button>
            </Popconfirm>
          </>
        )}
        {assignment.status === "dispatched" && (
          <>
            <Button size="small" onClick={() => onReassign(assignment)}>
              改派
            </Button>
            <Button size="small" type="primary" onClick={() => complete(assignment.id)}>
              送达完成
            </Button>
          </>
        )}
        {assignment.status === "revising" && (
          <>
            <Tooltip title="按当前数据重新校验；通过则原子替换原版本，原占用此刻释放；不通过则修订驳回并留痕">
              <Button size="small" type="primary" onClick={() => approveRevision(assignment.rootId)}>
                批准生效
              </Button>
            </Tooltip>
            <Button size="small" danger onClick={() => rejectRevision(assignment.rootId)}>
              驳回
            </Button>
            <Button size="small" onClick={() => cancel(assignment.id)}>
              撤回申请
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
