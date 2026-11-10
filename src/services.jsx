import { createContext, useContext, useEffect, useState } from 'react';
import { browserWorkspace, workspaceMode } from './firebase';

const unavailable = { checking: false, scanner: false, classification: false, photos: false, sharing: false, deletion: false, recommendations: false, local: false, demo: workspaceMode === 'demo' };
const browserServices = { ...unavailable, browser: true, photos: true, deletion: true, retry: () => {} };
const ServicesContext = createContext(unavailable);

export function WorkspaceServices({ children }) {
  const [services, setServices] = useState(browserWorkspace ? browserServices : { ...unavailable, checking: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (browserWorkspace) return undefined;
    let active = true;
    let nextCheck;
    const controller = new AbortController();
    async function check() {
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const [scanner, workspace] = await Promise.all([
          fetch('/api/health', { signal: controller.signal }).then(response => response.ok ? response.json() : null).catch(() => null),
          ['local', 'cloud'].includes(workspaceMode) ? fetch('/api/workspace/health', { signal: controller.signal }).then(response => response.ok ? response.json() : null).catch(() => null) : null
        ]);
        if (active) setServices({ checking: false, scanner: scanner?.scanner_ready === true,
          classification: scanner?.classification_ready === true,
          photos: workspaceMode === 'firebase' || workspace?.photos === true,
          sharing: workspaceMode === 'firebase' || workspace?.sharing === true,
          deletion: workspaceMode === 'firebase' || workspace?.deletion === true,
          recommendations: ['local', 'cloud'].includes(workspaceMode) && workspace?.recommendations === true,
          local: workspaceMode === 'local', demo: workspaceMode === 'demo' });
        if (active) nextCheck = setTimeout(() => setAttempt(value => value + 1),
          scanner?.scanner_ready === true && (!['local', 'cloud'].includes(workspaceMode) || workspace?.success === true) ? 30000 : 5000);
      } finally { clearTimeout(timeout); }
    }
    check();
    return () => { active = false; controller.abort(); clearTimeout(nextCheck); };
  }, [attempt]);
  return <ServicesContext.Provider value={{ ...services, retry: () => {
    setServices(current => ({ ...current, checking: true }));
    setAttempt(value => value + 1);
  } }}>{children}</ServicesContext.Provider>;
}

export function useWorkspaceServices() { return useContext(ServicesContext); }
