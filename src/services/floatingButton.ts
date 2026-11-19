/**
 * The floating prayer button's JavaScript side (Android only).
 *
 * The native service (FloatingButtonService) draws the pill and ticks
 * the countdown; all it needs from here is the times, in the wire
 * format the old Flutter Salaty used:
 *   "name|epochMs;name|epochMs;..."
 * — today's five prayers plus tomorrow's Fajr, so the countdown keeps
 * working after Isha. The service persists the payload itself, so a
 * reboot restores the last-known countdown without the app.
 *
 * `syncFloatingButton` is called from the same two places as
 * `syncLiveActivity` (HomeScreen focus + prayer-data change), so the
 * pill's times stay in step with the home screen. It never throws:
 * a missing module, missing times or a refused start is a silent
 * no-op — the Settings toggle is the source of truth, and the next
 * sync retries.
 */
import { Platform } from 'react-native';
import i18n from '../i18n';
import type { TimingsMap } from '../types/prayer';
import { addDays, eventAt } from '../utils/prayerTimes';
import { WIDGET_ROW_KEYS } from '../widget/buildWidgetPayload';
import {
  floatingButtonAvailable,
  startFloatingButton,
  stopFloatingButton,
} from '../native/FloatingButton';

/**
 * The payload the native pill needs, or null when the day's times are
 * not available yet. Names are the prayer names in the app's language
 * (`prayer.Fajr` etc.); instants come from `eventAt`, the one place
 * that knows which date a row's clock time falls on (an Isha past
 * midnight belongs to the next date).
 */
export function buildOverlayTimesPayload(
  today: TimingsMap | null | undefined,
  tomorrow: TimingsMap | null | undefined,
  now: Date,
): string | null {
  if (!today) return null;
  const entries: { name: string; at: number }[] = [];
  for (const key of WIDGET_ROW_KEYS) {
    const raw = today[key];
    if (!raw) return null;
    entries.push({
      name: i18n.t(`prayer.${key}`),
      at: eventAt(key, today, now).getTime(),
    });
  }
  const tomorrowFajr = tomorrow?.Fajr;
  if (!tomorrowFajr) return null;
  entries.push({
    name: i18n.t('prayer.Fajr'),
    at: eventAt('Fajr', tomorrow, addDays(now, 1)).getTime(),
  });
  return entries.map(e => `${e.name}|${e.at}`).join(';');
}

export type FloatingButtonSyncArgs = {
  enabled: boolean;
  today: TimingsMap | null | undefined;
  tomorrow: TimingsMap | null | undefined;
  now: Date;
};

/**
 * Drive the floating button to match the supplied state. Idempotent —
 * call on settings change, on prayer-day data update, and on AppState
 * 'active'. Android only; a no-op everywhere else.
 */
export async function syncFloatingButton(
  args: FloatingButtonSyncArgs,
): Promise<void> {
  if (Platform.OS !== 'android' || !floatingButtonAvailable) return;
  if (!args.enabled) {
    await stopFloatingButton();
    return;
  }
  const payload = buildOverlayTimesPayload(args.today, args.tomorrow, args.now);
  if (!payload) return;
  await startFloatingButton(payload);
}
