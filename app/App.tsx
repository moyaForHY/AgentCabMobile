import React, { useEffect, useState } from 'react'
import { StatusBar, Linking } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/hooks/useAuth'
import { I18nProvider } from './src/i18n'
import AppNavigator from './src/navigation/AppNavigator'
import ErrorBoundary from './src/components/ErrorBoundary'
import { AppModalRoot } from './src/components/AppModal'
import TaskNotification from './src/components/TaskNotification'
import NetworkBanner from './src/components/NetworkBanner'
import { checkForUpdate } from './src/services/updateChecker'
import { initAutomationListener } from './src/services/automationService'
import { scanPendingTasks } from './src/services/taskPoller'
import SplashScreen from './src/screens/SplashScreen'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    // Request notification permission on Android 13+
    import('react-native').then(({ PermissionsAndroid, Platform }) => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {})
      }
    })
    checkForUpdate()
    scanPendingTasks()
    const cleanup = initAutomationListener()
    return cleanup
  }, [])

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <I18nProvider>
          <AuthProvider>
            <AppNavigator />
            <NetworkBanner />
            <TaskNotification />
            <AppModalRoot />
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
