# services/features.py

from datetime import datetime

# Stores the historical state of each shipment by shipment_id
shipment_states = {}


def get_or_create_state(shipment_id):
    """
    Creates or retrieves the state object for a given shipment_id.
    """
    if shipment_id not in shipment_states:
        shipment_states[shipment_id] = {
            # Previous reading
            "previous_temperature": None,
            "previous_timestamp": None,
            "previous_temperature_outside": False,
            "previous_humidity_outside": False,

            # Deviations and extremes
            "max_temp_deviation": 0.0,
            "max_shock": 0.0,

            # Cumulative exposures
            "cumulative_temp_exposure": 0.0,
            "cumulative_humidity_exposure": 0.0,
            "time_outside_temp_range": 0.0,
            "time_outside_humidity_range": 0.0,

            # Excursions
            "temperature_excursion_count": 0,
            "humidity_excursion_count": 0,
            "first_temperature_excursion_time": None,

            # Shock tracking
            "shock_count": 0,
        }

    return shipment_states[shipment_id]


def clear_all_states():
    """
    Clears all shipment states (useful for testing).
    """
    shipment_states.clear()


def calculate_temperature_deviation(temperature, min_temp, max_temp):
    if temperature < min_temp:
        return min_temp - temperature
    if temperature > max_temp:
        return temperature - max_temp
    return 0.0


def calculate_humidity_deviation(humidity, min_humidity, max_humidity):
    if humidity < min_humidity:
        return min_humidity - humidity
    if humidity > max_humidity:
        return max_humidity - humidity
    return 0.0


def calculate_features(
    shipment_id: str,
    product_type: str,
    temperature: float,
    humidity: float,
    shock: float,
    current_timestamp,
    min_temp: float,
    max_temp: float,
    min_humidity: float,
    max_humidity: float,
    external_temperature: float = 25.0,
    external_humidity: float = 60.0,
    rain_probability: float = 0.0,
    wind_speed: float = 0.0,
    cooling_status: int = 0
):
    """
    Calculates the complete 25-feature vector required by Person 1's ML models,
    maintaining per-shipment historical state.
    """
    state = get_or_create_state(shipment_id)

    temperature = float(temperature)
    humidity = float(humidity)
    shock = float(shock)
    min_temp = float(min_temp)
    max_temp = float(max_temp)
    min_humidity = float(min_humidity)
    max_humidity = float(max_humidity)

    if isinstance(current_timestamp, str):
        current_timestamp = datetime.fromisoformat(current_timestamp)

    # Calculate elapsed minutes
    if state["previous_timestamp"] is None:
        elapsed_minutes = 0.0
    else:
        elapsed_seconds = (current_timestamp - state["previous_timestamp"]).total_seconds()
        elapsed_minutes = max(0.0, elapsed_seconds / 60.0)

    # Temperature & Humidity deviations
    temp_dev = calculate_temperature_deviation(temperature, min_temp, max_temp)
    hum_dev = calculate_humidity_deviation(humidity, min_humidity, max_humidity)

    # Rate of change
    if state["previous_temperature"] is None or elapsed_minutes <= 0:
        temp_rate = 0.0
    else:
        temp_rate = (temperature - state["previous_temperature"]) / elapsed_minutes

    # Determine if currently outside range
    temp_outside = (temperature < min_temp or temperature > max_temp)
    hum_outside = (humidity < min_humidity or humidity > max_humidity)

    # Temperature excursion tracking
    if temp_outside and not state["previous_temperature_outside"]:
        state["temperature_excursion_count"] += 1
        if state["first_temperature_excursion_time"] is None:
            state["first_temperature_excursion_time"] = current_timestamp

    # Humidity excursion tracking
    if hum_outside and not state["previous_humidity_outside"]:
        state["humidity_excursion_count"] += 1

    # Cumulative exposure tracking
    if temp_outside:
        state["time_outside_temp_range"] += elapsed_minutes
        state["cumulative_temp_exposure"] += temp_dev * elapsed_minutes

    if hum_outside:
        state["time_outside_humidity_range"] += elapsed_minutes
        state["cumulative_humidity_exposure"] += hum_dev * elapsed_minutes

    # Max temp deviation
    state["max_temp_deviation"] = max(state["max_temp_deviation"], temp_dev)

    # Shock tracking (CRITICAL: shock >= 0.1g threshold matching Person 1 ML pipeline)
    if shock >= 0.1:
        state["shock_count"] += 1

    state["max_shock"] = max(state["max_shock"], shock)

    # Time since first excursion
    if state["first_temperature_excursion_time"] is None:
        time_since_first_excursion = 0.0
    else:
        seconds_since_first = (current_timestamp - state["first_temperature_excursion_time"]).total_seconds()
        time_since_first_excursion = max(0.0, seconds_since_first / 60.0)

    # Update previous state
    state["previous_temperature"] = temperature
    state["previous_timestamp"] = current_timestamp
    state["previous_temperature_outside"] = temp_outside
    state["previous_humidity_outside"] = hum_outside

    # Return full 25-feature dictionary matching models/feature_columns.json exact names
    return {
        "product_type": str(product_type),
        "min_temp": min_temp,
        "max_temp": max_temp,
        "min_humidity": min_humidity,
        "max_humidity": max_humidity,
        "temperature": temperature,
        "humidity": humidity,
        "shock": shock,
        "temperature_deviation": temp_dev,
        "humidity_deviation": hum_dev,
        "time_outside_temp_range": state["time_outside_temp_range"],
        "time_outside_humidity_range": state["time_outside_humidity_range"],
        "temperature_rate_of_change": temp_rate,
        "max_temp_deviation": state["max_temp_deviation"],
        "shock_count": state["shock_count"],
        "max_shock": state["max_shock"],
        "cumulative_temp_exposure": state["cumulative_temp_exposure"],
        "cumulative_humidity_exposure": state["cumulative_humidity_exposure"],
        "temperature_excursion_count": state["temperature_excursion_count"],
        "time_since_first_excursion": time_since_first_excursion,
        "external_temperature": float(external_temperature),
        "external_humidity": float(external_humidity),
        "rain_probability": float(rain_probability),
        "wind_speed": float(wind_speed),
        "cooling_status": int(cooling_status)
    }
