from services.cold_storage import find_suitable_facilities
from services.routing import rank_facilities_by_route


shipment_latitude = 13.0827
shipment_longitude = 80.2707


# Find suitable vaccine facilities
facilities = find_suitable_facilities(
    latitude=shipment_latitude,
    longitude=shipment_longitude,

    min_required_temp=2.0,
    max_required_temp=8.0,

    min_available_capacity=0,

    limit=5
)


# Add actual road distance and ETA
results = rank_facilities_by_route(
    origin_latitude=shipment_latitude,
    origin_longitude=shipment_longitude,
    facilities=facilities
)


print("\nREROUTE RECOMMENDATION")
print("----------------------")


for i, facility in enumerate(results, start=1):

    print(
        f"\n{i}. {facility['facility_name']}"
    )

    print(
        f"   Straight-line: "
        f"{facility['distance_km']:.2f} km"
    )

    print(
        f"   Road distance: "
        f"{facility['road_distance_km']:.2f} km"
    )

    print(
        f"   ETA: "
        f"{facility['travel_time_minutes']:.2f} min"
    )

    print(
        f"   Capacity: "
        f"{facility['available_capacity']}"
    )