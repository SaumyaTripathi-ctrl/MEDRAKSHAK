from services.cold_storage import find_nearest_facilities


results = find_nearest_facilities(
    latitude=13.0827,
    longitude=80.2707,
    limit=5
)


print("\nNEAREST COLD-STORAGE FACILITIES")
print("--------------------------------")

for i, facility in enumerate(results, start=1):

    print(f"\n{i}. {facility['facility_name']}")

    print(
        f"   Distance: "
        f"{facility['distance_km']:.2f} km"
    )

    print(
        f"   Location: "
        f"{facility['city']}, "
        f"{facility['state']}"
    )

    print(
        f"   Temperature: "
        f"{facility['storage_min_temp']}°C "
        f"to "
        f"{facility['storage_max_temp']}°C"
    )

    print(
        f"   Available capacity: "
        f"{facility['available_capacity']}"
    )

    print(
        f"   Status: "
        f"{facility['operational_status']}"
    )