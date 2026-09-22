// 界面层：待分配订单池（可拖拽源）

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Tag } from "antd";
import type { Order } from "../data/types";
import { TEMP_COLOR } from "./meta";

export function OrderCard({ order }: { order: Order }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order-${order.id}`,
    data: { kind: "order", orderId: order.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`order-card${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      title="拖到右侧车辆车道"
    >
      <div className="order-card-head">
        <strong>{order.orderNo}</strong>
        <Tag color={TEMP_COLOR[order.tempLayer]}>{order.tempLayer}</Tag>
      </div>
      <div className="order-card-body">
        <span>📍 {order.region}</span>
        <span>🕒 {order.window}</span>
        <span>⚖ {order.weightKg}kg</span>
      </div>
      {order.note ? <p className="order-card-note">{order.note}</p> : null}
    </div>
  );
}
