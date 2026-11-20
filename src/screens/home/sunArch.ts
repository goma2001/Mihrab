/**
 * The Arch of Light (قوس النور, 1.0.4): the sun's path as a semicircle,
 * drawn from the day's real prayer times and the device's real clock.
 *
 * The arch IS the sun's own clock, the same one `skyModel` keeps: sunrise
 * to Maghrib is the whole of the day arc, solar noon its midpoint — so the
 * orb is highest where the sun is highest without anyone having to say so.
 * Between Maghrib and the next Fajr the same arc carries the moon.
 *
 * Pure functions, no React: the component (`SunArch.tsx`) paints what
 * these return, and the tests below pin the boundaries.
 */
import type { ArchPhase } from '../../theme/tokens';
import type { TimingsMap } from '../../types/prayer';
import { combineLocalDateAndTime, eventAt } from '../../utils/prayerTimes';

export type { ArchPhase };

export type ArchOrb =
  | { kind: 'sun'; t: number; under: number }
  | { kind: 'moon'; t: number }
  | { kind: 'hidden' };

export type SunArchState = {
  phase: ArchPhase;
  orb: ArchOrb;
};

/** The instants the arch is drawn from, as epoch milliseconds. */
export type ArchTimes = {
  fajr: number;
  sunrise: number;
  asr: number;
  maghrib: number;
  isha: number;
  tomorrowFajr: number;
};

const DAY_MS = 24 * 3600_000;

const frac = (a: number, b: number, n: number) =>
  b > a ? Math.max(0, Math.min(1, (n - a) / (b - a))) : 0;

/**
 * The day's prayer times as instants, read from the same source the hero
 * already uses (`eventAt`, which knows about an ʿIshāʾ past midnight).
 * Sunrise is an optional row: without it the dawn lasts the hour and a
 * half it does at the middle latitudes, the same fallback `skyMoment`
 * uses. `tomorrowFajr` closes the night; without it the night is assumed
 * to end at today's Fajr plus a day.
 */
export function resolveArchTimes(
  today: TimingsMap,
  now: Date,
  tomorrowFajr?: string,
  dayClock?: string | null,
): ArchTimes | null {
  const at = (key: string) => eventAt(key, today, now, dayClock).getTime();
  const fajr = at('Fajr');
  const asr = at('Asr');
  const maghrib = at('Maghrib');
  const isha = at('Isha');
  if ([fajr, asr, maghrib, isha].some(v => !Number.isFinite(v))) return null;
  const sunriseRaw = today.Sunrise ? at('Sunrise') : NaN;
  const sunrise = Number.isFinite(sunriseRaw) ? sunriseRaw : fajr + 90 * 60_000;
  let end: number;
  if (tomorrowFajr) {
    const d = combineLocalDateAndTime(now, tomorrowFajr);
    d.setDate(d.getDate() + 1);
    end = d.getTime();
  } else {
    end = fajr + DAY_MS;
  }
  return { fajr, sunrise, asr, maghrib, isha, tomorrowFajr: end };
}

/**
 * The arch at one instant: which phase, and where the orb is on it.
 *
 * - Before Fajr: night, the moon on the night arc (yesterday's Maghrib
 *   to today's Fajr).
 * - Fajr to sunrise: dawn, the sun still under the horizon — `under`
 *   says how much of it, 1 at Fajr, 0 at sunrise, and the component
 *   clips the disc at the horizon line, so it RISES rather than standing
 *   whole on the line.
 * - Sunrise to Maghrib: the sun on the day arc; the phase follows where
 *   on it — sunrise, forenoon, midday, Asr, sunset. Midday is centred
 *   on solar noon (t = 0.5), so a morning hour is never called noon:
 *   the forenoon (الضحى) runs from t = 0.18 to t = 0.45, midday (الظهر)
 *   from t = 0.45 to t = 0.62.
 * - Maghrib to ʿIshāʾ: dusk, the moon already rising on the night arc
 *   (Maghrib to the next Fajr); after ʿIshāʾ: night.
 */
