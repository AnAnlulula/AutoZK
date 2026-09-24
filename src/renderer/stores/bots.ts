import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BotInstance, TaskStatus } from '../../shared/types'
import { useWorkflowStore } from './workflow'

export const useBotStore = defineStore('bots', () => {
  let botCounter = 0
  const bots = ref<BotInstance[]>([])
  let _loaded = false

  async function loadFromDisk() {
    const data = await window.electronAPI.loadBots()
    if (Array.isArray(data) && data.length > 0) {
      bots.value = data
    } else {
      // 首次使用，创建默认3个水军
      bots.value = [
        { id: `bot-init-1`, name: '水军1', screenX: 0, screenY: 0, commentIds: [], stepInterval: 2000, enabled: true, status: 'idle' as TaskStatus },
        { id: `bot-init-2`, name: '水军2', screenX: 0, screenY: 0, commentIds: [], stepInterval: 2000, enabled: true, status: 'idle' as TaskStatus },
        { id: `bot-init-3`, name: '水军3', screenX: 0, screenY: 0, commentIds: [], stepInterval: 2000, enabled: true, status: 'idle' as TaskStatus },
      ]
      await saveToDisk()
    }
    _loaded = true
  }

  async function saveToDisk() {
    if (!_loaded) return
    try {
      await window.electronAPI.saveBots(JSON.parse(JSON.stringify(bots.value)))
    } catch {}
  }

  function addBot(name?: string): string {
    const id = `bot-${Date.now()}-${++botCounter}`
    bots.value.push({
      id,
      name: name ?? `水军${bots.value.length + 1}`,
      screenX: 0,
      screenY: 0,
      commentIds: [],
      stepInterval: 2000,
      enabled: true,
      status: 'idle' as TaskStatus,
    })
    saveToDisk()
    return id
  }

  function deleteBot(id: string) {
    bots.value = bots.value.filter(b => b.id !== id)
    saveToDisk()
  }

  // 水军卡片拖拽排序后持久化
  function reorderBots(ordered: BotInstance[]) {
    bots.value = ordered
    saveToDisk()
  }

  function updateBot(id: string, updates: Partial<BotInstance>) {
    const idx = bots.value.findIndex(b => b.id === id)
    if (idx !== -1) {
      bots.value[idx] = { ...bots.value[idx], ...updates }
      saveToDisk()
      if (updates.screenX !== undefined || updates.screenY !== undefined) {
        const wfStore = useWorkflowStore()
        wfStore.syncBotCoords(id, bots.value[idx].screenX, bots.value[idx].screenY)
      }
    }
  }

  function getBotById(id: string): BotInstance | undefined {
    return bots.value.find(b => b.id === id)
  }

  function getBotsByIds(ids: string[]): BotInstance[] {
    return ids.map(id => bots.value.find(b => b.id === id)).filter(Boolean) as BotInstance[]
  }

  return { bots, addBot, deleteBot, reorderBots, updateBot, getBotById, getBotsByIds, loadFromDisk, saveToDisk }
})
