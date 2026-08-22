// SensorContext.jsx
//
// This is the piece that actually closes the loop described in the
// project's architecture doc:
//
//   ESP32 (BLE JSON) -> BLE gateway -> field conversion -> FastAPI
//   /sensor-data -> features + weather + ML -> prediction -> frontend
//
// Because no physical ESP32 hardware is connected to this session, this
// context ships TWO ways to feed the pipeline:
//
//   1. startSimulatedStream() - generates packets in EXACTLY the shape the
//      ESP32-S3 firmware documentation describes ({id, ts, pkt, temp, hum,
//      lat, lng, g, crash, door, alert, ir, buz, ble}) every 2 seconds
//      (matching the real device's BLE notify rate) and runs them through
//      the real conversion + POST /sensor-data pipeline. This lets the
//      whole system be exercised end-to-end today, with real ML
//      predictions, without hardware.
//
//   2. connectBluetooth() - a real Web Bluetooth client that connects to a
//      device advertising as BLE_DEVICE_NAME ("ChillGuard-07"), subscribes
//      to notifications, and feeds whatever JSON the firmware sends
//      through the SAME conversion + POST pipeline. Once the real board is
//      flashed, this path is ready to use as-is (only the service/
//      characteristic UUID constants below may need updating to match the
//      firmware's actual GATT definitions).
//
// Both paths funnel into convertAndSend(), so nothing downstream cares
// which one produced the reading.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { apiService } from '../services/apiService.js';
import { DEFAULT_SHIPMENT_ID } from '../config.js';

const SensorContext = createContext(null);

// ---------------------------------------------------------------------
// BLE configuration
//
// The ESP32-S3 firmware advertises as BLE_DEVICE_NAME. These UUIDs use
// the Nordic UART Service convention (a very common pattern for
// "stream JSON over a single notify characteristic" ESP32 projects).
// If the real firmware defines its own custom UUIDs, replace the two
// constants below with the exact values from the firmware's
// BLEService / BLECharacteristic setup.
// ---------------------------------------------------------------------
const BLE_DEVICE_NAME = 'ChillGuard-07';
const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_NOTIFY_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

// Product limits, mirrored from backend/data/product_profiles.json, used
// only to script a realistic simulated drift. The backend is always the
// source of truth for the actual limits used in the ML feature vector.
const PRODUCT_LIMITS = {
  vaccine: { min_temp: 2, max_temp: 8 },
  refrigerated_medicine: { min_temp: 2, max_temp: 8 },
  room_temperature_medicine: { min_temp: 15, max_temp: 25 },
};

function shockMagnitudeFromG(g) {
  // The accelerometer reads ~1.00g at rest (gravity). We report the
  // deviation from that baseline as the "shock" magnitude the ML model
  // was trained on.
  return Math.round(Math.max(0, Math.abs(g - 1.0)) * 100) / 100;
}

export function formatMinutes(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) {
    return '--';
  }
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return hours > 0 ? `${hours}h ${rem}m` : `${rem}m`;
}

