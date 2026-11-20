/**
 * The floating prayer button's JavaScript side (Android only).
 *
 * The native service (FloatingButtonService) draws the pill and ticks
 * the countdown; all it needs from here is the times, in the wire
 * format the old Flutter Salaty used, extended with three meta
 * segments up front (v2 — the pill's tap panel) and the clock time
 * on each entry (v2 — native code never formats a time; see
 * __tests__/noNativeTimeParsing.test.ts):
 *
 *   "hijri|<Hijri date label>;title|<panel title>;openapp|<open-app
 *   label>;name|epochMs|HH:MM;name|epochMs|HH:MM;..."
 *
 * — the Hijri date for today (the home card's day, `formatHijriLabel`,
 *   in the app's language), the panel's title and its "open the app"
 *   row, then today's five prayers plus tomorrow's Fajr, so the
 *   countdown keeps working after Isha. Each entry carries its clock
 *   time as the canonical 24-hour `HH:mm` the app computed
 *   (`formatLocalTime`), so the pill's first line and the panel's rows
 *   show it without native code ever parsing or formatting a time.
 *   The service parses the meta segments by prefix and tolerates a
 *   payload without them (a v1 payload, or one stored before the
 *   update) — the panel then shows without the Hijri line and with
 *   the app name on its title and open rows — and entries without the
 *   clock field (a v1 payload's "name|epochMs") show the name alone.
 *   The service persists the payload itself, so a reboot restores the
 *   last-known countdown without the app.
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
import { formatHijriLabel } from '../hijri/formatHijriLabel';
import type { TimingsMap } from '../types/prayer';
import { addDays, eventAt, formatLocalTime } from '../utils/prayerTimes';
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
 * midnight belongs to the next date); each entry also carries its
 * clock time as canonical 24-hour `HH:mm` (`formatLocalTime`), so the
 * native pill and panel never format a time themselves. The three
 * meta segments up front carry the Hijri date and the tap panel's
 * title and open-app label, also in the app's language.
 */
export function buildOverlayTimesPayload(
  today: TimingsMap | null | undefined,
  tomorrow: TimingsMap | null | undefined,
  now: Date,
): string | null {
  if (!today) return null;
  const entries: { name: string; at: number; clock: string }[] = [];
  for (const key of WIDGET_ROW_KEYS) {
    const raw = today[key];
    if (!raw) return null;
    const at = eventAt(key, today, now);
    entries.push({
      name: i18n.t(`prayer.${key}`),
      at: at.getTime(),
      clock: formatLocalTime(at),
    });
  }
  const tomorrowFajr = tomorrow?.Fajr;
  if (!tomorrowFajr) return null;
  const fajrAt = eventAt('Fajr', tomorrow, addDays(now, 1));
  entries.push({
    name: i18n.t('prayer.Fajr'),
    at: fajrAt.getTime(),
    clock: formatLocalTime(fajrAt),
  });
  const meta = [
    `hijri|${formatHijriLabel(now)}`,
    `title|${i18n.t('settings.floatingButtonPanelTitle')}`,
    `openapp|${i18n.t('settings.floatingButtonOpenApp')}`,
  ];
  return [...meta, ...entries.map(e => `${e.name}|${e.at}|${e.clock}`)].join(';');
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
