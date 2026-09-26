import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predict import predict
from services.features import calculate_features, reset_state
from services.weather import get_weather
from services.cold_storage import find_suitable_facilities
from services.routing import rank_facilities_by_route


app = FastAPI(
    title="SURAKSHA API",
    description="Pharmaceutical Cold Chain Monitoring & Emergency Rerouting Backend",
    version="1.0.0"
)

# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------
# The React frontend (Vite dev server, http://127.0.0.1:5174) and the
# BLE gateway page both call this API directly from the browser, which
# the browser blocks unless the server explicitly allows it. This is a
# local prototype (not exposed to the public internet), so we allow any
# origin for simplicity — tighten allow_origins before deploying this
# anywhere beyond a laptop demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# PRODUCT PROFILES LOADER
# ---------------------------------------------------------

PRODUCT_PROFILES_PATH = (
    Path(__file__).resolve().parent
    / "data"
    / "product_profiles.json"
)


def load_product_profiles():
    with open(PRODUCT_PROFILES_PATH, "r") as f:
        return json.load(f)


PRODUCT_PROFILES = load_product_profiles()


# ---------------------------------------------------------
# COLD-STORAGE RECOMMENDATION CACHE
# ---------------------------------------------------------
# The frontend posts a new /sensor-data reading every ~2 seconds. Without
# this cache, EVERY one of those readings while risk_level == "CRITICAL"
# used to trigger a fresh facility search plus up to 5 live network calls
# to the public OSRM routing API (router.project-osrm.org) -- i.e. once
# every 2 seconds for as long as the CRITICAL episode lasts. That public
# instance is meant for light/occasional use and rate-limits or slows down
# under sustained automated traffic like that, which is what was actually
# behind "the reroute feature isn't working" -- the very first CRITICAL
# reading usually succeeds (which is why it can look like it's working),
# then subsequent calls a few seconds later get throttled or time out.
#
# Fix: recompute the recommendation for a given shipment_id at most once
# every COLD_STORAGE_CACHE_SECONDS, reusing the cached result in between.
# The rest of the /sensor-data response (temperature, risk, etc.) still
# updates every single reading -- only the facility/routing lookup itself
# is throttled.
COLD_STORAGE_CACHE_SECONDS = 30
cold_storage_cache = {}  # shipment_id -> {"computed_at": datetime, "recommendation": dict}

# ---------------------------------------------------------
# WEATHER CACHE
# ---------------------------------------------------------
# Same problem as the cold-storage cache above, but on every single
# reading instead of only during CRITICAL: get_weather() was a live,
# uncached HTTP call to the public Open-Meteo API (10s timeout) on EVERY
# /sensor-data POST, and the frontend posts one of those every ~2 seconds
# for as long as a shipment is connected. GPS position barely moves across
# a handful of 2-second readings in this demo, so there's no need to
# re-fetch weather that often -- and doing so is exactly what was making
# /sensor-data feel slow (each request blocking on an external network
# round trip before the prediction could return), the same failure mode
# already fixed for OSRM routing above.
WEATHER_CACHE_SECONDS = 60
weather_cache = {}  # shipment_id -> {"computed_at": datetime, "weather": dict}


def get_cached_weather(shipment_id: str, latitude: float, longitude: float, current_timestamp: datetime):
    cache_entry = weather_cache.get(shipment_id)
    cache_age_seconds = (
        (current_timestamp - cache_entry["computed_at"]).total_seconds()
        if cache_entry else None
    )

    if cache_entry is not None and cache_age_seconds is not None and 0 <= cache_age_seconds < WEATHER_CACHE_SECONDS:
        return cache_entry["weather"]

    weather = get_weather(latitude=latitude, longitude=longitude)
    weather_cache[shipment_id] = {
        "computed_at": current_timestamp,
        "weather": weather
    }
    return weather


def get_product_limits(product_type: str):
    if product_type not in PRODUCT_PROFILES:
        raise ValueError(f"Unknown product_type: '{product_type}'. Valid types: {list(PRODUCT_PROFILES.keys())}")
    return PRODUCT_PROFILES[product_type]


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "SURAKSHA backend"
    }


