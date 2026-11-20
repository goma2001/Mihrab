/**
 * In-app app updates, from GitHub Releases.
 *
 * There was no updater in the app: a new version reached a phone through
 * Obtainium or a manual download from the releases page. This is the one
 * that lives inside the app instead — Settings → Updates.
 *
 * The shape of it:
 *  - `checkForUpdate()` reads the latest release from the GitHub API and
 *    compares its tag with the installed version. It never throws: a
 *    phone offline, a failed request, or a release with no APK asset all
 *    come back as an `error` result, and the caller decides what to show.
 *  - The check runs quietly once per launch (Home, after onboarding) and
 *    its result is cached, so the Updates screen shows it at once without
 *    asking again; the screen's own button forces a fresh check.
 *  - Nothing downloads or installs on its own. The download starts only
 *    on the Update button, and the install only on the Install button
 *    after it. The standing rule is the user's: an update is offered,
 *    never imposed.
 *  - The install itself is native (`AppUpdateModule`): Android will not
 *    install an APK from a `file://` URI, so the file is handed to the
 *    system installer through a FileProvider content URI.
 *
 * Host: `api.github.com` — listed in PRIVACY_POLICY.md, like every host
 * the code names (`__tests__/networkHosts.test.ts` fails otherwise).
 * Sent: only the request itself, which carries the IP address. No
 * account, no identifier, no version is sent with it.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { getInstalledAppVersionName } from '../appVersion';
import { compareVersions } from '../polish/releaseNotes';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { quiet } from '../utils/quiet';
import { AppUpdateModule } from '../native/AppUpdate';

/** The latest release that is not a draft and not a pre-release. */
export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/goma2001/Mihrab/releases/latest';

/** How long a check result is trusted before the screen asks again. */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** The APK asset of a release: `Salaty-v1.0.3.apk`. */
export function apkAssetName(version: string): string {
  return `Salaty-v${version}.apk`;
}

export type ReleaseInfo = {
  /** The version without the leading `v`: `1.0.3`. */
  version: string;
  /** `browser_download_url` of the APK asset. */
  apkUrl: string;
  /** The release body — what is new, as the release wrote it. */
  notes: string;
  /** The asset's size in bytes, when the release payload carries it. */
  size?: number;
};

export type UpdateCheckResult =
  | { status: 'up-to-date'; installed: string; latestVersion: string }
  | { status: 'available'; installed: string; latest: ReleaseInfo }
  | {
      status: 'error';
      installed: string;
      reason: 'offline' | 'no-apk' | 'fetch-failed';
    };

/**
 * The release payload, or null when it is not a release this app can
 * install: no tag, no APK asset, a draft, or a pre-release. A pre-release
 * tag never counts as newer — a beta of 1.0.4 is not an update to 1.0.3.
 *
 * Pure, so the shape of a GitHub payload can be pinned without a network
 * mock.
 */
export function parseReleasePayload(payload: unknown): ReleaseInfo | null {
  if (!payload || typeof payload !== 'object') return null;
  const { tag_name, assets, body, draft, prerelease } = payload as {
    tag_name?: unknown;
    assets?: unknown;
    body?: unknown;
    draft?: unknown;
    prerelease?: unknown;
  };
  if (draft === true || prerelease === true) return null;
  if (typeof tag_name !== 'string') return null;
  const version = tag_name.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+/.test(version)) return null;
  // A `-beta` (or any suffix after the numbers) is a pre-release build of
  // that version, not a newer release: never offered as an update.
  if (/^\d+\.\d+\.\d+-/.test(version)) return null;
  if (!Array.isArray(assets)) return null;
  const apk = assets.find(
    (a): a is {
      name: string;
      browser_download_url: string;
      size?: unknown;
    } =>
      !!a &&
      typeof a === 'object' &&
      (a as { name?: unknown }).name === apkAssetName(version) &&
      typeof (a as { browser_download_url?: unknown })
        .browser_download_url === 'string',
  );
  if (!apk) return null;
  const size =
    typeof apk.size === 'number' && apk.size > 0 ? apk.size : undefined;
  return {
    version,
    apkUrl: apk.browser_download_url,
    notes: typeof body === 'string' ? body : '',
    ...(size !== undefined ? { size } : {}),
  };
}

