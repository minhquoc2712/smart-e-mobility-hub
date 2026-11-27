import React, { useEffect, useMemo, useState } from 'react';

const HOURS = Array.from({ length: 15 }, (_, idx) => idx + 7); // 07:00 .. 21:00

export function getLocalDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the rolling 7-day window starting from the current local system date:
 *   - On 16/11 -> 16/11 .. 22/11
 *   - On 17/11 -> 17/11 .. 23/11
 *   - On 18/11 -> 18/11 .. 24/11
 */
export function getWeekDates(referenceTimeMs = Date.now()) {
  const days = [];
  const base = new Date(referenceTimeMs);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const value = getLocalDateStr(d);
    const weekday = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayMonth = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    days.push({ value, weekday, dayMonth });
  }
  return days;
}

/**
 * Checks if [slotStartMs, slotEndMs) overlaps any interval in `bookedIntervals`
 */
export function isWindowBooked(slotStartMs, slotEndMs, bookedIntervals = []) {
  return bookedIntervals.some((b) => {
    const bStart = new Date(String(b.startTime).replace(' ', 'T')).getTime();
    const bEnd = new Date(String(b.endTime).replace(' ', 'T')).getTime();
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) return false;
    return bStart < slotEndMs && bEnd > slotStartMs;
  });
}

/**
 * Finds the first available 1-hour slot on `dateStr` given `bookedIntervals`
 */
export function findFirstFreeHour(dateStr, bookedIntervals = []) {
  const nowMs = Date.now();
  for (const h of HOURS) {
    const hh = String(h).padStart(2, '0');
    const sMs = new Date(`${dateStr}T${hh}:00:00`).getTime();
    const eMs = sMs + 3600 * 1000;
    if (sMs < nowMs - 60000) continue;
    if (!isWindowBooked(sMs, eMs, bookedIntervals)) {
      return `${hh}:00`;
    }
  }
  return '';
}

/**
 * Interactive Rolling 7-Day Date + Hourly Time-Slot Grid.
 * Automatically updates day-by-day (e.g. 16/11->22/11 today, 17/11->23/11 tomorrow, 18/11->24/11 on Wednesday)
 * even if the browser tab remains open across midnight, and greys out booked/passed hours dynamically.
 */
