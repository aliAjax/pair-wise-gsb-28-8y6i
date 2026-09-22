import { useDroppable } from "@dnd-kit/core";
import type { Draft, Driver, Vehicle } from "../types";
import { useGate } from "../store/useGate";
import { certState, TempBadge } from "./shared";
import { DraggableOrder } from "./DraggableOrder";

function LaneDropZone({ vehicleId, children }: { vehicleId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${vehicleId}` });
  return (
    <div ref={setNodeRef} className={`lane-drop${isOver ? " lane-drop-over" : ""}`}>
      {children}
    </div>
  );
}

function Lane({ draft, vehicle }: { draft: Draft; vehicle: Vehicle }) {
  const drivers = useGate((s) => s.drivers);
  const orders = useGate((s) => s.orders);
  const trips = useGate((s) => s.trips);
  const setDriver = useGate((s) => s.setDraftDriver);
  const removeStop = useGate((s) => s.removeDraftStop);
  const reorder = useGate((s) => s.reorderDraftStops);
  const dispatch = useGate((s) => s.dispatch);

  const driver: Driver | null = draft.driverId ? drivers.find((d) => d.id === draft.driverId) ?? null : null;
  const stopOrders = draft.stops
    .map((s) => orders.find((o) => o.id === s.orderId))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  const usedWeight = stopOrders.reduce((sum, o) => sum + o.weight, 0);
  const loadPct = Math.min(100, Math.round((usedWeight / vehicle.capacity) * 100));
  const overloaded = usedWeight > vehicle.capacity;
  const licenseOk = driver ? driver.licenses.includes(vehicle.requiredLicense) : false;
  const vehicleTrips = trips.filter(
    (t) =>
      t.versions[t.versions.length - 1].vehicleId === vehicle.id ||
      t.pendingRevision?.vehicleId === vehicle.id
  );

  const move = (index: number, delta: number) => {
    const ids = draft.stops.map((s) => s.orderId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder(vehicle.id, ids);
  };

  return (
    <article className="lane">
      <header className="lane-head">
        <div>
          <h3>{vehicle.plate}</h3>
          <p className="lane-spec">
            核载 <b className={overloaded ? "danger-text" : ""}>{usedWeight}/{vehicle.capacity}kg</b>
            {" · "}需 {vehicle.requiredLicense} 证
          </p>
          <div className="badge-row">
            {vehicle.tempZones.map((z) => <TempBadge key={z} value={z} />)}
          </div>
          <p className="lane-permit">通行证：{vehicle.permitRegions.join("、") || "无（任何区域都会拒绝）"}</p>
        </div>
        {vehicleTrips.length > 0 && (
          <div className="lane-locked-hint">
            {vehicleTrips.map((t) => (
              <span key={t.id} className="mini-lock">
                🔒 {t.tripNo}
                {t.pendingRevision ? `（v${t.pendingRevision.version} 待生效）` : " 在途"}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className={`load-bar${overloaded ? " over" : ""}`}>
        <div style={{ width: `${loadPct}%` }} />
      </div>

      <label className="driver-pick">
        <span>车道司机（发车前可更换）</span>
        <select value={driver?.id ?? ""} onChange={(e) => setDriver(vehicle.id, e.target.value || null)}>
          <option value="">— 请选择司机 —</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}（{d.licenses.join("/")}）</option>)}
        </select>
      </label>

      {driver && (
        <ul className={`cert-list ${licenseOk ? "" : "cert-bad"}`}>
          <li className={licenseOk ? "cert-ok" : "cert-expired"}>
            {licenseOk ? `✓ 准驾 ${vehicle.requiredLicense} 匹配` : `✗ 准驾不符：缺 ${vehicle.requiredLicense}`}
          </li>
          {Object.entries(driver.certExpiries).map(([cert, expiry]) => {
            const state = certState(expiry);
            return <li key={cert} className={state.cls}>{cert}：{state.text}</li>;
          })}
        </ul>
      )}

      <LaneDropZone vehicleId={vehicle.id}>
        {stopOrders.length === 0 ? (
          <div className="lane-empty">把订单拖到这里做准入校验</div>
        ) : (
          <ol className="stop-list">
            {stopOrders.map((order, index) => (
              <li className="stop-item" key={order.id}>
                <span className="stop-index">{index + 1}</span>
                <DraggableOrder order={order} from={vehicle.id} ghost />
                <div className="stop-ops">
                  <button type="button" className="icon-btn" title="上移" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" className="icon-btn" title="下移" disabled={index === stopOrders.length - 1} onClick={() => move(index, 1)}>↓</button>
                  <button type="button" className="icon-btn danger-text" title="移出车道（回到订单池）" onClick={() => removeStop(vehicle.id, order.id)}>×</button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </LaneDropZone>

      <button type="button" className="dispatch-btn" disabled={stopOrders.length === 0} onClick={() => dispatch(vehicle.id)}>
        🔒 发车并锁定（{stopOrders.length} 单）
      </button>
      <p className="dispatch-note">发车后司机、车辆与送达顺序写入不可变版本；之后改派须填原因、生成新版本。</p>
    </article>
  );
}

export function GateBoard() {
  const vehicles = useGate((s) => s.vehicles);
  const drafts = useGate((s) => s.drafts);

  return (
    <section className="board-section">
      <div className="section-title-row">
        <h2>车辆通行证准入台</h2>
        <p className="panel-hint">
          每辆车一条车道；车辆在途车次的时段会直接占用车道，拖入时与其他车次、其他车道和司机档期一并比对。
        </p>
      </div>
      <div className="lane-grid">
        {vehicles.map((vehicle) => (
          <Lane
            key={vehicle.id}
            vehicle={vehicle}
            draft={drafts.find((d) => d.vehicleId === vehicle.id) ?? { vehicleId: vehicle.id, driverId: null, stops: [] }}
          />
        ))}
      </div>
    </section>
  );
}
