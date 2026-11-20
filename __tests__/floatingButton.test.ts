/**
 * The floating prayer button (Android only): the times payload the
 * native pill counts down from, and the sync that starts/stops it.
 *
 * The payload is three meta segments up front — the Hijri date, the
 * tap panel's title and its open-app label — then today's five
 * prayers plus tomorrow's Fajr, as "name|epochMs|HH:MM" — the wire
 * format the old Flutter Salaty used, which FloatingButtonService
 * parses and persists. The clock time rides in the payload because
 * native code never formats a time
 * (`__tests__/noNativeTimeParsing.test.ts`). The instants come from
 * `eventAt`, the one place that knows which date a row's clock time
 * falls on (an Isha past midnight belongs to the next date). A
 * payload without the meta segments or the clock field (v1) still
 * parses on the native side: the panel then shows without the Hijri
 * line and with the app name on its title and open rows, and a prayer
 * without a clock shows its name alone.
 */
import { Platform } from 'react-native';
import { readFileSync } from 'fs';
import path from 'path';
import i18n from '../src/i18n';
import {
  buildOverlayTimesPayload,
  syncFloatingButton,
} from '../src/services/floatingButton';
import {
  startFloatingButton,
  stopFloatingButton,
} from '../src/native/FloatingButton';

jest.mock('../src/native/FloatingButton', () => ({
  floatingButtonAvailable: true,
  startFloatingButton: jest.fn().mockResolvedValue(true),
  stopFloatingButton: jest.fn().mockResolvedValue(undefined),
  hasOverlayPermission: jest.fn().mockResolvedValue(true),
  openOverlayPermissionSettings: jest.fn().mockResolvedValue(undefined),
}));

const mockedStart = startFloatingButton as jest.Mock;
const mockedStop = stopFloatingButton as jest.Mock;

const TODAY = {
  Fajr: '05:12',
  Sunrise: '06:30',
  Dhuhr: '12:05',
  Asr: '15:30',
  Maghrib: '18:02',
  Isha: '19:35',
};
const TOMORROW = {
  Fajr: '05:11',
  Sunrise: '06:29',
  Dhuhr: '12:05',
  Asr: '15:30',
  Maghrib: '18:03',
  Isha: '19:36',
};

describe('buildOverlayTimesPayload', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('is the meta segments, then today’s five prayers plus tomorrow’s Fajr', () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    const payload = buildOverlayTimesPayload(TODAY, TOMORROW, now);
    expect(payload).toBe(
      [
        'hijri|9 Jumada II 1448',
        "title|Today's prayer times",
        'openapp|Open the app',
        `Fajr|${new Date(2026, 10, 19, 5, 12).getTime()}|05:12`,
        `Dhuhr|${new Date(2026, 10, 19, 12, 5).getTime()}|12:05`,
        `Asr|${new Date(2026, 10, 19, 15, 30).getTime()}|15:30`,
        `Maghrib|${new Date(2026, 10, 19, 18, 2).getTime()}|18:02`,
        `Isha|${new Date(2026, 10, 19, 19, 35).getTime()}|19:35`,
        `Fajr|${new Date(2026, 10, 20, 5, 11).getTime()}|05:11`,
      ].join(';'),
    );
  });

  it('names the Hijri date, panel title and open-app label in the app’s language', async () => {
    await i18n.changeLanguage('ar');
    const now = new Date(2026, 10, 19, 10, 0, 0);
    const payload = buildOverlayTimesPayload(TODAY, TOMORROW, now);
    expect(payload).toContain('hijri|٩ جمادى الآخرة ١٤٤٨');
    expect(payload).toContain('title|مواقيت اليوم');
    expect(payload).toContain('openapp|فتح التطبيق');
    expect(payload).toContain('العصر|');
    expect(payload).toContain('|15:30');
    await i18n.changeLanguage('en');
  });

  it('names the prayers in the app’s language', async () => {
    await i18n.changeLanguage('ar');
    const now = new Date(2026, 10, 19, 10, 0, 0);
    const payload = buildOverlayTimesPayload(TODAY, TOMORROW, now);
    expect(payload).toContain('الفجر|');
    expect(payload).toContain('الظهر|');
    expect(payload).toContain('العصر|');
    expect(payload).toContain('المغرب|');
    expect(payload).toContain('العشاء|');
    await i18n.changeLanguage('en');
  });

  it('puts an Isha past midnight on the next date', () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    const payload = buildOverlayTimesPayload(
      { ...TODAY, Isha: '00:02' },
      TOMORROW,
      now,
    );
    expect(payload).toContain(
      `Isha|${new Date(2026, 10, 20, 0, 2).getTime()}`,
    );
  });

  it('is null when the day’s times are not there yet', () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    expect(buildOverlayTimesPayload(null, TOMORROW, now)).toBeNull();
    expect(buildOverlayTimesPayload(undefined, TOMORROW, now)).toBeNull();
    expect(
      buildOverlayTimesPayload({ ...TODAY, Fajr: undefined } as never, TOMORROW, now),
    ).toBeNull();
    expect(buildOverlayTimesPayload(TODAY, null, now)).toBeNull();
    expect(
      buildOverlayTimesPayload(TODAY, { ...TOMORROW, Fajr: undefined } as never, now),
    ).toBeNull();
  });
});

