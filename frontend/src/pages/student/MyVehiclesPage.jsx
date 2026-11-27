import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, chargingApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { EvIllustration } from '../../components/common/EvIllustration';
import { QuickGuideStrip } from '../../components/common/QuickGuideStrip';
import {
  loadPrivateVehiclesForUser,
  savePrivateVehiclesForUser,
} from '../../utils/privateVehicle';

const PRIVATE_EV_GUIDE = [
  {
    title: 'Manage Personal EV',
    desc: 'Keep your e-bike or e-scooter profile and connector type saved for fast booking.',
  },
  {
    title: 'Check Live Charger Slots',
    desc: 'Inspect nearby VNU-HCM hubs with open AC/DC charging ports.',
  },
  {
    title: 'Lock Charging Window',
    desc: 'Reserve a guaranteed charging time slot at student rate (5.000 ₫/h).',
  },
];

const CANCELLED_CHARGING_KEY = 'semh_cancelled_charging_requests';

export function MyVehiclesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState(() => loadPrivateVehiclesForUser(user));
  const [vehicleId, setVehicleId] = useState(() => loadPrivateVehiclesForUser(user)[0].id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('Private electric bike');
  const [plateId, setPlateId] = useState('');
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const userVehicles = loadPrivateVehiclesForUser(user);
    setVehicles(userVehicles);
    setVehicleId(userVehicles[0].id);

    const cancelled = JSON.parse(sessionStorage.getItem(CANCELLED_CHARGING_KEY) || '[]');
    chargingApi.getChargingRequests().then((items) => {
      setRequests(items.filter((item) => !cancelled.includes(item.id)));
    });
  }, [user?.id, user?.privateVehiclePlate, user?.privateVehicleModel]);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) || vehicles[0];

  const openEditor = () => {
    setName(selectedVehicle.name);
    setType(selectedVehicle.type);
    setPlateId(selectedVehicle.id);
    setEditing(true);
  };

  const saveVehicle = async (event) => {
    event.preventDefault();
    const cleanName = name.trim() || selectedVehicle.name;
    const cleanId = plateId.trim() || selectedVehicle.id;
    const updated = vehicles.map((vehicle) =>
      vehicle.id === selectedVehicle.id
        ? { ...vehicle, id: cleanId, name: cleanName, type }
        : vehicle
    );
    savePrivateVehiclesForUser(user, updated);
    setVehicles(updated);
    setVehicleId(cleanId);
    setEditing(false);
    try {
      await authApi.updatePrivateVehicle({
        privateVehiclePlate: cleanId,
        privateVehicleModel: `${cleanName} (${type})`,
      });
    } catch {
      // Keep sessionStorage update if offline
    }
  };

  const cancelCharging = async (id) => {
    const cancelled = JSON.parse(sessionStorage.getItem(CANCELLED_CHARGING_KEY) || '[]');
    sessionStorage.setItem(CANCELLED_CHARGING_KEY, JSON.stringify([...cancelled, id]));
    setRequests((items) => items.filter((item) => item.id !== id));
    try {
      await chargingApi.cancelChargingRequest(id);
    } catch {
      // Keep local cancellation if request was already cancelled
    }
  };

  return (
    <div className="my-vehicles-page">
      <h1>Private vehicle owners</h1>
      <p className="page-description">Manage your vehicle and reserve a charging slot—no vehicle rental needed.</p>
      <QuickGuideStrip steps={PRIVATE_EV_GUIDE} />

      <div className="my-vehicles-grid">
        <section className="vehicle-owner-card">
          <h2>My vehicle</h2>
          <div className="vehicle-selector">
            <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.name} - {vehicle.id}</option>
              ))}
            </select>
          </div>
          <div className="private-vehicle-image">
            <EvIllustration variant={selectedVehicle.type.toLowerCase().includes('scooter') ? 'scooter' : 'bike'} />
          </div>
          <strong>{selectedVehicle.name} - {selectedVehicle.id}</strong>
          <div className="battery-row">
            <span>Battery: {selectedVehicle.battery}%</span>
            <div><i style={{ width: `${selectedVehicle.battery}%` }} /></div>
          </div>
          <div className="vehicle-detail-row"><span>Vehicle type</span><strong>{selectedVehicle.type}</strong></div>
          <div className="vehicle-detail-row"><span>Connector</span><strong>{selectedVehicle.type.includes('bike') ? 'E-bike socket' : 'Type 2 connector'}</strong></div>
          <button className="edit-vehicle-button" type="button" onClick={openEditor}>Edit vehicle details</button>
        </section>

        <div>
          <section className="availability-owner-card">
            <h2>Nearby charging availability</h2>
            <div><span>HCMUT Main Gate hub · 0.3 km</span><strong>2 slots available</strong></div>
            <div><span>Central hub · 0.8 km</span><strong>1 slot available</strong></div>
            <div><span>IU Main gate</span><strong>No slots available</strong></div>
            <button className="floating-action" type="button" onClick={() => navigate('/student/charging')}>
              Register for charging
            </button>
          </section>

          <section className="charging-status-card">
            <h2>Current charging status</h2>
            {requests.map((request) => (
              <article key={request.id} className="charging-status-row">
                <strong>{request.requestCode}</strong>
                <div><span>Vehicle / slot</span><strong>{request.privateVehicleLabel || selectedVehicle.id}</strong></div>
                <div><span>Charging session</span><strong>{request.scheduledStart?.slice(11, 16)} - {request.scheduledEnd?.slice(11, 16)}</strong></div>
                <button type="button" onClick={() => cancelCharging(request.id)}>Cancel reservation</button>
              </article>
            ))}
            {!requests.length && <p>No active charging reservations.</p>}
          </section>
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <form className="vehicle-edit-modal" onSubmit={saveVehicle}>
            <h2>Edit vehicle details</h2>
            <label>Vehicle name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Vehicle type
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option>Private electric bike</option>
                <option>Private electric scooter</option>
                <option>Private electric car</option>
              </select>
            </label>
            <label>
              Vehicle ID / License plate
              <input
                value={plateId}
                maxLength={30}
                required
                placeholder="e.g. 59-MĐ1 123.45 or PV-005"
                onChange={(event) => setPlateId(event.target.value)}
              />
            </label>
            <button className="primary-action" type="submit">Save details</button>
            <button className="secondary-action" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        </div>
      )}
    </div>
  );
}
