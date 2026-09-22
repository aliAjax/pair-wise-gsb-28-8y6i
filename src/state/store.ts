// 状态层：领域数据与所有写入动作。规则一律走 rules/，界面只调用这里的动作。

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Assignment,
  Driver,
  Order,
  RejectionRecord,
  RejectCode,
  Vehicle,
} from "../data/types";
import { SEED_DRIVERS, SEED_ORDERS, SEED_VEHICLES } from "../data/seed";
import { activeOccupancy, laneOrdering } from "../rules/occupancy";
import { evaluate, todayStr } from "../rules/validation";

interface ScheduleState {
  drivers: Driver[];
  vehicles: Vehicle[];
  orders: Order[];
  assignments: Assignment[];
  rejections: RejectionRecord[];
  /** 每辆车当前当班司机（车辆通行证准入台的车道选择） */
  laneDrivers: Record<string, string>;

  setLaneDriver: (vehicleId: string, driverId: string) => void;
  addOrder: (input: Omit<Order, "id" | "createdAt">) => void;
  addDriver: (input: Omit<Driver, "id">) => void;
  addVehicle: (input: Omit<Vehicle, "id">) => void;

  /** 拖入车道：规则不过则整单拒绝并留痕 */
  assign: (orderId: string, vehicleId: string) => { ok: boolean; codes: RejectCode[] };
  /** 车道内对待发车任务排序（已发车不可动） */
  reorder: (vehicleId: string, activeId: string, overId: string) => void;
  /** 待发车任务跨车道移动：按目标车道当班司机重新走准入 */
  moveToLane: (assignmentId: string, targetVehicleId: string) => { ok: boolean; codes: RejectCode[] };
  /** 撤回待发车派单 / 撤回改派申请 */
  cancel: (assignmentId: string) => void;
  /** 整车道发车：锁定司机、车辆与顺序 */
  dispatchLane: (vehicleId: string) => void;
  /** 送达完成 */
  complete: (assignmentId: string) => void;

  /** 改派：填写原因 → 生成 revising 新版本，原占用不释放 */
  requestReassign: (
    rootId: string,
    targetVehicleId: string,
    targetDriverId: string,
    reason: string
  ) => { ok: boolean; codes: RejectCode[] };
  /** 修订生效：重新校验，通过则原子替换（旧占用此刻释放） */
  approveRevision: (rootId: string) => { ok: boolean; codes: RejectCode[] };
  /** 驳回修订：版本保留为 rejected，原占用不变 */
  rejectRevision: (rootId: string) => void;

  resetDemo: () => void;
}

/** 车道内下一个 seq：避开所有现有占用（含已发车锁定的顺位） */
const nextSeq = (assignments: Assignment[], vehicleId: string) =>
  activeOccupancy(assignments).filter((a) => a.vehicleId === vehicleId).length;

/** 链头：仍在占用（scheduled/dispatched）的最新版本；不存在才退化为最新节点 */
const headOf = (assignments: Assignment[], rootId: string) => {
  const chain = assignments.filter((a) => a.rootId === rootId).sort((a, b) => b.version - a.version);
  return chain.find((a) => a.status === "scheduled" || a.status === "dispatched") ?? chain[0];
};

function runEvaluate(state: ScheduleState, params: {
  orderId: string;
  vehicleId: string;
  driverId: string | null;
  ignoreRootId?: string;
  selfId?: string;
}) {
  const order = state.orders.find((o) => o.id === params.orderId) ?? null;
  const vehicle = state.vehicles.find((v) => v.id === params.vehicleId) ?? null;
  const driver = state.drivers.find((d) => d.id === params.driverId) ?? null;
  if (!order || !vehicle) {
    return { ok: false, codes: [] as RejectCode[], order: null, vehicle: null, driver };
  }
  const result = evaluate({
    order,
    vehicle,
    driver,
    occupancy: activeOccupancy(state.assignments),
    ignoreRootId: params.ignoreRootId,
    selfId: params.selfId,
    today: todayStr(),
  });
  return { ...result, order, vehicle, driver };
}

