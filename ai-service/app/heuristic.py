import cv2
import numpy as np

HEURISTIC_VERSION = "opencv-heuristic@1.0"


def _bbox(x: int, y: int, w: int, h: int) -> dict:
    return {"x": float(x), "y": float(y), "width": float(w), "height": float(h)}


def _confidence(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _panel_regions(gray: np.ndarray) -> list[dict]:
    height, width = gray.shape[:2]
    _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    closed = cv2.morphologyEx(inv, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    regions = []
    min_area = width * height * 0.02
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = float(w * h)
        if area < min_area:
            continue
        if w < width * 0.08 or h < height * 0.08:
            continue
        regions.append(
            {
                "type": "PANEL",
                "subtype": "heuristic-panel",
                "bbox": _bbox(x, y, w, h),
                "confidence": _confidence(area / (width * height) + 0.45),
            }
        )
    return regions


def _bubble_regions(gray: np.ndarray) -> list[dict]:
    height, width = gray.shape[:2]
    masks = [cv2.inRange(gray, 240, 255), cv2.inRange(gray, 0, 80)]

    regions = []
    page_area = width * height
    seen: list[tuple[int, int, int, int]] = []
    for index, mask in enumerate(masks):
        mode = cv2.RETR_EXTERNAL if index == 0 else cv2.RETR_LIST
        contours, _ = cv2.findContours(mask, mode, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < page_area * 0.003 or area > page_area * 0.15:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            if w < 20 or h < 20:
                continue
            if any(abs(x - sx) < 8 and abs(y - sy) < 8 and abs(w - sw) < 12 and abs(h - sh) < 12 for sx, sy, sw, sh in seen):
                continue
            roi = gray[y : y + h, x : x + w]
            whiteness = float(np.mean(roi >= 230))
            dark_ratio = float(np.mean(roi <= 120))
            if whiteness < 0.55 or dark_ratio < 0.002:
                continue
            hull = cv2.convexHull(contour)
            hull_area = cv2.contourArea(hull) or 1.0
            solidity = float(area / hull_area)
            seen.append((x, y, w, h))
            regions.append(
                {
                    "type": "SPEECH_BUBBLE",
                    "subtype": "heuristic-bubble",
                    "bbox": _bbox(x, y, w, h),
                    "confidence": _confidence(0.55 * solidity + 0.45 * whiteness),
                }
            )
    return regions


def segment_heuristic(img: np.ndarray) -> list[dict]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return _panel_regions(gray) + _bubble_regions(gray)
