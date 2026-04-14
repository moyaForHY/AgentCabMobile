import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View, Text, Pressable, Linking, TouchableOpacity } from 'react-native'
import Icon from 'react-native-vector-icons/Feather'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { colors, fontWeight as fw } from '../utils/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import TabIcon from '../components/TabIcon'
import { navigationRef } from './navigationRef'
import { storage } from '../services/storage'

import OnboardingScreen from '../screens/OnboardingScreen'
import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import DiscoverScreen from '../screens/DiscoverScreen'
import ProfileScreen from '../screens/ProfileScreen'
import WalletScreen from '../screens/WalletScreen'
import SkillDetailScreen from '../screens/SkillDetailScreen'
import TasksScreen from '../screens/TasksScreen'
import TaskResultScreen from '../screens/TaskResultScreen'
import AutomationsScreen from '../screens/AutomationsScreen'
import CreateAutomationScreen from '../screens/CreateAutomationScreen'
import ProviderScreen from '../screens/ProviderScreen'
import EmailVerifyScreen from '../screens/EmailVerifyScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const stackHeaderStyle = {
  backgroundColor: colors.white,
  shadowColor: 'rgba(37, 99, 235, 0.06)',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 1,
  shadowRadius: 4,
  elevation: 2,
}

const stackHeaderTitleStyle = {
  fontWeight: '700' as const,
  color: colors.ink950,
  fontSize: 17,
  letterSpacing: -0.3,
}

function MainTabs() {
  const { user } = useAuth()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 68,
          paddingBottom: 12,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#1d4ed8',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink500,
        tabBarLabelStyle: { fontSize: 10, fontWeight: fw.bold, marginTop: 2, letterSpacing: 0.1 },
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={route.name} focused={focused} color={color} />
        ),
        tabBarButton: (props: any) => (
          <Pressable
            {...props}
            android_ripple={{ color: 'transparent' }}
            style={[props.style, { opacity: 1 }]}
          />
        ),
      })}>
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: t.home,
          header: () => (
            <View style={[h.bar, { paddingTop: insets.top + 8 }]}>
              <Text style={h.greeting}>{t.hi}, {user?.name || 'there'}</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="DiscoverTab"
        component={DiscoverScreen}
        options={{ title: t.apis, header: () => null }}
      />
      <Tab.Screen
        name="TasksTab"
        component={TasksScreen}
        options={{ title: t.tasks, header: () => null }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: t.me,
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  )
}

const linking = {
  prefixes: ['https://www.agentcab.ai', 'agentcab://'],
  config: {
    screens: {
      SkillDetail: {
        path: 'skills/:skillId',
      },
    },
  },
}

function parseSkillId(url: string): string | null {
  try {
    // Handle https://www.agentcab.ai/skills/{id}
    const httpsMatch = url.match(/agentcab\.ai\/skills\/([^/?#]+)/)
    if (httpsMatch) return httpsMatch[1]
    // Handle agentcab://skill/{id}
    const customMatch = url.match(/agentcab:\/\/skill\/([^/?#]+)/)
    if (customMatch) return customMatch[1]
  } catch {}
  return null
}

export default function AppNavigator() {
  const { isLoggedIn, isLoading } = useAuth()
  const { t } = useI18n()
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  const handleDeepLink = (url: string) => {
    const skillId = parseSkillId(url)
    if (skillId && navigationRef.current) {
      (navigationRef.current.navigate as any)('SkillDetail', { skillId })
    }
  }

  useEffect(() => {
    storage.getStringAsync('onboarding_done').then(val => {
      setOnboardingDone(val === '1')
    })
  }, [])

  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url)
    })
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url))

    // Handle notification tap (intent extras with callId)
    const { NativeModules } = require('react-native')
    NativeModules.IntentModule?.getInitialIntent?.().then((extras: any) => {
      if (extras?.callId && extras?.navigate === 'TaskResult') {
        setTimeout(() => {
          (navigationRef.current?.navigate as any)?.('TaskResult', { taskId: extras.callId })
        }, 500)
      }
    }).catch(() => {})

    return () => sub.remove()
  }, [])

  if (isLoading || onboardingDone === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={({ navigation: nav }) => ({ headerShown: false, headerStyle: stackHeaderStyle, headerTitleStyle: stackHeaderTitleStyle, headerBackTitleVisible: false, headerLeft: nav.canGoBack() ? () => <TouchableOpacity onPress={() => nav.goBack()} style={{ paddingHorizontal: 8 }}><Icon name="arrow-left" size={22} color={colors.ink950} /></TouchableOpacity> : undefined, contentStyle: { backgroundColor: '#f8fafc' }, animation: 'ios_from_right' }) as any}>
        {!onboardingDone && (
          <Stack.Screen name="Onboarding">
            {(props: any) => <OnboardingScreen {...props} onDone={() => setOnboardingDone(true)} />}
          </Stack.Screen>
        )}
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="SkillDetail" component={SkillDetailScreen} options={{ headerShown: false, headerBackTitle: ' ' } as any} />
            <Stack.Screen name="TaskResult" component={TaskResultScreen} options={{ headerShown: true, title: t.result, headerBackTitle: ' ' } as any} />
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: true, title: t.wallet, headerBackTitle: ' ' } as any} />
            <Stack.Screen name="Automations" component={AutomationsScreen} options={{ headerShown: false, headerBackTitle: ' ' } as any} />
            <Stack.Screen name="CreateAutomation" component={CreateAutomationScreen} options={{ headerShown: false, headerBackTitle: ' ' } as any} />
            <Stack.Screen name="Provider" component={ProviderScreen} options={{ headerShown: true, title: '', headerBackTitle: ' ' } as any} />
            <Stack.Screen name="EmailVerify" component={EmailVerifyScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const h = {
  bar: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(37, 99, 235, 0.06)' as const,
  },
  greeting: {
    fontSize: 20,
    fontWeight: fw.bold as any,
    color: colors.ink950,
    letterSpacing: -0.5,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: fw.bold as any,
    color: colors.ink950,
    letterSpacing: -0.5,
  },
}
