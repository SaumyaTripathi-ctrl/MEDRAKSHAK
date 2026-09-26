# SURAKSHA — connected project (backend + frontend)

This folder is the frontend (`FINALFRONT`) and backend (`SURAKSHA`) merged
into one project, wired together and cleaned up for real ESP32-S3 hardware:

```
ESP32-S3 --BLE--> browser gateway --HTTP POST-->
FastAPI /sensor-data --> features + weather --> ML models -->
spoilage risk + remaining safe time --> React dashboard (live)
```

## What this pass changed

The backend (`backend/main.py`) already had a working `/sensor-data`
endpoint that runs features → weather → ML → cold-storage rerouting. This
pass connected it to the frontend and then, once hardware integration
started, removed every piece of demo/testing scaffolding so the shipped
software reflects only real hardware data:

1. **Backend — CORS.** Added `CORSMiddleware` to `main.py` so a browser
   running the React app is allowed to call the API.
2. **Backend — model version.** Pinned `scikit-learn==1.9.0` in
   `requirements.txt` to match the version the `.pkl` models in `models/`
   were trained with.
3. **Frontend — a real API client** (`src/services/apiService.js`,
   `src/config.js`): talks to `/health`, `/sensor-data`,
   `/nearby-facilities`, `/reroute-recommendation`.
4. **Frontend — the BLE gateway** (`src/context/SensorContext.jsx`): the
   piece described as "not connected yet" in the project notes
   (ESP32 → BLE → FastAPI). It:
   - Connects to a real ESP32 over Web Bluetooth (`connectBluetooth()`),
     subscribes to notifications, and reassembles JSON packets that may be
     split across multiple BLE notify events (MTU chunking).
   - Converts the ESP32's raw field names (`temp`, `hum`, `g`, `lat`,
     `lng`) into the backend's schema (`temperature`, `humidity`, `shock`,
     `latitude`, `longitude`).
   - Adds `product_type` (from the product selected in the UI) and a real
     wall-clock `timestamp` (the ESP32's own `ts` field is device uptime,
     not a usable timestamp).
   - POSTs every reading to `/sensor-data` and feeds the real prediction
     back into the UI.
5. **Frontend — live UI wiring.** The dashboard, stat cards, live GPS
   trail map, alerts, and emergency cold-storage recommendation all come
   from the real backend response. Every panel now shows an honest
   "waiting for data" / "not connected" state before the first real
   reading arrives, instead of a placeholder number.
6. **Bug fix**: `src/services/routeService.js` was calling
   `router.projectosrm.org` (missing a hyphen) instead of
   `router.project-osrm.org`. Fixed.
7. **Hardware-integration cleanup (this pass).** Now that real hardware is
   being connected, all demo/testing scaffolding was removed:
   - Removed the simulated ESP32 packet generator
     (`startSimulatedStream()`) and the instant extreme-case test burst
     (`sendExtremeTestBurst()`) from `SensorContext.jsx` — Bluetooth is now
     the only way data enters the system.
   - Removed the city-to-city demo route builder from the Simulation page
     and the `src/data/locations.js` fixed-city dataset it used.
   - Removed the fabricated "Predict Risk (Next 6 Hours)" panel
     (`PredictRiskPanel.jsx`) and the decorative forecast chart in
     `WeatherPanel.jsx` — both were static hardcoded numbers with no real
     data behind them.
   - Removed the hardcoded 13-facility mock cold-storage fallback
     (`src/data/coldStorageLocations.js`) from
     `ColdStorageRecommendation.jsx` — the recommendation panel now only
     ever shows the backend's real, road-routed recommendation, or an
     honest "waiting for a CRITICAL alert" placeholder.
   - Removed the fake per-city weather widget from `TopBar.jsx`.
   - Rebuilt the map/route data model (`RouteContext.jsx`) around the
     shipment's actual GPS trail (`trail`, `truckPosition`) instead of a
     fixed start/end city route, so `ShipmentMap.jsx` and
     `EmergencyRouteMap.jsx` now draw the real path the truck has
     travelled, with a clean empty state before the first GPS fix.
   - `StatCards.jsx` now shows `--` / "NO DATA" instead of hardcoded
     fallback numbers (6.4°C, 54%, 0.32g, etc.) when no shipment is
     connected, and its risk-score card no longer draws a fabricated
     sparkline chart.

   Login remains a `localStorage`-backed mock, unchanged — this cleanup
   was scoped to simulation/demo data only, not authentication.
