package com.goma.salat

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream

/**
 * Installs a downloaded APK through the system installer.
 *
 * Android will not install from a `file://` URI, and the downloaded APK
 * lives in this app's private cache, so the file is handed over as a
 * FileProvider content URI the installer is granted read access to
 * (`${packageName}.updates`, scoped to `cache/updates/` in
 * update_paths.xml). Only ever called after the user taps Install in
 * Settings → Updates — nothing here downloads or installs on its own.
 *
 * The file is checked before the installer is offered it: it must exist,
 * be non-empty, and start with the ZIP magic (`PK\x03\x04`) — an APK is
 * a ZIP, and a 404 page saved as `.apk` is not.
 */
class AppUpdateModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun installApk(path: String, promise: Promise) {
    try {
      val file = File(path)
      if (!file.isFile || file.length() <= 0L) {
        promise.reject("E_NO_FILE", "APK not found or empty: $path")
        return
      }
      FileInputStream(file).use { stream ->
        val magic = ByteArray(4)
        if (stream.read(magic) != 4 || !magic.contentEquals(ZIP_MAGIC)) {
          promise.reject("E_NOT_APK", "File is not an APK: $path")
          return
        }
      }
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !reactApplicationContext.packageManager.canRequestPackageInstalls()
      ) {
        // Android 8 and up: "install unknown apps" is off for this app.
        // The caller explains and opens the setting; the user taps
        // Install again after allowing it.
        promise.resolve("needs-permission")
        return
      }
      val uri = FileProvider.getUriForFile(
        reactApplicationContext,
        "${reactApplicationContext.packageName}.updates",
        file,
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve("started")
    } catch (e: Exception) {
      promise.reject("E_INSTALL", e.message, e)
    }
  }

  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    promise.resolve(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.packageManager.canRequestPackageInstalls()
      } else {
        true
      },
    )
  }

  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${reactApplicationContext.packageName}"),
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_SETTINGS", e.message, e)
    }
  }

  companion object {
    const val NAME = "AppUpdate"

    /** The first four bytes of a ZIP — and of every APK. */
    private val ZIP_MAGIC = byteArrayOf(0x50, 0x4B, 0x03, 0x04)
  }
}
