const pages = document.querySelectorAll('.page');
const taskbarItems = document.querySelectorAll('.taskbar-item');

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const cameraBtn = document.getElementById('cameraBtn');
const clearBtn = document.getElementById('clearBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const previewBox = document.getElementById('previewBox');
const hiddenCanvas = document.getElementById('hiddenCanvas');

const topStatus = document.getElementById('topStatus');
const resultBadge = document.getElementById('resultBadge');
const resultText = document.getElementById('resultText');
const recommendationText = document.getElementById('recommendationText');

const detectionMetric = document.getElementById('detectionMetric');
const classMetric = document.getElementById('classMetric');
const confidenceMetric = document.getElementById('confidenceMetric');
const deviceMetric = document.getElementById('deviceMetric');
const detectionList = document.getElementById('detectionList');

const historyText = document.getElementById('historyText');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const backendStatusDot = document.getElementById('backendStatusDot');
const backendStatusText = document.getElementById('backendStatusText');
const backendSettingsBtn = document.getElementById('backendSettingsBtn');
const backendSettings = document.getElementById('backendSettings');
const backendUrlInput = document.getElementById('backendUrlInput');
const saveBackendConfigBtn = document.getElementById('saveBackendConfigBtn');
const clearBackendConfigBtn = document.getElementById('clearBackendConfigBtn');

let selectedImageFile = null;
let stream = null;
let currentObjectUrl = null;

let scanHistory = JSON.parse(localStorage.getItem('agriVisionBackendHistory') || '[]');

const backendConfigStorageKey = 'agriVisionBackendConfig';
const runtimeBackendConfig = window.AGRI_VISION_CONFIG || {};

let backendConfig = loadBackendConfig();

function normalizeBackendUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function loadBackendConfig() {
  let savedConfig = {};

  try {
    savedConfig = JSON.parse(localStorage.getItem(backendConfigStorageKey) || '{}');
  } catch (error) {
    savedConfig = {};
  }

  return {
    apiBaseUrl: normalizeBackendUrl(savedConfig.apiBaseUrl || runtimeBackendConfig.apiBaseUrl || '')
  };
}

function getDefaultBackendUrl() {
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:5000';
  }

  if (window.location.hostname.endsWith('github.io')) {
    return '';
  }

  return window.location.origin;
}

function getBackendUrl() {
  return backendConfig.apiBaseUrl || getDefaultBackendUrl();
}

function buildBackendUrl(path) {
  const baseUrl = getBackendUrl();

  if (!baseUrl) {
    throw new Error('Backend URL is not configured. Open Backend Settings and add your Flask deployment link.');
  }

  return `${baseUrl}${path}`;
}

function getBackendLabel() {
  const baseUrl = getBackendUrl();

  if (!baseUrl) {
    return 'Backend: Not configured';
  }

  if (backendConfig.apiBaseUrl) {
    return `Backend: ${backendConfig.apiBaseUrl}`;
  }

  return 'Backend: Same origin';
}

function updateBackendSettingsUI() {
  backendUrlInput.value = backendConfig.apiBaseUrl;
  backendStatusText.textContent = getBackendLabel();
  backendStatusDot.className = `backend-dot ${getBackendUrl() ? 'ready' : 'warning'}`;
}

function saveBackendConfig() {
  backendConfig = {
    apiBaseUrl: normalizeBackendUrl(backendUrlInput.value)
  };

  localStorage.setItem(backendConfigStorageKey, JSON.stringify(backendConfig));
  updateBackendSettingsUI();
  backendSettings.hidden = true;
  topStatus.textContent = 'Backend settings saved';
}

function clearBackendConfig() {
  localStorage.removeItem(backendConfigStorageKey);
  backendConfig = loadBackendConfig();
  updateBackendSettingsUI();
  topStatus.textContent = 'Backend settings reset';
}

function getFriendlyBackendError(error) {
  const message = error && error.message ? error.message : String(error);

  if (message === 'Failed to fetch' || message === 'NetworkError when attempting to fetch resource.') {
    return 'Backend is not reachable. Start the Flask backend again, then retry the analysis.';
  }

  return message;
}

function showPage(pageId) {
  pages.forEach(page => {
    page.classList.remove('active');
  });

  taskbarItems.forEach(item => {
    item.classList.remove('active');
  });

  const page = document.getElementById(pageId);
  const activeButton = document.querySelector(`.taskbar-item[data-page="${pageId}"]`);

  if (page) {
    page.classList.add('active');
  }

  if (activeButton) {
    activeButton.classList.add('active');
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function renderEmptyPreview() {
  previewBox.classList.remove('camera-active', 'image-loaded');

  previewBox.innerHTML = `
    <div class="empty-state">
      <div class="leaf-icon">🌿</div>
      <h4>No image selected</h4>
      <p>Upload a photo or open the camera to begin scanning.</p>
    </div>
  `;
}

function resetAnalysisUI() {
  resultBadge.textContent = 'Standby';
  resultBadge.className = 'result-badge standby';

  resultText.textContent = 'Waiting for an image sample. Your backend result will appear here after analysis.';
  recommendationText.textContent = 'Upload or capture a pineapple image to begin.';

  detectionMetric.textContent = '—';
  classMetric.textContent = '—';
  confidenceMetric.textContent = '—';
  deviceMetric.textContent = '—';

  detectionList.innerHTML = `<div class="detection-empty">No detections yet.</div>`;

  topStatus.textContent = 'Waiting for sample';
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
    });

    stream = null;
  }

  previewBox.classList.remove('camera-active');
}

