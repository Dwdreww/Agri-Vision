import { getLocale } from './i18n.js';

export function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function newestFirst(items, key = 'createdAt') {
  return [...items].sort((left, right) => timestampMs(right[key]) - timestampMs(left[key]));
}

export function dateLabel(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const millis = timestampMs(value);
  return millis ? new Intl.DateTimeFormat(getLocale(), options).format(millis) : 'Just now';
}

export function conditionLabel(value) {
  return ({ normal: 'Normal', concerning: 'Concerning', unsure: 'Unsure' })[value] || 'Not reported';
}

export function statusLabel(scan) {
  return scan.statusLabel || ({ healthy: 'Healthy', risk: 'Risk', monitor: 'Monitor' })[scan.statusType] || 'Monitor';
}

export function readableError(error) {
  if (error?.name === 'BrowserStorageError') return error.message;
  const code = error?.code || '';
  const known = {
    'auth/email-already-in-use': 'This email already has an account.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/wrong-password': 'The password is incorrect.',
    'auth/weak-password': 'Use a longer password (at least 6 characters).',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Check your connection and try again.',
    'permission-denied': 'Your account does not have access to this information.',
    'storage/unauthorized': 'Your account does not have access to this photo.',
    'functions/unauthenticated': 'Your session expired. Sign in again.',
    unauthenticated: 'Your session expired. Sign in again.',
    'auth/requires-recent-login': 'Sign in again before changing your account.',
    'auth/user-disabled': 'This account is unavailable. Contact the project owner.',
    unavailable: 'The service is temporarily unavailable. Please try again.',
    'functions/unavailable': 'The service is temporarily unavailable. Please try again.',
    'deadline-exceeded': 'This is taking longer than expected. Please try again.',
    'functions/deadline-exceeded': 'This is taking longer than expected. Please try again.',
    'resource-exhausted': 'The service is busy. Please try again in a little while.',
    'functions/resource-exhausted': 'The service is busy. Please try again in a little while.'
  };
  if (known[code]) return known[code];
  const message = error?.message || '';
  const friendlyMessages = new Set([
    'Sign in to continue.',
    'Your account does not have access to this photo.',
    'This workspace action is not enabled yet.',
    'Photo saving is not enabled in this workspace yet.',
    'This account already imported browser history.',
    'The workspace service is unavailable. Please try again.',
    'The scanner returned an unreadable response.',
    'The scan could not be completed.',
    'Choose a JPG, PNG, or other supported image.',
    'This image could not be prepared.',
    'This image format cannot be opened.'
  ]);
  if (friendlyMessages.has(message)) return message;
  if (message === 'The scanner did not return a JPEG result image.') return 'The scanner could not prepare the result photo. Please try again.';
  if (['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'].includes(message)) return 'Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

export function getLegacyHistory() {
  try {
    const data = JSON.parse(localStorage.getItem('agriVisionBackendHistory') || '[]');
    return Array.isArray(data) ? data.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('Choose a JPG, PNG, or other supported image.'));
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const scale = Math.min(1, 1280 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('This image could not be prepared.'));
        resolve(new File([blob], 'pineapple-scan.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('This image format cannot be opened.'));
    };
    image.src = objectUrl;
  });
}
