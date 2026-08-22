import joblib
import pandas as pd
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_DIR = Path("models")

RISK_MODEL_PATH = MODEL_DIR / "spoilage_risk_model.pkl"
SAFE_TIME_MODEL_PATH = MODEL_DIR / "remaining_safe_time_model.pkl"


# ============================================================
# LOAD MODELS
# ============================================================

risk_model = joblib.load(RISK_MODEL_PATH)
safe_time_model = joblib.load(SAFE_TIME_MODEL_PATH)


# ============================================================
# FEATURES
# ============================================================

FEATURE_COLUMNS = [
    "product_type",
    "min_temp",
    "max_temp",
    "min_humidity",
    "max_humidity",
    "temperature",
    "humidity",
    "shock",
    "temperature_deviation",
    "humidity_deviation",
    "time_outside_temp_range",
    "time_outside_humidity_range",
    "temperature_rate_of_change",
    "max_temp_deviation",
    "shock_count",
    "max_shock",
    "cumulative_temp_exposure",
    "cumulative_humidity_exposure",
    "temperature_excursion_count",
    "time_since_first_excursion",
    "external_temperature",
    "external_humidity",
    "rain_probability",
    "wind_speed",
    "cooling_status",
]


# ============================================================
# RISK LEVEL
# ============================================================

def get_risk_level(risk):
    """
    Convert numerical spoilage risk into a human-readable level.
    """

    if risk < 30:
        return "SAFE"

    elif risk < 70:
        return "WARNING"

    else:
        return "CRITICAL"


# ============================================================
# PREDICTION FUNCTION
# ============================================================

def predict(sensor_data):
    """
    Receive processed sensor/weather features
    and return ML predictions + intervention signals.

    Parameters
    ----------
    sensor_data : dict
        Dictionary containing all required model features.

    Returns
    -------
    dict
        Spoilage risk, remaining safe time,
        risk level and intervention signals.
    """

    # --------------------------------------------------------
    # Check required features
    # --------------------------------------------------------

    missing_features = [
        feature
        for feature in FEATURE_COLUMNS
        if feature not in sensor_data
    ]

    if missing_features:
        raise ValueError(
            "Missing required features: "
            + ", ".join(missing_features)
        )

    # --------------------------------------------------------
    # Convert dictionary to DataFrame
    # --------------------------------------------------------

    input_df = pd.DataFrame(
        [sensor_data],
        columns=FEATURE_COLUMNS
    )

    # --------------------------------------------------------
    # Model predictions
    # --------------------------------------------------------

    risk_prediction = risk_model.predict(input_df)[0]

    safe_time_prediction = safe_time_model.predict(input_df)[0]

    # --------------------------------------------------------
    # Keep predictions within valid ranges
    # --------------------------------------------------------

    risk_prediction = max(
        0,
        min(100, float(risk_prediction))
    )

    safe_time_prediction = max(
        0,
        float(safe_time_prediction)
    )

    # --------------------------------------------------------
    # Risk level
    # --------------------------------------------------------

    risk_level = get_risk_level(
        risk_prediction
    )

    # --------------------------------------------------------
    # Cooling requirement
    # --------------------------------------------------------

    cooling_required = (
        sensor_data["temperature"]
        > sensor_data["max_temp"]
        or
        sensor_data["temperature"]
        < sensor_data["min_temp"]
    )

    # --------------------------------------------------------
    # Urgent action
    # --------------------------------------------------------

    urgent_action = (
        safe_time_prediction <= 30
        or risk_prediction >= 70
    )

    # --------------------------------------------------------
    # Return result
    # --------------------------------------------------------

    return {
        "spoilage_risk": round(
            risk_prediction,
            2
        ),

        "estimated_remaining_safe_time": round(
            safe_time_prediction,
            2
        ),

        "risk_level": risk_level,

        "cooling_required": cooling_required,

        "urgent_action": urgent_action,
    }


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    print("=" * 70)
    print("SURAKSHA PREDICTION PIPELINE")
    print("=" * 70)

    sample_input = {

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

    result = predict(sample_input)

    print("\nPrediction:")
    print(result)

    print("\n" + "=" * 70)