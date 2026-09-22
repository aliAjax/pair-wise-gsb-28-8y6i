import { useEffect, useMemo, useState } from "react";
import type { Trip } from "../types";
import { useGate } from "../store/useGate";
import { TempBadge } from "./shared";
import { formatWindow } from "../rules/time";

function useCountdown(targetIso?: string) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);
  if (!targetIso) return null;
  const ms = new Date(targetIso).getTime() - Date.now();
  if (ms <= 0) return "生效中…";
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function RevisionModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const orders = useGate((s) => s.orders);
  const drivers = useGate((s) => s.drivers);
  const vehicles = useGate((s) => s.vehicles);
  const propose = useGate((s) => s.proposeRevision);

  const current = trip.versions[trip.versions.length - 1];
  const [driverId, setDriverId] = useState(trip.pendingRevision?.driverId ?? current.driverId);
  const [vehicleId, setVehicleId] = useState(trip.pendingRevision?.vehicleId ?? current.vehicleId);
  const [stopIds, setStopIds] = useState<string[]>(
    trip.pendingRevision?.stops.map((s) => s.orderId) ?? current.stops.map((s) => s.orderId)
  );
  const [reason, setReason] = useState(trip.pendingRevision?.reason ?? "");
  const defaultEffective = useMemo(() => {
    const d = new Date(Date.now() + 10 * 60000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);
  const [effectiveAt, setEffectiveAt] = useState(defaultEffective);

  function toggleOrder(id: string) {
    setStopIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    propose(trip.id, {
      driverId,
      vehicleId,
      stopOrderIds: stopIds,
      reason,
      effectiveAt: new Date(effectiveAt).toISOString()
    });
    onClose();
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>改派 {trip.tripNo}（生成 v{trip.versions.length + 1}）</h3>
          <button type="button" className="icon-btn" onClick={onClose}>×</button>
        </div>
        <p className="modal-warn">
          已发车版本保持锁定。新版本在到点生效前不替换现版：原司机/车辆占用继续保留，新资源同时预占。
        </p>
        <div className="form-grid">
          <label>
            改派后司机
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}（{d.licenses.join("/")}）</option>)}
            </select>
          </label>
          <label>
            改派后车辆
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}（核载 {v.capacity}kg · {v.tempZones.join("/")}）</option>)}
            </select>
          </label>
          <label className="full">
            送达顺序（勾选保留，拖动下方序号暂不支持，按勾选顺序执行）
            <div className="revision-stops">
              {orders.map((order) => {
                const idx = stopIds.indexOf(order.id);
                return (
                  <label key={order.id} className={`check-stop${idx >= 0 ? " picked" : ""}`}>
                    <input type="checkbox" checked={idx >= 0} onChange={() => toggleOrder(order.id)} />
                    {idx >= 0 && <span className="pick-index">{idx + 1}</span>}
                    <span>{order.orderNo}</span>
                    <TempBadge value={order.tempClass} />
                    <span className="sub">{order.region} · {order.weight}kg · {formatWindow(order.window)}</span>
                  </label>
                );
              })}
            </div>
          </label>
          <label className="full">
            改派原因（必填）
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：车辆故障、证照临期、客户改约时段…" />
          </label>
          <label>
            修订生效时间
            <input type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button type="button" onClick={submit} disabled={!reason.trim()}>提交改派新版本</button>
        </div>
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const orders = useGate((s) => s.orders);
  const drivers = useGate((s) => s.drivers);
  const vehicles = useGate((s) => s.vehicles);
  const complete = useGate((s) => s.completeTrip);
  const [editing, setEditing] = useState(false);
  const [showChain, setShowChain] = useState(false);
  const countdown = useCountdown(trip.pendingRevision?.effectiveAt);

  const current = trip.versions[trip.versions.length - 1];
  const driver = drivers.find((d) => d.id === current.driverId);
  const vehicle = vehicles.find((v) => v.id === current.vehicleId);
  const pend = trip.pendingRevision;
  const pendDriver = pend ? drivers.find((d) => d.id === pend.driverId) : null;
  const pendVehicle = pend ? vehicles.find((v) => v.id === pend.vehicleId) : null;

  return (
    <article className={`trip-card status-${trip.status === "已完成" ? "done" : "run"}`}>
      <header className="trip-head">
        <div>
          <h3>{trip.tripNo} <span className={`trip-status trip-status-${trip.status}`}>{trip.status}</span></h3>
          <p className="sub">发车 {new Date(trip.dispatchedAt).toLocaleString("zh-CN")} · 当前 v{current.version}</p>
        </div>
        <div className="trip-actions">
          <button type="button" className="secondary" onClick={() => setShowChain((v) => !v)}>
            {showChain ? "收起版本链" : `版本链 (${trip.versions.length})`}
          </button>
          {trip.status === "已发车" && (
            <>
              <button type="button" onClick={() => setEditing(true)} disabled={Boolean(pend)} title={pend ? "已有待生效改派，生效后才能再次改派" : ""}>
                ✎ 改派
              </button>
              <button type="button" className="secondary" onClick={() => complete(trip.id)}>完结车次</button>
            </>
          )}
        </div>
      </header>

      <div className="trip-current">
        <p className="trip-people">
          👤 {driver?.name ?? "?"} <span className="sub">（{driver?.licenses.join("/")}）</span>
          {" → "}🚚 {vehicle?.plate ?? "?"}
        </p>
        <ol className="trip-stops">
          {current.stops.map((stop, i) => {
            const order = orders.find((o) => o.id === stop.orderId);
            if (!order) return null;
            return (
              <li key={stop.orderId}>
                <span className="stop-index">{i + 1}</span>
                <span>{order.orderNo}</span>
                <TempBadge value={order.tempClass} />
                <span className="sub">{order.region} · {formatWindow(order.window)}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {pend && (
        <div className="pending-box">
          <header>
            <strong>⏳ v{pend.version} 待生效改派</strong>
            <span className="countdown">{countdown}</span>
          </header>
          <p className="sub">生效时间：{new Date(pend.effectiveAt).toLocaleString("zh-CN")}（到点自动切换，原占用届时释放）</p>
          <p className="trip-people">
            将变为：👤 {pendDriver?.name ?? "?"} → 🚚 {pendVehicle?.plate ?? "?"}
          </p>
          <ol className="trip-stops compact">
            {pend.stops.map((stop, i) => {
              const order = orders.find((o) => o.id === stop.orderId);
              if (!order) return null;
              return (
                <li key={stop.orderId}>
                  <span className="stop-index">{i + 1}</span>
                  <span>{order.orderNo}</span>
                  <TempBadge value={order.tempClass} />
                  <span className="sub">{order.region}</span>
                </li>
              );
            })}
          </ol>
          <p className="reason">改派原因：{pend.reason}</p>
        </div>
      )}

      {showChain && (
        <div className="chain-box">
          <h4>版本链（只追加，不可改写）</h4>
          {trip.versions.map((v) => {
            const dv = drivers.find((d) => d.id === v.driverId);
            const vh = vehicles.find((x) => x.id === v.vehicleId);
            return (
              <div className="chain-node" key={v.version}>
                <span className="chain-ver">v{v.version}</span>
                <div>
                  <p>{dv?.name ?? "?"} · {vh?.plate ?? "?"} · {v.stops.length} 单</p>
                  <p className="sub">{new Date(v.createdAt).toLocaleString("zh-CN")}</p>
                  <p className="reason">{v.reason}</p>
                </div>
              </div>
            );
          })}
          {pend && <div className="chain-node pending-node"><span className="chain-ver">v{pend.version}</span><div><p>（预占中）{pendDriver?.name} · {pendVehicle?.plate}</p><p className="reason">{pend.reason}</p></div></div>}
        </div>
      )}

      {editing && <RevisionModal trip={trip} onClose={() => setEditing(false)} />}
    </article>
  );
}

export function TripsPanel() {
  const trips = useGate((s) => s.trips);

  return (
    <section className="trips-section">
      <div className="section-title-row">
        <h2>已发车车次 · 锁定与版本链</h2>
        <p className="panel-hint">发车即锁定司机、车辆与顺序。改派登记新版本并保留原因；生效前原占用不释放。</p>
      </div>
      {trips.length === 0 ? <div className="empty-inline">还没有发车车次</div> : (
        <div className="trip-grid">
          {trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
        </div>
      )}
    </section>
  );
}
