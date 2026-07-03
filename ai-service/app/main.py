import os

import cv2
import httpx
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException

from .heuristic import HEURISTIC_VERSION, segment_heuristic
from .schemas import SegmentRequest, SegmentResponse

MAX_IMAGE_BYTES = 15 * 1024 * 1024
FETCH_TIMEOUT_S = 30

app = FastAPI(title="Mangaka AI Service", version="1.0.0")


def check_api_key(x_api_key: str = Header(default="")):
    if x_api_key != os.environ.get("API_KEY", ""):
        raise HTTPException(status_code=401, detail="invalid api key")


def fetch_image(url: str) -> np.ndarray:
    try:
        resp = httpx.get(url, timeout=FETCH_TIMEOUT_S, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=422, detail=f"image fetch failed: {exc}") from exc
    if len(resp.content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="image exceeds 15MB")
    img = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail="image decode failed")
    return img


def run_model(img: np.ndarray) -> tuple[str, list[dict]]:
    from .inference import MODEL_VERSION, segment_model

    return MODEL_VERSION, segment_model(img)


@app.get("/healthz")
def healthz():
    return {"status": "ok", "modes": ["MODEL", "HEURISTIC"]}


@app.post("/v1/segment", response_model=SegmentResponse, dependencies=[Depends(check_api_key)])
def segment(req: SegmentRequest):
    img = fetch_image(str(req.imageUrl))
    if req.mode == "HEURISTIC":
        version, regions = HEURISTIC_VERSION, segment_heuristic(img)
    else:
        version, regions = run_model(img)
    return SegmentResponse(modelVersion=version, imageWidth=img.shape[1], imageHeight=img.shape[0], regions=regions)
