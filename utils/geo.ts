import { GeoCoord } from '../types';

// Haversine formula to calculate distance between two points in km
// We use this for the browser-based implementation to avoid making N*N API calls to HERE Routing API
// which would hit rate limits and CORS issues immediately in a client-side app.
export const calculateDistanceKm = (a: GeoCoord, b: GeoCoord): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lng - a.lng);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  const d = R * c; // Distance in km
  return Number(d.toFixed(2));
};

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// Map cache to prevent duplicate API calls during a session
const geoCache = new Map<string, GeoCoord>();

export const geocodeAddress = async (
  address: string,
  apiKey: string
): Promise<GeoCoord | null> => {
  if (geoCache.has(address)) {
    return geoCache.get(address)!;
  }

  const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(
    address
  )}&apiKey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const pos = data.items[0].position;
      const coord = { lat: pos.lat, lng: pos.lng };
      geoCache.set(address, coord);
      return coord;
    }
    return null;
  } catch (error) {
    console.warn(`Failed to geocode: ${address}`, error);
    return null;
  }
};