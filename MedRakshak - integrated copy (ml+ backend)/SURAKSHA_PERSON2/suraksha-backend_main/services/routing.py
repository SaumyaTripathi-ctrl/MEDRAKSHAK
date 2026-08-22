# services/routing.py

import math
import requests


OSRM_URL = (
    "https://router.project-osrm.org/"
    "route/v1/driving/"
)


# =========================================================
# FALLBACK DISTANCE
# =========================================================

def calculate_fallback_distance_km(
    latitude1,
    longitude1,
    latitude2,
    longitude2
):
    """
    Calculates straight-line distance using Haversine.

    This is a FALLBACK only.
    It is NOT road distance.
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


# =========================================================
# GET ROUTE
# =========================================================

def get_route(
    origin_latitude,
    origin_longitude,
    destination_latitude,
    destination_longitude
):
    """
    Attempts to obtain actual driving distance and ETA
    using OSRM.

    If OSRM is unavailable, returns a clearly labelled
    estimated fallback instead.
    """

    url = (
        f"{OSRM_URL}"
        f"{origin_longitude},{origin_latitude};"
        f"{destination_longitude},{destination_latitude}"
    )

    params = {
        "overview": "false"
    }

    try:

        response = requests.get(
            url,
            params=params,
            timeout=10
        )

        response.raise_for_status()

        data = response.json()

        if data.get("code") != "Ok":
            raise RuntimeError(
                "OSRM returned an unsuccessful response"
            )

        route = data["routes"][0]

        return {
            "road_distance_km": round(
                route["distance"] / 1000,
                2
            ),

            "travel_time_minutes": round(
                route["duration"] / 60,
                2
            ),

            "routing_source": "OSRM",

            "routing_status": "road_route"
        }

    except Exception as error:

        print(
            f"OSRM unavailable: {error}"
        )

        # ---------------------------------------------
        # FALLBACK
        # ---------------------------------------------

        distance_km = calculate_fallback_distance_km(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude
        )

        # Simple prototype estimate.
        # 30 km/h is used only for fallback demonstration.
        estimated_time_minutes = (
            distance_km / 30.0
        ) * 60.0

        return {
            "road_distance_km": round(
                distance_km,
                2
            ),

            "travel_time_minutes": round(
                estimated_time_minutes,
                2
            ),

            "routing_source": "fallback",

            "routing_status": "estimated",

            "routing_note": (
                "Road routing unavailable. "
                "Distance and ETA are estimated "
                "from geographic distance."
            )
        }


# =========================================================
# RANK FACILITIES
# =========================================================

def rank_facilities_by_route(
    origin_latitude,
    origin_longitude,
    facilities
):
    """
    Adds routing information to each candidate facility
    and ranks them by travel time.
    """

    routed_facilities = []

    for facility in facilities:

        try:

            route = get_route(
                origin_latitude=origin_latitude,
                origin_longitude=origin_longitude,

                destination_latitude=facility["latitude"],
                destination_longitude=facility["longitude"]
            )

            facility_result = facility.copy()

            facility_result.update(route)

            routed_facilities.append(
                facility_result
            )

        except Exception as error:

            print(
                f"Facility routing failed for "
                f"{facility.get('facility_id')}: "
                f"{error}"
            )

    routed_facilities.sort(
        key=lambda x: x["travel_time_minutes"]
    )

    return routed_facilities