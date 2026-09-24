import { globalShortcut } from 'electron'
import Store from 'electron-store'
import { ShortcutAction, ShortcutConfig } from '../shared/types'

const SYSTEM_RESERVED = new Set([
  'CommandOrControl+Alt+Delete',
  'CommandOrControl+Shift+Escape',
  'Command+Q',
  'Alt+F4',
  'CommandOrControl+W',
])

export class ShortcutManager {
  private store = new Store<{ shortcuts: ShortcutConfig }>({
    defaults: { shortcuts: { startAll: '', pauseAll: '', stopAll: '' } },
  })
  private triggerCallbacks: Array<(action: ShortcutAction) => void> = []

  onTrigger(cb: (action: ShortcutAction) => void) {
    this.triggerCallbacks.push(cb)
  }

  register(action: ShortcutAction, accelerator: string): { ok: boolean; reason?: string; conflictWith?: string } {
    if (!accelerator) {
      return { ok: false, reason: 'EMPTY' }
    }

    // 系统保留键检查
    if (SYSTEM_RESERVED.has(accelerator)) {
      return { ok: false, reason: 'SYSTEM_RESERVED' }
    }

    // 内部冲突检查
    const current = this.store.get('shortcuts')
    for (const [act, acc] of Object.entries(current)) {
      if (act !== action && acc === accelerator) {
        return { ok: false, reason: 'CONFLICT', conflictWith: act }
      }
    }

    // 注销旧快捷键
    const oldAcc = current[action]
    if (oldAcc) {
      globalShortcut.unregister(oldAcc)
    }

    // 注册新快捷键
    const ok = globalShortcut.register(accelerator, () => {
      this.triggerCallbacks.forEach(cb => cb(action))
    })

    if (!ok) {
      return { ok: false, reason: 'OCCUPIED_BY_OS' }
    }

    // 持久化
    this.store.set(`shortcuts.${action}`, accelerator)
    return { ok: true }
  }

  getAll(): ShortcutConfig {
    return this.store.get('shortcuts')
  }

  restoreAll() {
    const shortcuts = this.store.get('shortcuts')
    for (const [action, accelerator] of Object.entries(shortcuts)) {
      if (accelerator) {
        globalShortcut.register(accelerator, () => {
          this.triggerCallbacks.forEach(cb => cb(action as ShortcutAction))
        })
      }
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll()
  }
}