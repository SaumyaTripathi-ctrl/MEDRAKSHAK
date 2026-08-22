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

    try:
        response = requests.get(
            OPEN_METEO_URL,
            params=params,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        current = data["current"]

        return {
            "external_temperature": float(current["temperature_2m"]),
            "external_humidity": float(current["relative_humidity_2m"]),
            "rain_probability": float(data["hourly"]["precipitation_probability"][0]),
            "wind_speed": float(current["wind_speed_10m"])
        }
    except Exception as e:
        print(f"Weather API fallback engaged: {e}")
        # Default fallback values if weather service is unavailable
        return {
            "external_temperature": 25.0,
            "external_humidity": 60.0,
            "rain_probability": 0.0,
            "wind_speed": 10.0
        }
