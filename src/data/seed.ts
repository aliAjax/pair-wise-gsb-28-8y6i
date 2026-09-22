// 数据层：区域/温层/时段常量与初始种子数据。

import type { DayWindow, Driver, Order, TempLayer, Vehicle } from "./types";

export const TEMP_LAYERS: TempLayer[] = ["常温", "冷藏", "冷冻"];

export const DAY_WINDOWS: DayWindow[] = [
  "06:00-10:00",
  "09:00-13:00",
  "13:00-17:00",
  "17:00-21:00",
  "20:00-24:00",
];

/** 时段重叠判断（半开区间），端点相接不算重叠 */
export function windowsOverlap(a: DayWindow, b: DayWindow): boolean {
  const toMin = (w: DayWindow) => {
    const [s, e] = w.split("-");
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return [sh * 60 + sm, eh * 60 + em];
  };
  const [as, ae] = toMin(a);
  const [bs, be] = toMin(b);
  return as < be && bs < ae;
}

export const SEED_DRIVERS: Driver[] = [
  {
    id: "drv-liu",
    name: "刘师傅",
    licenseClass: "A2",
    licenseExpiry: "2027-08-31",
    qualificationExpiry: "2027-03-15",
    qualifiedTemp: ["常温", "冷藏", "冷冻"],
  },
  {
    id: "drv-zhao",
    name: "赵师傅",
    licenseClass: "B2",
    licenseExpiry: "2025-12-01", // 演示用：临近/可能已过期
    qualificationExpiry: "2027-05-20",
    qualifiedTemp: ["常温", "冷藏"],
  },
  {
    id: "drv-sun",
    name: "孙师傅",
    licenseClass: "C1",
    licenseExpiry: "2028-02-10",
    qualificationExpiry: "2026-11-30",
    qualifiedTemp: ["常温"],
  },
];

export const SEED_VEHICLES: Vehicle[] = [
  {
    id: "veh-lengcang",
    plate: "沪D·8021 冷藏车",
    type: "中型货车",
    capacityKg: 1200,
    zones: ["常温", "冷藏", "冷冻"],
    permitRegions: ["浦东", "嘉定", "青浦"],
    permitExpiry: "2026-12-31",
  },
  {
    id: "veh-changwen",
    plate: "沪D·5177 厢式车",
    type: "轻型货车",
    capacityKg: 800,
    zones: ["常温"],
    permitRegions: ["浦东", "闵行", "宝山"],
    permitExpiry: "2025-10-01", // 演示用：已过期
  },
  {
    id: "veh-zhongka",
    plate: "沪E·3390 重卡",
    type: "大型货车",
    capacityKg: 3000,
    zones: ["常温"],
    permitRegions: ["嘉定", "青浦", "奉贤"],
    permitExpiry: "2027-06-30",
  },
];

export const SEED_ORDERS: Order[] = [
  {
    id: "ord-9012",
    orderNo: "ORD-9012",
    region: "浦东",
    window: "06:00-10:00",
    weightKg: 260,
    tempLayer: "冷藏",
    note: "生鲜仓自提",
    createdAt: "2026-09-20T08:00:00.000Z",
  },
  {
    id: "ord-9031",
    orderNo: "ORD-9031",
    region: "嘉定",
    window: "13:00-17:00",
    weightKg: 140,
    tempLayer: "常温",
    note: "汽配城门店",
    createdAt: "2026-09-20T09:00:00.000Z",
  },
  {
    id: "ord-9047",
    orderNo: "ORD-9047",
    region: "奉贤",
    window: "17:00-21:00",
    weightKg: 2400,
    tempLayer: "常温",
    note: "整托盘设备",
    createdAt: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "ord-9058",
    orderNo: "ORD-9058",
    region: "嘉定",
    window: "09:00-13:00",
    weightKg: 90,
    tempLayer: "冷冻",
    note: "冻品样品",
    createdAt: "2026-09-21T02:00:00.000Z",
  },
  {
    id: "ord-9063",
    orderNo: "ORD-9063",
    region: "青浦",
    window: "06:00-10:00",
    weightKg: 520,
    tempLayer: "冷藏",
    note: "商超补货",
    createdAt: "2026-09-21T03:00:00.000Z",
  },
];
