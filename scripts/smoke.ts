// 临时冒烟测试（不进入产物）
import { evaluateAdmission, type OccupiedWindow } from "../src/rules/admission";
import { buildOccupancy, checkConsistency } from "../src/rules/occupancy";
import { seedDrivers, seedOrders, seedTrips, seedVehicles, seedDrafts } from "../src/domain/seed";
import type { Driver, Vehicle } from "../src/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`✗ ${name} ${extra}`); }
  else console.log(`✓ ${name}`);
}

const orders = new Map(seedOrders().map((o) => [o.id, o]));
const drivers = new Map(seedDrivers().map((d) => [d.id, d]));
const vehicles = new Map(seedVehicles().map((v) => [v.id, v]));
const liu = drivers.get("drv-liu")!;
const zhao = drivers.get("drv-zhao")!;
const sun = drivers.get("drv-sun")!;
const rf001 = vehicles.get("veh-a1")!; // B2, 1500, 常温/冷藏, 浦东/嘉定/闵行
const ld002 = vehicles.get("veh-a2")!; // A2, 3000, 全温区
const cw003 = vehicles.get("veh-a3")!; // B2, 800, 常温, 浦东

function base(overrides: Partial<Parameters<typeof evaluateAdmission>[0]> = {}) {
  return {
    order: orders.get("ord-4")!, // 浦东 300kg 常温 13:00-15:00
    driver: liu,
    vehicle: rf001,
    laneOrders: [],
    vehicleBusy: [],
    driverBusy: [],
    ...overrides
  };
}

// 1. 合规通过
check("合规订单准入通过", evaluateAdmission(base()).ok);

// 2. 温层不符（冷冻单 -> 常温/冷藏车）
const frozen = evaluateAdmission(base({ order: orders.get("ord-5")! }));
check("温层不符被拒绝", !frozen.ok && frozen.rejections.some((r) => r.code === "TEMP_MISMATCH"), JSON.stringify(frozen.rejections));

// 3. 通行证不覆盖（宝山 -> RF001）
const permit = evaluateAdmission(base({ order: orders.get("ord-6")! }));
check("通行证不覆盖被拒绝", !permit.ok && permit.rejections.some((r) => r.code === "PERMIT_DENIED"));

// 4. 超载（1300 + 已装 400 = 1700 > 1500）
const over = evaluateAdmission(base({
  order: orders.get("ord-7")!,
  laneOrders: [{ ...orders.get("ord-4")!, weight: 400 }]
}));
check("超载被拒绝", !over.ok && over.rejections.some((r) => r.code === "OVERWEIGHT"));

// 5. 证照过期（赵伟驾驶证已过期）
const cert = evaluateAdmission(base({ driver: zhao }));
check("证照过期被拒绝", !cert.ok && cert.rejections.some((r) => r.code === "CERT_EXPIRED"));

// 6. 准驾不符（孙磊 C1/B2 可以开 B2；构造一个只持 C1 的司机去开需 A2 的 LD002）
const c1Only: Driver = { id: "x", name: "新手", licenses: ["C1"], certExpiries: { 驾驶证: "2099-01-01" }, phone: "" };
const lic = evaluateAdmission(base({ driver: c1Only, vehicle: ld002 }));
check("准驾不符被拒绝", !lic.ok && lic.rejections.some((r) => r.code === "LICENSE_MISMATCH"));

// 7. 车辆时段重叠（与外部占用 14:00-16:00 重叠于 13-15）
const busy: OccupiedWindow[] = [{ window: orders.get("ord-5")!.window, label: "其他车次 ORD-5102" }];
const overlap = evaluateAdmission(base({ vehicleBusy: busy }));
check("车辆时段重叠被拒绝", !overlap.ok && overlap.rejections.some((r) => r.code === "VEHICLE_TIME_OVERLAP"));

// 8. 司机时段重叠
const driverOverlap = evaluateAdmission(base({ driverBusy: busy }));
check("司机时段重叠被拒绝", !driverOverlap.ok && driverOverlap.rejections.some((r) => r.code === "DRIVER_TIME_OVERLAP"));

