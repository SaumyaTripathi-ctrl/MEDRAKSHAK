"""
generate_demo_dataset.py

Generates a synthetic "demo" training dataset and trains a second pair of
models (demo_spoilage_risk_model.pkl / demo_remaining_safe_time_model.pkl)
tuned for a LIVE BENCH-TEST DEMO, as opposed to the real product model in
spoilage_risk_model.pkl / remaining_safe_time_model.pkl.

Why this exists: the real trained model puts ~91% of its decision weight on
cumulative_temp_exposure (deviation x minutes accumulated) because the real
dataset only ever showed large deviations after hours of gradual drift. That
model is correct for real-world cold-chain shipments, but useless for a
live demo where the only achievable condition is ambient room-temperature
drift (~20-35C) over a couple of minutes, plus opening the lid / shaking the
box (already handled by separate, non-ML door/shock alerts).

This script instead builds short (up to 5 minute) synthetic sensor
trajectories at realistic ambient temperatures, runs them through the REAL
backend feature-engineering function (services/features.calculate_features)
so the engineered features are computed EXACTLY the way the live backend
computes them, and then labels each row with a fast-reacting risk formula
that keys primarily on deviation MAGNITUDE with only a short (~0-90s) time
ramp -- so a demo can visibly climb SAFE -> WARNING -> CRITICAL within
seconds to about two minutes, matching what's actually achievable live.

Run with the SAME scikit-learn version the app is pinned to (1.9.0) so the
resulting pickles load cleanly in the real backend:
    pip install pandas numpy scikit-learn==1.9.0 joblib
    python generate_demo_dataset.py
"""

import json
import math
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.features import calculate_features, clear_all_states  # noqa: E402

random.seed(42)
np.random.seed(42)

PRODUCT_PROFILES = {
    "vaccine": {"min_temp": 2, "max_temp": 8, "min_humidity": 30, "max_humidity": 70},
    "refrigerated_medicine": {"min_temp": 2, "max_temp": 8, "min_humidity": 30, "max_humidity": 70},
    "room_temperature_medicine": {"min_temp": 15, "max_temp": 25, "min_humidity": 30, "max_humidity": 70},
}

STEP_SECONDS = 2  # matches the firmware's real telemetry cadence
MAX_STEPS = 150   # up to 5 minutes per synthetic trajectory

# Achievable live-demo ambient range (per user: ambient drift only, no ice
# / heat gun) -- a hand cupped over the sensor or the room itself can
# realistically swing it through roughly this band.
AMBIENT_MIN_C = 19.0
AMBIENT_MAX_C = 36.0


