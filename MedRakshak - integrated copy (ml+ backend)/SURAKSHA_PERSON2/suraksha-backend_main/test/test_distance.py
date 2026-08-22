from services.cold_storage import calculate_distance_km


shipment_latitude = 13.0827
shipment_longitude = 80.2707

facility_latitude = 13.0674
facility_longitude = 80.2376


distance = calculate_distance_km(
    shipment_latitude,
    shipment_longitude,
    facility_latitude,
    facility_longitude
)


print("\nDISTANCE TEST")
print("-------------")
print(f"Distance: {distance:.2f} km")