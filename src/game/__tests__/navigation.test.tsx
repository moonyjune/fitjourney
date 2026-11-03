import { describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { act, create } from 'react-test-renderer';

// Records what app/(tabs)/_layout.tsx declares: every <Tabs.Screen> name with its options.
const mockScreens: { name: string; options: { title?: string; href?: unknown } }[] = [];
const mockRedirects: unknown[] = [];

jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => children;
  Tabs.Screen = (props: { name: string; options: { title?: string; href?: unknown } }) => {
    mockScreens.push({ name: props.name, options: props.options });
    return null;
  };
  return {
    Tabs,
    Redirect: (props: { href: unknown }) => {
      mockRedirects.push(props.href);
      return null;
    },
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })) } },
}));
jest.mock('../../notifications/schedule', () => ({
  requestNotificationPermissions: () => Promise.resolve(false),
  scheduleAllReminders: () => Promise.resolve(),
  cancelAllReminders: () => Promise.resolve(),
}));
jest.mock('../../store/usePlanStore', () => {
  const state = { plan: null, syncFromRemote: () => undefined };
  return { usePlanStore: (sel: (s: typeof state) => unknown) => sel(state) };
});

import TabsLayout from '../../../app/(tabs)/_layout';
import TodayClassicRedirect from '../../../app/today-classic';
import { useSettingsStore } from '../../store/useSettingsStore';

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'app');

function declared(role: 'client' | 'coach') {
  mockScreens.length = 0;
  useSettingsStore.setState({ role, clientSetupDone: true, remindersEnabled: false, coachCode: 'ABC123' } as never);
  act(() => {
    create(<TabsLayout />);
  });
  // A re-render (store updates from the layout's effects) declares the screens again: keep the last pass.
  const lastPass = mockScreens.slice(mockScreens.map((s) => s.name).lastIndexOf('index'));
  return lastPass.map((s) => ({ name: s.name, visible: s.options.href !== null, title: s.options.title }));
}

/** True when an expo-router path (`/x`, `/(tabs)/x`, `/meal/[slot]`) maps to a file under app/. */
function routeExists(route: string): boolean {
  // A template literal cut at `${…}` (e.g. `/meal/${slot}`) ends in '/': its folder must hold a dynamic route.
  if (route.length > 1 && route.endsWith('/')) {
    const dir = path.join(APP, ...route.split('/').filter(Boolean));
    return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith('['));
  }
  const clean = route.split('?')[0];
  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 0) return fs.existsSync(path.join(APP, '(tabs)', 'index.tsx'));
  const candidates = [path.join(APP, ...segments) + '.tsx', path.join(APP, ...segments, 'index.tsx')];
  // Group segments are optional in a URL: '/x' may live in app/(tabs)/x.tsx.
  if (!segments[0].startsWith('(')) candidates.push(path.join(APP, '(tabs)', ...segments) + '.tsx');
  return candidates.some((c) => fs.existsSync(c));
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('navigation (redesign GĐ0)', () => {
  it('declares only the five-slot tab set: Camp, Train, Journey, Profile (+ Coach tabs)', () => {
    const client = declared('client');
    expect(client.map((s) => s.name)).toEqual(['index', 'workout', 'map', 'profile', 'clients', 'coach-account']);
    expect(client.filter((s) => s.visible).map((s) => s.title)).toEqual(['Trại', 'Tập', 'Hành trình', 'Hồ sơ']);
  });

  it('shows only Clients and Account to a coach', () => {
    const coach = declared('coach');
    expect(coach.filter((s) => s.visible).map((s) => s.name)).toEqual(['clients', 'coach-account']);
  });

  it('keeps the former hidden tabs as stack routes and removes today-classic', () => {
    for (const name of ['weight', 'nutrition', 'history', 'plan', 'workout-classic']) {
      expect(fs.existsSync(path.join(APP, `${name}.tsx`))).toBe(true);
      expect(fs.existsSync(path.join(APP, '(tabs)', `${name}.tsx`))).toBe(false);
    }
    expect(fs.existsSync(path.join(APP, '(tabs)', 'today-classic.tsx'))).toBe(false);
  });

  it('redirects a bookmarked /today-classic to Camp', () => {
    mockRedirects.length = 0;
    act(() => {
      create(<TodayClassicRedirect />);
    });
    expect(mockRedirects).toEqual(['/']);
  });

  it('every literal route the app navigates to resolves to a screen file', () => {
    const pattern = /(?:push|replace|dismissTo|navigate)\(\s*[`'](\/[^'`$?]*)|pathname:\s*'(\/[^']*)'|href=["'{`]+(\/[^"'`}?]*)/g;
    const targets = new Set<string>();
    for (const file of [...sourceFiles(APP), ...sourceFiles(path.join(ROOT, 'src'))]) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(pattern)) targets.add(m[1] ?? m[2] ?? m[3]);
    }
    expect(targets.size).toBeGreaterThan(20);
    for (const name of ['/weight', '/nutrition', '/history', '/plan', '/workout-classic']) expect(targets).toContain(name);
    const missing = [...targets].filter((t) => !routeExists(t));
    expect(missing).toEqual([]);
  });
});
