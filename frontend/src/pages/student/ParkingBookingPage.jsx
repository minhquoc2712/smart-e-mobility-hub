import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { hubApi, reservationApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import {
  TimeSlotWeekPicker,
  findFirstFreeHour,
  getLocalDateStr,
  isWindowBooked,
} from '../../components/common/TimeSlotWeekPicker';
import {
  QuickGuideStrip,
  LifecycleStepper,
  getReadableStatusMeta,
} from '../../components/common/QuickGuideStrip';

const PARKING_GUIDE = [
  {
    title: 'Choose Customer Slot',
    desc: 'Pick any Zone C private or universal EV bay at this hub.',
  },
  {
    title: 'Operator Confirmation',
    desc: 'Your bay is held immediately and confirmed by hub staff.',
  },
  {
    title: 'Park or Cancel Anytime',
    desc: 'Arrive within your window or cancel free of charge if plans change.',
  },
];

function formatDateTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const date = getLocalDateStr(value);
    const time = `${String(value.getHours()).padStart(2, '0')}:${String(
      value.getMinutes()
    ).padStart(2, '0')}`;
    return `${date}T${time}:00`;
  }
  const str = String(value).trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      const date = getLocalDateStr(parsed);
      const time = `${String(parsed.getHours()).padStart(2, '0')}:${String(
        parsed.getMinutes()
      ).padStart(2, '0')}`;
      return `${date}T${time}:00`;
    }
  }
  return str.replace(' ', 'T');
}

function normalizeParkingReservation(reservation) {
  return {
    ...reservation,
    hubId: Number(reservation.hubId ?? reservation.hub_id),
    hubName: reservation.hubName ?? reservation.hub_name,
    reservationType: reservation.reservationType ?? reservation.reservation_type,
    startTime: formatDateTime(reservation.startTime ?? reservation.start_time),
    endTime: formatDateTime(reservation.endTime ?? reservation.end_time),
    licensePlate:
      reservation.licensePlate ??
      reservation.license_plate ??
      reservation.return_condition_note ??
      '',
    parkingSlotCode:
      reservation.parkingSlotCode ??
      reservation.parking_slot_code ??
      reservation.slotCode ??
      reservation.slot_code ??
      '',
  };
}

