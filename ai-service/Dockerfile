FROM python:3.11-slim

WORKDIR /srv
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1

# Install libexpat1 explicitly so each rebuild takes Debian's security-fixed
# package rather than retaining the version bundled in the Python base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --upgrade pip setuptools wheel jaraco.context
# Keep the CPU wheels as a tested torch/torchvision pair. Installing torch
# alone here lets the later Ultralytics install resolve an incompatible
# torchvision wheel, which fails at model warm-up with missing torchvision::nms.
RUN pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install -r requirements.txt

# pip is needed only while building the image. Removing it from the runtime
# image also removes its vendored build SBOM, which is not an application
# dependency and can otherwise report stale package versions to image scanners.
RUN rm -rf \
    /usr/local/bin/pip \
    /usr/local/bin/pip3 \
    /usr/local/bin/pip3.11 \
    /usr/local/lib/python3.11/site-packages/pip \
    /usr/local/lib/python3.11/site-packages/pip-*.dist-info

COPY scripts ./scripts
RUN python scripts/download_models.py

COPY app ./app
ENV MODEL_M109_PATH=/srv/models/manga109_yolo.pt MODEL_BUBBLE_PATH=/srv/models/bubble_seg.pt

RUN groupadd --system app && useradd --system --gid app --home-dir /srv --shell /usr/sbin/nologin app && chown -R app:app /srv

USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
