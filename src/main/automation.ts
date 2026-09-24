import * as robot from 'robotjs'
import { TaskStep, StepType } from '../shared/types'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function yieldToLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

export class AutomationEngine {
  private cardId: string
  private onComplete: () => void
  private paused = false
  private stopped = false
  private steps: TaskStep[] = []
  private currentIndex = 0

  constructor(cardId: string, onComplete: () => void) {
    this.cardId = cardId
    this.onComplete = onComplete
  }

  setSteps(steps: TaskStep[]) {
    this.steps = steps
  }

  start() {
    this.stopped = false
    this.paused = false
    this.currentIndex = 0
    this.executeLoop()
  }

  pause() {
    this.paused = true
  }

  resume() {
    this.paused = false
  }

  stop() {
    this.stopped = true
    this.paused = false
  }

  private async executeLoop() {
    while (!this.stopped && this.currentIndex < this.steps.length) {
      // 检查点：暂停时挂起
      while (this.paused && !this.stopped) {
        await sleep(100)
      }
      if (this.stopped) break

      const step = this.steps[this.currentIndex]
      this.executeStepSync(step)
      this.currentIndex++
      await yieldToLoop()
    }

    if (!this.stopped) {
      this.onComplete()
    }
  }

  private executeStepSync(step: TaskStep) {
    try {
      switch (step.type) {
        case StepType.DELAY:
          robot.setKeyboardDelay(step.ms ?? 1000)
          break

        case StepType.KEY_PRESS:
          if (step.key) {
            robot.keyToggle(step.key, 'down')
          }
          break

        case StepType.KEY_RELEASE:
          if (step.key) {
            robot.keyToggle(step.key, 'up')
          }
          break

        case StepType.MOUSE_CLICK:
          if (step.x !== undefined && step.y !== undefined) {
            robot.moveMouse(step.x, step.y)
            robot.mouseClick()
          }
          break

        case StepType.STEP_JUMP:
          if (step.target !== undefined && step.target >= 0 && step.target < this.steps.length) {
            this.currentIndex = step.target - 1
          }
          break

        case StepType.LOG_PRINT:
          console.log(`[${this.cardId}] ${step.message ?? ''}`)
          break
      }
    } catch (err) {
      console.error(`[${this.cardId}] Step ${this.currentIndex} failed:`, err)
    }
  }
}