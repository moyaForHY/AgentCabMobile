/**
 * HeadlessJS task for executing automations when the app is in the background.
 * This is registered in index.js and invoked by AutomationForegroundService on Android.
 */
import { AppRegistry } from 'react-native'
import { executeRule } from './automationService'

async function AutomationTask(taskData: { ruleId: string }) {
  if (taskData?.ruleId) {
    console.log('[AutomationTask] Executing rule:', taskData.ruleId)
    await executeRule(taskData.ruleId)
    console.log('[AutomationTask] Completed rule:', taskData.ruleId)
  }
}

AppRegistry.registerHeadlessTask('AutomationTask', () => AutomationTask)