def demo_risk_and_safe_time(feat, ):
    """
    Fast-reacting label formula. Keys mainly on how far out of range the
    CURRENT reading is (temperature_deviation), with only a short time
    ramp so it doesn't just hard-switch at t=0, but reaches full severity
    within about 60-90 seconds rather than the ~15-30 minutes the real
    dataset's patterns imply.

    IMPORTANT: this deliberately uses the CURRENT instantaneous deviation
    (temperature_deviation), not the historical worst-case-ever deviation
    (max_temp_deviation). An earlier draft used max_temp_deviation, which
    is monotonically non-decreasing for the life of a shipment (it only
    ever grows, see services/features.py) -- correct for the REAL model
    (a shipment that once got hot is treated as spoiled forever, it
    doesn't get "safe" again just because it cooled back down), but wrong
    for a live DEMO, where the whole point is showing the LED/risk
    recover as the presenter fixes the condition. Using max_temp_deviation
    is exactly why testing showed the LED getting stuck on red and the
    buzzer refusing to stop even after the box was back in a safe state --
    the backend kept reporting CRITICAL forever because it was still
    scoring the worst moment of the run, not the current one.
    """
    dev = feat["temperature_deviation"]
    minutes = feat["time_outside_temp_range"]

    # Saturating severity curve from deviation magnitude alone.
    # ~50 at 2.2C over, ~80 at 5C over, ~95+ by 9C+ over -- reachable by a
    # sustained hand/breath push a few degrees above a 15-25C room-temp
    # range, and trivially reachable by ambient room temp alone against a
    # tight 2-8C cold-chain range.
    severity = 100.0 * (1.0 - math.exp(-dev / 3.2))

    # Time ramp: partial reaction immediately (an audience sees SOME
    # movement right away), full effect by ~75 seconds outside range.
    ramp = min(1.0, 0.35 + minutes / 1.25)

    risk = severity * ramp

    # Small secondary contributions, consistent in direction with the real
    # dataset's (much weaker) humidity/shock correlations. Deliberately
    # capped low -- shock/lid-open events are handled by their own
    # edge-triggered popups, not meant to single-handedly drive the ML risk
    # score into CRITICAL.
    risk += min(8.0, feat["humidity_deviation"] * 0.25)
    risk += min(12.0, feat["shock_count"] * 3.0)

    # NOTE: earlier drafts multiplied risk by 0.85 once cooling_status == 1
    # (mirroring "active cooling kicked in, so risk eases"). Removed: in a
    # live hand-held demo nothing is actually cooling the box, so that
    # multiplier just put an artificial ceiling on how high risk could
    # climb the moment temperature first exceeded range -- exactly the
    # "stuck at WARNING, never reaches CRITICAL" symptom seen in testing.
    # cooling_status is still recorded as a feature (for consistency with
    # the real model's schema) but no longer suppresses the label.

    risk = max(0.0, min(100.0, risk))

    # Inverse relationship for remaining safe time, scaled for a demo
    # context (not meant to match the real model's minute-for-minute
    # scale -- this is a distinctly-labeled DEMO MODE prediction).
    safe_time = max(0.0, 180.0 * (1.0 - risk / 100.0) ** 1.6)

    return round(risk, 2), round(safe_time, 2)


def make_trajectory(shipment_idx, product_type):
    profile = PRODUCT_PROFILES[product_type]
    min_temp, max_temp = profile["min_temp"], profile["max_temp"]
    min_hum, max_hum = profile["min_humidity"], profile["max_humidity"]

    shipment_id = f"DEMO_{shipment_idx:05d}"
    clear_all_states()  # each synthetic shipment is independent; cheap since it's keyed by id anyway

    n_steps = random.randint(20, MAX_STEPS)
    base_time = datetime(2026, 1, 1, 12, 0, 0)

    # Trajectory shape, mimicking what a presenter can actually do live:
    shape = random.choices(
        ["stay_safe", "ramp_and_hold", "ramp_and_recover", "already_hot_start"],
        weights=[0.30, 0.35, 0.25, 0.10],
    )[0]

    safe_temp = round(random.uniform(min_temp + 0.3 * (max_temp - min_temp),
                                      max_temp - 0.2 * (max_temp - min_temp)), 2)
    # Clamp the "resting" temperature into what's achievable at ambient too,
    # for products whose safe range already overlaps ambient (room-temp meds).
    safe_temp = max(AMBIENT_MIN_C, min(AMBIENT_MAX_C, safe_temp)) if shape != "already_hot_start" else safe_temp

    extreme_temp = round(random.uniform(AMBIENT_MIN_C, AMBIENT_MAX_C), 2)
    ramp_step = random.randint(3, min(30, n_steps - 5)) if n_steps > 10 else n_steps // 2
    recover_step = ramp_step + random.randint(20, 60)

    ext_temp = round(random.uniform(20, 38), 1)
    ext_hum = round(random.uniform(40, 85), 1)
    rain_prob = round(random.uniform(0, 90), 1)
    wind = round(random.uniform(0, 35), 1)
    humidity_base = round(random.uniform(max(35, min_hum + 5), min(65, max_hum - 5)), 1)

    rows = []
    cooling_status = 0
    for step in range(n_steps):
        t = base_time + timedelta(seconds=STEP_SECONDS * step)

        if shape == "stay_safe":
            temp = safe_temp + np.random.normal(0, 0.15)
        elif shape == "already_hot_start":
            temp = extreme_temp + np.random.normal(0, 0.2)
        elif shape == "ramp_and_hold":
            temp = safe_temp if step < ramp_step else extreme_temp
            temp += np.random.normal(0, 0.2)
        else:  # ramp_and_recover
            if step < ramp_step:
                temp = safe_temp
            elif step < recover_step:
                temp = extreme_temp
            else:
                temp = safe_temp
            temp += np.random.normal(0, 0.2)

        temp = max(AMBIENT_MIN_C - 2, min(AMBIENT_MAX_C + 1, temp))
        humidity = max(20, min(85, humidity_base + np.random.normal(0, 1.5)))

        # Rare shake/shock events and occasional lid-open aren't part of the
        # ML risk signal (handled by separate on-device/edge-triggered
        # alerts), but keep them present for feature realism.
        shock = 0.0
        if random.random() < 0.02:
            shock = round(random.uniform(0.1, 2.0), 3)

        feat = calculate_features(
            shipment_id=shipment_id,
            product_type=product_type,
            temperature=round(temp, 2),
            humidity=round(humidity, 2),
            shock=shock,
            current_timestamp=t,
            min_temp=min_temp,
            max_temp=max_temp,
            min_humidity=min_hum,
            max_humidity=max_hum,
            external_temperature=ext_temp,
            external_humidity=ext_hum,
            rain_probability=rain_prob,
            wind_speed=wind,
            cooling_status=cooling_status,
        )

        risk, safe_time = demo_risk_and_safe_time(feat)

        # Mirror the real app's feedback loop: once risk crosses into
        # WARNING territory, cooling kicks in for subsequent readings.
        cooling_status = 1 if risk >= 30 else 0

        row = dict(feat)
        row["spoilage_risk"] = risk
        row["estimated_remaining_safe_time"] = safe_time
        rows.append(row)

    return rows


