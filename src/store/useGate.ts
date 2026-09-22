// 数据层：准入台状态仓库（zustand + localStorage 持久化）。
// 只负责数据与状态流转；所有准入判定走 rules/admission，界面只做展示与派发。
import { create } from "zustand";
import type {
  Draft,
  Driver,
  Order,
  Rejection,
  Trip,
  Vehicle
} from "../types";
import { evaluateAdmission } from "../rules/admission";
import { buildOccupancy, internalOverlap } from "../rules/occupancy";
import { nowIso } from "../rules/time";
import { seedDrafts, seedDrivers, seedOrders, seedTrips, seedVehicles } from "../domain/seed";

const STORAGE_KEY = "vehicle-permit-gate-v1";

interface PersistShape {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  trips: Trip[];
  drafts: Draft[];
}

export interface Toast {
  id: string;
  kind: "success" | "error";
  title: string;
  messages?: string[];
}

interface GateState extends PersistShape {
  toasts: Toast[];
  hydratedAt: string;
  // 派生辅助
  orderMap: () => Map<string, Order>;
  driverMap: () => Map<string, Driver>;
  vehicleMap: () => Map<string, Vehicle>;
  occupancy: (excludeDraftVehicle?: string) => ReturnType<typeof buildOccupancy>;
  // 提示
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  // 车道编排（发车前可自由编辑）
  setDraftDriver: (vehicleId: string, driverId: string | null) => void;
  addOrderToDraft: (vehicleId: string, orderId: string) => void;
  moveStopBetweenDrafts: (fromVehicleId: string, toVehicleId: string, orderId: string) => void;
  reorderDraftStops: (vehicleId: string, orderIds: string[]) => void;
  removeDraftStop: (vehicleId: string, orderId: string) => void;
  dispatch: (vehicleId: string) => void;
  // 已发车：锁定 + 改派
  proposeRevision: (
    tripId: string,
    next: { driverId: string; vehicleId: string; stopOrderIds: string[]; reason: string; effectiveAt: string }
  ) => void;
  materializeDueRevisions: () => void;
  completeTrip: (tripId: string) => void;
  // 登记
  addOrder: (order: Omit<Order, "id">) => void;
  addDriver: (driver: Omit<Driver, "id">) => void;
  addVehicle: (vehicle: Omit<Vehicle, "id">) => void;
  resetDemo: () => void;
}

function seed(): PersistShape {
  return {
    orders: seedOrders(),
    drivers: seedDrivers(),
    vehicles: seedVehicles(),
    trips: seedTrips(),
    drafts: seedDrafts()
  };
}

function load(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed.orders && parsed.drivers && parsed.vehicles) {
        return {
          orders: parsed.orders,
          drivers: parsed.drivers,
          vehicles: parsed.vehicles,
          trips: parsed.trips ?? [],
          drafts: parsed.drafts ?? parsed.vehicles.map((v) => ({ vehicleId: v.id, driverId: null, stops: [] }))
        };
      }
    }
  } catch {
    // 损坏数据回退到演示数据
  }
  return seed();
}

