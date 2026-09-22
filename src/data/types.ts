// 数据层：领域类型定义。只描述数据形状，不包含任何规则或界面逻辑。

export type TempLayer = "常温" | "冷藏" | "冷冻";

/** 准驾车型：B2 可开大型货车；C1 只可开轻型货车 */
export type LicenseClass = "A2" | "B2" | "C1";

/** 车辆类型，决定司机需要的最低准驾车型 */
export type VehicleType = "大型货车" | "中型货车" | "轻型货车";

export type DayWindow =
  | "06:00-10:00"
  | "09:00-13:00"
  | "13:00-17:00"
  | "17:00-21:00"
  | "20:00-24:00";

/** 派单版本状态（同一 rootId 串成版本链） */
export type AssignmentStatus =
  | "scheduled" // 待发车，可取消/排序
  | "dispatched" // 已发车，司机车辆与顺序锁定
  | "revising" // 改派修订中（挂在目标车道占位，原占用未释放）
  | "superseded" // 已被修订版本替代（仅留在版本链中）
  | "rejected" // 修订被拒绝（仅留在版本链中）
  | "completed"; // 送达完成

export interface Order {
  id: string;
  orderNo: string;
  region: string;
  window: DayWindow;
  weightKg: number;
  tempLayer: TempLayer;
  note?: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  licenseClass: LicenseClass;
  /** 驾驶证有效期 */
  licenseExpiry: string; // ISO yyyy-mm-dd
  /** 货运资格证有效期 */
  qualificationExpiry: string; // ISO yyyy-mm-dd
  /** 可押运温层（冷链资质） */
  qualifiedTemp: TempLayer[];
}

export interface Vehicle {
  id: string;
  plate: string;
  type: VehicleType;
  /** 核定载重 kg */
  capacityKg: number;
  /** 车厢温区 */
  zones: TempLayer[];
  /** 通行证覆盖区域 */
  permitRegions: string[];
  /** 通行证有效期 */
  permitExpiry: string; // ISO yyyy-mm-dd
}

export interface Assignment {
  id: string;
  /** 版本链根 id；首版与自身 id 相同 */
  rootId: string;
  /** 上一版本 id；首版为 null */
  parentId: string | null;
  version: number;
  orderId: string;
  vehicleId: string;
  driverId: string;
  window: DayWindow;
  status: AssignmentStatus;
  /** 发车时锁定的车道顺序，未发车为 null */
  seq: number | null;
  reason: string | null;
  createdAt: string;
  dispatchedAt: string | null;
}

export interface RejectionRecord {
  id: string;
  at: string;
  orderId: string;
  vehicleId: string | null;
  driverId: string | null;
  codes: RejectCode[];
}

/** 版本链（派生视图） */
export interface RevisionChain {
  rootId: string;
  orderId: string;
  head: Assignment;
  nodes: Assignment[];
}

// ---- 规则层对外暴露的判定码（放在类型文件便于数据层引用） ----
export type RejectCode =
  | "NO_DRIVER"
  | "LICENSE_EXPIRED"
  | "QUALIFICATION_EXPIRED"
  | "LICENSE_CLASS"
  | "TEMP_QUALIFICATION"
  | "OVERWEIGHT"
  | "TEMP_ZONE"
  | "PERMIT_REGION"
  | "PERMIT_EXPIRED"
  | "WINDOW_OVERLAP";
