/**
 * Settings → Updates: the app updating itself.
 *
 * The states, in the order a reader meets them:
 *  - checking — the launch check is still running, or the button was
 *    just pressed;
 *  - up to date — the installed version is the latest release;
 *  - available — a newer release, its number, what is new in it, and the
 *    Update button;
 *  - downloading — progress in megabytes, with Cancel;
 *  - downloaded — Install, which hands the file to the system installer;
 *  - download-failed — the download itself failed (not the check):
 *    its own message, the reason under it, and Try again;
 *  - needs-permission — Android 8 and up, "install unknown apps" is off:
 *    the reason, and a button into the setting;
 *  - error — offline, no APK in the release, or the check failed, with
 *    Try again.
 *
 * Nothing here starts on its own: the download starts on Update, the
 * install on Install. The launch check (Home, after onboarding) only
 * fills in the state, so opening this page after a launch already knows.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  getInstalledAppVersionLabel,
  getInstalledAppVersionName,
} from '../../appVersion';
import { LRI, PDI } from '../../i18n/foreignText';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, typeStyle } from '../../theme/typography';
import { SettingsGroup } from './SettingsGroup';
import { quiet } from '../../utils/quiet';
import {
  checkForUpdate,
  downloadApk,
  getCachedCheck,
  installApk,
  openInstallPermissionSettings,
  useAvailableUpdate,
  type ReleaseInfo,
  type UpdateCheckResult,
} from '../../updates/appUpdate';

/**
 * A version number, kept the right way round in Arabic and Urdu — the
 * same isolate the changelog uses, for the same reason: `1.0.3` inside a
 * right-to-left paragraph is reordered by the bidi algorithm without it.
 */
function ltr(version: string): string {
  return `${LRI}${version}${PDI}`;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'up-to-date'; latestVersion: string }
  | { kind: 'available'; release: ReleaseInfo }
  | { kind: 'error'; reason: 'offline' | 'no-apk' | 'fetch-failed' }
  | { kind: 'downloading'; release: ReleaseInfo; received: number; total: number }
  | { kind: 'downloaded'; release: ReleaseInfo; path: string }
  | { kind: 'download-failed'; release: ReleaseInfo; detail?: string }
  | { kind: 'needs-permission'; release: ReleaseInfo; path: string }
  | { kind: 'install-started'; release: ReleaseInfo }
  | { kind: 'install-failed'; release: ReleaseInfo; path: string };

function phaseFromCheck(result: UpdateCheckResult): Phase {
  switch (result.status) {
    case 'up-to-date':
      return { kind: 'up-to-date', latestVersion: result.latestVersion };
    case 'available':
      return { kind: 'available', release: result.latest };
    case 'error':
      return { kind: 'error', reason: result.reason };
  }
}

/**
 * The "a newer version is there" pill on the Settings index row. Null
 * when there is nothing newer — the row then reads as it always did.
 */
export function UpdateAvailableBadge() {
  const { palette } = useAppPalette();
  const release = useAvailableUpdate();
  if (!release) return null;
  return (
    <View style={[styles.badge, { backgroundColor: palette.accentBg }]}>
      <Text style={[styles.badgeText, { color: palette.accentSolid }]}>
        {ltr(release.version)}
      </Text>
    </View>
  );
}

function UpdatesCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const installedLabel = getInstalledAppVersionLabel();
  const [phase, setPhase] = useState<Phase>(() => {
    const cached = getCachedCheck();
    return cached ? phaseFromCheck(cached) : { kind: 'checking' };
  });
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    },
    [],
  );

  const runCheck = useCallback((force: boolean) => {
    setPhase({ kind: 'checking' });
    void checkForUpdate({ force }).then(result => {
      if (mountedRef.current) setPhase(phaseFromCheck(result));
    });
  }, []);

  // On open: the launch check's answer if there is one, a fresh check
  // if the launch never ran one (a cold start straight into Settings).
  useEffect(() => {
    if (!getCachedCheck()) runCheck(false);
    // Once, on mount: the button is the way back in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDownload = useCallback((release: ReleaseInfo) => {
    cancelledRef.current = false;
    setPhase({ kind: 'downloading', release, received: 0, total: 0 });
    void downloadApk(
      release,
      (received, total) => {
        if (mountedRef.current) {
          setPhase({ kind: 'downloading', release, received, total });
        }
      },
      () => cancelledRef.current,
    )
      .then(path => {
        if (mountedRef.current) {
          setPhase({ kind: 'downloaded', release, path });
        }
      })
      .catch(error => {
        quiet('settings/UpdatesCard', error);
        if (!mountedRef.current) return;
        if (cancelledRef.current) {
          // Cancelled: back to the offer, not an error.
          setPhase({ kind: 'available', release });
        } else {
          // A download failure is its own state — not the check's
          // "couldn't check" — with the reason under it, so the reader
          // can tell which step failed.
          setPhase({
            kind: 'download-failed',
            release,
            detail: error instanceof Error ? error.message : undefined,
          });
        }
      });
  }, []);

  const startInstall = useCallback((release: ReleaseInfo, path: string) => {
    void installApk(path)
      .then(outcome => {
        if (!mountedRef.current) return;
        if (outcome === 'started') {
          setPhase({ kind: 'install-started', release });
        } else if (outcome === 'needs-permission') {
          setPhase({ kind: 'needs-permission', release, path });
        } else {
          setPhase({ kind: 'install-failed', release, path });
        }
      })
      .catch(error => {
        quiet('settings/UpdatesCard', error);
        if (mountedRef.current) {
          setPhase({ kind: 'install-failed', release, path });
        }
      });
  }, []);

  const installed = getInstalledAppVersionName();
  const progress =
    phase.kind === 'downloading' && phase.total > 0
      ? Math.min(1, phase.received / phase.total)
      : 0;

  return (
    <>
      <SettingsGroup title={t('updates.statusTitle', 'Update status')}>
        <View style={styles.status}>
          {phase.kind === 'checking' ? (
            <ActivityIndicator
              accessibilityLabel={t('updates.checking', 'Checking for updates…')}
              color={palette.accentSolid}
            />
          ) : null}
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {phase.kind === 'checking'
              ? t('updates.checking', 'Checking for updates…')
              : phase.kind === 'up-to-date'
                ? t('updates.upToDate', 'You’re on the latest version')
                : phase.kind === 'available'
                  ? t('updates.available', 'A new version is available')
                  : phase.kind === 'downloading'
                    ? t('updates.downloading', 'Downloading…')
                    : phase.kind === 'downloaded'
                      ? t('updates.downloaded', 'Downloaded — ready to install')
                    : phase.kind === 'download-failed'
                      ? t(
                          'updates.errorDownload',
                          'Couldn’t download the update. Check your connection and try again.',
                        )
                      : phase.kind === 'needs-permission'
                        ? t(
                            'updates.needsPermission',
                            'To install the update, allow صلاتي to install apps from this source, then tap Install again.',
                          )
                        : phase.kind === 'install-started'
                          ? t('updates.installStarted', 'Opening the installer…')
                          : phase.kind === 'install-failed'
                            ? t(
                                'updates.installFailed',
                                'The installer couldn’t be opened. Try again.',
                              )
                            : phase.reason === 'offline'
                              ? t(
                                  'updates.errorOffline',
                                  'You’re offline. Check your connection and try again.',
                                )
                              : phase.reason === 'no-apk'
                                ? t(
                                    'updates.errorNoApk',
                                    'The latest release has no install file.',
                                  )
                                : t(
                                    'updates.errorFetch',
                                    'Couldn’t check for updates.',
                                  )}
          </Text>
        </View>
        {phase.kind === 'download-failed' && phase.detail ? (
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {phase.detail}
          </Text>
        ) : null}
        <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
          {t('updates.currentVersion', 'Current version: {{version}}', {
            version: ltr(installed),
          })}
        </Text>
        {phase.kind === 'up-to-date' ? (
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('updates.latestVersion', 'Latest version: {{version}}', {
              version: ltr(phase.latestVersion),
            })}
          </Text>
        ) : null}
        {phase.kind === 'available' ||
        phase.kind === 'downloading' ||
        phase.kind === 'downloaded' ||
        phase.kind === 'download-failed' ||
        phase.kind === 'needs-permission' ||
        phase.kind === 'install-started' ||
        phase.kind === 'install-failed' ? (
          <Text style={[typeStyle('headline'), { color: palette.text }]}>
            {t('updates.newVersion', 'New version: {{version}}', {
              version: ltr(phase.release.version),
            })}
          </Text>
        ) : null}
        {phase.kind === 'downloading' ? (
          <View style={styles.progressWrap}>
            <View
              style={[styles.track, { backgroundColor: palette.border }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.round(progress * 100)}%`,
                    backgroundColor: palette.accentSolid,
                  },
                ]}
              />
            </View>
            <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
              {phase.total > 0
                ? `${mb(phase.received)} / ${mb(phase.total)}`
                : mb(phase.received)}
            </Text>
          </View>
        ) : null}
        {/* What's new, as the release wrote it. Plain text, not parsed
            markdown: a release body is a few short paragraphs, and the
            page scrolls. */}
        {phase.kind === 'available' && phase.release.notes ? (
          <View style={styles.notes}>
            <Text
              style={[typeStyle('footnote'), styles.notesTitle, { color: palette.muted }]}>
              {t('updates.whatsNew', 'What’s new')}
            </Text>
            <Text style={[typeStyle('body'), { color: palette.text }]}>
              {phase.release.notes}
            </Text>
          </View>
        ) : null}
      </SettingsGroup>

      <View style={styles.actions}>
        {phase.kind === 'available' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('updates.update', 'Update')}
            onPress={() => startDownload(phase.release)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: palette.accentBg },
              pressed ? styles.pressed : null,
            ]}>
            <Text
              style={[typeStyle('headline'), { color: palette.accentSolid }]}>
              {t('updates.update', 'Update')}
            </Text>
          </Pressable>
        ) : null}
        {phase.kind === 'downloading' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('updates.cancel', 'Cancel')}
            onPress={() => {
              cancelledRef.current = true;
            }}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: palette.border },
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[typeStyle('headline'), { color: palette.text }]}>
              {t('updates.cancel', 'Cancel')}
            </Text>
          </Pressable>
        ) : null}
        {phase.kind === 'download-failed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('updates.retry', 'Try again')}
            onPress={() => startDownload(phase.release)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: palette.accentBg },
              pressed ? styles.pressed : null,
            ]}>
            <Text
              style={[typeStyle('headline'), { color: palette.accentSolid }]}>
              {t('updates.retry', 'Try again')}
            </Text>
          </Pressable>
        ) : null}
        {phase.kind === 'downloaded' || phase.kind === 'install-failed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('updates.install', 'Install')}
            onPress={() => startInstall(phase.release, phase.path)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: palette.accentBg },
              pressed ? styles.pressed : null,
            ]}>
            <Text
              style={[typeStyle('headline'), { color: palette.accentSolid }]}>
              {t('updates.install', 'Install')}
            </Text>
          </Pressable>
        ) : null}
        {phase.kind === 'needs-permission' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('updates.openSettings', 'Open settings')}
              onPress={() => {
                void openInstallPermissionSettings();
              }}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: palette.accentBg },
                pressed ? styles.pressed : null,
              ]}>
              <Text
                style={[typeStyle('headline'), { color: palette.accentSolid }]}>
                {t('updates.openSettings', 'Open settings')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('updates.install', 'Install')}
              onPress={() => startInstall(phase.release, phase.path)}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: palette.border },
                pressed ? styles.pressed : null,
              ]}>
              <Text style={[typeStyle('headline'), { color: palette.text }]}>
                {t('updates.install', 'Install')}
              </Text>
            </Pressable>
          </>
        ) : null}
        {phase.kind === 'up-to-date' || phase.kind === 'error' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              phase.kind === 'error'
                ? t('updates.retry', 'Try again')
                : t('updates.checkNow', 'Check for update')
            }
            onPress={() => runCheck(true)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: palette.border },
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[typeStyle('headline'), { color: palette.text }]}>
              {phase.kind === 'error'
                ? t('updates.retry', 'Try again')
                : t('updates.checkNow', 'Check for update')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[typeStyle('footnote'), styles.footnote, { color: palette.muted }]}>
        {t('updates.installedLabel', 'Installed: {{version}}', {
          version: installedLabel,
        })}
      </Text>
    </>
  );
}

export const UpdatesCard = memo(UpdatesCardImpl);

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  notes: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  notesTitle: { fontWeight: '500' },
  progressWrap: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  track: {
    height: 6,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: RADIUS.full },
  actions: { gap: SPACING.sm, marginTop: SPACING.md },
  primary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: RADIUS.md,
  },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  footnote: { marginTop: SPACING.md, textAlign: 'center' },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
    fontWeight: '500',
  },
});
