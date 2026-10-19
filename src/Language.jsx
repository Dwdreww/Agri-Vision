import { useEffect, useId, useSyncExternalStore } from 'react';
import { Languages } from 'lucide-react';
import { getLanguage, languages, setLanguage, subscribeLanguage, t } from './i18n.js';

export function useLanguage() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en');
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return { language, setLanguage, t };
}

export function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();
  const id = useId();
  return <div className="language-picker">
    <label htmlFor={id}><Languages size={17} />{t('Language')}</label>
    <select id={id} value={language} onChange={event => setLanguage(event.target.value)}>
      {languages.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </div>;
}

export function LanguageSettings() {
  const { t, language } = useLanguage();
  return <section className="panel settings-card"><h2>{t('Language')}</h2><p>{t('Choose the language for buttons, instructions, and help. Your farm names and notes stay as you wrote them.')}</p><LanguagePicker /><p className="quiet-caption">{t('English is the default. Your choice is saved in this browser.')}</p>{language === 'fil' && <p className="quiet-caption">{t('Detailed model text and AI advice may be in English.')}</p>}</section>;
}
