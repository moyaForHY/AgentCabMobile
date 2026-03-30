/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Register HeadlessJS task for background automation execution (Android)
import './src/services/automationHeadlessTask';

AppRegistry.registerComponent(appName, () => App);