export function SensorProvider({ children }) {
  const [connectionMode, setConnectionMode] = useState('idle'); // idle | simulated | ble
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [statusMessage, setStatusMessage] = useState('');
  const [lastPacket, setLastPacket] = useState(null); // raw ESP32-shaped packet
  const [lastPayload, setLastPayload] = useState(null); // what we POSTed to /sensor-data
  const [lastResponse, setLastResponse] = useState(null); // backend response (prediction, weather, cold_storage_recommendation)
  const [history, setHistory] = useState([]);

  const intervalRef = useRef(null);
  const tickRef = useRef(0);
  const pktCounterRef = useRef(0);
  const coolingStatusRef = useRef(0);
  const bleBufferRef = useRef('');
  const bleDeviceRef = useRef(null);
  const configRef = useRef({
    shipmentId: DEFAULT_SHIPMENT_ID,
    productType: 'vaccine',
    originLat: 13.0827,
    originLng: 80.2707,
  });

  const stopStream = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (bleDeviceRef.current && bleDeviceRef.current.gatt && bleDeviceRef.current.gatt.connected) {
      try {
        bleDeviceRef.current.gatt.disconnect();
      } catch (_) {
        // ignore
      }
    }
    bleDeviceRef.current = null;
    tickRef.current = 0;
    pktCounterRef.current = 0;
    coolingStatusRef.current = 0;
    setConnectionMode('idle');
    setStatus('disconnected');
    setStatusMessage('');
  }, []);

  // ---------------------------------------------------------------
  // Core pipeline: raw ESP32-shaped packet -> converted payload -> POST
  // ---------------------------------------------------------------
  const convertAndSend = useCallback(async (packet) => {
    const { shipmentId, productType } = configRef.current;

    const payload = {
      shipment_id: packet.id || shipmentId,
      product_type: productType,
      temperature: Number(packet.temp),
      humidity: Number(packet.hum),
      shock: shockMagnitudeFromG(Number(packet.g)),
      latitude: Number(packet.lat),
      longitude: Number(packet.lng),
      // The ESP32's `ts` field is device uptime (millis()), not a real
      // clock — the backend needs a real timestamp, so we stamp it here
      // when the gateway receives the reading.
      timestamp: new Date().toISOString(),
      cooling_status: coolingStatusRef.current,
    };

    setLastPacket(packet);
    setLastPayload(payload);

    try {
      const result = await apiService.sendSensorData(payload);
      setStatus('connected');
      setStatusMessage('');
      setLastResponse(result);

      if (result && result.prediction) {
        coolingStatusRef.current = result.prediction.cooling_required ? 1 : 0;
        setHistory((prev) => {
          const next = [
            ...prev,
            {
              timestamp: payload.timestamp,
              temperature: payload.temperature,
              humidity: payload.humidity,
              shock: payload.shock,
              risk: result.prediction.spoilage_risk,
              riskLevel: result.prediction.risk_level,
              safeTime: result.prediction.estimated_remaining_safe_time,
            },
          ];
          return next.slice(-40);
        });
      }

      return result;
    } catch (err) {
      setStatus('error');
      setStatusMessage(err.message || 'Failed to reach backend.');
      return null;
    }
  }, []);

  // ---------------------------------------------------------------
  // Simulated ESP32 stream (no hardware required)
  // ---------------------------------------------------------------
  const buildSimulatedPacket = useCallback(() => {
    const tick = tickRef.current;
    const { productType, shipmentId, originLat, originLng } = configRef.current;
    const limits = PRODUCT_LIMITS[productType] || PRODUCT_LIMITS.vaccine;
    const baseline = (limits.min_temp + limits.max_temp) / 2;
    const overshoot = limits.max_temp + 6;

    let temp = baseline;
    let g = 1.0;
    let crash = false;
    let door = false;

    if (tick < 3) {
      // Stage 1: SAFE baseline (small jitter for realism)
      temp = baseline + (Math.random() - 0.5) * 0.4;
    } else if (tick === 3) {
      // Stage 2: a single shock / vibration event
      temp = baseline + (Math.random() - 0.5) * 0.4;
      g = 2.6;
      crash = true;
    } else if (tick < 14) {
      // Stage 3 -> 4: cooling loss — temperature ramps up past the safe
      // range and keeps climbing until it plateaus at a clearly critical
      // level. The real spoilage-risk / safe-time numbers come from the
      // trained ML model reacting to this drift, not from a script.
      const rampProgress = Math.min(1, (tick - 4) / 9);
      temp = baseline + (overshoot - baseline) * rampProgress;
      g = 1.0 + (Math.random() - 0.5) * 0.05;
    } else {
      temp = overshoot + (Math.random() - 0.5) * 0.5;
      g = 1.0 + (Math.random() - 0.5) * 0.05;
    }

    const humidity = 50 + (Math.random() - 0.5) * 6;

    pktCounterRef.current += 1;
    tickRef.current += 1;

    return {
      id: shipmentId,
      ts: Date.now(),
      pkt: pktCounterRef.current,
      temp: Math.round(temp * 100) / 100,
      hum: Math.round(humidity * 100) / 100,
      lat: originLat,
      lng: originLng,
      g: Math.round(g * 100) / 100,
      crash,
      door,
      alert: tick < 3 ? 'normal' : tick < 4 ? 'shock' : tick < 14 ? 'warning' : 'critical',
      ir: false,
      buz: tick >= 3,
      ble: true,
    };
  }, []);

  const startSimulatedStream = useCallback((productType, origin, shipmentId) => {
    stopStream();
    configRef.current = {
      shipmentId: shipmentId || DEFAULT_SHIPMENT_ID,
      productType: productType || 'vaccine',
      originLat: origin && origin[0] != null ? origin[0] : 13.0827,
      originLng: origin && origin[1] != null ? origin[1] : 80.2707,
    };
    tickRef.current = 0;
    pktCounterRef.current = 0;
    coolingStatusRef.current = 0;
    setConnectionMode('simulated');
    setStatus('connecting');
    setStatusMessage('Streaming simulated ESP32-S3 packets every 2s...');

    // Send the first reading immediately, then every 2s (matching the
    // real firmware's BLE notify cadence described in the architecture
    // doc), so the UI updates right away instead of waiting 2s.
    convertAndSend(buildSimulatedPacket());
    intervalRef.current = setInterval(() => {
      convertAndSend(buildSimulatedPacket());
    }, 2000);
  }, [buildSimulatedPacket, convertAndSend, stopStream]);

  // ---------------------------------------------------------------
  // Extreme-case test: fires a short burst of deliberately out-of-range
  // readings back-to-back (instead of the gradual 2s-per-tick drift) so
  // you can see the CRITICAL / emergency-reroute path without waiting
  // for the natural ramp. The backend's feature engine is stateful per
  // shipment_id (services/features.py), so several extreme readings in
  // quick succession build up cumulative exposure / time-outside-range
  // just like several minutes of real drift would.
  // ---------------------------------------------------------------
  const sendExtremeTestBurst = useCallback(async (productType, origin, shipmentId, packetCount = 8) => {
    stopStream();
    const limits = PRODUCT_LIMITS[productType] || PRODUCT_LIMITS.vaccine;
    const extremeTemp = limits.max_temp + 15; // far outside the safe range
    const extremeHumidity = 88; // also out of the 40-60% "normal" band

    configRef.current = {
      shipmentId: shipmentId || DEFAULT_SHIPMENT_ID,
      productType: productType || 'vaccine',
      originLat: origin && origin[0] != null ? origin[0] : 13.0827,
      originLng: origin && origin[1] != null ? origin[1] : 80.2707,
    };
    pktCounterRef.current = 0;
    coolingStatusRef.current = 0;
    setConnectionMode('test');
    setStatus('connecting');
    setStatusMessage(`Sending ${packetCount} extreme test readings back-to-back...`);

    let lastResult = null;
    for (let i = 0; i < packetCount; i += 1) {
      pktCounterRef.current += 1;
      const packet = {
        id: configRef.current.shipmentId,
        ts: Date.now(),
        pkt: pktCounterRef.current,
        temp: Math.round((extremeTemp + (Math.random() - 0.5)) * 100) / 100,
        hum: Math.round((extremeHumidity + (Math.random() - 0.5) * 2) * 100) / 100,
        lat: configRef.current.originLat,
        lng: configRef.current.originLng,
        g: i === 0 ? 2.8 : 1.0, // one shock event on the first packet
        crash: i === 0,
        door: false,
        alert: 'critical',
        ir: false,
        buz: true,
        ble: true,
      };
      // eslint-disable-next-line no-await-in-loop
      lastResult = await convertAndSend(packet);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    setStatus(lastResult ? 'connected' : 'error');
    setStatusMessage(
      lastResult
        ? `Sent ${packetCount} extreme readings. Last risk_level: ${lastResult.prediction ? lastResult.prediction.risk_level : 'unknown'}.`
        : 'Extreme test failed — check that the backend is running.'
    );
    setConnectionMode('idle');
  }, [convertAndSend, stopStream]);

  // ---------------------------------------------------------------
  // Real ESP32 over Web Bluetooth
  // ---------------------------------------------------------------
  const handleBleNotification = useCallback((event) => {
    const chunk = new TextDecoder().decode(event.target.value);
    bleBufferRef.current += chunk;
    try {
      const packet = JSON.parse(bleBufferRef.current);
      bleBufferRef.current = '';
      convertAndSend(packet);
    } catch (_) {
      // JSON notifications can be split across multiple BLE notify
      // events if they exceed the negotiated MTU — keep buffering until
      // we have a full, parseable JSON object. Guard against garbage
      // data accumulating forever.
      if (bleBufferRef.current.length > 4000) {
        bleBufferRef.current = '';
      }
    }
  }, [convertAndSend]);

  const connectBluetooth = useCallback(async (productType, shipmentId) => {
    if (!navigator.bluetooth) {
      setStatus('error');
      setStatusMessage(
        'Web Bluetooth is not available in this browser/context. Use Chrome or Edge, ' +
        'served from http://127.0.0.1 or https, on a machine with Bluetooth hardware.'
      );
      return;
    }

    stopStream();
    configRef.current = {
      shipmentId: shipmentId || DEFAULT_SHIPMENT_ID,
      productType: productType || 'vaccine',
      originLat: 13.0827,
      originLng: 80.2707,
    };

    try {
      setConnectionMode('ble');
      setStatus('connecting');
      setStatusMessage(`Requesting Bluetooth device "${BLE_DEVICE_NAME}"...`);

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: BLE_DEVICE_NAME }],
        optionalServices: [BLE_SERVICE_UUID],
      });

      device.addEventListener('gattserverdisconnected', () => {
        setStatus('disconnected');
        setStatusMessage(`${BLE_DEVICE_NAME} disconnected.`);
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BLE_NOTIFY_CHARACTERISTIC_UUID);
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleBleNotification);

      bleDeviceRef.current = device;
      setStatus('connected');
      setStatusMessage(`Connected to ${device.name || BLE_DEVICE_NAME}. Waiting for sensor packets...`);
    } catch (err) {
      setStatus('error');
      setStatusMessage(
        (err && err.message) ||
        'Failed to connect over Bluetooth. If the firmware uses different ' +
        'service/characteristic UUIDs, update BLE_SERVICE_UUID / ' +
        'BLE_NOTIFY_CHARACTERISTIC_UUID in src/context/SensorContext.jsx.'
      );
    }
  }, [handleBleNotification, stopStream]);

  const value = {
    connectionMode,
    status,
    statusMessage,
    lastPacket,
    lastPayload,
    lastResponse,
    history,
    startSimulatedStream,
    sendExtremeTestBurst,
    connectBluetooth,
    stopStream,
    bleSupported: typeof navigator !== 'undefined' && !!navigator.bluetooth,
  };

  return (
    <SensorContext.Provider value={value}>
      {children}
    </SensorContext.Provider>
  );
}

export function useSensor() {
  const context = useContext(SensorContext);
  if (!context) {
    throw new Error('useSensor must be used within a SensorProvider');
  }
  return context;
}
