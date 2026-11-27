import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hubApi, reservationApi, vehicleApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import {
  TimeSlotWeekPicker,
  findFirstFreeHour,
  isWindowBooked,
} from '../../components/common/TimeSlotWeekPicker';
import { formatVnd, getRentalHourlyRateVnd } from '../../utils/currency';
import { EvIllustration } from '../../components/common/EvIllustration';
import {
  QuickGuideStrip,
  LifecycleStepper,
  getReadableStatusMeta,
} from '../../components/common/QuickGuideStrip';

const RESERVATION_GUIDE = [
  {
    title: 'Request EV Hold',
    desc: 'Submit your booking — vehicle is held immediately while awaiting operator review.',
  },
  {
    title: 'Operator Approval & QR',
    desc: 'Once approved, unlock via optical QR scan or decline/cancel free of charge.',
  },
  {
    title: 'Live Ride & Hub Return',
    desc: 'Track elapsed ride time and return to any VNU-HCM hub with free spaces.',
  },
];

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
    parkingSlotCode:
      reservation.parkingSlotCode ??
      reservation.parking_slot_code ??
      reservation.slotCode ??
      reservation.rackPositionCode ??
      '',
    startTime: reservation.startTime ?? reservation.start_time ?? '',
    endTime: reservation.endTime ?? reservation.end_time ?? '',
    actualPickupTime: reservation.actualPickupTime ?? reservation.actual_pickup_time ?? '',
    reservationType: String(
      reservation.reservationType ?? reservation.reservation_type ?? 'VEHICLE'
    ).toUpperCase(),
    status: String(reservation.status ?? 'PENDING').toUpperCase(),
  };
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
  return (
    reservation.parkingSlotCode ||
    reservation.rackCode ||
    reservation.rackId ||
    reservation.positionCode ||
    vehicle?.parkingSlotCode ||
    vehicle?.rackCode ||
    vehicle?.rackId ||
    vehicle?.positionCode ||
    vehicle?.slotCode ||
    vehicle?.rackPositionCode ||
    'A-02'
  );
}

function getVehicleKind(vehicle, vehicleCode) {
  const type = String(vehicle?.type || vehicle?.vehicleType || '').toUpperCase();
  return type === 'ELECTRIC_SCOOTER' || String(vehicleCode || '').startsWith('ES-')
    ? 'scooter'
    : 'bike';
}

function getPickupLocation(hubName, campusZone) {
  const shortName = String(hubName || 'HCMUT Main Gate').replace(/\s+Hub$/i, '');
  const zone = /^HCMUT Main Gate$/i.test(shortName)
    ? 'Campus main gate'
    : campusZone || 'VNU-HCM Campus';
  return `${shortName} Hub (${zone})`;
}