8. **Demo route + auto-connect.** A "Shipment Route" step was added back to
   the Simulation page (start/end city, OSRM-routed) purely so the map has
   a reference path to draw — creating the route now also triggers the
   real ESP32 Bluetooth connection automatically, in the same click, so
   there's no separate manual "connect" button.
9. **Hardware integration against `HARDWARE_INTEGRATION_SPEC.md`.** With
   the real ChillGuard-07 firmware spec in hand:
   - Replaced the placeholder Nordic-UART-style BLE UUIDs in
     `SensorContext.jsx` with the firmware's real service/characteristic
     UUIDs (see section 4 below).
   - The real 801S vibration sensor is a digital switch (a boolean
     `crash` flag), not an analog accelerometer — there is no `g` field
     to compute a shock magnitude from. `shock` is now derived as a fixed
     representative value when `crash` is true, `0` otherwise.
   - Added the command characteristic (`sendCommand()`), so the app can
     write control strings (`PING`, `LOCK_BOX`, `RED_ON`, etc.) back to
     the device. Only a **PING DEVICE** button is wired up in the UI (it
     makes the board beep twice — a quick pairing sanity check); the lock
     / LED / IR commands are exposed in code but intentionally not wired
     to any button, since those control physical actuators.
   - The firmware also reports lid/tamper duration (`door`, `door_s`) and
     battery level (`bat_pct`), which weren't available before. The app
     now raises a WARNING alert (same popup + log mechanism as
     temperature/shock) when the lid has been open more than 5 seconds or
     battery drops to 15% or below.
10. **Final ESP32-S3 firmware** (`firmware/ChillGuard_Firmware/`). A
    complete, from-scratch `.ino` sketch matching the spec's exact BLE
    contract, pinout, JSON schema, and all 11 commands — see the "Firmware"
    section below.
