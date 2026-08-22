from datetime import datetime, timedelta

from sensor_processor import FeatureProcessor


# ============================================================
# CREATE FEATURE PROCESSOR
# ============================================================

processor = FeatureProcessor(
    product_type="vaccine",
    min_temp=2,
    max_temp=8,
    min_humidity=40,
    max_humidity=60
)


# ============================================================
# SIMULATED SENSOR READINGS
# ============================================================

readings = [
    # time, temperature, humidity, shock
    (0,   5.0, 50.0, 0.00),
    (1,   5.5, 51.0, 0.00),
    (2,   6.0, 52.0, 0.02),
    (3,   7.0, 53.0, 0.00),

    # Temperature excursion begins
    (4,   9.0, 54.0, 0.00),
    (5,  10.0, 55.0, 0.15),
    (6,  11.0, 56.0, 0.00),
    (7,  12.0, 57.0, 0.25),

    # Cooling / recovery
    (8,   9.0, 56.0, 0.00),
    (9,   7.0, 54.0, 0.00),
    (10,  6.0, 52.0, 0.00),
    (11,  5.0, 50.0, 0.00),
]


# ============================================================
# START TIME
# ============================================================

start_time = datetime.now()


# ============================================================
# PROCESS READINGS
# ============================================================

print("=" * 100)
print("SURAKSHA SIMULATED SENSOR STREAM")
print("=" * 100)

print(
    f"{'Min':>4} "
    f"{'Temp':>7} "
    f"{'Humidity':>9} "
    f"{'Shock':>7} "
    f"{'Temp Dev':>9} "
    f"{'Temp Out':>9} "
    f"{'Cum Exp':>10} "
    f"{'Excursions':>11} "
    f"{'Max Dev':>9} "
    f"{'Shock Cnt':>10}"
)

print("-" * 100)


for minute, temperature, humidity, shock in readings:

    timestamp = start_time + timedelta(
        minutes=minute
    )

    features = processor.process_reading(
        temperature=temperature,
        humidity=humidity,
        shock=shock,
        timestamp=timestamp,

        # Simulated weather API values
        external_temperature=28.0,
        external_humidity=65.0,
        rain_probability=20.0,
        wind_speed=12.0,

        # Cooling initially OFF
        cooling_status=0
    )

    print(
        f"{minute:4d} "
        f"{temperature:7.2f} "
        f"{humidity:9.2f} "
        f"{shock:7.2f} "
        f"{features['temperature_deviation']:9.2f} "
        f"{features['time_outside_temp_range']:9.2f} "
        f"{features['cumulative_temp_exposure']:10.2f} "
        f"{features['temperature_excursion_count']:11d} "
        f"{features['max_temp_deviation']:9.2f} "
        f"{features['shock_count']:10d}"
    )


# ============================================================
# FINAL STATE
# ============================================================

print("\n" + "=" * 100)
print("FINAL FEATURE STATE")
print("=" * 100)

print(
    f"Temperature:                  "
    f"{features['temperature']:.2f} °C"
)

print(
    f"Humidity:                     "
    f"{features['humidity']:.2f} %"
)

print(
    f"Temperature deviation:        "
    f"{features['temperature_deviation']:.2f} °C"
)

print(
    f"Time outside temperature:     "
    f"{features['time_outside_temp_range']:.2f} min"
)

print(
    f"Cumulative temperature exp:   "
    f"{features['cumulative_temp_exposure']:.2f}"
)

print(
    f"Temperature excursion count:  "
    f"{features['temperature_excursion_count']}"
)

print(
    f"Maximum temperature deviation:"
    f" {features['max_temp_deviation']:.2f} °C"
)

print(
    f"Shock count:                  "
    f"{features['shock_count']}"
)

print(
    f"Maximum shock:                "
    f"{features['max_shock']:.2f} g"
)

print(
    f"Time since first excursion:   "
    f"{features['time_since_first_excursion']:.2f} min"
)

print("=" * 100)