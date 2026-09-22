// 规则层：准入校验。
// 拖入时整单拒绝的四类硬规则：证照过期/准驾不符、载重或温层不符、
// 通行证不覆盖目的地、车辆/司机时段重叠。任一不满足即整单拒绝。
import type {
  Driver,
  Evaluation,
  Order,
  Rejection,
  TimeWindow,
  Vehicle
} from "../types";
import { isCertValid, overlaps } from "./time";

/** 某个资源（车辆/司机）在外部已占用的时段 */
export interface OccupiedWindow {
  window: TimeWindow;
  label: string; // 占用来源，用于提示
}

export interface AdmissionInput {
  order: Order;
  driver: Driver | null;
  vehicle: Vehicle;
  /** 当前车道已装的其他订单（不含被拖动订单本身） */
  laneOrders: Order[];
  /** 该车辆在其他车次/车道的占用 */
  vehicleBusy: OccupiedWindow[];
  /** 该司机在其他车次/车道的占用 */
  driverBusy: OccupiedWindow[];
}

/**
 * 评估一次「订单 → 车 + 司机」配置。
 * 返回全部命中的拒绝原因；ok=false 时调用方必须整单拒绝（不做部分装入）。
 */
export function evaluateAdmission(input: AdmissionInput, at: Date = new Date()): Evaluation {
  const { order, driver, vehicle, laneOrders, vehicleBusy, driverBusy } = input;
  const rejections: Rejection[] = [];

  // 1. 温层：车辆温区必须覆盖订单温层
  if (!vehicle.tempZones.includes(order.tempClass)) {
    rejections.push({
      code: "TEMP_MISMATCH",
      message: `温层不符：${vehicle.plate} 仅支持「${vehicle.tempZones.join("、")}」，订单要求「${order.tempClass}」`
    });
  }

  // 2. 载重：当前车道累计实重 + 本单不得超过核载
  const laneWeight = laneOrders.reduce((sum, item) => sum + item.weight, 0);
  if (laneWeight + order.weight > vehicle.capacity) {
    rejections.push({
      code: "OVERWEIGHT",
      message: `超载：${vehicle.plate} 核载 ${vehicle.capacity}kg，车道已装 ${laneWeight}kg，再装 ${order.weight}kg 将达 ${laneWeight + order.weight}kg`
    });
  }

  // 3. 通行证：通行证范围必须覆盖订单目的地区域
  if (!vehicle.permitRegions.includes(order.region)) {
    rejections.push({
      code: "PERMIT_DENIED",
      message: `通行证不覆盖目的地：${vehicle.plate} 通行证范围为「${vehicle.permitRegions.join("、") || "无"}」，不含「${order.region}」`
    });
  }

  // 4. 司机证照：准驾车型匹配，且所有证照未过期
  if (!driver) {
    rejections.push({
      code: "LICENSE_MISMATCH",
      message: `尚未指定司机：车辆需持「${vehicle.requiredLicense}」准驾车型的司机`
    });
  } else {
    if (!driver.licenses.includes(vehicle.requiredLicense)) {
      rejections.push({
        code: "LICENSE_MISMATCH",
        message: `准驾不符：${driver.name} 准驾「${driver.licenses.join("、") || "无"}」，车辆要求「${vehicle.requiredLicense}」`
      });
    }
    for (const [cert, expiry] of Object.entries(driver.certExpiries)) {
      if (!isCertValid(expiry, at)) {
        rejections.push({
          code: "CERT_EXPIRED",
          message: `证照过期：${driver.name} 的「${cert}」已于 ${expiry} 到期`
        });
      }
    }
  }

  // 5. 时段重叠：先与本车道其他订单比（同一车辆），再与外部占用比
  const conflicts: { who: string; label: string }[] = [];
  for (const other of laneOrders) {
    if (overlaps(order.window, other.window)) {
      conflicts.push({ who: "车辆", label: `本车道订单 ${other.orderNo}` });
    }
  }
  for (const busy of vehicleBusy) {
    if (overlaps(order.window, busy.window)) {
      conflicts.push({ who: "车辆", label: busy.label });
    }
  }
  for (const busy of driver ? driverBusy : []) {
    if (overlaps(order.window, busy.window)) {
      conflicts.push({ who: "司机", label: busy.label });
    }
  }
  // 合并成按资源分组的拒绝原因
  for (const who of ["车辆", "司机"] as const) {
    const hit = conflicts.filter((c) => c.who === who);
    if (hit.length > 0) {
      rejections.push({
        code: who === "车辆" ? "VEHICLE_TIME_OVERLAP" : "DRIVER_TIME_OVERLAP",
        message: `${who}时段重叠：${order.orderNo} 的送达时段与 ${hit.map((c) => c.label).join("、")} 冲突`
      });
    }
  }

  return { ok: rejections.length === 0, rejections };
}