11. **Backend-driven 3-tier alert LEDs + buzzer.** The board's status LEDs
    (green/blue/red) are driven by the FastAPI backend's ML `risk_level`
    (SAFE/WARNING/CRITICAL) — not an on-device temperature threshold.
    `App.jsx`'s live pipeline sends a new BLE command (`ALERT_SAFE` /
    `ALERT_WARNING` / `ALERT_CRITICAL`) to the board every time the
    backend's classification changes, and the firmware's third LED
    (physically blue on this board, not the spec's white cargo light) lights
    for WARNING while red is CRITICAL and green is SAFE. See "Firmware"
    below for why this is deliberately backend-driven rather than
    on-device, and "What's still worth knowing" for a real gap this
    surfaced in the trained ML model. (The buzzer behavior described here
    was later reworked — see item 12.)
12. **Demo polish: silent-WARNING/latching-CRITICAL buzzer, PCM flap UI,
    demo time acceleration.** Three additive changes, all deliberately
    layered on top of the existing pipeline without touching prediction
    logic, feature engineering, or the LED tier logic in item 11:
    - **Buzzer rework.** WARNING no longer sounds the buzzer at all — that
      tier is carried by the blue LED alone now. CRITICAL still beeps
      continuously, but it's now a **latching alarm**: it keeps sounding
      even if the reading recovers, until a person presses the new
      **ACKNOWLEDGE** button (shown on the critical popup and on the
      Alerts emergency page), which sends a new `ACK_CRITICAL` BLE command.
      A fresh CRITICAL episode re-arms the latch automatically. The LEDs
      and `externalAlertLevel` are completely unaffected by acknowledgment
      — only the sound is latched. See `criticalAlertAcknowledged` in the
      firmware and `handleAcknowledgeCritical()` in `App.jsx`.
    - **PCM flap status UI.** A new "PCM COOLING FLAP" indicator
      (`src/components/PcmFlapStatus.jsx`) shows whether the physical PCM
      (Phase Change Material) cooling flap is OPEN and coolant is
      ACTIVATED — the hardware's cooling novelty, deliberately kept as its
      own distinct box rather than folded into existing cards. It's on the
      Dashboard (above the weather panel), the CRITICAL popup, and the
      Alerts emergency page. It reuses the *same* `cooling_required`
      signal the app already computed (no new backend/firmware field was
      added) so it can't drift from or break the existing cooling logic.
    - **Demo time acceleration.** A "TIME ACCELERATION" control (1×/5×/
      10×/20×) on the Simulation page speeds up the simulated clock fed
      into the backend's duration-weighted ramp calculation, so a WARNING
      → CRITICAL escalation that would otherwise take real minutes can be
      shown in seconds during a live demo. This does **not** touch GPS or
      require one — `convertAndSend()`'s `timestamp` was already the
      browser's own wall-clock time, never GPS-derived, so there was no
      real classroom/indoor blocker to begin with; the control just lets
      that clock run faster on purpose. See `timeAccelRef`/
      `simulatedClockRef` in `SensorContext.jsx`.

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

### 3. Connect the real ESP32

1. Log in (any email/password works — this is a mock login).
2. Flash and power on the ESP32-S3 so it's advertising as `ChillGuard-07`.
3. Go to **Simulation**, pick the product category being shipped, enter a
   start/destination city, then click **SET ROUTE & CONNECT** (Chrome or
   Edge required — Web Bluetooth isn't supported in Safari/Firefox — and
   the page must be served from `http://127.0.0.1` or `https`). This does
   two things at once: it opens the browser's Bluetooth device picker —
   choose `ChillGuard-07` — and builds the reference route on the map.
4. Once connected, every BLE telemetry packet (pushed by the firmware
   every ~2s) is converted and sent to the backend automatically. The
   Dashboard, Alerts, and Weather panels update from the real prediction
   as readings come in, and the live map draws the shipment's actual GPS
   trail on top of the planned route.
5. If the ML model classifies a reading CRITICAL, the emergency modal
   fires and the **Alerts** page shows a live, road-routed cold-storage
   recommendation (backend `data/cold_storage_locations.csv`, ~28k
   facilities, + OSRM) based on the shipment's real position. A sustained
   open lid (>5s) or low battery (≤15%) also raises a WARNING alert.
6. **DEVICE STATUS** on the Simulation page shows the live connection
   state, the raw packet last received, and the backend's last
   prediction — useful for confirming the pairing actually works. Click
   **PING DEVICE** any time to make the board beep twice as a sanity
   check, or **DISCONNECT** to end the session.

### 4. BLE contract (confirmed against `HARDWARE_INTEGRATION_SPEC.md`)

`SensorContext.jsx` now uses the ChillGuard-07 firmware's real values —
nothing left to fill in:

```js
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_TELEMETRY_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // NOTIFY/READ
const BLE_COMMAND_CHARACTERISTIC_UUID = '1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e'; // WRITE
```

If a firmware revision ever changes these `#define`s, update the three
constants at the top of `src/context/SensorContext.jsx` to match — the
rest of the pipeline (packet parsing, MTU-chunk reassembly, field
conversion, POST to `/sensor-data`) doesn't need to change.

## Firmware

`firmware/ChillGuard_Firmware/ChillGuard_Firmware.ino` is the sketch for the
ESP32-S3 edge unit (board: ESP32S3 Dev Module, USB CDC On Boot: Enabled;
requires Arduino-ESP32 core >= 3.0.0 and the "DHT sensor library" +
"TinyGPSPlus" libraries — see the header comment in the file for exact
details and version caveats). It's built on the fuller "Master Production
Firmware" sketch (BLE GATT server, all sensors/actuators in the pinout
table, all 11 documented commands, autonomous IR cool-boost + LED state
machine + motor-failure detection per the spec's rule engine), with three
compatibility fixes applied against the already-built frontend/backend:

1. **`BLEDevice::setMTU(517)`** added in `setup()`. Without it the ATT MTU
   stays at the ESP-IDF default of 23 bytes (~20 usable), but the telemetry
   JSON here is ~290-320 bytes. A GATT notification is a single
   unacknowledged packet capped at MTU-3 bytes — unlike a long read, it is
   NOT automatically split and reassembled — so every `notify()` would have
   been silently truncated on the wire, `JSON.parse()` would fail on every
   packet in the browser, and the dashboard would show a successful BLE
   pairing but no live data, ever. This was the one fix that mattered most.
2. **Real GPS-derived Unix epoch** for the `ts` field, via Howard Hinnant's
   `days_from_civil` algorithm on the GPS's UTC date/time, replacing a
   no-op ternary that always fell back to uptime regardless of GPS fix
   validity. Not a pipeline blocker either way — the frontend ignores `ts`
   and stamps its own wall-clock timestamp — just makes the field honest.
3. **Servo latch now driven by continuous LEDC hardware PWM** instead of a
   blocking bit-banged pulse loop. The old version pulsed the servo for
   ~500ms per `LOCK_BOX`/`UNLOCK_BOX` command and then stopped — SG90s need
   a continuously refreshed ~50Hz pulse to actively hold torque at a
   commanded angle, so the arm could drift under load (spring latch,
   vibration) once the pulses stopped, and the 500ms blocking loop also sat
   inside the BLE command callback on every lock/unlock. LEDC keeps
   generating the pulse train on its own after one `ledcWrite()` call.

**Not verified against physical hardware or compiled in this session** (no
Arduino toolchain here) — test-compile it against your installed core and
library versions before flashing. Two spots are flagged inline as
version-sensitive: the pin-based `ledcAttach()`/`ledcWrite(pin, duty)` API
(needs core ≥ 3.0.0; older cores need the channel-based `ledcSetup`/
`ledcAttachPin` API instead), and `CommandCB::onWrite()`'s single-argument
signature (the NimBLE-Arduino fork, if used instead of the core's own BLE
library, expects a second connection-info argument). The IR blaster's NEC
timing/burst pattern is standard, but it's a generic burst rather than a
command captured from the cargo unit's actual A/C remote — worth confirming
`IR_COOL_UP`/`IR_COOL_DOWN` actually control your specific refrigeration
unit once you're testing against real hardware.

### 3-tier alert LEDs + buzzer (green/blue/red)

The board's third LED is physically **blue** on this build (the spec's
pinout table calls it a white cargo light — that part doesn't apply here).
It's dedicated to a 3-tier alert display: green = SAFE, blue = WARNING, red
= CRITICAL. WARNING is silent — the blue LED alone carries that tier, no
buzzer. CRITICAL beeps **continuously**, and it's a *latching* alarm: it
keeps beeping even if the reading later drops out of CRITICAL, until a
person sends `ACK_CRITICAL` (the app's "ACKNOWLEDGE" button on the critical
popup / Alerts emergency page does this). A fresh CRITICAL episode
automatically re-arms the latch. `ACK_CRITICAL` only silences the *sound* —
the red LED itself never depends on it, it always tracks
`externalAlertLevel==3` live (see `criticalAlertAcknowledged` and
`CommandCB::onWrite()` in the firmware). The LED tier itself is driven by
the **backend's ML `risk_level`**, pushed from
`App.jsx` over BLE as `ALERT_SAFE` / `ALERT_WARNING` / `ALERT_CRITICAL`
every time the classification changes — deliberately not computed from the
board's own raw temperature threshold. `updateLEDs()` in the firmware makes
this the authoritative source for the LEDs once at least one classification
has arrived; before that (freshly booted, not yet paired) it idles at green
while connected rather than guessing.

Two more pieces layer on top of that base tier, both about how a light is
*acknowledged or held*, not about how the tier itself is decided:

- **WARNING has its own acknowledge, and it DOES affect the LED** (unlike
  `ACK_CRITICAL` above). Pressing "Acknowledge & Close" on the app's warning
  popup (`AlertPopup.jsx` — the one raised on a raw SHOCK/TEMPERATURE/DOOR
  excursion) sends a new `ACK_WARNING` command. The firmware's
  `warningAlertAcknowledged` flag then makes `updateLEDs()` show green
  instead of blue for the rest of that WARNING episode. This can only ever
  *downgrade* the light, never mask a worse one: if the reading escalates to
  CRITICAL while acknowledged, red takes over immediately and
  unconditionally — see the `showCritical`/`showWarning`/`showSafe` logic
  in `updateLEDs()`. A fresh entry into WARNING (from SAFE or CRITICAL)
  automatically re-arms it, same pattern as `criticalAlertAcknowledged`.
- **CRITICAL recovery is held, not instant.** Rather than dropping the red
  LED the moment a single reading comes back in range, `App.jsx` holds the
  device latched at CRITICAL for `CRITICAL_RECOVERY_HOLD_SECONDS` (15s) of
  *sustained* non-CRITICAL readings before it actually sends the downgrade
  command — a borderline reading right after a spike doesn't flicker the
  light, and any CRITICAL reading during the hold cancels it and restarts
  the countdown. The hold is measured on the demo's simulated clock (the
  same one TIME ACCELERATION speeds up), not real wall-clock time, so it
  compresses right along with the ramp when accelerated. `coolingActive` is
  also forced true for the whole hold (even once the backend's
  `cooling_required` has already gone false), so the PCM flap / coolant
  indicator (see below) stays visibly ON right up to the moment the light
  actually turns green, not before. This logic lives entirely in `App.jsx`
  (`criticalRecoveryStartRef`, `wasLatchedCritical`) — the firmware just
  renders whatever `ALERT_*` it's told, same as always.

