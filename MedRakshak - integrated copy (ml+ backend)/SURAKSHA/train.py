import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ============================================================
# CONFIGURATION
# ============================================================

DATA_DIR = Path("data")
OUTPUT_DIR = Path("outputs")
MODEL_DIR = Path("models")

DATA_PATH = DATA_DIR / "suraksha_dataset_corrected.csv"

RANDOM_STATE = 42

TARGET_RISK = "spoilage_risk"
TARGET_SAFE_TIME = "estimated_remaining_safe_time"

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

CATEGORICAL_FEATURES = [
    "product_type"
]

NUMERIC_FEATURES = [
    feature for feature in FEATURE_COLUMNS
    if feature not in CATEGORICAL_FEATURES
]


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def create_preprocessor():
    """
    Creates preprocessing for the ML pipeline.

    product_type is categorical and is one-hot encoded.
    All other features are numeric and passed through unchanged.
    """

    return ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False
                ),
                CATEGORICAL_FEATURES,
            ),
            (
                "numeric",
                "passthrough",
                NUMERIC_FEATURES,
            ),
        ],
        remainder="drop",
    )


def create_model():
    """
    Creates the Random Forest regression model.
    """

    return RandomForestRegressor(
        n_estimators=300,
        max_depth=None,
        min_samples_leaf=2,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )


def create_pipeline():
    """
    Creates complete preprocessing + ML pipeline.
    """

    return Pipeline(
        steps=[
            ("preprocessor", create_preprocessor()),
            ("model", create_model()),
        ]
    )


def evaluate_model(model, X, y, dataset_name):
    """
    Calculate MAE, RMSE and R².
    """

    predictions = model.predict(X)

    mae = mean_absolute_error(y, predictions)

    rmse = np.sqrt(
        mean_squared_error(y, predictions)
    )

    r2 = r2_score(y, predictions)

    return {
        "dataset": dataset_name,
        "MAE": mae,
        "RMSE": rmse,
        "R2": r2,
    }


# ============================================================
# MAIN
# ============================================================

print("=" * 75)
print("SURAKSHA ML TRAINING")
print("=" * 75)


# ============================================================
# CREATE DIRECTORIES
# ============================================================

OUTPUT_DIR.mkdir(exist_ok=True)
MODEL_DIR.mkdir(exist_ok=True)


# ============================================================
# LOAD DATA
# ============================================================

print("\nLoading dataset...")

df = pd.read_csv(DATA_PATH)

print(f"Dataset: {DATA_PATH}")
print(f"Rows: {len(df):,}")
print(f"Shipments: {df['shipment_id'].nunique()}")


# ============================================================
# SHIPMENT-LEVEL SPLIT
# ============================================================

print("\n" + "-" * 75)
print("SHIPMENT-LEVEL DATA SPLIT")
print("-" * 75)

shipments = df["shipment_id"].unique()

rng = np.random.RandomState(RANDOM_STATE)
rng.shuffle(shipments)

train_shipments = shipments[:240]
validation_shipments = shipments[240:270]
test_shipments = shipments[270:300]

train_df = df[
    df["shipment_id"].isin(train_shipments)
].copy()

validation_df = df[
    df["shipment_id"].isin(validation_shipments)
].copy()

test_df = df[
    df["shipment_id"].isin(test_shipments)
].copy()


print(f"Train shipments:      {len(train_shipments)}")
print(f"Validation shipments: {len(validation_shipments)}")
print(f"Test shipments:       {len(test_shipments)}")

print(f"\nTrain rows:            {len(train_df):,}")
print(f"Validation rows:      {len(validation_df):,}")
print(f"Test rows:             {len(test_df):,}")


# ============================================================
# LEAKAGE CHECK
# ============================================================

train_ids = set(train_shipments)
validation_ids = set(validation_shipments)
test_ids = set(test_shipments)

assert train_ids.isdisjoint(validation_ids)
assert train_ids.isdisjoint(test_ids)
assert validation_ids.isdisjoint(test_ids)

print("\nShipment leakage check: PASSED")


# ============================================================
# CREATE FEATURES AND TARGETS
# ============================================================

X_train = train_df[FEATURE_COLUMNS]
X_validation = validation_df[FEATURE_COLUMNS]
X_test = test_df[FEATURE_COLUMNS]

y_risk_train = train_df[TARGET_RISK]
y_risk_validation = validation_df[TARGET_RISK]
y_risk_test = test_df[TARGET_RISK]

y_time_train = train_df[TARGET_SAFE_TIME]
y_time_validation = validation_df[TARGET_SAFE_TIME]
y_time_test = test_df[TARGET_SAFE_TIME]


# ============================================================
# MODEL 1 — SPOILAGE RISK
# ============================================================

print("\n" + "=" * 75)
print("MODEL 1 — SPOILAGE RISK")
print("=" * 75)

print("\nTraining Random Forest...")

risk_model = create_pipeline()

risk_model.fit(
    X_train,
    y_risk_train
)

print("Training complete.")


# ============================================================
# MODEL 1 EVALUATION
# ============================================================

risk_train_metrics = evaluate_model(
    risk_model,
    X_train,
    y_risk_train,
    "Train"
)

risk_validation_metrics = evaluate_model(
    risk_model,
    X_validation,
    y_risk_validation,
    "Validation"
)

risk_test_metrics = evaluate_model(
    risk_model,
    X_test,
    y_risk_test,
    "Test"
)


print("\nSpoilage Risk Results:")

