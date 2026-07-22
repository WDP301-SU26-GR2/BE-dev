FROM python:3.11-slim

WORKDIR /srv
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
# Keep the CPU wheels as a tested torch/torchvision pair. Installing torch
# alone here lets the later Ultralytics install resolve an incompatible
# torchvision wheel, which fails at model warm-up with missing torchvision::nms.
RUN pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY scripts ./scripts
RUN python scripts/download_models.py

COPY app ./app
ENV MODEL_M109_PATH=/srv/models/manga109_yolo.pt MODEL_BUBBLE_PATH=/srv/models/bubble_seg.pt

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