/** True when the release is newer than what is installed. Pure. */
export function isNewerRelease(
  release: ReleaseInfo,
  installed: string,
): boolean {
  return compareVersions(release.version, installed) > 0;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const installed = getInstalledAppVersionName();
  const res = await fetchWithRetry(
    LATEST_RELEASE_URL,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Salaty/${installed} (+https://github.com/goma2001/Mihrab)`,
      },
    },
    { maxAttempts: 2, timeoutMs: 7000 },
  );
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
  return parseReleasePayload(await res.json());
}

// ------------------------------------------------------- cached check

let cached: { at: number; result: UpdateCheckResult } | null = null;
let inFlight: Promise<UpdateCheckResult> | null = null;
const listeners = new Set<(result: UpdateCheckResult) => void>();

function publish(result: UpdateCheckResult): void {
  cached = { at: Date.now(), result };
  for (const fn of listeners) fn(result);
}

/** The last check, if one ran and is still fresh enough to show. */
export function getCachedCheck(): UpdateCheckResult | null {
  if (!cached || Date.now() - cached.at > CACHE_TTL_MS) return null;
  return cached.result;
}

/** Re-render when a check lands. Test seam: `_resetAppUpdateForTests`. */
export function subscribeToUpdateCheck(
  fn: (result: UpdateCheckResult) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The check, cached for half an hour and shared between the quiet launch
 * run and the Updates screen. Never throws — every failure is an `error`
 * result, because a caller that has to catch is a caller that can crash
 * a launch over a network it does not have.
 */
export function checkForUpdate(options?: {
  force?: boolean;
}): Promise<UpdateCheckResult> {
  if (!options?.force) {
    const hit = getCachedCheck();
    if (hit) return Promise.resolve(hit);
    if (inFlight) return inFlight;
  }
  inFlight = runCheck().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runCheck(): Promise<UpdateCheckResult> {
  const installed = getInstalledAppVersionName();
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) {
      const result: UpdateCheckResult = {
        status: 'error',
        installed,
        reason: 'offline',
      };
      publish(result);
      return result;
    }
    const release = await fetchLatestRelease();
    if (!release) {
      const result: UpdateCheckResult = {
        status: 'error',
        installed,
        reason: 'no-apk',
      };
      publish(result);
      return result;
    }
    const result: UpdateCheckResult = isNewerRelease(release, installed)
      ? { status: 'available', installed, latest: release }
      : {
          status: 'up-to-date',
          installed,
          latestVersion: release.version,
        };
    publish(result);
    return result;
  } catch (error) {
    quiet('updates/appUpdate', error);
    const result: UpdateCheckResult = {
      status: 'error',
      installed,
      reason: 'fetch-failed',
    };
    publish(result);
    return result;
  }
}

/**
 * The quiet launch check: once, on Android, after onboarding, only when
 * online — and silent whatever happens. It exists so the Updates screen
 * already knows when it is opened, and so the Settings row can say a
 * newer version is there. It never downloads, never installs, never
 * interrupts.
 */
export function quietLaunchUpdateCheck(): void {
  if (Platform.OS !== 'android') return;
  void checkForUpdate().catch(error => quiet('updates/appUpdate', error));
}

/** The release the launch check (or the screen) found, if any. */
export function useAvailableUpdate(): ReleaseInfo | null {
  const [release, setRelease] = useState<ReleaseInfo | null>(() => {
    const c = getCachedCheck();
    return c?.status === 'available' ? c.latest : null;
  });
  useEffect(
    () =>
      subscribeToUpdateCheck(result => {
        setRelease(result.status === 'available' ? result.latest : null);
      }),
    [],
  );
  return release;
}

// ------------------------------------------------------------ download

/**
 * What a failed download says about itself, so the card can tell a
 * network blip from a server answer — and so a transient failure can
 * be tried once more instead of being shown as a check that never
 * happened. The message carries the reason (an HTTP status, the sizes
 * that did not match) for the card to show under the error.
 */
