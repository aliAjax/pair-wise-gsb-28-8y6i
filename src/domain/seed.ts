// 数据层：种子数据。所有日期相对今天生成，演示证照过期/临期与改派过渡。
import type { Draft, Driver, Order, Trip, Vehicle } from "../types";
import { nowIso, today } from "../rules/time";

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const TEMP_CLASSES = ["常温", "冷藏", "冷冻"] as const;

export function seedDrivers(): Driver[] {
  return [
    {
      id: "drv-liu",
      name: "刘建国",
      licenses: ["A2", "B2"],
      certExpiries: { 驾驶证: dateOffset(220), 从业资格证: dateOffset(90), 通行证签注: dateOffset(45) },
      phone: "138-0000-1101"
    },
    {
      id: "drv-zhao",
      name: "赵伟",
      licenses: ["B2"],
      certExpiries: { 驾驶证: dateOffset(-12), 从业资格证: dateOffset(30) },
      phone: "138-0000-2202"
    },
    {
      id: "drv-sun",
      name: "孙磊",
      licenses: ["C1", "B2"],
      certExpiries: { 驾驶证: dateOffset(400), 从业资格证: dateOffset(5), 通行证签注: dateOffset(160) },
      phone: "138-0000-3303"
    },
    {
      id: "drv-chen",
      name: "陈芳",
      licenses: ["A2", "B2"],
      certExpiries: { 驾驶证: dateOffset(310), 从业资格证: dateOffset(200) },
      phone: "138-0000-4404"
    }
  ];
}

export function seedVehicles(): Vehicle[] {
  return [
    {
      id: "veh-a1",
      plate: "沪A·RF001",
      requiredLicense: "B2",
      capacity: 1500,
      tempZones: ["常温", "冷藏"],
      permitRegions: ["浦东", "嘉定", "闵行"]
    },
    {
      id: "veh-a2",
      plate: "沪B·LD002",
      requiredLicense: "A2",
      capacity: 3000,
      tempZones: ["常温", "冷藏", "冷冻"],
      permitRegions: ["浦东", "嘉定", "青浦", "闵行", "宝山"]
    },
    {
      id: "veh-a3",
      plate: "沪C·CW003",
      requiredLicense: "B2",
      capacity: 800,
      tempZones: ["常温"],
      permitRegions: ["浦东"]
    }
  ];
}

export function seedOrders(): Order[] {
  const d0 = today();
  return [
    // 已在途订单（用于两个已发车车次）
    { id: "ord-1", orderNo: "ORD-5001", region: "浦东", address: "张江高科博云路2号", weight: 420, tempClass: "冷藏", window: { date: d0, start: "08:00", end: "10:00" } },
    { id: "ord-2", orderNo: "ORD-5002", region: "嘉定", address: "安亭镇园区路88号", weight: 760, tempClass: "常温", window: { date: d0, start: "10:30", end: "12:30" } },
    { id: "ord-3", orderNo: "ORD-5003", region: "青浦", address: "赵巷镇嘉松中路", weight: 510, tempClass: "冷冻", window: { date: d0, start: "08:30", end: "10:00" } },
    // 待分配订单：覆盖各类拒绝场景
    { id: "ord-4", orderNo: "ORD-5101", region: "浦东", address: "陆家嘴环路1000号", weight: 300, tempClass: "常温", window: { date: d0, start: "13:00", end: "15:00" }, note: "常规件" },
    { id: "ord-5", orderNo: "ORD-5102", region: "闵行", address: "莘庄都市路500号", weight: 600, tempClass: "冷冻", window: { date: d0, start: "14:00", end: "16:00" }, note: "冷冻：小车 RF001 温层不符" },
    { id: "ord-6", orderNo: "ORD-5103", region: "宝山", address: "大场镇环镇北路", weight: 260, tempClass: "冷藏", window: { date: d0, start: "15:30", end: "17:00" }, note: "RF001 通行证不覆盖宝山" },
    { id: "ord-7", orderNo: "ORD-5104", region: "浦东", address: "金桥出口加工区", weight: 1300, tempClass: "常温", window: { date: d0, start: "09:00", end: "11:00" }, note: "超小车核载；与在途车辆时段冲突" },
    { id: "ord-8", orderNo: "ORD-5105", region: "嘉定", address: "南翔镇银翔路", weight: 480, tempClass: "冷藏", window: { date: d0, start: "11:00", end: "12:00" }, note: "与 ORD-5002 时段重叠" },
    { id: "ord-9", orderNo: "ORD-5106", region: "青浦", address: "徐泾镇诸光路", weight: 350, tempClass: "冷藏", window: { date: d0, start: "16:00", end: "18:00" }, note: "LD002 可装" }
  ];
}

export function seedTrips(): Trip[] {
  // 车次1：已发车一次改派（换司机），新版本 30 秒后生效，便于观察双占与释放
  const dispatchedAt = new Date(Date.now() - 20 * 60000).toISOString();
  return [
    {
      id: "trip-1",
      tripNo: "TRIP-001",
      status: "已发车",
      dispatchedAt,
      versions: [
        { version: 1, driverId: "drv-liu", vehicleId: "veh-a1", stops: [{ orderId: "ord-1" }, { orderId: "ord-2" }], reason: "首版排班", createdAt: dispatchedAt },
        { version: 2, driverId: "drv-sun", vehicleId: "veh-a1", stops: [{ orderId: "ord-1" }, { orderId: "ord-2" }], reason: "刘建国家中急事，改派孙磊接续下午线路", createdAt: new Date(Date.now() - 60000).toISOString() }
      ],
      // 演示：旧占用（刘建国）与新占用（孙磊）在生效前同时保留
      pendingRevision: {
        version: 3,
        driverId: "drv-chen",
        vehicleId: "veh-a1",
        stops: [{ orderId: "ord-1" }, { orderId: "ord-2" }],
        reason: "孙磊从业资格证即将到期，改由陈芳执行并复核证件",
        createdAt: nowIso(),
        effectiveAt: new Date(Date.now() + 30_000).toISOString()
      }
    },
    {
      id: "trip-2",
      tripNo: "TRIP-002",
      status: "已发车",
      dispatchedAt: new Date(Date.now() - 40 * 60000).toISOString(),
      versions: [
        { version: 1, driverId: "drv-liu", vehicleId: "veh-a2", stops: [{ orderId: "ord-3" }], reason: "首版排班", createdAt: new Date(Date.now() - 40 * 60000).toISOString() }
      ]
    }
  ];
}

export function seedDrafts(): Draft[] {
  // 常温小车车道：孙磊 B2、证照仍有效；该车道只接「浦东/常温/≤800kg」订单
  return [{ vehicleId: "veh-a3", driverId: "drv-sun", stops: [] }];
}
