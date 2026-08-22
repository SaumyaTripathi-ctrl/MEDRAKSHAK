from datetime import datetime

from fastapi import FastAPI
from pydantic import BaseModel

from services.features import calculate_features
from services.weather import get_weather
from services.cold_storage import find_suitable_facilities
from services.routing import rank_facilities_by_route


app = FastAPI(
    title="SURAKSHA API",
    description="Pharmaceutical Cold Chain Monitoring Backend",
    version="1.0.0"
)


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

    cooling_status: int


# =========================================================
# SENSOR DATA ENDPOINT
# =========================================================

@app.post("/sensor-data")
def receive_sensor_data(data: SensorData):

    # -----------------------------------------
    # PRODUCT TEMPERATURE LIMITS
    # -----------------------------------------

    if data.product_type in [
        "vaccine",
        "refrigerated_medicine"
    ]:
        min_temp = 2.0
        max_temp = 8.0

    elif data.product_type == "room_temperature_medicine":
        min_temp = 15.0
        max_temp = 25.0

    else:
        return {
            "status": "error",
            "message": "Unknown product_type"
        }

    # -----------------------------------------
    # PROTOTYPE HUMIDITY LIMITS
    # -----------------------------------------

    min_humidity = 30.0
    max_humidity = 70.0

    # -----------------------------------------
    # CALCULATE DERIVED SENSOR FEATURES
    # -----------------------------------------

    features = calculate_features(
        shipment_id=data.shipment_id,

        temperature=data.temperature,
        humidity=data.humidity,
        shock=data.shock,

        current_timestamp=data.timestamp,

        min_temp=min_temp,
        max_temp=max_temp,

        min_humidity=min_humidity,
        max_humidity=max_humidity
    )

    # -----------------------------------------
    # GET LIVE WEATHER USING GPS
    # -----------------------------------------

    weather = get_weather(
        latitude=data.latitude,
        longitude=data.longitude
    )

    # -----------------------------------------
    # RETURN COMPLETE SENSOR RESPONSE
    # -----------------------------------------

    return {
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

        "derived_features": features,

        "weather": weather
    }


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

    # -----------------------------------------
    # PRODUCT TEMPERATURE REQUIREMENTS
    # -----------------------------------------

    if product_type in [
        "vaccine",
        "refrigerated_medicine"
    ]:
        min_required_temp = 2.0
        max_required_temp = 8.0

    elif product_type == "room_temperature_medicine":
        min_required_temp = 15.0
        max_required_temp = 25.0

    else:
        return {
            "status": "error",
            "message": "Unknown product_type"
        }

    # -----------------------------------------
    # FIND SUITABLE FACILITIES
    # -----------------------------------------

    facilities = find_suitable_facilities(
        latitude=latitude,
        longitude=longitude,

        min_required_temp=min_required_temp,
        max_required_temp=max_required_temp,

        min_available_capacity=min_available_capacity,

        limit=limit
    )

    # -----------------------------------------
    # RETURN FACILITY RESULTS
    # -----------------------------------------

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

    # -----------------------------------------
    # PRODUCT TEMPERATURE REQUIREMENTS
    # -----------------------------------------

    if product_type in [
        "vaccine",
        "refrigerated_medicine"
    ]:
        min_required_temp = 2.0
        max_required_temp = 8.0

    elif product_type == "room_temperature_medicine":
        min_required_temp = 15.0
        max_required_temp = 25.0

    else:
        return {
            "status": "error",
            "message": "Unknown product_type"
        }

    # -----------------------------------------
    # FIND SUITABLE FACILITIES
    # -----------------------------------------

    facilities = find_suitable_facilities(
        latitude=latitude,
        longitude=longitude,

        min_required_temp=min_required_temp,
        max_required_temp=max_required_temp,

        min_available_capacity=min_available_capacity,

        limit=candidate_limit
    )

    # -----------------------------------------
    # NO SUITABLE FACILITIES
    # -----------------------------------------

    if not facilities:
        return {
            "status": "success",
            "recommendation_available": False,
            "message": "No suitable cold-storage facilities found."
        }

    # -----------------------------------------
    # GET ACTUAL ROAD DISTANCE + ETA
    # -----------------------------------------

    routed_facilities = rank_facilities_by_route(
        origin_latitude=latitude,
        origin_longitude=longitude,
        facilities=facilities
    )

    # -----------------------------------------
    # ROUTING FAILED
    # -----------------------------------------

    if not routed_facilities:
        return {
            "status": "success",
            "recommendation_available": False,
            "message": "Suitable facilities found, but routing is unavailable."
        }

    # -----------------------------------------
    # BEST FACILITY = LOWEST TRAVEL TIME
    # -----------------------------------------

    recommended = routed_facilities[0]

    alternatives = routed_facilities[1:]

    # -----------------------------------------
    # FINAL RESPONSE
    # -----------------------------------------

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