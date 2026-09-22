// 数据层：领域类型定义。
// 数据（本文件 + domain.ts 种子数据）与规则（rules/*）和界面（components/*）分开。

export type TempClass = "常温" | "冷藏" | "冷冻";

/** 送达时段：本地日期 + HH:mm 起讫 */
export interface TimeWindow {
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface Order {
  id: string;
  orderNo: string;
  region: string; // 目的地区域
  address: string;
  weight: number; // 实重 kg
  tempClass: TempClass; // 温层
  window: TimeWindow; // 送达时段
  note?: string;
}

export interface Driver {
  id: string;
  name: string;
  licenses: string[]; // 准驾车型，如 ["B2","A2"]
  /** 证照有效期：驾驶证/从业资格证等，证照名 -> YYYY-MM-DD */
  certExpiries: Record<string, string>;
  phone: string;
}

export interface Vehicle {
  id: string;
  plate: string; // 车牌号
  requiredLicense: string; // 所需准驾车型，如 "B2"
  capacity: number; // 核载 kg
  tempZones: TempClass[]; // 车辆温区
  permitRegions: string[]; // 通行证覆盖区域
}

export interface Stop {
  orderId: string;
  /** 单条占用时段，默认取订单送达时段；改派时可被重排但此处保留订单窗口 */
}

/** 一个车次的某个不可变版本 */
export interface TripVersion {
  version: number;
  driverId: string;
  vehicleId: string;
  stops: Stop[];
  reason: string; // 创建原因（首版=排班，之后为改派原因）
  createdAt: string;
}

export type TripStatus = "已发车" | "已完成";

export interface Trip {
  id: string;
  tripNo: string;
  /** 版本链：versions[versions.length-1] 为当前版本 */
  versions: TripVersion[];
  status: TripStatus;
  dispatchedAt: string;
  completedAt?: string;
  /** 待生效改派：原占用在修订生效前不释放，新占用被预占 */
  pendingRevision?: {
    version: number;
    driverId: string;
    vehicleId: string;
    stops: Stop[];
    reason: string;
    createdAt: string;
    /** 生效时间：到点后修订才生效、原占用才释放 */
    effectiveAt: string;
  };
}

/** 车道草稿：发车前的编排，一个车道最多一份草稿 + 若干已发车车次 */
export interface Draft {
  vehicleId: string;
  driverId: string | null;
  stops: Stop[];
}

/** 准入台在拖入时给出的拒绝原因 */
export interface Rejection {
  code:
    | "TEMP_MISMATCH"
    | "OVERWEIGHT"
    | "PERMIT_DENIED"
    | "CERT_EXPIRED"
    | "LICENSE_MISMATCH"
    | "VEHICLE_TIME_OVERLAP"
    | "DRIVER_TIME_OVERLAP";
  message: string;
}

/** 规则层对一次配置的统一评估结果 */
export interface Evaluation {
  ok: boolean;
  rejections: Rejection[];
}
