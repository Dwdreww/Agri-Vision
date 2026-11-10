import test from 'node:test';
import assert from 'node:assert/strict';
import { entrySurface, requestedWorkspaceView, requestedEntry, workspaceHref, workspacePageHref } from '../src/entry-route.js';

test('new visitors see welcome while returning guests keep their workspace', () => {
  assert.equal(entrySurface('', false), 'welcome');
  assert.equal(entrySurface('', true), 'workspace');
  assert.equal(entrySurface('?guest=1', true), 'workspace');
});
test('explicit sign-in wins over a stale guest session and welcome can be revisited', () => {
  assert.equal(entrySurface('?guest=0', true), 'workspace');
  assert.equal(entrySurface('?welcome=1', true), 'welcome');
  assert.equal(entrySurface('?welcome=true', false), 'welcome');
});
test('welcome entry removes public state and stale fragments without changing origin or deployment path', () => {
  const address = new URL(workspaceHref('https://example.com/pilot/?welcome=1&guest=0#how-it-works'));
  assert.equal(address.origin, 'https://example.com');
  assert.equal(address.pathname, '/pilot/');
  assert.equal(address.search, '?guest=1');
  assert.equal(address.hash, '');
});
test('sign-in and direct creation links remain explicit and mutually exclusive', () => {
  assert.equal(new URL(workspaceHref('https://example.com/?guest=1', { guest: false })).search, '?guest=0');
  const created = new URL(workspaceHref('https://example.com/?welcome=1', { entry: 'new' }));
  assert.equal(requestedEntry(created.search), 'new');
  assert.equal(created.searchParams.has('welcome'), false);
  assert.equal(requestedEntry('?entry=observation'), '');
});
test('workspace deep links expose ordinary pages and do not accept privileged view names', () => {
  assert.equal(requestedWorkspaceView('?view=guide'), 'guide');
  assert.equal(requestedWorkspaceView('?view=help'), 'help');
  assert.equal(requestedWorkspaceView('?view=research'), 'dashboard');
  assert.equal(requestedWorkspaceView(new URL(workspaceHref('https://example.com/', { view:'guide' })).search), 'guide');
  for (const view of ['dashboard', 'records', 'care', 'scan', 'farms', 'area', 'settings']) {
    assert.equal(requestedWorkspaceView('?view=' + view), view);
  }
  assert.equal(requestedWorkspaceView('?view=admin'), 'dashboard');
});

test('page links keep account/guest entry and deployment path while dropping stale page state', () => {
  const scan = new URL(workspacePageHref('https://example.com/pilot/?guest=0&welcome=1&entry=new#old', 'scan', 'east-field'));
  assert.equal(scan.pathname, '/pilot/');
  assert.equal(scan.searchParams.get('guest'), '0');
  assert.equal(scan.searchParams.get('view'), 'scan');
  assert.equal(scan.searchParams.get('plot'), 'east-field');
  assert.equal(scan.searchParams.has('welcome'), false);
  assert.equal(scan.searchParams.has('entry'), false);
  assert.equal(scan.hash, '');
  const records = new URL(workspacePageHref(scan.href, 'dashboard'));
  assert.equal(records.search, '?guest=0');
  const privileged = new URL(workspacePageHref(scan.href, 'research'));
  assert.equal(requestedWorkspaceView(privileged.search), 'dashboard');
});