export function ParkingBookingPage() {
  const { hubId } = useParams();
  const { user } = useAuth();
  const today = useMemo(() => getLocalDateStr(new Date()), []);

  const [hub, setHub] = useState(null);
  const [customerSlots, setCustomerSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [parkingBookings, setParkingBookings] = useState([]);

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [durationHours, setDurationHours] = useState(2);
  const [licensePlate, setLicensePlate] = useState('');

  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [hubData, slots, windows, reservations] = await Promise.all([
      hubApi.getHubById(hubId),
      hubApi.getParkingSlots(hubId).catch(() => []),
      hubApi.getBookedWindows(hubId).catch(() => ({ parkingBookings: [] })),
      reservationApi.getMyReservations(user?.id),
    ]);
    setHub(hubData);
    const compatibleSlots = (slots || []).filter(
      (s) =>
        ['PRIVATE_EV', 'UNIVERSAL'].includes(String(s.slotType || s.slot_type).toUpperCase()) &&
        String(s.status).toUpperCase() !== 'OUT_OF_SERVICE' &&
        !s.vehicleId
    );
    setCustomerSlots(compatibleSlots);
    setSelectedSlotId((prev) => {
      if (prev && compatibleSlots.some((s) => String(s.id) === String(prev))) return prev;
      return compatibleSlots[0] ? String(compatibleSlots[0].id) : '';
    });
    setParkingBookings(windows?.parkingBookings || []);

    setBookings(
      (reservations || [])
        .map(normalizeParkingReservation)
        .filter(
          (reservation) =>
            reservation.hubId === Number(hubId) &&
            reservation.reservationType === 'PARKING' &&
            reservation.status !== 'CANCELLED'
        )
    );
  }, [hubId, user?.id]);

  useEffect(() => {
    loadData().catch((loadError) =>
      setError(loadError.message || 'Unable to load parking details.')
    );
  }, [loadData]);

  // Booked intervals ONLY for the selected parking slot
  const bookedIntervalsForSlot = useMemo(() => {
    if (!selectedSlotId) return [];
    return parkingBookings.filter((b) => Number(b.parkingSlotId) === Number(selectedSlotId));
  }, [parkingBookings, selectedSlotId]);

  useEffect(() => {
    if (!date) return;
    const curStartMs = startTime ? new Date(`${date}T${startTime}:00`).getTime() : NaN;
    const curEndMs = curStartMs + Number(durationHours || 1) * 3600 * 1000;
    const isInvalid =
      !startTime ||
      Number.isNaN(curStartMs) ||
      curStartMs < Date.now() - 60000 ||
      isWindowBooked(curStartMs, curEndMs, bookedIntervalsForSlot);

    if (isInvalid) {
      const nextFree = findFirstFreeHour(date, bookedIntervalsForSlot);
      setStartTime(nextFree);
      if (nextFree) setDurationHours(1);
    }
  }, [date, selectedSlotId, bookedIntervalsForSlot]);

  const endTime = useMemo(() => {
    if (!startTime) return '';
    const [hh, mm] = startTime.split(':').map(Number);
    const end = new Date(2000, 0, 1, hh, mm + Number(durationHours || 1) * 60);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(
      2,
      '0'
    )}`;
  }, [startTime, durationHours]);

  const handleBook = async (event) => {
    event.preventDefault();
    if (!date || !startTime || !selectedSlotId) {
      setError('Please select a parking slot and an available (unshaded) start time.');
      return;
    }

    const [hh, mm] = startTime.split(':').map(Number);
    const [yy, mo, dd] = date.split('-').map(Number);
    const start = new Date(yy, mo - 1, dd, hh, mm, 0);
    const end = new Date(start.getTime() + Number(durationHours || 1) * 3600 * 1000);

    if (isWindowBooked(start.getTime(), end.getTime(), bookedIntervalsForSlot)) {
      setError('Selected range overlaps a greyed-out booked slot. Please choose free hours.');
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const toLocalStr = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}:00`;

    try {
      setError('');
      setLoading(true);
      await reservationApi.reserveParking({
        userId: user?.id,
        hubId: Number(hubId),
        parkingSlotId: Number(selectedSlotId),
        startTime: toLocalStr(start),
        endTime: toLocalStr(end),
        licensePlate: licensePlate.trim() || null,
      });
      setLicensePlate('');
      await loadData();
    } catch (requestError) {
      setError(requestError.message || 'Unable to book parking.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (reservationId) => {
    try {
      setError('');
      await reservationApi.cancelReservation(reservationId);
      await loadData();
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel parking booking.');
    }
  };

  const hubStatus = String(hub?.status || 'ACTIVE').toUpperCase();

  return (
    <div className="booking-page parking-booking-page">
      <Link className="page-back-link" to={`/student/hubs/${hubId}/info`}>
        ‹ Hub info
      </Link>
      <h1>Book parking</h1>
      <QuickGuideStrip steps={PARKING_GUIDE} />

      <div className="booking-form-card parking-form-card">
        <form onSubmit={handleBook}>
          <div
            className="booking-location"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <span>LOCATION</span>
              <strong style={{ display: 'block' }}>
                {hub?.name?.replace(/\s+Hub$/i, '') || 'Loading hub...'}
              </strong>
            </div>
            {hub && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background:
                    hubStatus === 'FULL'
                      ? '#fee2e2'
                      : hubStatus === 'NEAR_FULL'
                      ? '#fef3c7'
                      : '#dcfce7',
                  color:
                    hubStatus === 'FULL'
                      ? '#991b1b'
                      : hubStatus === 'NEAR_FULL'
                      ? '#92400e'
                      : '#166534',
                }}
              >
                {hubStatus.replace('_', ' ')}
              </span>
            )}
          </div>

          <label>
            Parking space
            <select
              value={selectedSlotId}
              onChange={(e) => {
                setSelectedSlotId(e.target.value);
                setError('');
              }}
              required
            >
              {customerSlots.length === 0 && <option value="">No customer parking spaces</option>}
              {customerSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.slotCode || s.slot_code} ({(s.slotType || s.slot_type || '').replace('_', ' ')})
                </option>
              ))}
            </select>
          </label>

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
            bookedIntervals={bookedIntervalsForSlot}
            disabled={loading || !selectedSlotId}
          />

          <label>
            License plate (optional)
            <input
              value={licensePlate}
              maxLength={32}
              onChange={(event) => setLicensePlate(event.target.value)}
              placeholder="Enter your license plate (e.g. 59-MĐ1 123.45)"
            />
          </label>

          <button
            className="primary-action"
            type="submit"
            disabled={loading || !hub || !selectedSlotId || !startTime}
          >
            {loading
              ? 'Booking...'
              : startTime
              ? `Book parking (${startTime} – ${endTime})`
              : 'No free hours on this day'}
          </button>
        </form>
      </div>

      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}

      <section className="parking-booking-results" aria-live="polite">
        {bookings.map((booking) => {
          const meta = getReadableStatusMeta(booking);
          return (
            <article className="parking-result-card" key={booking.id}>
              <div className="parking-result-heading">
                <h2>Parking reservation · {booking.parkingSlotCode || 'Assigned'}</h2>
                <span className={`status-tone-pill tone-${meta.tone}`}>{meta.label}</span>
              </div>
              <LifecycleStepper
                status={booking.status}
                cancellationSource={booking.cancellationSource}
                reservationType="PARKING"
              />
              <div className="parking-result-details">
                <div>
                  <span>Location</span>
                  <strong>{booking.hubName}</strong>
                </div>
                <div>
                  <span>Date</span>
                  <strong>{booking.startTime?.slice(0, 10)}</strong>
                </div>
                <div>
                  <span>Parking time</span>
                  <strong>
                    {booking.startTime?.slice(11, 16)} - {booking.endTime?.slice(11, 16)}
                  </strong>
                </div>
                <div>
                  <span>License plate</span>
                  <strong>{booking.licensePlate || 'Not provided'}</strong>
                </div>
              </div>
              {['PENDING', 'CONFIRMED'].includes(String(booking.status || '').toUpperCase()) && (
                <button
                  type="button"
                  className="parking-cancel-button"
                  onClick={() => handleCancel(booking.id)}
                >
                  {String(booking.status).toUpperCase() === 'CONFIRMED'
                    ? 'Decline / Cancel booking'
                    : 'Cancel request'}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
