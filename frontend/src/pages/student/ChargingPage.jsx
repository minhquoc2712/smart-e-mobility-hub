import React, { useEffect, useMemo, useState } from 'react';
import { chargingApi, hubApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import chargingImage from '../../components/common/images/charging spot.jpg';

const VEHICLES_KEY = 'semh_private_vehicles';
const DEFAULT_VEHICLES = [
  { id: 'PV-018', name: 'My e-bike', type: 'Private electric bike', battery: 38 },
];
const RATE_PER_HOUR = 1;

function getLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getInitialSchedule() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  if (start.getTime() <= Date.now()) start.setHours(start.getHours() + 1);
  if (start.getHours() > 22) {
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);
  }
  return {
    date: getLocalDate(start),
    time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
  };
}

function getConnector(vehicle) {
  const type = vehicle?.type?.toLowerCase() || '';
  if (type.includes('bike')) return 'E-bike socket';
  if (type.includes('scooter')) return 'Type 2 connector';
  return 'Type 2 connector';
}

function getChargingPointCode(point) {
  return point.chargerCode ?? point.charger_code ?? '';
}

function displayDate(date) {
  if (!date) return '—';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ChargingPage() {
  const { user } = useAuth();
  const initialSchedule = useMemo(getInitialSchedule, []);
  const [hubs, setHubs] = useState([]);
  const [vehicles, setVehicles] = useState(DEFAULT_VEHICLES);
  const [hubId, setHubId] = useState('');
  const [vehicleId, setVehicleId] = useState(DEFAULT_VEHICLES[0].id);
  const [chargingPoints, setChargingPoints] = useState([]);
  const [date, setDate] = useState(initialSchedule.date);
  const [startTime, setStartTime] = useState(initialSchedule.time);
  const [durationHours, setDurationHours] = useState(1);
  const [slotCode, setSlotCode] = useState('');
  const [registration, setRegistration] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedVehicles = JSON.parse(sessionStorage.getItem(VEHICLES_KEY) || 'null');
    if (Array.isArray(savedVehicles) && savedVehicles.length > 0) {
      setVehicles(savedVehicles);
      setVehicleId(savedVehicles[0].id);
    }

    hubApi.getHubs()
      .then((list) => {
        setHubs(list);
        if (list[0]) {
          setHubId(String(list[0].id));
        }
      })
      .catch((loadError) => setError(loadError.message || 'Unable to load charging hubs.'));

    chargingApi.getChargingRequests()
      .then((requests) => {
        if (user?.id == null) return;
        const now = Date.now();
        const existingRegistration = requests.find((request) =>
          String(request.userId ?? request.user_id) === String(user?.id)
          && request.ownershipType === 'PRIVATE'
          && ['SCHEDULED', 'QUEUED'].includes(request.status)
          && new Date(request.scheduledEnd ?? request.scheduled_end).getTime() > now);
        if (existingRegistration) setRegistration(existingRegistration);
      })
      .catch((loadError) => setError(loadError.message || 'Unable to load charging registrations.'));
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    setChargingPoints([]);
    setSlotCode('');
    if (!hubId) {
      return () => {
        active = false;
      };
    }

    hubApi.getChargingPoints(hubId)
      .then((points) => {
        if (!active) return;
        const available = points.filter((point) => String(point.status).toUpperCase() === 'AVAILABLE');
        setChargingPoints(available);
        setSlotCode((current) => (
          available.some((point) => getChargingPointCode(point) === current)
            ? current
            : getChargingPointCode(available[0] || {})
        ));
      })
      .catch((loadError) => {
        if (!active) return;
        setChargingPoints([]);
        setSlotCode('');
        setError(loadError.message || 'Unable to load available charging points.');
      });

    return () => {
      active = false;
    };
  }, [hubId]);

  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(vehicleId)) || vehicles[0];
  const selectedHub = hubs.find((hub) => String(hub.id) === String(hubId));
  const availableSlots = chargingPoints;
  const selectedChargingPoint = availableSlots.find((point) => getChargingPointCode(point) === slotCode);
  const duration = Number(durationHours);
  const endTime = useMemo(() => {
    if (!startTime) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const end = new Date(2000, 0, 1, hours, minutes + duration * 60);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  }, [startTime, duration]);
  const total = (duration * RATE_PER_HOUR).toFixed(2);
  const today = getLocalDate(new Date());
  const currentTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!date || !startTime || !duration || !hubId || !selectedVehicle) {
      setError('Complete all charging details before registering.');
      return;
    }
    if (!slotCode || !selectedChargingPoint) {
      setError('Choose an available charging slot.');
      return;
    }

    const scheduledStart = new Date(`${date}T${startTime}`);
    const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60 * 60 * 1000);
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
      setError('Enter a valid charging date and time.');
      return;
    }
    if (scheduledStart.getTime() < Date.now()) {
      setError('Charging date and start time cannot be in the past.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        userId: user?.id,
        hubId: Number(hubId),
        ownershipType: 'PRIVATE',
        vehicleId: null,
        chargingPointId: selectedChargingPoint.id,
        slotCode,
        privateVehicleLabel: `${selectedVehicle.name} · ${selectedVehicle.id}`,
        currentBatteryLevel: Number(selectedVehicle.battery) || 0,
        targetBatteryLevel: 85,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      };
      const created = await chargingApi.createChargingRequest(payload);
      setRegistration({ ...payload, ...created, hubName: selectedHub?.name });
      setSuccess('Your charging registration was verified.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to register for charging.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!registration?.id) {
      setError('The registration has no server ID and cannot be cancelled.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await chargingApi.cancelChargingRequest(registration.id);
      setRegistration(null);
      setSuccess('');
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel charging registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHubChange = (event) => {
    const nextHubId = event.target.value;
    setHubId(nextHubId);
    setSlotCode('');
  };

  return (
    <div className="charging-registration-page">
      <header className="charging-page-heading">
        <h1>Register for charging</h1>
        <p>Reserve a charging slot for your private vehicle at a nearby hub.</p>
      </header>

      <div className="charging-page-grid">
        <section className={`charging-details-card${registration ? ' is-registered' : ''}`}>
          <h2>Charging details</h2>
          <form id="charging-registration-form" onSubmit={handleSubmit}>
            <div className="charging-fields-row">
              <label>
                Your vehicle
                <select
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  disabled={Boolean(registration)}
                >
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.id}</option>
                  ))}
                </select>
              </label>
              <label>
                Connector
                <select value={getConnector(selectedVehicle)} onChange={() => {}} aria-label="Connector type" disabled>
                  <option>{getConnector(selectedVehicle)}</option>
                </select>
              </label>
            </div>

            <label>
              Charging hub
              <select
                value={hubId}
                onChange={handleHubChange}
                required
                disabled={Boolean(registration)}
              >
                {hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name} — {hub.campusZone}
                  </option>
                ))}
              </select>
            </label>

            <div className="charging-fields-row">
              <label>
                Available slot
                <select
                  value={slotCode}
                  onChange={(event) => setSlotCode(event.target.value)}
                  disabled={Boolean(registration) || availableSlots.length === 0}
                  required
                >
                  {availableSlots.length === 0 && <option value="">No slots available</option>}
                  {availableSlots.map((point) => {
                    const code = getChargingPointCode(point);
                    return (
                      <option key={point.id} value={code}>{code} · Available</option>
                    );
                  })}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={date}
                  min={today}
                  required
                  onChange={(event) => setDate(event.target.value)}
                  disabled={Boolean(registration)}
                />
              </label>
            </div>

            <div className="charging-fields-row">
              <label>
                Start time
                <input
                  type="time"
                  value={startTime}
                  min={date === today ? currentTime : undefined}
                  required
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={Boolean(registration)}
                />
              </label>
              <label>
                Duration
                <select
                  value={durationHours}
                  onChange={(event) => setDurationHours(Number(event.target.value))}
                  disabled={Boolean(registration)}
                >
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={3}>3 hours</option>
                  <option value={4}>4 hours</option>
                </select>
              </label>
            </div>
            <p className="charging-form-note">Bring your own compatible charger. Your slot is held for the selected charging period.</p>
          </form>
        </section>

        <section className="charging-summary-card">
          <h2>Registration summary</h2>
          <div className="charging-summary-image">
            <img src={chargingImage} alt="Charging station illustration" />
          </div>
          <div className="charging-summary-row">
            <span>Vehicle / battery</span>
            <strong>{selectedVehicle?.id || '—'} · {selectedVehicle?.battery ?? 0}%</strong>
          </div>
          <div className="charging-summary-row">
            <span>Hub / slot</span>
            <strong className="charging-summary-hub-slot">
              <span>{selectedHub?.name?.replace(/\s+Hub$/i, '') || 'Select a hub'} ·</span>
              <span>{slotCode || 'No slot selected'}</span>
            </strong>
          </div>
          <div className="charging-summary-row">
            <span>Date</span>
            <strong>{displayDate(date)}</strong>
          </div>
          <div className="charging-summary-row">
            <span>Charging time</span>
            <strong>{startTime || '—'} – {endTime || '—'}</strong>
          </div>
          <div className="charging-summary-row">
            <span>Total · {duration} {duration === 1 ? 'hour' : 'hours'}</span>
            <strong>${total}</strong>
          </div>
          {error && <p className="charging-feedback charging-feedback-error" role="alert">{error}</p>}
          {success && <p className="charging-feedback charging-feedback-success" role="status">{success}</p>}
          {registration ? (
            <button
              type="button"
              className="charging-cancel-button"
              onClick={handleCancelRegistration}
              disabled={submitting}
            >
              {submitting ? 'Cancelling...' : 'Cancel registration'}
            </button>
          ) : (
            <button
              type="submit"
              form="charging-registration-form"
              className="charging-register-button"
              disabled={submitting || !hubId || availableSlots.length === 0}
            >
              {submitting ? 'Registering...' : 'Register charging'}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