// 9. 不重叠不误伤（08:00-09:00 不与 13-15 重叠）
const noOverlap = evaluateAdmission(base({
  vehicleBusy: [{ window: { ...orders.get("ord-4")!.window, start: "08:00", end: "09:00" }, label: "早班" }]
}));
check("相邻不重叠通过", noOverlap.ok);

// 10. 整单拒绝：多重违规时一次返回多条原因（冷冻 + 宝山 + 证照过期 + 时段重叠）
const multi = evaluateAdmission({
  order: { ...orders.get("ord-5")!, region: "宝山" },
  driver: zhao, // 证照过期
  vehicle: rf001,
  laneOrders: [],
  vehicleBusy: busy, // 14-16 与 14-16 重叠
  driverBusy: []
});
const codes = new Set(multi.rejections.map((r) => r.code));
check("整单拒绝聚合全部原因",
  codes.has("TEMP_MISMATCH") && codes.has("PERMIT_DENIED") && codes.has("CERT_EXPIRED") && codes.has("VEHICLE_TIME_OVERLAP"),
  JSON.stringify(multi.rejections.map((r) => r.code)));

// 11. 占用推导：种子 trip-1 现行 v2=孙磊+RF001，待生效 v3=陈芳+RF001 → 双占
const trips = seedTrips();
const occ = buildOccupancy(trips, seedDrafts(), orders, new Date());
const rfBusy = occ.vehicle.get("veh-a1")!.map((w) => w.label);
check("待生效期间原版本车辆占用保留", rfBusy.some((l) => l.includes("现行")));
check("待生效期间新版本车辆占用预占", rfBusy.some((l) => l.includes("待生效")));
const sunBusy = occ.driver.get("drv-sun")!.map((w) => w.label);
const chenBusy = occ.driver.get("drv-chen")!.map((w) => w.label);
check("待生效期间原司机孙磊占用保留", sunBusy.some((l) => l.includes("现行")));
check("待生效期间新司机陈芳占用预占", chenBusy.some((l) => l.includes("待生效")));

// 12. 物化后：版本链追加，只剩新占用
const due = trips.map((t) => t.id === "trip-1" && t.pendingRevision
  ? {
      ...t,
      versions: [...t.versions, { ...t.pendingRevision! }],
      pendingRevision: undefined
    }
  : t);
const occ2 = buildOccupancy(due, seedDrafts(), orders, new Date());
const labels2 = occ2.vehicle.get("veh-a1")!.map((w) => w.label);
check("生效后仅保留新版本占用", labels2.every((l) => !l.includes("待生效")) && labels2.some((l) => l.includes("v3")));
check("生效后原司机占用已释放", !occ2.driver.has("drv-sun") || occ2.driver.get("drv-sun")!.every((w) => !w.label.includes("TRIP-001")));
check("版本链连续", due[0].versions.map((v, i) => v.version === i + 1).every(Boolean));

// 13. 一致性自检
const report = checkConsistency(due, seedDrafts(), vehicles, drivers, orders);
check("刷新一致性自检通过", report.ok, report.issues.join(";"));

// 14. 小车 CW003 装浦东常温 300kg 通过（孙磊准驾 B2，证照 5 天后才到期）
const small = evaluateAdmission(base({
  vehicle: cw003,
  driver: sun,
  order: orders.get("ord-4")!,
  vehicleBusy: [],
  driverBusy: []
}));
check("小车合规订单通过", small.ok, JSON.stringify(small.rejections));

// 15. 孙磊装冷冻单到小车：温层拒绝
const smallFrozen = evaluateAdmission(base({ vehicle: cw003, driver: sun, order: orders.get("ord-5")! }));
check("小车冷冻单温层拒绝", !smallFrozen.ok && smallFrozen.rejections.some((r) => r.code === "TEMP_MISMATCH"));

// 16. 幽灵引用被检出
const broken = checkConsistency(
  [{ ...due[0], versions: [{ ...due[0].versions[0], driverId: "ghost" }] }],
  seedDrafts(), vehicles, drivers, orders
);
check("幽灵司机引用被一致性检查捕获", !broken.ok && broken.issues.some((i) => i.includes("司机")));

// 未使用变量避免 TS 报错
void ((v: Vehicle) => v)(ld002);

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部冒烟测试通过");
