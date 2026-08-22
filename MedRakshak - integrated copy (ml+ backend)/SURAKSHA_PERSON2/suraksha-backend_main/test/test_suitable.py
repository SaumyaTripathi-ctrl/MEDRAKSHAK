from services.cold_storage import find_suitable_facilities


results = find_suitable_facilities(
    latitude=13.0827,
    longitude=80.2707,

    # Vaccine requirement
    min_required_temp=2.0,
    max_required_temp=8.0,

    # For now, any positive/zero available capacity
    min_available_capacity=0,

    limit=5
)


print("\nSUITABLE COLD-STORAGE FACILITIES")
print("----------------------------------")

if not results:
    print("No suitable facilities found.")

else:

    for i, facility in enumerate(results, start=1):

        print(f"\n{i}. {facility['facility_name']}")

        print(
            f"   Distance: "
            f"{facility['distance_km']:.2f} km"
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