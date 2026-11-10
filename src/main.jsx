import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import Welcome from './Welcome.jsx';
import { isGuestSession } from './guest-session.js';
import { entrySurface } from './entry-route.js';
import { t } from './i18n.js';
import './styles.css';
import './interface.css';

const WorkspaceApp = lazy(() => import('./WorkspaceApp.jsx'));
let guestStorage;
try { guestStorage = window.sessionStorage; } catch { /* Explicit entry links also work without session storage. */ }
const surface = entrySurface(window.location.search, isGuestSession({ storage: guestStorage, search: window.location.search }));
document.title = 'AgriVision | Pineapple care';
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<React.StrictMode>{surface === 'welcome' ? <Welcome /> : <Suspense fallback={<main className="loading-entry" role="status">{t('Opening your workspace…')}</main>}><WorkspaceApp /></Suspense>}</React.StrictMode>);