function clearCurrentSample() {
  stopCamera();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  selectedImageFile = null;
  analyzeBtn.disabled = true;
  clearBtn.disabled = true;
  fileInput.value = '';

  renderEmptyPreview();
  resetAnalysisUI();
}

function showLocalPreview(file) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(file);

  previewBox.classList.remove('camera-active');
  previewBox.classList.add('image-loaded');

  previewBox.innerHTML = `
    <img src="${currentObjectUrl}" alt="Selected pineapple sample" class="preview-image" />
  `;

  selectedImageFile = file;
  analyzeBtn.disabled = false;
  clearBtn.disabled = false;

  resultBadge.textContent = 'Ready';
  resultBadge.className = 'result-badge ready';

  resultText.textContent = 'Sample loaded. Click Analyze to send it to the backend pipeline.';
  recommendationText.textContent = 'Review the image preview, then click Analyze.';

  detectionMetric.textContent = '—';
  classMetric.textContent = '—';
  confidenceMetric.textContent = '—';
  deviceMetric.textContent = '—';

  detectionList.innerHTML = `<div class="detection-empty">No backend result yet.</div>`;

  topStatus.textContent = 'Sample loaded';
}

function showBackendAnnotatedImage(dataUrl) {
  previewBox.classList.remove('camera-active');
  previewBox.classList.add('image-loaded');

  previewBox.innerHTML = `
    <img src="${dataUrl}" alt="Backend annotated result" class="preview-image" />
  `;
}

function setResultBadge(label, type) {
  resultBadge.textContent = label;
  resultBadge.className = `result-badge ${type || 'standby'}`;
}

function renderDetections(detections) {
  if (!detections || detections.length === 0) {
    detectionList.innerHTML = `
      <div class="detection-empty">
        No YOLO detections passed the confidence threshold.
      </div>
    `;
    return;
  }

  detectionList.innerHTML = detections.map((item, index) => {
    return `
      <div class="detection-item">
        <div>
          <strong>#${index + 1} ${item.pretty_class_name}</strong>
          <p>EfficientNet Confidence: ${item.efficientnet_confidence_percent}%</p>
          <p>YOLO Confidence: ${item.yolo_confidence_percent}%</p>
        </div>
      </div>
    `;
  }).join('');
}

function saveHistory(data) {
  const entry = {
    label: data.status_label,
    type: data.status_type,
    topClass: data.top_class,
    confidence: data.top_confidence,
    detections: data.detection_count,
    device: data.device,
    time: new Date().toLocaleString()
  };

  scanHistory.unshift(entry);
  scanHistory = scanHistory.slice(0, 12);

  localStorage.setItem('agriVisionBackendHistory', JSON.stringify(scanHistory));

  renderHistory();
}

function renderHistory() {
  if (!scanHistory.length) {
    historyText.textContent = 'No scan history yet. Your latest result will appear here after analysis.';

    historyList.innerHTML = `
      <div class="history-empty">No saved scan records yet.</div>
    `;

    return;
  }

  const latest = scanHistory[0];

  historyText.textContent =
    `Latest Scan: ${latest.label} | Class: ${latest.topClass} | Confidence: ${latest.confidence}% | Detections: ${latest.detections}`;

  historyList.innerHTML = scanHistory.map((item, index) => {
    return `
      <div class="history-item">
        <strong>Scan #${scanHistory.length - index}</strong>
        <span class="history-label ${item.type}">${item.label}</span>
        <p>Top Class: ${item.topClass}</p>
        <p>Confidence: ${item.confidence}% | Detections: ${item.detections}</p>
        <small>${item.time}</small>
      </div>
    `;
  }).join('');
}

