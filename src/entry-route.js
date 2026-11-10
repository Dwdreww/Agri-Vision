// Public entry choices never grant account access; the workspace keeps its auth checks.
export function entrySurface(search, guestSession) {
  const query = new URLSearchParams(search);
  if (query.get('welcome') === '1') return 'welcome';
  if (query.get('guest') === '0') return 'workspace';
  return guestSession ? 'workspace' : 'welcome';
}

export function requestedWorkspaceView(search) {
  const view = new URLSearchParams(search).get('view');
  return ['dashboard', 'records', 'care', 'scan', 'farms', 'area', 'settings', 'guide', 'help'].includes(view) ? view : 'dashboard';
}

// Page links preserve the deployment path and guest/account entry. Research
// access is never inferred from a URL; its existing account checks still apply.
export function workspacePageHref(href, view, plotId = '') {
  const address = new URL(href);
  const destination = requestedWorkspaceView(new URLSearchParams({ view }).toString());
  address.searchParams.delete('welcome');
  address.searchParams.delete('entry');
  if (destination === 'dashboard') address.searchParams.delete('view');
  else address.searchParams.set('view', destination);
  if (plotId) address.searchParams.set('plot', plotId);
  else address.searchParams.delete('plot');
  address.hash = '';
  return address.href;
}

export function requestedEntry(search) {
  return new URLSearchParams(search).get('entry') === 'new' ? 'new' : '';
}

export function workspaceHref(href, { guest = true, entry = '', view = '' } = {}) {
  const address = new URL(href);
  address.searchParams.delete('welcome');
  address.searchParams.delete('entry');
  address.searchParams.delete('view');
  address.searchParams.set('guest', guest ? '1' : '0');
  if (entry === 'new') address.searchParams.set('entry', 'new');
  if (['guide', 'help'].includes(view)) address.searchParams.set('view', view);
  address.hash = '';
  return address.href;
}
