import { contextBridge, ipcRenderer } from 'electron'

// 内联常量，避免沙箱中跨文件 require 失败
const IPC_CHANNELS = {
  SHORTCUT_REGISTER: 'shortcut:register',
  SHORTCUT_TRIGGERED: 'shortcut:triggered',
  SHORTCUT_GET_ALL: 'shortcut:getAll',
  TASK_START: 'task:start',
  TASK_PAUSE: 'task:pause',
  TASK_STOP: 'task:stop',
  TASK_START_ALL: 'task:startAll',
  TASK_PAUSE_ALL: 'task:pauseAll',
  TASK_STOP_ALL: 'task:stopAll',
  TASK_STATUS_CHANGE: 'task:statusChange',
  SCREEN_CAPTURE: 'screen:capture',
  SCREEN_MOUSE_POS: 'screen:mousePos',
  APP_SETTINGS_GET: 'appSettings:get',
  APP_SETTINGS_SET: 'appSettings:set',
}

const api = {
  // 快捷键
  registerShortcut: (action: string, accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_REGISTER, action, accelerator),
  getAllShortcuts: () => ipcRenderer.invoke(IPC_CHANNELS.SHORTCUT_GET_ALL),
  onShortcutTriggered: (cb: (action: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SHORTCUT_TRIGGERED, (_e, action) => cb(action))
  },

  // 任务控制
  startAll: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_START_ALL),
  pauseAll: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_PAUSE_ALL),
  stopAll: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_STOP_ALL),
  startTask: (cardId: string, steps?: any[]) => ipcRenderer.invoke(IPC_CHANNELS.TASK_START, cardId, steps),
  pauseTask: (cardId: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_PAUSE, cardId),
  stopTask: (cardId: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_STOP, cardId),
  onTaskStatusChange: (cb: (data: { cardId: string; status: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TASK_STATUS_CHANGE, (_e, data) => cb(data))
  },

  // 屏幕定位
  getMousePos: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_MOUSE_POS),

  // 应用设置
  getAppSettings: () => ipcRenderer.invoke(IPC_CHANNELS.APP_SETTINGS_GET),
  setAppSettings: (settings: any) => ipcRenderer.invoke(IPC_CHANNELS.APP_SETTINGS_SET, settings),

  // 文件导入
  importTaskFile: () => ipcRenderer.invoke('task:importFile'),
  importTaskFiles: () => ipcRenderer.invoke('task:importFiles'),
  exportTaskFile: (task: any) => ipcRenderer.invoke('task:exportFile', task),
  exportTaskFiles: (tasks: any[]) => ipcRenderer.invoke('task:exportFiles', tasks),

  // 评论导入导出
  importCommentFile: () => ipcRenderer.invoke('comment:importFile'),
  exportCommentFile: (comments: string[]) => ipcRenderer.invoke('comment:exportFile', comments),

  // 捕获坐标窗口
  openCaptureOverlay: (fontSize: number) => ipcRenderer.invoke('capture:open', fontSize),
  onCaptureResult: (cb: (result: { x: number; y: number } | null) => void) => {
    ipcRenderer.on('capture:result', (_e, result) => cb(result))
  },
  removeCaptureListeners: () => {
    ipcRenderer.removeAllListeners('capture:result')
  },

  // 任务快捷键全局监听
  registerTaskHotkey: (taskId: string, hotkey: string) =>
    ipcRenderer.invoke('taskHotkey:register', taskId, hotkey),
  unregisterTaskHotkey: (taskId: string) =>
    ipcRenderer.invoke('taskHotkey:unregister', taskId),
  stopAllTaskHotkeys: () =>
    ipcRenderer.invoke('taskHotkey:stopAll'),
  setHotkeysSuspended: (val: boolean) =>
    ipcRenderer.invoke('taskHotkey:setSuspended', val),
  onTaskHotkeyStarted: (cb: (data: { taskId: string; taskName: string }) => void) => {
    ipcRenderer.on('taskHotkey:started', (_e, data) => cb(data))
  },
  onTaskHotkeyStopped: (cb: (data: { taskId: string; taskName: string }) => void) => {
    ipcRenderer.on('taskHotkey:stopped', (_e, data) => cb(data))
  },
  onTaskHotkeyEnded: (cb: (data: { taskId: string; taskName: string }) => void) => {
    ipcRenderer.on('taskHotkey:ended', (_e, data) => cb(data))
  },
  removeTaskHotkeyListeners: () => {
    ipcRenderer.removeAllListeners('taskHotkey:started')
    ipcRenderer.removeAllListeners('taskHotkey:stopped')
    ipcRenderer.removeAllListeners('taskHotkey:ended')
  },

  // 任务通知弹窗
  showTaskNotify: (message: string, type?: string) =>
    ipcRenderer.invoke('task:notify', message, type),

  // 任务持久化
  saveTasks: (tasks: any[]) => ipcRenderer.invoke('task:save', tasks),
  loadTasks: () => ipcRenderer.invoke('task:load'),

  // 分组持久化
  getTaskGroups: () => ipcRenderer.invoke('group:getAll'),
  saveTaskGroups: (groups: any[], activeGroupId: string, shortcutGroupId?: string, interGroups?: any[]) =>
    ipcRenderer.invoke('group:save', groups, activeGroupId, shortcutGroupId, interGroups),
  setActiveTaskGroup: (groupId: string) =>
    ipcRenderer.invoke('group:setActive', groupId),
  setShortcutTaskGroup: (interId: string) =>
    ipcRenderer.invoke('group:setShortcut', interId),
  refreshAllTaskHotkeys: () => ipcRenderer.invoke('taskHotkey:refreshAll'),

  // 水军持久化
  saveBots: (bots: any[]) => ipcRenderer.invoke('bot:save', bots),
  loadBots: () => ipcRenderer.invoke('bot:load'),

  // 评论持久化
  saveComments: (data: { comments: any[]; sendMode: string; sendInterval: number }) =>
    ipcRenderer.invoke('comment:save', data),
  loadComments: () => ipcRenderer.invoke('comment:load'),

  // 运行中任务悬浮窗
  addRunningTask: (taskName: string) => ipcRenderer.invoke('runningTask:add', taskName),
  removeRunningTask: (taskName: string) => ipcRenderer.invoke('runningTask:remove', taskName),
  clearRunningTasks: () => ipcRenderer.invoke('runningTask:clear'),

  // 剪贴板
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api