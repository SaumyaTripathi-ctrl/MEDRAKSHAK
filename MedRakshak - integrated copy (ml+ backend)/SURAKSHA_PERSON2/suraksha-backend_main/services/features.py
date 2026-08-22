# services/features.py

# Stores the previous state of every shipment.
# For the hackathon prototype, this is kept in memory.

shipment_states = {}


def get_or_create_state(shipment_id):
    """
    Creates a memory/state object for a shipment
    if it does not already exist.
    """

    if shipment_id not in shipment_states:

        shipment_states[shipment_id] = {

            # Previous reading
            "previous_temperature": None,
            "previous_humidity": None,
            "previous_timestamp": None,

            # Temperature exposure
            "time_outside_temp_range": 0.0,
            "cumulative_temp_exposure": 0.0,

            # Humidity exposure
            "time_outside_humidity_range": 0.0,
            "cumulative_humidity_exposure": 0.0,

            # Temperature excursions
            "temperature_excursion_count": 0,
            "temperature_excursion_active": False,

            # First excursion
            "first_excursion_timestamp": None,
            "time_since_first_excursion": 0.0,

            # Maximum values
            "max_temp_deviation": 0.0,
            "max_shock": 0.0,

            # Shock
            "shock_count": 0,
            "shock_event_active": False
        }

    return shipment_states[shipment_id]


# ---------------------------------------------------------
# TEMPERATURE DEVIATION
# ---------------------------------------------------------

def calculate_temperature_deviation(
    temperature,
    min_temp,
    max_temp
):
    """
    Calculates how far the temperature is outside
    the allowed range.

    Inside range → 0
    Above range → temperature - max_temp
    Below range → min_temp - temperature
    """

    if temperature > max_temp:
        return temperature - max_temp

    if temperature < min_temp:
        return min_temp - temperature

    return 0.0


# ---------------------------------------------------------
# HUMIDITY DEVIATION
# ---------------------------------------------------------

def calculate_humidity_deviation(
    humidity,
    min_humidity,
    max_humidity
):
    """
    Calculates how far humidity is outside
    the allowed range.
    """

    if humidity > max_humidity:
        return humidity - max_humidity

    if humidity < min_humidity:
        return min_humidity - humidity

    return 0.0


# ---------------------------------------------------------
# ELAPSED TIME
# ---------------------------------------------------------

def calculate_elapsed_minutes(
    previous_timestamp,
    current_timestamp
):
    """
    Calculates time between two readings in minutes.
    """

    if previous_timestamp is None:
        return 0.0

    seconds = (
        current_timestamp - previous_timestamp
    ).total_seconds()

    return max(seconds / 60.0, 0.0)


# ---------------------------------------------------------
# TEMPERATURE RATE OF CHANGE
# ---------------------------------------------------------

def calculate_temperature_rate(
    current_temperature,
    previous_temperature,
    elapsed_minutes
):
    """
    Calculates temperature change per minute.
    """

    if (
        previous_temperature is None
        or elapsed_minutes <= 0
    ):
        return 0.0

    return (
        current_temperature - previous_temperature
    ) / elapsed_minutes


# ---------------------------------------------------------
# UPDATE TEMPERATURE EXPOSURE
# ---------------------------------------------------------

def update_temperature_exposure(
    state,
    temperature_deviation,
    elapsed_minutes
):
    """
    Cumulative temperature exposure.

    Exposure increases according to:

    deviation × time
    """

    state["cumulative_temp_exposure"] += (
        temperature_deviation * elapsed_minutes
    )

    return state["cumulative_temp_exposure"]


# ---------------------------------------------------------
# UPDATE TIME OUTSIDE TEMPERATURE RANGE
# ---------------------------------------------------------

def update_temperature_outside_time(
    state,
    temperature_deviation,
    elapsed_minutes
):
    """
    Tracks cumulative time spent outside
    the allowed temperature range.
    """

    if temperature_deviation > 0:

        state["time_outside_temp_range"] += (
            elapsed_minutes
        )

    return state["time_outside_temp_range"]


# ---------------------------------------------------------
# UPDATE HUMIDITY EXPOSURE
# ---------------------------------------------------------

def update_humidity_exposure(
    state,
    humidity_deviation,
    elapsed_minutes
):
    """
    Cumulative humidity exposure.
    """

    state["cumulative_humidity_exposure"] += (
        humidity_deviation * elapsed_minutes
    )

    return state["cumulative_humidity_exposure"]


# ---------------------------------------------------------
# UPDATE TIME OUTSIDE HUMIDITY RANGE
# ---------------------------------------------------------

def update_humidity_outside_time(
    state,
    humidity_deviation,
    elapsed_minutes
):
    """
    Tracks cumulative time spent outside
    the allowed humidity range.
    """

    if humidity_deviation > 0:

        state["time_outside_humidity_range"] += (
            elapsed_minutes
        )

    return state["time_outside_humidity_range"]


# ---------------------------------------------------------
# TEMPERATURE EXCURSION
# ---------------------------------------------------------

def update_temperature_excursion(
    state,
    temperature_deviation,
    current_timestamp
):
    """
    Counts a new temperature excursion only when
    the shipment changes from SAFE → OUTSIDE RANGE.

    Example:

    SAFE
    SAFE
    OUTSIDE
    OUTSIDE
    OUTSIDE
    SAFE
    OUTSIDE

    = 2 excursions
    """

    outside_range = temperature_deviation > 0

    # New excursion starts
    if (
        outside_range
        and not state["temperature_excursion_active"]
    ):

        state["temperature_excursion_count"] += 1

        # Record the first-ever excursion
        if state["first_excursion_timestamp"] is None:

            state["first_excursion_timestamp"] = (
                current_timestamp
            )

    # Remember whether we are currently
    # inside an excursion
    state["temperature_excursion_active"] = (
        outside_range
    )

    return state["temperature_excursion_count"]