export class ApkDownloadError extends Error {
  readonly kind: 'http' | 'empty' | 'size-mismatch' | 'network';
  readonly status?: number;
  constructor(
    kind: ApkDownloadError['kind'],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'ApkDownloadError';
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

/**
 * A failure worth one more attempt: a network blip, a truncated file,
 * or a server-side 5xx (or a 429). A 4xx answer will only repeat
 * itself, and a cancelled download is not a failure at all.
 */
function isRetryableDownloadError(error: unknown): boolean {
  if (!(error instanceof ApkDownloadError)) return false;
  if (
    error.kind === 'network' ||
    error.kind === 'empty' ||
    error.kind === 'size-mismatch'
  ) {
    return true;
  }
  if (error.kind === 'http') {
    const status = error.status ?? 0;
    return status === 429 || status >= 500;
  }
  return false;
}

async function attemptDownload(
  release: ReleaseInfo,
  path: string,
  onProgress: (received: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<string> {
  onProgress(0, 0);
  const task = ReactNativeBlobUtil.config({
    path,
    overwrite: true,
  }).fetch('GET', release.apkUrl);
  let watchdog: ReturnType<typeof setInterval> | null = null;
  try {
    task.progress({ interval: 250 }, (received, total) => {
      onProgress(Number(received) || 0, Number(total) || 0);
    });
    watchdog = setInterval(() => {
      if (shouldCancel()) task.cancel();
    }, 500);
    let res;
    try {
      res = await task;
    } catch (error) {
      if (shouldCancel()) throw error;
      throw new ApkDownloadError(
        'network',
        `APK download: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const status = res.info().status;
    if (status !== 200) {
      throw new ApkDownloadError(
        'http',
        `APK download: HTTP ${status}`,
        status,
      );
    }
    const stat = await ReactNativeBlobUtil.fs.stat(path).catch(() => null);
    if (!stat || Number(stat.size) <= 0) {
      throw new ApkDownloadError('empty', 'APK download: empty file');
    }
    const size = Number(stat.size);
    if (
      typeof release.size === 'number' &&
      release.size > 0 &&
      size !== release.size
    ) {
      throw new ApkDownloadError(
        'size-mismatch',
        `APK download: size mismatch (received ${size}, expected ${release.size})`,
      );
    }
    onProgress(size, size);
    return path;
  } finally {
    if (watchdog) clearInterval(watchdog);
  }
}

/**
 * Download the release's APK into the app's cache, reporting progress
 * in bytes. Throws on a non-200 response, an empty file, a size that
 * does not match the release, or a cancelled download. A transient
 * failure — a network blip, a truncated file, a 5xx — is tried once
 * more before it is reported, so one dropped connection on a 61 MB
 * file does not end the update. The file is checked again, natively,
 * before the installer is offered it — see `AppUpdateModule`.
 */
export async function downloadApk(
  release: ReleaseInfo,
  onProgress: (received: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<string> {
  const dirs = ReactNativeBlobUtil.fs.dirs;
  const dir = `${dirs.CacheDir}/updates`;
  const path = `${dir}/${apkAssetName(release.version)}`;
  // react-native-blob-util writes to the configured path but does not
  // create its parent: without this the first download on a fresh
  // install throws before a byte moves.
  if (!(await ReactNativeBlobUtil.fs.exists(dir))) {
    await ReactNativeBlobUtil.fs.mkdir(dir);
  }
  let lastError: unknown = new Error('APK download: failed');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await attemptDownload(release, path, onProgress, shouldCancel);
    } catch (error) {
      lastError = error;
      if (
        attempt === 0 &&
        !shouldCancel() &&
        isRetryableDownloadError(error)
      ) {
        continue;
      }
      break;
    }
  }
  throw lastError;
}

// ------------------------------------------------------------- install

export type InstallOutcome = 'started' | 'needs-permission' | 'unavailable';

/**
 * Hand the downloaded APK to the system installer. `needs-permission`
 * is Android 8 and up when "install unknown apps" is off for this app —
 * the caller explains and opens the setting. Throws when the file itself
 * is not an installable APK.
 */
export async function installApk(path: string): Promise<InstallOutcome> {
  if (Platform.OS !== 'android' || !AppUpdateModule) return 'unavailable';
  return AppUpdateModule.installApk(path);
}

/** Open the system's "install unknown apps" setting for this app. */
export async function openInstallPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android' || !AppUpdateModule) return;
  try {
    await AppUpdateModule.openInstallPermissionSettings();
  } catch (error) {
    quiet('updates/appUpdate', error);
  }
}

/** Tests: a new process. */
export function _resetAppUpdateForTests(): void {
  cached = null;
  inFlight = null;
  listeners.clear();
}
