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
import SplashScreen from './src/screens/SplashScreen'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    checkForUpdate()
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