export function sunArchState(times: ArchTimes | null, nowMs: number): SunArchState {
  if (!times) return { phase: 'day', orb: { kind: 'sun', t: 0.5, under: 0 } };
  const { fajr, sunrise, maghrib, isha, tomorrowFajr } = times;
  if (nowMs < fajr) {
    return { phase: 'night', orb: { kind: 'moon', t: frac(maghrib - DAY_MS, fajr, nowMs) } };
  }
  if (nowMs < sunrise) {
    return { phase: 'fajr', orb: { kind: 'sun', t: 0, under: 1 - frac(fajr, sunrise, nowMs) } };
  }
  if (nowMs < maghrib) {
    const t = frac(sunrise, maghrib, nowMs);
    const phase: ArchPhase =
      t < 0.18 ? 'sunrise' : t < 0.45 ? 'morning' : t < 0.62 ? 'day' : t < 0.92 ? 'asr' : 'sunset';
    return { phase, orb: { kind: 'sun', t, under: 0 } };
  }
  if (nowMs < isha) {
    return { phase: 'sunset', orb: { kind: 'moon', t: frac(maghrib, tomorrowFajr, nowMs) } };
  }
  return { phase: 'night', orb: { kind: 'moon', t: frac(maghrib, tomorrowFajr, nowMs) } };
}

/**
 * A fraction along the arc (0 = sunrise, 1 = sunset) as a point in a box
 * of `width` × `height`, the arc a half-ellipse of radii `rx` × `ry`
 * whose diameter is the box's foot — so the arch fills whatever room the
 * scene has, tall on a phone, short on a card, rather than a fixed
 * semicircle floating in a tall box. In a right-to-left language the sun
 * rises on the right, so the arc is mirrored.
 */
export function archPoint(
  t: number,
  width: number,
  height: number,
  rx: number,
  ry: number,
  rtl: boolean,
): { x: number; y: number } {
  const cx = width / 2;
  const angle = Math.PI * (1 - t);
  const x = cx + rx * Math.cos(angle);
  return { x: rtl ? width - x : x, y: height - ry * Math.sin(angle) };
}

/** The day's path under the arch: one dot per prayer, synced to now. */
export type ArchDot = {
  key: string;
  at: Date;
  state: 'done' | 'next' | 'todo';
  /** Sunrise is a marker on the path, not a prayer: drawn quieter. */
  secondary: boolean;
};

/** The day's path: the prayers that mark the arch, in order. */
export const ARCH_DOT_KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

export function archDots(
  today: TimingsMap,
  now: Date,
  targetName: string,
  dayClock?: string | null,
): ArchDot[] {
  // A row the user turned off has no key (Sunrise is optional): the path
  // skips it rather than crashing on an absent time.
  return ARCH_DOT_KEYS.filter(key => typeof today[key] === 'string').map(key => {
    const at = eventAt(key, today, now, dayClock);
    const state = key === targetName ? 'next' : at.getTime() <= now.getTime() ? 'done' : 'todo';
    return { key, at, state, secondary: key === 'Sunrise' };
  });
}

/**
 * The night's stars: fixed fractions of the arch box, so they never
 * jump between renders — the sky is a drawing, and a star that moves
 * every minute is a bug, not weather.
 */
export const ARCH_STARS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 0.5, y: 0.25, r: 1.6 },
  { x: 0.38, y: 0.35, r: 1.1 },
  { x: 0.62, y: 0.35, r: 1.4 },
  { x: 0.3, y: 0.55, r: 1 },
  { x: 0.7, y: 0.55, r: 1.5 },
  { x: 0.44, y: 0.5, r: 1.2 },
  { x: 0.56, y: 0.5, r: 1.4 },
  { x: 0.24, y: 0.75, r: 1 },
  { x: 0.76, y: 0.75, r: 1.6 },
  { x: 0.18, y: 0.85, r: 1.1 },
  { x: 0.82, y: 0.85, r: 1.3 },
  { x: 0.35, y: 0.8, r: 1 },
  { x: 0.65, y: 0.8, r: 1 },
];
