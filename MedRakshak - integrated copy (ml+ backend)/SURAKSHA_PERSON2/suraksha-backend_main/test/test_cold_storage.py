from services.cold_storage import get_dataset_summary


result = get_dataset_summary()

print("\nCOLD STORAGE DATASET")
print("--------------------")

print("Total facilities:", result["total_facilities"])

print("\nColumns:")

for column in result["columns"]:
    print("-", column)