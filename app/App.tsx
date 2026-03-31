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
import PrivacyAgreement from './src/components/PrivacyAgreement'
import { checkForUpdate } from './src/services/updateChecker'
import { initAutomationListener } from './src/services/automationService'
import { scanPendingTasks, initTaskCheckListener } from './src/services/taskPoller'
import SplashScreen from './src/screens/SplashScreen'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  useEffect(() => {
    if (!privacyAccepted) return
    // Only init services after privacy is accepted
    import('react-native').then(({ PermissionsAndroid, Platform }) => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {})
      }
    })
    checkForUpdate()
    initTaskCheckListener()
    scanPendingTasks()
    const cleanup = initAutomationListener()
    return cleanup
  }, [privacyAccepted])

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />
  }

  if (!privacyAccepted) {
    return (
      <ErrorBoundary>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" />
          <PrivacyAgreement onAccepted={() => setPrivacyAccepted(true)} />
        </SafeAreaProvider>
      </ErrorBoundary>
    )
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
