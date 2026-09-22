// 界面层：审计台账——准入拒绝留痕 + 改派版本链

import { Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Assignment, RejectionRecord } from "../data/types";
import { buildChains } from "../rules/occupancy";
import { REJECT_META } from "../rules/validation";
import { useScheduleStore } from "../state/store";
import { formatTime, STATUS_META } from "./meta";

function RejectionsTab() {
  const rejections = useScheduleStore((s) => s.rejections);
  const orders = useScheduleStore((s) => s.orders);
  const vehicles = useScheduleStore((s) => s.vehicles);
  const drivers = useScheduleStore((s) => s.drivers);

  const columns: ColumnsType<RejectionRecord> = [
    {
      title: "时间",
      dataIndex: "at",
      width: 140,
      render: (v: string) => formatTime(v),
    },
    {
      title: "订单",
      dataIndex: "orderId",
      render: (id: string) => orders.find((o) => o.id === id)?.orderNo ?? id,
    },
    {
      title: "目标车辆",
      dataIndex: "vehicleId",
      render: (id: string | null) => vehicles.find((v) => v.id === id)?.plate ?? "—",
    },
    {
      title: "目标司机",
      dataIndex: "driverId",
      render: (id: string | null) => drivers.find((d) => d.id === id)?.name ?? "—",
    },
    {
      title: "整单拒绝原因",
      dataIndex: "codes",
      render: (codes: RejectionRecord["codes"]) => (
        <span>
          {codes.map((code) => (
            <Tag color="red" key={code} title={REJECT_META[code].message}>
              {REJECT_META[code].label}
            </Tag>
          ))}
        </span>
      ),
    },
  ];

  if (rejections.length === 0) return <Empty description="暂无整单拒绝记录" />;
  return <Table rowKey="id" columns={columns} dataSource={rejections} pagination={false} size="small" />;
}

function nodeLine(a: Assignment, names: { order: string; vehicle: string; driver: string }) {
  return (
    <li key={a.id} className="chain-node">
      <div className="chain-node-head">
        <Tag color={STATUS_META[a.status].color}>v{a.version} · {STATUS_META[a.status].label}</Tag>
        <span className="chain-time">{formatTime(a.createdAt)}</span>
      </div>
      <div>
        {names.vehicle} · {names.driver} · {a.window}
      </div>
      {a.reason ? <div className="asg-reason">改派原因：{a.reason}</div> : null}
      {a.dispatchedAt ? <div className="chain-time">发车时间：{formatTime(a.dispatchedAt)}</div> : null}
    </li>
  );
}

function ChainsTab() {
  const assignments = useScheduleStore((s) => s.assignments);
  const orders = useScheduleStore((s) => s.orders);
  const vehicles = useScheduleStore((s) => s.vehicles);
  const drivers = useScheduleStore((s) => s.drivers);
  const chains = [...buildChains(assignments).values()]
    .filter((c) => c.nodes.length > 1 || c.head.status !== "scheduled")
    .sort((a, b) => b.head.createdAt.localeCompare(a.head.createdAt));

  if (chains.length === 0) return <Empty description="暂无版本链（改派或发车后在此审计）" />;

  return (
    <div className="chains">
      {chains.map((chain) => (
        <div className="chain" key={chain.rootId}>
          <h4>
            {orders.find((o) => o.id === chain.orderId)?.orderNo ?? chain.orderId}
            <span className="chain-head">
              当前版本：v{chain.head.version} · {STATUS_META[chain.head.status].label}
            </span>
          </h4>
          <ol>
            {chain.nodes.map((a) =>
              nodeLine(a, {
                order: orders.find((o) => o.id === a.orderId)?.orderNo ?? a.orderId,
                vehicle: vehicles.find((v) => v.id === a.vehicleId)?.plate ?? a.vehicleId,
                driver: drivers.find((d) => d.id === a.driverId)?.name ?? a.driverId,
              })
            )}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function AuditPanel({ tab }: { tab: "rejections" | "chains" }) {
  return tab === "rejections" ? <RejectionsTab /> : <ChainsTab />;
}
