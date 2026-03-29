package com.agentcab

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.agentcab.photos.PhotoScannerPackage
import com.agentcab.filesystem.FileSystemPackage
import com.agentcab.contacts.ContactsPackage
import com.agentcab.calendar.CalendarPackage
import com.agentcab.applist.AppListPackage
import com.agentcab.notification.NotificationPackage
import com.agentcab.recorder.AudioRecorderPackage
import com.agentcab.screenshot.ScreenshotPackage
import com.agentcab.accessibility.AccessibilityPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here:
          add(PhotoScannerPackage())
          add(FileSystemPackage())
          add(ContactsPackage())
          add(CalendarPackage())
          add(AppListPackage())
          add(NotificationPackage())
          add(AudioRecorderPackage())
          add(ScreenshotPackage())
          add(AccessibilityPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
