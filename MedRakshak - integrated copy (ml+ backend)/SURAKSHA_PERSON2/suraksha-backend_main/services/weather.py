import requests


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def get_weather(latitude: float, longitude: float):

    params = {
        "latitude": latitude,
        "longitude": longitude,

        "current": (
            "temperature_2m,"
            "relative_humidity_2m,"
            "precipitation,"
            "wind_speed_10m"
        ),

        "hourly": "precipitation_probability",

        "forecast_days": 1,

        "timezone": "auto"
    }

    response = requests.get(
        OPEN_METEO_URL,
        params=params,
        timeout=10
    )

    response.raise_for_status()

    data = response.json()

    current = data["current"]

    return {
        "external_temperature": current[
            "temperature_2m"
        ],

        "external_humidity": current[
            "relative_humidity_2m"
        ],

        "rain_probability": data[
            "hourly"
        ]["precipitation_probability"][0],

        "wind_speed": current[
            "wind_speed_10m"
        ]
    }