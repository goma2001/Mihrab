/**
 * Settings → About → Help صلاتي: rate, tell people, share the month.
 *
 * What it must get right: the page hangs off About; the rating button
 * says where it goes and goes there. This fork has no store listing
 * yet, so the only rating place is a GitHub star — never a Play or
 * App Store page that does not exist for it. The month row opens the
 * month screen on its printable sheet.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { todayCardSource } from './fixtures/todayCardSource';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(REPO, p), 'utf8');

const load = (os: 'ios' | 'android', distribution?: string) => {
  jest.resetModules();
  const openURL = jest.fn(() => Promise.resolve());
  jest.doMock('react-native', () => ({
    Platform: { OS: os },
    NativeModules: {
      PrayerBuildInfo: distribution ? { distribution } : undefined,
    },
    Linking: { openURL },
  }));
  const mod = require('../src/polish/rateApp');
  return { ...mod, openURL };
};

describe('where a rating goes', () => {
  // No store listing exists for this fork yet: every platform and every
  // distribution rates it the same way — a GitHub star.
  it.each([
    ['ios', undefined],
    ['android', 'play'],
    ['android', 'github'],
    ['android', 'fdroid'],
  ] as const)('%s %s → github only', (os, dist) => {
    expect(load(os, dist).ratingPlaces()).toEqual(['github']);
  });

  it('opens the fork on GitHub, from any build', async () => {
    const { openRatingPlace, openURL } = load('android', 'fdroid');
    await openRatingPlace('github');
    expect(openURL).toHaveBeenCalledWith('https://github.com/goma2001/salaty');
  });

  it('rateApp goes to GitHub on iOS and on Android', async () => {
    for (const os of ['ios', 'android'] as const) {
      const { rateApp, openURL } = load(os);
      await rateApp();
      expect(openURL).toHaveBeenCalledWith('https://github.com/goma2001/salaty');
    }
  });
});

describe('the page', () => {
  const subpages = read('src/screens/settings/subpages.tsx');
  const page = read('src/screens/settings/pages/HelpMihrabSettingsScreen.tsx');

  it('hangs off About, before the attributions', () => {
    const about = subpages.slice(subpages.indexOf("route: 'SettingsAbout'"));
    const help = about.indexOf("route: 'SettingsHelpMihrab'");
    expect(help).toBeGreaterThan(0);
    expect(help).toBeLessThan(about.indexOf("route: 'SettingsAttributions'"));
  });

  it('is the only rating button — About no longer carries its own', () => {
    expect(read('src/screens/settings/AboutCard.tsx')).not.toMatch(/rateApp\(/);
    expect(page).toMatch(/ratingPlaces\(\)/);
    expect(page).toMatch(/openRatingPlace\(place\)/);
  });

  it('shares the website, and opens the month on its sheet', () => {
    expect(page).toMatch(/SALATY_WEBSITE/);
    expect(page).toMatch(/navigate\('MonthTimes', \{ share: true \}\)/);
    expect(read('src/screens/MonthTimesScreen.tsx')).toMatch(
      /useState\(route\.params\?\.share === true\)/,
    );
  });

  it('is offered from the Today hero, on the far end of the "Fajr in" line', () => {
    const card = todayCardSource();
    // The eyebrow row is its own memoised component (HeroEyebrow): the
    // label first, the heart after it — the trailing end.
    // The label (and the "chosen" word after it, when the hero is aimed —
    // 2.33) is built first and placed first; the heart after it.
    const row = card.slice(card.indexOf('const HeroEyebrow = memo('));
    expect(row.indexOf('{label}')).toBeGreaterThan(0);
    expect(row.indexOf('<View style={styles.heroEyebrowRow}>')).toBeGreaterThan(row.indexOf('{label}'));
    expect(row.indexOf('{renderHelp?.(ink)}')).toBeGreaterThan(row.indexOf('<View style={styles.heroEyebrowRow}>'));
    expect(card).toMatch(/<HeroEyebrow\s+label=\{eyebrowLabel\}[\s\S]*?ink=\{inkTop\}\s+renderHelp=\{topRow\?\.renderHelp\}\s*\/>/);
    expect(card).toMatch(/t\('home\.nextPrayerIn', \{/);
    expect(read('src/screens/HomeScreen.tsx')).toMatch(/navigate\('SettingsHelpMihrab'\)/);
  });

  it('opens after a moment, then folds back into the circle after 15 seconds', () => {
    const chip = read('src/screens/home/HelpMihrabChip.tsx');
    expect(chip).toMatch(/export const SHOWN_FOR_MS = 15000;/);
    expect(chip).toMatch(/timing\(1, EXPAND_AFTER_MS\),\s*timing\(0, SHOWN_FOR_MS\)/);
    // Reduce Motion closes it too, just without the slide.
    expect(chip).toMatch(/setTimeout\(\(\) => open\.setValue\(0\), SHOWN_FOR_MS\)/);
  });

  it('can be taken off Today from the page it opens', () => {
    expect(read('src/screens/HomeScreen.tsx')).toMatch(
      /onHelpMihrab=\{settings\.showHelpMihrabOnHome \? handleOpenHelpMihrab : undefined\}/,
    );
    expect(page).toMatch(/updateSettings\(\{ showHelpMihrabOnHome: v \}\)/);
    expect(read('src/settings/types.ts')).toMatch(/showHelpMihrabOnHome: true,/);
  });

  it('has its words in every language', () => {
    for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      const json = JSON.parse(read(`src/i18n/locales/${l}.json`));
      expect(json.settings.helpMihrab).toBeTruthy();
      expect(json.home.helpMihrabChip).toBeTruthy();
      expect(json.helpMihrab.rateGithubHelp).toBeTruthy();
      expect(json.helpMihrab.shareMessage).toContain('{{url}}');
    }
  });
});
