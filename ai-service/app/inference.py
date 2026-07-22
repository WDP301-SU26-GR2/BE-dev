import os
from functools import lru_cache

MODEL_VERSION = "m109-yolo_n@2023.12.07+bubble-seg_m@1.0"
# Docker Compose may explicitly pass an empty value. Treat it the same as an
# unset variable so MODEL mode still receives the documented default.
CONF_THRESHOLD = float(os.environ.get("CONF_THRESHOLD") or "0.25")
IOU_DEDUPE = 0.5

M109_CLASS_MAP = {
    "frame": ("PANEL", "frame"),
    "body": ("CHARACTER", "body"),
    "text": ("SPEECH_BUBBLE", "text-block"),
}


def map_m109_class(name: str):
    return M109_CLASS_MAP.get(name)


def _iou(a: dict, b: dict) -> float:
    ax1, ay1 = a["bbox"]["x"], a["bbox"]["y"]
    ax2, ay2 = ax1 + a["bbox"]["width"], ay1 + a["bbox"]["height"]
    bx1, by1 = b["bbox"]["x"], b["bbox"]["y"]
    bx2, by2 = bx1 + b["bbox"]["width"], by1 + b["bbox"]["height"]
    ix = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    iy = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = ix * iy
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def dedupe_text_vs_bubble(text_regions: list[dict], bubble_regions: list[dict]) -> list[dict]:
    kept_text = [t for t in text_regions if all(_iou(t, b) <= IOU_DEDUPE for b in bubble_regions)]
    return bubble_regions + kept_text


@lru_cache(maxsize=1)
def _models():
    from ultralytics import YOLO

    m109 = YOLO(os.environ["MODEL_M109_PATH"])
    bubble = YOLO(os.environ["MODEL_BUBBLE_PATH"])
    return m109, bubble


def _region(rtype: str, subtype: str, xyxy, conf) -> dict:
    x1, y1, x2, y2 = (float(v) for v in xyxy)
    return {
        "type": rtype,
        "subtype": subtype,
        "bbox": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
        "confidence": float(conf),
    }


def segment_model(img) -> list[dict]:
    m109, bubble = _models()
    others, texts = [], []

    r1 = m109.predict(img, conf=CONF_THRESHOLD, verbose=False)[0]
    for box in r1.boxes:
        mapped = map_m109_class(r1.names[int(box.cls)])
        if mapped is None:
            continue
        rtype, subtype = mapped
        region = _region(rtype, subtype, box.xyxy[0].tolist(), box.conf[0])
        (texts if subtype == "text-block" else others).append(region)

    r2 = bubble.predict(img, conf=CONF_THRESHOLD, verbose=False)[0]
    bubbles = [_region("SPEECH_BUBBLE", "bubble", b.xyxy[0].tolist(), b.conf[0]) for b in (r2.boxes or [])]
    return others + dedupe_text_vs_bubble(texts, bubbles)
