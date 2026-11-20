/**
 * The Updates card — what the reader sees at each step of the update.
 *
 * The network and the native installer are faked here; what is pinned
 * is the card's own state machine: checking, up-to-date, available with
 * its notes, downloading with progress, ready to install, and the
 * permission the system asks for before an install from outside the
 * store.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      bg: '#FFFFFF',
      card: '#F5F5F5',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#01543F',
      accentBg: '#E0EAE8',
      accentSolid: '#01543F',
      onAccent: '#FFFFFF',
      controlBg: '#EEEEEE',
      overlay: 'rgba(0,0,0,0.6)',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (k: string, d?: unknown, opts?: Record<string, unknown>) => {
      const fallback = typeof d === 'string' ? d : k;
      if (!opts) return fallback;
      return Object.entries(opts).reduce(
        (s, [key, value]) => s.replace(`{{${key}}}`, String(value)),
        fallback,
      );
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: { Consumer: ({ children }: never) => children },
}));

const mockCheck: {
  cached: unknown;
  result: unknown;
  fn: jest.Mock;
} = {
  cached: null,
  result: null,
  fn: jest.fn(),
};
const mockDownload = { fn: jest.fn() };
const mockInstall = { fn: jest.fn() };
const mockOpenSettings = jest.fn();

jest.mock('../src/updates/appUpdate', () => ({
  checkForUpdate: (...args: unknown[]) => mockCheck.fn(...args),
  downloadApk: (...args: unknown[]) => mockDownload.fn(...args),
  getCachedCheck: () => mockCheck.cached,
  installApk: (...args: unknown[]) => mockInstall.fn(...args),
  openInstallPermissionSettings: () => mockOpenSettings(),
  useAvailableUpdate: () => null,
}));

jest.mock('../src/appVersion', () => ({
  getInstalledAppVersionName: () => '1.0.2',
  getInstalledAppVersionLabel: () => '1.0.2',
}));

import { UpdatesCard } from '../src/screens/settings/UpdatesCard';
import type { UpdateCheckResult, ReleaseInfo } from '../src/updates/appUpdate';

const LATEST: ReleaseInfo = {
  version: '1.0.3',
  apkUrl: 'https://example.invalid/Salaty-v1.0.3.apk',
  notes: 'New in 1.0.3: updates from inside the app.',
};
const AVAILABLE: UpdateCheckResult = {
  status: 'available',
  installed: '1.0.2',
  latest: LATEST,
};
const UP_TO_DATE: UpdateCheckResult = {
  status: 'up-to-date',
  installed: '1.0.2',
  latestVersion: '1.0.2',
};

function textsOf(root: ReactTestRenderer): string[] {
  return root.root.findAllByType(Text).map(n => {
    const children = n.props.children as unknown;
    const parts = Array.isArray(children) ? children : [children];
    return parts.flat().join('');
  });
}

function press(root: ReactTestRenderer, label: string): void {
  const textOf = (t: ReactTestInstance): string => {
    const children = (t.props as { children?: unknown }).children;
    const parts = Array.isArray(children) ? children : [children];
    return parts.flat().join('');
  };
  // findAllByType(Pressable) misses the buttons under the RN preset
  // (a different Pressable identity), so match the card's own markers:
  // every action button carries accessibilityRole="button".
  const button = root.root
    .findAll(
      (n: { props?: { accessibilityRole?: string; onPress?: unknown } }) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.onPress === 'function',
    )
    .find(b => b.findAllByType(Text).some(t => textOf(t).includes(label)));
  expect(button).toBeDefined();
  act(() => {
    (button!.props.onPress as () => void)();
  });
}

async function flush(): Promise<void> {
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck.cached = null;
  mockCheck.result = null;
  mockCheck.fn.mockImplementation(async () => mockCheck.result);
  mockDownload.fn.mockResolvedValue('/mock/cache/updates/Salaty-v1.0.3.apk');
  mockInstall.fn.mockResolvedValue('started');
});

async function renderCard(): Promise<ReactTestRenderer> {
  let root: ReactTestRenderer;
  await act(async () => {
    root = create(<UpdatesCard />);
  });
  return root!;
}

describe('UpdatesCard', () => {
  it('shows the cached update without checking again, with its notes', async () => {
    mockCheck.cached = AVAILABLE;
    const root = await renderCard();
    await flush();
    expect(mockCheck.fn).not.toHaveBeenCalled();
    const texts = textsOf(root);
    expect(texts.some(t => t.includes('1.0.3'))).toBe(true);
    expect(texts).toContain('New in 1.0.3: updates from inside the app.');
    expect(texts.some(t => t.includes('Update'))).toBe(true);
  });

  it('checks on mount when nothing is cached', async () => {
    mockCheck.result = UP_TO_DATE;
    const root = await renderCard();
    await flush();
    expect(mockCheck.fn).toHaveBeenCalledTimes(1);
    expect(textsOf(root).some(t => t.includes('latest version'))).toBe(true);
  });

  it('a failed check offers a retry', async () => {
    mockCheck.result = {
      status: 'error',
      installed: '1.0.2',
      reason: 'offline',
    } as UpdateCheckResult;
    const root = await renderCard();
    await flush();
    expect(textsOf(root).some(t => t.includes('You’re offline'))).toBe(true);
    mockCheck.result = UP_TO_DATE;
    press(root, 'Try again');
    await flush();
    expect(mockCheck.fn).toHaveBeenCalledTimes(2);
    expect(textsOf(root).some(t => t.includes('latest version'))).toBe(true);
  });

  it('updates only when tapped: download, then install', async () => {
    mockCheck.cached = AVAILABLE;
    const root = await renderCard();
    await flush();
    expect(mockDownload.fn).not.toHaveBeenCalled();
    press(root, 'Update');
    await flush();
    expect(mockDownload.fn).toHaveBeenCalledTimes(1);
    expect(mockDownload.fn.mock.calls[0][0]).toBe(LATEST);
    expect(textsOf(root).some(t => t.includes('Install'))).toBe(true);
    press(root, 'Install');
    await flush();
    expect(mockInstall.fn).toHaveBeenCalledWith(
      '/mock/cache/updates/Salaty-v1.0.3.apk',
    );
    expect(textsOf(root).some(t => t.includes('Opening the installer'))).toBe(
      true,
    );
  });

  it('when the system withholds the install, it opens settings', async () => {
    mockCheck.cached = AVAILABLE;
    mockInstall.fn.mockResolvedValue('needs-permission');
    const root = await renderCard();
    await flush();
    press(root, 'Update');
    await flush();
    press(root, 'Install');
    await flush();
    expect(
      textsOf(root).some(t => t.includes('install apps from this source')),
    ).toBe(true);
    press(root, 'Open settings');
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
