import React from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'

type Props = {
  svg: string
  width?: number
  height?: number
}

export default function SvgIllustration({ svg, width = 280, height = 240 }: Props) {
  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=${width},initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;overflow:hidden}html,body{width:${width}px;height:${height}px;background:transparent;display:flex;align-items:center;justify-content:center}</style>
</head><body>${svg}</body></html>`

  return (
    <View style={{ width, height, overflow: 'hidden' }} pointerEvents="none">
      <WebView
        source={{ html }}
        style={{ width, height, backgroundColor: 'transparent', opacity: 0.99 }}
        scrollEnabled={false}
        overScrollMode="never"
        javaScriptEnabled={false}
        originWhitelist={['*']}
      />
    </View>
  )
}
