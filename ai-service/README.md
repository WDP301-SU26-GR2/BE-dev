# Mangaka AI Service

FastAPI microservice for Spec 2 page segmentation. It is stateless, does not touch MongoDB/Redis, and returns the BE-compatible `/v1/segment` contract.

## Local

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python scripts/download_models.py
set API_KEY=dev-key
set MODEL_M109_PATH=./models/manga109_yolo.pt
set MODEL_BUBBLE_PATH=./models/bubble_seg.pt
.venv/Scripts/uvicorn app.main:app --port 8000
```

`HEURISTIC` mode works without loading YOLO. `MODEL` mode loads the two configured model files on first request.

## Contract

`POST /v1/segment`

Headers: `x-api-key: <API_KEY>`

Body:

```json
{ "imageUrl": "https://signed-url", "mode": "MODEL" }
```

Response:

```json
{
  "modelVersion": "m109-yolo_n@2023.12.07+bubble-seg_m@1.0",
  "imageWidth": 1690,
  "imageHeight": 2400,
  "regions": [
    { "type": "PANEL", "subtype": "frame", "bbox": { "x": 0, "y": 0, "width": 100, "height": 100 }, "confidence": 0.9 }
  ]
}
```

## License Notes

This service is intended for non-commercial coursework/demo use. Model/runtime licenses must be reviewed before commercial use:

- `deepghs/manga109_yolo`: Manga109 research dataset derived weights.
- `kitsumed/yolov8m_seg-speech-bubble`: GPL-3.0.
- Ultralytics runtime: AGPL-3.0.
