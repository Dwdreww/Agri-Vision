import { t } from './i18n.js';
import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowRight, BookOpen, ChevronRight, FlaskConical, HelpCircle, House, ListChecks, LogOut, MapPin, Menu, Moon, PanelsTopLeft, ScanLine, Settings, Sprout, Sun, X } from 'lucide-react';
import { auth, db, firebaseConfigured, browserWorkspace } from './firebase';
import { BROWSER_UID } from './browser-store.js';
import { enterGuestSession, leaveGuestSession } from './guest-session.js';
import BrowserSettingsView from './BrowserSettings.jsx';
import { watchAccount } from './data';
import { Brand, LoadingScreen, NetworkBanner } from './components';
import { FarmsView, PlotView, ResearchView, SettingsView as AccountSettingsView } from './Views';
import ScanView from './Scan';
import JournalView from './Journal';
import HomeView from './Home.jsx';
import { defaultActivityFilters } from './activity';
import HealthGuideView from './HealthGuide';
import HowToUseView, { Introduction } from './HowToUse';
import { useDialog } from './use-dialog';
import { readableError } from './utils';
import { useWorkspaceServices } from './services';
import { retryAuthConnection } from './auth-retry';
import { LanguagePicker, useLanguage } from './Language.jsx';
import { requestedWorkspaceView, requestedEntry, workspacePageHref } from './entry-route.js';
import { useAccountAppearance } from './account-preferences.jsx';

