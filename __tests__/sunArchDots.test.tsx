/**
 * The arch's day-path dots — what they are labelled.
 *
 * The dots used to wear the first three letters of the full prayer
 * name, so Asr ("العصر") and Isha ("العشاء") both read "الع" — two
 * dots, one label. They now wear the dedicated abbreviation keys,
 * which are distinct in every locale, a little larger and in the
 * text colour once done, so the path reads as six different prayers.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

const DICT: Record<string, string> = {
  'prayer.Fajr': 'الفجر',
  'prayer.Fajr_abbr': 'فجر',
  'prayer.Sunrise': 'الشروق',
  'prayer.Sunrise_abbr': 'شروق',
  'prayer.Dhuhr': 'الظهر',
  'prayer.Dhuhr_abbr': 'ظهر',
  'prayer.Asr': 'العصر',
  'prayer.Asr_abbr': 'عصر',
  'prayer.Maghrib': 'المغرب',
  'prayer.Maghrib_abbr': 'مغرب',
  'prayer.Isha': 'العشاء',
  'prayer.Isha_abbr': 'عشاء',
};

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
    t: (key: string, opts?: unknown) => {
      if (key in DICT) return DICT[key];
      if (typeof opts === 'string') return opts;
      if (opts && typeof opts === 'object' && 'defaultValue' in opts) {
        const dv = (opts as { defaultValue?: unknown }).defaultValue;
        return typeof dv === 'string' ? dv : key;
      }
      return key;
    },
    i18n: { language: 'ar' },
  }),
}));

import { SunArch } from '../src/screens/home/SunArch';
import { ARCH_DOT_KEYS, type ArchDot } from '../src/screens/home/sunArch';

function textsOf(root: ReactTestRenderer): string[] {
  return root.root.findAllByType(Text).map(n => {
    const children = n.props.children as unknown;
    const parts = Array.isArray(children) ? children : [children];
    return parts.flat().join('');
  });
}

function flatStyle(
  style: unknown,
): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign(
      {},
      ...style.map(s => (s && typeof s === 'object' ? s : {})),
    );
  }
  return style && typeof style === 'object'
    ? (style as Record<string, unknown>)
    : {};
}

const DOTS: ArchDot[] = ARCH_DOT_KEYS.map(key => ({
  key,
  at: new Date('2026-11-20T12:00:00+03:00'),
  state:
    key === 'Asr'
      ? 'next'
      : key === 'Maghrib' || key === 'Isha'
        ? 'todo'
        : 'done',
  secondary: key === 'Sunrise',
}));

async function renderArch(): Promise<ReactTestRenderer> {
  let root: ReactTestRenderer;
  await act(async () => {
    root = create(
      <SunArch
        state={{ phase: 'asr', orb: { kind: 'sun', t: 0.8, under: 0 } }}
        phaseLabel="العصر"
        dots={DOTS}
        pieces={{ h: 1, m: 13, s: '48', hours: '1' }}
        units={{ hour: 'س', minute: 'د', second: 'ث' }}
        showSeconds
        countdownSize={40}
        secondsSize={20}
        atShift={0}
        targetLabel="المغرب"
        targetClock="5:32 م"
        rtl
      />,
    );
  });
  return root!;
}

describe('the arch dots', () => {
  it('label Asr and Isha differently — no two dots share a label', async () => {
    const root = await renderArch();
    const texts = textsOf(root);
    expect(texts).toContain('عصر');
    expect(texts).toContain('عشاء');
    expect(texts).not.toContain('الع');
    expect(texts).toContain('فجر');
    expect(texts).toContain('شروق');
    expect(texts).toContain('ظهر');
    expect(texts).toContain('مغرب');
  });

  it('a done dot reads in the text colour, at the label size', async () => {
    const root = await renderArch();
    const label = root.root
      .findAllByType(Text)
      .find(n => {
        const children = n.props.children as unknown;
        const parts = Array.isArray(children) ? children : [children];
        return parts.flat().join('') === 'ظهر';
      });
    expect(label).toBeDefined();
    const style = flatStyle(label!.props.style);
    expect(style.color).toBe('#111111');
    expect(style.fontSize).toBe(12);
  });
});
