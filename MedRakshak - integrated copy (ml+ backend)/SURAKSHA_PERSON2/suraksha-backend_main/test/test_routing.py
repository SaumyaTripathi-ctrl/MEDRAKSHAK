import requests


OSRM_URL = (
    "https://router.project-osrm.org/"
    "route/v1/driving/"
)


# Shipment location
shipment_latitude = 13.0827
shipment_longitude = 80.2707


# Facility CS-IN-021233
facility_latitude = 13.085737
facility_longitude = 80.2814


url = (
    f"{OSRM_URL}"
    f"{shipment_longitude},{shipment_latitude};"
    f"{facility_longitude},{facility_latitude}"
)

params = {
    "overview": "false"
}

response = requests.get(
    url,
    params=params,
    timeout=10
)

response.raise_for_status()

data = response.json()


if data["code"] != "Ok":
    print("Routing failed:")
    print(data)

else:

    route = data["routes"][0]

    distance_km = route["distance"] / 1000

    travel_time_min = route["duration"] / 60

    print("\nROUTING TEST")
    print("-------------")

    print(
        f"Road distance: "
        f"{distance_km:.2f} km"
    )

    print(
        f"Estimated travel time: "
        f"{travel_time_min:.2f} minutes"
    )