# =========================================================
# RESET SHIPMENT STATE
# =========================================================
# Clears the accumulated per-shipment ML features (cumulative exposure,
# time outside range, excursion count, etc.) for one shipment_id. The
# frontend always reuses the same constant shipment_id across every demo
# run, so without this, switching product category or simply reconnecting
# inherits whatever excursion state the previous run built up — which is
# what was causing a fresh Room-Temperature Medicine run to show CRITICAL
# immediately from a barely-out-of-range reading, right after a Vaccine
# run had spent a while accumulating a large excursion under its much
# tighter range. Called from handleConnectDevice() in App.jsx at the start
# of every new run.
@app.post("/reset-shipment/{shipment_id}")
def reset_shipment(shipment_id: str):
    reset_state(shipment_id)
    cold_storage_cache.pop(shipment_id, None)
    weather_cache.pop(shipment_id, None)
    return {
        "status": "reset",
        "shipment_id": shipment_id
    }


# =========================================================
# SENSOR DATA MODEL
# =========================================================

class SensorData(BaseModel):
    shipment_id: str
    product_type: str

    temperature: float
    humidity: float
    shock: float

    latitude: float
    longitude: float

    timestamp: datetime

    cooling_status: int = 0

    # "real" (default) = production model pair trained on real cold-chain
    # data. "demo" = fast-reacting model pair trained on synthetic
    # ambient-only trajectories, for live bench-test demos. See
    # predict.py's module docstring / predict() for the full rationale.
    model_mode: str = "real"


# =========================================================
# SENSOR DATA ENDPOINT
# =========================================================

@app.post("/sensor-data")
def receive_sensor_data(data: SensorData):
    # -----------------------------------------
    # PRODUCT PROFILES LOOKUP
    # -----------------------------------------
    try:
        profile = get_product_limits(data.product_type)
    except ValueError as e:
        return {
            "status": "error",
            "message": str(e)
        }

    min_temp = float(profile["min_temp"])
    max_temp = float(profile["max_temp"])
    min_humidity = float(profile["min_humidity"])
    max_humidity = float(profile["max_humidity"])

    # -----------------------------------------
    # LIVE WEATHER USING GPS (cached — see WEATHER_CACHE_SECONDS above)
    # -----------------------------------------
    weather = get_cached_weather(
        shipment_id=data.shipment_id,
        latitude=data.latitude,
        longitude=data.longitude,
        current_timestamp=data.timestamp
    )

    # -----------------------------------------
    # CALCULATE COMPLETE 25-FEATURE ML VECTOR
    # -----------------------------------------
    features = calculate_features(
        shipment_id=data.shipment_id,
        product_type=data.product_type,
        temperature=data.temperature,
        humidity=data.humidity,
        shock=data.shock,
        current_timestamp=data.timestamp,
        min_temp=min_temp,
        max_temp=max_temp,
        min_humidity=min_humidity,
        max_humidity=max_humidity,
        external_temperature=weather["external_temperature"],
        external_humidity=weather["external_humidity"],
        rain_probability=weather["rain_probability"],
        wind_speed=weather["wind_speed"],
        cooling_status=data.cooling_status
    )

    # -----------------------------------------
    # ML PREDICTION
    # -----------------------------------------
    prediction_result = predict(features, mode=data.model_mode)

    # -----------------------------------------
    # CRITICAL RISK -> EMERGENCY REROUTING
    # -----------------------------------------
    cold_storage_recommendation = None

    if prediction_result["risk_level"] == "CRITICAL":
        cache_entry = cold_storage_cache.get(data.shipment_id)
        cache_age_seconds = (
            (data.timestamp - cache_entry["computed_at"]).total_seconds()
            if cache_entry else None
        )

        if cache_entry is not None and cache_age_seconds is not None and cache_age_seconds < COLD_STORAGE_CACHE_SECONDS:
            # Reuse the recent recommendation instead of hammering the
            # facility search + OSRM again on this reading -- see the
            # COLD_STORAGE_CACHE_SECONDS comment above.
            cold_storage_recommendation = cache_entry["recommendation"]
        else:
            facilities = find_suitable_facilities(
                latitude=data.latitude,
                longitude=data.longitude,
                min_required_temp=min_temp,
                max_required_temp=max_temp,
                min_available_capacity=0,
                limit=5
            )

            if facilities:
                routed_facilities = rank_facilities_by_route(
                    origin_latitude=data.latitude,
                    origin_longitude=data.longitude,
                    facilities=facilities
                )

                if routed_facilities:
                    recommended = routed_facilities[0]
                    alternatives = routed_facilities[1:]

                    cold_storage_recommendation = {
                        "recommendation_available": True,
                        "recommended_facility": recommended,
                        "alternatives": alternatives,
                        "selection_reason": (
                            "Lowest estimated road travel time "
                            "among suitable active facilities."
                        )
                    }
                else:
                    cold_storage_recommendation = {
                        "recommendation_available": False,
                        "message": "Suitable facilities found, but routing service was unavailable."
                    }
            else:
                cold_storage_recommendation = {
                    "recommendation_available": False,
                    "message": "No suitable active cold-storage facilities found."
                }

            cold_storage_cache[data.shipment_id] = {
                "computed_at": data.timestamp,
                "recommendation": cold_storage_recommendation
            }
    else:
        # Left CRITICAL (or never entered it) -- drop any cached
        # recommendation so the next CRITICAL episode computes fresh
        # rather than reusing a stale one from a previous excursion.
        cold_storage_cache.pop(data.shipment_id, None)

    # -----------------------------------------
    # COMPLETE RESPONSE
    # -----------------------------------------
    response = {
        "status": "received",
        "shipment": {
            "shipment_id": data.shipment_id,
            "product_type": data.product_type,
            "model_mode": data.model_mode
        },
        "sensor_data": {
            "temperature": data.temperature,
            "humidity": data.humidity,
            "shock": data.shock,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "timestamp": data.timestamp,
            "cooling_status": data.cooling_status
        },
        "weather": weather,
        "prediction": prediction_result
    }

    if cold_storage_recommendation is not None:
        response["cold_storage_recommendation"] = cold_storage_recommendation

    return response