export function TimeSlotWeekPicker({
  date,
  onDateChange,
  startTime,
  onStartTimeChange,
  durationHours,
  onDurationChange,
  bookedIntervals = [],
  disabled = false,
  durationOptions = [1, 2, 3, 4],
}) {
  // Live clock tick every 30s so rolling 7-day calendar & passed hours auto-refresh in real time
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getLocalDateStr(new Date(nowMs));
  const weekDates = useMemo(() => getWeekDates(nowMs), [todayStr]);
  const minDate = weekDates[0].value;
  const maxDate = weekDates[weekDates.length - 1].value;

  // If the date rolls past midnight (e.g. 16/11 -> 17/11), auto-advance selected date into the new 7-day range
  useEffect(() => {
    if (date && (date < minDate || date > maxDate)) {
      onDateChange(minDate);
    }
  }, [date, minDate, maxDate, onDateChange]);

  const selectedHour = startTime ? Number(startTime.split(':')[0]) : null;

  const hourStates = useMemo(() => {
    return HOURS.map((h) => {
      const hh = String(h).padStart(2, '0');
      const label = `${hh}:00`;
      const slotStartMs = new Date(`${date}T${hh}:00:00`).getTime();
      const slotEndMs = slotStartMs + 3600 * 1000;
      const isPast = slotStartMs < nowMs - 60000;
      const isBooked = isWindowBooked(slotStartMs, slotEndMs, bookedIntervals);
      const inSelectedRange =
        selectedHour !== null &&
        !Number.isNaN(selectedHour) &&
        h >= selectedHour &&
        h < selectedHour + Number(durationHours || 1) &&
        !isBooked &&
        !isPast;

      return {
        hour: h,
        label,
        isPast,
        isBooked,
        inSelectedRange,
        isStart: selectedHour === h && !isBooked && !isPast,
      };
    });
  }, [date, bookedIntervals, selectedHour, durationHours, nowMs]);

  // Compute which duration options collide with a booked slot or pass 22:00
  const durationAvailability = useMemo(() => {
    return durationOptions.map((dur) => {
      if (selectedHour === null || Number.isNaN(selectedHour)) {
        return { dur, allowed: true };
      }
      const sMs = new Date(
        `${date}T${String(selectedHour).padStart(2, '0')}:00:00`
      ).getTime();
      const eMs = sMs + dur * 3600 * 1000;
      const overlaps = isWindowBooked(sMs, eMs, bookedIntervals);
      const exceedsClosing = selectedHour + dur > 22;
      return {
        dur,
        allowed: !overlaps && !exceedsClosing && sMs >= nowMs - 60000,
        overlaps,
      };
    });
  }, [date, selectedHour, durationOptions, bookedIntervals, nowMs]);

  return (
    <div className="timeslot-picker">
      {/* Rolling 7-Day Date Selector */}
      <div>
        <div className="timeslot-picker__head">
          <span className="timeslot-picker__label">
            Date ({weekDates[0].dayMonth} – {weekDates[weekDates.length - 1].dayMonth})
          </span>
          <input
            type="date"
            aria-label="Booking date"
            value={date}
            min={minDate}
            max={maxDate}
            disabled={disabled}
            onChange={(e) => {
              const val = e.target.value;
              if (val >= minDate && val <= maxDate) {
                onDateChange(val);
              }
            }}
            className="timeslot-date-input"
          />
        </div>

        <div className="timeslot-week-grid">
          {weekDates.map((d) => {
            const active = d.value === date;
            return (
              <button
                key={d.value}
                type="button"
                disabled={disabled}
                onClick={() => onDateChange(d.value)}
                className={`timeslot-day-btn ${active ? 'is-active' : ''}`}
              >
                <span className="timeslot-day-btn__wk">{d.weekday}</span>
                <span className="timeslot-day-btn__dm">{d.dayMonth}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hourly Time-Slot Grid */}
      <div>
        <div className="timeslot-picker__head">
          <span className="timeslot-picker__label">Choose start time</span>
          <div className="timeslot-legend">
            <span>
              <i className="timeslot-legend__dot is-selected" /> Selected
            </span>
            <span>
              <i className="timeslot-legend__dot is-booked" /> Booked / Passed
            </span>
          </div>
        </div>

        <div className="timeslot-hour-grid">
          {hourStates.map((slot) => {
            const unavailable = slot.isBooked || slot.isPast || disabled;
            const stateClass = slot.isBooked
              ? 'is-booked'
              : slot.isPast
              ? 'is-past'
              : slot.inSelectedRange
              ? slot.isStart
                ? 'is-start'
                : 'is-range'
              : '';

            return (
              <button
                key={slot.label}
                type="button"
                disabled={unavailable}
                title={
                  slot.isBooked
                    ? `${slot.label}–${String(slot.hour + 1).padStart(2, '0')}:00 is already booked`
                    : slot.isPast
                    ? 'Past time'
                    : `Select ${slot.label}`
                }
                onClick={() => {
                  onStartTimeChange(slot.label);
                  const sMs = new Date(`${date}T${slot.label}:00`).getTime();
                  const eMs = sMs + Number(durationHours || 1) * 3600 * 1000;
                  if (
                    isWindowBooked(sMs, eMs, bookedIntervals) ||
                    slot.hour + Number(durationHours || 1) > 22
                  ) {
                    onDurationChange(1);
                  }
                }}
                className={`timeslot-hour-btn ${stateClass}`.trim()}
              >
                <span className="timeslot-hour-btn__time">{slot.label}</span>
                <span className="timeslot-hour-btn__sub">
                  {slot.isBooked ? 'Booked' : slot.isPast ? 'Passed' : 'Free'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration Selector */}
      <div>
        <span className="timeslot-picker__label" style={{ display: 'block', marginBottom: 6 }}>
          Duration
        </span>
        <div className="timeslot-duration-grid">
          {durationAvailability.map(({ dur, allowed, overlaps }) => {
            const active = Number(durationHours) === dur;
            return (
              <button
                key={dur}
                type="button"
                disabled={disabled || !allowed}
                onClick={() => onDurationChange(dur)}
                className={`timeslot-dur-btn ${active && allowed ? 'is-active' : ''} ${!allowed ? 'is-disabled' : ''}`.trim()}
              >
                {dur} {dur === 1 ? 'hour' : 'hours'}
                {overlaps ? ' (Booked)' : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
