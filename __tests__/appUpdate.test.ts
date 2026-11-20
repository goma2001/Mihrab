/**
 * In-app app updates — the release payload, the comparison, the check,
 * the download, the install.
 *
 * The rule this pins: an update is offered, never imposed. The check
 * never throws, a pre-release is never newer, and the download is only
 * ever started by the Update button — so the pure parts (parsing,
 * comparison) are pinned without a network, and the networked parts
 * against a mocked fetch.
 */
const mockVersion: { versionName?: string; buildNumber?: string } = {
  versionName: '1.0.2',
  buildNumber: '3',
};
jest.mock('../src/native/AppVersion', () => ({
  get AppVersionModule() {
    return mockVersion;
  },
}));

const mockAppUpdateModule: {
  installApk?: jest.Mock;
  canRequestPackageInstalls?: jest.Mock;
  openInstallPermissionSettings?: jest.Mock;
} = {};
jest.mock('../src/native/AppUpdate', () => ({
  get AppUpdateModule() {
    return Object.keys(mockAppUpdateModule).length > 0
      ? mockAppUpdateModule
      : undefined;
  },
}));

let mockFiles = new Map<string, number>();
let mockTaskStatus = 200;
let mockDownloadSize = 1024 * 1024;
let mockFetchFailures = 0;
let mockFetchCalls: Array<{
  url: string;
  headers?: Record<string, string>;
}> = [];
let mockRangeSupported = true;
let mockDownloadSizes: number[] = [];
let mockInterruptAfter: number | null = null;
let mockConfigOptions: Record<string, unknown> = {};

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { DocumentDir: '/mock/documents', CacheDir: '/mock/cache' },
      exists: jest.fn(async (path: string) => mockFiles.has(path)),
      mkdir: jest.fn(async (path: string) => {
        mockFiles.set(path, 0);
      }),
      stat: jest.fn(async (path: string) => {
        if (!mockFiles.has(path)) throw new Error('ENOENT');
        return { size: mockFiles.get(path), path };
      }),
      unlink: jest.fn(async (path: string) => {
        mockFiles.delete(path);
      }),
    },
    config: jest.fn((options: Record<string, unknown>) => {
      mockConfigOptions = options;
      return {
        fetch: jest.fn(
          (
            _method: string,
            url: string,
            headers?: Record<string, string>,
          ) => {
            mockFetchCalls.push({ url, headers });
            const path =
              (mockConfigOptions.path as string) ??
              '/mock/cache/updates/Salaty-v1.0.3.apk';
            const range = headers?.Range as string | undefined;
            // A Range the server honours answers 206; one it ignores
            // answers 200 with the whole file.
            const status =
              range && mockRangeSupported && mockTaskStatus === 200
                ? 206
                : mockTaskStatus;
            let progressCb: ((r: number, t: number) => void) | null = null;
            let rejectTask!: (e: unknown) => void;
            // The cancel watchdog's tick (500 ms) beats the download's
            // 600 ms timer: without this the timer would fire after the
            // test ended and write into the next test's files.
            let wasCancelled = false;
            const task: Record<string, unknown> = {
              progress: jest.fn(
                (_opts: unknown, cb: (r: number, t: number) => void) => {
                  progressCb = cb;
                  return task;
                },
              ),
              cancel: jest.fn(() => {
                wasCancelled = true;
                rejectTask(new Error('cancelled'));
              }),
              info: () => ({ status }),
            };
            if (mockFetchFailures > 0) {
              mockFetchFailures -= 1;
              const failed = Promise.reject(
                new Error('Network request failed'),
              );
              task.then = failed.then.bind(failed);
              task.catch = failed.catch.bind(failed);
              task.finally = failed.finally.bind(failed);
              return task;
            }
            const response = { info: () => ({ status }) };
            const done = new Promise(resolve => {
              // A real download takes longer than the cancel watchdog's
              // 500 ms tick; resolve after 600 ms so a cancellation asked
              // for up front reaches the task before it finishes. The task
              // resolves to a response, not to itself: a thenable that
              // resolves to itself never settles.
              setTimeout(() => {
                if (wasCancelled) return;
                // An error answer carries no APK: nothing is written.
                if (status !== 200 && status !== 206) {
                  resolve(response);
                  return;
                }
                const bytes =
                  mockDownloadSizes.length > 0
                    ? mockDownloadSizes.shift()!
                    : mockDownloadSize;
                const existing = mockFiles.get(path) ?? 0;
                // The native layer appends when the config says not to
                // overwrite (a resume) or the answer is a 206; a fresh
                // 200 overwrites.
                const append =
                  status === 206 || mockConfigOptions.overwrite === false;
                if (mockInterruptAfter !== null) {
                  // The stream is cut mid-file: the bytes that arrived
                  // stay in the file, and the task fails — the native
                  // "Download interrupted." the user saw on 1.0.6.
                  const cut = mockInterruptAfter;
                  mockInterruptAfter = null;
                  mockFiles.set(path, append ? existing + cut : cut);
                  progressCb?.(cut, cut);
                  rejectTask(new Error('Download interrupted'));
                  return;
                }
                mockFiles.set(path, append ? existing + bytes : bytes);
                progressCb?.(bytes, bytes);
                resolve(response);
              }, 600);
            });
            const cancelled = new Promise<never>((_resolve, reject) => {
              rejectTask = reject;
            });
            const raced = Promise.race([done, cancelled]);
            task.then = raced.then.bind(raced);
            task.catch = raced.catch.bind(raced);
            task.finally = raced.finally.bind(raced);
            return task;
          },
        ),
      };
    }),
  },
}));

