import { app, BrowserWindow, ipcMain, dialog, globalShortcut, clipboard, Menu } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import Store from 'electron-store'
import { ShortcutManager } from './shortcutManager'
import { TaskManager } from './taskManager'
import { TaskExecutor } from './taskExecutor'
import { IPC_CHANNELS, ShortcutAction, TaskStep, AppSettings } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let lastExportDir: string | null = null
let shortcutManager: ShortcutManager
let taskManager: TaskManager
let taskExecutor: TaskExecutor
let captureWindow: BrowserWindow | null = null
let captureInterval: ReturnType<typeof setInterval> | null = null
let captureDone = false
const captureAccels = new Set<string>()
function cleanupCaptureShortcuts() {
  for (const accel of captureAccels) {
    try { globalShortcut.unregister(accel) } catch {}
  }
  captureAccels.clear()
}

function sanitizeTaskFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'task'
}

let hotkeysSuspended = false
let linkageGeneration = 0
const linkedTaskIds = new Set<string>()
// 通知函数由 setupIPC 初始化时注入，供任务结束等主进程回调调用
let showTaskNotifyFn: ((message: string, type?: 'success' | 'warning' | 'error') => void) | null = null

const DEFAULT_GROUP_ID = 'group-default'
let activeGroupId = DEFAULT_GROUP_ID
// 快捷键启用分组：现在直接存储一个 interGroupId，表示哪套互动分组的快捷键生效
let shortcutGroupId = ''

function collectValidLinked(task: any) {
  const tasks = taskStore.get('tasks')
  const out: { taskId: string; name: string; delay: number }[] = []
  if (!task || !task.linkageEnabled || !task.linkedTasks || task.linkedTasks.length === 0) return out
  for (const lt of task.linkedTasks) {
    const linked = tasks.find((t: any) => t.id === lt.taskId)
    if (!linked || linked.isDraft || !linked.hotkey) continue
    out.push({ taskId: lt.taskId, name: linked.name, delay: lt.delay ?? 0 })
  }
  return out
}

// 主任务启动时立即填充「待运行」列表：仅当配置了有效联动任务才显示
function prefillPending(taskId: string) {
  const task = taskStore.get('tasks').find((t: any) => t.id === taskId)
  const valid = collectValidLinked(task)
  pendingTaskNames.length = 0
  for (const v of valid) pendingTaskNames.push(v.name)
  updatePendingOverlay()
}

function triggerTask(taskId: string) {
  if (hotkeysSuspended) return
  const tasks = taskStore.get('tasks')
  const task = tasks.find((t: any) => t.id === taskId)
  if (!task) return
  // 快捷键守卫：任务的互动分组需与「启用分组」选中的 interGroupId 一致，且任务启用时才触发
  if (!shortcutGroupId) return
  if (task.interGroupId !== shortcutGroupId) return
  if (task.enabled === false) return
  const wasRunning = taskExecutor.isRunning(taskId)
  if (wasRunning) {
    // 主任务被手动停止（toggle 停止），中断联动、清空待运行
    linkageGeneration++
    pendingTaskNames.length = 0
    updatePendingOverlay()
  } else {
    // 主任务启动时：清空残留待运行，并按配置立即填充「待运行」（仅有关联任务时显示）
    pendingTaskNames.length = 0
    prefillPending(taskId)
  }
  taskExecutor.setTaskName(taskId, task.name)
  taskExecutor.toggleTask(taskId, task)
}

// ===== 纯修饰键热键系统（globalShortcut 不支持纯修饰键组合如 左Alt+左Ctrl） =====
const { uIOhook: uIOhookInst, UiohookKey } = require('uiohook-napi')
const modifierKeyNames = new Set(['Ctrl', '左Ctrl', '右Ctrl', 'Alt', '左Alt', '右Alt', 'Shift', '左Shift', '右Shift'])
const modifierToKeyCode: Record<string, number> = {
  'Ctrl': UiohookKey.Ctrl, '左Ctrl': UiohookKey.Ctrl, '右Ctrl': UiohookKey.CtrlRight,
  'Alt': UiohookKey.Alt, '左Alt': UiohookKey.Alt, '右Alt': UiohookKey.AltRight,
  'Shift': UiohookKey.Shift, '左Shift': UiohookKey.Shift, '右Shift': UiohookKey.ShiftRight,
}
const numpadToKeyCode: Record<string, number> = {
  'num 0': UiohookKey.Numpad0, 'num 1': UiohookKey.Numpad1, 'num 2': UiohookKey.Numpad2,
  'num 3': UiohookKey.Numpad3, 'num 4': UiohookKey.Numpad4, 'num 5': UiohookKey.Numpad5,
  'num 6': UiohookKey.Numpad6, 'num 7': UiohookKey.Numpad7, 'num 8': UiohookKey.Numpad8,
  'num 9': UiohookKey.Numpad9,
  'num *': UiohookKey.NumpadMultiply, 'num +': UiohookKey.NumpadAdd,
  'num -': UiohookKey.NumpadSubtract, 'num .': UiohookKey.NumpadDecimal,
  'num /': UiohookKey.NumpadDivide, 'num Enter': UiohookKey.NumpadEnter,
}
const pressedModifiers = new Set<number>()
const modifierHotkeys = new Map<string, number[]>()
const modifierHotkeyTriggered = new Set<string>()
let uiohookForModifier = false
let captureActive = false

function parseHotkeyParts(hotkey: string): string[] {
  const PLACEHOLDER = '\x00NUMADD\x00'
  const normalized = hotkey.replace(/num \+/g, PLACEHOLDER)
  return normalized.split('+').map((s: string) => s.trim().replace(PLACEHOLDER, 'num +')).filter(Boolean)
}

