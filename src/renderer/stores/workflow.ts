import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BotCard, BotInstance, TaskStatus, TaskStep, SendMode, TaskMode, OperationStep, OperationMode } from '../../shared/types'

export const useWorkflowStore = defineStore('workflow', () => {
  const cards = ref<BotCard[]>([])
 const statusMap = ref<Record<string, TaskStatus>>({})
 const selectedId = ref<string | null>(null)
 let _loaded = false

 const drafts = computed(() => cards.value.filter(c => c.isDraft))
 const nonDraftCards = computed(() => cards.value.filter(c => !c.isDraft))

  async function loadFromDisk() {
    const data = await window.electronAPI.loadTasks()
    if (Array.isArray(data) && data.length > 0) {
      cards.value = data
      data.forEach((c: any) => { statusMap.value[c.id] = 'idle' })
    }
    _loaded = true
  }

  async function saveToDisk() {
    if (!_loaded) return
    try {
      await window.electronAPI.saveTasks(JSON.parse(JSON.stringify(cards.value)))
    } catch {}
  }

  function addTask(data: {
    name: string
    hotkey: string
    taskMode: TaskMode
    operationMode: OperationMode
    botCount: number
    sendMode: SendMode
    commentCount: number
    commentInterval: number
    operationInterval: number
    bots: BotInstance[]
    commentItems: { key: string; content: string; source: 'manual' | 'table'; mustSend: boolean }[]
    operationSteps: OperationStep[]
    preOperationSteps: OperationStep[]
    postOperationSteps: OperationStep[]
    linkageEnabled: boolean
    linkageDelay: number
    linkedTasks: { taskId: string; taskName: string; delay: number }[]
    groupId?: string
    interGroupId?: string
  }): string {
    const id = `task-${Date.now()}`
    const card: BotCard = {
      id,
      name: data.name,
      enabled: true,
      status: 'idle' as TaskStatus,
      steps: [],
      taskMode: data.taskMode,
      operationMode: data.operationMode,
      botCount: data.botCount,
      sendMode: data.sendMode,
      commentCount: data.commentCount,
      commentInterval: data.commentInterval,
      operationInterval: data.operationInterval,
      hotkey: data.hotkey,
      bots: data.bots,
      commentIds: data.commentItems.map(c => c.key),
      commentItems: data.commentItems,
      operationSteps: data.operationSteps,
 preOperationSteps: data.preOperationSteps,
 postOperationSteps: data.postOperationSteps,
 isDraft: data.isDraft,
  linkageEnabled: data.linkageEnabled,
  linkageDelay: data.linkageDelay,
  linkedTasks: data.linkedTasks,
  groupId: data.groupId || undefined,
  interGroupId: data.interGroupId || undefined,
 } as any
    cards.value.push(card)
    statusMap.value[id] = 'idle' as TaskStatus
    selectedId.value = id
    saveToDisk()
    return id
  }

  function deleteTask(taskId: string) {
    const idx = cards.value.findIndex(c => c.id === taskId)
    if (idx !== -1) {
      cards.value.splice(idx, 1)
      delete statusMap.value[taskId]
      if (selectedId.value === taskId) {
        selectedId.value = null
      }
      saveToDisk()
    }
  }

  function importTask(name: string, steps: TaskStep[]): string {
    const id = `task-${Date.now()}`
    const card: BotCard = {
      id,
      name,
      enabled: true,
      status: 'idle' as TaskStatus,
      steps,
      botCount: 1,
      sendMode: 'sequential' as SendMode,
      hotkey: '',
      bots: [{
        id: `${id}-bot-1`,
        name: '水军1',
        screenX: 0,
        screenY: 0,
        commentIds: [],
        stepInterval: 2000,
        enabled: true,
        status: 'idle' as TaskStatus,
      }],
    }
    cards.value.push(card)
    statusMap.value[id] = 'idle' as TaskStatus
    selectedId.value = id
    saveToDisk()
    return id
  }

  function getTaskById(taskId: string): BotCard | undefined {
    return cards.value.find(c => c.id === taskId)
  }

  // 组内重排：仅改变指定分组内卡片的相对顺序，其他分组顺序保持不动
  function reorderInGroup(groupId: string, orderedCards: BotCard[]) {
    const gid = groupId || 'group-default'
    const ordered = orderedCards.filter(c => (c.groupId || 'group-default') === gid)
    const rest = cards.value.filter(c => (c.groupId || 'group-default') !== gid)
    cards.value = [...rest, ...ordered]
    saveToDisk()
  }

  // 互动分组内重排：仅改变指定外层+互动分组内卡片的相对顺序
  function reorderInInterGroup(outerGroupId: string, interGroupId: string, orderedCards: BotCard[]) {
    const gid = outerGroupId || 'group-default'
    const iid = interGroupId || ''
    const ordered = orderedCards.filter(c =>
      (c.groupId || 'group-default') === gid && (c.interGroupId || '') === iid
    )
    const rest = cards.value.filter(c =>
      !((c.groupId || 'group-default') === gid && (c.interGroupId || '') === iid)
    )
    cards.value = [...rest, ...ordered]
    saveToDisk()
  }

  function updateCard(cardId: string, updates: Partial<BotCard>) {
    const idx = cards.value.findIndex(c => c.id === cardId)
    if (idx !== -1) {
      cards.value[idx] = { ...cards.value[idx], ...updates }
      saveToDisk()
    }
  }

  function updateBot(cardId: string, botId: string, updates: Partial<BotInstance>) {
    const card = cards.value.find(c => c.id === cardId)
    if (!card) return
    const botIdx = card.bots.findIndex(b => b.id === botId)
    if (botIdx !== -1) {
      card.bots[botIdx] = { ...card.bots[botIdx], ...updates }
    }
  }

  async function syncBotCoords(botId: string, screenX: number, screenY: number) {
    let changed = false
    for (const card of cards.value) {
      if (!card.bots) continue
      for (const bot of card.bots) {
        if (bot.id === botId) {
          bot.screenX = screenX
          bot.screenY = screenY
          changed = true
        }
      }
    }
    if (changed) await saveToDisk()
  }

  function updateStatus(cardId: string, status: TaskStatus) {
    statusMap.value[cardId] = status
    const card = cards.value.find(c => c.id === cardId)
    if (card) {
      card.status = status
      card.bots.forEach(b => b.status = status)
    }
  }

  function select(taskId: string | null) {
    selectedId.value = taskId
  }

  const selectedCard = computed(() =>
    cards.value.find(c => c.id === selectedId.value) ?? null
  )

  return {
 cards,
 drafts,
 nonDraftCards,
 statusMap,
 selectedId,
 selectedCard,
 addTask,
 deleteTask,
 importTask,
 getTaskById,
 reorderInGroup,
 reorderInInterGroup,
 updateCard,
 updateBot,
 syncBotCoords,
 updateStatus,
 select,
 loadFromDisk,
 saveToDisk,
 }
})