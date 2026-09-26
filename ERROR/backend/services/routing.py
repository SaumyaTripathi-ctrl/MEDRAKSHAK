# services/routing.py

import math
from concurrent.futures import ThreadPoolExecutor

import requests


OSRM_URL = (
    "https://router.project-osrm.org/"
    "route/v1/driving/"
)

# Was 10s. rank_facilities_by_route() calls get_route() once per candidate
# facility (up to 5) -- at 10s each, run sequentially, a single unreachable
# OSRM request could stall an entire /sensor-data response for up to 50
# seconds. Routing calls are now also run in parallel (see
# rank_facilities_by_route below), so this timeout only needs to cover one
# slow-but-working request, not mask a fully blocked network.
OSRM_TIMEOUT_SECONDS = 4


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
            timeout=OSRM_TIMEOUT_SECONDS
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
        print(f"OSRM unavailable: {error}")

        distance_km = calculate_fallback_distance_km(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude
        )

        estimated_time_minutes = (distance_km / 30.0) * 60.0

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

def _route_one_facility(origin_latitude, origin_longitude, facility):
    try:
        route = get_route(
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
            destination_latitude=facility["latitude"],
            destination_longitude=facility["longitude"]
        )

        facility_result = facility.copy()
        facility_result.update(route)
        return facility_result

    except Exception as error:
        print(
            f"Facility routing failed for "
            f"{facility.get('facility_id')}: "
            f"{error}"
        )
        return None


def rank_facilities_by_route(
    origin_latitude,
    origin_longitude,
    facilities
):
    """
    Adds routing information to each candidate facility
    and ranks them by travel time.

    Routes all candidates concurrently rather than one request at a time --
    with up to 5 candidate facilities and each OSRM call allowed up to
    OSRM_TIMEOUT_SECONDS, a sequential loop could take 5x as long in the
    worst case (a slow/unreachable OSRM server) as running them in
    parallel, which was making the reroute recommendation feel like it had
    hung during a live demo.
    """
    if not facilities:
        return []

    with ThreadPoolExecutor(max_workers=min(len(facilities), 5)) as pool:
        results = list(pool.map(
            lambda facility: _route_one_facility(origin_latitude, origin_longitude, facility),
            facilities
        ))

    routed_facilities = [r for r in results if r is not None]

    routed_facilities.sort(
        key=lambda x: x["travel_time_minutes"]
    )

    return routed_facilities
