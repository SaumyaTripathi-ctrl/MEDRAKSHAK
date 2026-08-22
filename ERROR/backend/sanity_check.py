import pandas as pd
import numpy as np
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

DATA_PATH = Path("data/suraksha_dataset_corrected.csv")

EXPECTED_ROWS = 30_000
EXPECTED_SHIPMENTS = 300
EXPECTED_READINGS_PER_SHIPMENT = 100

EXPECTED_COLUMNS = [
    "timestamp",
    "shipment_id",
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
    "spoilage_risk",
    "estimated_remaining_safe_time",
]


# ============================================================
# HELPER
# ============================================================

errors = []
warnings = []


def check(condition, message):
    if condition:
        print(f"PASS  {message}")
    else:
        print(f"FAIL  {message}")
        errors.append(message)


# ============================================================
# LOAD DATA
# ============================================================

print("\n" + "=" * 70)
print("SURAKSHA DATASET SANITY CHECK")
print("=" * 70)

if not DATA_PATH.exists():
    print(f"\nERROR: Dataset not found at: {DATA_PATH}")
    print("Make sure the file is inside the data/ folder.")
    raise SystemExit(1)

df = pd.read_csv(DATA_PATH)

print(f"\nDataset loaded: {DATA_PATH}")
print(f"Shape: {df.shape}")


# ============================================================
# 1. ROW COUNT
# ============================================================

print("\n--- BASIC STRUCTURE ---")

check(
    len(df) == EXPECTED_ROWS,
    f"Row count = {len(df):,} (expected {EXPECTED_ROWS:,})"
)


# ============================================================
# 2. COLUMN CHECK
# ============================================================

check(
    list(df.columns) == EXPECTED_COLUMNS,
    "Columns match the expected 29-column schema"
)

if list(df.columns) != EXPECTED_COLUMNS:
    print("\nExpected columns:")
    print(EXPECTED_COLUMNS)

    print("\nActual columns:")
    print(list(df.columns))


# ============================================================
# 3. SHIPMENT COUNT
# ============================================================

shipment_count = df["shipment_id"].nunique()

check(
    shipment_count == EXPECTED_SHIPMENTS,
    f"Unique shipments = {shipment_count} (expected {EXPECTED_SHIPMENTS})"
)


# ============================================================
# 4. READINGS PER SHIPMENT
# ============================================================

readings_per_shipment = df.groupby("shipment_id").size()

check(
    readings_per_shipment.nunique() == 1
    and readings_per_shipment.iloc[0] == EXPECTED_READINGS_PER_SHIPMENT,
    "Every shipment contains exactly 100 readings"
)

print("\nReadings per shipment:")
print(readings_per_shipment.value_counts().sort_index())


# ============================================================
# 5. MISSING VALUES
# ============================================================

missing_total = int(df.isna().sum().sum())

check(
    missing_total == 0,
    f"Missing values = {missing_total}"
)

if missing_total > 0:
    print("\nMissing values by column:")
    print(df.isna().sum()[df.isna().sum() > 0])


# ============================================================
# 6. DUPLICATE ROWS
# ============================================================

duplicate_rows = int(df.duplicated().sum())

check(
    duplicate_rows == 0,
    f"Duplicate rows = {duplicate_rows}"
)


# ============================================================
# 7. TIMESTAMP
# ============================================================

print("\n--- TIMESTAMP CHECK ---")

df["timestamp_parsed"] = pd.to_datetime(
    df["timestamp"],
    errors="coerce"
)

invalid_timestamps = int(df["timestamp_parsed"].isna().sum())

check(
    invalid_timestamps == 0,
    f"Invalid timestamps = {invalid_timestamps}"
)


# ============================================================
# 8. CHRONOLOGICAL ORDER
# ============================================================

chronological_failures = 0

for shipment_id, group in df.groupby("shipment_id"):
    times = group["timestamp_parsed"]

    if not times.is_monotonic_increasing:
        chronological_failures += 1

check(
    chronological_failures == 0,
    f"Chronological shipments with errors = {chronological_failures}"
)


# ============================================================
# 9. PRODUCT TYPES
# ============================================================

print("\n--- PRODUCT TYPES ---")

print(df["product_type"].value_counts())

expected_products = {
    "vaccine",
    "refrigerated_medicine",
    "room_temperature_medicine",
}

actual_products = set(df["product_type"].unique())

check(
    actual_products == expected_products,
    "Product types match expected categories"
)


# ============================================================
# 10. NUMERIC COLUMNS
# ============================================================

print("\n--- NUMERIC COLUMN CHECK ---")

numeric_columns = [
    col for col in EXPECTED_COLUMNS
    if col not in ["timestamp", "shipment_id", "product_type"]
]