That "backend, not on-device" choice has a real consequence worth knowing
up front: the trained `spoilage_risk_model.pkl` puts about 91% of its
decision weight on `cumulative_temp_exposure` (deviation × minutes
accumulated), a feature that's near-zero for the first several minutes of
*any* shipment no matter how far out of range the temperature is — because
the training dataset (`suraksha_dataset_corrected.csv`) has zero examples
anywhere in its 30,000 rows of a large deviation (>15°C) paired with a
short excursion (<20 minutes); every large-deviation row in training got
there by drifting gradually over 2.5+ hours. So on a bench test with no
active cooling, expect roughly WARNING immediately and CRITICAL only after
about 15 minutes at a big deviation — that's the model working as trained,
not a bug, but it means the blue→red transition will feel slow in a short
demo. If you want a faster demo reaction, the options are: retrain on data
that includes short-duration/large-deviation examples, add a rule-based
override in `predict.py` for extreme instantaneous deviations, or drive the
LEDs from the board's own instant threshold instead (which was the other
option on the table — this build uses the backend as you asked).

### Per-shipment state reset (`POST /reset-shipment/{shipment_id}`)

Found and fixed a real bug this pass: `calculate_features()` keeps
per-shipment ML state (`cumulative_temp_exposure`, `time_outside_temp_range`,
`max_temp_deviation`, `temperature_excursion_count`) in a dict keyed only by
`shipment_id` — and the frontend always reuses the same constant
`DEFAULT_SHIPMENT_ID` ("CG-TRUCK-07") for every run, regardless of which
product category is selected. Nothing ever cleared that state between runs,
so a Vaccine test (tight 2-8°C range, likely run at room temperature and
therefore accumulating a large excursion) would leave that accumulated
exposure sitting there, and a Room-Temperature Medicine test started
afterward (loose 15-25°C range) inherited it — producing a CRITICAL
prediction almost immediately from a reading only ~0.2°C outside its own
much wider range, which is exactly the "25.2°C shouldn't be CRITICAL" bug
this session ran into.

