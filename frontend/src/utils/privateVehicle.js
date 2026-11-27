export function getVehiclesStorageKey(user) {
  return `semh_private_vehicles_${user?.id ?? 'guest'}`;
}

export function getDefaultPrivateVehicle(user) {
  const defaultId =
    user?.privateVehiclePlate ||
    (user?.id != null ? `PV-${String(user.id).padStart(3, '0')}` : 'PV-001');

  const rawModel = String(user?.privateVehicleModel || '').trim();
  const modelMatch = rawModel.match(/^(.+?)\s*\(([^)]+)\)$/);
  const firstWord = String(user?.fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-1)[0];

  const defaultName = modelMatch
    ? modelMatch[1].trim()
    : rawModel || (firstWord ? `${firstWord}'s EV` : 'My e-bike');
  const defaultType = modelMatch
    ? modelMatch[2].trim()
    : rawModel.toLowerCase().includes('scooter')
    ? 'Private electric scooter'
    : 'Private electric bike';

  return {
    id: defaultId,
    name: defaultName,
    type: defaultType,
    battery: 38,
  };
}

export function loadPrivateVehiclesForUser(user) {
  try {
    const raw = sessionStorage.getItem(getVehiclesStorageKey(user));
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [getDefaultPrivateVehicle(user)];
}

export function savePrivateVehiclesForUser(user, vehicles) {
  try {
    sessionStorage.setItem(getVehiclesStorageKey(user), JSON.stringify(vehicles));
  } catch {
    // ignore storage errors
  }
}