function persist(state: GateState) {
  const data: PersistShape = {
    orders: state.orders,
    drivers: state.drivers,
    vehicles: state.vehicles,
    trips: state.trips,
    drafts: state.drafts
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function reject(title: string, rejections: Rejection[]): Omit<Toast, "id"> {
  return { kind: "error", title, messages: rejections.map((r) => r.message) };
}

let tripSeq = 100;

export const useGate = create<GateState>((set, get) => {
  const initial = load();

  function commit(patch: Partial<GateState>) {
    set(patch);
    persist({ ...get(), ...patch } as GateState);
  }

  function ensureDraft(drafts: Draft[], vehicleId: string): Draft[] {
    if (drafts.some((d) => d.vehicleId === vehicleId)) return drafts;
    return [...drafts, { vehicleId, driverId: null, stops: [] }];
  }

  return {
    ...initial,
    toasts: [],
    hydratedAt: nowIso(),

    orderMap: () => new Map(get().orders.map((o) => [o.id, o])),
    driverMap: () => new Map(get().drivers.map((d) => [d.id, d])),
    vehicleMap: () => new Map(get().vehicles.map((v) => [v.id, v])),

    occupancy: (excludeDraftVehicle) =>
      buildOccupancy(get().trips, get().drafts, get().orderMap(), new Date(), excludeDraftVehicle),

    pushToast: (t) => {
      const id = crypto.randomUUID();
      set({ toasts: [...get().toasts, { ...t, id }] });
      window.setTimeout(() => get().dismissToast(id), t.kind === "error" ? 9000 : 4000);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    setDraftDriver: (vehicleId, driverId) => {
      commit({ drafts: ensureDraft(get().drafts, vehicleId).map((d) => (d.vehicleId === vehicleId ? { ...d, driverId } : d)) });
    },

    addOrderToDraft: (vehicleId, orderId) => {
      const state = get();
      const order = state.orderMap().get(orderId);
      const vehicle = state.vehicleMap().get(vehicleId);
      if (!order || !vehicle) return;
      const drafts = ensureDraft(state.drafts, vehicleId);
      const draft = drafts.find((d) => d.vehicleId === vehicleId)!;
      if (draft.stops.some((s) => s.orderId === orderId)) return;
      const driver = draft.driverId ? state.driverMap().get(draft.driverId) ?? null : null;
      const occ = buildOccupancy(state.trips, drafts, state.orderMap(), new Date(), vehicleId);
      const laneOrders = draft.stops.map((s) => state.orderMap().get(s.orderId)!).filter(Boolean);
      const result = evaluateAdmission({
        order,
        driver,
        vehicle,
        laneOrders,
        vehicleBusy: occ.vehicle.get(vehicleId) ?? [],
        driverBusy: driver ? occ.driver.get(driver.id) ?? [] : []
      });
      if (!result.ok) {
        get().pushToast(reject(`整单拒绝：${order.orderNo} 未能装入 ${vehicle.plate}`, result.rejections));
        return;
      }
      commit({
        drafts: drafts.map((d) =>
          d.vehicleId === vehicleId ? { ...d, stops: [...d.stops, { orderId }] } : d
        )
      });
      get().pushToast({ kind: "success", title: `${order.orderNo} 已准入 ${vehicle.plate}` });
    },

    moveStopBetweenDrafts: (fromVehicleId, toVehicleId, orderId) => {
      const state = get();
      if (fromVehicleId === toVehicleId) return;
      const toVehicle = state.vehicleMap().get(toVehicleId);
      const order = state.orderMap().get(orderId);
      if (!toVehicle || !order) return;
      let drafts = ensureDraft(state.drafts, toVehicleId);
      const from = drafts.find((d) => d.vehicleId === fromVehicleId);
      const to = drafts.find((d) => d.vehicleId === toVehicleId)!;
      if (!from || !from.stops.some((s) => s.orderId === orderId)) return;
      // 先模拟移出，再按目标车道准入规则校验
      drafts = drafts.map((d) =>
        d.vehicleId === fromVehicleId ? { ...d, stops: d.stops.filter((s) => s.orderId !== orderId) } : d
      );
      const draftTo = drafts.find((d) => d.vehicleId === toVehicleId)!;
      const driver = draftTo.driverId ? state.driverMap().get(draftTo.driverId) ?? null : null;
      const occ = buildOccupancy(state.trips, drafts, state.orderMap(), new Date(), toVehicleId);
      const laneOrders = draftTo.stops.map((s) => state.orderMap().get(s.orderId)!).filter(Boolean);
      const result = evaluateAdmission({
        order,
        driver,
        vehicle: toVehicle,
        laneOrders,
        vehicleBusy: occ.vehicle.get(toVehicleId) ?? [],
        driverBusy: driver ? occ.driver.get(driver.id) ?? [] : []
      });
      if (!result.ok) {
        get().pushToast(reject(`整单拒绝：${order.orderNo} 不能改投 ${toVehicle.plate}`, result.rejections));
        return; // 不提交：原车道保留
      }
      commit({
        drafts: drafts.map((d) =>
          d.vehicleId === toVehicleId ? { ...d, stops: [...d.stops, { orderId }] } : d
        )
      });
      get().pushToast({ kind: "success", title: `${order.orderNo} 已改投 ${toVehicle.plate}` });
    },

    reorderDraftStops: (vehicleId, orderIds) => {
      const state = get();
      const overlaps = internalOverlap(orderIds, state.orderMap());
      if (overlaps.length > 0) {
        get().pushToast({
          kind: "error",
          title: "顺序调整无效：车道内存在时段重叠",
          messages: overlaps.map((s) => `${s} 时段冲突`)
        });
        return;
      }
      commit({
        drafts: state.drafts.map((d) =>
          d.vehicleId === vehicleId ? { ...d, stops: orderIds.map((orderId) => ({ orderId })) } : d
        )
      });
    },

    removeDraftStop: (vehicleId, orderId) => {
      commit({
        drafts: get().drafts.map((d) =>
          d.vehicleId === vehicleId ? { ...d, stops: d.stops.filter((s) => s.orderId !== orderId) } : d
        )
      });
    },

    dispatch: (vehicleId) => {
      const state = get();
      const draft = state.drafts.find((d) => d.vehicleId === vehicleId);
      const vehicle = state.vehicleMap().get(vehicleId);
      if (!draft || !vehicle) return;
      if (!draft.driverId) {
        get().pushToast({ kind: "error", title: "无法发车：请先指定司机" });
        return;
      }
      if (draft.stops.length === 0) {
        get().pushToast({ kind: "error", title: "无法发车：车道为空" });
        return;
      }
      const driver = state.driverMap().get(draft.driverId);
      if (!driver) return;
      // 发车前再整体复核一遍准入（防止登记信息在编排后被改动）
      const occ = buildOccupancy(state.trips, state.drafts, state.orderMap(), new Date(), vehicleId);
      const laneOrders = draft.stops.map((s) => state.orderMap().get(s.orderId)!).filter(Boolean);
      const failed: Rejection[] = [];
      const seen = new Set<string>();
      for (const order of laneOrders) {
        const others = laneOrders.filter((o) => o.id !== order.id);
        const r = evaluateAdmission({
          order,
          driver,
          vehicle,
          laneOrders: others,
          vehicleBusy: occ.vehicle.get(vehicleId) ?? [],
          driverBusy: occ.driver.get(driver.id) ?? []
        });
        for (const rejection of r.rejections) {
          if (!seen.has(rejection.message)) {
            seen.add(rejection.message);
            failed.push(rejection);
          }
        }
      }
      if (failed.length > 0) {
        get().pushToast(reject(`禁止发车：${vehicle.plate} 车道存在不合规装载`, failed));
        return;
      }
      const trip: Trip = {
        id: `trip-${++tripSeq}`,
        tripNo: `TRIP-${String(tripSeq).padStart(3, "0")}`,
        status: "已发车",
        dispatchedAt: nowIso(),
        versions: [
          {
            version: 1,
            driverId: driver.id,
            vehicleId,
            stops: draft.stops.map((s) => ({ orderId: s.orderId })),
            reason: "首版排班（准入台校验通过后发车锁定）",
            createdAt: nowIso()
          }
        ]
      };
      commit({
        trips: [trip, ...state.trips],
        // 清空该车道，锁定司机/车辆/顺序到车次版本中
        drafts: state.drafts.map((d) => (d.vehicleId === vehicleId ? { ...d, stops: [] } : d))
      });
      get().pushToast({ kind: "success", title: `${vehicle.plate} 已发车：${trip.tripNo}，司机、车辆与顺序已锁定` });
    },

    proposeRevision: (tripId, next) => {
      const state = get();
      const trip = state.trips.find((t) => t.id === tripId);
      if (!trip) return;
      if (trip.status === "已完成") {
        get().pushToast({ kind: "error", title: "车次已完成，不可改派" });
        return;
      }
      if (!next.reason.trim()) {
        get().pushToast({ kind: "error", title: "改派必须填写原因" });
        return;
      }
      if (new Date(next.effectiveAt).getTime() <= Date.now()) {
        get().pushToast({ kind: "error", title: "生效时间必须晚于当前时间" });
        return;
      }
      if (next.stopOrderIds.length === 0) {
        get().pushToast({ kind: "error", title: "改派后车次不能为空" });
        return;
      }
      const driver = state.driverMap().get(next.driverId);
      const vehicle = state.vehicleMap().get(next.vehicleId);
      if (!driver || !vehicle) return;
      // 校验新版本：把该车次当前占用与已有待生效修订从外部占用中剔除（视作将被替换），
      // 但其他车次/草稿占用仍然生效。
      const otherTrips = state.trips.filter((t) => t.id !== tripId);
      const occ = buildOccupancy(otherTrips, state.drafts, state.orderMap(), new Date());
      const laneOrders = next.stopOrderIds.map((id) => state.orderMap().get(id)!).filter(Boolean);
      const failed: Rejection[] = [];
      const seen = new Set<string>();
      for (const order of laneOrders) {
        const others = laneOrders.filter((o) => o.id !== order.id);
        const r = evaluateAdmission({
          order,
          driver,
          vehicle,
          laneOrders: others,
          vehicleBusy: occ.vehicle.get(vehicle.id) ?? [],
          driverBusy: occ.driver.get(driver.id) ?? []
        });
        for (const rejection of r.rejections) {
          if (!seen.has(rejection.message)) {
            seen.add(rejection.message);
            failed.push(rejection);
          }
        }
      }
      if (failed.length > 0) {
        get().pushToast(reject(`改派被拒绝：新版本不满足准入规则`, failed));
        return;
      }
      const nextVersionNo = trip.versions.length + 1;
      commit({
        trips: state.trips.map((t) =>
          t.id === tripId
            ? {
                ...t,
                pendingRevision: {
                  version: nextVersionNo,
                  driverId: next.driverId,
                  vehicleId: next.vehicleId,
                  stops: next.stopOrderIds.map((orderId) => ({ orderId })),
                  reason: next.reason.trim(),
                  createdAt: nowIso(),
                  effectiveAt: next.effectiveAt
                }
              }
            : t
        )
      });
      get().pushToast({
        kind: "success",
        title: `改派已登记（v${nextVersionNo}）：原占用保留至 ${new Date(next.effectiveAt).toLocaleString("zh-CN")} 生效后释放`
      });
    },

    materializeDueRevisions: () => {
      const state = get();
      const now = new Date();
      let changed = false;
      const trips = state.trips.map((trip) => {
        if (trip.pendingRevision && new Date(trip.pendingRevision.effectiveAt).getTime() <= now.getTime()) {
          changed = true;
          const { version, driverId, vehicleId, stops, reason, createdAt } = trip.pendingRevision;
          return {
            ...trip,
            versions: [...trip.versions, { version, driverId, vehicleId, stops, reason, createdAt }],
            pendingRevision: undefined
          };
        }
        return trip;
      });
      if (changed) {
        commit({ trips });
        get().pushToast({ kind: "success", title: "改派修订已生效：原司机/车辆占用已释放，按新版本执行" });
      }
    },

    completeTrip: (tripId) => {
      commit({
        trips: get().trips.map((t) =>
          t.id === tripId ? { ...t, status: "已完成", completedAt: nowIso() } : t
        )
      });
    },

    addOrder: (order) => {
      commit({ orders: [{ ...order, id: crypto.randomUUID() }, ...get().orders] });
      get().pushToast({ kind: "success", title: `订单 ${order.orderNo} 已登记` });
    },
    addDriver: (driver) => {
      commit({ drivers: [...get().drivers, { ...driver, id: crypto.randomUUID() }] });
      get().pushToast({ kind: "success", title: `司机 ${driver.name} 已登记` });
    },
    addVehicle: (vehicle) => {
      const withVehicle: Vehicle = { ...vehicle, id: crypto.randomUUID() };
      commit({
        vehicles: [...get().vehicles, withVehicle],
        drafts: ensureDraft(get().drafts, withVehicle.id)
      });
      get().pushToast({ kind: "success", title: `车辆 ${vehicle.plate} 已登记并开通车道` });
    },

    resetDemo: () => {
      const fresh = seed();
      commit({ ...fresh, toasts: [], hydratedAt: nowIso() });
      get().pushToast({ kind: "success", title: "已重置为演示数据" });
    }
  };
});
