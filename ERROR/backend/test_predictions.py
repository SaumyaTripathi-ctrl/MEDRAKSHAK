from predict import predict


# ============================================================
# BASE SAFE VACCINE CONDITION
# ============================================================

base_input = {
    "product_type": "vaccine",

    "min_temp": 2,
    "max_temp": 8,

    "min_humidity": 40,
    "max_humidity": 60,

    "temperature": 5,
    "humidity": 50,

    "shock": 0,

    "temperature_deviation": 0,
    "humidity_deviation": 0,

    "time_outside_temp_range": 0,
    "time_outside_humidity_range": 0,

    "temperature_rate_of_change": 0,

    "max_temp_deviation": 0,

    "shock_count": 0,
    "max_shock": 0,

    "cumulative_temp_exposure": 0,
    "cumulative_humidity_exposure": 0,

    "temperature_excursion_count": 0,
    "time_since_first_excursion": 0,

    "external_temperature": 25,
    "external_humidity": 60,

    "rain_probability": 20,
    "wind_speed": 10,

    "cooling_status": 0,
}


# ============================================================
# SCENARIO CREATOR
# ============================================================

def create_scenario(
    temperature,
    temperature_deviation,
    time_outside_temp_range,
    temperature_rate_of_change,
    max_temp_deviation,
    cumulative_temp_exposure,
    temperature_excursion_count,
    time_since_first_excursion,
):
    scenario = base_input.copy()

    scenario["temperature"] = temperature
    scenario["temperature_deviation"] = temperature_deviation
    scenario["time_outside_temp_range"] = time_outside_temp_range
    scenario["temperature_rate_of_change"] = temperature_rate_of_change
    scenario["max_temp_deviation"] = max_temp_deviation
    scenario["cumulative_temp_exposure"] = cumulative_temp_exposure
    scenario["temperature_excursion_count"] = temperature_excursion_count
    scenario["time_since_first_excursion"] = time_since_first_excursion

    return scenario


# ============================================================
# TEST SCENARIOS
# ============================================================

scenarios = {

    "SAFE — 5°C": create_scenario(
        temperature=5,
        temperature_deviation=0,
        time_outside_temp_range=0,
        temperature_rate_of_change=0,
        max_temp_deviation=0,
        cumulative_temp_exposure=0,
        temperature_excursion_count=0,
        time_since_first_excursion=0,
    ),

    "WARNING — 9°C": create_scenario(
        temperature=9,
        temperature_deviation=1,
        time_outside_temp_range=5,
        temperature_rate_of_change=0.2,
        max_temp_deviation=1,
        cumulative_temp_exposure=5,
        temperature_excursion_count=1,
        time_since_first_excursion=5,
    ),

    "CRITICAL — 13°C": create_scenario(
        temperature=13,
        temperature_deviation=5,
        time_outside_temp_range=30,
        temperature_rate_of_change=0.2,
        max_temp_deviation=5,
        cumulative_temp_exposure=150,
        temperature_excursion_count=1,
        time_since_first_excursion=30,
    ),
}


# ============================================================
# RUN TESTS
# ============================================================

print("=" * 75)
print("SURAKSHA LIVE SENSOR SIMULATION")
print("=" * 75)

results = {}

for name, data in scenarios.items():

    print("\n" + "-" * 75)
    print(name)
    print("-" * 75)

    result = predict(data)

    results[name] = result

    print(
        f"Spoilage Risk:          "
        f"{result['spoilage_risk']:.2f}"
    )

    print(
        f"Remaining Safe Time:    "
        f"{result['estimated_remaining_safe_time']:.2f} minutes"
    )

    print(
        f"Risk Level:             "
        f"{result['risk_level']}"
    )

    print(
        f"Cooling Required:       "
        f"{result['cooling_required']}"
    )

    print(
        f"Urgent Action:          "
        f"{result['urgent_action']}"
    )


# ============================================================
# BASIC BEHAVIOR CHECK
# ============================================================

safe = results["SAFE — 5°C"]
warning = results["WARNING — 9°C"]
critical = results["CRITICAL — 13°C"]


print("\n" + "=" * 75)
print("BEHAVIOR CHECK")
print("=" * 75)


if (
    safe["spoilage_risk"]
    < warning["spoilage_risk"]
    < critical["spoilage_risk"]
):
    print("PASS: Spoilage risk increases with temperature.")
else:
    print("FAIL: Spoilage risk does not increase correctly.")


if (
    safe["estimated_remaining_safe_time"]
    > warning["estimated_remaining_safe_time"]
    > critical["estimated_remaining_safe_time"]
):
    print("PASS: Remaining safe time decreases with temperature.")
else:
    print("FAIL: Remaining safe time does not decrease correctly.")


if safe["risk_level"] == "SAFE":
    print("PASS: Safe scenario classified as SAFE.")
else:
    print("WARNING: Safe scenario was not classified as SAFE.")


if warning["risk_level"] in ["WARNING", "CRITICAL"]:
    print("PASS: Warning scenario shows elevated risk.")
else:
    print("WARNING: Warning scenario still classified as SAFE.")


if critical["risk_level"] == "CRITICAL":
    print("PASS: Critical scenario classified as CRITICAL.")
else:
    print("WARNING: Critical scenario was not classified as CRITICAL.")


print("=" * 75)