// Adapts a cold-storage facility object coming back from the SURAKSHA
// backend (backend/services/cold_storage.py / routing.py field names) into
// the shape the existing frontend components (ColdStorageRecommendation,
// EmergencyRouteMap) were already built to render.
export function normalizeFacility(f) {
  if (!f) return null;
  return {
    id: f.facility_id,
    name: f.facility_name,
    type: f.facility_type,
    latitude: f.latitude,
    longitude: f.longitude,
    minTemp: f.storage_min_temp,
    maxTemp: f.storage_max_temp,
    capacity: f.capacity_units,
    availableCapacity: f.available_capacity,
    status: (f.operational_status || '').toUpperCase(),
    distanceKm: f.road_distance_km != null ? f.road_distance_km : f.distance_km,
    etaMinutes: f.travel_time_minutes != null ? Math.round(f.travel_time_minutes) : undefined,
    isSuitable: true,
    isCompatible: true,
  };
}

export function normalizeColdStorageRecommendation(recommendation) {
  if (!recommendation || !recommendation.recommendation_available) return [];
  const recommended = normalizeFacility(recommendation.recommended_facility);
  const alternatives = (recommendation.alternatives || []).map(normalizeFacility);
  return [recommended, ...alternatives].filter(Boolean);
}
