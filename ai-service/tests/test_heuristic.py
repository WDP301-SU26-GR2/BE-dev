import cv2
import numpy as np

from app.heuristic import segment_heuristic


def make_synthetic_page():
    img = np.full((1200, 800, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (40, 40), (360, 540), (0, 0, 0), 8)
    cv2.rectangle(img, (430, 40), (760, 540), (0, 0, 0), 8)
    cv2.ellipse(img, (230, 250), (95, 55), 0, 0, 360, (255, 255, 255), -1)
    cv2.ellipse(img, (230, 250), (95, 55), 0, 0, 360, (0, 0, 0), 4)
    cv2.putText(img, "HELLO", (175, 262), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    return img


def test_heuristic_detects_panels_and_bubble():
    regions = segment_heuristic(make_synthetic_page())
    types = {r["type"] for r in regions}
    assert "PANEL" in types
    assert "SPEECH_BUBBLE" in types
    assert len([r for r in regions if r["type"] == "PANEL"]) >= 2
