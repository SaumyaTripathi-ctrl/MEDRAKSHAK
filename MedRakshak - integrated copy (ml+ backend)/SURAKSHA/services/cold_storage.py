# services/cold_storage.py

import math
from pathlib import Path
import pandas as pd


# ---------------------------------------------------------
# DATASET LOCATION
# ---------------------------------------------------------

DATA_PATH = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "cold_storage_locations.csv"
)


# ---------------------------------------------------------
# LOAD DATASET
# ---------------------------------------------------------

def load_cold_storage_data():
    """
    Loads the cold-storage facility dataset.
    """
    df = pd.read_csv(DATA_PATH)
    return df


# ---------------------------------------------------------
# DATASET SUMMARY
# ---------------------------------------------------------

def get_dataset_summary():
    """
    Returns basic information about the
    cold-storage dataset.
    """
    df = load_cold_storage_data()
    return {
        "total_facilities": len(df),
        "columns": df.columns.tolist()
    }


# ---------------------------------------------------------
# DISTANCE CALCULATION
# ---------------------------------------------------------

def calculate_distance_km(
    latitude1,
    longitude1,
    latitude2,
    longitude2
):
    """
    Calculates straight-line geographic distance
    using the Haversine formula.

    Returns distance in kilometres.
    """
    earth_radius_km = 6371.0

    lat1 = math.radians(latitude1)
    lat2 = math.radians(latitude2)

    delta_lat = math.radians(
        latitude2 - latitude1
    )

    delta_lon = math.radians(
        longitude2 - longitude1
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        +
        math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return earth_radius_km * c


# ---------------------------------------------------------
# FIND NEAREST FACILITIES
# ---------------------------------------------------------

def find_nearest_facilities(
    latitude,
    longitude,
    limit=5
):
    """
    Finds the nearest cold-storage facilities
    based on straight-line distance.
    """
    df = load_cold_storage_data().copy()

    df["distance_km"] = df.apply(
        lambda row: calculate_distance_km(
            latitude,
            longitude,
            row["latitude"],
            row["longitude"]
        ),
        axis=1
    )

    df = df.sort_values("distance_km")

    nearest = df.head(limit)

    return nearest[
        [
            "facility_id",
            "facility_name",
            "state",
            "district",
            "city",
            "latitude",
            "longitude",
            "storage_min_temp",
            "storage_max_temp",
            "available_capacity",
            "operational_status",
            "distance_km"
        ]
    ].to_dict(orient="records")


# ---------------------------------------------------------
# FIND SUITABLE FACILITIES
# ---------------------------------------------------------

def find_suitable_facilities(
    latitude,
    longitude,
    min_required_temp,
    max_required_temp,
    min_available_capacity=0,
    limit=5
):
    """
    Finds facilities that:
    1. Can accommodate the required temperature range
    2. Are ACTIVE
    3. Have sufficient available capacity

    Results are sorted by distance.
    """
    df = load_cold_storage_data().copy()

    # Temperature compatibility
    df = df[
        (df["storage_min_temp"] <= min_required_temp)
        &
        (df["storage_max_temp"] >= max_required_temp)
    ]

    # Operational status
    df = df[
        df["operational_status"]
        .astype(str)
        .str.upper()
        == "ACTIVE"
    ]

    # Available capacity
    df = df[
        df["available_capacity"] >= min_available_capacity
    ]

    # Distance
    df["distance_km"] = df.apply(
        lambda row: calculate_distance_km(
            latitude,
            longitude,
            row["latitude"],
            row["longitude"]
        ),
        axis=1
    )

    # Sort nearest first
    df = df.sort_values("distance_km")

    return df.head(limit)[
        [
            "facility_id",
            "facility_name",
            "facility_type",
            "equipment_type",
            "state",
            "district",
            "city",
            "latitude",
            "longitude",
            "storage_min_temp",
            "storage_max_temp",
            "capacity_units",
            "available_capacity",
            "operational_status",
            "available_24x7",
            "data_source",
            "distance_km"
        ]
    ].to_dict(orient="records")
