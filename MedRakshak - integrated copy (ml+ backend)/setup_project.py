from pathlib import Path

# Root project directory
ROOT = Path("SURAKSHA")

# Folders
folders = [
    ROOT / "data",
    ROOT / "models",
    ROOT / "outputs",
]

# Files we will create during the ML pipeline
files = [
    ROOT / "sanity_check.py",
    ROOT / "train.py",
    ROOT / "predict.py",
    ROOT / "test_predictions.py",
    ROOT / "training_report.txt",
    ROOT / "requirements.txt",
]

# Create folders
for folder in folders:
    folder.mkdir(parents=True, exist_ok=True)

# Create empty files
for file in files:
    file.touch(exist_ok=True)

print("=" * 60)
print("SURAKSHA ML PROJECT STRUCTURE CREATED")
print("=" * 60)

print("""
SURAKSHA/
│
├── data/
│   └── suraksha_dataset_corrected.csv
│
├── models/
│   ├── spoilage_risk_model.pkl          [created after training]
│   ├── remaining_safe_time_model.pkl    [created after training]
│   └── feature_columns.json             [created after training]
│
├── outputs/
│   ├── predictions.csv                  [created later]
│   └── model_comparison.txt             [created later]
│
├── sanity_check.py
├── train.py
├── predict.py
├── test_predictions.py
├── training_report.txt
└── requirements.txt
""")

print("=" * 60)
print("NEXT STEP:")
print("Put suraksha_dataset_corrected.csv inside:")
print("SURAKSHA/data/")
print("=" * 60)