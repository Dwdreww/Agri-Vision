import { useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Activity, BookOpen, FlaskConical, HelpCircle, LayoutDashboard, LogOut, Menu, Moon, ScanLine, Settings, Sprout, Sun, X } from 'lucide-react';
import { auth, db, firebaseConfigured } from './firebase';
import { watchAccount } from './data';
import { Brand, LoadingScreen, NetworkBanner } from './components';
import { ActivityView, DashboardView, FarmsView, PlotView, ResearchView, SettingsView } from './Views';
import ScanView from './Scan';
import HealthGuideView from './HealthGuide';
import HowToUseView, { hasSeenIntroduction, Introduction, rememberIntroduction } from './HowToUse';
import { useDialog } from './use-dialog';
import { readableError } from './utils';
import { useWorkspaceServices } from './services';
import { retryAuthConnection } from './auth-retry';

const emptyData = { profile: null, farms: [], plots: [], scans: [], observations: [], tasks: [], ready: false };
const mainNavigation = [
  ['dashboard', 'Overview', LayoutDashboard],
  ['farms', 'Farms', Sprout],
  ['scan', 'Scan', ScanLine],
  ['activity', 'Activity', Activity],
  ['settings', 'Settings', Settings]
];

function AuthPage({ onNotify }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    <div className="auth-visual"><Brand /><div className="auth-visual-copy"><span className="eyebrow">A CLEARER VIEW OF YOUR CROP</span><h1>Small checks.<br /><span>Better care.</span></h1><p>Keep your pineapple photos, observations, and next steps together.</p><div className="auth-ribbon" aria-hidden="true"><span>01<small>Photo</small></span><i /><span>02<small>Scan</small></span><i /><span>03<small>Care</small></span></div></div><div className="auth-visual-bottom"><span>Observe. Understand. Care.</span><ScanLine size={24} /></div></div>
    <main className="auth-main"><div className="auth-card"><div className="auth-mobile-brand"><Brand /></div><span className="eyebrow">YOUR GROWING SPACE</span><h2>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back.'}</h2><p>{mode === 'register' ? 'Start a private space for your farms and pineapple plots.' : mode === 'reset' ? 'We’ll email you a link to set a new password.' : 'Sign in and pick up where you left off.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label className="field"><span>Your name</span><input autoFocus required maxLength={80} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="How should we greet you?" /></label>}
        <label className="field"><span>Email address</span><input autoFocus={mode !== 'register'} required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        {mode !== 'reset' && <label className="field"><span>Password</span><input required minLength={mode === 'register' ? 6 : undefined} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /></label>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        <button className="button button-primary button-large auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
      </form>
      <div className="auth-links">{mode === 'login' ? <><button type="button" onClick={() => { setError(''); setMode('reset'); }}>Forgot password?</button><span>New here? <button type="button" onClick={() => { setError(''); setMode('register'); }}>Create an account</button></span></> : <button type="button" onClick={() => { setError(''); setMode('login'); }}>Back to sign in</button>}</div>
      <p className="auth-footnote">Your farm records and photos are private to your account.</p>
    </div></main>
  </div>;
}