function isModifierOnlyHotkey(hotkey: string): boolean {
  if (!hotkey) return false
  const parts = parseHotkeyParts(hotkey)
  return parts.length >= 1 && parts.every((p: string) => modifierKeyNames.has(p))
}

function containsNumpadKey(hotkey: string): boolean {
  return Object.keys(numpadToKeyCode).some(k => hotkey.includes(k))
}

function isUiohookHotkey(hotkey: string): boolean {
  return isModifierOnlyHotkey(hotkey) || containsNumpadKey(hotkey)
}

function hotkeyToKeyCodes(hotkey: string): number[] {
  const parts = parseHotkeyParts(hotkey)
  return parts.map(p => {
    if (modifierToKeyCode[p]) return modifierToKeyCode[p]
    if (numpadToKeyCode[p]) return numpadToKeyCode[p]
    return 0
  }).filter(Boolean)
}

function modifierKeydownHandler(e: any) {
  pressedModifiers.add(e.keycode)
  for (const [taskId, requiredKeys] of modifierHotkeys) {
    if (modifierHotkeyTriggered.has(taskId)) continue
    if (requiredKeys.every(k => pressedModifiers.has(k))) {
      modifierHotkeyTriggered.add(taskId)
      triggerTask(taskId)
    }
  }
}

function modifierKeyupHandler(e: any) {
  pressedModifiers.delete(e.keycode)
  for (const [taskId, requiredKeys] of modifierHotkeys) {
    if (!requiredKeys.every(k => pressedModifiers.has(k))) {
      modifierHotkeyTriggered.delete(taskId)
    }
  }
}

function ensureUiohookForModifier() {
  if (!uiohookForModifier) {
    uIOhookInst.on('keydown', modifierKeydownHandler)
    uIOhookInst.on('keyup', modifierKeyupHandler)
    try { uIOhookInst.start() } catch {}
    uiohookForModifier = true
  }
}

function cleanupUiohookForModifier() {
  if (captureActive) return
  if (uiohookForModifier && modifierHotkeys.size === 0) {
    uIOhookInst.off('keydown', modifierKeydownHandler)
    uIOhookInst.off('keyup', modifierKeyupHandler)
    try { uIOhookInst.stop() } catch {}
    uiohookForModifier = false
  }
}

function safeStopUiohook() {
  captureActive = false
  const { uIOhook } = require('uiohook-napi')
  try { uIOhook.stop() } catch {}
  try {
    uIOhook.removeAllListeners('keydown')
    uIOhook.removeAllListeners('keyup')
    uIOhook.removeAllListeners('mousedown')
  } catch {}
  if (modifierHotkeys.size > 0) {
    uIOhook.on('keydown', modifierKeydownHandler)
    uIOhook.on('keyup', modifierKeyupHandler)
    try { uIOhook.start() } catch {}
    pressedModifiers.clear()
    modifierHotkeyTriggered.clear()
    uiohookForModifier = true
  } else {
    uiohookForModifier = false
  }
}

const appSettingsStore = new Store<{ settings: AppSettings }>({
  defaults: {
    settings: {
      fontSize: 14,
      pointerHotkey: '鼠标右键',
    },
  },
})

const taskStore = new Store<{ tasks: any[] }>({
  name: 'tasks',
  defaults: { tasks: [] },
})

const botStore = new Store<{ bots: any[] }>({
  name: 'bots',
  defaults: { bots: [] },
})

const commentStore = new Store<{ comments: any[]; sendMode: string; sendInterval: number }>({
  name: 'comments',
  defaults: { comments: [], sendMode: 'sequential', sendInterval: 2000 },
})