import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  _resetAppUpdateForTests,
  apkAssetName,
  checkForUpdate,
  downloadApk,
  installApk,
  isNewerRelease,
  parseReleasePayload,
  type ReleaseInfo,
} from '../src/updates/appUpdate';

const RELEASE_1_0_3 = {
  tag_name: 'v1.0.3',
  draft: false,
  prerelease: false,
  body: 'New in 1.0.3: updates from inside the app.',
  assets: [
    {
      name: 'Salaty-v1.0.3.apk',
      browser_download_url:
        'https://github.com/goma2001/salaty/releases/download/v1.0.3/Salaty-v1.0.3.apk',
    },
  ],
};

const originalFetch = global.fetch;

beforeEach(() => {
  _resetAppUpdateForTests();
  // The installer is Android-only, and Jest runs as iOS by default.
  Platform.OS = 'android';
  mockFiles = new Map();
  mockTaskStatus = 200;
  mockDownloadSize = 1024 * 1024;
  mockFetchFailures = 0;
  mockFetchCalls = [];
  mockRangeSupported = true;
  mockDownloadSizes = [];
  mockInterruptAfter = null;
  mockConfigOptions = {};
  mockVersion.versionName = '1.0.2';
  mockVersion.buildNumber = '3';
  delete mockAppUpdateModule.installApk;
  delete mockAppUpdateModule.canRequestPackageInstalls;
  delete mockAppUpdateModule.openInstallPermissionSettings;
  jest.clearAllMocks();
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchJson(payload: unknown, status = 200): void {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe('parseReleasePayload', () => {
  it('reads the tag, the APK asset and the notes', () => {
    expect(parseReleasePayload(RELEASE_1_0_3)).toEqual({
      version: '1.0.3',
      apkUrl:
        'https://github.com/goma2001/salaty/releases/download/v1.0.3/Salaty-v1.0.3.apk',
      notes: 'New in 1.0.3: updates from inside the app.',
    });
  });

  it('is null for a draft, a pre-release, or a -beta tag', () => {
    expect(parseReleasePayload({ ...RELEASE_1_0_3, draft: true })).toBeNull();
    expect(
      parseReleasePayload({ ...RELEASE_1_0_3, prerelease: true }),
    ).toBeNull();
    expect(
      parseReleasePayload({ ...RELEASE_1_0_3, tag_name: 'v1.0.3-beta' }),
    ).toBeNull();
  });

  it('is null without a tag, without an APK asset, or without an object', () => {
    expect(parseReleasePayload({ ...RELEASE_1_0_3, tag_name: 3 })).toBeNull();
    expect(parseReleasePayload({ ...RELEASE_1_0_3, assets: [] })).toBeNull();
    expect(
      parseReleasePayload({
        ...RELEASE_1_0_3,
        assets: [{ name: 'something-else.apk', browser_download_url: 'x' }],
      }),
    ).toBeNull();
    expect(parseReleasePayload(null)).toBeNull();
    expect(parseReleasePayload('v1.0.3')).toBeNull();
  });

  it('names the asset after the tag, not after any APK', () => {
    expect(apkAssetName('1.0.3')).toBe('Salaty-v1.0.3.apk');
    expect(
      parseReleasePayload({
        ...RELEASE_1_0_3,
        assets: [
          {
            name: 'Salaty-v1.0.2.apk',
            browser_download_url: 'https://example.invalid/old.apk',
          },
        ],
      }),
    ).toBeNull();
  });

  it('reads the asset size when the payload carries it', () => {
    expect(
      parseReleasePayload({
        ...RELEASE_1_0_3,
        assets: [
          {
            name: 'Salaty-v1.0.3.apk',
            browser_download_url:
              'https://github.com/goma2001/salaty/releases/download/v1.0.3/Salaty-v1.0.3.apk',
            size: 61240263,
          },
        ],
      }),
    ).toEqual({
      version: '1.0.3',
      apkUrl:
        'https://github.com/goma2001/salaty/releases/download/v1.0.3/Salaty-v1.0.3.apk',
      notes: 'New in 1.0.3: updates from inside the app.',
      size: 61240263,
    });
    expect(parseReleasePayload(RELEASE_1_0_3)).not.toHaveProperty('size');
  });
});

describe('isNewerRelease', () => {
  const release: ReleaseInfo = {
    version: '1.0.3',
    apkUrl: 'https://example.invalid/Salaty-v1.0.3.apk',
    notes: '',
  };
  it('is newer only when the tag is ahead of the installed version', () => {
    expect(isNewerRelease(release, '1.0.2')).toBe(true);
    expect(isNewerRelease(release, '1.0.3')).toBe(false);
    expect(isNewerRelease(release, '1.0.4')).toBe(false);
    // A beta of the same version has seen what that version has to say.
    expect(isNewerRelease(release, '1.0.3-beta')).toBe(false);
    expect(isNewerRelease(release, '1.0.2-beta')).toBe(true);
  });
});

describe('checkForUpdate', () => {
  it('reports an update when the release is newer', async () => {
    mockFetchJson(RELEASE_1_0_3);
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'available',
      installed: '1.0.2',
      latest: {
        version: '1.0.3',
        apkUrl:
          'https://github.com/goma2001/salaty/releases/download/v1.0.3/Salaty-v1.0.3.apk',
        notes: 'New in 1.0.3: updates from inside the app.',
      },
    });
  });

  it('reports up-to-date when the release is the installed version', async () => {
    mockFetchJson({ ...RELEASE_1_0_3, tag_name: 'v1.0.2', assets: [
      {
        name: 'Salaty-v1.0.2.apk',
        browser_download_url:
          'https://github.com/goma2001/salaty/releases/download/v1.0.2/Salaty-v1.0.2.apk',
      },
    ] });
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'up-to-date',
      installed: '1.0.2',
      latestVersion: '1.0.2',
    });
  });

  it('does not fetch when offline', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'error',
      installed: '1.0.2',
      reason: 'offline',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports no-apk when the release has no APK asset', async () => {
    mockFetchJson({ ...RELEASE_1_0_3, assets: [] });
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'error',
      installed: '1.0.2',
      reason: 'no-apk',
    });
  });

  it('never throws: a failed request is an error result', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('Network request failed');
    }) as unknown as typeof fetch;
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'error',
      installed: '1.0.2',
      reason: 'fetch-failed',
    });
  });

  it('caches the result, and a forced check asks again', async () => {
    mockFetchJson(RELEASE_1_0_3);
    await checkForUpdate();
    await checkForUpdate();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await checkForUpdate({ force: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('downloadApk', () => {
  const release: ReleaseInfo = {
    version: '1.0.3',
    apkUrl: 'https://example.invalid/Salaty-v1.0.3.apk',
    notes: '',
  };
  it('downloads to the cache and reports progress', async () => {
    const seen: Array<[number, number]> = [];
    const path = await downloadApk(
      release,
      (received, total) => seen.push([received, total]),
      () => false,
    );
    expect(path).toBe('/mock/cache/updates/Salaty-v1.0.3.apk');
    expect(mockFiles.get(path)).toBe(1024 * 1024);
    expect(seen[0]).toEqual([0, 0]);
  });

  it('throws on a non-200 response and on an empty file', async () => {
    mockTaskStatus = 404;
    await expect(
      downloadApk(release, () => {}, () => false),
    ).rejects.toThrow('HTTP 404');
    mockTaskStatus = 200;
    mockDownloadSize = 0;
    await expect(
      downloadApk(release, () => {}, () => false),
    ).rejects.toThrow('empty file');
  });

  it('creates the updates directory before downloading', async () => {
    const path = await downloadApk(release, () => {}, () => false);
    expect(ReactNativeBlobUtil.fs.mkdir).toHaveBeenCalledWith(
      '/mock/cache/updates',
    );
    expect(path).toBe('/mock/cache/updates/Salaty-v1.0.3.apk');
  });

  it('retries once on a network failure, then succeeds', async () => {
    mockFetchFailures = 1;
    const path = await downloadApk(release, () => {}, () => false);
    expect(path).toBe('/mock/cache/updates/Salaty-v1.0.3.apk');
    expect(ReactNativeBlobUtil.config).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404: the answer will only repeat itself', async () => {
    mockTaskStatus = 404;
    await expect(
      downloadApk(release, () => {}, () => false),
    ).rejects.toThrow('HTTP 404');
    expect(ReactNativeBlobUtil.config).toHaveBeenCalledTimes(1);
  });

  it('throws when the downloaded size does not match the release', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    // The fresh fetch is short, and the resumed fetch is short too, so
    // the file never reaches the release size.
    mockDownloadSizes = [512 * 1024, 100 * 1024];
    await expect(
      downloadApk(sized, () => {}, () => false),
    ).rejects.toThrow('size mismatch');
    // A truncated transfer is retried once before it is reported.
    expect(ReactNativeBlobUtil.config).toHaveBeenCalledTimes(2);
  });

  it('accepts the download when the size matches the release', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    const path = await downloadApk(sized, () => {}, () => false);
    expect(path).toBe('/mock/cache/updates/Salaty-v1.0.3.apk');
  });

  it('cancels when the caller asks', async () => {
    await expect(
      downloadApk(release, () => {}, () => true),
    ).rejects.toThrow('cancelled');
  });

  it('resumes an interrupted download from the partial file', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    const path = '/mock/cache/updates/Salaty-v1.0.3.apk';
    mockFiles.set(path, 512 * 1024);
    mockDownloadSize = 512 * 1024;
    const seen: Array<[number, number]> = [];
    const out = await downloadApk(
      sized,
      (received, total) => seen.push([received, total]),
      () => false,
    );
    expect(out).toBe(path);
    expect(mockFiles.get(path)).toBe(1024 * 1024);
    // The Range asks for only the missing tail.
    expect(mockFetchCalls).toHaveLength(1);
    expect(mockFetchCalls[0].headers).toEqual({
      Range: 'bytes=524288-',
    });
    // Progress counts what is already on disk: no jump back to zero.
    expect(seen[0]).toEqual([512 * 1024, 1024 * 1024]);
    expect(seen).toContainEqual([1024 * 1024, 1024 * 1024]);
  });

  it('the retry resumes from where the first attempt stopped', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    mockDownloadSize = 512 * 1024;
    // The first fetch is cut halfway — the 1.0.6 failure — and the
    // retry picks up from the bytes that arrived, not from zero.
    mockInterruptAfter = 512 * 1024;
    const out = await downloadApk(sized, () => {}, () => false);
    expect(out).toBe('/mock/cache/updates/Salaty-v1.0.3.apk');
    expect(mockFiles.get('/mock/cache/updates/Salaty-v1.0.3.apk')).toBe(
      1024 * 1024,
    );
    expect(mockFetchCalls).toHaveLength(2);
    expect(mockFetchCalls[0].headers).toBeUndefined();
    expect(mockFetchCalls[1].headers).toEqual({
      Range: 'bytes=524288-',
    });
  });

  it('restarts from zero when the server ignores the Range', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    const path = '/mock/cache/updates/Salaty-v1.0.3.apk';
    mockFiles.set(path, 512 * 1024);
    mockRangeSupported = false;
    mockDownloadSize = 1024 * 1024;
    const out = await downloadApk(sized, () => {}, () => false);
    expect(out).toBe(path);
    expect(mockFiles.get(path)).toBe(1024 * 1024);
    expect(mockFetchCalls).toHaveLength(2);
    expect(mockFetchCalls[0].headers).toEqual({
      Range: 'bytes=524288-',
    });
    expect(mockFetchCalls[1].headers).toBeUndefined();
  });

  it('discards a partial larger than the release and downloads fresh', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    const path = '/mock/cache/updates/Salaty-v1.0.3.apk';
    mockFiles.set(path, 2 * 1024 * 1024);
    mockDownloadSize = 1024 * 1024;
    const out = await downloadApk(sized, () => {}, () => false);
    expect(out).toBe(path);
    expect(mockFiles.get(path)).toBe(1024 * 1024);
    expect(mockFetchCalls).toHaveLength(1);
    expect(mockFetchCalls[0].headers).toBeUndefined();
  });

  it('returns at once when the partial is already the whole release', async () => {
    const sized: ReleaseInfo = { ...release, size: 1024 * 1024 };
    const path = '/mock/cache/updates/Salaty-v1.0.3.apk';
    mockFiles.set(path, 1024 * 1024);
    const out = await downloadApk(sized, () => {}, () => false);
    expect(out).toBe(path);
    expect(ReactNativeBlobUtil.config).not.toHaveBeenCalled();
  });

  it('does not resume without a known release size', async () => {
    const path = '/mock/cache/updates/Salaty-v1.0.3.apk';
    mockFiles.set(path, 512 * 1024);
    mockDownloadSize = 1024 * 1024;
    const out = await downloadApk(release, () => {}, () => false);
    expect(out).toBe(path);
    expect(mockFiles.get(path)).toBe(1024 * 1024);
    expect(mockFetchCalls[0].headers).toBeUndefined();
  });
});

describe('installApk', () => {
  it('is unavailable without the native module', async () => {
    await expect(installApk('/mock/cache/updates/Salaty-v1.0.3.apk')).resolves.toBe(
      'unavailable',
    );
  });

  it('passes the native outcome through', async () => {
    mockAppUpdateModule.installApk = jest.fn(async () => 'needs-permission');
    await expect(installApk('/mock/cache/updates/Salaty-v1.0.3.apk')).resolves.toBe(
      'needs-permission',
    );
    expect(mockAppUpdateModule.installApk).toHaveBeenCalledWith(
      '/mock/cache/updates/Salaty-v1.0.3.apk',
    );
  });
});
