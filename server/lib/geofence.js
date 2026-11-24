const isLatitude = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90;
const isLongitude = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180;

const distanceInMeters = (lat1, lon1, lat2, lon2) => {
  const radians = (value) => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  const clamped = Math.max(0, Math.min(1, a));
  return 6371000 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
};

const validateLocation = (session, latitude, longitude) => {
  if (session.radius_meters === null || session.radius_meters === undefined) {
    return { ok: true, distance: null };
  }
  if (!Number.isInteger(session.radius_meters) || session.radius_meters <= 0 ||
      !isLatitude(session.latitude) || !isLongitude(session.longitude)) {
    return { ok: false, status: 409, message: 'Session location or radius is invalid. Ask your teacher to create a correctly configured session.' };
  }
  if (!isLatitude(latitude) || !isLongitude(longitude)) {
    return { ok: false, status: 400, message: 'Valid student latitude and longitude are required for this session.' };
  }
  const distance = distanceInMeters(session.latitude, session.longitude, latitude, longitude);
  if (distance > session.radius_meters) {
    return {
      ok: false,
      status: 403,
      distance,
      message: `You are outside the allowed attendance radius of ${session.radius_meters}m (${Math.ceil(distance)}m away).`
    };
  }
  return { ok: true, distance };
};

module.exports = { isLatitude, isLongitude, distanceInMeters, validateLocation };
