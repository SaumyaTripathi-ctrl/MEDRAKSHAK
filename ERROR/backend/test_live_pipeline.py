from datetime import datetime, timedelta

from sensor_processor import FeatureProcessor
from predict import predict


# ============================================================
# PRODUCT CONFIGURATION
# ============================================================

processor = FeatureProcessor(
    product_type="vaccine",
    min_temp=2,
    max_temp=8,
    min_humidity=40,
    max_humidity=60
)


# ============================================================
# SIMULATED LIVE READINGS
# ============================================================
#
# Each tuple:
# (temperature °C, humidity %RH, shock g)
#
# The simulation contains:
#
# PHASE 1 → SAFE
# PHASE 2 → SUSTAINED TEMPERATURE EXCURSION
# PHASE 3 → SEVERE / PROLONGED EXCURSION
# PHASE 4 → COOLING / RECOVERY
#
# Historical exposure is accumulated continuously.
# ============================================================

readings = []


# ============================================================
# PHASE 1 — SAFE
# ============================================================

safe_readings = [
    (5.0, 50.0, 0.00),
    (5.5, 51.0, 0.00),
    (6.0, 52.0, 0.02),
    (6.5, 52.0, 0.00),
    (7.0, 53.0, 0.00),
]

readings.extend(safe_readings)


# ============================================================
# PHASE 2 — WARNING-LEVEL EXCURSION
# ============================================================
#
# Temperature gradually rises above the allowed 2–8°C range.
# Exposure accumulates over time.
# ============================================================

warning_temperatures = [
    9.0,
    10.0,
    10.5,
    11.0,
    11.5,
    12.0,
    12.0,
    12.5,
    12.5,
    13.0,
    13.0,
    13.5,
    13.5,
    14.0,
    14.0,
]

for temperature in warning_temperatures:

    readings.append(
        (temperature, 55.0, 0.00)
    )


# ============================================================
# PHASE 3 — SEVERE / PROLONGED EXCURSION
# ============================================================
#
# Temperature rises much further.
# This should create a much larger cumulative exposure.
# Small shocks are also introduced.
# ============================================================

critical_temperatures = [
    15.0,
    16.0,
    17.0,
    18.0,
    18.0,
    19.0,
    19.0,
    20.0,
    20.0,
    21.0,
    21.0,
    22.0,
    22.0,
    23.0,
    23.0,
]

for temperature in critical_temperatures:

    readings.append(
        (temperature, 57.0, 0.10)
    )


# ============================================================
# PHASE 4 — COOLING / RECOVERY
# ============================================================
#
# Temperature comes back toward the safe range.
#
# IMPORTANT:
# Historical exposure does NOT reset.
# ============================================================

recovery_temperatures = [
    20.0,
    18.0,
    15.0,
    12.0,
    9.0,
    7.0,
    6.0,
    5.0,
]

for temperature in recovery_temperatures:

    readings.append(
        (temperature, 54.0, 0.00)
    )


# ============================================================
# START TIME
# ============================================================

start_time = datetime.now()


# ============================================================
# OUTPUT HEADER
# ============================================================

print("=" * 120)
print("SURAKSHA END-TO-END SENSOR → ML PIPELINE")
print("=" * 120)

print(
    f"{'Min':>4} "
    f"{'Temp':>7} "
    f"{'Risk':>8} "
    f"{'Safe Time':>12} "
    f"{'Level':>10} "
    f"{'Cooling':>10} "
    f"{'Urgent':>8} "
    f"{'Temp Dev':>10} "
    f"{'Cum Exp':>10} "
    f"{'Excursions':>11}"
)

print("-" * 120)


# ============================================================
# PROCESS EVERY SIMULATED SENSOR READING
# ============================================================

for minute, (temperature, humidity, shock) in enumerate(readings):

    timestamp = start_time + timedelta(
        minutes=minute
    )

    # --------------------------------------------------------
    # SENSOR → FEATURES
    # --------------------------------------------------------

    features = processor.process_reading(
        temperature=temperature,
        humidity=humidity,
        shock=shock,
        timestamp=timestamp,

        # ----------------------------------------------------
        # Simulated weather API values
        # ----------------------------------------------------

        external_temperature=28.0,
        external_humidity=65.0,
        rain_probability=20.0,
        wind_speed=12.0,

        # Cooling initially OFF.
        # This simulation is testing the prediction system,
        # not the physical fan yet.
        cooling_status=0
    )

    # --------------------------------------------------------
    # FEATURES → ML PREDICTION
    # --------------------------------------------------------

    result = predict(features)

    # --------------------------------------------------------
    # DISPLAY
    # --------------------------------------------------------

    print(
        f"{minute:4d} "
        f"{temperature:7.2f} "
        f"{result['spoilage_risk']:8.2f} "
        f"{result['estimated_remaining_safe_time']:12.2f} "
        f"{result['risk_level']:>10} "
        f"{str(result['cooling_required']):>10} "
        f"{str(result['urgent_action']):>8} "
        f"{features['temperature_deviation']:10.2f} "
        f"{features['cumulative_temp_exposure']:10.2f} "
        f"{features['temperature_excursion_count']:11d}"
    )


# ============================================================
# FINAL FEATURE STATE
# ============================================================

print("\n" + "=" * 120)
print("FINAL HISTORICAL FEATURE STATE")
print("=" * 120)

print(
    f"Final temperature:                "
    f"{features['temperature']:.2f} °C"
)

print(
    f"Final humidity:                   "
    f"{features['humidity']:.2f} %"
)

print(
    f"Temperature deviation:            "
    f"{features['temperature_deviation']:.2f} °C"
)

print(
    f"Time outside temperature range:   "
    f"{features['time_outside_temp_range']:.2f} min"
)

print(
    f"Cumulative temperature exposure:  "
    f"{features['cumulative_temp_exposure']:.2f}"
)

print(
    f"Maximum temperature deviation:    "
    f"{features['max_temp_deviation']:.2f} °C"
)

print(
    f"Temperature excursion count:      "
    f"{features['temperature_excursion_count']}"
)

print(
    f"Time since first excursion:        "
    f"{features['time_since_first_excursion']:.2f} min"
)

print(
    f"Shock count:                       "
    f"{features['shock_count']}"
)

print(
    f"Maximum shock:                     "
    f"{features['max_shock']:.2f} g"
)


# ============================================================
# FINAL ML RESULT
# ============================================================

final_result = predict(features)

print("\n" + "=" * 120)
print("FINAL PREDICTION")
print("=" * 120)

print(
    f"Spoilage Risk:                    "
    f"{final_result['spoilage_risk']:.2f}"
)

print(
    f"Remaining Safe Time:              "
    f"{final_result['estimated_remaining_safe_time']:.2f} minutes"
)

print(
    f"Risk Level:                       "
    f"{final_result['risk_level']}"
)

print(
    f"Cooling Required:                 "
    f"{final_result['cooling_required']}"
)

print(
    f"Urgent Action:                    "
    f"{final_result['urgent_action']}"
)


# ============================================================
# PIPELINE SUMMARY
# ============================================================

print("\n" + "=" * 120)

print("""
PIPELINE VERIFIED:

Sensor values
     ↓
FeatureProcessor
     ↓
Historical exposure + derived features
     ↓
Random Forest models
     ↓
Spoilage Risk
Remaining Safe Time
     ↓
Risk Level
Cooling Required
Urgent Action
""")

print("=" * 120)