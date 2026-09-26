// apiService.js
//
// Thin fetch-based client for the SURAKSHA FastAPI backend
// (see backend/main.py). This is the piece that was missing:
// the frontend previously never called the backend at all.

import { API_BASE_URL } from '../config.js';

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  let response;

  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (networkError) {
    throw new Error(
      `Could not reach SURAKSHA backend at ${API_BASE_URL}. ` +
      `Is it running (uvicorn main:app --reload)? (${networkError.message})`
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    // Non-JSON response body — leave data as null.
  }

  if (!response.ok) {
    const message = (data && (data.message || data.detail)) || response.statusText;
    throw new Error(`Backend error ${response.status}: ${message}`);
  }

  return data;
}

export const apiService = {
  async checkHealth() {
    return request('/health');
  },

  /**
   * Sends one processed sensor reading to the backend.
   * payload must match backend/main.py's SensorData model:
   *   { shipment_id, product_type, temperature, humidity, shock,
   *     latitude, longitude, timestamp, cooling_status }
   */
  async sendSensorData(payload) {
    return request('/sensor-data', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getNearbyFacilities({ latitude, longitude, productType, minAvailableCapacity = 0, limit = 5 }) {
    const params = new URLSearchParams({
      latitude,
      longitude,
      product_type: productType,
      min_available_capacity: minAvailableCapacity,
      limit,
    });
    return request(`/nearby-facilities?${params.toString()}`);
  },

  async getRerouteRecommendation({ latitude, longitude, productType, minAvailableCapacity = 0, candidateLimit = 5 }) {
    const params = new URLSearchParams({
      latitude,
      longitude,
      product_type: productType,
      min_available_capacity: minAvailableCapacity,
      candidate_limit: candidateLimit,
    });
    return request(`/reroute-recommendation?${params.toString()}`);
  },

  /**
   * Clears the backend's accumulated per-shipment ML state (cumulative
   * exposure, excursion timers, etc.) for one shipment_id. Call this at
   * the start of every new demo run — the frontend reuses the same
   * constant shipment_id every time, so without this, leftover state from
   * a previous run (possibly under a different product's temperature
   * range) keeps accumulating and can make a fresh run's very first
   * reading predict CRITICAL immediately.
   */
  async resetShipment(shipmentId) {
    return request(`/reset-shipment/${encodeURIComponent(shipmentId)}`, {
      method: 'POST',
    });
  },
};
