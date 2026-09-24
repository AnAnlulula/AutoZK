// ===== 任务操作类型 =====
export enum StepType {
  DELAY = 'delay',
  KEY_PRESS = 'keyPress',
  KEY_RELEASE = 'keyRelease',
  MOUSE_CLICK = 'mouseClick',
  STEP_JUMP = 'stepJump',
  LOG_PRINT = 'logPrint',
}

// ===== 单个操作步骤 =====
export interface TaskStep {
  type: StepType
  ms?: number          // 延时毫秒
  key?: string         // 键盘键名
  x?: number           // 鼠标 X 坐标
  y?: number           // 鼠标 Y 坐标
  target?: number      // 跳转目标步骤序号 (0-based)
  message?: string     // 日志文本
}

// ===== 任务状态机 =====
export enum TaskStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
}

// ===== 快捷键操作类型 =====
export enum ShortcutAction {
  START_ALL = 'startAll',
  PAUSE_ALL = 'pauseAll',
  STOP_ALL = 'stopAll',
}

// ===== 快捷键配置 =====
export interface ShortcutConfig {
  startAll: string
  pauseAll: string
  stopAll: string
}

// ===== 任务模式 =====
export enum TaskMode {
  COMMENT = 'comment',        // 发评论
  MOUSE = 'mouse',            // 操作鼠标
  MIXED = 'mixed',            // 混合操作
}

// ===== 操作模式（鼠标模式） =====
export enum OperationMode {
  ONCE = 'once',              // 一次性
  LOOP = 'loop',              // 循环
}

// ===== 操作步骤（鼠标模式） =====
export interface OperationStep {
  id: string
  x: number
  y: number
  note: string                 // 备注
  interval: number            // 该步骤结束后的延迟(ms)
}

// ===== 任务分组 =====
export interface TaskGroup {
  id: string
  name: string
  color: string
}

// ===== 互动分组（外层分组下的成套任务容器） =====
export interface InteractGroup {
  id: string
  outerGroupId: string       // 所属外层分组
  name: string
}

// ===== 单个水军实例 =====
export interface BotInstance {
  id: string
  name: string
  screenX: number
  screenY: number
  commentIds: string[]        // 绑定的评论 ID 列表（有序）
  stepInterval: number        // 步骤间隔(ms)
  enabled: boolean
  status: TaskStatus
}

// ===== 任务卡片配置 =====
export interface BotCard {
  id: string
  name: string
  enabled: boolean
  status: TaskStatus
  steps: TaskStep[]           // 任务步骤序列
  taskMode: TaskMode          // 工作模式：发评论/操作鼠标
  operationMode: OperationMode // 操作模式：一次性/循环
  botCount: number            // 水军个数
  sendMode: SendMode          // 发送顺序：顺序/随机
  commentCount: number        // 评论数（0=全部）
  commentInterval: number     // 评论间隔时间(ms)
  operationInterval: number   // 操作间隔时间(ms，鼠标模式默认)
  hotkey: string              // 任务专属快捷键
  bots: BotInstance[]         // 单个水军配置列表
  commentIds: string[]        // 绑定的评论 ID 列表（有序）
  commentItems: { key: string; content: string; source: 'manual' | 'table'; mustSend: boolean; delay: number }[]
  operationSteps: OperationStep[]  // 操作步骤列表（鼠标模式）
  preOperationSteps: OperationStep[]   // 评论前操作（混合模式）
  postOperationSteps: OperationStep[]   // 评论后操作（混合模式）
  isDraft?: boolean           // 是否为草稿
  groupId?: string            // 所属分组（默认分组为 group-default）
  interGroupId?: string       // 所属互动分组（互动分组有外层分组归属）
  linkageEnabled?: boolean     // 是否开启任务联动
  linkageDelay?: number       // 主任务结束后延迟时间(ms)
  linkedTasks?: LinkedTask[]  // 联动的任务列表
}

// ===== 联动任务 =====
export interface LinkedTask {
  taskId: string
  taskName: string
  delay: number              // 该任务完成后延迟时间(ms)
}

// ===== 评论条目 =====
export interface CommentItem {
  id: string
  content: string
  selected: boolean
  createdAt: number
}

// ===== 发送模式 =====
export enum SendMode {
  SEQUENTIAL = 'sequential',  // 按选中顺序
  RANDOM = 'random',          // 随机顺序
}

// ===== IPC 通信频道 =====
export const IPC_CHANNELS = {
  // 快捷键
  SHORTCUT_REGISTER: 'shortcut:register',
  SHORTCUT_TRIGGERED: 'shortcut:triggered',
  SHORTCUT_GET_ALL: 'shortcut:getAll',

  // 任务控制
  TASK_START: 'task:start',
  TASK_PAUSE: 'task:pause',
  TASK_STOP: 'task:stop',
  TASK_START_ALL: 'task:startAll',
  TASK_PAUSE_ALL: 'task:pauseAll',
  TASK_STOP_ALL: 'task:stopAll',
  TASK_STATUS_CHANGE: 'task:statusChange',

  // 屏幕定位
  SCREEN_CAPTURE: 'screen:capture',
  SCREEN_MOUSE_POS: 'screen:mousePos',

  // 评论
  COMMENT_SAVE: 'comment:save',
  COMMENT_LOAD: 'comment:load',

  // 应用设置
  APP_SETTINGS_GET: 'appSettings:get',
  APP_SETTINGS_SET: 'appSettings:set',
}

// ===== 应用设置 =====
export interface AppSettings {
  fontSize: number
  pointerHotkey: string
}