import { useState, useEffect } from 'react'
import { taskManager, type SkillTask } from '../services/taskManager'

export function useTasks() {
  const [tasks, setTasks] = useState<SkillTask[]>(taskManager.getTasks())

  useEffect(() => {
    return taskManager.subscribe(setTasks)
  }, [])

  return {
    tasks,
    runningTasks: tasks.filter(t => t.status === 'running'),
    completedTasks: tasks.filter(t => t.status === 'completed'),
    failedTasks: tasks.filter(t => t.status === 'failed'),
    removeTask: (id: string) => taskManager.removeTask(id),
    clearCompleted: () => taskManager.clearCompleted(),
  }
}
