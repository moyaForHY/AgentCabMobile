/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// Headless task for executing automations when app is not in foreground
AppRegistry.registerHeadlessTask('AutomationHeadlessTask', () => async (taskData) => {
  const { executeRule } = require('./src/services/automationService');
  const ruleId = taskData?.ruleId;
  if (ruleId) {
    await executeRule(ruleId);
  }
});
