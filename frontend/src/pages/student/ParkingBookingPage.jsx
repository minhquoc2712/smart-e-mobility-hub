import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { hubApi, reservationApi } from '../../api';
import { useAuth } from '../../context/AuthContext';

function toLocalDateTime(date, time) {
  return `${date}T${time}:00`;
}

function getLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSuggestedTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  if (start.getTime() <= Date.now()) start.setHours(start.getHours() + 1);
  if (start.getHours() > 20) start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    date: getLocalDate(start),
    arrival: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    departure: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
  };
}

function normalizeParkingReservation(reservation) {
  return {
    ...reservation,
    hubId: Number(reservation.hubId ?? reservation.hub_id),
    hubName: reservation.hubName ?? reservation.hub_name,
    reservationType: reservation.reservationType ?? reservation.reservation_type,
    startTime: formatDateTime(reservation.startTime ?? reservation.start_time),
    endTime: formatDateTime(reservation.endTime ?? reservation.end_time),
    licensePlate: reservation.licensePlate ?? reservation.license_plate ?? '',
    parkingSlotCode: reservation.parkingSlotCode ?? reservation.parking_slot_code ?? '',
  };
}

function formatDateTime(value) {
  if (value instanceof Date) {
    const date = getLocalDate(value);
    const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    return `${date}T${time}:00`;
  }
  return String(value || '').replace(' ', 'T');
}

export function ParkingBookingPage() {
  const { hubId } = useParams();
  const { user } = useAuth();
  const [suggestedTimes] = useState(getSuggestedTimes);
  const [hub, setHub] = useState(null);
  const [date, setDate] = useState(suggestedTimes.date);
  const [arrival, setArrival] = useState(suggestedTimes.arrival);
  const [departure, setDeparture] = useState(suggestedTimes.departure);
  const [licensePlate, setLicensePlate] = useState('');
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const [hubData, reservations] = await Promise.all([
      hubApi.getHubById(hubId),
      reservationApi.getMyReservations(user?.id),
    ]);
    setHub(hubData);
    setBookings(reservations
      .map(normalizeParkingReservation)
      .filter((reservation) => reservation.hubId === Number(hubId)
        && reservation.reservationType === 'PARKING'
        && reservation.status !== 'CANCELLED'));
  };

  useEffect(() => {
    loadData().catch((loadError) => setError(loadError.message || 'Unable to load parking details.'));
  }, [hubId, user?.id]);

  const today = getLocalDate(new Date());
  const currentTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const arrivalMin = date === today ? currentTime : undefined;
  const departureMin = date === today
    ? (arrival > currentTime ? arrival : currentTime)
    : arrival || undefined;

  const validateBooking = () => {
    if (!date || !arrival || !departure) return 'Enter a date, arrival time, and departure time.';
    const start = new Date(`${date}T${arrival}`);
    const end = new Date(`${date}T${departure}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Enter a valid date and time.';
    if (start.getTime() < Date.now()) return 'Arrival date and time cannot be in the past.';
    if (end.getTime() < Date.now()) return 'Departure date and time cannot be in the past.';
    if (end <= start) return 'Departure time must be after arrival time.';
    return '';
  };

  const handleBook = async (event) => {
    event.preventDefault();
    const validationError = validateBooking();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError('');
      setLoading(true);
      await reservationApi.reserveParking({
        userId: user?.id,
        hubId: Number(hubId),
        startTime: toLocalDateTime(date, arrival),
        endTime: toLocalDateTime(date, departure),
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
      setBookings((current) => current.filter((booking) => booking.id !== reservationId));
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel parking booking.');
    }
  };

  return (
    <div className="booking-page parking-booking-page">
      <Link className="page-back-link" to={`/student/hubs/${hubId}/info`}>‹ Hub info</Link>
      <h1>Book parking</h1>

      <div className="booking-form-card parking-form-card">
        <form onSubmit={handleBook}>
          <div className="booking-location">
            <span>LOCATION</span>
            <strong>{hub?.name?.replace(/\s+Hub$/i, '') || 'Loading hub...'}</strong>
          </div>
          <label>
            Date
            <input
              type="date"
              value={date}
              min={today}
              required
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <div className="booking-time-grid">
            <label>
              Arrival time
              <input
                type="time"
                value={arrival}
                min={arrivalMin}
                required
                onChange={(event) => setArrival(event.target.value)}
              />
            </label>
            <label>
              Departure time
              <input
                type="time"
                value={departure}
                min={departureMin}
                required
                onChange={(event) => setDeparture(event.target.value)}
              />
            </label>
          </div>
          <label>
            License plate (optional)
            <input
              value={licensePlate}
              maxLength={32}
              onChange={(event) => setLicensePlate(event.target.value)}
              placeholder="Enter your license plate"
            />
          </label>
          <button className="primary-action" type="submit" disabled={loading || !hub}>
            {loading ? 'Booking...' : 'Book parking'}
          </button>
        </form>
      </div>

      {error && <p className="booking-error" role="alert">{error}</p>}

      <section className="parking-booking-results" aria-live="polite">
        {bookings.map((booking) => (
          <article className="parking-result-card" key={booking.id}>
            <div className="parking-result-heading">
              <h2>Parking booking confirmed</h2>
              <span>{booking.reservationCode || 'Confirmed'}</span>
            </div>
            <div className="parking-result-details">
              <div><span>Location</span><strong>{booking.hubName}</strong></div>
              <div><span>Date</span><strong>{booking.startTime?.slice(0, 10)}</strong></div>
              <div><span>Parking time</span><strong>{booking.startTime?.slice(11, 16)} - {booking.endTime?.slice(11, 16)}</strong></div>
              <div><span>Parking slot</span><strong>{booking.parkingSlotCode || 'Assigned'}</strong></div>
              <div><span>License plate</span><strong>{booking.licensePlate || 'Not provided'}</strong></div>
            </div>
            <button type="button" className="parking-cancel-button" onClick={() => handleCancel(booking.id)}>
              Cancel reservation
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
