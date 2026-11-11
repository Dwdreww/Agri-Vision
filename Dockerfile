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

COPY app.py scanner_models.py scanner_auth.py ./
COPY models/bestv4.pt models/efficientnet_pineapple_bestv2.pth models/efficientnet_metrics.json ./models/
RUN python -c "from scanner_models import DETECTOR_ARTIFACT, DETECTOR_SHA256, file_sha256; assert file_sha256('models/' + DETECTOR_ARTIFACT) == DETECTOR_SHA256, 'Supply the reviewed YOLOv8m weights before building'"
RUN python -c "from scanner_models import CLASSIFIER_ARTIFACT, CLASSIFIER_SHA256, file_sha256, load_classifier_labels; assert file_sha256('models/' + CLASSIFIER_ARTIFACT) == CLASSIFIER_SHA256, 'Supply the reviewed EfficientNet weights before building'; load_classifier_labels('models/efficientnet_metrics.json')"

EXPOSE 7860

CMD gunicorn app:app --bind 0.0.0.0:${PORT} --workers 1 --timeout 300
