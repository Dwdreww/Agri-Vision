import { t } from './i18n.js';
import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Activity, BookOpen, FlaskConical, HelpCircle, LayoutDashboard, LogOut, Menu, Moon, ScanLine, Settings, Sprout, Sun, X } from 'lucide-react';
import { auth, db, firebaseConfigured, browserWorkspace } from './firebase';
import { BROWSER_UID } from './browser-store.js';
import { enterGuestSession, leaveGuestSession } from './guest-session.js';
import BrowserSettingsView from './BrowserSettings.jsx';
import { watchAccount } from './data';
import { Brand, LoadingScreen, NetworkBanner } from './components';
import { ActivityView, DashboardView, FarmsView, PlotView, ResearchView, SettingsView as AccountSettingsView } from './Views';
import ScanView from './Scan';
import HealthGuideView from './HealthGuide';
import HowToUseView, { Introduction } from './HowToUse';
import { useDialog } from './use-dialog';
import { readableError } from './utils';
import { useWorkspaceServices } from './services';
import { retryAuthConnection } from './auth-retry';
import { LanguagePicker, useLanguage } from './Language.jsx';

const SettingsView = browserWorkspace ? BrowserSettingsView : AccountSettingsView;
const emptyData = { profile: null, farms: [], plots: [], scans: [], observations: [], tasks: [], ready: false };
const mainNavigation = [
  ['dashboard', 'Overview', LayoutDashboard],
  ['farms', 'Farms', Sprout],
  ['scan', "Check", ScanLine],
  ['activity', 'History', Activity],
  ['settings', 'Settings', Settings]
];

function AuthPage({ onNotify }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function continueAsGuest() {
    let storage;
    try { storage = window.sessionStorage; } catch { /* The helper uses an explicit URL fallback. */ }
    window.location.assign(enterGuestSession({ storage, href: window.location.href }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!navigator.onLine) { setError('Connect to the internet and try again.'); return; }
    setBusy(true);
    setError('');
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        onNotify('Password reset email sent. Check your inbox.');
        setMode('login');
      } else if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await setDoc(doc(db, 'users', credential.user.uid), {
          displayName: name.trim(), email: credential.user.email,
          createdAt: serverTimestamp(), historyImportedAt: null
        });
      } else {
        await retryAuthConnection(() => signInWithEmailAndPassword(auth, email.trim(), password));
      }
    } catch (issue) { setError(readableError(issue)); }
    finally { setBusy(false); }
  }

  return <div className="auth-page">
    <div className="auth-visual"><Brand /><div className="auth-visual-copy"><span className="eyebrow">{t("A CLEARER VIEW OF YOUR CROP")}</span><h1>{t("Small checks.")}<br /><span>{t("Better care.")}</span></h1><p>{t("Keep your pineapple photos, field notes, and next steps together.")}</p><div className="auth-ribbon" aria-hidden="true"><span>01<small>{t("Photo")}</small></span><i /><span>02<small>{t("Check")}</small></span><i /><span>03<small>{t("Care")}</small></span></div></div><div className="auth-visual-bottom"><span>{t("Observe. Understand. Care.")}</span><ScanLine size={24} /></div></div>
    <main className="auth-main"><div className="auth-card"><LanguagePicker /><div className="auth-mobile-brand"><Brand /></div><span className="eyebrow">{t("YOUR GROWING SPACE")}</span><h2>{mode === 'register' ? t("Create your account") : mode === 'reset' ? t("Reset your password") : t("Welcome back.")}</h2><p>{mode === 'register' ? t("Start a private space for your farms and pineapple growing areas.") : mode === 'reset' ? t("We’ll email you a link to set a new password.") : t("Sign in and pick up where you left off.")}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label className="field"><span>{t("Your name")}</span><input autoFocus required maxLength={80} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder={t("How should we greet you?")} /></label>}
        <label className="field"><span>{t("Email address")}</span><input autoFocus={mode !== 'register'} required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={t("you@example.com")} /></label>
        {mode !== 'reset' && <label className="field"><span>{t("Password")}</span><input required minLength={mode === 'register' ? 6 : undefined} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={t("Enter your password")} /></label>}
        {error && <div className="inline-error" role="alert">{t(error)}</div>}
        <button className="button button-primary button-large auth-submit" disabled={busy}>{busy ? t("Please wait…") : mode === 'register' ? t("Create account") : mode === 'reset' ? t("Send reset email") : t("Sign in")}</button>
      </form>
      {mode === 'login' && <div className="guest-entry"><span>{t("Or use this browser's saved history")}</span><button className="button button-soft button-large" type="button" disabled={busy} onClick={continueAsGuest}>{t("Continue as guest ")}<Sprout size={18} /></button><p>{t("No email or password needed. Saved guest records stay in this browser.")}</p></div>}
      <div className="auth-links">{mode === 'login' ? <><button type="button" onClick={() => { setError(''); setMode('reset'); }}>{t("Forgot password?")}</button><span>{t("New here? ")}<button type="button" onClick={() => { setError(''); setMode('register'); }}>{t("Create an account")}</button></span></> : <button type="button" onClick={() => { setError(''); setMode('login'); }}>{t("Back to sign in")}</button>}</div>
      <p className="auth-footnote">{t("Your farm records and photos are private to your account.")}</p>
    </div></main>
  </div>;
}