const groupStore = new Store<{ groups: { id: string; name: string; color: string }[]; activeGroupId: string; shortcutGroupId: string }>({
  name: 'groups',
  defaults: { groups: [], activeGroupId: '', shortcutGroupId: '' },
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'AutoZK - 拒绝重复，从我做起',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    // 开发模式反复加载会在会话里累积 localhost cookie，请求头过大时 vite 会返回 431 导致白屏，
    // 加载前先清理 cookie，避免请求头膨胀
    mainWindow.webContents.session.clearStorageData({ storages: ['cookies'] })
      .catch(() => {})
      .finally(() => mainWindow!.loadURL('http://localhost:5173'))
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ===== 运行中 & 待运行任务悬浮窗 =====
let runningOverlay: BrowserWindow | null = null
const runningTaskNames: string[] = []
let pendingOverlay: BrowserWindow | null = null
const pendingTaskNames: string[] = []

function calcOverlayHeight(taskNames: string[], headerText: string) {
  const itemHeight = 22
  const headerHeight = 22
  const padding = 12
  const borderWidth = 2
  const gapHeight = taskNames.length * 2
  const h = headerHeight + taskNames.length * itemHeight + gapHeight + padding + borderWidth
  const allTexts = [headerText, ...taskNames.map(n => n.length > 3 ? n.slice(0, 3) + '...' : n)]
  const maxLen = Math.max(...allTexts.map(t => t.length))
  const w = Math.max(maxLen * 16 + 16, 80)
  return { h, w, itemHeight }
}

function repositionOverlays() {
  const { screen } = require('electron')
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const margin = 12
  const notifyH = 60
  const overlayGap = 8

  const runningH = runningTaskNames.length > 0 ? calcOverlayHeight(runningTaskNames, '运行中').h : 0
  const pendingH = pendingTaskNames.length > 0 ? calcOverlayHeight(pendingTaskNames, '待运行').h : 0
  const totalH = runningH + (runningH > 0 && pendingH > 0 ? overlayGap : 0) + pendingH

  // 通知弹窗最多同时 2 个（MAX_NOTIFY），预留 2 个通知的高度，避免遮挡运行中/待运行悬浮窗
  const baseY = screenHeight - 2 * (notifyH + margin) - margin - totalH
  const runningW = runningTaskNames.length > 0 ? calcOverlayHeight(runningTaskNames, '运行中').w : 0
  const pendingW = pendingTaskNames.length > 0 ? calcOverlayHeight(pendingTaskNames, '待运行').w : 0
  const maxW = Math.max(runningW, pendingW, 80)

  const x = screenWidth - maxW - margin

  let curY = baseY
  if (runningOverlay && !runningOverlay.isDestroyed() && runningTaskNames.length > 0) {
    runningOverlay.setBounds({ x, y: curY, width: maxW, height: runningH })
    curY += runningH + overlayGap
  }
  if (pendingOverlay && !pendingOverlay.isDestroyed() && pendingTaskNames.length > 0) {
    pendingOverlay.setBounds({ x, y: curY, width: maxW, height: pendingH })
  }
}

function buildOverlayHtml(taskNames: string[], headerText: string, headerColor: string, bgColor: string, borderColor: string, itemHeight: number) {
  const items = taskNames.map(name => {
    const display = name.length > 3 ? name.slice(0, 3) + '...' : name
    return `<div class="task-item">${display}</div>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
    .container {
      background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px;
      padding: 6px 8px; width: 100%; height: 100%;
      font-family: 'Microsoft YaHei', sans-serif; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .header { color: ${headerColor}; font-size: 13px; font-weight: 700; width: 100%; text-align: center; padding-bottom: 2px; border-bottom: 1px solid ${borderColor}66; }
    .task-item { color: ${headerColor}; font-size: 14px; font-weight: 600; line-height: ${itemHeight}px; white-space: nowrap; text-align: center; }
  </style></head><body>
    <div class="container">
      <div class="header">${headerText}</div>
      ${items}
    </div>
  </body></html>`
}

function updateRunningOverlay() {
  if (runningTaskNames.length === 0) {
    if (runningOverlay && !runningOverlay.isDestroyed()) {
      runningOverlay.close()
    }
    runningOverlay = null
    repositionOverlays()
    return
  }

  const { h, w, itemHeight } = calcOverlayHeight(runningTaskNames, '运行中')
  const html = buildOverlayHtml(runningTaskNames, '运行中', '#67c23a', '#f0f9eb', '#67c23a', itemHeight)

  if (!runningOverlay || runningOverlay.isDestroyed()) {
    runningOverlay = new BrowserWindow({
      width: w, height: h, x: 0, y: 0,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, resizable: false, focusable: false,
      hasShadow: false, backgroundColor: '#00000000',
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    runningOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    runningOverlay.once('ready-to-show', () => {
      if (!runningOverlay || runningOverlay.isDestroyed()) return
      repositionOverlays()
      runningOverlay.showInactive()
    })
  } else {
    runningOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    repositionOverlays()
  }
}

function updatePendingOverlay() {
  if (pendingTaskNames.length === 0) {
    if (pendingOverlay && !pendingOverlay.isDestroyed()) {
      pendingOverlay.close()
    }
    pendingOverlay = null
    repositionOverlays()
    return
  }

  const { h, w, itemHeight } = calcOverlayHeight(pendingTaskNames, '待运行')
  const html = buildOverlayHtml(pendingTaskNames, '待运行', '#e6a23c', '#fdf6ec', '#e6a23c', itemHeight)

  if (!pendingOverlay || pendingOverlay.isDestroyed()) {
    pendingOverlay = new BrowserWindow({
      width: w, height: h, x: 0, y: 0,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, resizable: false, focusable: false,
      hasShadow: false, backgroundColor: '#00000000',
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    pendingOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    pendingOverlay.once('ready-to-show', () => {
      if (!pendingOverlay || pendingOverlay.isDestroyed()) return
      repositionOverlays()
      pendingOverlay.showInactive()
    })
  } else {
    pendingOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    repositionOverlays()
  }
}

function setupIPC() {
  // ===== 快捷键 =====
  ipcMain.handle(IPC_CHANNELS.SHORTCUT_REGISTER, (_e, action: ShortcutAction, accelerator: string) => {
    return shortcutManager.register(action, accelerator)
  })

  ipcMain.handle(IPC_CHANNELS.SHORTCUT_GET_ALL, () => {
    return shortcutManager.getAll()
  })

  // 快捷键触发 → 任务执行
  shortcutManager.onTrigger((action) => {
    switch (action) {
      case ShortcutAction.START_ALL:
        taskManager.startAll()
        break
      case ShortcutAction.PAUSE_ALL:
        taskManager.pauseAll()
        break
      case ShortcutAction.STOP_ALL:
        taskManager.stopAll()
        break
    }
    // 通知渲染进程
    mainWindow?.webContents.send(IPC_CHANNELS.SHORTCUT_TRIGGERED, action)
  })

  // ===== 任务控制 =====
  ipcMain.handle(IPC_CHANNELS.TASK_START_ALL, () => taskManager.startAll())
  ipcMain.handle(IPC_CHANNELS.TASK_PAUSE_ALL, () => taskManager.pauseAll())
  ipcMain.handle(IPC_CHANNELS.TASK_STOP_ALL, () => taskManager.stopAll())

  ipcMain.handle(IPC_CHANNELS.TASK_START, (_e, cardId: string, steps?: TaskStep[]) => taskManager.start(cardId, steps))
  ipcMain.handle(IPC_CHANNELS.TASK_PAUSE, (_e, cardId: string) => taskManager.pause(cardId))
  ipcMain.handle(IPC_CHANNELS.TASK_STOP, (_e, cardId: string) => {
    // 任务被 IPC 停止时，中断当前联动、清空待运行列表
    linkageGeneration++
    pendingTaskNames.length = 0
    updatePendingOverlay()
    return taskManager.stop(cardId)
  })

  // 任务状态变更 → 推送到渲染进程
  taskManager.onStatusChange((cardId, status) => {
    mainWindow?.webContents.send(IPC_CHANNELS.TASK_STATUS_CHANGE, { cardId, status })
  })

  // ===== 屏幕定位 =====
  ipcMain.handle(IPC_CHANNELS.SCREEN_MOUSE_POS, () => {
    const robot = require('robotjs')
    const pos = robot.getMousePos()
    return { x: pos.x, y: pos.y }
  })

  // ===== 应用设置 =====
  ipcMain.handle(IPC_CHANNELS.APP_SETTINGS_GET, () => {
    return appSettingsStore.get('settings')
  })

  ipcMain.handle(IPC_CHANNELS.APP_SETTINGS_SET, (_e, settings: AppSettings) => {
    appSettingsStore.set('settings', settings)
    // 字体大小变更 → 通知渲染进程
    mainWindow?.webContents.send('font-size-change', settings.fontSize)
    return { ok: true }
  })

  // ===== 任务持久化 =====
  ipcMain.handle('task:save', (_e, tasks: any[]) => {
    taskStore.set('tasks', tasks)
    return { ok: true }
  })

  ipcMain.handle('task:load', () => {
    return taskStore.get('tasks')
  })

  // ===== 水军持久化 =====
  ipcMain.handle('bot:save', (_e, bots: any[]) => {
    botStore.set('bots', bots)
    return { ok: true }
  })

  ipcMain.handle('bot:load', () => {
    return botStore.get('bots')
  })

  // ===== 评论持久化 =====
  ipcMain.handle('comment:save', (_e, data: { comments: any[]; sendMode: string; sendInterval: number }) => {
    commentStore.store = data
    return { ok: true }
  })

  ipcMain.handle('comment:load', () => {
    return commentStore.store
  })

  // ===== 分组持久化 =====
  ipcMain.handle('group:getAll', () => {
    return { groups: groupStore.get('groups'), activeGroupId, shortcutGroupId, interGroups: groupStore.get('interGroups') || [] }
  })

  ipcMain.handle('group:save', (_e, groups: any[], activeId: string, shortcutId: string, interGroups: any[]) => {
    groupStore.set('groups', groups || [])
    groupStore.set('activeGroupId', activeId || '')
    activeGroupId = activeId && (groups || []).some((g: any) => g.id === activeId) ? activeId : DEFAULT_GROUP_ID
    groupStore.set('shortcutGroupId', shortcutId || '')
    shortcutGroupId = shortcutId || ''
    groupStore.set('interGroups', interGroups || [])
    return { ok: true, activeGroupId, shortcutGroupId }
  })

  ipcMain.handle('group:setActive', (_e, groupId: string) => {
    if ((groupId || DEFAULT_GROUP_ID) === activeGroupId) return { ok: true, activeGroupId }
    activeGroupId = groupId || DEFAULT_GROUP_ID
    groupStore.set('activeGroupId', activeGroupId)
    return { ok: true, activeGroupId }
  })

  ipcMain.handle('group:setShortcut', (_e, interId: string) => {
    shortcutGroupId = interId || ''
    groupStore.set('shortcutGroupId', shortcutGroupId)
    return { ok: true, shortcutGroupId }
  })

  // ===== 剪贴板 =====
  ipcMain.handle('clipboard:writeText', (_e, text: string) => {
    clipboard.writeText(text)
    return true
  })

  // ===== 任务导入导出 =====
  ipcMain.handle('task:importFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入任务文件',
      filters: [
        { name: 'AutoZK 任务文件', extensions: ['azk'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    try {
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      if (data.__fileType !== 'AutoZK-Task') {
        return { error: '文件格式不正确：不是有效的 AutoZK 任务文件' }
      }
      return { task: data.task }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('task:importFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '批量导入任务文件',
      filters: [
        { name: 'AutoZK 任务文件', extensions: ['azk'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const tasks: any[] = []
    const errors: { file: string; error: string }[] = []
    for (const filePath of result.filePaths) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        const data = JSON.parse(content)
        if (data.__fileType !== 'AutoZK-Task') {
          errors.push({ file: filePath, error: '不是有效的 AutoZK 任务文件' })
          continue
        }
        tasks.push(data.task)
      } catch (err) {
        errors.push({ file: filePath, error: String(err) })
      }
    }
    return { tasks, errors }
  })

  ipcMain.handle('task:exportFile', async (_e, task: any) => {
    const defaultDir = lastExportDir || app.getPath('desktop')
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出任务文件',
      filters: [{ name: 'AutoZK 任务文件', extensions: ['azk'] }],
      defaultPath: join(defaultDir, `${task.name || 'task'}.azk`),
    })
    if (result.canceled || !result.filePath) return { ok: false }
    lastExportDir = dirname(result.filePath)
    const exportData = {
      __fileType: 'AutoZK-Task',
      __version: '1.0',
      exportedAt: new Date().toISOString(),
      task: task,
    }
    writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
    return { ok: true }
  })

  ipcMain.handle('task:exportFiles', async (_e, tasks: any[]) => {
    const defaultDir = lastExportDir || app.getPath('desktop')
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择批量导出目录',
      defaultPath: defaultDir,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
    const dir = result.filePaths[0]
    lastExportDir = dir
    const usedNames = new Set<string>()
    let count = 0
    for (const task of tasks) {
      const base = sanitizeTaskFileName(task.name || 'task')
      let fileName = `${base}.azk`
      let idx = 1
      while (usedNames.has(fileName)) {
        fileName = `${base}-${idx}.azk`
        idx++
      }
      usedNames.add(fileName)
      const exportData = {
        __fileType: 'AutoZK-Task',
        __version: '1.0',
        exportedAt: new Date().toISOString(),
        task: task,
      }
      writeFileSync(join(dir, fileName), JSON.stringify(exportData, null, 2), 'utf-8')
      count++
    }
    return { ok: true, count, dir }
  })

  // ===== 评论导入导出 =====
  ipcMain.handle('comment:importFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入评论文件',
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const content = readFileSync(result.filePaths[0], 'utf-8')
      const comments = content.split('\n').map(l => l.trim()).filter(Boolean)
      return { comments }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('comment:exportFile', async (_e, comments: string[]) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出评论文件',
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      defaultPath: `comments-${new Date().toISOString().slice(0, 10)}.txt`,
    })
    if (result.canceled || !result.filePath) return
    writeFileSync(result.filePath, comments.join('\n'), 'utf-8')
  })

  // ===== 捕获坐标窗口 =====
  ipcMain.handle('capture:open', (_e, fontSize: number) => {
    if (captureActive) return { ok: false, reason: 'capturing' }
    captureDone = false
    captureActive = true
    if (captureWindow) {
      if (captureInterval) { clearInterval(captureInterval); captureInterval = null }
      captureWindow.close()
      captureWindow = null
    }

    const overlayFontSize = Math.max(fontSize - 2, 10)
    const hotkeyStr = appSettingsStore.get('settings').pointerHotkey || ''
    const hotkeyParts = hotkeyStr ? hotkeyStr.split('+').map(s => s.trim()) : []

    const mouseButtonMap: Record<string, number> = {
      '鼠标左键': 0, '鼠标中键': 1, '鼠标右键': 2, '鼠标侧键1': 3, '鼠标侧键2': 4,
    }

    const kbKeys = hotkeyParts.filter(p => !(p in mouseButtonMap))
    const mouseBtns = hotkeyParts.filter(p => p in mouseButtonMap).map(p => mouseButtonMap[p])
    const hintKey = hotkeyStr || '未设置热键'
    const isMouseHotkey = mouseBtns.length > 0

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: rgba(255,255,255,0.35); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; font-family: 'Microsoft YaHei', sans-serif; }
      #coords { color: #000; font-size: ${overlayFontSize}px; margin-bottom: 8px; }
      .hint { color: #000; font-size: ${overlayFontSize}px; }
    </style></head><body>
      <div id="coords">X: 0, Y: 0</div>
      <div class="hint">按下「${hintKey}」确定坐标，Esc 取消</div>
    </body></html>`

    captureWindow = new BrowserWindow({
      width: 300,
      height: 100,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    captureWindow.center()
    captureWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    captureWindow.focus()

    function doCapture() {
      if (captureDone) return
      captureDone = true
      if (captureInterval) { clearInterval(captureInterval); captureInterval = null }
      cleanupCaptureShortcuts()
      safeStopUiohook()
      const robot = require('robotjs')
      const pos = robot.getMousePos()
      captureWindow?.close()
      captureWindow = null
      mainWindow?.webContents.send('capture:result', { x: pos.x, y: pos.y })
      showCaptureSuccessToast()
    }

    function cancelCapture() {
      if (captureDone) return
      captureDone = true
      if (captureInterval) { clearInterval(captureInterval); captureInterval = null }
      cleanupCaptureShortcuts()
      safeStopUiohook()
      captureWindow?.close()
      captureWindow = null
      mainWindow?.webContents.send('capture:result', null)
    }

    // ===== 结束判定：触发设置的热键（确定坐标）或按 Esc（取消） =====
    const { uIOhook: captureUiohook, UiohookKey: CaptureUiohookKey } = require('uiohook-napi')
    const pressedKeys = new Set<number>()

    const kbNameToKeyCode: Record<string, number> = {
      'Ctrl': CaptureUiohookKey.Ctrl, '左Ctrl': CaptureUiohookKey.Ctrl, '右Ctrl': CaptureUiohookKey.CtrlRight,
      'Shift': CaptureUiohookKey.Shift, '左Shift': CaptureUiohookKey.Shift, '右Shift': CaptureUiohookKey.ShiftRight,
      'Alt': CaptureUiohookKey.Alt, '左Alt': CaptureUiohookKey.Alt, '右Alt': CaptureUiohookKey.AltRight,
      '空格': CaptureUiohookKey.Space, '回车': CaptureUiohookKey.Enter, '退格': CaptureUiohookKey.Backspace,
      '删除': CaptureUiohookKey.Delete, '上翻页': CaptureUiohookKey.PageUp, '下翻页': CaptureUiohookKey.PageDown,
    }
    const requiredKeyCodes = kbKeys.map(k =>
      kbNameToKeyCode[k] ?? numpadToKeyCode[k] ?? CaptureUiohookKey[k as keyof typeof CaptureUiohookKey] ?? 0
    ).filter(Boolean)

    captureUiohook.on('keydown', (e: any) => {
      pressedKeys.add(e.keycode)
      if (e.keycode === CaptureUiohookKey.Escape) { cancelCapture(); return }
      // 纯键盘热键：所需按键全部按下即确定坐标
      if (!isMouseHotkey && requiredKeyCodes.length > 0 && requiredKeyCodes.every(k => pressedKeys.has(k))) {
        doCapture()
      }
    })
    captureUiohook.on('keyup', (e: any) => {
      pressedKeys.delete(e.keycode)
    })
    if (isMouseHotkey) {
      captureUiohook.on('mousedown', (e: any) => {
        if (!mouseBtns.includes(e.button)) return
        const allKeysOk = requiredKeyCodes.length === 0 || requiredKeyCodes.every(k => pressedKeys.has(k))
        if (allKeysOk) doCapture()
      })
    }

    try { captureUiohook.start() } catch {}

    // 坐标实时更新
    captureInterval = setInterval(() => {
      if (!captureWindow || captureWindow.isDestroyed()) return
      const robot = require('robotjs')
      const pos = robot.getMousePos()
      captureWindow.webContents.executeJavaScript(
        `document.getElementById('coords').textContent = 'X: ${pos.x}, Y: ${pos.y}'`
      ).catch(() => {})
    }, 50)

    captureWindow.on('closed', () => {
      if (captureInterval) { clearInterval(captureInterval); captureInterval = null }
      cleanupCaptureShortcuts()
      safeStopUiohook()
      captureWindow = null
      if (!captureDone) {
        captureDone = true
        mainWindow?.webContents.send('capture:result', null)
      }
    })
  })

  ipcMain.handle('capture:close', () => {
    captureDone = true
    if (captureInterval) { clearInterval(captureInterval); captureInterval = null }
    cleanupCaptureShortcuts()
    safeStopUiohook()
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.close()
    }
    captureWindow = null
  })

  // ===== 任务快捷键全局监听 =====
  const taskHotkeyMap = new Map<string, string>() // taskId -> accelerator

  const hotkeyToAccelerator = (hotkey: string): string | null => {
    if (!hotkey) return null
    const keyToAccel: Record<string, string> = {
      'Ctrl': 'CommandOrControl', '左Ctrl': 'CommandOrControl', '右Ctrl': 'CommandOrControl',
      'Shift': 'Shift', '左Shift': 'Shift', '右Shift': 'Shift',
      'Alt': 'Alt', '左Alt': 'Alt', '右Alt': 'Alt',
      '空格': 'Space', '回车': 'Return', '退格': 'Backspace',
      '删除': 'Delete', '上翻页': 'PageUp', '下翻页': 'PageDown',
    }
    const parts = hotkey.split('+').map(s => s.trim())
    const accelParts = parts.map(p => keyToAccel[p] || p.toUpperCase())
    return accelParts.join('+')
  }

  ipcMain.handle('taskHotkey:register', (_e, taskId: string, hotkey: string) => {
    // 快捷键守卫：任务不在「启用分组」或未启用时不注册
    const tgt = taskStore.get('tasks').find((t: any) => t.id === taskId)
    if (tgt && tgt.interGroupId !== shortcutGroupId) {
      return { ok: false, error: '该任务不在启用分组，快捷键不生效' }
    }
    if (tgt && tgt.enabled === false) {
      return { ok: false, error: '该任务已停用' }
    }
    const oldAccel = taskHotkeyMap.get(taskId)
    if (oldAccel) {
      try { globalShortcut.unregister(oldAccel) } catch {}
      taskHotkeyMap.delete(taskId)
    }
    if (modifierHotkeys.has(taskId)) {
      modifierHotkeys.delete(taskId)
      cleanupUiohookForModifier()
    }
    if (isUiohookHotkey(hotkey)) {
      const keyCodes = hotkeyToKeyCodes(hotkey)
      if (keyCodes.length === 0) return { ok: false, error: '无效快捷键' }
      modifierHotkeys.set(taskId, keyCodes)
      ensureUiohookForModifier()
      return { ok: true }
    }
    const accel = hotkeyToAccelerator(hotkey)
    if (!accel) return { ok: false, error: '无效快捷键' }
    try {
      const ok = globalShortcut.register(accel, () => triggerTask(taskId))
      if (!ok) return { ok: false, error: '注册失败，快捷键可能被系统占用' }
      taskHotkeyMap.set(taskId, accel)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  function registerAllTaskHotkeys() {
    if (!shortcutGroupId) return
    const tasks = taskStore.get('tasks')
    for (const task of tasks) {
      if (!task.hotkey) continue
      if (task.isDraft) continue
      if (task.enabled === false) continue
      // 只注册「启用分组」选中的互动分组内的任务快捷键
      if (task.interGroupId !== shortcutGroupId) continue
      if (isUiohookHotkey(task.hotkey)) {
        const keyCodes = hotkeyToKeyCodes(task.hotkey)
        if (keyCodes.length > 0) {
          modifierHotkeys.set(task.id, keyCodes)
        }
      } else {
        const accel = hotkeyToAccelerator(task.hotkey)
        if (!accel) continue
        const existing = taskHotkeyMap.get(task.id)
        if (existing) continue
        try {
          globalShortcut.register(accel, () => triggerTask(task.id))
          taskHotkeyMap.set(task.id, accel)
        } catch {}
      }
    }
    if (modifierHotkeys.size > 0) {
      ensureUiohookForModifier()
    }
  }

  // 全量重注册：先清空所有已注册的任务快捷键，再按当前「启用分组」与任务启用状态重新注册
  ipcMain.handle('taskHotkey:refreshAll', () => {
    for (const [taskId, accel] of taskHotkeyMap) {
      try { globalShortcut.unregister(accel) } catch {}
      modifierHotkeyTriggered.delete(taskId)
    }
    taskHotkeyMap.clear()
    if (modifierHotkeys.size > 0) {
      modifierHotkeys.clear()
      cleanupUiohookForModifier()
    }
    registerAllTaskHotkeys()
    return { ok: true }
  })

  ipcMain.handle('taskHotkey:unregister', (_e, taskId: string) => {
    const accel = taskHotkeyMap.get(taskId)
    if (accel) {
      try { globalShortcut.unregister(accel) } catch {}
      taskHotkeyMap.delete(taskId)
    }
    if (modifierHotkeys.has(taskId)) {
      modifierHotkeys.delete(taskId)
      cleanupUiohookForModifier()
    }
    taskExecutor.stopTask(taskId)
    return { ok: true }
  })

  ipcMain.handle('taskHotkey:stopAll', () => {
    taskExecutor.stopAll()
    return { ok: true }
  })

  ipcMain.handle('taskHotkey:setSuspended', (_e, val: boolean) => {
    hotkeysSuspended = val
    return { ok: true }
  })

  // ===== 任务通知弹窗（全局，最小化也可见） =====
  const notifyWindows: { win: BrowserWindow; timer: ReturnType<typeof setTimeout> }[] = []
  const MAX_NOTIFY = 2
  const NOTIFY_DURATION = 1000

  function showTaskNotify(message: string, type: 'success' | 'warning' | 'error' = 'success') {
    // 超过上限则关闭最旧的（数组末尾 = 顶部 = 最旧）
    while (notifyWindows.length >= MAX_NOTIFY) {
      const oldest = notifyWindows.pop()
      if (oldest) {
        clearTimeout(oldest.timer)
        try { oldest.win.close() } catch {}
      }
    }

    const bgColor = type === 'success' ? '#f0f9eb' : type === 'error' ? '#fef0f0' : '#fdf6ec'
    const borderColor = type === 'success' ? '#67c23a' : type === 'error' ? '#f56c6c' : '#e6a23c'
    const textColor = type === 'success' ? '#67c23a' : type === 'error' ? '#f56c6c' : '#e6a23c'
    const { width: screenWidth, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize
    const w = 300
    const h = 60
    const margin = 12

    function repositionAll() {
      notifyWindows.forEach((n, i) => {
        try {
          n.win.setBounds({ x: screenWidth - w - margin, y: screenHeight - (h + margin) * (i + 1), width: w, height: h })
        } catch {}
      })
    }

    // 新通知放在最底部（数组开头 = 底部 = 最新）
    const y = screenHeight - (h + margin)

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
      .container { background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        width: calc(100% - 4px); height: calc(100% - 4px); margin: 2px;
        font-family: 'Microsoft YaHei', sans-serif; overflow: hidden; }
      .msg { color: ${textColor}; font-size: 16px; font-weight: 600; }
    </style></head><body><div class="container"><div class="msg">${message}</div></div></body></html>`

    const win = new BrowserWindow({
      width: w, height: h, x: screenWidth - w - margin, y,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, resizable: false, focusable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    // 淡入效果
    win.setOpacity(0)
    let opacity = 0
    const fadeIn = setInterval(() => {
      opacity = Math.min(opacity + 0.15, 1)
      try { win.setOpacity(opacity) } catch {}
      if (opacity >= 1) clearInterval(fadeIn)
    }, 30)

    const timer = setTimeout(() => {
      // 淡出
      let o = 1
      const fadeOut = setInterval(() => {
        o = Math.max(o - 0.15, 0)
        try { win.setOpacity(o) } catch {}
        if (o <= 0) {
          clearInterval(fadeOut)
          clearInterval(fadeIn)
          try { win.close() } catch {}
        }
      }, 30)
    }, NOTIFY_DURATION)

    win.on('closed', () => {
      const i = notifyWindows.findIndex(n => n.win === win)
      if (i >= 0) notifyWindows.splice(i, 1)
      // 重新排列：最新在底部，旧的往上挤
      repositionAll()
    })

    // 新通知插入数组开头（底部 = 最新），旧的往上挤
    notifyWindows.unshift({ win, timer })
    repositionAll()
  }

  // 注入通知函数，供任务自动结束等主进程回调使用
  showTaskNotifyFn = showTaskNotify

  // ===== 坐标获取成功提示（屏幕顶部居中，全局可见） =====
  let captureToastWin: BrowserWindow | null = null
  let captureToastTimer: ReturnType<typeof setTimeout> | null = null

  function showCaptureSuccessToast() {
    const { screen: electronScreen } = require('electron')
    // 跟随鼠标所在显示器，保证多屏环境下弹窗出现在用户当前操作的屏幕上
    const cursor = electronScreen.getCursorScreenPoint()
    const display = electronScreen.getDisplayNearestPoint(cursor)
    const { x: areaX, y: areaY, width: areaW } = display.bounds
    const w = 180
    const h = 48
    const x = Math.round(areaX + (areaW - w) / 2)
    const y = Math.round(areaY + 16)

    if (captureToastWin && !captureToastWin.isDestroyed()) {
      try { captureToastWin.close() } catch {}
    }
    captureToastWin = null
    if (captureToastTimer) { clearTimeout(captureToastTimer); captureToastTimer = null }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
      .container { background: #f0f9eb; border: 1px solid #67c23a; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        width: calc(100% - 4px); height: calc(100% - 4px); margin: 2px;
        font-family: 'Microsoft YaHei', sans-serif; overflow: hidden; }
      .msg { color: #67c23a; font-size: 16px; font-weight: 600; }
    </style></head><body><div class="container"><div class="msg">获取成功</div></div></body></html>`

    const win = new BrowserWindow({
      width: w, height: h, x, y,
      show: false,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, resizable: false, focusable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    captureToastWin = win
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    let revealed = false
    const reveal = () => {
      if (revealed || win.isDestroyed()) return
      revealed = true
      try {
        win.setBounds({ x, y, width: w, height: h })
        win.setAlwaysOnTop(true, 'screen-saver')
        win.setOpacity(0)
        win.showInactive()
      } catch {}

      let opacity = 0
      const fadeIn = setInterval(() => {
        opacity = Math.min(opacity + 0.15, 1)
        try { win.setOpacity(opacity) } catch {}
        if (opacity >= 1) clearInterval(fadeIn)
      }, 30)

      captureToastTimer = setTimeout(() => {
        let o = 1
        const fadeOut = setInterval(() => {
          o = Math.max(o - 0.15, 0)
          try { win.setOpacity(o) } catch {}
          if (o <= 0) {
            clearInterval(fadeOut)
            clearInterval(fadeIn)
            try { win.close() } catch {}
          }
        }, 30)
      }, 1000)
    }

    win.once('ready-to-show', reveal)
    // 兜底：个别环境下 ready-to-show 不触发，超时后直接显示
    setTimeout(reveal, 400)

    win.on('closed', () => {
      if (captureToastWin === win) captureToastWin = null
    })
  }

  ipcMain.handle('task:notify', (_e, message: string, type: string) => {
    showTaskNotify(message, type as 'success' | 'warning' | 'error')
    return { ok: true }
  })

  ipcMain.handle('runningTask:add', (_e, taskName: string) => {
    if (!runningTaskNames.includes(taskName)) {
      runningTaskNames.push(taskName)
      updateRunningOverlay()
    }
    return { ok: true }
  })

  ipcMain.handle('runningTask:remove', (_e, taskName: string) => {
    const idx = runningTaskNames.indexOf(taskName)
    if (idx >= 0) {
      runningTaskNames.splice(idx, 1)
      updateRunningOverlay()
    }
    return { ok: true }
  })

  ipcMain.handle('runningTask:clear', () => {
    runningTaskNames.length = 0
    updateRunningOverlay()
    pendingTaskNames.length = 0
    updatePendingOverlay()
    return { ok: true }
  })

  // App 启动时立即注册所有任务快捷键（不依赖渲染进程）
  registerAllTaskHotkeys()
}

async function handleTaskLinkage(taskId: string) {
  const myGen = linkageGeneration
  const task = taskStore.get('tasks').find((t: any) => t.id === taskId)
  const validLinkedTasks = collectValidLinked(task)
  if (validLinkedTasks.length === 0) {
    // 无有效联动任务，确保待运行列表隐藏
    pendingTaskNames.length = 0
    updatePendingOverlay()
    return
  }

  const mainDelay = task.linkageDelay ?? 0
  if (mainDelay > 0) await new Promise(r => setTimeout(r, mainDelay))
  if (linkageGeneration !== myGen) return

  for (let i = 0; i < validLinkedTasks.length; i++) {
    if (linkageGeneration !== myGen) {
      // 联动被中断，清空待运行列表
      pendingTaskNames.length = 0
      updatePendingOverlay()
      return
    }
    const vlt = validLinkedTasks[i]
    const linkedTask = taskStore.get('tasks').find((t: any) => t.id === vlt.taskId)
    if (!linkedTask) continue

    taskExecutor.setTaskName(vlt.taskId, linkedTask.name)
    const wasRunning = taskExecutor.isRunning(vlt.taskId)
    if (!wasRunning) {
      linkedTaskIds.add(vlt.taskId)
      // 联动任务即将启动，先从待运行列表移除（移入运行中），待运行显示"尚未开始跑"的任务
      const idx = pendingTaskNames.indexOf(vlt.name)
      if (idx >= 0) {
        pendingTaskNames.splice(idx, 1)
        updatePendingOverlay()
      }
      taskExecutor.toggleTask(vlt.taskId, linkedTask)
    }

    while (taskExecutor.isRunning(vlt.taskId)) {
      if (linkageGeneration !== myGen) {
        pendingTaskNames.length = 0
        updatePendingOverlay()
        return
      }
      await new Promise(r => setTimeout(r, 200))
    }

    if (linkageGeneration !== myGen) {
      pendingTaskNames.length = 0
      updatePendingOverlay()
      return
    }
    if (vlt.delay > 0) await new Promise(r => setTimeout(r, vlt.delay))
  }

  // 所有联动任务完成，清空待运行列表
  pendingTaskNames.length = 0
  updatePendingOverlay()
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  // 加载当前激活分组（用于启动时只注册该组任务快捷键）
  const storedGroups = groupStore.get('groups')
  const storedActive = groupStore.get('activeGroupId')
  activeGroupId = storedActive && storedGroups.some((g: any) => g.id === storedActive)
    ? storedActive
    : (storedGroups[0]?.id || DEFAULT_GROUP_ID)
  // 恢复上一次的「启用分组」（快捷键生效的互动分组 ID）；为空/无效时回退到第一个互动分组
  const storedInterGroups = (groupStore.get('interGroups') as any[]) || []
  const storedShortcut = groupStore.get('shortcutGroupId')
  shortcutGroupId = storedShortcut && storedInterGroups.some((ig: any) => ig.id === storedShortcut)
    ? storedShortcut
    : (storedInterGroups[0]?.id || '')
  shortcutManager = new ShortcutManager()
  taskManager = new TaskManager()
  taskExecutor = new TaskExecutor()
  taskExecutor.setOnEndCallback((taskId: string) => {
    modifierHotkeyTriggered.delete(taskId)
    // 任务自动结束时给出结束提示，避免无从得知是否完成
    const endedTask = taskStore.get('tasks').find((t: any) => t.id === taskId)
    const wasLinked = linkedTaskIds.has(taskId)
    if (endedTask) {
      showTaskNotifyFn?.(`「${endedTask.name}」结束`, 'error')
    }
    linkedTaskIds.delete(taskId)
    // 只有主任务（非联动任务）自然结束才触发联动链；
    // 联动任务的自然结束由外层 handleTaskLinkage 的 while 循环管理，不应独立触发（否则会误清空待运行列表）
    if (!wasLinked) {
      handleTaskLinkage(taskId)
    }
  })
  taskExecutor.setOnStopCallback((taskId: string) => {
    modifierHotkeyTriggered.delete(taskId)
    if (linkedTaskIds.has(taskId)) {
      linkedTaskIds.delete(taskId)
      linkageGeneration++
      // 联动任务被手动停止，立即清空待运行列表
      pendingTaskNames.length = 0
      updatePendingOverlay()
    }
  })
  createWindow()
  taskExecutor.setMainWindow(mainWindow)
  setupIPC()
  shortcutManager.restoreAll()
})

app.on('window-all-closed', () => {
  shortcutManager.unregisterAll()
  app.quit()
})

app.on('will-quit', () => {
  shortcutManager.unregisterAll()
  globalShortcut.unregisterAll()
})