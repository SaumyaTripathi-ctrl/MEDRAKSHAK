// SensorContext.jsx
//
// This is the piece that closes the loop described in the project's
// architecture doc:
//
//   ESP32 (BLE JSON) -> BLE gateway -> field conversion -> FastAPI
//   /sensor-data -> features + weather + ML -> prediction -> frontend
//
// connectBluetooth() is a real Web Bluetooth client for the ChillGuard-07
// ESP32-S3 edge unit (see HARDWARE_INTEGRATION_SPEC.md). It subscribes to
// the telemetry characteristic, reassembles/parses the JSON the firmware
// notifies every ~2s, and feeds it through convertAndSend(), which
// converts the firmware's field names into the backend's schema and POSTs
// to /sensor-data. It also acquires the command characteristic so the app
// can write control strings (PING, LOCK_BOX, etc.) back to the device.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { apiService } from '../services/apiService.js';
import { DEFAULT_SHIPMENT_ID, BLE_DEVICE_NAME } from '../config.js';

const SensorContext = createContext(null);

// ---------------------------------------------------------------------
// BLE configuration — confirmed values from HARDWARE_INTEGRATION_SPEC.md
// (ChillGuard ESP32-S3 firmware). Update these only if the firmware's own
// UUID #defines change.
// ---------------------------------------------------------------------
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_TELEMETRY_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // NOTIFY/READ
const BLE_COMMAND_CHARACTERISTIC_UUID = '1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e'; // WRITE/WRITE_NO_RESPONSE

