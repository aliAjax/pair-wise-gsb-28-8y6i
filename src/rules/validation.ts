// 规则层：准入校验。纯函数，不依赖 React / localStorage，便于单测与复用。

import type {
  Assignment,
  DayWindow,
  Driver,
  Order,
  RejectCode,
  Vehicle,
  VehicleType,
  LicenseClass,
} from "../data/types";
import { windowsOverlap } from "../data/seed";

export function todayStr(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isExpired(dateStr: string, today: string): boolean {
  return dateStr < today;
}

const LICENSE_RANK: Record<LicenseClass, number> = { A2: 3, B2: 2, C1: 1 };

/** 各车型要求的最低准驾车型 */
const REQUIRED_CLASS: Record<VehicleType, LicenseClass> = {
  大型货车: "B2",
  中型货车: "B2",
  轻型货车: "C1",
};

export const REJECT_META: Record<RejectCode, { label: string; message: string }> = {
  NO_DRIVER: { label: "未配司机", message: "车道未选择当班司机，整单拒绝" },
  LICENSE_EXPIRED: { label: "驾驶证过期", message: "司机驾驶证已过期，整单拒绝" },
  QUALIFICATION_EXPIRED: { label: "资格证过期", message: "货运资格证已过期，整单拒绝" },
  LICENSE_CLASS: { label: "准驾不符", message: "司机准驾车型不满足该车辆要求，整单拒绝" },
  TEMP_QUALIFICATION: { label: "冷链资质不符", message: "司机无该温层押运资质，整单拒绝" },
  OVERWEIGHT: { label: "超载", message: "订单实重超过车辆核载，整单拒绝" },
  TEMP_ZONE: { label: "温层不符", message: "车辆温区不支持订单温层，整单拒绝" },
  PERMIT_REGION: { label: "通行证不覆盖", message: "车辆通行证范围不覆盖目的地，整单拒绝" },
  PERMIT_EXPIRED: { label: "通行证过期", message: "车辆通行证已过期，整单拒绝" },
  WINDOW_OVERLAP: { label: "时段重叠", message: "车辆在该送达时段已有任务占用，整单拒绝" },
};

export interface EvaluationContext {
  order: Pick<Order, "id" | "region" | "window" | "weightKg" | "tempLayer">;
  vehicle: Vehicle | null;
  driver: Driver | null;
  /** 当前所有占用记录（scheduled/dispatched/revising） */
  occupancy: Assignment[];
  /** 修订校验时，忽略同一版本链的原占用（修订生效后会原子替换） */
  ignoreRootId?: string;
  selfId?: string;
  today: string;
}

export interface EvaluationResult {
  ok: boolean;
  codes: RejectCode[];
  messages: string[];
}

/**
 * 执行全部准入规则；任一不通过即整单拒绝，返回所有命中的拒绝原因。
 * 规则顺序即上面 RejectCode 的业务含义，与界面文案解耦（见 REJECT_META）。
 */
export function evaluate(ctx: EvaluationContext): EvaluationResult {
  const { order, vehicle, driver, occupancy, ignoreRootId, selfId, today } = ctx;
  const codes: RejectCode[] = [];

  // 1. 司机与证照
  if (!driver) {
    codes.push("NO_DRIVER");
  } else {
    if (isExpired(driver.licenseExpiry, today)) codes.push("LICENSE_EXPIRED");
    if (isExpired(driver.qualificationExpiry, today)) codes.push("QUALIFICATION_EXPIRED");
    if (vehicle && LICENSE_RANK[driver.licenseClass] < LICENSE_RANK[REQUIRED_CLASS[vehicle.type]]) {
      codes.push("LICENSE_CLASS");
    }
    if (!driver.qualifiedTemp.includes(order.tempLayer)) codes.push("TEMP_QUALIFICATION");
  }

  // 2. 车辆载重 / 温区 / 通行证
  if (vehicle) {
    if (order.weightKg > vehicle.capacityKg) codes.push("OVERWEIGHT");
    if (!vehicle.zones.includes(order.tempLayer)) codes.push("TEMP_ZONE");
    if (!vehicle.permitRegions.includes(order.region)) codes.push("PERMIT_REGION");
    if (isExpired(vehicle.permitExpiry, today)) codes.push("PERMIT_EXPIRED");
  }

  // 3. 车辆时段占用（同车、时段相交即拒；版本链原占用在改派时忽略）
  if (vehicle) {
    const clash = occupancy.some(
      (a) =>
        a.id !== selfId &&
        a.vehicleId === vehicle.id &&
        a.rootId !== ignoreRootId &&
        windowsOverlap(a.window as DayWindow, order.window)
    );
    if (clash) codes.push("WINDOW_OVERLAP");
  }

  return {
    ok: codes.length === 0,
    codes,
    messages: codes.map((code) => REJECT_META[code].message),
  };
}

/** 供界面展示的逐条预检结果（带通过/不通过标记） */
export function precheckLines(ctx: EvaluationContext) {
  const result = evaluate(ctx);
  return result.codes.map((code) => ({ code, ...REJECT_META[code] }));
}