def main():
    all_rows = []
    shipment_idx = 0
    for product_type in PRODUCT_PROFILES:
        for _ in range(220):
            all_rows.extend(make_trajectory(shipment_idx, product_type))
            shipment_idx += 1

    df = pd.DataFrame(all_rows)
    print(f"Generated {len(df)} rows across {shipment_idx} synthetic trajectories")
    print(df["spoilage_risk"].describe())

    out_csv = BACKEND_DIR / "data" / "suraksha_dataset_demo.csv"
    df.to_csv(out_csv, index=False)
    print(f"Saved dataset -> {out_csv}")

    feature_columns_path = BACKEND_DIR / "models" / "feature_columns.json"
    feature_columns = json.loads(feature_columns_path.read_text())["features"]

    X = df[feature_columns]
    y_risk = df["spoilage_risk"]
    y_safe_time = df["estimated_remaining_safe_time"]

    categorical = ["product_type"]
    numeric = [c for c in feature_columns if c not in categorical]

    def make_pipeline():
        preprocessor = ColumnTransformer(
            transformers=[
                ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical),
                ("numeric", "passthrough", numeric),
            ]
        )
        model = RandomForestRegressor(
            n_estimators=40,
            max_depth=8,
            min_samples_leaf=15,
            random_state=42,
            n_jobs=-1,
        )
        return Pipeline([("preprocessor", preprocessor), ("model", model)])

    print("Training demo spoilage_risk model...")
    risk_pipeline = make_pipeline()
    risk_pipeline.fit(X, y_risk)

    print("Training demo remaining_safe_time model...")
    safe_time_pipeline = make_pipeline()
    safe_time_pipeline.fit(X, y_safe_time)

    models_dir = BACKEND_DIR / "models"
    risk_out = models_dir / "demo_spoilage_risk_model.pkl"
    safe_time_out = models_dir / "demo_remaining_safe_time_model.pkl"
    joblib.dump(risk_pipeline, risk_out)
    joblib.dump(safe_time_pipeline, safe_time_out)
    print(f"Saved -> {risk_out} ({risk_out.stat().st_size / 1e6:.1f} MB)")
    print(f"Saved -> {safe_time_out} ({safe_time_out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
