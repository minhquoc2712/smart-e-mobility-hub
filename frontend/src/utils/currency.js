/**
 * VNU-HCM Campus E-Mobility Pricing (VND)
 */
export const RENTAL_BIKE_HOURLY_VND = 10000;
export const RENTAL_SCOOTER_HOURLY_VND = 15000;
export const CHARGING_HOURLY_VND = 5000;

export function getRentalHourlyRateVnd(vehicleOrType) {
  const rawType =
    typeof vehicleOrType === 'string'
      ? vehicleOrType
      : vehicleOrType?.type || vehicleOrType?.vehicleCode || vehicleOrType?.code || '';
  const upper = String(rawType).toUpperCase();
  if (upper === 'ELECTRIC_SCOOTER' || upper.startsWith('ES-') || upper.includes('SCOOTER')) {
    return RENTAL_SCOOTER_HOURLY_VND;
  }
  return RENTAL_BIKE_HOURLY_VND;
}

export function formatVnd(amount) {
  const num = Math.round(Number(amount) || 0);
  return `${new Intl.NumberFormat('vi-VN').format(num)} ₫`;
}