export default function App() {
  useLanguage();
  const services = useWorkspaceServices();
  const [user, setUser] = useState(browserWorkspace ? { uid: BROWSER_UID, displayName: 'Grower' } : undefined);
  const [data, setData] = useState(emptyData);
  const [dataError, setDataError] = useState('');
  const [page, setPage] = useState('dashboard');
  const [plotId, setPlotId] = useState('');
  const [viewAction, setViewAction] = useState('');
  const [online, setOnline] = useState(browserWorkspace || navigator.onLine);
  const [researcher, setResearcher] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const menuDialog = useDialog(menuOpen, () => setMenuOpen(false));
  const [themePreference, setThemePreference] = useState(() => { try { return localStorage.getItem('agriVisionTheme') || 'system'; } catch { return 'system'; } });
  const [deviceDark, setDeviceDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (!notice || notice.type === 'error') return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setDeviceDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    try { localStorage.setItem('agriVisionTheme', themePreference); } catch { /* Theme remains usable in this tab. */ }
    document.documentElement.dataset.theme = themePreference === 'system' ? (deviceDark ? 'dark' : 'light') : themePreference;
  }, [themePreference, deviceDark]);
  useEffect(() => {
    const change = () => setOnline(browserWorkspace || navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);
  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, account => { setUser(account); if (!account) { setData(emptyData); setPage('dashboard'); setResearcher(false); setMenuOpen(false); setIntroOpen(false); } });
  }, []);
  useEffect(() => {
    if (!user || (!browserWorkspace && !db)) return undefined;
    let current = true;
    setData(emptyData);
    setDataError('');
    const unsubscribe = watchAccount(user.uid, next => { if (current) { setData(next); setDataError(''); } }, issue => { if (current) setDataError(readableError(issue)); });
    if (browserWorkspace) return () => { current = false; unsubscribe(); };
    getDoc(doc(db, 'users', user.uid)).then(snapshot => {
      if (!snapshot.exists() && current) return setDoc(doc(db, 'users', user.uid), { displayName: user.displayName || user.email?.split('@')[0] || 'Grower', email: user.email, createdAt: serverTimestamp(), historyImportedAt: null });
    }).catch(issue => { if (current) setDataError(readableError(issue)); });
    user.getIdTokenResult().then(token => { if (current) setResearcher(token.claims.researcher === true); }).catch(() => {});
    return () => { current = false; unsubscribe(); };
  }, [user]);

  function closeIntroduction() { setIntroOpen(false); }

  function notify(message, type = 'success') {
    setNotice({ message, type, id: Date.now() });
  }
  async function refreshResearcher() {
    if (!user) return;
    try { const token = await retryAuthConnection(() => user.getIdTokenResult(true)); setResearcher(token.claims.researcher === true); notify('Research access refreshed.'); }
    catch (issue) { notify(readableError(issue), 'error'); }
  }
  function navigate(destination, selectedPlotId = '', action = '') {
    setPage(destination);
    setViewAction(action);
    if (selectedPlotId) setPlotId(selectedPlotId);
    else if (destination === 'scan') setPlotId('');
    setMenuOpen(false);
    const label = destination === 'plot' ? "Growing area details" : destination === 'guide' ? 'Health guide' : destination === 'help' ? 'How to use' : destination === 'research' ? 'Research' : mainNavigation.find(item => item[0] === destination)?.[1] || 'Overview';
    setNavigationAnnouncement(label);
    requestAnimationFrame(() => {
      const entryForm = action === 'observation' ? document.querySelector("#plot-observation-form input") : null;
      (entryForm || document.getElementById('main-content'))?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  async function leaveWorkspace() {
    setMenuOpen(false);
    if (browserWorkspace) {
      let storage;
      try { storage = window.sessionStorage; } catch { /* Clear the URL fallback too. */ }
      window.location.assign(leaveGuestSession({ storage, href: window.location.href }));
      return;
    }
    try { await signOut(auth); }
    catch (issue) { notify(readableError(issue), 'error'); }
  }

  if (!browserWorkspace && !firebaseConfigured) return <div className="setup-page"><Brand /><div className="panel"><span className="eyebrow">{t("SETUP NEEDED")}</span><h1>{t("Connect AGRI-VISION to Firebase")}</h1><p>{t("Set the Firebase web values in your local environment or Vercel project, then reload this page.")}</p><p>{t("See ")}<code>{t(".env.example")}</code>{t(" and the deployment guide in the project.")}</p></div></div>;
  if (user === undefined) return <LoadingScreen text={t("Opening AGRI-VISION…")} />;
  if (!user) return <><NetworkBanner online={online} /><AuthPage onNotify={notify} />{notice && <div className={`toast toast-${notice.type}`} role="status">{t(notice.message)}<button type="button" onClick={() => setNotice(null)} aria-label={t("Dismiss message")}><X size={16} /></button></div>}</>;

  const navigation = mainNavigation;
  const view = dataError ? <div className="view"><div className="panel error-panel"><h1>{t("Could not load your workspace")}</h1><p>{t(dataError)}</p><button className="button button-soft" onClick={() => window.location.reload()}>{t("Try again")}</button></div></div> : !data.ready ? <LoadingScreen /> : page === 'farms' ? <FarmsView initialAction={viewAction} uid={user.uid} data={data} onNavigate={navigate} onNotify={notify} online={online} /> : page === 'plot' ? <PlotView initialAction={viewAction} uid={user.uid} data={data} plotId={plotId} onNavigate={navigate} onNotify={notify} online={online} /> : page === 'scan' ? <ScanView uid={user.uid} user={user} plots={data.plots} farms={data.farms} initialPlotId={plotId} onNavigate={navigate} onNotify={notify} online={online} /> : page === 'activity' ? <ActivityView initialAction={viewAction} uid={user.uid} data={data} onNotify={notify} /> : page === 'guide' ? <HealthGuideView onNavigate={navigate} /> : page === 'help' ? <HowToUseView onNavigate={navigate} onReplay={() => setIntroOpen(true)} /> : page === 'research' ? <ResearchView researcher={researcher} onNotify={notify} /> : page === 'settings' ? <SettingsView user={user} data={data} themePreference={themePreference} setThemePreference={setThemePreference} researcher={researcher} refreshResearcher={refreshResearcher} onNotify={notify} online={online} /> : <DashboardView user={user} data={data} onNavigate={navigate} onNotify={notify} />;

  const isCurrent = key => page === key || (page === 'plot' && key === 'farms');
  const initials = (data.profile?.displayName || user.email || 'A').slice(0, 1).toUpperCase();

  return <div className="app-shell" data-page={page}>
    <a className="skip-link" href="#main-content">{t("Skip to content")}</a>
    <NetworkBanner online={online} />
    <header className="workspace-header">
      <button className="brand-home" type="button" onClick={() => navigate('dashboard')} aria-label={t("AGRI-VISION overview")}><Brand /></button>
      <nav className="desktop-navigation" aria-label={t("Main navigation")}>{navigation.map(([key, label]) => <button key={key} type="button" aria-current={isCurrent(key) ? 'page' : undefined} className={isCurrent(key) ? 'active' : ''} onClick={() => navigate(key)}>{t(label)}</button>)}</nav>
      <div className="flex items-center gap-2">
        <span className={`scanner-indicator ${services.scanner ? 'scanner-ready' : ''}`}><span />{browserWorkspace ? t("Saved in this browser") : services.checking ? t("Checking scanner") : services.scanner ? t("Scanner ready") : t("Scanner unavailable")}</span>
        <button className="button button-text help-trigger" type="button" onClick={() => navigate('help')}><HelpCircle size={19} /><span>{t("Help")}</span></button>
        <button className="icon-button theme-toggle" type="button" onClick={() => setThemePreference(themePreference === 'dark' || (themePreference === 'system' && deviceDark) ? 'light' : 'dark')} aria-label={t("Switch color theme")}>{themePreference === 'dark' || (themePreference === 'system' && deviceDark) ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button className="account-menu-trigger" type="button" onClick={() => setMenuOpen(true)} aria-label={t("Open workspace menu")} aria-expanded={menuOpen} aria-controls="workspace-navigation"><span className="account-avatar">{initials}</span><Menu size={17} /></button>
      </div>
    </header>
    {menuOpen && <div className="menu-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
      <aside ref={menuDialog} id="workspace-navigation" role="dialog" aria-modal="true" aria-label={t("Workspace menu")} tabIndex={-1} className="workspace-menu">
        <div className="flex items-center justify-between gap-4"><Brand /><button className="icon-button" type="button" onClick={() => setMenuOpen(false)} aria-label={t("Close menu")}><X size={20} /></button></div>
        <div className="menu-account"><span className="account-avatar">{initials}</span><div><strong>{data.profile?.displayName || t("Your account")}</strong><small>{browserWorkspace ? t("Browser workspace · No account needed") : t("Private workspace")}</small></div></div>
        <nav className="menu-main-navigation" aria-label={t("Workspace pages")}>{navigation.map(([key, label, Icon]) => <button key={key} type="button" aria-current={isCurrent(key) ? 'page' : undefined} className={`nav-link ${isCurrent(key) ? 'active' : ''}`} onClick={() => navigate(key)}><Icon size={19} /><span>{t(label)}</span></button>)}</nav>
        <LanguagePicker /><span className="eyebrow">{t("HELP & REFERENCE")}</span>
        <nav aria-label={t("Reference navigation")}><button className="nav-link" aria-current={page === 'help' ? 'page' : undefined} type="button" onClick={() => navigate('help')}><HelpCircle size={19} /><span>{t("How to use")}</span></button><button className="nav-link" aria-current={page === 'guide' ? 'page' : undefined} type="button" onClick={() => navigate('guide')}><BookOpen size={19} /><span>{t("Health guide")}</span></button>{researcher && services.sharing && <button className="nav-link" aria-current={page === 'research' ? 'page' : undefined} type="button" onClick={() => navigate('research')}><FlaskConical size={19} /><span>{t("Research")}</span></button>}</nav>
        <button type="button" className="menu-signout" onClick={leaveWorkspace}><LogOut size={17} /> {browserWorkspace ? t("Return to sign in") : t("Sign out")}</button>
      </aside>
    </div>}
    <main id="main-content" className="main-content" tabIndex={-1}>{browserWorkspace && <div className="browser-workspace-note"><span>{t("Guest workspace. Your saved history stays in this browser.")}</span><button className="text-link" type="button" onClick={() => navigate('settings')}>{t("Storage & backup")}</button></div>}<div key={page} className="page-content">{view}</div></main>
    <nav className="bottom-nav" aria-label={t("Mobile navigation")}>{mainNavigation.map(([key, label, Icon]) => <button key={key} type="button" aria-current={isCurrent(key) ? 'page' : undefined} className={`${isCurrent(key) ? 'active' : ''} ${key === 'scan' ? 'mobile-scan' : ''}`} onClick={() => navigate(key)}><Icon size={21} /><span>{t(label)}</span></button>)}</nav>
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{navigationAnnouncement && t('{page} opened.', { page: t(navigationAnnouncement) })}</div>
    {introOpen && <Introduction onClose={closeIntroduction} />}
    {notice && <div className={`toast toast-${notice.type}`} role="status">{t(notice.message)}<button type="button" onClick={() => setNotice(null)} aria-label={t("Dismiss message")}><X size={16} /></button></div>}
  </div>;
}
