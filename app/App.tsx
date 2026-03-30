import React, { useEffect } from 'react'
import { StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/hooks/useAuth'
import { I18nProvider } from './src/i18n'
import AppNavigator from './src/navigation/AppNavigator'
import ErrorBoundary from './src/components/ErrorBoundary'
import { AppModalRoot } from './src/components/AppModal'
import TaskNotification from './src/components/TaskNotification'
import { checkForUpdate } from './src/services/updateChecker'
import { initAutomationListener } from './src/services/automationService'

export default function App() {
  useEffect(() => {
    checkForUpdate()
    const cleanup = initAutomationListener()
    return cleanup
  }, [])

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <I18nProvider>
          <AuthProvider>
            <AppNavigator />
            <TaskNotification />
            <AppModalRoot />
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
