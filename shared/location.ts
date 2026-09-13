export const LOCATION_MARKER = "موقع GPS:";
const MAX_ADDRESS_LENGTH = 300;

export function cleanLocationAddress(address: string | null | undefined) {
  return (address || "").replace(new RegExp(`\\s*${LOCATION_MARKER}[^\\n]*`, "i"), "").trim();
}

export function appendCoordinatesToAddress(address: string | null | undefined, latitude?: number | null, longitude?: number | null) {
  const cleanAddress = cleanLocationAddress(address);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!hasCoordinates) return cleanAddress.slice(0, MAX_ADDRESS_LENGTH);
  const coordinates = `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
  const suffix = `${LOCATION_MARKER} ${coordinates}`;
  const available = MAX_ADDRESS_LENGTH - suffix.length - 1;
  const shortenedAddress = cleanAddress.slice(0, Math.max(0, available)).trim();
  return shortenedAddress ? `${shortenedAddress}\n${suffix}` : suffix;
}

export function extractCoordinatesFromAddress(address: string | null | undefined) {
  const match = (address || "").match(new RegExp(`${LOCATION_MARKER}\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export function distanceInKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const earthRadiusKm = 6371;
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Conservative ETA for staging until a road-routing provider is connected. */
export function estimateDeliveryMinutes(distanceKm: number) {
  return Math.max(10, Math.round((distanceKm / 25) * 60) + 10);
}
