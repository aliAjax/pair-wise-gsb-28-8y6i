// 界面层：改派弹窗。必填改派原因；按当前数据实时预检目标车/司机准入。

import { useMemo, useState } from "react";
import { Alert, Input, Modal, Select, Tag } from "antd";
import type { Assignment } from "../data/types";
import { activeOccupancy } from "../rules/occupancy";
import { evaluate, REJECT_META, todayStr } from "../rules/validation";
import { useScheduleStore } from "../state/store";

interface Props {
  assignment: Assignment | null;
  onClose: () => void;
}

export function ReassignModal({ assignment, onClose }: Props) {
  const vehicles = useScheduleStore((s) => s.vehicles);
  const drivers = useScheduleStore((s) => s.drivers);
  const orders = useScheduleStore((s) => s.orders);
  const assignments = useScheduleStore((s) => s.assignments);
  const requestReassign = useScheduleStore((s) => s.requestReassign);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [reason, setReason] = useState("");

  const chain = assignment
    ? assignments
        .filter((a) => a.rootId === assignment.rootId)
        .sort((a, b) => b.version - a.version)
    : [];
  const head =
    chain.find((a) => a.status === "scheduled" || a.status === "dispatched") ?? chain[0] ?? null;
  const order = assignment ? orders.find((o) => o.id === assignment.orderId) : null;

  const precheck = useMemo(() => {
    if (!order) return null;
    const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
    const driver = drivers.find((d) => d.id === driverId) ?? null;
    return evaluate({
      order,
      vehicle,
      driver,
      occupancy: activeOccupancy(assignments),
      ignoreRootId: assignment?.rootId,
      selfId: assignment?.id,
      today: todayStr(),
    });
  }, [order, vehicles, vehicleId, drivers, driverId, assignments, assignment]);

  if (!assignment || !head || !order) return null;

  const sameTarget = head.vehicleId === vehicleId && head.driverId === driverId;
  const canSubmit = vehicleId && driverId && reason.trim().length > 0 && precheck?.ok && !sameTarget;

  const handleOk = () => {
    const r = requestReassign(assignment.rootId, vehicleId, driverId, reason);
    if (r.ok) onClose();
  };

  return (
    <Modal
      title={`改派 ${order.orderNo}（当前 v${head.version}：${
        vehicles.find((v) => v.id === head.vehicleId)?.plate ?? "原车辆"
      }）`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText="提交改派申请"
      okButtonProps={{ disabled: !canSubmit }}
      cancelText="取消"
    >
      <p className="reassign-tip">
        提交后生成新版本（v{head.version + 1}）挂在目标车道占位；原车辆时段占用在新版本<b>批准生效</b>
        前不会释放。已发车任务的司机、车辆与顺序锁定，仅能通过改派链变更。
      </p>

      <label className="form-label">目标车辆</label>
      <Select
        style={{ width: "100%" }}
        placeholder="选择改派车辆"
        value={vehicleId || undefined}
        onChange={setVehicleId}
        options={vehicles.map((v) => ({ value: v.id, label: `${v.plate}（核载${v.capacityKg}kg）` }))}
      />

      <label className="form-label">目标司机</label>
      <Select
        style={{ width: "100%" }}
        placeholder="选择司机"
        value={driverId || undefined}
        onChange={setDriverId}
        options={drivers.map((d) => ({ value: d.id, label: `${d.name}（${d.licenseClass}）` }))}
      />

      <label className="form-label">
        改派原因 <span className="required">*</span>
      </label>
      <Input.TextArea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="如：原车辆制冷故障，改派冷藏车"
      />

      <div className="precheck">
        {precheck && precheck.ok ? (
          <Alert type="success" showIcon message="预检通过：证照、载重、温层、通行证、时段均满足" />
        ) : null}
        {precheck && !precheck.ok && (vehicleId || driverId) ? (
          <Alert
            type="error"
            showIcon
            message="预检不通过（提交将整单拒绝并留痕）"
            description={
              <ul className="reject-list">
                {precheck.codes.map((code) => (
                  <li key={code}>
                    <Tag color="red">{REJECT_META[code].label}</Tag>
                    {REJECT_META[code].message}
                  </li>
                ))}
              </ul>
            }
          />
        ) : null}
        {sameTarget ? <Alert type="warning" showIcon message="目标与当前一致，无需改派" /> : null}
      </div>
    </Modal>
  );
}