for result in [
    risk_train_metrics,
    risk_validation_metrics,
    risk_test_metrics,
]:
    print(
        f"{result['dataset']:12s} | "
        f"MAE: {result['MAE']:.4f} | "
        f"RMSE: {result['RMSE']:.4f} | "
        f"R²: {result['R2']:.4f}"
    )


# ============================================================
# MODEL 2 — REMAINING SAFE TIME
# ============================================================

print("\n" + "=" * 75)
print("MODEL 2 — REMAINING SAFE TIME")
print("=" * 75)

print("\nTraining Random Forest...")

safe_time_model = create_pipeline()

safe_time_model.fit(
    X_train,
    y_time_train
)

print("Training complete.")


# ============================================================
# MODEL 2 EVALUATION
# ============================================================

time_train_metrics = evaluate_model(
    safe_time_model,
    X_train,
    y_time_train,
    "Train"
)

time_validation_metrics = evaluate_model(
    safe_time_model,
    X_validation,
    y_time_validation,
    "Validation"
)

time_test_metrics = evaluate_model(
    safe_time_model,
    X_test,
    y_time_test,
    "Test"
)


print("\nRemaining Safe Time Results:")

for result in [
    time_train_metrics,
    time_validation_metrics,
    time_test_metrics,
]:
    print(
        f"{result['dataset']:12s} | "
        f"MAE: {result['MAE']:.4f} | "
        f"RMSE: {result['RMSE']:.4f} | "
        f"R²: {result['R2']:.4f}"
    )


# ============================================================
# SAVE MODELS
# ============================================================

print("\n" + "=" * 75)
print("SAVING MODELS")
print("=" * 75)

risk_model_path = MODEL_DIR / "spoilage_risk_model.pkl"
safe_time_model_path = MODEL_DIR / "remaining_safe_time_model.pkl"

joblib.dump(
    risk_model,
    risk_model_path
)

joblib.dump(
    safe_time_model,
    safe_time_model_path
)

print(f"Saved: {risk_model_path}")
print(f"Saved: {safe_time_model_path}")


# ============================================================
# SAVE FEATURE INFORMATION
# ============================================================

feature_info = {
    "features": FEATURE_COLUMNS,
    "categorical_features": CATEGORICAL_FEATURES,
    "numeric_features": NUMERIC_FEATURES,
    "targets": {
        "spoilage_risk": TARGET_RISK,
        "remaining_safe_time": TARGET_SAFE_TIME,
    },
}

with open(
    MODEL_DIR / "feature_columns.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        feature_info,
        f,
        indent=4
    )

print(
    f"Saved: {MODEL_DIR / 'feature_columns.json'}"
)


# ============================================================
# SAVE TRAINING REPORT
# ============================================================

report_path = Path("training_report.txt")

with open(
    report_path,
    "w",
    encoding="utf-8"
) as report:

    report.write("SURAKSHA ML TRAINING REPORT\n")
    report.write("=" * 70 + "\n\n")

    report.write("Dataset\n")
    report.write("-" * 70 + "\n")
    report.write(f"Dataset: {DATA_PATH}\n")
    report.write(f"Total rows: {len(df):,}\n")
    report.write(f"Total shipments: {df['shipment_id'].nunique()}\n\n")

    report.write("Split\n")
    report.write("-" * 70 + "\n")
    report.write("Train shipments: 240\n")
    report.write("Validation shipments: 30\n")
    report.write("Test shipments: 30\n")
    report.write("Train rows: 24,000\n")
    report.write("Validation rows: 3,000\n")
    report.write("Test rows: 3,000\n\n")

    report.write("Features\n")
    report.write("-" * 70 + "\n")

    for feature in FEATURE_COLUMNS:
        report.write(f"{feature}\n")

    report.write("\n")

    report.write("MODEL 1 — SPOILAGE RISK\n")
    report.write("-" * 70 + "\n")
    report.write("Algorithm: Random Forest Regressor\n\n")

    for result in [
        risk_train_metrics,
        risk_validation_metrics,
        risk_test_metrics,
    ]:
        report.write(
            f"{result['dataset']}:\n"
        )
        report.write(
            f"  MAE:  {result['MAE']:.6f}\n"
        )
        report.write(
            f"  RMSE: {result['RMSE']:.6f}\n"
        )
        report.write(
            f"  R²:   {result['R2']:.6f}\n\n"
        )

    report.write(
        "MODEL 2 — REMAINING SAFE TIME\n"
    )
    report.write("-" * 70 + "\n")
    report.write("Algorithm: Random Forest Regressor\n\n")

    for result in [
        time_train_metrics,
        time_validation_metrics,
        time_test_metrics,
    ]:
        report.write(
            f"{result['dataset']}:\n"
        )
        report.write(
            f"  MAE:  {result['MAE']:.6f}\n"
        )
        report.write(
            f"  RMSE: {result['RMSE']:.6f}\n"
        )
        report.write(
            f"  R²:   {result['R2']:.6f}\n\n"
        )

print(f"\nSaved: {report_path}")


# ============================================================
# FINAL
# ============================================================

print("\n" + "=" * 75)
print("TRAINING COMPLETE")
print("=" * 75)

print("\nCreated:")

print("models/")
print("  ├── spoilage_risk_model.pkl")
print("  ├── remaining_safe_time_model.pkl")
print("  └── feature_columns.json")

print("\ntraining_report.txt")

print("\nNext step:")
print("Build and test predict.py")

print("=" * 75)