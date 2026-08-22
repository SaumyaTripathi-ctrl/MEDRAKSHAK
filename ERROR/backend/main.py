import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predict import predict
from services.features import calculate_features
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
    # LIVE WEATHER USING GPS
    # -----------------------------------------
    weather = get_weather(
        latitude=data.latitude,
        longitude=data.longitude
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
    prediction_result = predict(features)

    # -----------------------------------------
    # CRITICAL RISK -> EMERGENCY REROUTING
    # -----------------------------------------
    cold_storage_recommendation = None

    if prediction_result["risk_level"] == "CRITICAL":
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

    # -----------------------------------------
    # COMPLETE RESPONSE
    # -----------------------------------------
    response = {
        "status": "received",
        "shipment": {
            "shipment_id": data.shipment_id,
            "product_type": data.product_type
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
