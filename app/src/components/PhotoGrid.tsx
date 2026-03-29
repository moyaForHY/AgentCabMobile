import React, { memo } from 'react'
import { View, Image, Text, FlatList, Dimensions, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import { colors, spacing, fontSize } from '../utils/theme'
import type { PhotoMeta } from '../services/photoScanner'

const SCREEN_WIDTH = Dimensions.get('window').width
const NUM_COLUMNS = 3
const GAP = 2
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS

type DateGroup = {
  date: string
  photos: PhotoMeta[]
}

type Props = {
  photos: PhotoMeta[]
  onPhotoPress?: (photo: PhotoMeta) => void
  onEndReached?: () => void
  ListHeaderComponent?: React.ReactElement
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>
}

function groupByDate(photos: PhotoMeta[]): DateGroup[] {
  const map = new Map<string, PhotoMeta[]>()
  for (const photo of photos) {
    const date = new Date(photo.dateAdded * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const group = map.get(date) || []
    group.push(photo)
    map.set(date, group)
  }
  return Array.from(map.entries()).map(([date, photos]) => ({ date, photos }))
}

const PhotoItem = memo(({ photo, onPress }: { photo: PhotoMeta; onPress?: () => void }) => (
  <TouchableOpacity style={styles.photoItem} onPress={onPress} activeOpacity={0.8}>
    <Image
      source={{ uri: photo.uri }}
      style={styles.photoImage}
      resizeMode="cover"
    />
  </TouchableOpacity>
))

function DateSection({ group, onPhotoPress }: { group: DateGroup; onPhotoPress?: (p: PhotoMeta) => void }) {
  return (
    <View>
      <Text style={styles.dateHeader}>{group.date}</Text>
      <View style={styles.grid}>
        {group.photos.map(photo => (
          <PhotoItem
            key={photo.id}
            photo={photo}
            onPress={() => onPhotoPress?.(photo)}
          />
        ))}
      </View>
    </View>
  )
}

export default function PhotoGrid({ photos, onPhotoPress, onEndReached, ListHeaderComponent, refreshControl }: Props) {
  const groups = groupByDate(photos)

  return (
    <FlatList
      data={groups}
      keyExtractor={item => item.date}
      renderItem={({ item }) => (
        <DateSection group={item} onPhotoPress={onPhotoPress} />
      )}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={ListHeaderComponent}
      refreshControl={refreshControl}
      contentContainerStyle={styles.container}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.lg,
  },
  dateHeader: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GAP / 2,
  },
  photoItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: GAP / 2,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.border,
  },
})
