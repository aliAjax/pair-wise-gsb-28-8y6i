// 界面层：新建订单表单

import { useState } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import type { DayWindow, TempLayer } from "../data/types";
import { DAY_WINDOWS, TEMP_LAYERS } from "../data/seed";
import { useScheduleStore } from "../state/store";

const REGIONS = ["浦东", "嘉定", "青浦", "闵行", "宝山", "奉贤", "松江", "金山"];

export function OrderEntry() {
  const addOrder = useScheduleStore((s) => s.addOrder);
  const [form, setForm] = useState({
    orderNo: "",
    region: "浦东",
    window: "06:00-10:00" as DayWindow,
    weightKg: 100,
    tempLayer: "常温" as TempLayer,
    note: "",
  });

  const submit = () => {
    if (!form.orderNo.trim()) return;
    addOrder({ ...form, orderNo: form.orderNo.trim() });
    setForm({ ...form, orderNo: "", note: "" });
  };

  return (
    <div className="order-entry">
      <h3>新增待分配订单</h3>
      <Input
        placeholder="订单号"
        value={form.orderNo}
        onChange={(e) => setForm({ ...form, orderNo: e.target.value })}
      />
      <Select
        value={form.region}
        onChange={(v) => setForm({ ...form, region: v })}
        options={REGIONS.map((v) => ({ value: v, label: v }))}
      />
      <Select
        value={form.window}
        onChange={(v) => setForm({ ...form, window: v })}
        options={DAY_WINDOWS.map((v) => ({ value: v, label: v }))}
      />
      <span className="form-hint">实重 kg</span>
      <InputNumber
        style={{ width: "100%" }}
        min={1}
        value={form.weightKg}
        onChange={(v) => setForm({ ...form, weightKg: Number(v) || 0 })}
      />
      <Select
        value={form.tempLayer}
        onChange={(v) => setForm({ ...form, tempLayer: v })}
        options={TEMP_LAYERS.map((v) => ({ value: v, label: v }))}
      />
      <Input
        placeholder="备注（可选）"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />
      <Button type="primary" onClick={submit}>
        加入待分配
      </Button>
    </div>
  );
}