async function analyzeWithBackend() {
  if (!selectedImageFile) return;

  analyzeBtn.disabled = true;
  uploadBtn.disabled = true;
  cameraBtn.disabled = true;
  clearBtn.disabled = true;

  topStatus.textContent = 'Sending to backend';

  setResultBadge('Analyzing', 'ready');

  resultText.textContent = 'Sending image to Python backend. Please wait...';
  recommendationText.textContent = 'Do not refresh the page while the model is processing.';

  detectionMetric.textContent = '...';
  classMetric.textContent = '...';
  confidenceMetric.textContent = '...';
  deviceMetric.textContent = '...';

  detectionList.innerHTML = `
    <div class="detection-empty">
      Running YOLO + EfficientNet pipeline...
    </div>
  `;

  try {
    const formData = new FormData();
    formData.append('image', selectedImageFile);

    const response = await fetch(buildBackendUrl('/predict'), {
      method: 'POST',
      body: formData
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : {
        success: false,
        error: `Backend returned ${response.status} ${response.statusText}. Check the backend URL.`
      };

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Backend prediction failed.');
    }

    showBackendAnnotatedImage(data.annotated_image);

    setResultBadge(data.status_label, data.status_type);

    resultText.textContent = data.message;
    recommendationText.textContent = data.recommendation;

    detectionMetric.textContent = data.detection_count;
    classMetric.textContent = data.top_class;
    confidenceMetric.textContent = `${data.top_confidence}%`;
    deviceMetric.textContent = data.device;

    renderDetections(data.detections);
    saveHistory(data);

    topStatus.textContent = `${data.status_label} result`;
  } catch (error) {
    const errorMessage = getFriendlyBackendError(error);

    setResultBadge('Error', 'risk');

    resultText.textContent = errorMessage;
    recommendationText.textContent = 'Make sure Flask is still running and the backend URL is correct. If you closed the backend terminal, start it again.';

    detectionMetric.textContent = '—';
    classMetric.textContent = 'Error';
    confidenceMetric.textContent = '—';
    deviceMetric.textContent = '—';

    detectionList.innerHTML = `
      <div class="detection-empty">
        ${errorMessage}
      </div>
    `;

    topStatus.textContent = 'Backend error';
  } finally {
    uploadBtn.disabled = false;
    cameraBtn.disabled = false;
    clearBtn.disabled = false;

    if (selectedImageFile) {
      analyzeBtn.disabled = false;
    }
  }
}

taskbarItems.forEach(item => {
  item.addEventListener('click', () => {
    showPage(item.dataset.page);
  });
});

backendSettingsBtn.addEventListener('click', () => {
  backendSettings.hidden = !backendSettings.hidden;
});

saveBackendConfigBtn.addEventListener('click', () => {
  saveBackendConfig();
});

clearBackendConfigBtn.addEventListener('click', () => {
  clearBackendConfig();
});

uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', event => {
  const file = event.target.files[0];

  if (!file) return;

  stopCamera();
  showLocalPreview(file);
});

cameraBtn.addEventListener('click', async () => {
  stopCamera();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setResultBadge('Error', 'risk');

    resultText.textContent = 'Camera is not supported on this browser.';
    recommendationText.textContent = 'Use the Upload button instead.';
    topStatus.textContent = 'Camera unavailable';

    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      },
      audio: false
    });

    previewBox.classList.remove('image-loaded');
    previewBox.classList.add('camera-active');

    previewBox.innerHTML = `
      <div class="camera-frame">
        <video autoplay playsinline></video>
        <button type="button" class="capture-btn" id="captureBtn">Capture Sample</button>
      </div>
    `;

    const video = previewBox.querySelector('video');
    const captureBtn = document.getElementById('captureBtn');

    video.srcObject = stream;

    clearBtn.disabled = false;
    analyzeBtn.disabled = true;

    topStatus.textContent = 'Camera active';

    setResultBadge('Camera', 'ready');

    resultText.textContent = 'Camera is active. Place the pineapple sample inside the frame.';
    recommendationText.textContent = 'Keep the image clear and well-lit before capturing.';

    captureBtn.addEventListener('click', () => {
      hiddenCanvas.width = video.videoWidth || 640;
      hiddenCanvas.height = video.videoHeight || 480;

      const context = hiddenCanvas.getContext('2d');
      context.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

      hiddenCanvas.toBlob(blob => {
        if (!blob) {
          setResultBadge('Error', 'risk');

          resultText.textContent = 'Failed to capture image.';
          recommendationText.textContent = 'Try opening the camera again.';

          return;
        }

        const capturedFile = new File(
          [blob],
          'camera_sample.png',
          {
            type: 'image/png'
          }
        );

        stopCamera();
        showLocalPreview(capturedFile);
      }, 'image/png');
    });
  } catch (error) {
    setResultBadge('Error', 'risk');

    resultText.textContent = 'Camera access denied or unavailable.';
    recommendationText.textContent = 'Try uploading an image instead.';
    topStatus.textContent = 'Camera blocked';
  }
});

clearBtn.addEventListener('click', () => {
  clearCurrentSample();
});

analyzeBtn.addEventListener('click', () => {
  analyzeWithBackend();
});

clearHistoryBtn.addEventListener('click', () => {
  const confirmClear = confirm('Clear all saved scan history from this browser?');

  if (!confirmClear) return;

  scanHistory = [];
  localStorage.removeItem('agriVisionBackendHistory');

  renderHistory();
});

window.addEventListener('beforeunload', () => {
  stopCamera();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
});

renderEmptyPreview();
resetAnalysisUI();
updateBackendSettingsUI();
renderHistory();
