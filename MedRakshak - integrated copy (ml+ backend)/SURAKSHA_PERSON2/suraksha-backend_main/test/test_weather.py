from services.weather import get_weather


result = get_weather(
    latitude=13.0827,
    longitude=80.2707
)

print("\nWEATHER RESULT")
print("----------------")

for key, value in result.items():
    print(f"{key}: {value}")