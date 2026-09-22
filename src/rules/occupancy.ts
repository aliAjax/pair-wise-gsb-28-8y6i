// 规则层：占用与版本链派生。只从 assignments 读取并计算，不修改状态。

import type { Assignment, Order, RevisionChain, Vehicle } from "../data/types";
import { windowsOverlap } from "../data/seed";

/** 当前仍占用车辆时段的记录：待发车 / 已发车 / 改派占位（revising） */
export function activeOccupancy(assignments: Assignment[]): Assignment[] {
  return assignments.filter((a) =>
    a.status === "scheduled" || a.status === "dispatched" || a.status === "revising"
  );
}

/** 车辆在指定时段是否被占用（可选忽略某版本链/记录自身） */
export function vehicleBusy(
  assignments: Assignment[],
  vehicleId: string,
  window: Assignment["window"],
  opts: { ignoreRootId?: string; selfId?: string } = {}
): boolean {
  return activeOccupancy(assignments).some(
    (a) =>
      a.id !== opts.selfId &&
      a.rootId !== opts.ignoreRootId &&
      a.vehicleId === vehicleId &&
      windowsOverlap(a.window, window)
  );
}

/** 版本链：以 rootId 分组，按版本号升序；head 为当前生效/最新节点 */
export function buildChains(assignments: Assignment[]): Map<string, RevisionChain> {
  const map = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = map.get(a.rootId) ?? [];
    list.push(a);
    map.set(a.rootId, list);
  }
  const chains = new Map<string, RevisionChain>();
  for (const [rootId, list] of map) {
    const nodes = [...list].sort((x, y) => x.version - y.version);
    const head = nodes[nodes.length - 1];
    chains.set(rootId, { rootId, orderId: head.orderId, head, nodes });
  }
  return chains;
}

/** 车道内展示顺序：已发车按锁定 seq 在前列队，其后是改派占位、待发车（按 seq，其次创建时间） */
export function laneOrdering(assignments: Assignment[], vehicleId: string): Assignment[] {
  const inLane = activeOccupancy(assignments).filter((a) => a.vehicleId === vehicleId);
  const locked = inLane.filter((a) => a.status === "dispatched").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const rest = inLane
    .filter((a) => a.status !== "dispatched")
    .sort((a, b) => {
      // revising 占位没有 seq，始终附在待发车之后；待发车之间按 seq
      if (a.status === "revising" && b.status === "revising") return a.createdAt.localeCompare(b.createdAt);
      if (a.status === "revising") return 1;
      if (b.status === "revising") return -1;
      if (a.seq !== b.seq) return (a.seq ?? 0) - (b.seq ?? 0);
      return a.createdAt.localeCompare(b.createdAt);
    });
  return [...locked, ...rest];
}

/** 某订单是否已处于占用中（待分配池之外） */
export function orderOccupiedBy(
  assignments: Assignment[],
  orderId: string
): Assignment | undefined {
  return activeOccupancy(assignments).find((a) => a.orderId === orderId);
}

export interface LaneSummary {
  vehicle: Vehicle;
  items: Assignment[];
  loadKg: number;
  orderIds: Set<string>;
}

/** 汇总每辆车当前承载（仅 scheduled+dispatched+revising 的订单，去重计版本链） */
export function summarizeLanes(
  vehicles: Vehicle[],
  assignments: Assignment[],
  orders: Order[]
): LaneSummary[] {
  const weightById = new Map(orders.map((o) => [o.id, o.weightKg]));
  return vehicles.map((vehicle) => {
    const items = laneOrdering(assignments, vehicle.id);
    const rootSeen = new Set<string>();
    let loadKg = 0;
    const orderIds = new Set<string>();
    for (const a of items) {
      orderIds.add(a.orderId);
      if (!rootSeen.has(a.rootId)) {
        rootSeen.add(a.rootId);
        // revising 期间原单可能在别的车，本车只计占位版本自身代表的负载
        loadKg += weightById.get(a.orderId) ?? 0;
      }
    }
    return { vehicle, items, loadKg, orderIds };
  });
}
