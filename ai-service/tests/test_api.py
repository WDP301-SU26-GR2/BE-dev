import os

from fastapi.testclient import TestClient

os.environ["API_KEY"] = "test-key"
from app import main  # noqa: E402
from test_heuristic import make_synthetic_page  # noqa: E402

client = TestClient(main.app)


def test_healthz():
    assert client.get("/healthz").status_code == 200


def test_auth_required():
    resp = client.post("/v1/segment", json={"imageUrl": "http://x/y.png", "mode": "HEURISTIC"})
    assert resp.status_code == 401


def test_heuristic_contract(monkeypatch):
    monkeypatch.setattr(main, "fetch_image", lambda _: make_synthetic_page())
    resp = client.post(
        "/v1/segment",
        json={"imageUrl": "http://x/y.png", "mode": "HEURISTIC"},
        headers={"x-api-key": "test-key"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["modelVersion"] == "opencv-heuristic@1.0"
    assert body["imageWidth"] == 800 and body["imageHeight"] == 1200
    assert {r["type"] for r in body["regions"]} >= {"PANEL", "SPEECH_BUBBLE"}
