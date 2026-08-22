# SURAKSHA — connected project (backend + frontend)

This folder is the frontend (`FINALFRONT`) and backend (`SURAKSHA`) merged
into one project, with the missing "glue" between them built in:

```
ESP32-S3 (real, or simulated) --BLE--> browser gateway --HTTP POST-->
FastAPI /sensor-data --> features + weather --> ML models -->
spoilage risk + remaining safe time --> React dashboard (live)
```

## What was actually broken, and what changed

The backend (`backend/main.py`) already had a working `/sensor-data`
endpoint that runs features → weather → ML → cold-storage rerouting. The
frontend (`frontend/`), however, was a **fully self-contained demo**: every
number on screen came from a hardcoded `setTimeout` script, and nothing in
the frontend ever called the backend. The two halves had never been wired
together. Specifically, this pass:

1. **Backend — CORS.** Added `CORSMiddleware` to `main.py` so a browser
   running the React app is actually allowed to call the API. Without
   this, every `fetch()` from the frontend would have been silently
   blocked by the browser.
2. **Backend — model version.** Pinned `scikit-learn==1.9.0` in
   `requirements.txt` to match the version the `.pkl` models in
   `models/` were trained with (per the project's own notes).
3. **Frontend — a real API client** (`src/services/apiService.js`,
   `src/config.js`): talks to `/health`, `/sensor-data`,
   `/nearby-facilities`, `/reroute-recommendation`.
4. **Frontend — the missing BLE gateway** (`src/context/SensorContext.jsx`):
   this is the piece described as "not connected yet" in the project
   notes (ESP32 → BLE → FastAPI). It:
   - Converts the ESP32's raw field names (`temp`, `hum`, `g`, `lat`,
     `lng`) into the backend's schema (`temperature`, `humidity`,
     `shock`, `latitude`, `longitude`), fixing exactly the "field
     conversion" gap called out in the project notes.
   - Adds `product_type` (from the product selected in the UI) and a
     real wall-clock `timestamp` (the ESP32's own `ts` field is device
     uptime, not a usable timestamp — this was the other named gap).
   - POSTs every reading to `/sensor-data` automatically and feeds the
     real prediction back into the UI ("live frontend update").
   - Ships **two ways to produce ESP32 packets**, since no physical
     board is available to test against:
     - `startSimulatedStream()` — generates packets in the exact shape
       documented for the firmware (`{id, ts, pkt, temp, hum, lat, lng,
       g, crash, door, alert, ir, buz, ble}`) every 2 seconds (matching
       the real device's BLE notify rate), with a temperature/shock
       drift so the real ML model reacts realistically over time. This
       is what "START SIMULATED ESP32 STREAM" on the Simulation page
       runs — the whole pipeline works today, with no hardware.
     - `connectBluetooth()` — a real Web Bluetooth client for a device
       advertising as `ChillGuard-07`. It's wired and ready; only the
       `BLE_SERVICE_UUID` / `BLE_NOTIFY_CHARACTERISTIC_UUID` constants
       at the top of `SensorContext.jsx` may need updating once you
       have the actual firmware's GATT UUIDs in front of you.
5. **Frontend — live UI wiring** (`src/App.jsx` and friends): the
   dashboard, stat cards, alerts, and the emergency cold-storage
   recommendation now come from the real backend response instead of a
   script. `WeatherPanel` shows the live weather the backend fetched for
   the shipment's GPS position. The old scripted demo timers were
   removed since the real pipeline now produces the same kind of
   escalating scenario, driven by the actual ML model.
6. **Bug fix**: `src/services/routeService.js` was calling
   `router.projectosrm.org` (missing a hyphen) instead of
   `router.project-osrm.org`, so its OSRM route lookups always silently
   fell back to a fake straight-line path. Fixed.

## Running it

### 1. Backend

```
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload
```

Verify it's up: open http://127.0.0.1:8000/health — you should see
`{"status": "ok", ...}`.

The `models/` folder must contain the real `spoilage_risk_model.pkl` and
`remaining_safe_time_model.pkl` (already included in this folder) — the
API will fail to start without them.

### 2. Frontend

```
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (http://127.0.0.1:5174 by default — see
`vite.config.js`). If your backend runs somewhere other than
`http://127.0.0.1:8000`, copy `.env.example` to `.env` and set
`VITE_API_BASE_URL` accordingly.

### 3. Try the live pipeline

1. Log in (any email/password works — this is a mock login).
2. Go to **Simulation**, pick a product category, create a route.
3. Under **C. LIVE ESP32 CONNECTION**, click **START SIMULATED ESP32
   STREAM**. Watch the raw packet / backend prediction readout update
   every 2 seconds. The Dashboard, Alerts, and Weather panels update
   from the same live data.
4. Once the simulated shipment's temperature drifts far enough out of
   range, the real ML model will eventually classify it CRITICAL, which
   triggers the emergency modal and a live, road-routed cold-storage
   recommendation (backend `data/cold_storage_locations.csv`, ~28k
   facilities, + OSRM).

   **To see the extreme/CRITICAL case immediately** instead of waiting
   for the gradual drift, click **TEST: FORCE EXTREME / CRITICAL CASE**.
   It fires ~8 badly out-of-range readings straight at the backend a
   few hundred ms apart. Within a few seconds you should see, in order:
   a SHOCK popup, a TEMPERATURE popup, then the red emergency modal
   ("🚨 CRITICAL COLD-CHAIN EXCURSION"). Click **GO TO EMERGENCY ROUTE**
   on that modal (or open the **Alerts** page directly) to see the live
   cold-storage recommendation with real road distance/ETA.
5. When real ESP32-S3 hardware is flashed and advertising as
   `ChillGuard-07`, click **CONNECT ESP32 VIA BLUETOOTH** instead (Chrome
   or Edge required — Web Bluetooth isn't supported in Safari/Firefox).

## What's still simulated / not wired

Being upfront about scope, so nothing here is mistaken for more finished
than it is:

- **No physical ESP32 hardware was available in this session.** The
  Bluetooth path (`connectBluetooth()`) is real code, but it has not
  been tested against a real board — only against the documented packet
  shape. Its GATT UUIDs are a reasonable placeholder (Nordic UART
  Service convention); update them to match the actual firmware.
- The route map (Chennai↔Bangalore-style city-to-city polylines) is
  still a cosmetic demo geography layer — the truck's position on the
  map is not derived from the live sensor GPS reading, only the
  cold-storage recommendation is. Wiring the map itself to live GPS is a
  reasonable next step but out of scope for this pass.
- `PredictRiskPanel`'s "next 6 hours" chart is still a static decorative
  SVG — the backend does not provide a multi-hour risk forecast, so
  nothing this pass could honestly wire it to. StatCards/Dashboard, by
  contrast, do reflect the live backend prediction.
- `backend/sensor_processor.py` (a `FeatureProcessor` class) is
  unused/superseded by `services/features.py`'s stateful
  `calculate_features()`, which is what `main.py` actually calls. Left
  in place, untouched, in case it's wanted for something else.
- Login/auth and the alert/event log are still `localStorage`-backed
  mocks (as they were before) — there was no request to add real
  auth/persistence, so that wasn't changed.

## Project layout

```
ERROR/
├── backend/           (was SURAKSHA/)
│   ├── main.py         <- CORS added here
│   ├── predict.py       ML prediction pipeline (unchanged)
│   ├── requirements.txt <- scikit-learn version pinned
│   ├── services/         features, weather, cold_storage, routing (unchanged)
│   ├── models/            trained .pkl models + feature_columns.json
│   └── data/               product_profiles.json, cold_storage_locations.csv
└── frontend/          (was FINALFRONT/)
    ├── src/config.js               <- new: backend base URL + product-type map
    ├── src/services/apiService.js  <- new: real backend client
    ├── src/context/SensorContext.jsx <- new: the BLE/simulated gateway
    ├── src/utils/normalizeFacility.js <- new: backend->UI field mapping
    ├── src/App.jsx                 <- rewired to the live pipeline
    ├── src/pages/Simulation.jsx    <- new "Live ESP32 Connection" section
    ├── src/pages/Alerts.jsx, src/components/ColdStorageRecommendation.jsx,
    │   src/components/WeatherPanel.jsx  <- wired to live backend data
    └── src/services/routeService.js  <- OSRM domain typo fixed
```
