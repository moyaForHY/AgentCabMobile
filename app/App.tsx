import React from 'react'
import { StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/hooks/useAuth'
import { I18nProvider } from './src/i18n'
import AppNavigator from './src/navigation/AppNavigator'
import ErrorBoundary from './src/components/ErrorBoundary'
import { AppModalRoot } from './src/components/AppModal'

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <I18nProvider>
          <AuthProvider>
            <AppNavigator />
            <AppModalRoot />
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
