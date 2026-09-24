import { clipboard, BrowserWindow } from 'electron'

export class TaskExecutor {
  private runningTasks = new Map<string, boolean>()
  private mainWindow: BrowserWindow | null = null
  private onEndCallback?: (taskId: string) => void
  private onStopCallback?: (taskId: string) => void

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  setOnEndCallback(cb: (taskId: string) => void) {
    this.onEndCallback = cb
  }

  setOnStopCallback(cb: (taskId: string) => void) {
    this.onStopCallback = cb
  }

  async toggleTask(taskId: string, task: any) {
    if (this.runningTasks.get(taskId)) {
      this.stopTask(taskId)
    } else {
      try {
        await this.startTask(taskId, task)
      } catch (err) {
        console.error('[TaskExecutor] startTask error:', err)
        this.runningTasks.set(taskId, false)
        this.notify('ended', taskId, task.name)
      }
    }
  }

  private async startTask(taskId: string, task: any) {
    this.runningTasks.set(taskId, true)
    this.notify('started', taskId, task.name)

    const robot = require('robotjs')
    const taskMode = task.taskMode || 'comment'

    // 释放可能被按住的修饰键，避免 Ctrl+V 粘贴失败
    robot.keyToggle('control', 'up')
    robot.keyToggle('alt', 'up')
    robot.keyToggle('shift', 'up')
    await this.sleep(200)

    if (taskMode === 'mouse') {
      await this.runMouseMode(taskId, task, robot)
    } else if (taskMode === 'mixed') {
      await this.runMixedMode(taskId, task, robot)
    } else {
      await this.runCommentMode(taskId, task, robot)
    }

    // 仅当任务未被手动停止时才视为正常结束，触发结束回调（含联动）
    if (this.runningTasks.get(taskId)) {
      this.runningTasks.set(taskId, false)
      this.notify('ended', taskId, task.name)
      this.onEndCallback?.(taskId)
    }
  }

  private async runCommentMode(taskId: string, task: any, robot: any) {
    const bots = task.bots || []
    const allComments = task.commentItems || []
    const sendMode = task.sendMode || 'sequential'
    const commentCount = task.commentCount || 0
    const commentInterval = task.commentInterval || 500

    if (bots.length === 0 || allComments.length === 0) {
      return
    }

    const commentsToSend = this.buildCommentList(allComments, sendMode, commentCount)

    await this.sleep(500)
    await this.sendComments(taskId, commentsToSend, bots, commentInterval, robot)
  }

  private buildCommentList(allComments: any[], sendMode: string, commentCount: number): any[] {
    if (allComments.length === 1) {
      const repeatCount = commentCount > 0 ? commentCount : 1
      return Array(repeatCount).fill(allComments[0])
    }

    // 分离必发和非必发
    const mustSend = allComments.filter(c => c.mustSend)
    const nonMust = allComments.filter(c => !c.mustSend)

    if (sendMode === 'random') {
      // 随机打乱非必发
      for (let i = nonMust.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[nonMust[i], nonMust[j]] = [nonMust[j], nonMust[i]]
      }
    }

    // 合并：必发在前 + 非必发填充
    let result = [...mustSend, ...nonMust]

    if (commentCount > 0) {
      // 必发一定包含，剩余从非必发填充
      const remaining = Math.max(0, commentCount - mustSend.length)
      result = [...mustSend, ...nonMust.slice(0, remaining)]
    }

    return result
  }

  private async sendComments(taskId: string, comments: any[], bots: any[], commentInterval: number, robot: any) {
    for (let i = 0; i < comments.length; i++) {
      if (!this.runningTasks.get(taskId)) break

      const comment = comments[i]
      const bot = bots[i % bots.length]

      // 1. 复制评论内容到剪贴板
      clipboard.writeText(comment.content)
      await this.sleep(200)

      // 2. 移动鼠标到水军坐标并点击
      robot.moveMouse(bot.screenX, bot.screenY)
      await this.sleep(100)
      robot.mouseClick('left')
      await this.sleep(300)

      // 3. 粘贴 (Ctrl+V)
      robot.keyTap('v', 'control')
      await this.sleep(300)

      // 4. 按回车发送
      robot.keyTap('enter')

      // 5. 发送后的延迟：优先使用评论自身的延迟，否则使用默认间隔
      const delay = comment.delay ?? 0
      await this.sleep(delay > 0 ? delay : commentInterval)
    }
  }

  private async runMouseMode(taskId: string, task: any, robot: any) {
    const steps = task.operationSteps || []
    const operationMode = task.operationMode || 'once'

    if (steps.length === 0) {
      return
    }

    await this.sleep(500)

    if (operationMode === 'loop') {
      while (this.runningTasks.get(taskId)) {
        for (let i = 0; i < steps.length; i++) {
          if (!this.runningTasks.get(taskId)) break
          const step = steps[i]
          robot.moveMouse(step.x, step.y)
          await this.sleep(300)
          robot.mouseClick('left')
          await this.sleep(step.interval || task.operationInterval || 1000)
        }
      }
    } else {
      await this.execSteps(taskId, steps, task.operationInterval || 1000, robot)
    }
  }

  private async runMixedMode(taskId: string, task: any, robot: any) {
    const bots = task.bots || []
    const allComments = task.commentItems || []
    const sendMode = task.sendMode || 'sequential'
    const commentCount = task.commentCount || 0
    const commentInterval = task.commentInterval || 500
    const preSteps = task.preOperationSteps || []
    const postSteps = task.postOperationSteps || []

    await this.sleep(500)

    // 1. 执行评论前操作
    if (preSteps.length > 0) {
      await this.execSteps(taskId, preSteps, task.operationInterval || 1000, robot)
    }

    // 2. 执行发送评论
    if (bots.length > 0 && allComments.length > 0) {
      const commentsToSend = this.buildCommentList(allComments, sendMode, commentCount)
      await this.sendComments(taskId, commentsToSend, bots, commentInterval, robot)
    }

    // 3. 执行评论后操作
    if (postSteps.length > 0) {
      await this.execSteps(taskId, postSteps, task.operationInterval || 1000, robot)
    }
  }

  private async execSteps(taskId: string, steps: any[], defaultInterval: number, robot: any) {
    for (let i = 0; i < steps.length; i++) {
      if (!this.runningTasks.get(taskId)) break
      const step = steps[i]
      robot.moveMouse(step.x, step.y)
      await this.sleep(300)
      robot.mouseClick('left')
      await this.sleep(step.interval || defaultInterval)
    }
  }

  stopTask(taskId: string) {
    if (this.runningTasks.get(taskId)) {
      this.runningTasks.set(taskId, false)
      const taskName = this.getTaskName(taskId)
      this.notify('stopped', taskId, taskName)
      this.onStopCallback?.(taskId)
    }
  }

  stopAll() {
    for (const [taskId] of this.runningTasks) {
      this.stopTask(taskId)
    }
  }

  isRunning(taskId: string): boolean {
    return this.runningTasks.get(taskId) || false
  }

  private taskNames = new Map<string, string>()
  setTaskName(taskId: string, name: string) {
    this.taskNames.set(taskId, name)
  }
  private getTaskName(taskId: string): string {
    return this.taskNames.get(taskId) || ''
  }

  private notify(event: 'started' | 'stopped' | 'ended', taskId: string, taskName: string) {
    this.mainWindow?.webContents.send(`taskHotkey:${event}`, { taskId, taskName })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
