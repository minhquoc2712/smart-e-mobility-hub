import React, { useEffect, useState } from 'react';
import { chargingApi, hubApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../../components/common/StatusBadge';

/**
 * Starter Screen for Wireframes 9 & 10 (Charging Registration & Private EV Owners — UC08, UC09)
 * Owners: Lê Minh Nhật (Task 3.2a) & Charging Queue screen (Task 4.1a)
 */
export function ChargingPage() {
  const { user } = useAuth();
  const [hubs, setHubs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [hubId, setHubId] = useState(1);
  const [ownershipType, setOwnershipType] = useState(user?.privateVehiclePlate ? 'PRIVATE' : 'RENTAL');
  const [privateVehicleLabel, setPrivateVehicleLabel] = useState(user?.privateVehiclePlate || '59-MĐ1 123.45');

  const refresh = () => {
    chargingApi.getChargingRequests().then(setRequests);
  };

  useEffect(() => {
    hubApi.getHubs().then((h) => {
      setHubs(h);
      if (h[0]) setHubId(h[0].id);
    });
    refresh();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const now = new Date();
    const end = new Date(now.getTime() + 90 * 60 * 1000);
    await chargingApi.createChargingRequest({
      userId: user?.id,
      hubId,
      ownershipType,
      privateVehicleLabel: ownershipType === 'PRIVATE' ? privateVehicleLabel : null,
      currentBatteryLevel: 25,
      targetBatteryLevel: 85,
      scheduledStart: now.toISOString(),
      scheduledEnd: end.toISOString(),
    });
    refresh();
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Register for Charging (UC09)</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label>Vehicle Ownership</label>
            <select className="select" value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}>
              <option value="RENTAL">Shared Rental EV</option>
              <option value="PRIVATE">Private Student EV</option>
            </select>
          </div>
          <div>
            <label>Select Mobility Hub</label>
            <select className="select" value={hubId} onChange={(e) => setHubId(Number(e.target.value))}>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.availableChargingPoints} chargers free)
                </option>
              ))}
            </select>
          </div>
          {ownershipType === 'PRIVATE' && (
            <div>
              <label>Private EV Plate / Model</label>
              <input className="input" value={privateVehicleLabel} onChange={(e) => setPrivateVehicleLabel(e.target.value)} />
            </div>
          )}
          <button type="submit" className="btn btn-primary">
            Schedule Charging Slot
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Active Charging Queue</h3>
        {requests.map((req) => (
          <div key={req.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #d3e5d8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{req.requestCode}</strong>
              <StatusBadge status={req.status} />
            </div>
            <div style={{ fontSize: '0.86rem', color: '#556b5d' }}>
              {req.hubName} · {req.ownershipType} · Priority: <strong>{req.priority}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
