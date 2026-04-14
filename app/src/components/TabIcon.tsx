import React from 'react'
import { View, StyleSheet } from 'react-native'
import { colors } from '../utils/theme'

type Props = {
  name: string
  focused: boolean
  color: string
}

/**
 * Custom tab icons using pure View shapes (no emoji, no SVG dependency).
 */
export default function TabIcon({ name, focused, color }: Props) {
  const opacity = focused ? 1 : 0.4

  switch (name) {
    case 'HomeTab':
      return <HomeIcon color={color} opacity={opacity} />
    case 'ChatTab':
      return <ChatIcon color={color} opacity={opacity} />
    case 'DiscoverTab':
      return <SearchIcon color={color} opacity={opacity} />
    case 'TasksTab':
      return <TaskIcon color={color} opacity={opacity} />
    case 'ProfileTab':
      return <ProfileIcon color={color} opacity={opacity} />
    default:
      return <View style={[s.dot, { backgroundColor: color, opacity }]} />
  }
}

function HomeIcon({ color, opacity }: { color: string; opacity: number }) {
  return (
    <View style={[s.iconWrap, { opacity }]}>
      {/* House shape */}
      <View style={[s.triangle, { borderBottomColor: color }]} />
      <View style={[s.rect, { backgroundColor: color, width: 16, height: 10, borderRadius: 2 }]} />
    </View>
  )
}

function ChatIcon({ color, opacity }: { color: string; opacity: number }) {
  return (
    <View style={[s.iconWrap, { opacity }]}>
      <View style={[s.chatBubble, { borderColor: color }]}>
        <View style={[s.chatDots, { gap: 3 }]}>
          <View style={[s.chatDot, { backgroundColor: color }]} />
          <View style={[s.chatDot, { backgroundColor: color }]} />
          <View style={[s.chatDot, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  )
}

function SearchIcon({ color, opacity }: { color: string; opacity: number }) {
  return (
    <View style={[s.iconWrap, { opacity }]}>
      <View style={[s.searchCircle, { borderColor: color }]} />
      <View style={[s.searchHandle, { backgroundColor: color }]} />
    </View>
  )
}

function TaskIcon({ color, opacity }: { color: string; opacity: number }) {
  return (
    <View style={[s.iconWrap, { opacity }]}>
      <View style={{ gap: 3 }}>
        <View style={[s.taskLine, { backgroundColor: color, width: 16 }]} />
        <View style={[s.taskLine, { backgroundColor: color, width: 12 }]} />
        <View style={[s.taskLine, { backgroundColor: color, width: 14 }]} />
      </View>
    </View>
  )
}

function ProfileIcon({ color, opacity }: { color: string; opacity: number }) {
  return (
    <View style={[s.iconWrap, { opacity }]}>
      <View style={[s.profileHead, { backgroundColor: color }]} />
      <View style={[s.profileBody, { backgroundColor: color }]} />
    </View>
  )
}

const s = StyleSheet.create({
  iconWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Home
  triangle: {
    width: 0,
    height: 0,
    borderStartWidth: 10,
    borderEndWidth: 10,
    borderBottomWidth: 8,
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
    marginBottom: -1,
  },
  rect: {},
  // Chat
  chatBubble: {
    width: 20,
    height: 16,
    borderWidth: 2,
    borderRadius: 8,
    borderBottomLeftRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatDots: {
    flexDirection: 'row',
  },
  chatDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
  },
  // Search
  searchCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    position: 'absolute',
    top: 2,
    left: 2,
  },
  searchHandle: {
    width: 6,
    height: 2.5,
    borderRadius: 1,
    position: 'absolute',
    bottom: 4,
    right: 3,
    transform: [{ rotate: '45deg' }],
  },
  // Task
  taskLine: {
    height: 2.5,
    borderRadius: 1.25,
  },
  // Profile
  profileHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  profileBody: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
})
