/*
 * ==============================================================================
 * ChillGuard — Master Production Firmware (Generated from HARDWARE_INTEGRATION_SPEC.md)
 * ==============================================================================
 *
 * Target Board: ESP32S3 Dev Module | USB CDC On Boot: Enabled
 *
 * Hardware Peripherals & Pinout:
 *   - DHT22 (Chamber Temp & Humidity)   -> GPIO 4
 *   - HW-201 IR (Box Lid / Anti-Tamper) -> GPIO 5
 *   - 38kHz IR Transmitter (Cooling)    -> GPIO 6
 *   - Active Audio Buzzer Alarm         -> GPIO 7
 *   - HC-SR04 Ultrasonic (Cargo Clear)  -> TRIG: GPIO 10, ECHO: GPIO 11
 *   - 801S Shock Sensor (Crash Detect)  -> GPIO 13 (Hardware Interrupt)
 *   - NEO-6M GPS Module (UART1)         -> RX: GPIO 17, TX: GPIO 18
 *   - SG90 Servo (Smart Box Lock Latch) -> GPIO 21
 *   - 🔴 Red LED   (CRITICAL alert tier) -> GPIO 38
 *   - 🟢 Green LED (SAFE alert tier)     -> GPIO 39
 *   - 🔵 Blue LED  (WARNING alert tier)  -> GPIO 40
 *   - Battery Voltage ADC Monitor       -> GPIO 1
 *
 * Libraries Required (Install in Arduino Library Manager):
 *   - "DHT sensor library" by Adafruit
 *   - "TinyGPSPlus" by Mikal Hart
 *   (BLEDevice/BLEServer/BLEUtils/BLE2902 ship with the ESP32 Arduino core —
 *   nothing extra to install for those. No servo library needed — the latch
 *   is driven via the core's own LEDC hardware PWM, same as the IR blaster.)
 *
 * Requires Arduino-ESP32 core >= 3.0.0 (uses the pin-based ledcAttach()/
 * ledcWrite(pin, duty) API for both the servo latch and the IR blaster —
 * older cores need the channel-based ledcSetup()/ledcAttachPin() API instead).
 *
 * --- Fixes applied in this pass (compatibility review against the already
 *     built frontend/backend) ---
 *   1. BLEDevice::setMTU(517) added in setup(). Without it, the ATT MTU
 *      stays at the ESP-IDF default of 23 bytes (~20 usable), but this
 *      firmware's telemetry JSON is ~290-320 bytes. A GATT notification is
 *      a single unacknowledged packet capped at MTU-3 bytes — unlike a
 *      long read, it is NOT automatically split and reassembled — so every
 *      notify() would have been silently truncated on the wire, the
 *      browser's JSON.parse() would fail on every packet, and no telemetry
 *      would ever reach the dashboard despite a successful BLE pairing.
 *   2. epochTime's ternary was a no-op (`gps.time.isValid() ? (now/1000) :
 *      (now/1000)` — both branches identical, always falling back to
 *      uptime). Replaced with a real GPS-derived Unix epoch via Howard
 *      Hinnant's days_from_civil algorithm, falling back to uptime only
 *      when there's no valid GPS date/time fix yet. (Not a pipeline
 *      blocker either way — the frontend ignores `ts` and stamps its own
 *      wall-clock timestamp — but it makes the field honest.)
 *   3. setServoAngle() now drives the latch through LEDC (continuous
 *      hardware PWM), not a blocking bit-banged pulse loop. The old
 *      version only pulsed the servo for ~500ms and then stopped — SG90s
 *      need a continuously refreshed ~50Hz pulse to actively hold torque
 *      at a commanded angle, so the arm could drift under load (spring
 *      latch, vibration) once the pulses stopped. LEDC keeps outputting
 *      the pulse train on its own after a single ledcWrite() call, so the
 *      latch holds position, and it also stops blocking the BLE command
 *      callback for half a second on every LOCK_BOX/UNLOCK_BOX.
 *
 * --- Feature added: backend-driven 3-tier alert LEDs + buzzer ---
 *   The third status LED on this board is physically BLUE (there is no
 *   separate white cargo-light LED on this build), so it's now dedicated
 *   to the alert display: 🟢 green = SAFE, 🔵 blue = WARNING, 🔴 red =
 *   CRITICAL. The tier is decided by the FastAPI backend's trained ML
 *   model (spoilage_risk -> risk_level), not by an on-device temperature
 *   threshold — the app sends it over BLE as a new command the moment the
 *   backend's classification changes: "ALERT_SAFE", "ALERT_WARNING", or
 *   "ALERT_CRITICAL". See CommandCB::onWrite() and updateLEDs() below.
 *   The old WHITE_ON/WHITE_OFF manual commands are renamed BLUE_ON/BLUE_OFF
 *   to match — if you're sending those from anywhere else, update the string.
 *
 * --- Feature added: silent WARNING / latching CRITICAL buzzer + ACK_CRITICAL ---
 *   The buzzer no longer sounds for WARNING at all — that tier is carried
 *   by the LEDs alone (see above). CRITICAL beeps CONTINUOUSLY for as long
 *   as the tier stays CRITICAL, AND keeps beeping even after the tier
 *   drops back to WARNING/SAFE, until a human sends the new "ACK_CRITICAL"
 *   BLE command — a deliberate latching alarm so a real excursion can't be
 *   missed just because the reading recovered a moment later. Entering a
 *   fresh "ALERT_CRITICAL" clears the acknowledgment again, so the next
 *   critical episode still sounds from scratch. See criticalAlertAcknowledged,
 *   CommandCB::onWrite(), and the buzzer block in buildTelemetryJson().
 *   ACK_CRITICAL is decoupled from the RED LED specifically — red always
 *   tracks externalAlertLevel==3 in real time regardless of acknowledgment,
 *   only the sound is latched for CRITICAL. (The blue WARNING LED has its
 *   own, separate ack — see the next section.)
 *   Handled non-blockingly in buildTelemetryJson() so it doesn't stall BLE/
 *   telemetry the way a delay()-based beep would.
 *
 * --- Feature added: WARNING-LED acknowledge + CRITICAL recovery hold ---
 *   Two more pieces of the same alert LEDs, both about not flip-flopping
 *   the lights too eagerly:
 *   - The blue WARNING LED can now be acknowledged too — a human pressing
 *     "Acknowledge & Close" on the app's warning popup sends "ACK_WARNING",
 *     which makes updateLEDs() show green instead of blue for the REST of
 *     that warning episode (warningAlertAcknowledged). A fresh WARNING
 *     entry (from SAFE or CRITICAL) always re-arms it. Acknowledgment can
 *     only ever downgrade a lesser tier's light (WARNING -> shown-as-SAFE);
 *     it can NEVER mask CRITICAL — if the reading escalates to CRITICAL
 *     while WARNING is acknowledged, red takes over unconditionally.
 *   - CRITICAL itself doesn't need a click: once a reading clears out of
 *     CRITICAL, the app HOLDS the tier at CRITICAL (keeps sending nothing,
 *     the board keeps showing red) for a short recovery window — long
 *     enough to confirm it's a real recovery, not one borderline reading —
 *     during which the PCM flap / coolant UI stays shown as active. Only
 *     after the hold elapses does the app send the actual downgrade
 *     command. This firmware doesn't do that timing itself — it just
 *     renders whatever ALERT_* it's told, same as always; the hold lives
 *     in App.jsx (CRITICAL_RECOVERY_HOLD_SECONDS), measured on the demo's
 *     simulated clock so it compresses right along with TIME ACCELERATION.
 *
 * --- Fix: battery ADC noise/sag causing false LOW BATTERY alerts ---
 *   readBatteryVolts() previously took one raw analogRead() per 2s cycle.
 *   The ESP32's ADC is known-noisy on an unfiltered pin, and a real
 *   voltage sag from an actuator current spike (e.g. the IR blaster
 *   firing) can briefly pull the rail down too — either way, one bad
 *   sample was enough to read as e.g. 9% and fire a real LOW BATTERY
 *   popup on the dashboard even though the battery was fine moments
 *   later. Now averages BATTERY_ADC_SAMPLES raw reads per call and blends
 *   that into a running average across cycles.
 * ==============================================================================
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>
#include <TinyGPSPlus.h>
// ==============================================================================
// 1. BLE 5.0 UUIDs & Parameters (from Spec Section 3)
// ==============================================================================
#define SERVICE_UUID      "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SENSOR_CHAR_UUID  "beb5483e-36e1-4688-b7f5-ea07361b26a8"  // Telemetry Notify
#define COMMAND_CHAR_UUID "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e"  // Command Write
// ==============================================================================
// 2. Hardware Pin Definitions (from Spec Section 2)
// ==============================================================================
#define DHT22_PIN         4
#define HW201_LID_PIN     5
#define IR_BLASTER_PIN    6
#define BUZZER_PIN        7
#define TRIG_PIN          10
#define ECHO_PIN          11
#define VIB_801S_PIN      13
#define GPS_RX_PIN        17
#define GPS_TX_PIN        18
#define SERVO_PIN         21
#define RED_LED_PIN       38
#define GREEN_LED_PIN     39
#define BLUE_LED_PIN      40   // physically blue on this board — WARNING alert tier
#define BATTERY_ADC_PIN   1
// ==============================================================================
// 3. Actuator Configuration (PWM & Carrier Frequencies)
// ==============================================================================
#define IR_PWM_FREQ       38000
#define IR_PWM_RES        8
#define IR_PWM_DUTY       85
// Servo latch — 50Hz hardware PWM via LEDC (fix #3 above), 16-bit duty
// resolution so a 500-2400us pulse width maps cleanly onto a 20ms period.
#define SERVO_PWM_FREQ    50
#define SERVO_PWM_RES     16
// Buzzer for the backend-driven alert tiers, handled non-blockingly in
// buildTelemetryJson(): WARNING is silent (LEDs alone carry that tier) —
// CRITICAL beeps continuously, and unlike a normal alert it does NOT stop
// on its own once the tier clears. It's a latching alarm: it keeps
// sounding until an explicit "ACK_CRITICAL" command is received (see
// CommandCB::onWrite() and criticalAlertAcknowledged below), and re-arms
// itself the next time a FRESH CRITICAL episode begins.
// Number of ADC samples averaged per battery reading (see
// readBatteryVolts()) — smooths out ESP32 ADC noise and brief voltage sag
// from actuator current spikes (e.g. the IR blaster firing) so a single
// noisy sample can't fire a false LOW BATTERY alert on its own.
#define BATTERY_ADC_SAMPLES 16
// Shock/crash detection window — deliberately its OWN fixed window,
// independent of the telemetry send interval (see lastSendTime). It used
// to be tied to that interval (vibrationCounter was accumulated and reset
// once per buildTelemetryJson() call), so when the telemetry cadence was
// sped up from 2000ms to 500ms, the window a real shake had to land in
// shrank by 4x too -- requiring the same >3 pulses in a quarter of the
// time, which is why the SHOCK reading stopped triggering on an ordinary
// hand-shake test. Keeping this window fixed at 1000ms regardless of how
// often telemetry is sent keeps shake-sensitivity consistent.
#define VIBRATION_WINDOW_MS 1000
// Minimum vibration pulses inside one VIBRATION_WINDOW_MS window to count
// as a shock. Was hard-coded as "> 3" (i.e. needs 4+ RISING edges), tuned
// for a module that free-runs many bounce pulses per knock. On a real
// 801S/SW-420 board a single sharp tap often produces only one or two
// clean transitions once the onboard comparator settles, so requiring 4
// could still miss an ordinary hand-shake even with the window fix above
// and even after reflashing -- lowered to 2 to make a live demo shake
// reliably register. Raise this back up if it ends up too sensitive to
// ambient vehicle vibration once tested on the real board.
#define VIBRATION_PULSE_THRESHOLD 2
// ==============================================================================
// 4. Global Objects
// ==============================================================================
DHT dht(DHT22_PIN, DHT22);
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
BLEServer*         pServer      = NULL;
BLECharacteristic* pSensorChar  = NULL;
BLECharacteristic* pCommandChar = NULL;
// ==============================================================================
// 5. System State Variables
// ==============================================================================
bool deviceConnected    = false;
bool oldDeviceConnected = false;
unsigned long lastSendTime = 0;
int packetCount         = 0;
// Sensor Readings
float currentTemp = 5.0;
float currentHum  = 60.0;
float prevTemp    = 5.0;
float prevHum     = 60.0;
unsigned long lastRateCalcTime = 0;
float tempRate    = 0.0; // °C/min
float humRate     = 0.0; // %/min
float distanceCm  = 0.0;
// Anti-Tamper & Lid State
bool isLidOpen = false;
unsigned long lidOpenedTimestamp = 0;
int lidOpenDurationSec = 0;
// Vibration & Crash
volatile int vibrationCounter = 0;
bool crashDetected = false;
unsigned long lastCrashResetTime = 0;
unsigned long lastVibrationWindowTime = 0;
// Smart Box Lock (0° = Locked, 180° = Unlocked)
int servoLockAngle = 0;
// Battery
float batteryVoltage = 3.84;
int batteryPercentage = 74;
// Dual-Trigger LED State (Autonomous vs Remote Cloud Override)
bool manualLedOverride = false;
bool manualRedState    = false;
bool manualGreenState  = false;
bool manualBlueState   = false;
// IR Autonomous Tracking
bool irBlastActive = false;
unsigned long lastAutoIrBlastTime = 0;
// Backend-driven 3-tier alert (SAFE/WARNING/CRITICAL), pushed from the app
// over BLE as it changes. 0 = nothing received yet (idle). 1 = SAFE (green),
// 2 = WARNING (blue), 3 = CRITICAL (red). This is the authoritative source
// for the alert LEDs once the app has sent at least one classification —
// see updateLEDs() and CommandCB::onWrite().
int externalAlertLevel = 0;
bool externalAlertActive = false;
// The CRITICAL buzzer is a latching alarm: true once a human has sent
// "ACK_CRITICAL" for the CURRENT critical episode, which silences the
// buzzer immediately even if externalAlertLevel is still 3. Reset to
// false every time a fresh CRITICAL episode begins (externalAlertLevel
// transitions INTO 3), so the next episode always needs its own ack.
bool criticalAlertAcknowledged = false;
// The WARNING blue LED works the same way, but for the LIGHT instead of
// the buzzer: true once a human has sent "ACK_WARNING" for the CURRENT
// warning episode (see the app's AlertPopup "Acknowledge & Close" button),
// which makes updateLEDs() show green instead of blue even though
// externalAlertLevel is still 2 — WITHOUT losing track of the real tier:
// if the reading escalates to CRITICAL, red always takes over immediately
// regardless of this flag (see updateLEDs()). Reset to false every time a
// fresh WARNING episode begins (externalAlertLevel transitions INTO 2 from
// something else), so the next episode always needs its own ack.
bool warningAlertAcknowledged = false;
// ==============================================================================
// 6. Actuator Drivers & Helper Functions
// ==============================================================================
void blinkBuzzer(int times, int msDuration = 70) {
    for (int i = 0; i < times; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        delay(msDuration);
        digitalWrite(BUZZER_PIN, LOW);
        delay(msDuration);
    }
}
// Servo Angle Controller (0° - 180°) — fix #3: continuous LEDC hardware PWM
// instead of a blocking bit-banged pulse loop. LEDC keeps generating the
// 50Hz pulse train on its own after this single call, so the latch
// actively holds its commanded angle instead of drifting once the old
// 500ms burst of manual pulses ended, and this no longer blocks the BLE
// command callback while it runs.
void setServoAngle(int angle) {
    servoLockAngle = constrain(angle, 0, 180);
    int pulseWidthUs = map(servoLockAngle, 0, 180, 500, 2400);
    uint32_t duty = (uint32_t)(((float)pulseWidthUs / 20000.0f) * 65535.0f);
    ledcWrite(SERVO_PIN, duty);
}
// 38kHz IR Pulse Generator
void sendIRBurst(unsigned long durationMicros) {
    ledcWrite(IR_BLASTER_PIN, IR_PWM_DUTY);
    delayMicroseconds(durationMicros);
    ledcWrite(IR_BLASTER_PIN, 0);
}
// Blast Refrigeration Command
void blastIRCommand(const char* actionName) {
    Serial.print("🧊 [IR BLAST TRANSMITTED] -> ");
    Serial.println(actionName);
    sendIRBurst(9000);
    delayMicroseconds(4500);
    for (int i = 0; i < 32; i++) {
        sendIRBurst(560);
        delayMicroseconds(i % 2 == 0 ? 560 : 1690);
    }
    sendIRBurst(560);
    ledcWrite(IR_BLASTER_PIN, 0);
    irBlastActive = true;
    lastAutoIrBlastTime = millis();
}
void IRAM_ATTR onVibrationISR() {
    vibrationCounter++;
}
// Evaluates the 801S shock sensor on its OWN fixed VIBRATION_WINDOW_MS
// window, called every loop() iteration (not once per telemetry send —
// see the VIBRATION_WINDOW_MS comment above for why that used to make
// SHOCK stop triggering once the telemetry cadence sped up). Sets
// crashDetected true once >=VIBRATION_PULSE_THRESHOLD vibration pulses
// land inside one window, and keeps it latched for 3s after the last such
// window so a brief real shock is still visible on the next telemetry
// packet even if it landed between two sends.
void updateShockDetection() {
    unsigned long now = millis();
    if (now - lastVibrationWindowTime < VIBRATION_WINDOW_MS) return;
    lastVibrationWindowTime = now;

    bool shockThisWindow = (vibrationCounter >= VIBRATION_PULSE_THRESHOLD);
    vibrationCounter = 0;

    if (shockThisWindow) {
        crashDetected = true;
        lastCrashResetTime = now;
    } else if (now - lastCrashResetTime > 3000) {
        crashDetected = false;
    }
}
float readUltrasonicDistance() {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 25000);
    if (dur == 0) return 0.0;
    return (dur * 0.0343) / 2.0;
}
// Averages BATTERY_ADC_SAMPLES raw ADC reads (removes fast ESP32 ADC
// noise — this pin is a known-noisy one without external filtering), then
// blends the result into a running average across telemetry cycles
// (removes slower transient sag, e.g. a brief voltage dip while the IR
// blaster or servo draws current). Without this, a single noisy or sagged
// 2-second sample was enough to read as e.g. 9% and fire a false LOW
// BATTERY alert even though the battery itself was fine moments later.
float readBatteryVolts() {
    long sum = 0;
    for (int i = 0; i < BATTERY_ADC_SAMPLES; i++) {
        sum += analogRead(BATTERY_ADC_PIN);
        delayMicroseconds(100);
    }
    float raw = (float)sum / BATTERY_ADC_SAMPLES;
    float pinV = (raw / 4095.0) * 3.3;
    float sample = pinV * 2.0; // 10k + 10k divider ratio = 2.0

    static float smoothed = 3.84; // seeded with the same placeholder batteryVoltage started at
    smoothed = 0.7f * smoothed + 0.3f * sample;
    return smoothed;
}
// LED State Machine — manual override, then the backend-driven alert tier,
// then an idle fallback. The 3-tier alert (green=SAFE / blue=WARNING /
// red=CRITICAL) is decided by the FastAPI backend's ML model and pushed
// here over BLE as ALERT_SAFE / ALERT_WARNING / ALERT_CRITICAL — it is NOT
// computed from the board's own raw temperature reading, by design (see
// the header comment for why: the on-device threshold and the backend's
// duration-weighted risk score disagree on how fast to react).
//
// WARNING (blue) is additionally gated by warningAlertAcknowledged: once a
// human acknowledges the current warning episode (ACK_WARNING), the LED
// shows green instead, as if it were SAFE — but this ONLY ever downgrades
// blue to green, never upgrades anything. If a reading escalates to
// CRITICAL while acknowledged, red takes over immediately below,
// unconditionally — acknowledgment can silence/relax a lesser tier's
// light, it can never mask a worse one. The app also independently holds
// the tier at CRITICAL for a recovery window after conditions clear (see
// CRITICAL_RECOVERY_HOLD_SECONDS in App.jsx) before it ever sends
// ALERT_WARNING/ALERT_SAFE — this function just renders whatever tier it's
// told, it doesn't do that timing itself.
void updateLEDs() {
    if (manualLedOverride) {
        digitalWrite(RED_LED_PIN, manualRedState ? HIGH : LOW);
        digitalWrite(GREEN_LED_PIN, manualGreenState ? HIGH : LOW);
        digitalWrite(BLUE_LED_PIN, manualBlueState ? HIGH : LOW);
    } else if (externalAlertActive) {
        bool showCritical = (externalAlertLevel == 3);
        bool showWarning  = (externalAlertLevel == 2 && !warningAlertAcknowledged);
        bool showSafe     = (externalAlertLevel == 1) ||
                             (externalAlertLevel == 2 && warningAlertAcknowledged);
        digitalWrite(RED_LED_PIN,   showCritical ? HIGH : LOW);
        digitalWrite(BLUE_LED_PIN,  showWarning  ? HIGH : LOW);
        digitalWrite(GREEN_LED_PIN, showSafe     ? HIGH : LOW);
    } else {
        // No backend classification received yet (just booted, or not yet
        // paired with the app) — idle state: green while BLE is connected,
        // everything off otherwise. Deliberately not a guess at risk level.
        digitalWrite(GREEN_LED_PIN, deviceConnected ? HIGH : LOW);
        digitalWrite(BLUE_LED_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
    }
}
// ==============================================================================
// 7. GPS-derived Unix epoch (fix #2)
// ==============================================================================
// Howard Hinnant's days_from_civil algorithm: converts a UTC calendar date
// into days-since-1970-01-01. Combined with the GPS's UTC time-of-day this
// gives a real Unix epoch instead of the old no-op ternary that always
// fell back to device uptime. Falls back to uptime (NOT a real epoch) only
// when there is no valid GPS date/time fix yet.
static long daysFromCivil(int y, int m, int d) {
    y -= (m <= 2);
    long era = (y >= 0 ? y : y - 399) / 400;
    unsigned yoe = (unsigned)(y - era * 400);                         // [0, 399]
    unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;     // [0, 365]
    unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;              // [0, 146096]
    return era * 146097L + (long)doe - 719468L;
}
unsigned long gpsUnixEpoch(unsigned long uptimeMillis) {
    if (gps.date.isValid() && gps.time.isValid() && gps.date.year() >= 2020) {
        long days = daysFromCivil(gps.date.year(), gps.date.month(), gps.date.day());
        return (unsigned long)days * 86400UL
             + (unsigned long)gps.time.hour()   * 3600UL
             + (unsigned long)gps.time.minute() * 60UL
             + (unsigned long)gps.time.second();
    }
    return uptimeMillis / 1000UL; // no GPS fix yet — uptime, not a real epoch
}
// ==============================================================================
// 8. BLE Callbacks (Command Handler: Phone/Cloud ➡️ ESP32)
// ==============================================================================
class ServerCB : public BLEServerCallbacks {
    void onConnect(BLEServer* s) {
        deviceConnected = true;
        Serial.println("📱 [BLE] Phone Connected!");
        blinkBuzzer(1, 50);
        updateLEDs();
    }
    void onDisconnect(BLEServer* s) {
        deviceConnected = false;
        Serial.println("📱 [BLE] Phone Disconnected! Re-broadcasting...");
        updateLEDs();
    }
};
class CommandCB : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pChar) {
        String cmd = pChar->getValue().c_str();
        Serial.print("📥 [BLE COMMAND RECEIVED]: ");
        Serial.println(cmd);
        // A. Smart Servo Lock Commands
        if (cmd == "LOCK_BOX") {
            setServoAngle(0);
            Serial.println("🔒 Box Electronically LOCKED (0°)");
            blinkBuzzer(1, 100);
        }
        else if (cmd == "UNLOCK_BOX") {
            setServoAngle(180);
            Serial.println("🔓 Box Electronically UNLOCKED (180°)");
            blinkBuzzer(2, 60);
        }
        // B. Remote LED Manual Overrides
        else if (cmd == "RED_ON")     { manualLedOverride = true; manualRedState = true; }
        else if (cmd == "RED_OFF")    { manualLedOverride = true; manualRedState = false; }
        else if (cmd == "GREEN_ON")   { manualLedOverride = true; manualGreenState = true; }
        else if (cmd == "GREEN_OFF")  { manualLedOverride = true; manualGreenState = false; }
        else if (cmd == "BLUE_ON")    { manualLedOverride = true; manualBlueState = true; }
        else if (cmd == "BLUE_OFF")   { manualLedOverride = true; manualBlueState = false; }
        else if (cmd == "LED_AUTO")   { manualLedOverride = false; Serial.println("🤖 LEDs -> Auto Mode"); }
        // C. Buzzer Controls
        else if (cmd == "PING")       { blinkBuzzer(2, 60); Serial.println("🏓 Pong!"); }
        else if (cmd == "BUZZER_ON")  { digitalWrite(BUZZER_PIN, HIGH); }
        else if (cmd == "BUZZER_OFF") { digitalWrite(BUZZER_PIN, LOW); }
        // D. Autonomous Cooling Overrides
        else if (cmd == "IR_COOL_UP")   { blastIRCommand("MANUAL_COOL_BOOST_UP"); blinkBuzzer(1, 150); }
        else if (cmd == "IR_COOL_DOWN") { blastIRCommand("MANUAL_COOL_REDUCE"); blinkBuzzer(1, 150); }
        // E. Backend-driven 3-tier alert (green=SAFE, blue=WARNING, red=CRITICAL).
        // Sent by the app every time the ML model's risk_level changes — see
        // updateLEDs() for how this takes over the LEDs once it starts
        // arriving. The RAW tier (externalAlertLevel) always tracks this in
        // real time; only the RENDERED light additionally depends on the
        // ack flags below (CRITICAL buzzer / WARNING blue LED).
        else if (cmd == "ALERT_SAFE" || cmd == "ALERT_WARNING" || cmd == "ALERT_CRITICAL") {
            int newLevel = (cmd == "ALERT_SAFE") ? 1 : (cmd == "ALERT_WARNING") ? 2 : 3;
            // A FRESH entry into CRITICAL (wasn't already CRITICAL) re-arms
            // the buzzer for this new episode, undoing any earlier ack.
            if (newLevel == 3 && externalAlertLevel != 3) {
                criticalAlertAcknowledged = false;
            }
            // Same idea for WARNING's blue LED: a fresh entry into WARNING
            // (wasn't already WARNING) re-arms it, so a NEW warning episode
            // always lights blue again even if an earlier one was acked.
            if (newLevel == 2 && externalAlertLevel != 2) {
                warningAlertAcknowledged = false;
            }
            externalAlertLevel = newLevel;
            externalAlertActive = true;
            Serial.print("🚦 [ALERT TIER] -> ");
            Serial.println(cmd);
        }
        // F. Acknowledge the CRITICAL buzzer — silences it immediately for
        // the current episode without affecting the LEDs, which keep
        // reflecting whatever the backend is currently reporting. Sent by
        // the app when a person presses "Acknowledge" on the emergency
        // alert (see EmergencyModal.jsx / the Alerts emergency page).
        else if (cmd == "ACK_CRITICAL") {
            criticalAlertAcknowledged = true;
            Serial.println("🔕 [CRITICAL ACKNOWLEDGED] -> buzzer silenced for this episode");
        }
        // G. Acknowledge the WARNING blue LED — drops it to green for the
        // current episode (see updateLEDs()), WITHOUT touching
        // externalAlertLevel, so a later escalation to CRITICAL still lights
        // red immediately regardless. Sent by the app when a person presses
        // "Acknowledge & Close" on the warning popup (see AlertPopup.jsx).
        else if (cmd == "ACK_WARNING") {
            warningAlertAcknowledged = true;
            Serial.println("💡 [WARNING ACKNOWLEDGED] -> blue LED -> green for this episode");
        }
        updateLEDs();
    }
};
// ==============================================================================
// 9. Telemetry Aggregator & JSON Serializer (ESP32 ➡️ Phone/Cloud)
// ==============================================================================
String buildTelemetryJson() {
    unsigned long now = millis();
    // 1. Read DHT22
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
        currentTemp = t;
        currentHum = h;
    }
    // 2. Growth Rate Calculations (°C/min & %/min)
    if (lastRateCalcTime > 0) {
        float dt_min = (now - lastRateCalcTime) / 60000.0;
        if (dt_min >= 0.03) {
            tempRate = (currentTemp - prevTemp) / dt_min;
            humRate  = (currentHum - prevHum) / dt_min;
            prevTemp = currentTemp;
            prevHum  = currentHum;
            lastRateCalcTime = now;
        }
    } else {
        lastRateCalcTime = now;
        prevTemp = currentTemp;
        prevHum  = currentHum;
    }
    // 3. Read HW-201 Box Lid
    isLidOpen = (digitalRead(HW201_LID_PIN) == HIGH);
    if (isLidOpen) {
        if (lidOpenedTimestamp == 0) lidOpenedTimestamp = now;
        lidOpenDurationSec = (now - lidOpenedTimestamp) / 1000;
    } else {
        lidOpenedTimestamp = 0;
        lidOpenDurationSec = 0;
    }
    // 4. Read HC-SR04 Ultrasonic Distance
    distanceCm = readUltrasonicDistance();
    // 5. Read 801S Shock Sensor — evaluated independently in loop() via
    // updateShockDetection() (see VIBRATION_WINDOW_MS), not here; this call
    // just reads whatever crashDetected currently is.
    // 6. Read GPS Data
    float lat = gps.location.isValid() ? gps.location.lat() : 12.9716;
    float lng = gps.location.isValid() ? gps.location.lng() : 77.5946;
    float spd = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
    unsigned long epochTime = gpsUnixEpoch(now); // fix #2 — was a no-op ternary
    // 7. Read Battery State
    batteryVoltage = readBatteryVolts();
    batteryPercentage = constrain((int)(((batteryVoltage - 3.2) / (4.2 - 3.2)) * 100.0), 0, 100);
    // 8. Embedded Intelligence & Alert Engine
    String alert = "normal";
    if (currentTemp > 8.0 || tempRate > 0.5) {
        alert = (currentTemp > 10.0) ? "critical" : "warning";
        if (now - lastAutoIrBlastTime > 15000) {
            blastIRCommand("AUTONOMOUS_TEMP_SPIKE_CORRECTION");
        }
    } else if (currentTemp < 2.0 || isLidOpen || crashDetected) {
        alert = "warning";
    }
    // Sound buzzer alarm if lid open > 5 seconds, plus the backend-driven
    // alert buzzer: WARNING is silent (lights only — see updateLEDs()),
    // and a CONTINUOUS beep plays for as long as the tier stays CRITICAL,
    // latching on until a human explicitly acknowledges it (see
    // CommandCB::onWrite() -> ACK_CRITICAL, which sets
    // criticalAlertAcknowledged = true). Entering a fresh CRITICAL episode
    // (ALERT_CRITICAL) clears that flag again so the next critical event
    // still sounds. Both toggles are non-blocking, driven off millis(), and
    // each is explicitly turned back off the moment its own condition
    // clears — without that, the pin can get stuck HIGH if a chirp's last
    // write happened to land on an "on" half-cycle.
    static bool doorChirpWasActive = false;
    bool doorChirpActive = (isLidOpen && lidOpenDurationSec > 5);
    if (doorChirpActive) {
        digitalWrite(BUZZER_PIN, (now / 500) % 2);
    } else if (doorChirpWasActive) {
        digitalWrite(BUZZER_PIN, LOW);
    }
    doorChirpWasActive = doorChirpActive;

    static bool alertBuzzWasActive = false;
    bool criticalBuzzActive = (externalAlertActive && externalAlertLevel == 3 && !criticalAlertAcknowledged);
    bool alertBuzzActive = criticalBuzzActive;
    if (alertBuzzActive) {
        digitalWrite(BUZZER_PIN, (now / 300) % 2); // faster toggle — distinct from the door chirp
    } else if (alertBuzzWasActive) {
        digitalWrite(BUZZER_PIN, LOW);
    }
    alertBuzzWasActive = alertBuzzActive;

    if (irBlastActive && (now - lastAutoIrBlastTime > 3000)) {
        irBlastActive = false;
    }
    updateLEDs();
    packetCount++;
    // 9. Strict JSON Payload Construction (matching Spec Section 4)
    String j = "{";
    j += "\"id\":\"CG-TRUCK-07\",";
    j += "\"ts\":"       + String(epochTime) + ",";
    j += "\"pkt\":"      + String(packetCount) + ",";
    j += "\"temp\":"     + String(currentTemp, 1) + ",";
    j += "\"hum\":"      + String(currentHum, 1) + ",";
    j += "\"t_rate\":"   + String(tempRate, 2) + ",";
    j += "\"h_rate\":"   + String(humRate, 2) + ",";
    j += "\"lat\":"      + String(lat, 4) + ",";
    j += "\"lng\":"      + String(lng, 4) + ",";
    j += "\"spd\":"      + String(spd, 1) + ",";
    j += "\"dist\":"     + String(distanceCm, 1) + ",";
    j += "\"crash\":"    + String(crashDetected ? "true" : "false") + ",";
    j += "\"door\":"     + String(isLidOpen ? "true" : "false") + ",";
    j += "\"door_s\":"   + String(lidOpenDurationSec) + ",";
    j += "\"lock\":"     + String(servoLockAngle) + ",";
    j += "\"v_bat\":"    + String(batteryVoltage, 2) + ",";
    j += "\"bat_pct\":"  + String(batteryPercentage) + ",";
    j += "\"led_mode\":\"" + String(manualLedOverride ? "manual" : "auto") + "\",";
    j += "\"alert\":\""  + alert + "\",";
    j += "\"ir\":"       + String(irBlastActive ? "true" : "false") + ",";
    j += "\"up\":"       + String(now / 1000) + ",";
    j += "\"buf\":0,";
    j += "\"ble\":true";
    j += "}";
    return j;
}
// ==============================================================================
// 10. Setup Routine
// ==============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=======================================================");
    Serial.println("🧊 ChillGuard — Master Production Firmware Live");
    Serial.println("=======================================================\n");
    // Pin Mode Initializations
    pinMode(HW201_LID_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(VIB_801S_PIN, INPUT);
    pinMode(RED_LED_PIN, OUTPUT);
    pinMode(GREEN_LED_PIN, OUTPUT);
    pinMode(BLUE_LED_PIN, OUTPUT);
    // Note: SERVO_PIN is no longer pinMode'd as a plain OUTPUT — ledcAttach()
    // below configures it for hardware PWM instead (fix #3).
    // Initial Outputs
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(RED_LED_PIN, HIGH); // Red on while waiting for BLE
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(BLUE_LED_PIN, LOW);
    // Initialize 38kHz PWM for IR Blaster
    ledcAttach(IR_BLASTER_PIN, IR_PWM_FREQ, IR_PWM_RES);
    ledcWrite(IR_BLASTER_PIN, 0);
    // Initialize 50Hz PWM for the servo latch (fix #3) and lock on startup (0°)
    ledcAttach(SERVO_PIN, SERVO_PWM_FREQ, SERVO_PWM_RES);
    setServoAngle(0);
    // Attach Hardware Interrupt for 801S Shock Sensor. CHANGE (not RISING)
    // deliberately, so this doesn't depend on knowing which polarity this
    // particular 801S/SW-420 module's comparator idles at — some boards
    // idle HIGH and pulse LOW on a knock, others idle LOW and pulse HIGH;
    // CHANGE catches a real vibration event either way instead of silently
    // missing every pulse if the assumed polarity (RISING) was wrong.
    attachInterrupt(digitalPinToInterrupt(VIB_801S_PIN), onVibrationISR, CHANGE);
    // Initialize Sensors & UART
    dht.begin();
    gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    // Initialize BLE 5.0 Stack
    BLEDevice::init("ChillGuard-07");
    // Fix #1 — negotiate a real MTU. Without this the ATT MTU stays at the
    // ESP-IDF default of 23 bytes (~20 usable payload), but the telemetry
    // JSON below is ~290-320 bytes; every notify() would be silently
    // truncated on the wire and JSON.parse() would fail on every packet.
    BLEDevice::setMTU(517);
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCB());
    BLEService* svc = pServer->createService(SERVICE_UUID);
    // Telemetry Characteristic (Notify & Read)
    pSensorChar = svc->createCharacteristic(
        SENSOR_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    pSensorChar->addDescriptor(new BLE2902());
    // Command Characteristic (Write)
    pCommandChar = svc->createCharacteristic(
        COMMAND_CHAR_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    pCommandChar->setCallbacks(new CommandCB());
    svc->start();
    // Start BLE Advertising with Scan Response
    BLEAdvertising* adv = BLEDevice::getAdvertising();
    adv->addServiceUUID(SERVICE_UUID);
    adv->setScanResponse(true);
    adv->setMinPreferred(0x06);
    adv->setMinPreferred(0x12);
    BLEDevice::startAdvertising();
    Serial.println("📡 BLE GATT Server Advertising as: ChillGuard-07");
    Serial.println("🚀 System fully operational!\n");
    blinkBuzzer(3, 60);
}
// ==============================================================================
// 11. Main Execution Loop
// ==============================================================================
void loop() {
    // 1. Ingest GPS NMEA sentences continually
    while (gpsSerial.available() > 0) {
        gps.encode(gpsSerial.read());
    }
    // 1b. Shock/crash detection — its own fixed window, independent of the
    // telemetry send cadence below (see VIBRATION_WINDOW_MS).
    updateShockDetection();
    // 2. 500ms Telemetry & Transmission Cycle
    if (millis() - lastSendTime >= 500) {
        String jsonPayload = buildTelemetryJson();
        // Print Telemetry to Serial Monitor
        Serial.print("📦 [Pkt #");
        Serial.print(packetCount);
        Serial.print("] Temp: ");
        Serial.print(currentTemp, 1);
        Serial.print("°C | Hum: ");
        Serial.print(currentHum, 1);
        Serial.print("% | Rate: ");
        Serial.print(tempRate, 2);
        Serial.print("°C/min | Dist: ");
        Serial.print(distanceCm, 1);
        Serial.print("cm | Lid: ");
        Serial.print(isLidOpen ? "🔓 OPEN" : "🔒 CLOSED");
        Serial.print(" | Lock: ");
        Serial.print(servoLockAngle);
        Serial.print("° | Shock: ");
        Serial.print(crashDetected ? "🚨 YES" : "NO");
        Serial.println();
        // Broadcast over Bluetooth Notify to Phone / App
        if (deviceConnected) {
            pSensorChar->setValue(jsonPayload.c_str());
            pSensorChar->notify();
        }
        lastSendTime = millis();
    }
    // 3. Handle BLE Reconnection
    if (!deviceConnected && oldDeviceConnected) {
        delay(500);
        BLEDevice::startAdvertising();
        Serial.println("📡 [BLE] Re-broadcasting Advertising Packets...");
        oldDeviceConnected = false;
    }
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = true;
    }
    delay(20);
}
