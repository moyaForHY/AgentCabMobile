/**
 * Task Manager
 * Manages async skill call lifecycle: submit → poll → complete/fail.
 * Persists task state to MMKV so tasks survive app restarts.
 */
import { fetchCall, type Skill } from './api'
import { storage } from './storage'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export type SkillTask = {
  id: string            // call_id from AgentCab
  skillId: string
  skillName: string
  status: TaskStatus
  input: Record<string, any>
  output?: any
  outputFiles?: Array<{ id: string; filename: string; mime_type: string }>
  errorMessage?: string
  creditsCost: number
  actualCost?: number
  createdAt: number     // timestamp
  completedAt?: number
}

type TaskListener = (tasks: SkillTask[]) => void

const TASKS_STORAGE_KEY = 'agentcab_tasks'
const POLL_INTERVAL_MS = 5000
const MAX_POLL_DURATION_MS = 10 * 60 * 1000 // 10 minutes

class TaskManager {
  private tasks: SkillTask[] = []
  private listeners: Set<TaskListener> = new Set()
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map()

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage() {
    try {
      const raw = storage.getString(TASKS_STORAGE_KEY)
      if (raw) {
        this.tasks = JSON.parse(raw)
        // Resume polling for running tasks
        this.tasks
          .filter(t => t.status === 'running' || t.status === 'pending')
          .forEach(t => this.startPolling(t.id))
      }
    } catch {
      this.tasks = []
    }
  }

  private saveToStorage() {
    storage.setString(TASKS_STORAGE_KEY, JSON.stringify(this.tasks))
  }

  private notify() {
    this.listeners.forEach(fn => fn([...this.tasks]))
  }

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener)
    listener([...this.tasks])
    return () => this.listeners.delete(listener)
  }

  getTasks(): SkillTask[] {
    return [...this.tasks]
  }

  getTask(id: string): SkillTask | undefined {
    return this.tasks.find(t => t.id === id)
  }

  /**
   * Register a new skill call as a tracked task.
   */
  addTask(callId: string, skill: Skill, input: Record<string, any>, creditsCost: number): SkillTask {
    const task: SkillTask = {
      id: callId,
      skillId: skill.id,
      skillName: skill.name,
      status: 'running',
      input,
      creditsCost,
      createdAt: Date.now(),
    }
    this.tasks.unshift(task)
    this.saveToStorage()
    this.notify()
    this.startPolling(callId)
    return task
  }

  /**
   * Mark a task as immediately completed (for sync calls).
   */
  completeTask(callId: string, output: any, actualCost?: number) {
    const task = this.tasks.find(t => t.id === callId)
    if (!task) return
    task.status = 'completed'
    task.output = output
    task.actualCost = actualCost
    task.completedAt = Date.now()
    this.stopPolling(callId)
    this.saveToStorage()
    this.notify()
  }

  /**
   * Poll AgentCab API for task completion.
   */
  private startPolling(callId: string) {
    if (this.pollTimers.has(callId)) return

    const startTime = Date.now()
    const timer = setInterval(async () => {
      // Timeout: stop polling after MAX_POLL_DURATION
      if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
        this.failTask(callId, 'Timeout: task took too long')
        return
      }

      try {
        const result = await fetchCall(callId)
        const task = this.tasks.find(t => t.id === callId)
        if (!task) {
          this.stopPolling(callId)
          return
        }

        if (result.status === 'completed') {
          task.status = 'completed'
          task.output = result.output_data || result.output
          task.outputFiles = result.output_files
          task.actualCost = result.actual_cost ?? undefined
          task.completedAt = Date.now()
          this.stopPolling(callId)
          this.saveToStorage()
          this.notify()
        } else if (result.status === 'failed') {
          task.status = 'failed'
          task.errorMessage = result.error_message || 'Task failed'
          task.completedAt = Date.now()
          this.stopPolling(callId)
          this.saveToStorage()
          this.notify()
        }
      } catch {
        // Network error — keep polling
      }
    }, POLL_INTERVAL_MS)

    this.pollTimers.set(callId, timer)
  }

  private stopPolling(callId: string) {
    const timer = this.pollTimers.get(callId)
    if (timer) {
      clearInterval(timer)
      this.pollTimers.delete(callId)
    }
  }

  private failTask(callId: string, message: string) {
    const task = this.tasks.find(t => t.id === callId)
    if (!task) return
    task.status = 'failed'
    task.errorMessage = message
    task.completedAt = Date.now()
    this.stopPolling(callId)
    this.saveToStorage()
    this.notify()
  }

  /**
   * Remove a task from history.
   */
  removeTask(callId: string) {
    this.stopPolling(callId)
    this.tasks = this.tasks.filter(t => t.id !== callId)
    this.saveToStorage()
    this.notify()
  }

  /**
   * Clear all completed/failed tasks.
   */
  clearCompleted() {
    this.tasks = this.tasks.filter(t => t.status === 'running' || t.status === 'pending')
    this.saveToStorage()
    this.notify()
  }

  destroy() {
    this.pollTimers.forEach(timer => clearInterval(timer))
    this.pollTimers.clear()
    this.listeners.clear()
  }
}

// Singleton
export const taskManager = new TaskManager()