export default function App() {
  const services = useWorkspaceServices();
  const [user, setUser] = useState(undefined);
  const [data, setData] = useState(emptyData);
  const [dataError, setDataError] = useState('');
  const [page, setPage] = useState('scan');
  const [plotId, setPlotId] = useState('');
  const [viewAction, setViewAction] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [researcher, setResearcher] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const introChecked = useRef(new Set());
  const menuDialog = useDialog(menuOpen, () => setMenuOpen(false));
  const [themePreference, setThemePreference] = useState(() => { try { return localStorage.getItem('agriVisionTheme') || 'system'; } catch { return 'system'; } });
  const [deviceDark, setDeviceDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

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
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);
  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, account => { setUser(account); if (!account) { setData(emptyData); setPage('scan'); setResearcher(false); setMenuOpen(false); setIntroOpen(false); } });
  }, []);
  useEffect(() => {
    if (!user || !db) return undefined;
    let current = true;
    setData(emptyData);
    setDataError('');
    const unsubscribe = watchAccount(user.uid, next => { if (current) { setData(next); setDataError(''); } }, issue => { if (current) setDataError(readableError(issue)); });
    getDoc(doc(db, 'users', user.uid)).then(snapshot => {
      if (!snapshot.exists() && current) return setDoc(doc(db, 'users', user.uid), { displayName: user.displayName || user.email?.split('@')[0] || 'Grower', email: user.email, createdAt: serverTimestamp(), historyImportedAt: null });
    }).catch(issue => { if (current) setDataError(readableError(issue)); });
    user.getIdTokenResult().then(token => { if (current) setResearcher(token.claims.researcher === true); }).catch(() => {});
    return () => { current = false; unsubscribe(); };
  }, [user]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !data.ready || introChecked.current.has(uid)) return;
    introChecked.current.add(uid);
    if (!hasSeenIntroduction(uid)) setIntroOpen(true);
  }, [user?.uid, data.ready]);

  function closeIntroduction() {
    if (user?.uid) rememberIntroduction(user.uid);
    setIntroOpen(false);
  }

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
    const label = destination === 'plot' ? 'Plot details' : destination === 'guide' ? 'Health guide' : destination === 'help' ? 'How to use' : destination === 'research' ? 'Research' : mainNavigation.find(item => item[0] === destination)?.[1] || 'Overview';
    setNavigationAnnouncement(`${label} opened.`);
    requestAnimationFrame(() => {
      const entryForm = action === 'observation' ? document.querySelector('#plot-observation-form input') : null;
      (entryForm || document.getElementById('main-content'))?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  async function leaveWorkspace() {
    setMenuOpen(false);
    try { await signOut(auth); }
    catch (issue) { notify(readableError(issue), 'error'); }
  }

  if (!firebaseConfigured) return <div className="setup-page"><Brand /><div className="panel"><span className="eyebrow">SETUP NEEDED</span><h1>Connect AGRI-VISION to Firebase</h1><p>Set the Firebase web values in your local environment or Vercel project, then reload this page.</p><p>See <code>.env.example</code> and the deployment guide in the project.</p></div></div>;
  if (user === undefined) return <LoadingScreen text="Opening AGRI-VISION…" />;
  if (!user) return <><NetworkBanner online={online} /><AuthPage onNotify={notify} />{notice && <div className={`toast toast-${notice.type}`} role="status">{notice.message}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={16} /></button></div>}</>;

  const navigation = mainNavigation;
  const view = dataError ? <div className="view"><div className="panel error-panel"><h1>Could not load your workspace</h1><p>{dataError}</p><button className="button button-soft" onClick={() => window.location.reload()}>Try again</button></div></div> : !data.ready ? <LoadingScreen /> : page === 'farms' ? <FarmsView initialAction={viewAction} uid={user.uid} data={data} onNavigate={navigate} onNotify={notify} online={online} /> : page === 'plot' ? <PlotView initialAction={viewAction} uid={user.uid} data={data} plotId={plotId} onNavigate={navigate} onNotify={notify} online={online} /> : page === 'scan' ? <ScanView uid={user.uid} user={user} plots={data.plots} farms={data.farms} initialPlotId={plotId} onNavigate={navigate} onNotify={notify} online={online} /> : page === 'activity' ? <ActivityView initialAction={viewAction} uid={user.uid} data={data} onNotify={notify} /> : page === 'guide' ? <HealthGuideView onNavigate={navigate} /> : page === 'help' ? <HowToUseView onNavigate={navigate} onReplay={() => setIntroOpen(true)} /> : page === 'research' ? <ResearchView researcher={researcher} onNotify={notify} /> : page === 'settings' ? <SettingsView user={user} data={data} themePreference={themePreference} setThemePreference={setThemePreference} researcher={researcher} refreshResearcher={refreshResearcher} onNotify={notify} online={online} /> : <DashboardView user={user} data={data} onNavigate={navigate} onNotify={notify} />;

  const isCurrent = key => page === key || (page === 'plot' && key === 'farms');
  const initials = (data.profile?.displayName || user.email || 'A').slice(0, 1).toUpperCase();

  return <div className="app-shell" data-page={page}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <NetworkBanner online={online} />
    <header className="workspace-header">
      <button className="brand-home" type="button" onClick={() => navigate('dashboard')} aria-label="AGRI-VISION overview"><Brand /></button>
      <nav className="desktop-navigation" aria-label="Main navigation">{navigation.map(([key, label]) => <button key={key} type="button" aria-current={isCurrent(key) ? 'page' : undefined} className={isCurrent(key) ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav>
      <div className="flex items-center gap-2">
        <span className={`scanner-indicator ${services.scanner ? 'scanner-ready' : ''}`}><span />{services.checking ? 'Checking scanner' : services.scanner ? 'Scanner ready' : 'Scanner unavailable'}</span>
        <button className="icon-button theme-toggle" type="button" onClick={() => setThemePreference(themePreference === 'dark' || (themePreference === 'system' && deviceDark) ? 'light' : 'dark')} aria-label="Switch color theme">{themePreference === 'dark' || (themePreference === 'system' && deviceDark) ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button className="account-menu-trigger" type="button" onClick={() => setMenuOpen(true)} aria-label="Open workspace menu" aria-expanded={menuOpen} aria-controls="workspace-navigation"><span className="account-avatar">{initials}</span><Menu size={17} /></button>
      </div>
    </header>
    {menuOpen && <div className="menu-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
      <aside ref={menuDialog} id="workspace-navigation" role="dialog" aria-modal="true" aria-label="Workspace menu" tabIndex={-1} className="workspace-menu">
        <div className="flex items-center justify-between gap-4"><Brand /><button className="icon-button" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
        <div className="menu-account"><span className="account-avatar">{initials}</span><div><strong>{data.profile?.displayName || 'Your account'}</strong><small>Private workspace</small></div></div>
        <nav className="menu-main-navigation" aria-label="Workspace pages">{navigation.map(([key, label, Icon]) => <button key={key} type="button" aria-current={isCurrent(key) ? 'page' : undefined} className={`nav-link ${isCurrent(key) ? 'active' : ''}`} onClick={() => navigate(key)}><Icon size={19} /><span>{label}</span></button>)}</nav>
        <span className="eyebrow">REFERENCE</span>
        <nav aria-label="Reference navigation"><button className="nav-link" aria-current={page === 'help' ? 'page' : undefined} type="button" onClick={() => navigate('help')}><HelpCircle size={19} /><span>How to use</span></button><button className="nav-link" aria-current={page === 'guide' ? 'page' : undefined} type="button" onClick={() => navigate('guide')}><BookOpen size={19} /><span>Health guide</span></button>{researcher && services.sharing && <button className="nav-link" aria-current={page === 'research' ? 'page' : undefined} type="button" onClick={() => navigate('research')}><FlaskConical size={19} /><span>Research</span></button>}</nav>
        <button type="button" className="menu-signout" onClick={leaveWorkspace}><LogOut size={17} /> Sign out</button>
      </aside>
    </div>}
    <main id="main-content" className="main-content" tabIndex={-1}><div key={page} className="page-content">{view}</div></main>
    <nav className="bottom-nav" aria-label="Mobile navigation">{mainNavigation.map(([key, label, Icon]) => <button key={key} type="button" aria-current={isCurrent(key) ? 'page' : undefined} className={`${isCurrent(key) ? 'active' : ''} ${key === 'scan' ? 'mobile-scan' : ''}`} onClick={() => navigate(key)}><Icon size={21} /><span>{label}</span></button>)}</nav>
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{navigationAnnouncement}</div>
    {introOpen && <Introduction onClose={closeIntroduction} />}
    {notice && <div className={`toast toast-${notice.type}`} role="status">{notice.message}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={16} /></button></div>}
  </div>;
}
