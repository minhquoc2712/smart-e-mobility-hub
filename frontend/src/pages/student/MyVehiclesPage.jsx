import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chargingApi, hubApi } from '../../api';
import vehicleImage from '../../components/common/images/vehicle.jpg';

const VEHICLES_KEY = 'semh_private_vehicles';
const CANCELLED_CHARGING_KEY = 'semh_cancelled_charging_requests';

const initialVehicles = [
  { id: 'PV-018', name: 'My e-bike', type: 'Private electric bike', battery: 38 },
];

export function MyVehiclesPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [vehicleId, setVehicleId] = useState(initialVehicles[0].id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialVehicles[0].name);
  const [type, setType] = useState(initialVehicles[0].type);
  const [requests, setRequests] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [availabilityError, setAvailabilityError] = useState('');

  useEffect(() => {
    const savedVehicles = JSON.parse(sessionStorage.getItem(VEHICLES_KEY) || 'null');
    if (savedVehicles) {
      setVehicles(savedVehicles);
      setVehicleId(savedVehicles[0].id);
    }
    const cancelled = JSON.parse(sessionStorage.getItem(CANCELLED_CHARGING_KEY) || '[]');
    chargingApi.getChargingRequests().then((items) => {
      setRequests(items.filter((item) => !cancelled.includes(item.id)));
    });
    hubApi.getHubs()
      .then(setHubs)
      .catch((error) => setAvailabilityError(error.message || 'Unable to load charging availability.'));
  }, []);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) || vehicles[0];

  const openEditor = () => {
    setName(selectedVehicle.name);
    setType(selectedVehicle.type);
    setEditing(true);
  };

  const saveVehicle = (event) => {
    event.preventDefault();
    const updated = vehicles.map((vehicle) => vehicle.id === selectedVehicle.id
      ? { ...vehicle, name, type }
      : vehicle);
    sessionStorage.setItem(VEHICLES_KEY, JSON.stringify(updated));
    setVehicles(updated);
    setEditing(false);
  };

  const cancelCharging = (id) => {
    const cancelled = JSON.parse(sessionStorage.getItem(CANCELLED_CHARGING_KEY) || '[]');
    sessionStorage.setItem(CANCELLED_CHARGING_KEY, JSON.stringify([...cancelled, id]));
    setRequests((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="my-vehicles-page">
      <h1>Private vehicle owners</h1>
      <p className="page-description">Manage your vehicle and reserve a charging slot—no vehicle rental needed.</p>

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
            <img src={vehicleImage} alt={selectedVehicle.name} />
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
            {availabilityError && <p role="alert">{availabilityError}</p>}
            {hubs.map((hub) => (
              <div key={hub.id}>
                <span>{hub.name} · {hub.campusZone}</span>
                <strong>{hub.availableChargingPoints} slots available</strong>
              </div>
            ))}
            {!availabilityError && !hubs.length && <p>Loading charging availability...</p>}
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
            <label>Vehicle ID<input value={selectedVehicle.id} disabled /></label>
            <button className="primary-action" type="submit">Save details</button>
            <button className="secondary-action" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        </div>
      )}
    </div>
  );
}
