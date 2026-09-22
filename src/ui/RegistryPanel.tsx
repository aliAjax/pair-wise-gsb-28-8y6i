// 界面层：司机与车辆登记台账

import { useState } from "react";
import { Button, Input, InputNumber, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Driver, LicenseClass, TempLayer, Vehicle, VehicleType } from "../data/types";
import { TEMP_LAYERS } from "../data/seed";
import { todayStr } from "../rules/validation";
import { useScheduleStore } from "../state/store";

const REGIONS = ["浦东", "嘉定", "青浦", "闵行", "宝山", "奉贤", "松江", "金山"];

function ExpiryTag({ date }: { date: string }) {
  const expired = date < todayStr();
  return (
    <Tag color={expired ? "red" : "green"}>
      {date} {expired ? "已过期" : "有效"}
    </Tag>
  );
}

function DriverTab() {
  const drivers = useScheduleStore((s) => s.drivers);
  const addDriver = useScheduleStore((s) => s.addDriver);
  const [form, setForm] = useState({
    name: "",
    licenseClass: "C1" as LicenseClass,
    licenseExpiry: "",
    qualificationExpiry: "",
    qualifiedTemp: [] as TempLayer[],
  });

  const columns: ColumnsType<Driver> = [
    { title: "姓名", dataIndex: "name" },
    { title: "准驾", dataIndex: "licenseClass" },
    {
      title: "驾驶证有效期",
      dataIndex: "licenseExpiry",
      render: (v: string) => <ExpiryTag date={v} />,
    },
    {
      title: "资格证有效期",
      dataIndex: "qualificationExpiry",
      render: (v: string) => <ExpiryTag date={v} />,
    },
    {
      title: "可押运温层",
      dataIndex: "qualifiedTemp",
      render: (v: TempLayer[]) => v.map((t) => <Tag key={t}>{t}</Tag>),
    },
  ];

  const submit = () => {
    if (!form.name || !form.licenseExpiry || !form.qualificationExpiry || form.qualifiedTemp.length === 0)
      return;
    addDriver(form);
    setForm({ name: "", licenseClass: "C1", licenseExpiry: "", qualificationExpiry: "", qualifiedTemp: [] });
  };

  return (
    <div className="registry">
      <div className="registry-form">
        <h3>新增司机登记</h3>
        <Input
          placeholder="姓名"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Select
          value={form.licenseClass}
          onChange={(v) => setForm({ ...form, licenseClass: v })}
          options={["A2", "B2", "C1"].map((v) => ({ value: v, label: v }))}
        />
        <span className="form-hint">驾驶证有效期</span>
        <Input
          type="date"
          value={form.licenseExpiry}
          onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })}
        />
        <span className="form-hint">货运资格证有效期</span>
        <Input
          type="date"
          value={form.qualificationExpiry}
          onChange={(e) => setForm({ ...form, qualificationExpiry: e.target.value })}
        />
        <Select
          mode="multiple"
          placeholder="可押运温层（冷链资质）"
          value={form.qualifiedTemp}
          onChange={(v) => setForm({ ...form, qualifiedTemp: v })}
          options={TEMP_LAYERS.map((v) => ({ value: v, label: v }))}
        />
        <Button type="primary" onClick={submit}>
          登记司机
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={drivers} pagination={false} size="small" />
    </div>
  );
}

function VehicleTab() {
  const vehicles = useScheduleStore((s) => s.vehicles);
  const addVehicle = useScheduleStore((s) => s.addVehicle);
  const [form, setForm] = useState({
    plate: "",
    type: "轻型货车" as VehicleType,
    capacityKg: 500,
    zones: [] as TempLayer[],
    permitRegions: [] as string[],
    permitExpiry: "",
  });

  const columns: ColumnsType<Vehicle> = [
    { title: "车牌", dataIndex: "plate" },
    { title: "车型", dataIndex: "type" },
    { title: "核载kg", dataIndex: "capacityKg" },
    {
      title: "温区",
      dataIndex: "zones",
      render: (v: TempLayer[]) => v.map((t) => <Tag key={t} color="cyan">{t}</Tag>),
    },
    {
      title: "通行证范围",
      dataIndex: "permitRegions",
      render: (v: string[]) => v.join("、"),
    },
    {
      title: "通行证有效期",
      dataIndex: "permitExpiry",
      render: (v: string) => <ExpiryTag date={v} />,
    },
  ];

  const submit = () => {
    if (!form.plate || form.zones.length === 0 || form.permitRegions.length === 0 || !form.permitExpiry)
      return;
    addVehicle(form);
    setForm({ plate: "", type: "轻型货车", capacityKg: 500, zones: [], permitRegions: [], permitExpiry: "" });
  };

  return (
    <div className="registry">
      <div className="registry-form">
        <h3>新增车辆登记</h3>
        <Input
          placeholder="车牌/车名"
          value={form.plate}
          onChange={(e) => setForm({ ...form, plate: e.target.value })}
        />
        <Select
          value={form.type}
          onChange={(v) => setForm({ ...form, type: v })}
          options={["大型货车", "中型货车", "轻型货车"].map((v) => ({ value: v, label: v }))}
        />
        <span className="form-hint">核载 kg</span>
        <InputNumber
          style={{ width: "100%" }}
          min={1}
          value={form.capacityKg}
          onChange={(v) => setForm({ ...form, capacityKg: Number(v) || 0 })}
        />
        <Select
          mode="multiple"
          placeholder="车厢温区"
          value={form.zones}
          onChange={(v) => setForm({ ...form, zones: v })}
          options={TEMP_LAYERS.map((v) => ({ value: v, label: v }))}
        />
        <Select
          mode="multiple"
          placeholder="通行证覆盖区域"
          value={form.permitRegions}
          onChange={(v) => setForm({ ...form, permitRegions: v })}
          options={REGIONS.map((v) => ({ value: v, label: v }))}
        />
        <span className="form-hint">通行证有效期</span>
        <Input
          type="date"
          value={form.permitExpiry}
          onChange={(e) => setForm({ ...form, permitExpiry: e.target.value })}
        />
        <Button type="primary" onClick={submit}>
          登记车辆
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={vehicles} pagination={false} size="small" />
    </div>
  );
}

export function RegistryPanel({ tab }: { tab: "drivers" | "vehicles" }) {
  return tab === "drivers" ? <DriverTab /> : <VehicleTab />;
}