function formatElapsedRide(startIso, nowMs, reservationId = null) {
  let localAnchor = NaN;
  if (reservationId != null) {
    try {
      const saved = sessionStorage.getItem(`semh_ride_start_${reservationId}`);
      if (saved) localAnchor = Number(saved);
    } catch {
      // ignore storage errors
    }
  }
  const normalizedIso = startIso ? String(startIso).trim().replace(' ', 'T') : '';
  const serverMs = normalizedIso ? new Date(normalizedIso).getTime() : NaN;

  let baseMs = serverMs;
  if (Number.isFinite(localAnchor)) {
    // Use client anchor whenever server clock is ahead of phone clock (clock skew) or within 5 min
    if (!Number.isFinite(serverMs) || serverMs > nowMs || Math.abs(serverMs - localAnchor) < 300_000) {
      baseMs = localAnchor;
    }
  }

  const diffSec = Number.isFinite(baseMs)
    ? Math.max(0, Math.floor((nowMs - baseMs) / 1000))
    : 0;
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function AnimatedQrScanner({ codeLabel = 'SEMH-QR' }) {
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
        isDark =
          localX === 0 ||
          localX === 6 ||
          localY === 0 ||
          localY === 6 ||
          (localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4);
      } else {
        isDark = (x * 11 + y * 17 + x * y * 3) % 7 < 3;
      }
      if (isDark) cells.push(<rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1" height="1" />);
    }
  }

  return (
    <div className="qr-scanner-frame" aria-label={`QR unlock scanner for ${codeLabel}`}>
      <div className="qr-scanner-reticle">
        <span className="qr-corner qr-corner--tl" aria-hidden="true" />
        <span className="qr-corner qr-corner--tr" aria-hidden="true" />
        <span className="qr-corner qr-corner--bl" aria-hidden="true" />
        <span className="qr-corner qr-corner--br" aria-hidden="true" />

        <div className="qr-scanner-viewport">
          <svg className="reservation-qr-svg" viewBox="0 0 23 23" role="img" aria-label="Vehicle unlock QR code">
            <rect width="23" height="23" fill="#ffffff" />
            <g fill="#0f172a">{cells}</g>
          </svg>
          <div className="qr-laser-beam" aria-hidden="true" />
        </div>
      </div>

      <div className="qr-scanner-status">
        <span className="live-pulse-dot" />
        <span>OPTICAL SCAN ACTIVE · {codeLabel}</span>
      </div>
    </div>
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
  const [vehicleBookings, setVehicleBookings] = useState([]);
  const [listFilter, setListFilter] = useState('ACTIVE');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Live 1-second ticker for active rides
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const reload = useCallback(async () => {
    const [reservationData, hubData] = await Promise.all([
      reservationApi.getMyReservations(user?.id),
      hubApi.getHubs(),
    ]);
    const normalized = (reservationData || []).map(normalizeReservation);
    setReservations(normalized);
    setHubs(hubData || []);

    setSelectedReservation((prev) => {
      if (!prev) return prev;
      const fresh = normalized.find((item) => item.id === prev.id);
      return fresh ? { ...prev, ...fresh, vehicle: prev.vehicle || null } : prev;
    });

    if (!pickupHubId && hubData?.length) {
      setPickupHubId(String(location.state?.hub?.id || hubData[0].id));
    }
    return { reservations: normalized, hubs: hubData || [] };
  }, [user?.id, pickupHubId, location.state?.hub?.id]);

  useEffect(() => {
    setLoading(true);
    setError('');
    reload()
      .then(({ reservations: loaded }) => {
        const hasOpen = loaded.some(
          (r) => r.reservationType === 'VEHICLE' && ['PENDING', 'CONFIRMED', 'ACTIVE'].includes(r.status)
        );
        if (!hasOpen) setListFilter('ALL');
      })
      .catch((loadError) => setError(loadError.message || 'Unable to load reservations.'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  // Poll every 4 seconds so Operator Approve / Reject updates Student screen automatically!
  useEffect(() => {
    const poll = setInterval(() => {
      reload().catch(() => {});
    }, 4000);
    return () => clearInterval(poll);
  }, [reload]);

  useEffect(() => {
    if (!location.state?.vehicle) return;
    setDraftVehicle(location.state.vehicle);
    setDraftHub(location.state.hub || null);
    setPickupHubId(String(location.state.hub?.id || location.state.vehicle.currentHubId || ''));
    setStage('booking');
  }, [location.state]);

  useEffect(() => {
    if (stage !== 'booking' || !pickupHubId) return;
    hubApi
      .getBookedWindows(pickupHubId)
      .then((res) => setVehicleBookings(res?.vehicleBookings || []))
      .catch(() => setVehicleBookings([]));
  }, [stage, pickupHubId]);

  const bookedIntervalsForDraftVehicle = useMemo(() => {
    if (!draftVehicle?.id) return [];
    return vehicleBookings.filter((b) => Number(b.vehicleId) === Number(draftVehicle.id));
  }, [vehicleBookings, draftVehicle?.id]);

  useEffect(() => {
    if (stage !== 'booking' || !bookingDate) return;
    const curStartMs = pickupTime ? new Date(`${bookingDate}T${pickupTime}:00`).getTime() : NaN;
    const curEndMs = curStartMs + Number(durationHours || 1) * 3600 * 1000;
    const isInvalid =
      !pickupTime ||
      Number.isNaN(curStartMs) ||
      curStartMs < Date.now() - 60000 ||
      isWindowBooked(curStartMs, curEndMs, bookedIntervalsForDraftVehicle);

    if (isInvalid) {
      const nextFree = findFirstFreeHour(bookingDate, bookedIntervalsForDraftVehicle);
      setPickupTime(nextFree);
      if (nextFree) setDurationHours(1);
    }
  }, [stage, bookingDate, bookedIntervalsForDraftVehicle]);

  const vehicleReservations = useMemo(
    () => reservations.filter((item) => item.reservationType === 'VEHICLE'),
    [reservations]
  );

  const openVehicleReservations = useMemo(
    () => vehicleReservations.filter((item) => ['PENDING', 'CONFIRMED', 'ACTIVE'].includes(item.status)),
    [vehicleReservations]
  );

  const historyVehicleReservations = useMemo(
    () => vehicleReservations.filter((item) => !['PENDING', 'CONFIRMED', 'ACTIVE'].includes(item.status)),
    [vehicleReservations]
  );

  const hasOpenRental = openVehicleReservations.length > 0;
  const duration = Math.max(1, Number(durationHours) || 1);
  const draftHourlyRateVnd = getRentalHourlyRateVnd(draftVehicle);
  const feeVnd = duration * draftHourlyRateVnd;

  const endTime = useMemo(() => {
    if (!pickupTime) return '';
    const [hh, mm] = pickupTime.split(':').map(Number);
    const end = new Date(2000, 0, 1, hh, mm + duration * 60);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  }, [pickupTime, duration]);

  const findReturnHub = (hubList, preferredHubId) => {
    const withParking = hubList.find(
      (hub) => hub.id === Number(preferredHubId) && Number(hub.freeParkingSlots) > 0
    );
    if (withParking) return String(withParking.id);
    const firstAvailable = hubList.find((hub) => Number(hub.freeParkingSlots) > 0);
    return String(firstAvailable?.id || hubList[0]?.id || '');
  };

  const openReservation = async (reservation, nextStage) => {
    setError('');
    setLoading(true);
    try {
      const vehicles = reservation.hubId
        ? await vehicleApi.getVehicles({ hubId: reservation.hubId }).catch(() => [])
        : [];
      const vehicle = vehicles.find(
        (item) => item.id === reservation.vehicleId || item.code === reservation.vehicleCode
      );
      const merged = { ...reservation, vehicle: vehicle || null };
      setSelectedReservation(merged);
      setReturnHubId(findReturnHub(hubs, reservation.hubId));
      setStage(nextStage);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (event) => {
    event.preventDefault();
    if (!draftVehicle) return;
    if (!bookingDate || !pickupTime) {
      setError('Please select an available (unshaded) pickup hour.');
      return;
    }

    const [hh, mm] = pickupTime.split(':').map(Number);
    const [yy, mo, dd] = bookingDate.split('-').map(Number);
    const start = new Date(yy, mo - 1, dd, hh, mm, 0);
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000);

    if (isWindowBooked(start.getTime(), end.getTime(), bookedIntervalsForDraftVehicle)) {
      setError('Selected range overlaps a booked slot. Please choose free hours.');
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const toLocalStr = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}:00`;

    setError('');
    setLoading(true);
    try {
      const created = await reservationApi.reserveVehicle({
        userId: user?.id,
        hubId: Number(pickupHubId || draftHub?.id || draftVehicle.currentHubId),
        vehicleId: draftVehicle.id,
        startTime: toLocalStr(start),
        endTime: toLocalStr(end),
      });
      const { reservations: latest } = await reload();
      const matched =
        latest.find((item) => item.id === created.id) ||
        normalizeReservation({
          ...created,
          hubId: Number(pickupHubId || draftHub?.id || draftVehicle.currentHubId),
          hubName:
            hubs.find((hub) => String(hub.id) === String(pickupHubId))?.name ||
            draftHub?.name ||
            draftVehicle.currentHubName,
          vehicleId: draftVehicle.id,
          vehicleCode: draftVehicle.code,
          parkingSlotCode: getPositionCode({}, draftVehicle),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });
      setSelectedReservation({ ...matched, vehicle: draftVehicle });
      setListFilter('ACTIVE');
      setStage('pickup');
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm vehicle reservation.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickup = async () => {
    if (!selectedReservation) return;
    setError('');
    setLoading(true);
    try {
      await reservationApi.pickupReservation(selectedReservation.id);
      const clientPickupMs = Date.now();
      try {
        sessionStorage.setItem(`semh_ride_start_${selectedReservation.id}`, String(clientPickupMs));
      } catch {
        // ignore storage errors
      }
      setNowMs(clientPickupMs);
      const { reservations: latest, hubs: latestHubs } = await reload();
      const active =
        latest.find((item) => item.id === selectedReservation.id) || {
          ...selectedReservation,
          status: 'ACTIVE',
          actualPickupTime: new Date().toISOString(),
        };
      setSelectedReservation({ ...active, vehicle: selectedReservation.vehicle });
      setReturnHubId(findReturnHub(latestHubs, active.hubId));
      setStage('return');
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm pickup.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrDecline = async (targetRes = selectedReservation, reason = '') => {
    if (!targetRes) return;
    setError('');
    setLoading(true);
    try {
      await reservationApi.cancelReservation(targetRes.id, reason);
      await reload();
      if (selectedReservation && targetRes.id === selectedReservation.id) {
        setSelectedReservation(null);
        setDraftVehicle(null);
        setStage('list');
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel reservation.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedReservation || !returnHubId) return;
    setError('');
    setLoading(true);
    try {
      await reservationApi.returnReservation(selectedReservation.id, {
        hubId: Number(returnHubId),
        returnHubId: Number(returnHubId),
      });
      const { reservations: latest } = await reload();
      const completed =
        latest.find((item) => item.id === selectedReservation.id) || {
          ...selectedReservation,
          status: 'COMPLETED',
        };
      setSelectedReservation({ ...completed, vehicle: selectedReservation.vehicle });
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm vehicle return.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToList = () => {
    setError('');
    setDraftVehicle(null);
    setSelectedReservation(null);
    setStage('list');
    navigate('/student/reservations', { replace: true });
  };

  const selectedReturnHub = hubs.find((hub) => String(hub.id) === String(returnHubId));
  const positionCode = selectedReservation
    ? getPositionCode(selectedReservation, selectedReservation.vehicle)
    : 'A-02';
  const selectedDuration = selectedReservation ? reservationHours(selectedReservation) : duration;
  const selectedHourlyRateVnd = getRentalHourlyRateVnd(
    selectedReservation?.vehicle || selectedReservation?.vehicleCode
  );
  const selectedFeeVnd = selectedDuration * selectedHourlyRateVnd;
  const selectedVehicleKind = selectedReservation
    ? getVehicleKind(selectedReservation.vehicle, selectedReservation.vehicleCode)
    : 'bike';
  const selectedHub = selectedReservation
    ? hubs.find((hub) => Number(hub.id) === Number(selectedReservation.hubId))
    : null;
  const pickupLocation = selectedReservation
    ? getPickupLocation(selectedReservation.hubName || selectedHub?.name, selectedHub?.campusZone)
    : '';
  const batteryLevel = Number(
    selectedReservation?.vehicle?.batteryLevel ?? selectedReservation?.batteryLevel
  );

  // ============================================================================
  // STAGE 1: NEW VEHICLE BOOKING
  // ============================================================================
  if (stage === 'booking' && draftVehicle) {
    return (
      <main className="reservation-flow-page reservation-flow-page--booking">
        <header className="reservation-flow-heading">
          <h1>Reserve electric {draftVehicle.type === 'ELECTRIC_SCOOTER' ? 'scooter' : 'bike'}</h1>
          <p>Select your pickup window. Once submitted, hub staff will approve your QR unlock.</p>
        </header>

        <QuickGuideStrip steps={RESERVATION_GUIDE} />

        {error && <p className="reservation-flow-error" role="alert">{error}</p>}
        <div className="reservation-booking-grid">
          <section className="reservation-vehicle-card">
            <h2>Chosen vehicle</h2>
            <div className="reservation-vehicle-image">
              <EvIllustration variant={draftVehicle.type === 'ELECTRIC_SCOOTER' ? 'scooter' : 'bike'} />
            </div>
            <p className="reservation-vehicle-name">
              {draftVehicle.model || 'Electric vehicle'} · {draftVehicle.code}
            </p>
            <div className="reservation-battery-label">
              <span>Battery level</span>
              <strong>{draftVehicle.batteryLevel ?? 0}%</strong>
            </div>
            <div className="reservation-battery-track">
              <span style={{ width: `${Math.min(100, Math.max(0, Number(draftVehicle.batteryLevel) || 0))}%` }} />
            </div>
            <p className="reservation-vehicle-location">
              {getPickupLocation(draftHub?.name || draftVehicle.currentHubName, draftHub?.campusZone)}
            </p>
            <p className="reservation-vehicle-rate">
              Student rate · <strong>{formatVnd(draftHourlyRateVnd)} / hour</strong>
            </p>
          </section>

          <section className="reservation-details-card">
            <h2>Select window</h2>
            <form onSubmit={handleBook} className="reservation-booking-form">
              <label className="reservation-hub-select-label">
                <span>Pickup hub</span>
                <select value={pickupHubId} onChange={(event) => setPickupHubId(event.target.value)} required>
                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>{hub.name.replace(/\s+Hub$/i, '')}</option>
                  ))}
                </select>
              </label>

              <TimeSlotWeekPicker
                date={bookingDate}
                onDateChange={(nextDate) => {
                  setBookingDate(nextDate);
                  setError('');
                }}
                startTime={pickupTime}
                onStartTimeChange={(nextTime) => {
                  setPickupTime(nextTime);
                  setError('');
                }}
                durationHours={durationHours}
                onDurationChange={setDurationHours}
                bookedIntervals={bookedIntervalsForDraftVehicle}
                disabled={loading}
              />

              <div className="reservation-summary-row">
                <span>Window</span>
                <strong>{pickupTime ? `${pickupTime} – ${endTime}` : 'No free slot'}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Estimated total ({duration}h × {formatVnd(draftHourlyRateVnd)})</span>
                <strong>{formatVnd(feeVnd)}</strong>
              </div>
              {hasOpenRental && (
                <p className="reservation-flow-error" role="alert">
                  You already have an open reservation or active ride. Complete or cancel it first.
                </p>
              )}
              <button
                className="reservation-primary-long-button"
                type="submit"
                disabled={loading || !pickupTime || hasOpenRental}
              >
                {loading ? 'Submitting request...' : 'Submit booking request'}
              </button>
            </form>
          </section>
        </div>
        <button className="reservation-back-link" type="button" onClick={() => navigate(-1)}>
          ← Back to vehicles
        </button>
      </main>
    );
  }

  // ============================================================================
  // STAGE 2: PENDING APPROVAL OR APPROVED QR PICKUP
  // ============================================================================
  if (stage === 'pickup' && selectedReservation) {
    const isPending = selectedReservation.status === 'PENDING';
    const isRejectedOrCancelled = ['CANCELLED', 'EXPIRED'].includes(selectedReservation.status);
    const statusMeta = getReadableStatusMeta(selectedReservation);

    return (
      <main className="reservation-flow-page reservation-flow-page--pickup">
        <header className="reservation-flow-heading">
          <h1>
            {isPending
              ? 'Awaiting operator approval'
              : isRejectedOrCancelled
              ? 'Booking closed'
              : `Unlock your electric ${selectedVehicleKind}`}
          </h1>
          <p>
            {isPending
              ? 'Your vehicle is held. This page updates automatically as soon as hub staff approves.'
              : isRejectedOrCancelled
              ? statusMeta.hint
              : 'Align the optical QR scanner at the rack to start your ride, or decline free of charge.'}
          </p>
        </header>

        <div className="reservation-stepper-card">
          <LifecycleStepper
            status={selectedReservation.status}
            cancellationSource={selectedReservation.cancellationSource}
            reservationType="VEHICLE"
          />
        </div>

        {error && <p className="reservation-flow-error" role="alert">{error}</p>}

        <div className="reservation-pickup-layout">
          <section className="reservation-step-card reservation-pickup-vehicle">
            <div className="reservation-card-head-inline">
              <h2>Vehicle summary</h2>
              <span className={`status-tone-pill tone-${statusMeta.tone}`}>{statusMeta.label}</span>
            </div>
            <div className="reservation-vehicle-image">
              <EvIllustration variant={selectedVehicleKind} />
            </div>
            <div className="reservation-pickup-vehicle-name">
              <span>{selectedReservation.vehicle?.model || `Campus Electric ${selectedVehicleKind}`}</span>
              <strong>{selectedReservation.vehicleCode || '—'}</strong>
            </div>
            <div className="reservation-pickup-details">
              {Number.isFinite(batteryLevel) && (
                <>
                  <div className="reservation-summary-row">
                    <span>Battery</span>
                    <strong>{batteryLevel}%</strong>
                  </div>
                  <div className="reservation-battery-track">
                    <span style={{ width: `${Math.min(100, Math.max(0, batteryLevel))}%` }} />
                  </div>
                </>
              )}
              <div className="reservation-summary-row">
                <span>Hub &amp; rack</span>
                <strong>{selectedReservation.hubName || 'Campus Hub'} · {positionCode}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Window</span>
                <strong>{formatDate(selectedReservation.startTime)} · {formatTime(selectedReservation.startTime)}–{formatTime(selectedReservation.endTime)}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Estimated fee</span>
                <strong>{formatVnd(selectedFeeVnd)}</strong>
              </div>
            </div>
          </section>

          <section className="reservation-step-card reservation-pickup-code-card">
            {isPending ? (
              <div className="pending-approval-box">
                <span className="pending-approval-pulse" />
                <h3>Pending Hub Operator review</h3>
                <p>
                  Vehicle <strong>{selectedReservation.vehicleCode}</strong> at{' '}
                  <strong>{pickupLocation}</strong> is locked for your time slot while staff verifies availability.
                </p>
                <div className="pending-approval-steps">
                  <div><strong>Step 1 (Done):</strong> Hold request submitted ({selectedReservation.reservationCode || `#${selectedReservation.id}`})</div>
                  <div><strong>Step 2 (Waiting):</strong> Operator clicks Approve on Control Console</div>
                  <div><strong>Step 3 (Next):</strong> Optical QR code appears automatically here</div>
                </div>
                <div className="reservation-pickup-actions">
                  <button
                    type="button"
                    className="reservation-action-cancel"
                    onClick={() => handleCancelOrDecline(selectedReservation, 'Cancelled while pending')}
                    disabled={loading}
                  >
                    {loading ? 'Cancelling...' : 'Cancel request'}
                  </button>
                  <button
                    type="button"
                    className="reservation-action-secondary-btn"
                    onClick={() => reload()}
                    disabled={loading}
                  >
                    Refresh status
                  </button>
                </div>
              </div>
            ) : isRejectedOrCancelled ? (
              <div className="pending-approval-box">
                <h3>{statusMeta.label}</h3>
                <p>{statusMeta.hint}. You can reserve another available vehicle from any VNU-HCM hub.</p>
                <button
                  type="button"
                  className="reservation-primary-long-button"
                  onClick={() => navigate('/student/hubs')}
                >
                  Choose another vehicle
                </button>
              </div>
            ) : (
              <>
                <div className="reservation-pickup-instructions">
                  <h3>Quick pickup</h3>
                  <ol>
                    <li>Go to <strong>{pickupLocation}</strong>, rack <strong>{positionCode}</strong>.</li>
                    <li>Scan QR on <strong>{selectedReservation.vehicleCode || 'EB-024'}</strong> and check brakes/lights.</li>
                  </ol>
                </div>
                <div className="reservation-pickup-code-content">
                  <AnimatedQrScanner codeLabel={selectedReservation.vehicleCode || 'SEMH-EV'} />
                </div>
                <p className="reservation-safety-note">
                  Rental fee: <strong>{formatVnd(selectedFeeVnd)}</strong> ({selectedDuration}h). If the vehicle does not meet your check, you may decline pickup below.
                </p>
                <div className="reservation-pickup-actions">
                  <button
                    type="button"
                    className="reservation-action-cancel"
                    onClick={() => handleCancelOrDecline(selectedReservation, 'Declined vehicle at hub')}
                    disabled={loading}
                  >
                    {loading ? 'Declining...' : 'Decline pickup'}
                  </button>
                  <button
                    type="button"
                    className="reservation-action-confirm"
                    onClick={handlePickup}
                    disabled={loading}
                  >
                    {loading ? 'Unlocking...' : 'Confirm pickup'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <button className="reservation-back-link" type="button" onClick={handleBackToList}>
          ← Back to all reservations
        </button>
      </main>
    );
  }

  // ============================================================================
  // STAGE 3: ACTIVE RIDE (LIVE TIMER) & HUB RETURN
  // ============================================================================
  if (stage === 'return' && selectedReservation) {
    const completed = selectedReservation.status === 'COMPLETED';
    const elapsedText = formatElapsedRide(
      selectedReservation.actualPickupTime || selectedReservation.startTime,
      nowMs,
      selectedReservation.id
    );

    return (
      <main className="reservation-flow-page reservation-flow-page--return">
        <header className="reservation-flow-heading">
          <h1>{completed ? 'Ride completed' : 'Riding in progress'}</h1>
          <p>
            {completed
              ? 'Vehicle docked and verified at destination hub.'
              : 'Enjoy your ride! Select any VNU-HCM hub with free spaces when ready to return.'}
          </p>
        </header>

        <div className="reservation-stepper-card">
          <LifecycleStepper status={selectedReservation.status} reservationType="VEHICLE" />
        </div>

        {error && <p className="reservation-flow-error" role="alert">{error}</p>}

        <div className="reservation-return-layout">
          <section className="reservation-step-card reservation-return-vehicle">
            {!completed && (
              <div className="live-ride-timer-card">
                <div className="live-ride-timer-card__top">
                  <span>
                    <i className="live-pulse-dot" /> Trip in progress
                  </span>
                  <span className="live-ride-unlocked-tag">UNLOCKED</span>
                </div>
                <div className="live-ride-timer-digits">{elapsedText}</div>
                <div className="live-ride-timer-sub">
                  Elapsed riding time · {selectedReservation.vehicleCode}
                </div>
              </div>
            )}

            <div className="reservation-vehicle-image">
              <EvIllustration variant={selectedVehicleKind} />
            </div>
            <div className="reservation-pickup-details">
              <div className="reservation-summary-row">
                <span>Vehicle</span>
                <strong>{selectedReservation.vehicleCode || '—'}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Origin hub</span>
                <strong>{selectedReservation.hubName || '—'}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Booked window</span>
                <strong>{formatTime(selectedReservation.startTime)} – {formatTime(selectedReservation.endTime)}</strong>
              </div>
              <div className="reservation-summary-row">
                <span>Total rental fee</span>
                <strong>{formatVnd(selectedFeeVnd)}</strong>
              </div>
            </div>
          </section>

          <section className="reservation-step-card reservation-return-confirmation">
            <h2>{completed ? 'Return receipt' : 'Select destination hub'}</h2>
            {completed ? (
              <div className="reservation-return-complete">
                <strong>✓ Return confirmed</strong>
                <span>Booking {selectedReservation.reservationCode || `#${selectedReservation.id}`}</span>
              </div>
            ) : (
              <>
                <label className="reservation-return-hub">
                  Destination hub
                  <select value={returnHubId} onChange={(event) => setReturnHubId(event.target.value)}>
                    {hubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.name} ({hub.freeParkingSlots} free spaces)
                      </option>
                    ))}
                  </select>
                </label>

                <div className="return-hub-preview-card">
                  <div>
                    <strong>{selectedReturnHub?.name || 'Destination Hub'}</strong>
                    <span>
                      {selectedReturnHub
                        ? `${selectedReturnHub.freeParkingSlots} return bays free · ${selectedReturnHub.availableChargers ?? 0} chargers open`
                        : 'Checking bay availability...'}
                    </span>
                  </div>
                </div>

                <div className="reservation-return-instructions">
                  <ol>
                    <li>Park inside a green Zone A / Universal bay.</li>
                    <li>Lock the {selectedVehicleKind} and tap Confirm return below.</li>
                  </ol>
                </div>
              </>
            )}

            {completed ? (
              <button type="button" className="reservation-primary-long-button" onClick={handleBackToList}>
                Back to reservations
              </button>
            ) : (
              <button
                type="button"
                className="reservation-primary-long-button"
                onClick={handleReturn}
                disabled={loading || !returnHubId}
              >
                {loading ? 'Completing return...' : 'Confirm return here'}
              </button>
            )}
          </section>
        </div>
      </main>
    );
  }

  // ============================================================================
  // DEFAULT STAGE: CLEAN INTERACTIVE RESERVATIONS DASHBOARD
  // ============================================================================
  const filteredList =
    listFilter === 'ACTIVE'
      ? openVehicleReservations
      : listFilter === 'HISTORY'
      ? historyVehicleReservations
      : vehicleReservations;

  return (
    <main className="reservation-flow-page">
      <header className="reservation-flow-heading">
        <h1>Pickup &amp; Return</h1>
        <p>Track operator approval, scan QR to ride, and return at any VNU-HCM hub.</p>
      </header>

      <QuickGuideStrip steps={RESERVATION_GUIDE} />

      {error && <p className="reservation-flow-error" role="alert">{error}</p>}

      <div className="reservation-filter-bar">
        <div className="reservation-filter-tabs">
          <button
            type="button"
            className={`reservation-filter-tab ${listFilter === 'ACTIVE' ? 'is-active' : ''}`}
            onClick={() => setListFilter('ACTIVE')}
          >
            Active &amp; Pending ({openVehicleReservations.length})
          </button>
          <button
            type="button"
            className={`reservation-filter-tab ${listFilter === 'HISTORY' ? 'is-active' : ''}`}
            onClick={() => setListFilter('HISTORY')}
          >
            History ({historyVehicleReservations.length})
          </button>
          <button
            type="button"
            className={`reservation-filter-tab ${listFilter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setListFilter('ALL')}
          >
            All ({vehicleReservations.length})
          </button>
        </div>

        <Link to="/student/hubs" className="reservation-new-btn">
          + Book a vehicle
        </Link>
      </div>

      <section className="reservation-list">
        {filteredList.map((reservation) => {
          const statusMeta = getReadableStatusMeta(reservation);
          const isOpen = ['PENDING', 'CONFIRMED', 'ACTIVE'].includes(reservation.status);
          const kind = getVehicleKind(reservation, reservation.vehicleCode);
          const hrs = reservationHours(reservation);
          const estFee = hrs * getRentalHourlyRateVnd(reservation.vehicleCode);

          return (
            <article
              className={`reservation-modern-card ${isOpen ? 'is-highlighted' : ''}`}
              key={reservation.id}
            >
              <div className="reservation-modern-card__top">
                <div className="reservation-modern-card__title">
                  <span className="vehicle-kind-chip">
                    {kind === 'scooter' ? 'E-SCOOTER' : 'E-BIKE'}
                  </span>
                  <h2>{reservation.vehicleCode || 'Campus EV'}</h2>
                  <span className={`status-tone-pill tone-${statusMeta.tone}`}>
                    {statusMeta.label}
                  </span>
                </div>

                <strong className="reservation-modern-card__price">
                  {formatVnd(estFee)}
                </strong>
              </div>

              <div className="reservation-modern-card__pills">
                <span className="meta-chip">{reservation.hubName || 'Campus Hub'}</span>
                <span className="meta-chip">{formatDate(reservation.startTime)}</span>
                <span className="meta-chip">
                  {formatTime(reservation.startTime)} – {formatTime(reservation.endTime)} ({hrs}h)
                </span>
                {reservation.status === 'ACTIVE' && (
                  <span className="meta-chip meta-chip--live">
                    Riding · {formatElapsedRide(reservation.actualPickupTime || reservation.startTime, nowMs, reservation.id)}
                  </span>
                )}
              </div>

              <LifecycleStepper
                status={reservation.status}
                cancellationSource={reservation.cancellationSource}
                reservationType="VEHICLE"
              />

              {isOpen && (
                <div className="reservation-modern-card__actions">
                  {reservation.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        className="reservation-primary-short-button"
                        onClick={() => openReservation(reservation, 'pickup')}
                        disabled={loading}
                      >
                        View approval status
                      </button>
                      <button
                        type="button"
                        className="reservation-outline-danger-btn"
                        onClick={() => handleCancelOrDecline(reservation, 'Cancelled while pending')}
                        disabled={loading}
                      >
                        Cancel request
                      </button>
                    </>
                  )}
                  {reservation.status === 'CONFIRMED' && (
                    <>
                      <button
                        type="button"
                        className="reservation-primary-short-button"
                        onClick={() => openReservation(reservation, 'pickup')}
                        disabled={loading}
                      >
                        Scan QR &amp; Pick up
                      </button>
                      <button
                        type="button"
                        className="reservation-outline-danger-btn"
                        onClick={() => handleCancelOrDecline(reservation, 'Declined pickup')}
                        disabled={loading}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {reservation.status === 'ACTIVE' && (
                    <button
                      type="button"
                      className="reservation-primary-short-button"
                      onClick={() => openReservation(reservation, 'return')}
                      disabled={loading}
                    >
                      Open live ride &amp; Return
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!filteredList.length && (
          <div className="reservation-empty">
            <p style={{ margin: '0 0 12px', fontSize: 16 }}>
              {listFilter === 'ACTIVE'
                ? 'No active or pending vehicle bookings right now.'
                : 'No reservations in this tab yet.'}
            </p>
            <Link to="/student/hubs" className="reservation-primary-short-button">
              Browse VNU-HCM hubs
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
