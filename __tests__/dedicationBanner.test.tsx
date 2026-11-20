/**
 * The dedication — shown once, on a fresh install, and never again.
 *
 * The words are the owner's, exactly as he gave them; the test pins
 * them character for character, in Arabic, whatever the reader's
 * language. And the flag is what keeps "once" true: an update is not a
 * first install, so a phone that has run the app before is stamped as
 * seen without ever being shown the card.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    i18n: { language: 'fr' },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: { Consumer: ({ children }: never) => children },
}));

jest.mock('../src/responsive/breakpoints', () => ({
  useBreakpoint: () => 'compact',
}));

import {
  DEDICATION_SEEN_KEY,
  DEDICATION_SUBTITLE,
  DEDICATION_TITLE,
  DedicationBanner,
  markDedicationSeen,
  pendingDedication,
} from '../src/polish/DedicationBanner';

const LAST_SEEN = 'salaty.lastSeenVersion';
const TOUR = 'salaty.featureTour.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('pendingDedication', () => {
  it('is owed on a fresh install, and the flag is not stamped yet', async () => {
    await expect(pendingDedication()).resolves.toBe(true);
    await expect(AsyncStorage.getItem(DEDICATION_SEEN_KEY)).resolves.toBeNull();
  });

  it('is not owed once dismissed', async () => {
    await markDedicationSeen();
    await expect(pendingDedication()).resolves.toBe(false);
  });

  it('is not owed on an update, and the update is stamped as seen', async () => {
    await AsyncStorage.setItem(LAST_SEEN, '1.0.2');
    await expect(pendingDedication()).resolves.toBe(false);
    await expect(AsyncStorage.getItem(DEDICATION_SEEN_KEY)).resolves.toBe('1');
  });

  it('is not owed on an install older than release notes either', async () => {
    await AsyncStorage.setItem(TOUR, '1');
    await expect(pendingDedication()).resolves.toBe(false);
    await expect(AsyncStorage.getItem(DEDICATION_SEEN_KEY)).resolves.toBe('1');
  });
});

describe('DedicationBanner', () => {
  function textsOf(root: ReactTestRenderer): string[] {
    return root.root.findAllByType(Text).map(n => {
      const children = n.props.children as unknown;
      const parts = Array.isArray(children) ? children : [children];
      return parts.flat().join('');
    });
  }

  it('shows the exact words, in Arabic, whatever the reader’s language', () => {
    expect(DEDICATION_TITLE).toBe('أبو عبيدة السعداني');
    expect(DEDICATION_SUBTITLE).toBe('دعوة في ظهر الغيب');
    let root: ReactTestRenderer;
    act(() => {
      root = create(
        <DedicationBanner visible onClose={() => {}} />,
      );
    });
    const texts = textsOf(root!);
    expect(texts).toContain('أبو عبيدة السعداني');
    expect(texts).toContain('دعوة في ظهر الغيب');
  });

  it('shows nothing when not visible', () => {
    let root: ReactTestRenderer;
    act(() => {
      root = create(
        <DedicationBanner visible={false} onClose={() => {}} />,
      );
    });
    expect(textsOf(root!)).not.toContain('أبو عبيدة السعداني');
  });

  it('dismissing stamps the flag and closes', async () => {
    const onClose = jest.fn();
    let root: ReactTestRenderer;
    act(() => {
      root = create(<DedicationBanner visible onClose={onClose} />);
    });
    const close = root!.root.findByProps({ accessibilityRole: 'button' });
    await act(async () => {
      (close.props.onPress as () => void)();
    });
    await expect(AsyncStorage.getItem(DEDICATION_SEEN_KEY)).resolves.toBe('1');
    expect(onClose).toHaveBeenCalled();
  });
});