Fixed with a new `POST /reset-shipment/{shipment_id}` endpoint
(`main.py` → `services/features.py`'s new `reset_state()`), called from
`App.jsx`'s `handleConnectDevice()` at the start of every connection
attempt — fire-and-forget, so it doesn't block or delay the BLE connect.
Every new "SET ROUTE & CONNECT" now starts the backend's ML state clean,
regardless of what the previous run (or product category) left behind.

### Battery ADC smoothing — and the low-battery popup was removed

`readBatteryVolts()` used to take a single raw `analogRead()` per 2-second
cycle. The ESP32's ADC is known-noisy on an unfiltered pin, and actuator
current spikes (the IR blaster firing, the servo moving) can genuinely sag
the rail for a moment too — either way, one bad sample was enough to read
as e.g. 9% and fire a real LOW BATTERY popup even though the battery was
fine moments before and after. `readBatteryVolts()` now averages 16 raw
samples per call and blends that into a running average across cycles, so
a single noisy or sagged sample can't trigger a false alert on its own.

That smoothing fix wasn't enough on its own, though — testing afterward
still showed a false alert, this time from a reading of `v_bat: 2.57` /
`bat_pct: 0` sitting steady for many consecutive cycles (not a one-sample
spike). A steady-but-wrong reading like that points to something the
averaging can't fix: either a genuine hardware issue (a loose battery
connector — plausible during the shake-test demo action — or a battery
that's actually degraded), or `readBatteryVolts()`'s assumption of an
exact 10kΩ+10kΩ (×2.0) voltage divider not matching the board's actual
divider resistors. Since neither can be confirmed without physically
measuring the board, and the ask was to stop the alert outright rather
than keep chasing calibration blind: **the low-battery popup and its log
entry have been removed from `App.jsx`** (see the comment left in its
place). `v_bat` / `bat_pct` are still reported in every telemetry packet
and visible on the Simulation page's DEVICE STATUS → LAST RAW ESP32 PACKET
panel, so the raw numbers are still there to look at — they just no longer
interrupt anything. If you want the alert back once the reading itself is
trustworthy (measure the actual divider resistors with a multimeter and
fix the `× 2.0` in `readBatteryVolts()` if it's off), reintroduce a
`bat_pct <= threshold` check where the comment marks its old location.

### Dual model system: REAL vs. DEMO (live-switchable)

The 91%-on-`cumulative_temp_exposure` behaviour described above is correct
for real shipments, but it also means the real model can't produce a
believable SAFE → WARNING → CRITICAL progression in a short live
demonstration, because a bench test can only realistically produce ambient
temperature drift (~20-35°C) or lid-open/shake events, not a real hours-long
excursion. Rather than compromise the real model's accuracy, there are now
**two independent model pairs**, selectable per-request:

- **REAL** (`spoilage_risk_model.pkl` / `remaining_safe_time_model.pkl`) —
  unchanged, trained on `suraksha_dataset_corrected.csv`, deviation-and-time
  (duration-dominant) escalation. Use this for anything meant to represent
  an actual shipment.
- **DEMO** (`demo_spoilage_risk_model.pkl` / `demo_remaining_safe_time_model.pkl`)
  — trained on a synthetic dataset (`backend/data/suraksha_dataset_demo.csv`,
  generated by `backend/scripts/generate_demo_dataset.py`) built from short
  ambient-only trajectories, run through the exact same
  `services/features.calculate_features()` the live backend uses (so the
  engineered features are computed identically — only the *label* differs),
  and labeled with a fast, deviation-dominant severity curve
  (`100 * (1 - exp(-max_temp_deviation / 3.2))`, ramped in over roughly the
  first 60–90 seconds outside range). This reaches WARNING/CRITICAL within
  seconds to about two minutes from an achievable ambient swing — meant
  **only** for demonstrations, never for a real shipment.

  **Retuned once already:** the first version of this formula also
  multiplied risk by 0.85 the moment `cooling_status` flipped to 1 (meant
  to mirror "active cooling eased the risk"), which in a hand-held demo —
  where nothing is actually cooling the box — put an artificial ceiling on
  how high risk could climb once temperature first exceeded range. That's
  why an early test (25.7°C against a 15-25°C room-temp-medicine range,
  sustained ~3 minutes) only ever reached low-to-mid WARNING and never
  CRITICAL. The multiplier is now removed, and the severity divisor was
  tightened from 4.0 to 3.2. Retrained and verified against synthetic
  scenarios, room-temperature-medicine (15-25°C range) now runs roughly:
  resting in-range → **SAFE**; 26-28°C sustained a few tens of seconds →
  **WARNING**; 29°C+ sustained about a minute → **CRITICAL**. A cold-chain
  product (vaccine/refrigerated, 2-8°C range) hits CRITICAL almost
  immediately at any room temperature, since the deviation is already huge
  — a reliable way to show the top tier fast if the room-temp category
  isn't cooperating live.

  **Retuned a second time — the real bug behind "LED stuck on red/blue,
  buzzer won't stop":** the formula above (both versions) computed
  severity from `max_temp_deviation` — the WORST deviation seen at any
  point in the shipment so far. That feature is monotonically
  non-decreasing for the life of a shipment (see
  `services/features.py::calculate_features`) — it only ever grows, never
  shrinks, even after the temperature recovers. That's the correct
  behaviour for the REAL model (a vaccine that got too hot once is spoiled
  for good; it doesn't become "safe" again because it cooled back down),
  but it's exactly backwards for a live DEMO, where the whole point is
  showing the LED recover as the presenter fixes the condition. With
  `max_temp_deviation` driving it, the backend kept reporting whatever the
  worst tier reached was, forever — hence the LED never stepping back down
  from red to blue or blue to green, and the CRITICAL buzzer refusing to
  stop even after the box was back in a safe state. **Fixed:** the demo
  formula now uses `temperature_deviation` — the CURRENT reading's
  deviation, which drops to 0 the instant the temperature is back in
  range. Verified with a scripted excursion-then-recovery test (30 room-
  temperature-medicine readings pushed to 32°C, then 30 readings back at
  20°C): risk climbed SAFE → WARNING → CRITICAL by about 30 seconds in,
  then dropped straight back to SAFE (0.00) on the very next reading once
  temperature returned to range. The REAL model is untouched by this —
  it's still meant to score a shipment's worst excursion, which is correct
  for production.

**How it's selected:** `predict.py`'s `predict(sensor_data, mode="real")`
loads whichever pair `mode` names ("demo" falls back to "real" if the demo
`.pkl` files aren't present, so an older deployment degrades gracefully
instead of crashing). `main.py`'s `SensorData` model carries a new
`model_mode: str = "real"` field, threaded straight through from each
`/sensor-data` POST body, and echoed back in the response's
`shipment.model_mode` and `prediction.model_mode` so it's obvious after the
fact which model produced a given reading.

**Switching it live:** `SensorContext.jsx` holds the current mode in a ref
(`modelModeRef`, mirrored into React state as `modelMode` for display) and
exposes `setModelMode('real' | 'demo')` through the context. The Simulation
page's new **"C. PREDICTION MODEL"** section is a two-button toggle
(REAL MODEL / DEMO MODE) with an "ACTIVE: …" pill showing the current mode
— switching it takes effect on the *next* reading, with no BLE reconnect or
page reload required, so you can flip it mid-demo.

**Regenerating the demo dataset/models:** if you want to retune the demo
reaction speed or add more synthetic trajectory variety, edit
`backend/scripts/generate_demo_dataset.py` (see `demo_risk_and_safe_time()`
for the label formula and `AMBIENT_MIN_C` / `AMBIENT_MAX_C` for the assumed
achievable temperature band) and re-run it from the `backend/` directory:
```bash
pip install pandas numpy scikit-learn==1.9.0 joblib
python scripts/generate_demo_dataset.py
```
It regenerates `data/suraksha_dataset_demo.csv` and overwrites both
`models/demo_*.pkl` files in place. Restart the backend afterward so it
picks up the new pickles.

### Cold-storage reroute reliability (was hammering the public OSRM API)

The emergency reroute recommendation (facility search + road-routed ETA)
used to be recomputed from scratch on **every single `/sensor-data`
reading while `risk_level == "CRITICAL"`** — i.e. once every ~2 seconds
for as long as the CRITICAL episode lasted, each time firing off up to 5
live network calls to the public OSRM demo server
(`router.project-osrm.org`, a shared, rate-limited instance meant for
light/occasional use). The very first CRITICAL reading usually succeeded
(which is why the feature could look like it was working), but repeated
hammering every 2 seconds after that got throttled or timed out — which
is what "the reroute feature isn't working" actually was. Three fixes,
all in the backend:

- **`main.py`** now caches the cold-storage recommendation per
  `shipment_id` and only recomputes it once every `COLD_STORAGE_CACHE_SECONDS`
  (30s by default) — every other CRITICAL reading in between reuses the
  cached recommendation. The rest of the response (temperature, risk
  score, etc.) still updates every single reading; only the expensive
  facility/routing lookup is throttled. The cache is cleared whenever risk
  drops out of CRITICAL (so the next episode computes fresh, not stale
  data) and on `/reset-shipment`.
- **`services/routing.py`**: `rank_facilities_by_route()` used to call
  OSRM once per candidate facility (up to 5) *sequentially*, each with a
  10-second timeout — worst case, 50 seconds before a response. It now
  routes all candidates concurrently (`ThreadPoolExecutor`), and the
  per-call timeout is down to 4 seconds, so one slow/unreachable OSRM call
  no longer stalls the rest.
- **`services/cold_storage.py`**: the ~28,000-row facility CSV was being
  re-read from disk on every single call (`find_nearest_facilities`,
  `find_suitable_facilities`). It's now loaded once at first use and
  cached in memory for the life of the process.

Verified with a scripted test (`fastapi.testclient`, OSRM calls stubbed
out): 20 readings spanning a sustained CRITICAL episode (~40 seconds)
triggered the facility/routing lookup only **once**, versus roughly 6
times under the old per-reading behaviour over that same span — and the
gap widens the longer an episode runs. If OSRM itself is genuinely
unreachable from your network, `get_route()` still falls back to a
straight-line Haversine distance estimate (`routing_source: "fallback"`
in the response) rather than failing outright.

## What's still worth knowing

- **This was not tested against a physical ESP32-S3 board in this
  session** — `connectBluetooth()` is a standards-compliant Web Bluetooth
  client written against `HARDWARE_INTEGRATION_SPEC.md`'s exact telemetry
  schema (`{id, ts, pkt, temp, hum, t_rate, h_rate, lat, lng, spd, dist,
  crash, door, door_s, lock, v_bat, bat_pct, led_mode, alert, up, buf,
  ble}`), but the first real pairing is still worth watching closely.
- The firmware's `ts` field is device uptime (`millis()/1000`), not a
  real epoch, despite the spec's field dictionary labeling it "Unix
  Epoch" — there's no RTC or NTP sync on the board. The app ignores it and
  stamps its own wall-clock `timestamp` when a reading is received, same
  as before.
- `spd` (GPS speed) and `dist` (ultrasonic cargo clearance) are already
  visible in the raw packet dump on the Simulation page but aren't wired
  into any dashboard card or alert yet — no threshold for either was
  specified, so nothing was invented.
- `backend/sensor_processor.py` (a `FeatureProcessor` class) is
  unused/superseded by `services/features.py`'s stateful
  `calculate_features()`, which is what `main.py` actually calls. Left in
  place, untouched, in case it's wanted for something else.
- Login/auth and the alert/event log are still `localStorage`-backed
  mocks — out of scope for this cleanup, left as-is intentionally.

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
├── firmware/
│   └── ChillGuard_Firmware/
│       └── ChillGuard_Firmware.ino   <- final ESP32-S3 sketch (Arduino IDE
│                                         needs the sketch in a same-named folder)
└── frontend/          (was FINALFRONT/)
    ├── src/config.js                   backend base URL, product-type map, BLE device name
    ├── src/services/apiService.js      real backend client
    ├── src/services/routeService.js    OSRM road-routing (emergency detour only)
    ├── src/context/SensorContext.jsx   the BLE gateway (real hardware only)
    ├── src/context/RouteContext.jsx    live GPS trail state
    ├── src/utils/normalizeFacility.js  backend -> UI field mapping
    ├── src/App.jsx                     live pipeline wiring + ack/PCM/time-accel state
    ├── src/pages/Simulation.jsx        product selection + BLE connect + time acceleration UI
    ├── src/pages/Dashboard.jsx         PCM flap status box above the weather panel
    ├── src/components/PcmFlapStatus.jsx <- new: PCM cooling flap / coolant UI (novelty)
    ├── src/components/EmergencyModal.jsx <- CRITICAL popup: PCM flap + ACKNOWLEDGE button
    ├── src/pages/Alerts.jsx, src/components/ColdStorageRecommendation.jsx,
    │   src/components/WeatherPanel.jsx, src/components/ShipmentMap.jsx,
    │   src/components/EmergencyRouteMap.jsx  <- all live-data only, no mocks
    └── src/components/TopBar.jsx, StatCards.jsx  <- fabricated data removed
```
