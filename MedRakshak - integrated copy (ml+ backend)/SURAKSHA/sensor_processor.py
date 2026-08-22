import math
from datetime import datetime


class FeatureProcessor:
    """
    Converts raw sensor readings into the features
    required by the Suraksha ML models.

    Sensor-independent input:
        temperature -> °C
        humidity    -> %RH
        shock       -> g

    The actual physical sensor does not matter.
    """

    def __init__(
        self,
        product_type,
        min_temp,
        max_temp,
        min_humidity,
        max_humidity,
    ):
        # ----------------------------------------------------
        # Product configuration
        # ----------------------------------------------------

        self.product_type = product_type

        self.min_temp = float(min_temp)
        self.max_temp = float(max_temp)

        self.min_humidity = float(min_humidity)
        self.max_humidity = float(max_humidity)

        # ----------------------------------------------------
        # Historical state
        # ----------------------------------------------------

        self.previous_temperature = None
        self.previous_timestamp = None

        self.max_temp_deviation = 0.0
        self.max_shock = 0.0

        self.cumulative_temp_exposure = 0.0
        self.cumulative_humidity_exposure = 0.0

        self.time_outside_temp_range = 0.0
        self.time_outside_humidity_range = 0.0

        self.temperature_excursion_count = 0
        self.humidity_excursion_count = 0

        self.shock_count = 0

        self.first_temperature_excursion_time = None

        # Tracks whether the previous reading was outside
        self.previous_temperature_outside = False
        self.previous_humidity_outside = False

    # ========================================================
    # TEMPERATURE DEVIATION
    # ========================================================

    def calculate_temperature_deviation(self, temperature):

        if temperature < self.min_temp:
            return self.min_temp - temperature

        if temperature > self.max_temp:
            return temperature - self.max_temp

        return 0.0

    # ========================================================
    # HUMIDITY DEVIATION
    # ========================================================

    def calculate_humidity_deviation(self, humidity):

        if humidity < self.min_humidity:
            return self.min_humidity - humidity

        if humidity > self.max_humidity:
            return humidity - self.max_humidity

        return 0.0

    # ========================================================
    # PROCESS ONE READING
    # ========================================================

    def process_reading(
        self,
        temperature,
        humidity,
        shock,
        timestamp=None,
        external_temperature=25.0,
        external_humidity=60.0,
        rain_probability=0.0,
        wind_speed=0.0,
        cooling_status=0,
    ):
        """
        Process one raw sensor reading.

        Parameters:
            temperature: °C
            humidity: %RH
            shock: g
            timestamp: datetime or ISO timestamp
        """

        # ----------------------------------------------------
        # Validate sensor values
        # ----------------------------------------------------

        temperature = float(temperature)
        humidity = float(humidity)
        shock = float(shock)

        if timestamp is None:
            timestamp = datetime.now()

        elif isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)

        # ----------------------------------------------------
        # Calculate elapsed time
        # ----------------------------------------------------

        if self.previous_timestamp is None:

            elapsed_minutes = 0.0

        else:

            elapsed_seconds = (
                timestamp - self.previous_timestamp
            ).total_seconds()

            # Prevent negative time
            elapsed_seconds = max(
                0.0,
                elapsed_seconds
            )

            elapsed_minutes = elapsed_seconds / 60.0

        # ----------------------------------------------------
        # Temperature deviation
        # ----------------------------------------------------

        temperature_deviation = (
            self.calculate_temperature_deviation(
                temperature
            )
        )

        # ----------------------------------------------------
        # Humidity deviation
        # ----------------------------------------------------

        humidity_deviation = (
            self.calculate_humidity_deviation(
                humidity
            )
        )

        # ----------------------------------------------------
        # Temperature rate of change
        # ----------------------------------------------------

        if (
            self.previous_temperature is None
            or elapsed_minutes <= 0
        ):

            temperature_rate_of_change = 0.0

        else:

            temperature_rate_of_change = (
                temperature
                - self.previous_temperature
            ) / elapsed_minutes

        # ----------------------------------------------------
        # Determine whether currently outside limits
        # ----------------------------------------------------

        temperature_outside = (
            temperature < self.min_temp
            or temperature > self.max_temp
        )

        humidity_outside = (
            humidity < self.min_humidity
            or humidity > self.max_humidity
        )

        # ----------------------------------------------------
        # Temperature excursion count
        # ----------------------------------------------------

        if (
            temperature_outside
            and not self.previous_temperature_outside
        ):

            self.temperature_excursion_count += 1

            if self.first_temperature_excursion_time is None:
                self.first_temperature_excursion_time = timestamp

        # ----------------------------------------------------
        # Humidity excursion count
        # ----------------------------------------------------

        if (
            humidity_outside
            and not self.previous_humidity_outside
        ):

            self.humidity_excursion_count += 1

        # ----------------------------------------------------
        # Exposure accumulation
        # ----------------------------------------------------

        if temperature_outside:

            self.time_outside_temp_range += elapsed_minutes

            self.cumulative_temp_exposure += (
                temperature_deviation
                * elapsed_minutes
            )

        if humidity_outside:

            self.time_outside_humidity_range += elapsed_minutes

            self.cumulative_humidity_exposure += (
                humidity_deviation
                * elapsed_minutes
            )

        # ----------------------------------------------------
        # Maximum temperature deviation
        # ----------------------------------------------------

        self.max_temp_deviation = max(
            self.max_temp_deviation,
            temperature_deviation
        )

        # ----------------------------------------------------
        # Shock tracking
        # ----------------------------------------------------

        # Ignore tiny background vibrations.
        # 0.1 g is used as a prototype threshold.
        if shock >= 0.1:
            self.shock_count += 1

        self.max_shock = max(
            self.max_shock,
            shock
        )

        # ----------------------------------------------------
        # Time since first excursion
        # ----------------------------------------------------

        if self.first_temperature_excursion_time is None:

            time_since_first_excursion = 0.0

        else:

            time_since_first_excursion = max(
                0.0,
                (
                    timestamp
                    - self.first_temperature_excursion_time
                ).total_seconds()
                / 60.0
            )

        # ----------------------------------------------------
        # Update previous state
        # ----------------------------------------------------

        self.previous_temperature = temperature
        self.previous_timestamp = timestamp

        self.previous_temperature_outside = (
            temperature_outside
        )

        self.previous_humidity_outside = (
            humidity_outside
        )

        # ----------------------------------------------------
        # Return ML-ready feature dictionary
        # ----------------------------------------------------

        return {

            # Product configuration
            "product_type": self.product_type,

            "min_temp": self.min_temp,
            "max_temp": self.max_temp,

            "min_humidity": self.min_humidity,
            "max_humidity": self.max_humidity,

            # Current sensors
            "temperature": temperature,
            "humidity": humidity,
            "shock": shock,

            # Derived temperature features
            "temperature_deviation":
                temperature_deviation,

            "humidity_deviation":
                humidity_deviation,

            "time_outside_temp_range":
                self.time_outside_temp_range,

            "time_outside_humidity_range":
                self.time_outside_humidity_range,

            "temperature_rate_of_change":
                temperature_rate_of_change,

            "max_temp_deviation":
                self.max_temp_deviation,

            # Shock
            "shock_count":
                self.shock_count,

            "max_shock":
                self.max_shock,

            # Cumulative exposure
            "cumulative_temp_exposure":
                self.cumulative_temp_exposure,

            "cumulative_humidity_exposure":
                self.cumulative_humidity_exposure,

            # Excursions
            "temperature_excursion_count":
                self.temperature_excursion_count,

            "time_since_first_excursion":
                time_since_first_excursion,

            # Weather API
            "external_temperature":
                float(external_temperature),

            "external_humidity":
                float(external_humidity),

            "rain_probability":
                float(rain_probability),

            "wind_speed":
                float(wind_speed),

            # Cooling system
            "cooling_status":
                int(cooling_status),
        }