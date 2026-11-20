import { archDots, archPoint, resolveArchTimes, sunArchState } from '../src/screens/home/sunArch';
import type { TimingsMap } from '../src/types/prayer';

const DAY: TimingsMap = {
  Fajr: '04:50',
  Sunrise: '06:10',
  Dhuhr: '12:05',
  Asr: '15:30',
  Maghrib: '18:20',
  Isha: '19:40',
};

const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);

describe('sunArchState', () => {
  const times = resolveArchTimes(DAY, at(12), '04:50')!;
  it('resolves the day arc from the real times', () => {
    expect(times.fajr).toBe(at(4, 50).getTime());
    expect(times.sunrise).toBe(at(6, 10).getTime());
    expect(times.maghrib).toBe(at(18, 20).getTime());
    expect(times.tomorrowFajr).toBe(at(4, 50).getTime() + 24 * 3600_000);
  });

  it('is night with the moon before Fajr', () => {
    const s = sunArchState(times, at(3).getTime());
    expect(s.phase).toBe('night');
    expect(s.orb.kind).toBe('moon');
    if (s.orb.kind === 'moon') expect(s.orb.t).toBeGreaterThan(0.5);
  });

  it('is dawn with the sun rising between Fajr and sunrise', () => {
    const early = sunArchState(times, at(5, 10).getTime());
    expect(early.phase).toBe('fajr');
    expect(early.orb.kind).toBe('sun');
    if (early.orb.kind === 'sun') {
      expect(early.orb.t).toBe(0);
      expect(early.orb.under).toBeGreaterThan(0);
      expect(early.orb.under).toBeLessThan(1);
    }
    const atSunrise = sunArchState(times, at(6, 10).getTime());
    expect(atSunrise.phase).toBe('sunrise');
    if (atSunrise.orb.kind === 'sun') expect(atSunrise.orb.under).toBe(0);
  });

  it('walks the sun along the day arc: sunrise, forenoon, midday, Asr, sunset', () => {
    const morning = sunArchState(times, at(8).getTime());
    expect(morning.phase).toBe('sunrise');
    // The reported bug (1.0.4): 09:01 read "الظهر" — the forenoon is
    // its own phase now, midday stays centred on solar noon.
    const forenoon = sunArchState(times, at(9, 1).getTime());
    expect(forenoon.phase).toBe('morning');
    const noon = sunArchState(times, at(12, 5).getTime());
    expect(noon.phase).toBe('day');
    if (noon.orb.kind === 'sun') expect(noon.orb.t).toBeCloseTo(0.486, 2);
    const afternoon = sunArchState(times, at(16, 30).getTime());
    expect(afternoon.phase).toBe('asr');
    const evening = sunArchState(times, at(18).getTime());
    expect(evening.phase).toBe('sunset');
    if (evening.orb.kind === 'sun') expect(evening.orb.t).toBeGreaterThan(0.9);
  });

  it('pins the forenoon boundaries: sunrise below 0.18, midday 0.45–0.62, Asr at 0.62', () => {
    // Day arc 06:10 → 18:20 is 730 minutes: 0.18 ≈ 08:21, 0.45 ≈ 11:38, 0.62 ≈ 13:42.
    expect(sunArchState(times, at(8, 21).getTime()).phase).toBe('sunrise');
    expect(sunArchState(times, at(8, 22).getTime()).phase).toBe('morning');
    expect(sunArchState(times, at(11, 38).getTime()).phase).toBe('morning');
    expect(sunArchState(times, at(11, 39).getTime()).phase).toBe('day');
    expect(sunArchState(times, at(13, 42).getTime()).phase).toBe('day');
    expect(sunArchState(times, at(13, 43).getTime()).phase).toBe('asr');
  });

  it('is dusk after Maghrib and night after Isha, the moon on the night arc', () => {
    const dusk = sunArchState(times, at(18, 50).getTime());
    expect(dusk.phase).toBe('sunset');
    expect(dusk.orb.kind).toBe('moon');
    const night = sunArchState(times, at(21).getTime());
    expect(night.phase).toBe('night');
    expect(night.orb.kind).toBe('moon');
    if (night.orb.kind === 'moon') expect(night.orb.t).toBeGreaterThan(0.1);
  });

  it('falls back to a midday sun when the times are missing', () => {
    const s = sunArchState(null, at(12).getTime());
    expect(s.phase).toBe('day');
    if (s.orb.kind === 'sun') expect(s.orb.t).toBe(0.5);
  });

  it('uses a 90-minute dawn when the Sunrise row is off', () => {
    const noSunrise = { ...DAY };
    delete noSunrise.Sunrise;
    const t = resolveArchTimes(noSunrise, at(12), '04:50')!;
    expect(t.sunrise).toBe(t.fajr + 90 * 60_000);
  });
});

describe('archPoint', () => {
  it('runs sunrise to sunset along the top of the arc', () => {
    const start = archPoint(0, 400, 200, 180, 180, false);
    const top = archPoint(0.5, 400, 200, 180, 180, false);
    const end = archPoint(1, 400, 200, 180, 180, false);
    expect(start.x).toBeCloseTo(20, 0);
    expect(start.y).toBeCloseTo(200, 0);
    expect(top.x).toBeCloseTo(200, 0);
    expect(top.y).toBeCloseTo(20, 0);
    expect(end.x).toBeCloseTo(380, 0);
    expect(end.y).toBeCloseTo(200, 0);
  });

  it('fills a tall scene as a half-ellipse, not a floating semicircle', () => {
    const top = archPoint(0.5, 400, 260, 180, 240, false);
    expect(top.x).toBeCloseTo(200, 0);
    expect(top.y).toBeCloseTo(20, 0);
    const start = archPoint(0, 400, 260, 180, 240, false);
    expect(start.x).toBeCloseTo(20, 0);
    expect(start.y).toBeCloseTo(260, 0);
  });

  it('mirrors the arc in a right-to-left language', () => {
    const ltr = archPoint(0, 400, 200, 180, 180, false);
    const rtl = archPoint(0, 400, 200, 180, 180, true);
    expect(rtl.x).toBeCloseTo(400 - ltr.x, 0);
    expect(rtl.y).toBeCloseTo(ltr.y, 0);
  });
});

describe('archDots', () => {
  it('marks the passed prayers, the target and the ones to come', () => {
    const dots = archDots(DAY, at(12), 'Dhuhr');
    expect(dots.map(d => d.key)).toEqual(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(dots.find(d => d.key === 'Fajr')?.state).toBe('done');
    expect(dots.find(d => d.key === 'Sunrise')?.state).toBe('done');
    expect(dots.find(d => d.key === 'Sunrise')?.secondary).toBe(true);
    expect(dots.find(d => d.key === 'Dhuhr')?.state).toBe('next');
    expect(dots.find(d => d.key === 'Asr')?.state).toBe('todo');
  });
});
