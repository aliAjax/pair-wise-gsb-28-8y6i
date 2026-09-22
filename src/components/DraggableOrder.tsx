import { useDraggable } from "@dnd-kit/core";
import type { Order } from "../types";
import { OrderCardBody } from "./shared";

export interface DragData {
  kind: "order";
  orderId: string;
  from?: string; // 来源车道 vehicleId；undefined 表示来自待分配订单池
}

export function DraggableOrder({ order, from, ghost }: { order: Order; from?: string; ghost?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: from ? `stop:${from}:${order.id}` : `pool:${order.id}`,
    data: { kind: "order", orderId: order.id, from } satisfies DragData
  });

  return (
    <article
      ref={setNodeRef}
      className={`order-card${ghost ? " ghost" : ""}${isDragging ? " dragging" : ""}`}
      {...listeners}
      {...attributes}
      title="拖拽到下方车辆车道进行准入校验"
    >
      <OrderCardBody order={order} compact={ghost} />
    </article>
  );
}