describe('syncFloatingButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  it('starts the pill with the payload when enabled', async () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    await syncFloatingButton({ enabled: true, today: TODAY, tomorrow: TOMORROW, now });
    expect(mockedStart).toHaveBeenCalledTimes(1);
    expect(mockedStart.mock.calls[0][0]).toContain(
      `Fajr|${new Date(2026, 10, 19, 5, 12).getTime()}`,
    );
    expect(mockedStop).not.toHaveBeenCalled();
  });

  it('passes the Hijri date and panel labels up front', async () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    await syncFloatingButton({ enabled: true, today: TODAY, tomorrow: TOMORROW, now });
    const payload = mockedStart.mock.calls[0][0] as string;
    expect(payload.startsWith('hijri|9 Jumada II 1448;')).toBe(true);
    expect(payload).toContain("title|Today's prayer times;");
    expect(payload).toContain('openapp|Open the app;');
  });

  it('stops the pill when disabled, and never starts it', async () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    await syncFloatingButton({ enabled: false, today: TODAY, tomorrow: TOMORROW, now });
    expect(mockedStop).toHaveBeenCalledTimes(1);
    expect(mockedStart).not.toHaveBeenCalled();
  });

  it('does nothing when the times are not there yet', async () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    await syncFloatingButton({ enabled: true, today: null, tomorrow: TOMORROW, now });
    expect(mockedStart).not.toHaveBeenCalled();
    expect(mockedStop).not.toHaveBeenCalled();
  });

  it('is an Android-only no-op elsewhere', async () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    Platform.OS = 'ios';
    await syncFloatingButton({ enabled: true, today: TODAY, tomorrow: TOMORROW, now });
    expect(mockedStart).not.toHaveBeenCalled();
    expect(mockedStop).not.toHaveBeenCalled();
  });
});

