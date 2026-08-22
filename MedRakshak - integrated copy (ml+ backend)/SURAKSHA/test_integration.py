"""
SURAKSHA Integration Test Suite
Verifies end-to-end integration of FastAPI backend, ML prediction models,
weather API integration, feature state isolation, and OSRM cold storage rerouting.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

# Ensure current directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import app
from services.features import clear_all_states, calculate_features

client = TestClient(app)


def run_tests():
    print("=" * 80)
    print("RUNNING SURAKSHA INTEGRATION TEST SUITE")
    print("=" * 80)

    total_tests = 0
    passed_tests = 0

    def assert_test(condition, description):
        nonlocal total_tests, passed_tests
        total_tests += 1
        if condition:
            passed_tests += 1
            print(f"[PASS] {description}")
        else:
            print(f"[FAIL] {description}")
            raise AssertionError(f"Test failed: {description}")

    # =========================================================================
    # TEST 1: GET /health
    # =========================================================================
    print("\n--- TEST 1: Health Check Endpoint ---")
    response = client.get("/health")
    assert_test(response.status_code == 200, "Status code 200 for /health")
    assert_test(response.json().get("status") == "ok", "/health returns status 'ok'")

    # =========================================================================
    # TEST 2: SAFE Sensor Scenario
    # =========================================================================
    print("\n--- TEST 2: SAFE Sensor Scenario ---")
    clear_all_states()

    safe_payload = {
        "shipment_id": "SHIP_SAFE_001",
        "product_type": "vaccine",
        "temperature": 5.0,
        "humidity": 50.0,
        "shock": 0.02,
        "latitude": 13.0827,
        "longitude": 80.2707,
        "timestamp": datetime.now().isoformat(),
        "cooling_status": 0
    }

    response = client.post("/sensor-data", json=safe_payload)
    assert_test(response.status_code == 200, "Status code 200 for /sensor-data")
    data = response.json()

    prediction = data.get("prediction", {})
    assert_test(prediction.get("risk_level") == "SAFE", "Prediction risk level is SAFE")
    assert_test(prediction.get("spoilage_risk") < 30.0, "Spoilage risk is low (< 30)")
    assert_test("cold_storage_recommendation" not in data, "No cold-storage emergency rerouting for SAFE status")

    # =========================================================================
    # TEST 3: WARNING Scenario (Sequence of readings 9-13°C)
    # =========================================================================
    print("\n--- TEST 3: WARNING Sensor Scenario ---")
    clear_all_states()
    shipment_id = "SHIP_WARN_001"
    start_time = datetime.now()

    temperatures = [9.0, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0]
    last_response_data = None

    for i, temp in enumerate(temperatures):
        timestamp = (start_time + timedelta(minutes=i)).isoformat()
        payload = {
            "shipment_id": shipment_id,
            "product_type": "vaccine",
            "temperature": temp,
            "humidity": 55.0,
            "shock": 0.0,
            "latitude": 13.0827,
            "longitude": 80.2707,
            "timestamp": timestamp,
            "cooling_status": 0
        }
        res = client.post("/sensor-data", json=payload)
        assert_test(res.status_code == 200, f"Reading {i+1} status code 200")
        last_response_data = res.json()

    pred = last_response_data.get("prediction", {})
    print(f"   WARNING scenario result: Risk={pred.get('spoilage_risk')}, Level={pred.get('risk_level')}, CoolingReq={pred.get('cooling_required')}")
    assert_test(pred.get("risk_level") in ["WARNING", "CRITICAL"], "Risk level elevated to WARNING or higher")
    assert_test(pred.get("cooling_required") is True, "Cooling is required when temp > max_temp (8°C)")
    if pred.get("risk_level") == "WARNING":
        assert_test("cold_storage_recommendation" not in last_response_data, "No automatic emergency rerouting triggered for WARNING status")

    # =========================================================================
    # TEST 4: CRITICAL Scenario (Prolonged severe excursion)
    # =========================================================================
    print("\n--- TEST 4: CRITICAL Sensor Scenario ---")
    clear_all_states()
    shipment_id = "SHIP_CRIT_001"
    start_time = datetime.now()

    # Sequence of severe high temperatures to trigger CRITICAL
    temperatures = [15.0, 17.0, 19.0, 21.0, 23.0, 25.0, 25.0, 25.0, 25.0, 25.0]
    crit_data = None

    for i, temp in enumerate(temperatures):
        timestamp = (start_time + timedelta(minutes=i * 5)).isoformat()
        payload = {
            "shipment_id": shipment_id,
            "product_type": "vaccine",
            "temperature": temp,
            "humidity": 65.0,
            "shock": 0.15,
            "latitude": 13.0827,  # Chennai coordinates
            "longitude": 80.2707,
            "timestamp": timestamp,
            "cooling_status": 0
        }
        res = client.post("/sensor-data", json=payload)
        assert_test(res.status_code == 200, f"Critical reading {i+1} status code 200")
        crit_data = res.json()

    crit_pred = crit_data.get("prediction", {})
    print(f"   CRITICAL scenario result: Risk={crit_pred.get('spoilage_risk')}, Level={crit_pred.get('risk_level')}, UrgentAction={crit_pred.get('urgent_action')}")
    assert_test(crit_pred.get("risk_level") == "CRITICAL", "Risk level is CRITICAL")
    assert_test(crit_pred.get("cooling_required") is True, "Cooling required is True")
    assert_test(crit_pred.get("urgent_action") is True, "Urgent action is True")
    assert_test("cold_storage_recommendation" in crit_data, "Cold storage recommendation triggered for CRITICAL risk")

    rec = crit_data.get("cold_storage_recommendation", {})
    assert_test(rec.get("recommendation_available") is True, "Recommendation is available")
    assert_test("recommended_facility" in rec, "Recommended facility is included")
    recommended_facility = rec["recommended_facility"]
    assert_test("road_distance_km" in recommended_facility, "Facility has road_distance_km")
    assert_test("travel_time_minutes" in recommended_facility, "Facility has travel_time_minutes (ETA)")

    # =========================================================================
    # TEST 5: Shipment State Isolation
    # =========================================================================
    print("\n--- TEST 5: Shipment State Isolation ---")
    clear_all_states()
    t_now = datetime.now()

    # Shipment A undergoes high temperature excursion
    payload_a = {
        "shipment_id": "SHIP_A",
        "product_type": "vaccine",
        "temperature": 18.0,
        "humidity": 50.0,
        "shock": 0.0,
        "latitude": 13.0,
        "longitude": 80.0,
        "timestamp": t_now.isoformat(),
        "cooling_status": 0
    }
    client.post("/sensor-data", json=payload_a)

    # Shipment B starts fresh with a completely safe reading
    payload_b = {
        "shipment_id": "SHIP_B",
        "product_type": "vaccine",
        "temperature": 5.0,
        "humidity": 50.0,
        "shock": 0.0,
        "latitude": 13.0,
        "longitude": 80.0,
        "timestamp": t_now.isoformat(),
        "cooling_status": 0
    }
    res_b = client.post("/sensor-data", json=payload_b)
    data_b = res_b.json()

    # Verify Shipment B does NOT inherit Shipment A's high temp deviation or excursion count
    pred_b = data_b.get("prediction", {})
    assert_test(pred_b.get("risk_level") == "SAFE", "Shipment B remains SAFE despite Shipment A excursion")

    # =========================================================================
    # TEST 6: Shock Threshold Test (0.15g increments shock_count, <0.1g does not)
    # =========================================================================
    print("\n--- TEST 6: Shock Threshold Test ---")
    clear_all_states()
    ship_shock = "SHIP_SHOCK_TEST"

    # Reading 1: Shock = 0.05g (< 0.1g threshold) -> shock_count should remain 0
    feat1 = calculate_features(
        shipment_id=ship_shock,
        product_type="vaccine",
        temperature=5.0,
        humidity=50.0,
        shock=0.05,
        current_timestamp=datetime.now(),
        min_temp=2.0,
        max_temp=8.0,
        min_humidity=30.0,
        max_humidity=70.0
    )
    assert_test(feat1["shock_count"] == 0, "Shock of 0.05g does NOT increment shock_count (0)")

    # Reading 2: Shock = 0.15g (>= 0.1g threshold) -> shock_count should increment to 1
    feat2 = calculate_features(
        shipment_id=ship_shock,
        product_type="vaccine",
        temperature=5.0,
        humidity=50.0,
        shock=0.15,
        current_timestamp=datetime.now() + timedelta(minutes=1),
        min_temp=2.0,
        max_temp=8.0,
        min_humidity=30.0,
        max_humidity=70.0
    )
    assert_test(feat2["shock_count"] == 1, "Shock of 0.15g INCREMENTS shock_count to 1")

    # =========================================================================
    # TEST 7: Product-Specific Limits Test
    # =========================================================================
    print("\n--- TEST 7: Product-Specific Limits Test ---")
    # Vaccine (2-8°C): 18°C is outside range (temp > 8)
    res_vac = client.post("/sensor-data", json={
        "shipment_id": "SHIP_PROD_VAC",
        "product_type": "vaccine",
        "temperature": 18.0,
        "humidity": 50.0,
        "shock": 0.0,
        "latitude": 13.0,
        "longitude": 80.0,
        "timestamp": datetime.now().isoformat(),
        "cooling_status": 0
    })
    pred_vac = res_vac.json().get("prediction", {})
    assert_test(pred_vac.get("cooling_required") is True, "Vaccine at 18°C requires cooling (range 2-8°C)")

    # Room temperature medicine (15-25°C): 18°C is inside range
    res_rt = client.post("/sensor-data", json={
        "shipment_id": "SHIP_PROD_RT",
        "product_type": "room_temperature_medicine",
        "temperature": 18.0,
        "humidity": 50.0,
        "shock": 0.0,
        "latitude": 13.0,
        "longitude": 80.0,
        "timestamp": datetime.now().isoformat(),
        "cooling_status": 0
    })
    pred_rt = res_rt.json().get("prediction", {})
    assert_test(pred_rt.get("cooling_required") is False, "Room temperature medicine at 18°C does NOT require cooling (range 15-25°C)")

    print("\n" + "=" * 80)
    print(f"INTEGRATION TESTS COMPLETE: {passed_tests}/{total_tests} PASSED")
    print("=" * 80)


if __name__ == "__main__":
    run_tests()
