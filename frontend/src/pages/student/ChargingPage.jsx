import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { chargingApi, hubApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import {
  TimeSlotWeekPicker,
  findFirstFreeHour,
  getLocalDateStr,
  isWindowBooked,
} from '../../components/common/TimeSlotWeekPicker';
import { CHARGING_HOURLY_VND, formatVnd } from '../../utils/currency';
import { EvIllustration } from '../../components/common/EvIllustration';
import { QuickGuideStrip } from '../../components/common/QuickGuideStrip';

const CHARGING_GUIDE = [
  {
    title: 'Select Vehicle & Hub',
    desc: 'Choose your private EV and a campus hub with operational chargers.',
  },
  {
    title: 'Pick Unshaded Hours',
    desc: 'Select a charger port and free time window across the 7-day schedule.',
  },
  {
    title: 'Instant Slot Lock',
    desc: 'Confirmed windows lock your charger first; full hours join the priority waitlist.',
  },
];

const VEHICLES_KEY = 'semh_private_vehicles';
const DEFAULT_VEHICLES = [
  { id: 'PV-018', name: 'My e-bike', type: 'Private electric bike', battery: 38 },
];

function getConnector(vehicle) {
  const type = vehicle?.type?.toLowerCase() || '';
  if (type.includes('bike')) return 'E-bike socket';
  if (type.includes('scooter')) return 'Type 2 connector';
  return 'Type 2 connector';
}

function getChargingPointCode(point) {
  return point?.chargerCode ?? point?.charger_code ?? '';
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
  const today = useMemo(() => getLocalDateStr(new Date()), []);
  const [hubs, setHubs] = useState([]);
  const [vehicles, setVehicles] = useState(DEFAULT_VEHICLES);
  const [hubId, setHubId] = useState('');
  const [vehicleId, setVehicleId] = useState(DEFAULT_VEHICLES[0].id);
  const [chargingPoints, setChargingPoints] = useState([]);
  const [chargerBookings, setChargerBookings] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);

  const [slotCode, setSlotCode] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [durationHours, setDurationHours] = useState(1);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refreshMyRegistrations = useCallback(() => {
    chargingApi
      .getChargingRequests()
      .then((requests) => {
        if (user?.id == null) return;
        const active = (requests || []).filter(
          (r) =>
            String(r.userId ?? r.user_id) === String(user?.id) &&
            (r.ownershipType ?? r.ownership_type) === 'PRIVATE' &&
            ['SCHEDULED', 'QUEUED', 'CHARGING'].includes(String(r.status || '').toUpperCase())
        );
        setMyRegistrations(active);
      })
      .catch(() => {});
  }, [user?.id]);

  const refreshHubChargersAndBookings = useCallback(async (targetHubId) => {
    if (!targetHubId) return;
    const [points, windows] = await Promise.all([
      hubApi.getChargingPoints(targetHubId),
      hubApi.getBookedWindows(targetHubId).catch(() => ({ chargerBookings: [] })),
    ]);
    const operational = (points || []).filter(
      (point) => String(point.status).toUpperCase() !== 'OUT_OF_SERVICE'
    );
    setChargingPoints(operational);
    setChargerBookings(windows?.chargerBookings || []);
    setSlotCode((prev) => {
      if (prev && operational.some((p) => getChargingPointCode(p) === prev)) {
        return prev;
      }
      const firstAvail =
        operational.find((p) => String(p.status).toUpperCase() !== 'CHARGING') || operational[0];
      return firstAvail ? getChargingPointCode(firstAvail) : '';
    });
  }, []);

  useEffect(() => {
    const savedVehicles = JSON.parse(sessionStorage.getItem(VEHICLES_KEY) || 'null');
    if (Array.isArray(savedVehicles) && savedVehicles.length > 0) {
      setVehicles(savedVehicles);
      setVehicleId(savedVehicles[0].id);
    } else if (user?.privateVehiclePlate) {
      const fromDb = [
        {
          id: user.privateVehiclePlate,
          name: user.privateVehicleModel || 'My e-bike',
          type: 'Private electric bike',
          battery: 38,
        },
      ];
      setVehicles(fromDb);
      setVehicleId(fromDb[0].id);
    }

    hubApi
      .getHubs()
      .then((list) => {
        setHubs(list);
        if (list[0]) {
          setHubId(String(list[0].id));
        }
      })
      .catch((loadError) => setError(loadError.message || 'Unable to load charging hubs.'));

    refreshMyRegistrations();
  }, [user?.privateVehiclePlate, user?.privateVehicleModel, refreshMyRegistrations]);

  useEffect(() => {
    if (!hubId) return;
    refreshHubChargersAndBookings(hubId).catch((err) =>
      setError(err.message || 'Unable to load charging slots.')
    );
  }, [hubId, refreshHubChargersAndBookings]);

  const selectedVehicle =
    vehicles.find((vehicle) => String(vehicle.id) === String(vehicleId)) || vehicles[0];
  const selectedHub = hubs.find((hub) => String(hub.id) === String(hubId));
  const selectedChargingPoint = chargingPoints.find(
    (point) => getChargingPointCode(point) === slotCode
  );

  // Booked intervals ONLY for the currently selected charger!
  const bookedIntervalsForCharger = useMemo(() => {
    if (!selectedChargingPoint) return [];
    return chargerBookings.filter(
      (b) => Number(b.chargingPointId) === Number(selectedChargingPoint.id)
    );
  }, [chargerBookings, selectedChargingPoint]);

  // Auto-select first free hour when date or charger changes if current startTime is empty or booked
  useEffect(() => {
    if (!date) return;
    const curStartMs = startTime ? new Date(`${date}T${startTime}:00`).getTime() : NaN;
    const curEndMs = curStartMs + Number(durationHours || 1) * 3600 * 1000;
    const isInvalid =
      !startTime ||
      Number.isNaN(curStartMs) ||
      curStartMs < Date.now() - 60000 ||
      isWindowBooked(curStartMs, curEndMs, bookedIntervalsForCharger);

    if (isInvalid) {
      const nextFree = findFirstFreeHour(date, bookedIntervalsForCharger);
      setStartTime(nextFree);
      if (nextFree) setDurationHours(1);
    }
  }, [date, slotCode, bookedIntervalsForCharger]);

  const duration = Number(durationHours);
  const endTime = useMemo(() => {
    if (!startTime) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const end = new Date(2000, 0, 1, hours, minutes + duration * 60);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(
      2,
      '0'
    )}`;
  }, [startTime, duration]);
  const totalVnd = duration * CHARGING_HOURLY_VND;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!date || !startTime || !duration || !hubId || !selectedVehicle || !selectedChargingPoint) {
      setError('Please select a charger and an available (unshaded) start time.');
      return;
    }

    const [hh, mm] = startTime.split(':').map(Number);
    const [yy, mo, dd] = date.split('-').map(Number);
    const scheduledStart = new Date(yy, mo - 1, dd, hh, mm, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + duration * 3600 * 1000);

    if (isWindowBooked(scheduledStart.getTime(), scheduledEnd.getTime(), bookedIntervalsForCharger)) {
      setError('Selected time range overlaps a greyed-out booked slot. Please choose free hours.');
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const toLocalStr = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}:00`;

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
        currentBatteryLevel: Number(selectedVehicle.battery ?? 38),
        targetBatteryLevel: 100,
        scheduledStart: toLocalStr(scheduledStart),
        scheduledEnd: toLocalStr(scheduledEnd),
      };
      await chargingApi.createChargingRequest(payload);
      await Promise.all([refreshHubChargersAndBookings(hubId), refreshMyRegistrations()]);
      setSuccess(`Booked ${slotCode} on ${displayDate(date)} (${startTime}–${endTime}).`);
    } catch (requestError) {
      setError(requestError.message || 'Unable to register for charging.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRegistration = async (reqId) => {
    try {
      setSubmitting(true);
      setError('');
      await chargingApi.cancelChargingRequest(reqId);
      await Promise.all([refreshHubChargersAndBookings(hubId), refreshMyRegistrations()]);
      setSuccess('Charging slot cancelled — those hours are now open again.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel charging registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="charging-registration-page">
      <header className="charging-page-heading">
        <h1>Register for charging</h1>
        <p>Reserve a dedicated campus EV charger (5.000 ₫/hour) or join the smart priority queue.</p>
      </header>

      <QuickGuideStrip steps={CHARGING_GUIDE} />

      <div className="charging-page-grid">
        <section className="charging-details-card">
          <h2>Charging details</h2>
          <form id="charging-registration-form" onSubmit={handleSubmit}>
            <div className="charging-fields-row">
              <label>
                Your vehicle
                <select
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                >
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name} · {vehicle.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Connector
                <select
                  value={getConnector(selectedVehicle)}
                  onChange={() => {}}
                  aria-label="Connector type"
                  disabled
                >
                  <option>{getConnector(selectedVehicle)}</option>
                </select>
              </label>
            </div>

            <div className="charging-fields-row">
              <label>
                Charging hub
                <select
                  value={hubId}
                  onChange={(e) => {
                    setHubId(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                  required
                >
                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Charging slot
                <select
                  value={slotCode}
                  onChange={(event) => {
                    setSlotCode(event.target.value);
                    setError('');
                  }}
                  required
                >
                  {chargingPoints.length === 0 && <option value="">No chargers at hub</option>}
                  {chargingPoints.map((point) => {
                    const code = getChargingPointCode(point);
                    return (
                      <option key={point.id} value={code}>
                        {code} ({point.maxPowerKw || 3.5} kW)
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <TimeSlotWeekPicker
              date={date}
              onDateChange={(nextDate) => {
                setDate(nextDate);
                setError('');
              }}
              startTime={startTime}
              onStartTimeChange={(nextTime) => {
                setStartTime(nextTime);
                setError('');
              }}
              durationHours={durationHours}
              onDurationChange={setDurationHours}
              bookedIntervals={bookedIntervalsForCharger}
              disabled={submitting || !selectedChargingPoint}
            />

            <p className="charging-form-note">
              Bring your own compatible charger. Your slot is held for the selected charging period.
            </p>
          </form>
        </section>

        <section className="charging-summary-card">
          <h2>Registration summary</h2>
          <div className="charging-summary-image">
            <EvIllustration variant="charger" />
          </div>
          <div className="charging-summary-row">
            <span>Vehicle / battery</span>
            <strong>
              {selectedVehicle?.id || '—'} · {selectedVehicle?.battery ?? 38}%
            </strong>
          </div>
          <div className="charging-summary-row">
            <span>Hub / slot</span>
            <strong className="charging-summary-hub-slot">
              <span>{selectedHub?.name?.replace(/\s+Hub$/i, '') || 'Select a hub'} ·</span>
              <span>{slotCode || 'No slot'}</span>
            </strong>
          </div>
          <div className="charging-summary-row">
            <span>Date</span>
            <strong>{displayDate(date)}</strong>
          </div>
          <div className="charging-summary-row">
            <span>Charging time</span>
            <strong>
              {startTime ? `${startTime} – ${endTime}` : 'No free slot on this day'}
            </strong>
          </div>
          <div className="charging-summary-row">
            <span>
              Total · {duration} {duration === 1 ? 'hour' : 'hours'} × {formatVnd(CHARGING_HOURLY_VND)}
            </span>
            <strong>{formatVnd(totalVnd)}</strong>
          </div>
          {error && (
            <p className="charging-feedback charging-feedback-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="charging-feedback charging-feedback-success" role="status">
              {success}
            </p>
          )}
          <button
            type="submit"
            form="charging-registration-form"
            className="charging-register-button"
            disabled={submitting || !hubId || !startTime}
          >
            {submitting ? 'Registering...' : 'Register charging'}
          </button>

          {myRegistrations.length > 0 && (
            <div className="booked-charging-list">
              <strong className="booked-charging-list__title">
                Your booked charging windows ({myRegistrations.length})
              </strong>
              {myRegistrations.map((reg) => {
                const sStr = String(reg.scheduledStart || reg.scheduled_start || '').replace(
                  ' ',
                  'T'
                );
                const eStr = String(reg.scheduledEnd || reg.scheduled_end || '').replace(' ', 'T');
                return (
                  <div key={reg.id} className="booked-charging-item">
                    <div>
                      <div className="booked-charging-item__code">
                        {reg.chargerCode || reg.slotCode || 'Charger'} · {sStr.slice(0, 10)}
                      </div>
                      <div className="booked-charging-item__sub">
                        {sStr.slice(11, 16)} – {eStr.slice(11, 16)} ({reg.hubName || 'Campus Hub'})
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleCancelRegistration(reg.id)}
                      className="booked-charging-item__cancel"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
