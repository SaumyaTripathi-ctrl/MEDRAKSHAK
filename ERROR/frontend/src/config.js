// Central runtime configuration for talking to the SURAKSHA FastAPI backend.
//
// Set VITE_API_BASE_URL in a .env file (see .env.example) if the backend
// is not running on the default local address/port.

export const API_BASE_URL =
  (import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  'http://127.0.0.1:8000';

// Maps the frontend's internal product ids to the exact product_type keys
// the backend (data/product_profiles.json) understands.
export const PRODUCT_TYPE_MAP = {
  VACCINES: 'vaccine',
  REFRIGERATED_MEDS: 'refrigerated_medicine',
  ROOM_TEMP_MEDS: 'room_temperature_medicine',
};

// Default identifiers used when talking to the backend / ESP32 gateway.
export const DEFAULT_SHIPMENT_ID = 'CG-TRUCK-07';
export const BLE_DEVICE_NAME = 'ChillGuard-07';
