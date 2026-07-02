# Mangaka AI Service

Microservice **FastAPI** (Python) làm nhiệm vụ **phân vùng trang truyện** (page segmentation) cho Spec 2 của Epic A4.
Service **stateless**: KHÔNG chạm MongoDB/Redis, KHÔNG giữ trạng thái. Backend NestJS gọi qua HTTP, nhận về danh sách
vùng (`regions`) rồi tự lưu DB theo cơ chế **proposal-first** (xem A-TSK-01).

- **Vào/ra:** BE gửi `imageUrl` (signed URL của R2) + `mode` → service tải ảnh, chạy detect → trả `regions[]`.
- **2 chế độ:**
  - `MODEL` — YOLO (Manga109 panel detect + speech-bubble segmentation). Nặng hơn, chính xác hơn.
  - `HEURISTIC` — OpenCV thuần (không cần model weights). Nhẹ, làm baseline/fallback.
- **Không bật AI cũng không sao:** BE để `AI_SERVICE_URL` rỗng → toàn bộ luồng segment tự fallback về **manual** (AC3).

---

## 1. Yêu cầu

- **Python 3.11** (Docker image dùng `python:3.11-slim`; bản 3.13 vẫn chạy được local nhưng nên bám 3.11 cho khớp prod).
- ~**1–1.5GB RAM** khi chạy `MODEL` (torch CPU + 2 model). `HEURISTIC` gần như không tốn.
- Kết nối internet **lần đầu** để tải model weights từ Hugging Face (public, KHÔNG cần token).

---

## 2. "Key" cần những gì?

| Key                                                 | Bắt buộc?             | Lấy ở đâu                                                                         | Ghi chú                                                                                                                                              |
| --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_KEY`                                           | ✅ Có                  | **Tự đặt** (chuỗi bí mật bất kỳ)                                                  | Shared secret giữa AI service ↔ Backend. **Phải KHỚP** với `AI_SERVICE_API_KEY` bên `.env` của BE. Client gửi qua header `x-api-key`; sai → **401**. |
| Model weights (`manga109_yolo.pt`, `bubble_seg.pt`) | ✅ Có (cho mode MODEL) | Hugging Face — **tự tải bằng script**, KHÔNG cần Hugging Face token (repo public) | Lưu ở `ai-service/models/` (đã gitignore). Xem §3.                                                                                                   |
| `MODEL_M109_PATH` / `MODEL_BUBBLE_PATH`             | ✅ Có (mode MODEL)     | Trỏ tới 2 file `.pt` vừa tải                                                      | Docker set sẵn `/srv/models/...`.                                                                                                                    |
| `CONF_THRESHOLD`                                    | ❌ Optional            | Tự đặt (vd `0.25`)                                                                | Ngưỡng confidence lọc box. Rỗng = dùng mặc định của model.                                                                                           |

> **Không có key nào của bên thứ ba (Google/OpenAI/...)** — model chạy **hoàn toàn local**. "Key" duy nhất bạn phải tự tạo là `API_KEY` để BE và AI xác thực lẫn nhau.

---

## 3. Chạy local (không Docker)

### 3.1. Tạo venv + cài dependencies

**Windows (PowerShell):**
```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\pip install --index-url https://download.pytorch.org/whl/cpu torch
.\.venv\Scripts\pip install -r requirements.txt
```

**macOS / Linux (bash):**
```bash
cd ai-service
python3 -m venv .venv
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/bin/pip install -r requirements.txt
```

> Cài `torch` bản **CPU** trước (nhẹ hơn nhiều bản CUDA mặc định). `requirements.txt` không pin torch để tránh kéo bản GPU.

### 3.2. Tải model weights (chỉ cần cho mode MODEL)

```powershell
# Windows
.\.venv\Scripts\python scripts\download_models.py
```
```bash
# macOS / Linux
.venv/bin/python scripts/download_models.py
```

Script kéo 2 repo public từ Hugging Face về `ai-service/models/`:
- `deepghs/manga109_yolo` → `manga109_yolo.pt` (panel detection)
- `kitsumed/yolov8m_seg-speech-bubble` → `bubble_seg.pt` (speech bubble segmentation)

> Chỉ chạy `HEURISTIC`? Có thể **bỏ qua** bước này.

### 3.3. Đặt biến môi trường + chạy

Copy `.env.example` → `.env` rồi điền, hoặc export trực tiếp:

**Windows (PowerShell):**
```powershell
$env:API_KEY = "dev-ai-key"
$env:MODEL_M109_PATH = "./models/manga109_yolo.pt"
$env:MODEL_BUBBLE_PATH = "./models/bubble_seg.pt"
.\.venv\Scripts\uvicorn app.main:app --port 8000 --reload
```

**macOS / Linux (bash):**
```bash
export API_KEY=dev-ai-key
export MODEL_M109_PATH=./models/manga109_yolo.pt
export MODEL_BUBBLE_PATH=./models/bubble_seg.pt
.venv/bin/uvicorn app.main:app --port 8000 --reload
```

Service lên tại `http://localhost:8000`. Model chỉ được **load lần đầu** khi có request `MODE=MODEL` (lazy).

