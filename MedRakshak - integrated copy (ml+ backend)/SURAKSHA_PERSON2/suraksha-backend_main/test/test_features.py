from datetime import datetime, timedelta

from services.features import calculate_features


shipment_id = "TEST001"


# ---------------------------------------
# Reading 1 — Safe
# ---------------------------------------

time1 = datetime(2026, 8, 21, 10, 0, 0)

result1 = calculate_features(
    shipment_id=shipment_id,

    temperature=5.0,
    humidity=60.0,
    shock=0.2,

    current_timestamp=time1,

    min_temp=2.0,
    max_temp=8.0,

    min_humidity=30.0,
    max_humidity=70.0
)

print("\nREADING 1")
print(result1)


# ---------------------------------------
# Reading 2 — Still safe
# ---------------------------------------

time2 = time1 + timedelta(minutes=5)

result2 = calculate_features(
    shipment_id=shipment_id,

    temperature=6.0,
    humidity=62.0,
    shock=0.3,

    current_timestamp=time2,

    min_temp=2.0,
    max_temp=8.0,

    min_humidity=30.0,
    max_humidity=70.0
)

print("\nREADING 2")
print(result2)


# ---------------------------------------
# Reading 3 — Temperature excursion
# ---------------------------------------

time3 = time2 + timedelta(minutes=5)

result3 = calculate_features(
    shipment_id=shipment_id,

    temperature=9.0,
    humidity=65.0,
    shock=0.4,

    current_timestamp=time3,

    min_temp=2.0,
    max_temp=8.0,

    min_humidity=30.0,
    max_humidity=70.0
)

print("\nREADING 3")
print(result3)


# ---------------------------------------
# Reading 4 — Still outside range
# ---------------------------------------

time4 = time3 + timedelta(minutes=5)

result4 = calculate_features(
    shipment_id=shipment_id,

    temperature=10.0,
    humidity=66.0,
    shock=1.4,

    current_timestamp=time4,

    min_temp=2.0,
    max_temp=8.0,

    min_humidity=30.0,
    max_humidity=70.0
)

print("\nREADING 4")
print(result4)
