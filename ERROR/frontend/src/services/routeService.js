// OSRM road-routing service.
//
// createRoute() resolves a real driving route between two named locations
// (used by the Simulation page's demo start/end route builder).
// createRouteFromCoordinates() resolves a route between two raw GPS points
// (used for the emergency cold-storage detour path). Both fall back to a
// straight-line/approximate path if the public OSRM API is unreachable.
import { LOCATIONS } from '../data/locations.js';

export const routeService = {
  normalizeName(name) {
    if (!name) return '';
    const clean = name.trim().toLowerCase();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  },

  async createRoute(startInput, endInput) {
    const startName = this.normalizeName(startInput);
    const endName = this.normalizeName(endInput);

    const startCoordinates = LOCATIONS[startName];
    const endCoordinates = LOCATIONS[endName];

    if (!startCoordinates || !endCoordinates) {
      throw new Error(`Could not resolve coordinates for "${startInput}" or "${endInput}". Supported cities: ${Object.keys(LOCATIONS).join(', ')}.`);
    }

    try {
      // OSRM expects coordinates in [longitude, latitude] format
      const startLngLat = `${startCoordinates[1]},${startCoordinates[0]}`;
      const endLngLat = `${endCoordinates[1]},${endCoordinates[0]}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${startLngLat};${endLngLat}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('OSRM API returned non-ok response');

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) throw new Error('No route paths resolved by OSRM');

      const route = data.routes[0];
      const routeCoordinates = route.geometry.coordinates.map(point => [point[1], point[0]]);
      const distanceKm = Math.round(route.distance / 1000);
      const durationMinutes = Math.round(route.duration / 60);

      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const estimatedTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      return {
        startName,
        endName,
        startCoordinates,
        endCoordinates,
        routeCoordinates,
        distanceKm,
        durationMinutes,
        estimatedTime
      };

    } catch (error) {
      console.warn('OSRM routing fetch failed, falling back to an approximate path:', error);

      const latDiff = endCoordinates[0] - startCoordinates[0];
      const lngDiff = endCoordinates[1] - startCoordinates[1];
      const distanceKm = Math.round(Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111);
      const durationMinutes = Math.round(distanceKm / 75 * 60); // 75 km/h avg
      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const estimatedTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      const steps = 25;
      const routeCoordinates = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = startCoordinates[0] + latDiff * t;
        const lng = startCoordinates[1] + lngDiff * t;
        if (i > 0 && i < steps) {
          const offsetLat = Math.sin(i * 1.5) * 0.15;
          const offsetLng = Math.cos(i * 1.5) * 0.15;
          routeCoordinates.push([lat + offsetLat, lng + offsetLng]);
        } else {
          routeCoordinates.push([lat, lng]);
        }
      }

      return {
        startName,
        endName,
        startCoordinates,
        endCoordinates,
        routeCoordinates,
        distanceKm,
        durationMinutes,
        estimatedTime
      };
    }
  },

  async createRouteFromCoordinates(startCoords, endCoords) {
    if (!startCoords || !endCoords) return null;

    try {
      const startLngLat = `${startCoords[1]},${startCoords[0]}`;
      const endLngLat = `${endCoords[1]},${endCoords[0]}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${startLngLat};${endLngLat}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('OSRM API error');

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) throw new Error('No routes resolved');

      const route = data.routes[0];
      const routeCoordinates = route.geometry.coordinates.map(point => [point[1], point[0]]);

      return routeCoordinates;

    } catch (error) {
      console.warn('OSRM emergency route fetch failed, using linear coordinates:', error);
      return [startCoords, endCoords];
    }
  }
};