# =========================================================
# NEARBY SUITABLE COLD-STORAGE FACILITIES
# =========================================================

@app.get("/nearby-facilities")
def nearby_facilities(
    latitude: float,
    longitude: float,
    product_type: str,
    min_available_capacity: float = 0,
    limit: int = 5
):
    try:
        profile = get_product_limits(product_type)
    except ValueError as e:
        return {
            "status": "error",
            "message": str(e)
        }

    min_required_temp = float(profile["min_temp"])
    max_required_temp = float(profile["max_temp"])

    facilities = find_suitable_facilities(
        latitude=latitude,
        longitude=longitude,
        min_required_temp=min_required_temp,
        max_required_temp=max_required_temp,
        min_available_capacity=min_available_capacity,
        limit=limit
    )

    return {
        "status": "success",
        "search_location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "product_type": product_type,
        "required_temperature_range": {
            "min": min_required_temp,
            "max": max_required_temp
        },
        "facilities_found": len(facilities),
        "facilities": facilities
    }


# =========================================================
# REROUTE RECOMMENDATION
# =========================================================

@app.get("/reroute-recommendation")
def reroute_recommendation(
    latitude: float,
    longitude: float,
    product_type: str,
    min_available_capacity: float = 0,
    candidate_limit: int = 5
):
    try:
        profile = get_product_limits(product_type)
    except ValueError as e:
        return {
            "status": "error",
            "message": str(e)
        }

    min_required_temp = float(profile["min_temp"])
    max_required_temp = float(profile["max_temp"])

    facilities = find_suitable_facilities(
        latitude=latitude,
        longitude=longitude,
        min_required_temp=min_required_temp,
        max_required_temp=max_required_temp,
        min_available_capacity=min_available_capacity,
        limit=candidate_limit
    )

    if not facilities:
        return {
            "status": "success",
            "recommendation_available": False,
            "message": "No suitable cold-storage facilities found."
        }

    routed_facilities = rank_facilities_by_route(
        origin_latitude=latitude,
        origin_longitude=longitude,
        facilities=facilities
    )

    if not routed_facilities:
        return {
            "status": "success",
            "recommendation_available": False,
            "message": "Suitable facilities found, but routing is unavailable."
        }

    recommended = routed_facilities[0]
    alternatives = routed_facilities[1:]

    return {
        "status": "success",
        "recommendation_available": True,
        "search_location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "product_type": product_type,
        "required_temperature_range": {
            "min": min_required_temp,
            "max": max_required_temp
        },
        "recommended_facility": recommended,
        "alternatives": alternatives,
        "selection_reason": (
            "Lowest estimated road travel time "
            "among suitable active facilities."
        )
    }
