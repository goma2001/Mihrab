/**
 * Typed wrapper for the AppUpdate native module.
 *
 * Installs a downloaded APK through the system installer — Android will
 * not install from a `file://` URI, so the module hands the file over as
 * a FileProvider content URI. See `android/.../AppUpdateModule.kt`.
 */
import { NativeModules } from 'react-native';

export interface AppUpdateInterface {
  /**
   * Start the system installer for the APK at `path`. Resolves
   * `'started'`, or `'needs-permission'` on Android 8 and up when
   * "install unknown apps" is off for this app. Rejects when the file is
   * missing, empty, or not an APK.
   */
  installApk(path: string): Promise<'started' | 'needs-permission'>;
  /** False on Android 8 and up until "install unknown apps" is allowed. */
  canRequestPackageInstalls(): Promise<boolean>;
  /** Open the system's "install unknown apps" setting for this app. */
  openInstallPermissionSettings(): Promise<void>;
}

export const AppUpdateModule =
  NativeModules.AppUpdate as AppUpdateInterface | undefined;
