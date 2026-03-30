import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View, Text, Pressable, StatusBar } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n'
import { colors, fontWeight as fw } from '../utils/theme'
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

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const STATUS_BAR_HEIGHT = StatusBar.currentHeight || 44

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

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#1d4ed8',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: { fontSize: 10, fontWeight: fw.semibold, marginTop: 2 },
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
            <View style={h.bar}>
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
          header: () => (
            <View style={h.bar}>
              <Text style={h.pageTitle}>{user?.name || t.me}</Text>
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  const { isLoggedIn, isLoading } = useAuth()
  const { t } = useI18n()
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  useEffect(() => {
    storage.getStringAsync('onboarding_done').then(val => {
      setOnboardingDone(val === '1')
    })
  }, [])

  if (isLoading || onboardingDone === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, headerStyle: stackHeaderStyle, headerTitleStyle: stackHeaderTitleStyle }}>
        {!onboardingDone && (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        )}
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="SkillDetail" component={SkillDetailScreen} options={{ headerShown: true, title: t.apiDetail }} />
            <Stack.Screen name="TaskResult" component={TaskResultScreen} options={{ headerShown: true, title: t.result }} />
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: true, title: t.wallet }} />
            <Stack.Screen name="Automations" component={AutomationsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CreateAutomation" component={CreateAutomationScreen} options={{ headerShown: false }} />
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
    paddingTop: STATUS_BAR_HEIGHT + 8,
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