# ---------------------------------------------------------
# TIME SINCE FIRST EXCURSION
# ---------------------------------------------------------

def calculate_time_since_first_excursion(
    state,
    current_timestamp
):
    """
    Calculates how long it has been since
    the first temperature excursion.

    Before first excursion → 0
    """

    first_excursion = (
        state["first_excursion_timestamp"]
    )

    if first_excursion is None:
        return 0.0

    seconds = (
        current_timestamp - first_excursion
    ).total_seconds()

    state["time_since_first_excursion"] = max(
        seconds / 60.0,
        0.0
    )

    return state["time_since_first_excursion"]


# ---------------------------------------------------------
# MAX TEMPERATURE DEVIATION
# ---------------------------------------------------------

def update_max_temperature_deviation(
    state,
    temperature_deviation
):
    """
    Keeps the maximum temperature deviation
    observed so far.
    """

    state["max_temp_deviation"] = max(
        state["max_temp_deviation"],
        temperature_deviation
    )

    return state["max_temp_deviation"]


# ---------------------------------------------------------
# SHOCK
# ---------------------------------------------------------

def update_shock(
    state,
    shock,
    shock_threshold=1.0
):
    """
    Tracks significant shock events.

    For the prototype:
    shock >= 1.0g = significant shock.

    Consecutive readings belonging to the
    same shock event are counted once.
    """

    state["max_shock"] = max(
        state["max_shock"],
        shock
    )

    significant_shock = (
        shock >= shock_threshold
    )

    # New shock event
    if (
        significant_shock
        and not state["shock_event_active"]
    ):

        state["shock_count"] += 1

    state["shock_event_active"] = (
        significant_shock
    )

    return {
        "shock_count": state["shock_count"],
        "max_shock": state["max_shock"]
    }


# ---------------------------------------------------------
# MAIN FEATURE CALCULATOR
# ---------------------------------------------------------

def calculate_features(
    shipment_id,
    temperature,
    humidity,
    shock,
    current_timestamp,

    min_temp,
    max_temp,

    min_humidity,
    max_humidity
):
    """
    Calculates all real-time derived features
    required by the SURAKSHA ML pipeline.
    """

    # Get shipment's previous state
    state = get_or_create_state(
        shipment_id
    )

    # ---------------------------------------------
    # Time
    # ---------------------------------------------

    elapsed_minutes = (
        calculate_elapsed_minutes(
            state["previous_timestamp"],
            current_timestamp
        )
    )

    # ---------------------------------------------
    # Temperature
    # ---------------------------------------------

    temperature_deviation = (
        calculate_temperature_deviation(
            temperature,
            min_temp,
            max_temp
        )
    )

    temperature_rate = (
        calculate_temperature_rate(
            temperature,
            state["previous_temperature"],
            elapsed_minutes
        )
    )

    cumulative_temp_exposure = (
        update_temperature_exposure(
            state,
            temperature_deviation,
            elapsed_minutes
        )
    )

    time_outside_temp_range = (
        update_temperature_outside_time(
            state,
            temperature_deviation,
            elapsed_minutes
        )
    )

    excursion_count = (
        update_temperature_excursion(
            state,
            temperature_deviation,
            current_timestamp
        )
    )

    time_since_first_excursion = (
        calculate_time_since_first_excursion(
            state,
            current_timestamp
        )
    )

    max_temp_deviation = (
        update_max_temperature_deviation(
            state,
            temperature_deviation
        )
    )

    # ---------------------------------------------
    # Humidity
    # ---------------------------------------------

    humidity_deviation = (
        calculate_humidity_deviation(
            humidity,
            min_humidity,
            max_humidity
        )
    )

    cumulative_humidity_exposure = (
        update_humidity_exposure(
            state,
            humidity_deviation,
            elapsed_minutes
        )
    )

    time_outside_humidity_range = (
        update_humidity_outside_time(
            state,
            humidity_deviation,
            elapsed_minutes
        )
    )

    # ---------------------------------------------
    # Shock
    # ---------------------------------------------

    shock_result = update_shock(
        state,
        shock
    )

    # ---------------------------------------------
    # UPDATE PREVIOUS READING
    # ---------------------------------------------

    state["previous_temperature"] = (
        temperature
    )

    state["previous_humidity"] = (
        humidity
    )

    state["previous_timestamp"] = (
        current_timestamp
    )

    # ---------------------------------------------
    # RETURN ALL DERIVED FEATURES
    # ---------------------------------------------

    return {

        "temperature_deviation":
            round(temperature_deviation, 4),

        "humidity_deviation":
            round(humidity_deviation, 4),

        "time_outside_temp_range":
            round(time_outside_temp_range, 4),

        "time_outside_humidity_range":
            round(time_outside_humidity_range, 4),

        "temperature_rate_of_change":
            round(temperature_rate, 4),

        "max_temp_deviation":
            round(max_temp_deviation, 4),

        "shock_count":
            shock_result["shock_count"],

        "max_shock":
            round(shock_result["max_shock"], 4),

        "cumulative_temp_exposure":
            round(cumulative_temp_exposure, 4),

        "cumulative_humidity_exposure":
            round(cumulative_humidity_exposure, 4),

        "temperature_excursion_count":
            excursion_count,

        "time_since_first_excursion":
            round(time_since_first_excursion, 4)
    }