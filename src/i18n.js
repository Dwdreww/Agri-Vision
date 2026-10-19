import { filipino } from './translations/fil.js';

export const LANGUAGE_KEY = 'agriVisionLanguage';
export const languages = [{ value: 'en', label: 'English' }, { value: 'fil', label: 'Filipino' }];
const normalize = value => languages.some(item => item.value === value) ? value : 'en';

export function readLanguage(storage) {
  try { return normalize(storage?.getItem(LANGUAGE_KEY)); }
  catch { return 'en'; }
}

export function rememberLanguage(storage, value) {
  const language = normalize(value);
  try { storage?.setItem(LANGUAGE_KEY, language); } catch { /* Still usable for this visit. */ }
  return language;
}

export function translate(message, language = 'en', values = {}) {
  if (typeof message !== 'string') return message;
  const key = message.trim();
  const text = language === 'fil' && Object.hasOwn(filipino, key)
    ? message.slice(0, message.indexOf(key)) + filipino[key] + message.slice(message.indexOf(key) + key.length)
    : message;
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

let activeLanguage;
const listeners = new Set();
function browserStorage() { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
export function getLanguage() { return activeLanguage ??= readLanguage(browserStorage()); }
export function getLocale() { return getLanguage() === 'fil' ? 'fil-PH' : 'en-PH'; }
export function setLanguage(value) {
  activeLanguage = rememberLanguage(browserStorage(), value);
  listeners.forEach(listener => listener());
}
export function subscribeLanguage(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export const t = (message, values) => translate(message, getLanguage(), values);