### 3.4. Smoke test nhanh

```bash
curl http://localhost:8000/healthz
# {"status":"ok","modes":["MODEL","HEURISTIC"]}

curl -X POST http://localhost:8000/v1/segment \
  -H "x-api-key: dev-ai-key" \
  -H "content-type: application/json" \
  -d '{"imageUrl":"https://.../page.png","mode":"HEURISTIC"}'
```

Chạy unit test:
```bash
.venv/bin/pytest        # hoặc .\.venv\Scripts\pytest trên Windows
```

---

## 4. Chạy bằng Docker

### 4.1. Standalone

```bash
cd ai-service
docker build -t mangaka-ai .
docker run --rm -p 8000:8000 -e API_KEY=dev-ai-key mangaka-ai
```

Model weights được **tải sẵn lúc build** (`RUN python scripts/download_models.py` trong Dockerfile) và bake vào image →
container không cần internet lúc chạy. `MODEL_M109_PATH`/`MODEL_BUBBLE_PATH` đã set sẵn `/srv/models/...`.

### 4.2. Cùng stack prod (`docker-compose.prod.yml`)

Service `ai-service` nằm sau **profile `ai`** (mặc định TẮT để tiết kiệm RAM trên VPS 2GB):

```bash
# Từ thư mục BE-dev/
docker compose -f docker-compose.prod.yml --profile ai up -d
```

- `API_KEY` của AI lấy từ `AI_SERVICE_API_KEY` trong `.env` gốc BE.
- Có `mem_limit: 1200m` + `memswap_limit: 2500m` → cách ly AI khỏi api/redis; nếu AI ngốn RAM quá mức, kernel chỉ giết
  **đúng container AI** (job FAILED sạch, BE không sập — đúng AC3).
- Muốn BE gọi được AI trong mạng compose: đặt `AI_SERVICE_URL=http://ai-service:8000` trong `.env` gốc BE.

---

## 5. Contract API

### `GET /healthz`
Không cần auth → `{ "status": "ok", "modes": ["MODEL", "HEURISTIC"] }`.

### `POST /v1/segment`
- **Header:** `x-api-key: <API_KEY>` (sai/thiếu → **401**)
- **Body:**
  ```json
  { "imageUrl": "https://signed-url-r2", "mode": "MODEL" }
  ```
- **Lỗi:** tải ảnh fail / ảnh > 15MB / decode fail → **422**.
- **Response:**
  ```json
  {
    "modelVersion": "m109-yolo_n@2023.12.07+bubble-seg_m@1.0",
    "imageWidth": 1690,
    "imageHeight": 2400,
    "regions": [
      { "type": "PANEL", "subtype": "frame",
        "bbox": { "x": 0, "y": 0, "width": 100, "height": 100 }, "confidence": 0.9 }
    ]
  }
  ```

---

## 6. Backend kết nối thế nào

BE đọc 3 biến trong `.env` (module `src/modules/ai`, client `ports/ai-http.client.ts`):

| Biến (BE `.env`)     | Ý nghĩa                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_SERVICE_URL`     | Base URL của AI service. **Rỗng = AI TẮT** → segment fallback manual. Local: `http://localhost:8000`; compose: `http://ai-service:8000`. |
| `AI_SERVICE_API_KEY` | Phải **khớp** `API_KEY` của AI service.                                                                                                  |
| `AI_HTTP_TIMEOUT_MS` | Timeout gọi HTTP (default 120000).                                                                                                       |

> `envConfig` có ràng buộc: nếu `AI_SERVICE_URL` được set thì `AI_SERVICE_API_KEY` **bắt buộc** không rỗng, nếu không app BE fail-fast lúc boot.

Luồng đầy đủ (proposal-first): FE `POST /pages/:id/segment {mode}` → BE enqueue job queue `ai` → gọi `POST /v1/segment`
→ lưu `AiJob.proposedRegions` → Mangaka `POST /ai-jobs/:id/apply` mới ghi `Region[]` thật.

---

## 7. Ghi chú giấy phép (License)

Service phục vụ **coursework/demo phi thương mại**. Trước khi dùng thương mại phải review license:

- `deepghs/manga109_yolo` — weights suy ra từ dataset nghiên cứu Manga109.
- `kitsumed/yolov8m_seg-speech-bubble` — **GPL-3.0**.
- Ultralytics runtime — **AGPL-3.0**.
