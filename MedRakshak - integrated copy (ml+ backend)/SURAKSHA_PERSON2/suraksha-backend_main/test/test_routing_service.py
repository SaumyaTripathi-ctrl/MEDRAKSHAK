from services.routing import get_route


result = get_route(
    origin_latitude=13.0827,
    origin_longitude=80.2707,

    destination_latitude=13.085737,
    destination_longitude=80.2814
)


print("\nROUTING SERVICE")
print("----------------")

print(
    "Road distance:",
    result["road_distance_km"],
    "km"
)

print(
    "Travel time:",
    result["travel_time_minutes"],
    "minutes"
)

def rank_facilities_by_route(
    origin_latitude,
    origin_longitude,
    facilities
):
    """
    Adds road distance and travel time to each facility
    and sorts facilities by estimated travel time.
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
                f"Routing failed for "
                f"{facility.get('facility_id')}: "
                f"{error}"
            )

    # Rank by actual travel time
    routed_facilities.sort(
        key=lambda x: x["travel_time_minutes"]
    )

    return routed_facilities