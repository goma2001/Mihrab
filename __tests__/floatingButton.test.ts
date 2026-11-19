/**
 * The floating prayer button (Android only): the times payload the
 * native pill counts down from, and the sync that starts/stops it.
 *
 * The payload is today's five prayers plus tomorrow's Fajr, as
 * "name|epochMs;..." — the wire format the old Flutter Salaty used,
 * which FloatingButtonService parses and persists. The instants come
 * from `eventAt`, the one place that knows which date a row's clock
 * time falls on (an Isha past midnight belongs to the next date).
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

  it('is today’s five prayers plus tomorrow’s Fajr, as name|epochMs', () => {
    const now = new Date(2026, 10, 19, 10, 0, 0);
    const payload = buildOverlayTimesPayload(TODAY, TOMORROW, now);
    expect(payload).toBe(
      [
        `Fajr|${new Date(2026, 10, 19, 5, 12).getTime()}`,
        `Dhuhr|${new Date(2026, 10, 19, 12, 5).getTime()}`,
        `Asr|${new Date(2026, 10, 19, 15, 30).getTime()}`,
        `Maghrib|${new Date(2026, 10, 19, 18, 2).getTime()}`,
        `Isha|${new Date(2026, 10, 19, 19, 35).getTime()}`,
        `Fajr|${new Date(2026, 10, 20, 5, 11).getTime()}`,
      ].join(';'),
    );
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

  it('the pill layout is the dark-green pill with gold text', () => {
    const layout = repo('android', 'app', 'src', 'main', 'res', 'layout', 'overlay_pill.xml');
    expect(layout).toContain('android:background="@drawable/overlay_pill_bg"');
    expect(layout).toContain('android:textColor="#C9A227"');
    const bg = repo('android', 'app', 'src', 'main', 'res', 'drawable', 'overlay_pill_bg.xml');
    expect(bg).toContain('<solid android:color="#0B6B4F" />');
    expect(bg).toContain('<stroke android:width="1dp" android:color="#C9A227" />');
  });
});
