import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hubApi, reservationApi, vehicleApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import vehicleImage from '../../components/common/images/vehicle.jpg';

const HOURLY_RATE = 3;

function getLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSuggestedPickup() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  if (start.getTime() <= Date.now()) start.setHours(start.getHours() + 1);
  if (start.getHours() > 21) {
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
  }
  return {
    date: getLocalDate(start),
    time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
  };
}

function normalizeReservation(reservation) {
  return {
    ...reservation,
    hubId: Number(reservation.hubId ?? reservation.hub_id),
    hubName: reservation.hubName ?? reservation.hub_name ?? '',
    vehicleId: Number(reservation.vehicleId ?? reservation.vehicle_id),
    vehicleCode: reservation.vehicleCode ?? reservation.vehicle_code ?? '',
    reservationCode: reservation.reservationCode ?? reservation.reservation_code ?? '',
    parkingSlotId: Number(reservation.parkingSlotId ?? reservation.parking_slot_id) || null,
    parkingSlotCode: reservation.parkingSlotCode
      ?? reservation.parking_slot_code
      ?? reservation.slotCode
      ?? reservation.slot_code
      ?? reservation.rackPositionCode
      ?? '',
    startTime: reservation.startTime ?? reservation.start_time ?? '',
    endTime: reservation.endTime ?? reservation.end_time ?? '',
    reservationType: String(reservation.reservationType ?? reservation.reservation_type ?? 'VEHICLE').toUpperCase(),
    status: String(reservation.status ?? 'CONFIRMED').toUpperCase(),
  };
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function reservationHours(reservation) {
  const start = new Date(reservation.startTime).getTime();
  const end = new Date(reservation.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 2;
  return Math.max(1, Math.ceil((end - start) / (60 * 60 * 1000)));
}

function getPositionCode(reservation, vehicle) {
  return reservation.parkingSlotCode
    || reservation.rackCode
    || reservation.rackId
    || reservation.positionCode
    || vehicle?.parkingSlotCode
    || vehicle?.rackCode
    || vehicle?.rackId
    || vehicle?.positionCode
    || vehicle?.slotCode
    || vehicle?.rackPositionCode
    || '';
}

function getVehicleKind(vehicle, vehicleCode) {
  const type = String(vehicle?.type || '').toUpperCase();
  return type === 'ELECTRIC_SCOOTER' || String(vehicleCode || '').startsWith('ES-')
    ? 'scooter'
    : 'bike';
}

function getPickupLocation(hubName, campusZone) {
  if (!hubName) return '—';
  const shortName = String(hubName).replace(/\s+Hub$/i, '');
  return campusZone ? `${shortName} hub, ${campusZone}` : `${shortName} hub`;
}

async function resolvePositionCode(hubId, reservation, vehicle) {
  const existingCode = getPositionCode(reservation, vehicle);
  if (existingCode) return existingCode;

  const slotId = Number(reservation.parkingSlotId ?? reservation.parking_slot_id
    ?? vehicle?.parkingSlotId ?? vehicle?.parking_slot_id);
  if (!hubId || !slotId) return '';

  const slots = await hubApi.getParkingSlots(hubId);
  const slot = slots.find((item) => Number(item.id) === slotId);
  return slot?.slotCode ?? slot?.slot_code ?? '';
}

function StaticQrCode() {
  const cells = [];
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const finder = [
        [0, 0],
        [14, 0],
        [0, 14],
      ].find(([left, top]) => x >= left && x < left + 7 && y >= top && y < top + 7);
      let isDark;
      if (finder) {
        const [left, top] = finder;
        const localX = x - left;
        const localY = y - top;
        isDark = localX === 0 || localX === 6 || localY === 0 || localY === 6
          || (localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4);
      } else {
        isDark = (x * 11 + y * 17 + x * y * 3) % 7 < 3;
      }
      if (isDark) cells.push(<rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1" height="1" />);
    }
  }

  return (
    <svg className="reservation-qr-svg" viewBox="0 0 23 23" role="img" aria-label="Static QR code">
      <rect width="23" height="23" fill="#fff" />
      <g fill="#111">{cells}</g>
    </svg>
  );
}

export function ReservationsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [draftVehicle, setDraftVehicle] = useState(location.state?.vehicle || null);
  const [draftHub, setDraftHub] = useState(location.state?.hub || null);
  const [bookingDate, setBookingDate] = useState(() => getSuggestedPickup().date);
  const [pickupTime, setPickupTime] = useState(() => getSuggestedPickup().time);
  const [durationHours, setDurationHours] = useState(2);
  const [pickupHubId, setPickupHubId] = useState(String(location.state?.hub?.id || ''));
  const [stage, setStage] = useState(location.state?.vehicle ? 'booking' : 'list');
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [returnHubId, setReturnHubId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = async () => {
    const [reservationData, hubData] = await Promise.all([
      reservationApi.getMyReservations(user?.id),
      hubApi.getHubs(),
    ]);
    setReservations(reservationData.map(normalizeReservation));
    setHubs(hubData);
    if (hubData[0]) {
      setReturnHubId((current) => current || String(hubData[0].id));
      setPickupHubId((current) => current || String(hubData[0].id));
    }
    return reservationData.map(normalizeReservation);
  };

  useEffect(() => {
    reload().catch((loadError) => setError(loadError.message || 'Unable to load reservations.'));
  }, [user?.id]);

  useEffect(() => {
    if (draftVehicle && draftHub) setPickupHubId(String(draftHub.id));
  }, [draftVehicle, draftHub]);

  const currentPickupHub = hubs.find((hub) => String(hub.id) === String(pickupHubId)) || draftHub;
  const duration = Number(durationHours);
  const endTime = useMemo(() => {
    if (!pickupTime) return '';
    const [hours, minutes] = pickupTime.split(':').map(Number);
    const end = new Date(2000, 0, 1, hours, minutes + duration * 60);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  }, [pickupTime, duration]);
  const fee = duration * HOURLY_RATE;
  const today = getLocalDate(new Date());
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  const openReservation = async (item, nextStage) => {
    try {
      setError('');
      setLoading(true);
      let reservation = normalizeReservation(item);
      let vehicle = item.vehicle || null;
      if (!vehicle && reservation.hubId && reservation.vehicleId) {
        const vehicles = await vehicleApi.getVehicles({ hubId: reservation.hubId });
        vehicle = vehicles.find((entry) => Number(entry.id) === reservation.vehicleId) || null;
      }
      const parkingSlotCode = await resolvePositionCode(reservation.hubId, reservation, vehicle);
      setSelectedReservation({
        ...reservation,
        vehicle,
        parkingSlotCode,
      });
      setReturnHubId(String(reservation.hubId || hubs[0]?.id || ''));
      setStage(nextStage);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load vehicle pickup details.');
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (event) => {
    event.preventDefault();
    setError('');
    if (!draftVehicle || !currentPickupHub || !bookingDate || !pickupTime) {
      setError('Choose a vehicle, pickup hub, date, and pickup time.');
      return;
    }

    const start = new Date(`${bookingDate}T${pickupTime}`);
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setError('Enter a valid pickup date and time.');
      return;
    }
    if (start.getTime() < Date.now()) {
      setError('Pickup date and time cannot be in the past.');
      return;
    }

    try {
      setLoading(true);
      const parkingSlotCode = await resolvePositionCode(currentPickupHub.id, {}, draftVehicle);
      const response = await reservationApi.reserveVehicle({
        userId: user?.id,
        hubId: Number(currentPickupHub.id),
        vehicleId: Number(draftVehicle.id),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      const createdReservation = normalizeReservation({
        ...response,
        userId: user?.id,
        reservationType: 'VEHICLE',
        hubId: Number(currentPickupHub.id),
        hubName: currentPickupHub.name,
        vehicleId: Number(draftVehicle.id),
        vehicleCode: draftVehicle.code,
        parkingSlotCode,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: response.status || 'CONFIRMED',
      });
      setSelectedReservation({ ...createdReservation, vehicle: draftVehicle });
      setStage('pickup');
      setDraftVehicle(null);
      setDraftHub(null);
      navigate(location.pathname, { replace: true, state: null });
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm this booking.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickup = async () => {
    if (!selectedReservation) return;
    try {
      setError('');
      setLoading(true);
      const result = await reservationApi.pickupReservation(selectedReservation.id);
      const updated = { ...selectedReservation, ...result, status: 'ACTIVE' };
      setSelectedReservation(updated);
      setStage('return');
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm pickup.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedReservation) return;
    try {
      setError('');
      setLoading(true);
      const result = await reservationApi.returnReservation(selectedReservation.id, {
        returnHubId: Number(returnHubId),
      });
      setSelectedReservation({ ...selectedReservation, ...result, status: 'COMPLETED' });
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm return.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedReservation) return;
    try {
      setError('');
      setLoading(true);
      await reservationApi.cancelReservation(selectedReservation.id);
      navigate(`/student/hubs/${selectedReservation.hubId}/vehicles`);
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel reservation.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedReservation(null);
    setStage('list');
    reload().catch((loadError) => setError(loadError.message || 'Unable to refresh reservations.'));
  };

  const vehicleReservations = reservations.filter((reservation) =>
    reservation.reservationType === 'VEHICLE');
  const selectedReturnHub = hubs.find((hub) => String(hub.id) === String(returnHubId));
  const positionCode = selectedReservation ? getPositionCode(selectedReservation, selectedReservation.vehicle) : '';
  const selectedDuration = selectedReservation ? reservationHours(selectedReservation) : duration;
  const selectedFee = selectedDuration * HOURLY_RATE;
  const selectedVehicleKind = selectedReservation
    ? getVehicleKind(selectedReservation.vehicle, selectedReservation.vehicleCode)
    : 'bike';
  const selectedHub = selectedReservation
    ? hubs.find((hub) => Number(hub.id) === Number(selectedReservation.hubId))
    : null;
  const pickupLocation = selectedReservation
    ? getPickupLocation(selectedReservation.hubName || selectedHub?.name, selectedHub?.campusZone)
    : '';
  const batteryLevel = Number(selectedReservation?.vehicle?.batteryLevel);

  if (stage === 'booking' && draftVehicle) {
    return (
      <main className="reservation-flow-page reservation-flow-page--booking">
        <header className="reservation-flow-heading">
          <h1>Reserve your electric {draftVehicle.type === 'ELECTRIC_SCOOTER' ? 'scooter' : 'bike'}</h1>
          <p>Choose your pickup time and check the booking details before confirming.</p>
        </header>
        {error && <p className="reservation-flow-error" role="alert">{error}</p>}
        <div className="reservation-booking-grid">
          <section className="reservation-vehicle-card">
            <h2>Chosen vehicle</h2>
            <div className="reservation-vehicle-image">
              <img src={vehicleImage} alt="Electric rental vehicle" />
            </div>
            <p className="reservation-vehicle-name">
              {draftVehicle.model || 'Electric vehicle'} {draftVehicle.code}
            </p>
            <div className="reservation-battery-label">
              <span>Battery: {draftVehicle.batteryLevel ?? 0}%</span>
            </div>
            <div className="reservation-battery-track">
              <span style={{ width: `${Math.min(100, Math.max(0, Number(draftVehicle.batteryLevel) || 0))}%` }} />
            </div>
            <p className="reservation-vehicle-location">
              {getPickupLocation(draftHub?.name || draftVehicle.currentHubName, draftHub?.campusZone)}
            </p>
            <p className="reservation-vehicle-rate">Available <span>·</span> $3 / hour</p>
          </section>

          <section className="reservation-details-card">
            <h2>Reservation details</h2>
            <form onSubmit={handleBook}>
              <div className="reservation-field-grid">
                <label>
                  Pickup hub
                  <select value={pickupHubId} onChange={(event) => setPickupHubId(event.target.value)} required>
                    {hubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>{hub.name.replace(/\s+Hub$/i, '')}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Rental duration
                  <select value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((hours) => (
                      <option key={hours} value={hours}>{hours} {hours === 1 ? 'hour' : 'hours'}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={bookingDate}
                    min={today}
                    required
                    onChange={(event) => setBookingDate(event.target.value)}
                  />
                </label>
                <label>
                  Pickup time
                  <input
                    type="time"
                    value={pickupTime}
                    min={bookingDate === today ? nowTime : undefined}
                    required
                    onChange={(event) => setPickupTime(event.target.value)}
                  />
                </label>
              </div>
              <h3>Booking summary</h3>
              <div className="reservation-summary-row">
                <span>Ride / return time</span>
                <strong>{pickupTime || '—'} – {endTime || '—'}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Total · {duration} {duration === 1 ? 'hour' : 'hours'} × $3</span>
                <strong>${fee.toFixed(2)}</strong>
              </div>
              <button className="reservation-primary-long-button" type="submit" disabled={loading}>
                {loading ? 'Confirming...' : 'Confirm booking'}
              </button>
            </form>
          </section>
        </div>
        <button className="reservation-back-link" type="button" onClick={() => navigate(-1)}>
          ← Back to vehicle availability
        </button>
      </main>
    );
  }

  if (stage === 'pickup' && selectedReservation) {
    return (
      <main className="reservation-flow-page reservation-flow-page--pickup">
        <header className="reservation-flow-heading">
          <h1>Pick up your electric {selectedVehicleKind}</h1>
          <p>Your booking is confirmed. Follow the instructions below to start your ride.</p>
        </header>
        {error && <p className="reservation-flow-error" role="alert">{error}</p>}
        <div className="reservation-pickup-layout">
          <section className="reservation-step-card reservation-pickup-vehicle">
            <h2>Vehicle details</h2>
            <div className="reservation-vehicle-image">
              <img src={vehicleImage} alt={`Electric ${selectedVehicleKind}`} />
            </div>
            <div className="reservation-pickup-vehicle-name">
              <span>{selectedReservation.vehicle?.model || `Electric ${selectedVehicleKind}`}</span>
              <strong>{selectedReservation.vehicleCode || '—'}</strong>
            </div>
            <div className="reservation-pickup-details">
              <div className="reservation-summary-row">
                <span>Battery level</span>
                <strong>{Number.isFinite(batteryLevel) ? `${batteryLevel}%` : '—'}</strong>
              </div>
              {Number.isFinite(batteryLevel) && (
                <div className="reservation-battery-track">
                  <span style={{ width: `${Math.min(100, Math.max(0, batteryLevel))}%` }} />
                </div>
              )}
              <div className="reservation-summary-row">
                <span>Pickup hub</span>
                <strong>{selectedReservation.hubName || '—'}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Pickup time</span>
                <strong>{formatDate(selectedReservation.startTime)} · {formatTime(selectedReservation.startTime)}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Reservation ID</span>
                <strong>{selectedReservation.reservationCode || `#${selectedReservation.id}`}</strong>
              </div>
            </div>
          </section>
          <section className="reservation-step-card reservation-pickup-code-card">
            <div className="reservation-pickup-instructions">
              <h3>Pickup instructions</h3>
              <ol>
                <li>Go to {pickupLocation}.</li>
                <li>Find {selectedVehicleKind} {selectedReservation.vehicleCode || '—'} at rack {positionCode || 'unavailable'}.</li>
                <li>Check the {selectedVehicleKind}, then scan its code.</li>
              </ol>
            </div>
            <div className="reservation-pickup-code-content" style={{margin:'2rem 0'}}>
              <div className="reservation-static-qr" aria-label="Static QR code shown as a placeholder">
                <StaticQrCode />
              </div>
              <div className="reservation-pickup-booking-info">
                <h2>Vehicle ID: {selectedReservation.vehicleCode || '—'}</h2>
                <p>{selectedReservation.hubName || '—'}</p>
                <p>Rack {positionCode || 'unavailable'}</p>
                <p><span>Booking:</span> <strong>{selectedReservation.reservationCode || '—'}</strong></p>
              </div>
            </div>
            <div style={{color:'#556b5d'}}>Pickup starts your {selectedDuration}-hour rental. Check brakes, tyres and lights before leaving the hub.</div>
            <div className="reservation-button-row">
              <button type="button" className="reservation-secondary-button" onClick={handleCancel} disabled={loading}>
                {loading ? 'Cancelling...' : 'Cancel reservation'}
              </button>
              <button type="button" className="reservation-primary-button" onClick={handlePickup} disabled={loading}>
                {loading ? 'Confirming...' : 'Confirm pickup'}
              </button>
            </div>
          </section>
        </div>
        <button className="reservation-back-link" type="button" onClick={handleBackToList}>
          ← Back to reservations
        </button>
      </main>
    );
  }

  if (stage === 'return' && selectedReservation) {
    const completed = selectedReservation.status === 'COMPLETED';
    return (
      <main className="reservation-flow-page reservation-flow-page--return">
        <header className="reservation-flow-heading">
          <h1>{completed ? 'Return confirmed' : 'Return your electric vehicle'}</h1>
          <p>{completed ? 'Your vehicle has been returned.' : 'Choose your return hub and park the bike safely to finish your rental.'}</p>
        </header>
        {error && <p className="reservation-flow-error" role="alert">{error}</p>}
        <div className="reservation-return-layout">
          <section className="reservation-step-card reservation-return-vehicle">
            <h2>Vehicle details</h2>
            <div className="reservation-vehicle-image">
              <img src={vehicleImage} alt={`Electric ${selectedVehicleKind}`} />
            </div>
            <div className="reservation-pickup-vehicle-name">
              <span>{selectedReservation.vehicle?.model || `Electric ${selectedVehicleKind}`}</span>
              <strong>{selectedReservation.vehicleCode || '—'}</strong>
            </div>
            <div className="reservation-pickup-details">
              <div className="reservation-summary-row"><span>Pickup hub</span><strong>{selectedReservation.hubName || '—'}</strong></div>
              <div className="reservation-summary-row"><span>Pickup time</span><strong>{formatDate(selectedReservation.startTime)} · {formatTime(selectedReservation.startTime)}</strong></div>
              <div className="reservation-summary-row"><span>Return time</span><strong>{formatDate(selectedReservation.endTime)} · {formatTime(selectedReservation.endTime)}</strong></div>
              <div className="reservation-summary-row"><span>Rack</span><strong>{positionCode}</strong></div>
            </div>
          </section>
          <section className="reservation-step-card reservation-return-confirmation">
            <h2>Return hub &amp; instructions</h2>
            {completed ? (
              <div className="reservation-return-complete">
                <strong>Return confirmed</strong>
                <span>Reservation {selectedReservation.reservationCode || `#${selectedReservation.id}`}</span>
              </div>
            ) : (
              <>
                <label className="reservation-return-hub">
                  Return hub:
                  <select value={returnHubId} onChange={(event) => setReturnHubId(event.target.value)}>
                    {hubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.name} · {hub.campusZone}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="reservation-return-instructions">
                  <p className="reservation-return-availability">
                    {selectedReturnHub
                      ? `${selectedReturnHub.freeParkingSlots} return spaces available at ${selectedReturnHub.name}.`
                      : 'Loading return space availability...'}
                  </p>
                  <ol>
                    <li>Park in an available return rack.</li>
                    <li>Lock the {selectedVehicleKind} and connect the cable.</li>
                    <li>Confirm return to end your rental.</li>
                  </ol>
                </div>
              </>
            )}
            <h2>Reservation summary</h2>
            <div className="reservation-summary-row">
              <span>Return time</span>
              <strong>{formatDate(selectedReservation.endTime)} · {formatTime(selectedReservation.endTime)}</strong>
            </div>
            <div className="reservation-summary-row">
              <span>Rental duration</span>
              <strong>{selectedDuration} {selectedDuration === 1 ? 'hour' : 'hours'}</strong>
            </div>
            <div className="reservation-summary-row">
              <span>Total rental cost</span>
              <strong>${selectedFee.toFixed(2)}</strong>
            </div>
            {completed ? (
              <button type="button" className="reservation-primary-long-button" onClick={handleBackToList}>Back to reservations</button>
            ) : (
              <button type="button" className="reservation-primary-long-button" onClick={handleReturn} disabled={loading || !returnHubId}>
                {loading ? 'Returning...' : 'Confirm return'}
              </button>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="reservation-flow-page">
      <header className="reservation-flow-heading">
        <h1>Reservations</h1>
        <p>View your bookings and continue through pickup and return.</p>
      </header>
      {error && <p className="reservation-flow-error" role="alert">{error}</p>}
      <section className="reservation-list">
        {vehicleReservations.map((reservation) => (
          <article className="reservation-list-card" key={reservation.id}>
            <div>
              <h2>{reservation.vehicleCode || 'Electric vehicle'}</h2>
              <p>{reservation.hubName} · {formatDate(reservation.startTime)} · {formatTime(reservation.startTime)} – {formatTime(reservation.endTime)}</p>
              <span className={`reservation-status reservation-status-${reservation.status.toLowerCase()}`}>{reservation.status}</span>
            </div>
            {reservation.status === 'CONFIRMED' && (
              <button type="button" className="reservation-primary-short-button" onClick={() => openReservation(reservation, 'pickup')} disabled={loading}>
                Continue to pickup
              </button>
            )}
            {reservation.status === 'ACTIVE' && (
              <button type="button" className="reservation-primary-short-button" onClick={() => openReservation(reservation, 'return')} disabled={loading}>
                Continue to return
              </button>
            )}
          </article>
        ))}
        {!vehicleReservations.length && <p className="reservation-empty">You don’t have any vehicle reservations yet.</p>}
      </section>
      <Link to="/student/hubs" className="reservation-back-link">Find a vehicle</Link>
    </main>
  );
}
