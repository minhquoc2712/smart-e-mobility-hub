import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chargingApi, authApi, hubApi } from '../../api';
import { useApi } from '../../hooks/useApi';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState, describeApiError } from '../../components/common/ErrorState';
import { StatusBadge } from '../../components/common/StatusBadge';
import vehicleImage from '../../components/common/images/vehicle.jpg';

const VEHICLES_KEY = 'semh_private_vehicles';

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
  const [actionError, setActionError] = useState('');
  const requestsQuery = useApi(() => chargingApi.getChargingRequests(), [], { initialData: [] });
  const hubsQuery = useApi(() => hubApi.getHubs(), [], { initialData: [] });
  const requests = requestsQuery.data || [];
  const hubs = hubsQuery.data || [];

  useEffect(() => {
    const savedVehicles = JSON.parse(sessionStorage.getItem(VEHICLES_KEY) || 'null');
    if (savedVehicles) {
      setVehicles(savedVehicles);
      setVehicleId(savedVehicles[0].id);
    }
  }, []);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) || vehicles[0];

  const openEditor = () => {
    setName(selectedVehicle.name);
    setType(selectedVehicle.type);
    setEditing(true);
  };

  const saveVehicle = async (event) => {
    event.preventDefault();
    const updated = vehicles.map((vehicle) => vehicle.id === selectedVehicle.id
      ? { ...vehicle, name, type }
      : vehicle);
    sessionStorage.setItem(VEHICLES_KEY, JSON.stringify(updated));
    setVehicles(updated);
    setEditing(false);
    setActionError('');
    try {
      await authApi.updatePrivateVehicle({
        privateVehiclePlate: selectedVehicle.id,
        privateVehicleModel: `${name} (${type})`,
      });
    } catch (err) {
      // The local copy is kept, but tell the user the server did not save it.
      setActionError(`Saved on this device only: ${describeApiError(err)}`);
    }
  };

  const cancelCharging = async (id) => {
    setActionError('');
    try {
      await chargingApi.cancelChargingRequest(id);
      requestsQuery.setData((items) => (items || []).map((r) => r.id === id ? {...r,status:'CANCELLED'} : r));
    } catch (err) { setActionError(describeApiError(err, 'Unable to cancel charging.')); }
  };
  const activeRequests = requests.filter((r) => ['SCHEDULED','QUEUED','CHARGING'].includes(r.status));
  const requestHistory = requests.filter((r) => !['SCHEDULED','QUEUED','CHARGING'].includes(r.status));
  const localTime = (value) => value ? new Date(value).toLocaleString('en-GB', {dateStyle:'short',timeStyle:'short'}) : '—';

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
            {hubsQuery.loading && <LoadingState inline message="Loading charging availability…" />}
            {hubsQuery.error && <ErrorState inline error={hubsQuery.error} onRetry={hubsQuery.reload} />}
            {!hubsQuery.loading && !hubsQuery.error && !hubs.length && <p>No hubs found.</p>}
            {hubs.map((h) => <div key={h.id}><span>{h.name}</span><strong>{h.availableChargingPoints} currently available</strong></div>)}
            <button className="floating-action" type="button" onClick={() => navigate('/student/charging')}>
              Register for charging
            </button>
          </section>

          <section className="charging-status-card">
            <h2>Current charging status</h2>
            {requestsQuery.loading && <LoadingState inline message="Loading your charging requests…" />}
            {requestsQuery.error && <ErrorState inline error={requestsQuery.error} onRetry={requestsQuery.reload} />}
            {actionError && <ErrorState inline error={actionError} />}
            {activeRequests.map((request) => (
              <article key={request.id} className="charging-status-row">
                <strong>{request.requestCode ?? request.request_code}</strong>
                <div><span>Vehicle / slot</span><strong>{request.privateVehicleLabel ?? request.private_vehicle_label ?? selectedVehicle.id}</strong></div>
                <div><span>Charging session</span><strong>{localTime(request.scheduledStart ?? request.scheduled_start)} – {localTime(request.scheduledEnd ?? request.scheduled_end)}</strong></div>
                <div><span>Charger</span><strong>{request.chargingPointCode ?? (request.status === 'QUEUED' ? 'Automatic queue' : 'Assigned')}</strong></div>
                <div><span>Status</span><StatusBadge status={request.status} /></div>
                {['QUEUED','SCHEDULED'].includes(request.status) && <button type="button" onClick={() => cancelCharging(request.id)}>Cancel reservation</button>}
              </article>
            ))}
            {!requestsQuery.loading && !requestsQuery.error && !activeRequests.length && <p>No active charging reservations.</p>}
            <h3>Charging history</h3>
            {requestHistory.map((request) => <article key={request.id} className="charging-status-row">
              <strong>{request.requestCode ?? request.request_code}</strong>
              <div><span>Vehicle</span><strong>{request.privateVehicleLabel ?? request.private_vehicle_label ?? selectedVehicle.id}</strong></div>
              <div><span>Session</span><strong>{localTime(request.scheduledStart ?? request.scheduled_start)} – {localTime(request.scheduledEnd ?? request.scheduled_end)}</strong></div>
              <div><span>Status</span><StatusBadge status={request.status} /></div>
            </article>)}
            {!requestsQuery.loading && !requestsQuery.error && !requestHistory.length && <p>No past or cancelled requests.</p>}
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
