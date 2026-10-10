FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PORT=7860

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

COPY app.py preprocessing.py yolov8.pt efficientnetB0.pth ./
RUN python -c "from pathlib import Path; assert all(Path(p).stat().st_size > 1024 for p in ('yolov8.pt', 'efficientnetB0.pth')), 'Fetch Git LFS model weights before building the backend image'"

EXPOSE 7860

CMD gunicorn app:app --bind 0.0.0.0:${PORT} --workers 1 --timeout 300