// The 801S vibration sensor on the real edge unit is a digital switch (a
// vibration-pulse counter compared against a threshold), not an analog
// accelerometer — the firmware only ever reports a boolean `crash` flag,
// no g-force magnitude. The backend's ML feature vector wants a numeric
// "shock" value (its own shock_count feature fires at shock >= 0.1g), so
// a detected crash is mapped to a fixed representative magnitude clearly
// above every threshold the app or backend act on.
const CRASH_SHOCK_VALUE = 1.6;

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
  const [connectionMode, setConnectionMode] = useState('idle'); // idle | ble
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [statusMessage, setStatusMessage] = useState('');
  const [lastPacket, setLastPacket] = useState(null); // raw ESP32 telemetry packet (all firmware fields)
  const [lastPayload, setLastPayload] = useState(null); // what we POSTed to /sensor-data
  const [lastResponse, setLastResponse] = useState(null); // backend response (prediction, weather, cold_storage_recommendation)
  const [history, setHistory] = useState([]);

  // "real" = production model pair (trained on real cold-chain data,
  // escalates over tens of minutes to hours). "demo" = fast-reacting model
  // pair trained on synthetic ambient-only trajectories, for live
  // bench-test demos (escalates within seconds to ~1-2 minutes). See
  // backend/predict.py's module docstring for the full rationale.
  const [modelMode, setModelModeState] = useState('real');
  const modelModeRef = useRef('real');

  // Demo time acceleration. The backend's feature engineering
  // (calculate_features in services/features.py) derives its "minutes
  // outside range" ramp from the gap between consecutive readings'
  // `timestamp` values -- and that timestamp already comes from the
  // BROWSER's own clock (see convertAndSend below), not from the ESP32's
  // GPS module, so a GPS fix (often unavailable indoors, e.g. in a
  // classroom) was never actually required for it. What IS genuinely
  // useful for a live demo is being able to speed that clock up on
  // purpose -- e.g. bump to 10x right after WARNING is reached so the
  // audience isn't stuck waiting the full real-time ramp to see CRITICAL.
  // timeAccelRef is the live multiplier; simulatedClockRef is the
  // accelerated clock itself, advanced by (real elapsed ms * multiplier)
  // on every packet rather than jumping straight to Date.now(), so a
  // multiplier change mid-run doesn't cause a discontinuous jump.
  const [timeAcceleration, setTimeAccelerationState] = useState(1);
  const timeAccelRef = useRef(1);
  const simulatedClockRef = useRef(null);
  const lastRealTickMsRef = useRef(null);

  const setTimeAcceleration = useCallback((multiplier) => {
    const next = Number(multiplier) > 0 ? Number(multiplier) : 1;
    timeAccelRef.current = next;
    setTimeAccelerationState(next);
  }, []);

  const coolingStatusRef = useRef(0);
  const bleBufferRef = useRef('');
  const bleDeviceRef = useRef(null);
  const commandCharRef = useRef(null);
  const configRef = useRef({
    shipmentId: DEFAULT_SHIPMENT_ID,
    productType: 'vaccine',
  });

  // Live-switchable from the UI (no BLE reconnect needed) — the next
  // packet sent to /sensor-data just carries the new mode.
  const setModelMode = useCallback((mode) => {
    const next = mode === 'demo' ? 'demo' : 'real';
    modelModeRef.current = next;
    setModelModeState(next);
  }, []);

  const stopStream = useCallback(() => {
    if (bleDeviceRef.current && bleDeviceRef.current.gatt && bleDeviceRef.current.gatt.connected) {
      try {
        bleDeviceRef.current.gatt.disconnect();
      } catch (_) {
        // ignore
      }
    }
    bleDeviceRef.current = null;
    commandCharRef.current = null;
    coolingStatusRef.current = 0;
    setConnectionMode('idle');
    setStatus('disconnected');
    setStatusMessage('');
  }, []);

  // ---------------------------------------------------------------
  // Core pipeline: raw ESP32 telemetry packet -> converted payload -> POST
  // ---------------------------------------------------------------
  const convertAndSend = useCallback(async (packet) => {
    const { shipmentId, productType } = configRef.current;

    // The firmware's `ts` is uptime (millis()/1000), not a real clock —
    // the backend needs a real timestamp, so we stamp it here when the
    // gateway receives the reading. This is also the simulated-time clock
    // for demo acceleration (see timeAccelRef above): it starts at the
    // real time of the first packet and, from then on, advances by
    // (real elapsed ms since the last packet * the current multiplier)
    // rather than just reading Date.now() directly, so speeding up mid-run
    // doesn't cause a jump — only the RATE changes.
    const nowRealMs = Date.now();
    if (simulatedClockRef.current == null || lastRealTickMsRef.current == null) {
      simulatedClockRef.current = new Date(nowRealMs);
    } else {
      const realElapsedMs = Math.max(0, nowRealMs - lastRealTickMsRef.current);
      simulatedClockRef.current = new Date(
        simulatedClockRef.current.getTime() + realElapsedMs * timeAccelRef.current
      );
    }
    lastRealTickMsRef.current = nowRealMs;

    const payload = {
      shipment_id: packet.id || shipmentId,
      product_type: productType,
      temperature: Number(packet.temp),
      humidity: Number(packet.hum),
      shock: packet.crash ? CRASH_SHOCK_VALUE : 0,
      latitude: Number(packet.lat),
      longitude: Number(packet.lng),
      timestamp: simulatedClockRef.current.toISOString(),
      cooling_status: coolingStatusRef.current,
      model_mode: modelModeRef.current,
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
      // The telemetry JSON (~230 bytes) normally fits one notify event at
      // the negotiated 512-byte MTU, but keep buffering defensively in
      // case a given connection negotiates a smaller MTU and the JSON
      // arrives split across notifications. Guard against garbage data
      // accumulating forever.
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
    };
    // Fresh simulated clock for this run — matches the backend's own
    // per-shipment state reset (see apiService.resetShipment, called
    // right before this from App.jsx's handleConnectDevice).
    simulatedClockRef.current = null;
    lastRealTickMsRef.current = null;

    try {
      setConnectionMode('ble');
      setStatus('connecting');
      setStatusMessage(`Requesting Bluetooth device "${BLE_DEVICE_NAME}"...`);

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: BLE_DEVICE_NAME }],
        optionalServices: [BLE_SERVICE_UUID],
      });

      device.addEventListener('gattserverdisconnected', () => {
        commandCharRef.current = null;
        setStatus('disconnected');
        setStatusMessage(`${BLE_DEVICE_NAME} disconnected.`);
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);

      const telemetryChar = await service.getCharacteristic(BLE_TELEMETRY_CHARACTERISTIC_UUID);
      await telemetryChar.startNotifications();
      telemetryChar.addEventListener('characteristicvaluechanged', handleBleNotification);

      // Command characteristic — lets the app write control strings back
      // to the device (PING, LOCK_BOX/UNLOCK_BOX, LED overrides, IR cool
      // up/down). See HARDWARE_INTEGRATION_SPEC.md section 5.
      try {
        commandCharRef.current = await service.getCharacteristic(BLE_COMMAND_CHARACTERISTIC_UUID);
      } catch (cmdErr) {
        commandCharRef.current = null;
        console.warn('Command characteristic not available on this device:', cmdErr);
      }

      bleDeviceRef.current = device;
      setStatus('connected');
      setStatusMessage(`Connected to ${device.name || BLE_DEVICE_NAME}. Waiting for sensor packets...`);
    } catch (err) {
      setStatus('error');
      setStatusMessage(
        (err && err.message) ||
        'Failed to connect over Bluetooth. If the firmware uses different ' +
        'service/characteristic UUIDs, update the constants at the top of ' +
        'src/context/SensorContext.jsx.'
      );
    }
  }, [handleBleNotification, stopStream]);

  // Writes a plain UTF-8 control string to the device's command
  // characteristic (e.g. "PING", "LOCK_BOX", "UNLOCK_BOX", "RED_ON").
  // Returns false (and sets a status message) if nothing is connected yet.
  const sendCommand = useCallback(async (commandText) => {
    if (!commandCharRef.current) {
      setStatusMessage('No device command channel available — connect the ESP32 first.');
      return false;
    }
    try {
      const encoder = new TextEncoder();
      await commandCharRef.current.writeValue(encoder.encode(commandText));
      return true;
    } catch (err) {
      setStatusMessage((err && err.message) || `Failed to send command "${commandText}".`);
      return false;
    }
  }, []);

  const value = {
    connectionMode,
    status,
    statusMessage,
    lastPacket,
    lastPayload,
    lastResponse,
    history,
    connectBluetooth,
    sendCommand,
    stopStream,
    modelMode,
    setModelMode,
    timeAcceleration,
    setTimeAcceleration,
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