describe('the native side is wired up', () => {
  const repo = (...parts: string[]) =>
    readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
  const kt = (name: string) =>
    repo('android', 'app', 'src', 'main', 'java', 'com', 'goma', 'salat', `${name}.kt`);
  const manifest = repo('android', 'app', 'src', 'main', 'AndroidManifest.xml');

  it('the manifest declares the permission, the service and the boot receiver', () => {
    expect(manifest).toContain(
      '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
    );
    expect(manifest).toMatch(/android:name="\.FloatingButtonService"/);
    expect(manifest).toMatch(/android:foregroundServiceType="specialUse"/);
    expect(manifest).toMatch(/android:name="\.FloatingButtonBootReceiver"/);
    expect(manifest).toMatch(/android\.intent\.action\.BOOT_COMPLETED/);
  });

  it('the module is registered with React Native', () => {
    expect(kt('MainApplication')).toContain('add(FloatingButtonPackage())');
    expect(kt('FloatingButtonPackage')).toMatch(
      /listOf\(FloatingButtonModule\(reactContext\)\)/,
    );
    expect(kt('FloatingButtonModule')).toContain('override fun getName(): String = NAME');
    expect(kt('FloatingButtonModule')).toContain('const val NAME = "FloatingButton"');
  });

  it('the service is a sticky foreground service that draws an overlay pill', () => {
    const service = kt('FloatingButtonService');
    expect(service).toMatch(/return START_STICKY/);
    expect(service).toMatch(/TYPE_APPLICATION_OVERLAY/);
    expect(service).toMatch(/Settings\.canDrawOverlays\(this\)/);
    expect(service).toMatch(/R\.layout\.overlay_pill/);
    expect(service).toMatch(/حان الآن/);
    expect(service).toMatch(/FOREGROUND_SERVICE_TYPE_SPECIAL_USE/);
  });

  it('the service stops, rather than starting, when told to stop', () => {
    const service = kt('FloatingButtonService');
    expect(service).toMatch(
      /if \(intent\?\.action == ACTION_STOP\) \{\s*stopSelf\(\)/,
    );
  });

  it('the boot receiver only restarts the pill when the user enabled it', () => {
    const receiver = kt('FloatingButtonBootReceiver');
    expect(receiver).toMatch(/ACTION_BOOT_COMPLETED/);
    expect(receiver).toMatch(
      /if \(!prefs\.getBoolean\(FloatingButtonService\.KEY_ENABLED, false\)\) return/,
    );
  });

  it('the pill layout is the deep-emerald pill with gold text', () => {
    const layout = repo('android', 'app', 'src', 'main', 'res', 'layout', 'overlay_pill.xml');
    expect(layout).toContain('android:background="@drawable/overlay_pill_bg"');
    expect(layout).toContain('android:textColor="#C9A227"');
    const bg = repo('android', 'app', 'src', 'main', 'res', 'drawable', 'overlay_pill_bg.xml');
    expect(bg).toContain('<solid android:color="#01543F" />');
    expect(bg).toContain('<stroke android:width="1dp" android:color="#C9A227" />');
  });
});

describe('the v2 pill and times panel (native side)', () => {
  const repo = (...parts: string[]) =>
    readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
  const kt = (name: string) =>
    repo('android', 'app', 'src', 'main', 'java', 'com', 'goma', 'salat', `${name}.kt`);

  it('the pill has two lines: prayer + clock time above, countdown below, larger and bolder', () => {
    const layout = repo('android', 'app', 'src', 'main', 'res', 'layout', 'overlay_pill.xml');
    expect(layout).toContain('android:id="@+id/overlay_pill_line1"');
    expect(layout).toContain('android:id="@+id/overlay_pill_line2"');
    expect(layout).toContain('android:orientation="vertical"');
    expect(layout).toMatch(/overlay_pill_line1"[\s\S]*?android:textSize="12sp"/);
    expect(layout).toMatch(/overlay_pill_line2"[\s\S]*?android:textSize="18sp"/);
    expect(layout).toMatch(/overlay_pill_line2"[\s\S]*?android:textStyle="bold"/);
    const service = kt('FloatingButtonService');
    expect(service).toMatch(/line1\.text = if \(next\.clock != null\) "\$\{next\.name\} \$\{next\.clock\}" else next\.name/);
    expect(service).toMatch(/line2\.text = formatHms\(next\.at - now\)/);
    expect(service).toContain('حان الآن');
    // The clock time comes from the payload, never from native
    // formatting (see noNativeTimeParsing.test.ts).
    expect(service).not.toContain('SimpleDateFormat');
    expect(service).not.toContain('formatClock');
  });

  it('the service parses the meta segments, and tolerates a v1 payload without them', () => {
    const service = kt('FloatingButtonService');
    expect(service).toMatch(/part\.startsWith\("hijri\|"\)/);
    expect(service).toMatch(/part\.startsWith\("title\|"\)/);
    expect(service).toMatch(/part\.startsWith\("openapp\|"\)/);
    expect(service).toMatch(/val hijriDate: String\?/);
    expect(service).toMatch(/val panelTitle: String\?/);
    expect(service).toMatch(/val openAppLabel: String\?/);
    // A v1 entry has no clock field: the clock is optional.
    expect(service).toContain('fields.getOrNull(2)');
    expect(service).toMatch(/val clock = fields\.getOrNull\(2\)\?\.takeIf \{ it\.isNotEmpty\(\) \}/);
    // No Hijri date: the panel hides the line instead of crashing.
    expect(service).toMatch(/if \(hijriDate\.isNullOrEmpty\(\)\) \{\s*hijriView\.visibility = View\.GONE/);
    // No title or open-app label: the app name stands in.
    expect(service).toContain('titleView.text = panelTitle ?: "صلاتي"');
    expect(service).toContain('openAppView.text = openAppLabel ?: "صلاتي"');
  });

  it('a tap toggles the times panel; the panel never takes focus', () => {
    const service = kt('FloatingButtonService');
    expect(service).toMatch(/if \(!moved\) \{\s*togglePanel\(\)/);
    expect(service).toContain('R.layout.overlay_times_panel');
    expect(service).toContain('R.layout.overlay_times_row');
    // Today's five prayers (the sixth entry is tomorrow's Fajr).
    expect(service).toContain('times.take(5)');
    expect(service).toMatch(/timeView\.text = clock/);
    // A v1 entry without a clock shows its name alone.
    expect(service).toMatch(/if \(clock == null\) \{[\s\S]*?timeView\.visibility = View\.GONE/);
    // The panel's window is focus-free, like the pill's.
    expect(service).toMatch(
      /WindowManager\.LayoutParams\(/s,
    );
    expect(service).toMatch(/FLAG_NOT_FOCUSABLE/);
    // Tap outside, the ✕, or the open-app row dismisses it.
    expect(service).toContain('dismissPanel()');
    expect(service).toContain('overlay_panel_close');
    expect(service).toContain('overlay_panel_open_app');
    expect(service).toMatch(/openAppView\.setOnClickListener \{\s*dismissPanel\(\)\s*openApp\(\)/);
  });

  it('the panel layout has its title, Hijri line, rows and open-app row', () => {
    const layout = repo('android', 'app', 'src', 'main', 'res', 'layout', 'overlay_times_panel.xml');
    expect(layout).toContain('android:id="@+id/overlay_panel_title"');
    expect(layout).toContain('android:id="@+id/overlay_panel_hijri"');
    expect(layout).toContain('android:id="@+id/overlay_panel_rows"');
    expect(layout).toContain('android:id="@+id/overlay_panel_open_app"');
    expect(layout).toContain('android:background="@drawable/overlay_panel_bg"');
    const bg = repo('android', 'app', 'src', 'main', 'res', 'drawable', 'overlay_panel_bg.xml');
    expect(bg).toContain('<solid android:color="#01543F" />');
    expect(bg).toContain('<stroke android:width="1dp" android:color="#C9A227" />');
  });

  it('the panel highlights the next prayer in gold', () => {
    const service = kt('FloatingButtonService');
    expect(service).toContain('refreshPanelHighlight()');
    expect(service).toMatch(/Color\.parseColor\("#C9A227"\)/);
  });

  it('the release is 1.0.8', () => {
    const pkg = JSON.parse(repo('package.json')) as { version: string };
    expect(pkg.version).toBe('1.0.8');
    const gradle = repo('android', 'app', 'build.gradle');
    expect(gradle).toContain('versionCode 9');
    expect(gradle).toContain('versionName "1.0.8"');
  });
});