const SettingsView = browserWorkspace ? BrowserSettingsView : AccountSettingsView;
const emptyData = { profile: null, farms: [], plots: [], scans: [], observations: [], tasks: [], ready: false };
const mainNavigation = [
  ['dashboard', 'Home', House],
  ['scan', 'Photo check', ScanLine],
  ['records', 'Records', PanelsTopLeft],
];
const pageLabel = page => ({care:'Records',farms:'Growing areas',area:'Growing area details',guide:'Health guide',help:'Help center',settings:'Settings',research:'Research'})[page] || mainNavigation.find(item => item[0] === page)?.[1] || 'Home';

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
    <div className="auth-visual"><Brand /><div className="auth-visual-copy"><h1>{t("Good care starts with a closer look.")}</h1><p>{t("Keep your pineapple photos, field notes, and next steps together.")}</p><ul className="auth-record-types"><li><strong>{t("Photographs")}</strong><span>{t("What the camera recorded.")}</span></li><li><strong>{t("Field notes")}</strong><span>{t("What you observed.")}</span></li><li><strong>{t("Care")}</strong><span>{t("What happens next.")}</span></li></ul></div><div className="auth-visual-bottom"><span>{t("Your next field visit, made simpler.")}</span><ScanLine size={24} /></div></div>
    <main className="auth-main"><div className="auth-card"><a className="auth-home-link" href="?welcome=1">{t("Back to AgriVision")}</a><LanguagePicker /><div className="auth-mobile-brand"><Brand /></div><h2>{mode === 'register' ? t("Create your account") : mode === 'reset' ? t("Reset your password") : t("Sign in to your workspace")}</h2><p>{mode === 'register' ? t("Start a private space for your farms and pineapple growing areas.") : mode === 'reset' ? t("We’ll email you a link to set a new password.") : t("Sign in and pick up where you left off.")}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label className="field"><span>{t("Your name")}</span><input autoFocus required maxLength={80} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder={t("How should we greet you?")} /></label>}
        <label className="field"><span>{t("Email address")}</span><input autoFocus={mode !== 'register'} required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={t("Enter your email address")} /></label>
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
  const { language } = useLanguage();
  const services = useWorkspaceServices();
  const [user, setUser] = useState(browserWorkspace ? { uid: BROWSER_UID, displayName: 'Grower' } : undefined);
  const [data, setData] = useState(emptyData);
  const [dataError, setDataError] = useState('');
  const [page, setPage] = useState(() => requestedEntry(window.location.search) === 'new' ? 'records' : requestedWorkspaceView(window.location.search));
  const [incomingPhoto, setIncomingPhoto] = useState(null);
  const [plotId, setPlotId] = useState(() => new URLSearchParams(window.location.search).get('plot') || '');
  const [journalFilters,setJournalFilters]=useState(() => ({...defaultActivityFilters, type: requestedWorkspaceView(window.location.search) === 'care' ? 'task' : 'scan', plotId: new URLSearchParams(window.location.search).get('plot') || ''}));
  const [viewAction, setViewAction] = useState(() => requestedEntry(window.location.search));
  const [online, setOnline] = useState(browserWorkspace || navigator.onLine);
  const [researcher, setResearcher] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const menuDialog = useDialog(menuOpen, () => setMenuOpen(false));
  const [themePreference, setThemePreference] = useState(() => { try { return localStorage.getItem('agriVisionTheme') || 'system'; } catch { return 'system'; } });
  const [deviceDark, setDeviceDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const changeTheme = useAccountAppearance(user?.uid, data.profile, themePreference, setThemePreference, message => setNotice({message,type:'error'}));

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('entry')) return;
    const address = new URL(window.location.href);
    address.searchParams.delete('entry');
    window.history.replaceState(null, '', address);
  }, []);

  useEffect(() => {
    const restorePage = () => {
      const nextPage = requestedWorkspaceView(window.location.search);
      const nextPlot = new URLSearchParams(window.location.search).get('plot') || '';
      setPage(nextPage);
      setPlotId(nextPlot);
      setJournalFilters({ ...defaultActivityFilters, type: nextPage === 'care' ? 'task' : 'scan', plotId: nextPlot });
      setViewAction('');
      setMenuOpen(false);
      setNavigationAnnouncement(pageLabel(nextPage));
      requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
    };
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  useEffect(() => {
    document.title = `${t(pageLabel(page))} | AgriVision`;
  }, [page, language, services.browser]);

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
    const nextPage = ['plot', 'activity'].includes(destination) ? action === 'task' || action === 'tasks' ? 'care' : 'records' : destination;
    const nextPlot = selectedPlotId || (nextPage === 'scan' ? journalFilters.plotId : '');
    if (nextPage !== 'research') {
      const href = workspacePageHref(window.location.href, nextPage, nextPlot);
      if (href !== window.location.href) window.history.pushState(null, '', href);
    }
    setPage(nextPage);
    if (['records', 'care'].includes(nextPage)) {
      setJournalFilters({ ...defaultActivityFilters, type: nextPage === 'care' ? 'task' : action === 'category:observation' || action.startsWith('open:observation:') ? 'observation' : 'scan',
        plotId: nextPlot, farmId: data.plots.find(plot => plot.id === nextPlot)?.farmId || (action.startsWith('category:') ? journalFilters.farmId : '') });
    }
    setViewAction(action);
    setPlotId(nextPlot);
    setMenuOpen(false);
    setNavigationAnnouncement(pageLabel(nextPage));
    requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  function followNavigation(event, destination) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(destination);
  }

  async function leaveWorkspace() {
    setMenuOpen(false);
    if (browserWorkspace) {
      let storage;
      try { storage = window.sessionStorage; } catch { /* Clear the URL fallback too. */ }
      const destination = new URL(leaveGuestSession({ storage, href: window.location.href }));
      destination.searchParams.set('guest', '0');
      destination.searchParams.delete('welcome');
      window.location.assign(destination.href);
      return;
    }
    try { await signOut(auth); }
    catch (issue) { notify(readableError(issue), 'error'); }
  }

  if (!browserWorkspace && !firebaseConfigured) return <div className="setup-page"><Brand /><div className="panel"><h1>{t("Connect AGRI-VISION to Firebase")}</h1><p>{t("Set the Firebase web values in your local environment or Vercel project, then reload this page.")}</p><p>{t("See ")}<code>{t(".env.example")}</code>{t(" and the deployment guide in the project.")}</p></div></div>;
  if (user === undefined) return <LoadingScreen text={t("Opening AGRI-VISION…")} />;
  if (!user) return <><NetworkBanner online={online} /><AuthPage onNotify={notify} />{notice && <div className={`toast toast-${notice.type}`} role="status">{t(notice.message)}<button type="button" onClick={() => setNotice(null)} aria-label={t("Dismiss message")}><X size={16} /></button></div>}</>;

  const navigation = mainNavigation;
  const view = dataError ? <div className="view"><div className="panel error-panel"><h1>{t('Could not load your workspace')}</h1><p>{t(dataError)}</p><button className="button button-soft" onClick={() => window.location.reload()}>{t('Try again')}</button></div></div>
    : !data.ready ? <LoadingScreen />
    : page === 'dashboard' ? <HomeView onChoosePhoto={file => { setIncomingPhoto(file); navigate('scan'); }} user={user} data={data} onNavigate={navigate} onNotify={notify} online={online}/>
    : page === 'farms' ? <FarmsView initialAction={viewAction} uid={user.uid} data={data} onNavigate={navigate} onNotify={notify} online={online}/>
    : page === 'area' ? <PlotView initialAction={viewAction} uid={user.uid} data={data} plotId={plotId} onNavigate={navigate} onNotify={notify} online={online}/>
    : page === 'scan' ? <ScanView initialFile={incomingPhoto} onInitialFileConsumed={()=>setIncomingPhoto(null)} uid={user.uid} user={user} plots={data.plots} farms={data.farms} initialPlotId={plotId} onNavigate={navigate} onNotify={notify} online={online}/>
    : page === 'guide' ? <HealthGuideView onNavigate={navigate}/>
    : page === 'help' ? <HowToUseView onNavigate={navigate} onReplay={() => setIntroOpen(true)}/>
    : page === 'research' ? <ResearchView researcher={researcher} onNotify={notify}/>
    : page === 'settings' ? <SettingsView user={user} data={data} themePreference={themePreference} setThemePreference={changeTheme} researcher={researcher} refreshResearcher={refreshResearcher} onNotify={notify} online={online}/>
    : <JournalView key={page} mode={page === 'care' ? 'care' : 'records'} initialAction={viewAction} user={user} data={data} filters={journalFilters} onFiltersChange={setJournalFilters} onNavigate={navigate} onChoosePhoto={(file, areaId) => { setIncomingPhoto(file); navigate('scan', areaId); }} onNotify={notify} online={online}/>;

  const isCurrent = key => page === key || (['area','care'].includes(page) && key === 'records');
  const initials = (data.profile?.displayName || user.email || 'A').slice(0, 1).toUpperCase();

  const pageName = page === 'settings' ? 'Settings' : page === 'guide' ? 'Health guide' : page === 'help' ? 'Help center' : page === 'area' || page === 'farms' ? 'Growing areas' : page === 'care' ? 'Records' : navigation.find(item => item[0] === page)?.[1] || 'Home';
  const referenceNavigation = [['guide', 'Health guide', BookOpen]];
  const navigationLink = ([key, label, Icon], mobile = false) => <a key={key} href={workspacePageHref(window.location.href, key)} aria-current={isCurrent(key) ? 'page' : undefined} className={`${isCurrent(key) ? 'is-active' : ''} ${key === 'scan' ? 'scan-navigation' : ''}`} onClick={event => followNavigation(event, key)}><Icon size={mobile ? 21 : 19} strokeWidth={1.7} aria-hidden="true"/><span>{t(label)}</span>{!mobile && isCurrent(key) && <ChevronRight size={15} aria-hidden="true"/>}</a>;

  return <div className="app-shell av-app" data-page={page}>
    <a className="skip-link" href="#main-content">{t('Skip to content')}</a>
    <aside className="av-sidebar" aria-label={t('Workspace navigation')}>
      <button className="brand-home" type="button" onClick={() => navigate('dashboard')} aria-label={t('AgriVision overview')}><Brand/></button>
      <span className="nav-group-label">{t('WORKSPACE')}</span>
      <nav className="av-main-nav" aria-label={t('Main navigation')}>{navigation.map(item => navigationLink(item))}</nav>
      <nav className="av-reference-nav" aria-label={t('Help and reference')}>{referenceNavigation.map(item => navigationLink(item))}{researcher && services.sharing && navigationLink(['research','Research',FlaskConical])}</nav>
      <div className="av-sidebar-bottom"><a className={page === 'farms' ? 'is-active' : ''} href={workspacePageHref(window.location.href,'farms')} onClick={event=>followNavigation(event,'farms')}><MapPin size={19}/><span>{t('Growing areas')}</span></a><a href={workspacePageHref(window.location.href,'settings')} className={page === 'settings' ? 'is-active' : ''} onClick={event=>followNavigation(event,'settings')}><Settings size={19}/><span>{t('Settings')}</span></a><button className="av-profile" onClick={()=>setMenuOpen(true)} aria-label={t('Open account menu')}><span className="account-avatar">{initials}</span><span><strong>{data.profile?.displayName || user.displayName || t('Your account')}</strong><small>{t(services.browser ? 'Guest workspace' : 'Personal workspace')}</small></span><ChevronRight size={16}/></button></div>
    </aside>
    <div className="av-stage">
      <NetworkBanner online={online}/>
      <header className="av-topbar"><div className="av-breadcrumb"><span>{t('Workspace')}</span><ChevronRight size={14}/><strong>{t(pageName)}</strong></div><button className="brand-home av-mobile-brand" onClick={()=>navigate('dashboard')} aria-label={t('AgriVision overview')}><Brand compact/></button><div className="av-topbar-tools"><LanguagePicker/><button className="icon-button" onClick={()=>changeTheme(themePreference === 'dark' || (themePreference === 'system' && deviceDark) ? 'light' : 'dark')} aria-label={t('Switch color theme')}>{themePreference === 'dark' || (themePreference === 'system' && deviceDark) ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-button av-mobile-menu" onClick={()=>setMenuOpen(true)} aria-label={t('Open workspace menu')} aria-expanded={menuOpen} aria-controls="workspace-navigation"><Menu size={21}/></button></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}><div key={page} className="page-content">{view}</div><footer className="workspace-footer"><span>AgriVision</span><span>{t('One field visit at a time.')}</span></footer></main>
    </div>
    <nav className="av-mobile-nav" aria-label={t('Mobile navigation')}>{navigation.map(item=>navigationLink(item,true))}</nav>
    {menuOpen && <div className="menu-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setMenuOpen(false);}}><aside ref={menuDialog} id="workspace-navigation" className="workspace-menu" role="dialog" aria-modal="true" aria-label={t('Workspace menu')} tabIndex={-1}><header><Brand/><button className="icon-button" onClick={()=>setMenuOpen(false)} aria-label={t('Close menu')}><X size={20}/></button></header><div className="menu-account"><span className="account-avatar">{initials}</span><div><strong>{data.profile?.displayName || user.displayName || t('Your account')}</strong><small>{t(services.browser ? 'Guest workspace' : 'Personal workspace')}</small></div></div><nav className="av-main-nav" aria-label={t('Workspace pages')}>{[...navigation,...referenceNavigation,['farms','Growing areas',MapPin],['help','Help center',HelpCircle],['settings','Settings',Settings]].map(item=>navigationLink(item))}</nav><LanguagePicker/><a className="text-link" href="?welcome=1">{t('About AgriVision')}<ArrowRight size={16}/></a><button className="menu-signout" onClick={leaveWorkspace}><LogOut size={17}/>{t(services.browser ? 'Return to sign in' : 'Sign out')}</button></aside></div>}
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{navigationAnnouncement && t('{page} opened.',{page:t(navigationAnnouncement)})}</div>
    {introOpen && <Introduction onClose={closeIntroduction}/>}
    {notice && <div className={`toast toast-${notice.type}`} role="status">{t(notice.message)}<button onClick={()=>setNotice(null)} aria-label={t('Dismiss message')}><X size={16}/></button></div>}
  </div>;
}
