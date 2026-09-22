import { useState } from "react";
import type { TempClass } from "../types";
import { TEMP_CLASSES } from "../domain/seed";
import { useGate } from "../store/useGate";
import { certState, TempBadge } from "./shared";
import { today } from "../rules/time";

function OrderForm() {
  const addOrder = useGate((s) => s.addOrder);
  const [orderNo, setOrderNo] = useState("");
  const [region, setRegion] = useState("浦东");
  const [address, setAddress] = useState("");
  const [weight, setWeight] = useState(100);
  const [tempClass, setTempClass] = useState<TempClass>("常温");
  const [date, setDate] = useState(today());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [note, setNote] = useState("");

  return (
    <form
      className="reg-form"
      onSubmit={(e) => {
        e.preventDefault();
        addOrder({ orderNo, region, address, weight, tempClass, window: { date, start, end }, note });
        setOrderNo("");
        setAddress("");
        setNote("");
      }}
    >
      <h4>登记订单</h4>
      <div className="reg-grid">
        <label>订单号<input required value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ORD-XXXX" /></label>
        <label>区域<input required value={region} onChange={(e) => setRegion(e.target.value)} list="region-list" placeholder="目的地区域" /></label>
        <datalist id="region-list">
          {["浦东", "嘉定", "闵行", "青浦", "宝山"].map((r) => <option key={r} value={r} />)}
        </datalist>
        <label className="span2">详细地址<input required value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        <label>实重 kg<input required type="number" min={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></label>
        <label>温层
          <select value={tempClass} onChange={(e) => setTempClass(e.target.value as TempClass)}>
            {TEMP_CLASSES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>送达日期<input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>起<input required type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>止<input required type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="span2">备注<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <button type="submit">登记订单</button>
    </form>
  );
}

function DriverForm() {
  const addDriver = useGate((s) => s.addDriver);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenses, setLicenses] = useState<string[]>([]);
  const [certs, setCerts] = useState<{ name: string; expiry: string }[]>([{ name: "驾驶证", expiry: "" }]);

  const toggleLicense = (l: string) =>
    setLicenses((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  return (
    <form
      className="reg-form"
      onSubmit={(e) => {
        e.preventDefault();
        const certExpiries = Object.fromEntries(certs.filter((c) => c.name.trim()).map((c) => [c.name.trim(), c.expiry]));
        addDriver({ name, phone, licenses, certExpiries });
        setName("");
        setPhone("");
        setLicenses([]);
        setCerts([{ name: "驾驶证", expiry: "" }]);
      }}
    >
      <h4>登记司机（准驾 + 证照有效期）</h4>
      <div className="reg-grid">
        <label>姓名<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>电话<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <div className="check-row">
        <span>准驾车型：</span>
        {["C1", "B2", "A2"].map((l) => (
          <label key={l} className="inline-check">
            <input type="checkbox" checked={licenses.includes(l)} onChange={() => toggleLicense(l)} />{l}
          </label>
        ))}
      </div>
      <div className="cert-editor">
        {certs.map((cert, i) => (
          <div className="cert-row" key={i}>
            <input placeholder="证照名" value={cert.name} onChange={(e) => setCerts(certs.map((c, j) => j === i ? { ...c, name: e.target.value } : c))} />
            <input type="date" value={cert.expiry} onChange={(e) => setCerts(certs.map((c, j) => j === i ? { ...c, expiry: e.target.value } : c))} />
            <button type="button" className="icon-btn danger-text" onClick={() => setCerts(certs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setCerts([...certs, { name: "", expiry: "" }])}>+ 添加证照</button>
      </div>
      <button type="submit">登记司机</button>
    </form>
  );
}

function VehicleForm() {
  const addVehicle = useGate((s) => s.addVehicle);
  const [plate, setPlate] = useState("");
  const [requiredLicense, setRequiredLicense] = useState("B2");
  const [capacity, setCapacity] = useState(1000);
  const [zones, setZones] = useState<TempClass[]>(["常温"]);
  const [regions, setRegions] = useState<string[]>([]);

  const ALL_REGIONS = ["浦东", "嘉定", "闵行", "青浦", "宝山"];
  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <form
      className="reg-form"
      onSubmit={(e) => {
        e.preventDefault();
        addVehicle({ plate, requiredLicense, capacity, tempZones: zones, permitRegions: regions });
        setPlate("");
        setZones(["常温"]);
        setRegions([]);
      }}
    >
      <h4>登记车辆（核载 / 温区 / 通行证范围）</h4>
      <div className="reg-grid">
        <label>车牌号<input required value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="沪A·XXXX" /></label>
        <label>所需准驾
          <select value={requiredLicense} onChange={(e) => setRequiredLicense(e.target.value)}>
            {["C1", "B2", "A2"].map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label>核载 kg<input required type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></label>
      </div>
      <div className="check-row">
        <span>温区：</span>
        {TEMP_CLASSES.map((z) => (
          <label key={z} className="inline-check">
            <input type="checkbox" checked={zones.includes(z)} onChange={() => toggle(zones, z, setZones)} />{z}
          </label>
        ))}
      </div>
      <div className="check-row">
        <span>通行证范围：</span>
        {ALL_REGIONS.map((r) => (
          <label key={r} className="inline-check">
            <input type="checkbox" checked={regions.includes(r)} onChange={() => toggle(regions, r, setRegions)} />{r}
          </label>
        ))}
      </div>
      <button type="submit">登记车辆并开通车道</button>
    </form>
  );
}

function DriverRoster() {
  const drivers = useGate((s) => s.drivers);
  return (
    <div className="roster">
      {drivers.map((d) => (
        <div className="roster-item" key={d.id}>
          <div className="roster-line">
            <strong>{d.name}</strong>
            <span className="sub">{d.phone}</span>
            <span className="lic-badge">{d.licenses.join(" / ") || "无准驾"}</span>
          </div>
          <div className="cert-chips">
            {Object.entries(d.certExpiries).map(([cert, expiry]) => {
              const state = certState(expiry);
              return <span key={cert} className={`cert-chip ${state.cls}`}>{cert} · {state.text}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function VehicleRoster() {
  const vehicles = useGate((s) => s.vehicles);
  return (
    <div className="roster">
      {vehicles.map((v) => (
        <div className="roster-item" key={v.id}>
          <div className="roster-line">
            <strong>{v.plate}</strong>
            <span className="sub">核载 {v.capacity}kg · 需 {v.requiredLicense}</span>
          </div>
          <div className="cert-chips">
            {v.tempZones.map((z) => <span key={z} className="zone-chip"><TempBadge value={z} /></span>)}
            <span className="permit-chip">通行证：{v.permitRegions.join("、") || "无"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Registry() {
  return (
    <section className="registry-section">
      <div className="section-title-row">
        <h2>资源登记</h2>
        <p className="panel-hint">订单的区域/时段/实重/温层，司机的准驾与证照，车辆的核载/温区/通行证在此维护。</p>
      </div>
      <div className="registry-grid">
        <div className="panel"><OrderForm /></div>
        <div className="panel"><DriverForm /><DriverRoster /></div>
        <div className="panel"><VehicleForm /><VehicleRoster /></div>
      </div>
    </section>
  );
}