function logRejection(
  rejections: RejectionRecord[],
  p: { orderId: string; vehicleId: string | null; driverId: string | null; codes: RejectCode[] }
): RejectionRecord[] {
  return [
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      orderId: p.orderId,
      vehicleId: p.vehicleId,
      driverId: p.driverId,
      codes: p.codes,
    },
    ...rejections,
  ].slice(0, 100);
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      drivers: SEED_DRIVERS,
      vehicles: SEED_VEHICLES,
      orders: SEED_ORDERS,
      assignments: [],
      rejections: [],
      laneDrivers: Object.fromEntries(SEED_VEHICLES.map((v) => [v.id, "drv-liu"])),

      setLaneDriver: (vehicleId, driverId) =>
        set((s) => ({ laneDrivers: { ...s.laneDrivers, [vehicleId]: driverId } })),

      addOrder: (input) =>
        set((s) => ({
          orders: [{ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...s.orders],
        })),

      addDriver: (input) => set((s) => ({ drivers: [...s.drivers, { ...input, id: crypto.randomUUID() }] })),

      addVehicle: (input) =>
        set((s) => {
          const id = crypto.randomUUID();
          return {
            vehicles: [...s.vehicles, { ...input, id }],
            laneDrivers: { ...s.laneDrivers, [id]: s.drivers[0]?.id ?? "" },
          };
        }),

      assign: (orderId, vehicleId) => {
        const state = get();
        const driverId = state.laneDrivers[vehicleId] ?? null;
        const r = runEvaluate(state, { orderId, vehicleId, driverId });
        if (!r.ok || !r.order || !r.vehicle) {
          set((s) => ({
            rejections: logRejection(s.rejections, { orderId, vehicleId, driverId, codes: r.codes }),
          }));
          return { ok: false, codes: r.codes };
        }
        const id = crypto.randomUUID();
        const assignment: Assignment = {
          id,
          rootId: id,
          parentId: null,
          version: 1,
          orderId,
          vehicleId,
          driverId: driverId as string,
          window: r.order.window,
          status: "scheduled",
          seq: nextSeq(state.assignments, vehicleId),
          reason: null,
          createdAt: new Date().toISOString(),
          dispatchedAt: null,
        };
        set((s) => ({ assignments: [...s.assignments, assignment] }));
        return { ok: true, codes: [] };
      },

      reorder: (vehicleId, activeId, overId) =>
        set((s) => {
          if (activeId === overId) return s;
          // 仅待发车可排序，顺序与界面展示一致（按 seq，其次创建时间）
          const lane = activeOccupancy(s.assignments)
            .filter((a) => a.vehicleId === vehicleId && a.status === "scheduled")
            .sort((a, b) =>
              a.seq !== b.seq ? (a.seq ?? 0) - (b.seq ?? 0) : a.createdAt.localeCompare(b.createdAt)
            );
          const from = lane.findIndex((a) => a.id === activeId);
          const to = lane.findIndex((a) => a.id === overId);
          if (from < 0 || to < 0) return s;
          const ids = lane.map((a) => a.id);
          const [moved] = ids.splice(from, 1);
          ids.splice(to, 0, moved);
          const seqById = new Map(ids.map((id, i) => [id, i]));
          return {
            assignments: s.assignments.map((a) =>
              seqById.has(a.id) ? { ...a, seq: seqById.get(a.id)! } : a
            ),
          };
        }),

      moveToLane: (assignmentId, targetVehicleId) => {
        const state = get();
        const current = state.assignments.find((a) => a.id === assignmentId);
        if (!current || current.status !== "scheduled") return { ok: false, codes: [] };
        if (current.vehicleId === targetVehicleId) return { ok: true, codes: [] };
        const driverId = state.laneDrivers[targetVehicleId] ?? null;
        const r = runEvaluate(state, {
          orderId: current.orderId,
          vehicleId: targetVehicleId,
          driverId,
          ignoreRootId: current.rootId,
          selfId: current.id,
        });
        if (!r.ok) {
          set((s) => ({
            rejections: logRejection(s.rejections, {
              orderId: current.orderId,
              vehicleId: targetVehicleId,
              driverId,
              codes: r.codes,
            }),
          }));
          return { ok: false, codes: r.codes };
        }
        set((s) => ({
          assignments: s.assignments.map((a) =>
            a.id === assignmentId
              ? {
                  ...a,
                  vehicleId: targetVehicleId,
                  driverId: driverId as string,
                  seq: nextSeq(s.assignments, targetVehicleId),
                }
              : a
          ),
        }));
        return { ok: true, codes: [] };
      },

      cancel: (assignmentId) =>
        set((s) => {
          const target = s.assignments.find((a) => a.id === assignmentId);
          if (!target) return s;
          if (target.status === "scheduled") {
            return { assignments: s.assignments.filter((a) => a.id !== assignmentId) };
          }
          if (target.status === "revising") {
            // 撤回改派申请：新版本废弃，原版本继续占用
            return {
              assignments: s.assignments.filter((a) => a.id !== assignmentId),
            };
          }
          return s;
        }),

      dispatchLane: (vehicleId) =>
        set((s) => {
          const stampedAt = new Date().toISOString();
          // 按车道当前已排好的顺序锁定（laneOrdering：已发车在前，待发车按 seq）
          const orderedScheduled = laneOrdering(s.assignments, vehicleId).filter(
            (a) => a.status === "scheduled"
          );
          const baseSeq = s.assignments.filter(
            (a) => a.vehicleId === vehicleId && a.status === "dispatched"
          ).length;
          const seqById = new Map(orderedScheduled.map((a, i) => [a.id, baseSeq + i]));
          return {
            assignments: s.assignments.map((a) =>
              seqById.has(a.id)
                ? { ...a, status: "dispatched" as const, seq: seqById.get(a.id)!, dispatchedAt: stampedAt }
                : a
            ),
          };
        }),

      complete: (assignmentId) =>
        set((s) => ({
          assignments: s.assignments.map((a) =>
            a.id === assignmentId && a.status === "dispatched" ? { ...a, status: "completed" } : a
          ),
        })),

      requestReassign: (rootId, targetVehicleId, targetDriverId, reason) => {
        const state = get();
        const head = headOf(state.assignments, rootId);
        if (!head || (head.status !== "scheduled" && head.status !== "dispatched")) {
          return { ok: false, codes: [] };
        }
        const alreadyRevising = state.assignments.some(
          (a) => a.rootId === rootId && a.status === "revising"
        );
        if (alreadyRevising) return { ok: false, codes: [] };

        const r = runEvaluate(state, {
          orderId: head.orderId,
          vehicleId: targetVehicleId,
          driverId: targetDriverId || null,
          ignoreRootId: rootId,
        });
        if (!r.ok) {
          set((s) => ({
            rejections: logRejection(s.rejections, {
              orderId: head.orderId,
              vehicleId: targetVehicleId,
              driverId: targetDriverId || null,
              codes: r.codes,
            }),
          }));
          return { ok: false, codes: r.codes };
        }
        const revision: Assignment = {
          id: crypto.randomUUID(),
          rootId,
          parentId: head.id,
          version: head.version + 1,
          orderId: head.orderId,
          vehicleId: targetVehicleId,
          driverId: targetDriverId,
          window: head.window,
          status: "revising",
          seq: null,
          reason: reason.trim(),
          createdAt: new Date().toISOString(),
          dispatchedAt: null,
        };
        set((s) => ({ assignments: [...s.assignments, revision] }));
        return { ok: true, codes: [] };
      },

      approveRevision: (rootId) => {
        const state = get();
        const revision = state.assignments.find(
          (a) => a.rootId === rootId && a.status === "revising"
        );
        if (!revision) return { ok: false, codes: [] };
        // 生效前用最新数据重新校验（期间可能新增占用/证照变化）
        const r = runEvaluate(state, {
          orderId: revision.orderId,
          vehicleId: revision.vehicleId,
          driverId: revision.driverId,
          ignoreRootId: rootId,
          selfId: revision.id,
        });
        if (!r.ok) {
          set((s) => ({
            assignments: s.assignments.map((a) =>
              a.id === revision.id ? { ...a, status: "rejected" } : a
            ),
            rejections: logRejection(s.rejections, {
              orderId: revision.orderId,
              vehicleId: revision.vehicleId,
              driverId: revision.driverId,
              codes: r.codes,
            }),
          }));
          return { ok: false, codes: r.codes };
        }
        // 原子替换：旧 head 置为 superseded（原占用在此刻才释放），新版本进入待发车
        set((s) => ({
          assignments: s.assignments.map((a) => {
            if (a.rootId !== rootId) return a;
            if (a.id === revision.id) {
              return {
                ...a,
                status: "scheduled",
                seq: nextSeq(s.assignments, a.vehicleId),
              };
            }
            const isOldHead =
              a.status === "scheduled" || a.status === "dispatched";
            return isOldHead ? { ...a, status: "superseded" as const } : a;
          }),
        }));
        return { ok: true, codes: [] };
      },

      rejectRevision: (rootId) =>
        set((s) => ({
          assignments: s.assignments.map((a) =>
            a.rootId === rootId && a.status === "revising" ? { ...a, status: "rejected" } : a
          ),
        })),

      resetDemo: () =>
        set({
          drivers: SEED_DRIVERS.map((d) => ({ ...d })),
          vehicles: SEED_VEHICLES.map((v) => ({ ...v })),
          orders: SEED_ORDERS.map((o) => ({ ...o })),
          assignments: [],
          rejections: [],
          laneDrivers: Object.fromEntries(SEED_VEHICLES.map((v) => [v.id, "drv-liu"])),
        }),
    }),
    {
      name: "hxwlfront-14-permit-gate-v1",
      partialize: (s) => ({
        drivers: s.drivers,
        vehicles: s.vehicles,
        orders: s.orders,
        assignments: s.assignments,
        rejections: s.rejections,
        laneDrivers: s.laneDrivers,
      }),
    }
  )
);