non_numeric_columns = []

for col in numeric_columns:
    if not pd.api.types.is_numeric_dtype(df[col]):
        non_numeric_columns.append(col)

check(
    len(non_numeric_columns) == 0,
    "All expected numeric columns contain numeric data"
)

if non_numeric_columns:
    print("Non-numeric columns:")
    print(non_numeric_columns)


# ============================================================
# 11. TARGET VALIDATION
# ============================================================

print("\n--- TARGET CHECK ---")

risk = df["spoilage_risk"]
safe_time = df["estimated_remaining_safe_time"]

check(
    risk.between(0, 100).all(),
    "spoilage_risk is between 0 and 100"
)

check(
    (safe_time >= 0).all(),
    "estimated_remaining_safe_time contains no negative values"
)

print("\nSpoilage risk statistics:")
print(risk.describe())

print("\nRemaining safe time statistics:")
print(safe_time.describe())


# ============================================================
# 12. CRITICAL CONDITION CHECK
# ============================================================

critical_rows = df["spoilage_risk"] >= 100

if critical_rows.any():

    critical_safe_time = safe_time[critical_rows]

    critical_zero = (critical_safe_time == 0).all()

    check(
        critical_zero,
        "Rows with spoilage_risk = 100 have 0 remaining safe time"
    )

else:
    warnings.append(
        "No rows with spoilage_risk >= 100 were found."
    )
    print("WARNING No critical-risk rows found")


# ============================================================
# 13. CUMULATIVE FEATURE CHECK
# ============================================================

print("\n--- CUMULATIVE FEATURE CHECK ---")

cumulative_columns = [
    "time_outside_temp_range",
    "time_outside_humidity_range",
    "cumulative_temp_exposure",
    "cumulative_humidity_exposure",
    "max_temp_deviation",
    "max_shock",
]

for column in cumulative_columns:

    failures = 0

    for shipment_id, group in df.groupby("shipment_id"):

        values = group[column].values

        if np.any(np.diff(values) < -1e-9):
            failures += 1

    check(
        failures == 0,
        f"{column} never decreases within a shipment"
    )


# ============================================================
# 14. EXCURSION COUNT
# ============================================================

print("\n--- EXCURSION CHECK ---")

excursion_failures = 0

for shipment_id, group in df.groupby("shipment_id"):

    values = group["temperature_excursion_count"].values

    if np.any(np.diff(values) < 0):
        excursion_failures += 1

check(
    excursion_failures == 0,
    "temperature_excursion_count never decreases"
)


# ============================================================
# 15. PRODUCT TEMPERATURE LOGIC
# ============================================================

print("\n--- PRODUCT LIMIT CHECK ---")

bad_temperature_limits = (
    df["min_temp"] >= df["max_temp"]
).sum()

bad_humidity_limits = (
    df["min_humidity"] >= df["max_humidity"]
).sum()

check(
    bad_temperature_limits == 0,
    f"Invalid temperature limits = {bad_temperature_limits}"
)

check(
    bad_humidity_limits == 0,
    f"Invalid humidity limits = {bad_humidity_limits}"
)


# ============================================================
# 16. COOLING STATUS
# ============================================================

cooling_values = set(df["cooling_status"].unique())

check(
    cooling_values.issubset({0, 1}),
    "cooling_status contains only 0 and 1"
)


# ============================================================
# 17. DATASET SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("DATASET SUMMARY")
print("=" * 70)

print(f"Rows:                  {len(df):,}")
print(f"Shipments:             {shipment_count}")
print(f"Columns:               {len(df.columns) - 1}")  # exclude helper timestamp
print(f"Products:              {df['product_type'].nunique()}")
print(f"Missing values:        {missing_total}")
print(f"Duplicate rows:        {duplicate_rows}")

print("\nTarget ranges:")
print(
    f"Spoilage risk:         "
    f"{risk.min():.2f} → {risk.max():.2f}"
)

print(
    f"Remaining safe time:   "
    f"{safe_time.min():.2f} → {safe_time.max():.2f} min"
)

print("\nCooling distribution:")
print(df["cooling_status"].value_counts(normalize=True).mul(100).round(2))


# ============================================================
# FINAL RESULT
# ============================================================

print("\n" + "=" * 70)

if len(errors) == 0:
    print("✅ SANITY CHECK PASSED")
    print("Dataset is ready for shipment-level train/validation/test splitting.")
else:
    print("❌ SANITY CHECK FAILED")
    print(f"Number of errors: {len(errors)}")

    print("\nErrors:")
    for error in errors:
        print(f"  - {error}")

if warnings:
    print("\nWarnings:")
    for warning in warnings:
        print(f"  - {warning}")

print("=" * 70)