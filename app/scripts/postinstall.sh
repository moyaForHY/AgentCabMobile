#!/bin/bash
# Patch NativeEventEmitter to not crash on iOS when native module is null
FILE="node_modules/react-native/Libraries/EventEmitter/NativeEventEmitter.js"
if [ -f "$FILE" ]; then
  sed -i '' "s/if (Platform.OS === 'ios') {/if (Platform.OS === 'ios' \&\& nativeModule == null) {/" "$FILE"
  sed -i '' "s/invariant(/console.warn(/" "$FILE"
  sed -i '' "s/nativeModule != null,/'NativeEventEmitter was called with a null argument.',/" "$FILE"
  sed -i '' "/requires a non-null argument/d" "$FILE"
  echo "Patched NativeEventEmitter.js for iOS compatibility"
fi
