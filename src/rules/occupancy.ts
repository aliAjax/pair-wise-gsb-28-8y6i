// 规则层：占用推导与一致性。
// 车辆/司机的占用从「已发车车次的当前版本 + 待生效改派 + 车道草稿」统一推导。
// 待生效改派的语义：修订生效前，原占用不释放、新占用也已预占（双占防止两边都被塞单）。
import type { Draft, Driver, Order, Trip, Vehicle } from "../types";
import type { OccupiedWindow } from "./admission";
import { overlaps } from "./time";

interface TripLikeStops {
  driverId: string;
  vehicleId: string;
  stops: { orderId: string }[];
  reason: string;
  createdAt: string;
}

/** 取一次排班里每个资源占用的订单时段 */
function collectStops(
  source: TripLikeStops,
  orders: Map<string, Order>,
  out: { vehicle: Map<string, OccupiedWindow[]>; driver: Map<string, OccupiedWindow[]> },
  labelPrefix: string
) {
  for (const stop of source.stops) {
    const order = orders.get(stop.orderId);
    if (!order) continue;
    const label = `${labelPrefix} · ${order.orderNo}`;
    const push = (map: Map<string, OccupiedWindow[]>, key: string) => {
      const list = map.get(key) ?? [];
      list.push({ window: order.window, label });
      map.set(key, list);
    };
    push(out.vehicle, source.vehicleId);
    push(out.driver, source.driverId);
  }
}

export interface OccupancyIndex {
  vehicle: Map<string, OccupiedWindow[]>;
  driver: Map<string, OccupiedWindow[]>;
  /** 已被任何版本/草稿使用的订单（用于订单池去重） */
  assignedOrderIds: Set<string>;
}

/**
 * 全量推导当前占用。
 * @param excludeDraftVehicle 拖入校验时，当前车道草稿自身不计入外部占用
 */
export function buildOccupancy(
  trips: Trip[],
  drafts: Draft[],
  orders: Map<string, Order>,
  now: Date,
  excludeDraftVehicle?: string
): OccupancyIndex {
  const index: OccupancyIndex = {
    vehicle: new Map(),
    driver: new Map(),
    assignedOrderIds: new Set()
  };

  for (const trip of trips) {
    const current = trip.versions[trip.versions.length - 1];
    const effectiveAt = trip.pendingRevision ? new Date(trip.pendingRevision.effectiveAt) : null;
    if (trip.pendingRevision && effectiveAt && effectiveAt.getTime() <= now.getTime()) {
      // 理论上进入此函数前已物化；防御性处理，以新版本为准
      collectStops(trip.pendingRevision, orders, index, `${trip.tripNo} v${trip.pendingRevision.version}`);
      trip.pendingRevision.stops.forEach((s) => index.assignedOrderIds.add(s.orderId));
    } else {
      collectStops(current, orders, index, `${trip.tripNo} v${current.version}（现行）`);
      current.stops.forEach((s) => index.assignedOrderIds.add(s.orderId));
      if (trip.pendingRevision) {
        // 生效前新占用也预占，避免在过渡期把资源再卖一次
        collectStops(trip.pendingRevision, orders, index, `${trip.tripNo} v${trip.pendingRevision.version}（待生效）`);
        trip.pendingRevision.stops.forEach((s) => index.assignedOrderIds.add(s.orderId));
      }
    }
  }

  for (const draft of drafts) {
    if (!draft.driverId) continue;
    if (excludeDraftVehicle && draft.vehicleId === excludeDraftVehicle) {
      draft.stops.forEach((s) => index.assignedOrderIds.add(s.orderId));
      continue;
    }
    collectStops(
      { driverId: draft.driverId, vehicleId: draft.vehicleId, stops: draft.stops, reason: "草稿", createdAt: "" },
      orders,
      index,
      "车道草稿"
    );
    draft.stops.forEach((s) => index.assignedOrderIds.add(s.orderId));
  }

  return index;
}

/** 草稿自身订单之间的重叠校验（改派/排序后复核用） */
export function internalOverlap(orderIds: string[], orders: Map<string, Order>): string[] {
  const hits: string[] = [];
  const list = orderIds.map((id) => orders.get(id)).filter((o): o is Order => Boolean(o));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (overlaps(list[i].window, list[j].window)) {
        hits.push(`${list[i].orderNo} 与 ${list[j].orderNo}`);
      }
    }
  }
  return hits;
}

export interface ConsistencyReport {
  ok: boolean;
  issues: string[];
  tripCount: number;
  pendingCount: number;
  draftCount: number;
}

/** 刷新后自检：同一车次版本链连续、待生效修订存在、无幽灵资源引用 */
export function checkConsistency(
  trips: Trip[],
  drafts: Draft[],
  vehicles: Map<string, Vehicle>,
  drivers: Map<string, Driver>,
  orders: Map<string, Order>
): ConsistencyReport {
  const issues: string[] = [];

  for (const trip of trips) {
    // 版本链：版本号从 1 连续递增
    trip.versions.forEach((v, i) => {
      if (v.version !== i + 1) {
        issues.push(`${trip.tripNo} 版本链断裂：第 ${i + 1} 个版本号为 v${v.version}`);
      }
    });
    const chainStops = new Set<string>();
    for (const v of trip.versions) {
      if (!drivers.has(v.driverId)) issues.push(`${trip.tripNo} v${v.version} 引用了已删除的司机`);
      if (!vehicles.has(v.vehicleId)) issues.push(`${trip.tripNo} v${v.version} 引用了已删除的车辆`);
      v.stops.forEach((s) => {
        if (!orders.has(s.orderId)) issues.push(`${trip.tripNo} v${v.version} 引用了已删除的订单 ${s.orderId}`);
        chainStops.add(s.orderId);
      });
    }
    if (trip.pendingRevision) {
      if (trip.pendingRevision.version !== trip.versions.length + 1) {
        issues.push(`${trip.tripNo} 待生效修订版本号不连续`);
      }
      if (!trip.pendingRevision.reason.trim()) {
        issues.push(`${trip.tripNo} 存在缺少改派原因的待生效修订`);
      }
    }
  }

  for (const draft of drafts) {
    if (!vehicles.has(draft.vehicleId)) issues.push("存在指向已删除车辆的车道草稿");
    if (draft.driverId && !drivers.has(draft.driverId)) issues.push("车道草稿引用了已删除的司机");
  }

  return {
    ok: issues.length === 0,
    issues,
    tripCount: trips.length,
    pendingCount: trips.filter((t) => t.pendingRevision).length,
    draftCount: drafts.length
  };
}
