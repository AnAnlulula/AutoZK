import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TaskGroup, InteractGroup } from '../../shared/types'

export const DEFAULT_GROUP_ID = 'group-default'
const PALETTE = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#8e44ad', '#16a085', '#d35400']

export const useGroupStore = defineStore('group', () => {
  const groups = ref<TaskGroup[]>([])
  const interGroups = ref<InteractGroup[]>([])
  const activeGroupId = ref(DEFAULT_GROUP_ID)
  const activeInterGroupId = ref('')      // 当前查看的互动分组（视图切换）
  // 「启用分组」现在直接存储一个 interGroupId，表示哪套互动分组的快捷键生效
  const shortcutGroupId = ref('')
  let _loaded = false
  let _counter = 0

  const activeGroup = computed<TaskGroup>(() =>
    groups.value.find(g => g.id === activeGroupId.value) ?? { id: DEFAULT_GROUP_ID, name: '默认分组', color: PALETTE[0] }
  )

  // 当前外层分组下的互动分组列表
  const activeGroupInterGroups = computed<InteractGroup[]>(() =>
    interGroups.value.filter(g => g.outerGroupId === activeGroupId.value)
  )

  // 启用分组选中的互动分组对象
  const shortcutInterGroup = computed<InteractGroup | undefined>(() =>
    interGroups.value.find(g => g.id === shortcutGroupId.value)
  )

  // 启用分组选中的互动分组所属的外层分组 ID（用于星标提示）
  const shortcutOuterGroupId = computed<string>(() =>
    shortcutInterGroup.value?.outerGroupId || ''
  )

  function getNextColor(): string {
    return PALETTE[groups.value.length % PALETTE.length]
  }

  function taskGroupId(task: { groupId?: string }): string {
    return task.groupId || DEFAULT_GROUP_ID
  }

  function taskInterGroupId(task: { interGroupId?: string }): string {
    return task.interGroupId || ''
  }

  async function persist() {
    if (!_loaded) return
    try {
      await window.electronAPI.saveTaskGroups(
        JSON.parse(JSON.stringify(groups.value)),
        activeGroupId.value,
        shortcutGroupId.value,
        JSON.parse(JSON.stringify(interGroups.value)),
      )
    } catch {}
  }

  // 确保每个外层分组至少有一个互动分组（自动建"互动分组1"），并修正 activeInterGroupId 指向
  function ensureInterGroupsFor(outerId: string): string {
    const list = interGroups.value.filter(g => g.outerGroupId === outerId)
    if (list.length > 0) return list[0].id
    const id = `inter-${Date.now()}-${_counter++}`
    interGroups.value.push({ id, outerGroupId: outerId, name: '互动分组1' })
    return id
  }

  // 获取全局第一个互动分组 ID（兜底用）
  function firstInterGroupId(): string {
    if (interGroups.value.length > 0) return interGroups.value[0].id
    // 没有任何互动分组时，为第一个外层分组建一个
    const firstOuter = groups.value[0]?.id || DEFAULT_GROUP_ID
    return ensureInterGroupsFor(firstOuter)
  }

  async function loadFromDisk() {
    const data = await window.electronAPI.getTaskGroups()
    if (data && Array.isArray(data.groups)) {
      groups.value = data.groups
      if (data.activeGroupId) activeGroupId.value = data.activeGroupId
      if (data.shortcutGroupId) shortcutGroupId.value = data.shortcutGroupId
      if (Array.isArray(data.interGroups)) interGroups.value = data.interGroups
    }
    if (groups.value.length === 0) {
      groups.value = [{ id: DEFAULT_GROUP_ID, name: '默认分组', color: PALETTE[0] }]
      activeGroupId.value = DEFAULT_GROUP_ID
    }
    if (!groups.value.find(g => g.id === activeGroupId.value)) {
      activeGroupId.value = groups.value[0]?.id || DEFAULT_GROUP_ID
    }
    // 为每个外层分组确保至少有一个互动分组
    for (const g of groups.value) {
      ensureInterGroupsFor(g.id)
    }
    // 「启用分组」存的是一个 interGroupId，为空或无效时回退到全局第一个互动分组
    if (!shortcutGroupId.value || !interGroups.value.find(g => g.id === shortcutGroupId.value)) {
      shortcutGroupId.value = firstInterGroupId()
    }
    // 当前激活外层分组对应的查看互动分组，确保有值
    const activeOuter = activeGroupId.value
    const firstOfActive = ensureInterGroupsFor(activeOuter)
    if (!activeInterGroupId.value || !interGroups.value.find(x => x.id === activeInterGroupId.value && x.outerGroupId === activeOuter)) {
      activeInterGroupId.value = firstOfActive
    }
    _loaded = true
    await persist()
  }

  function createGroup(name: string): string {
    const id = `group-${Date.now()}-${_counter++}`
    const finalName = (name || '').trim() || `分组${groups.value.length + 1}`
    groups.value.push({ id, name: finalName, color: getNextColor() })
    // 新分组自动建一个互动分组1
    const interId = `inter-${Date.now()}-${_counter++}`
    interGroups.value.push({ id: interId, outerGroupId: id, name: '互动分组1' })
    persist()
    return id
  }

  function renameGroup(id: string, name: string) {
    const g = groups.value.find(x => x.id === id)
    if (g) {
      g.name = (name || '').trim() || g.name
      persist()
    }
  }

  // 调整分组顺序（管理分组里的拖拽排序）
  function reorderGroups(ordered: TaskGroup[]) {
    groups.value = ordered
    persist()
  }

  function deleteGroup(id: string) {
    // 仅删除分组本身；分组内任务由调用方迁移
    groups.value = groups.value.filter(g => g.id !== id)
    // 同步删除该外层下所有互动分组
    interGroups.value = interGroups.value.filter(g => g.outerGroupId !== id)
    if (activeGroupId.value === id) {
      const first = groups.value[0]?.id || DEFAULT_GROUP_ID
      activeGroupId.value = first
      activeInterGroupId.value = ensureInterGroupsFor(first)
    }
    if (groups.value.length === 0) {
      groups.value = [{ id: DEFAULT_GROUP_ID, name: '默认分组', color: PALETTE[0] }]
      activeGroupId.value = DEFAULT_GROUP_ID
      activeInterGroupId.value = ensureInterGroupsFor(DEFAULT_GROUP_ID)
    }
    // 启用分组选中的互动分组被删时，回退到全局第一个互动分组
    if (!shortcutGroupId.value || !interGroups.value.find(g => g.id === shortcutGroupId.value)) {
      shortcutGroupId.value = firstInterGroupId()
      window.electronAPI.setShortcutTaskGroup(shortcutGroupId.value)
      window.electronAPI.refreshAllTaskHotkeys()
    }
    persist()
  }

  async function setActive(groupId: string) {
    activeGroupId.value = groupId || DEFAULT_GROUP_ID
    // 切换外层分组时，确保该外层有互动分组可查看
    const first = ensureInterGroupsFor(activeGroupId.value)
    if (!activeInterGroupId.value || !interGroups.value.find(x => x.id === activeInterGroupId.value && x.outerGroupId === activeGroupId.value)) {
      activeInterGroupId.value = first
    }
    await window.electronAPI.setActiveTaskGroup(activeGroupId.value)
    await persist()
  }

  // 设置「启用分组」：参数为 interGroupId，表示该互动分组的快捷键生效
  async function setShortcut(interId: string) {
    shortcutGroupId.value = interId || firstInterGroupId()
    await window.electronAPI.setShortcutTaskGroup(shortcutGroupId.value)
    await persist()
  }

  // ============ 互动分组操作 ============

  function createInterGroup(outerGroupId: string, name?: string): string {
    const outer = outerGroupId || activeGroupId.value
    const siblings = interGroups.value.filter(g => g.outerGroupId === outer)
    const id = `inter-${Date.now()}-${_counter++}`
    const finalName = (name || '').trim() || `互动分组${siblings.length + 1}`
    interGroups.value.push({ id, outerGroupId: outer, name: finalName })
    persist()
    return id
  }

  function renameInterGroup(id: string, name: string) {
    const g = interGroups.value.find(x => x.id === id)
    if (g) {
      g.name = (name || '').trim() || g.name
      persist()
    }
  }

  function deleteInterGroup(id: string) {
    const g = interGroups.value.find(x => x.id === id)
    if (!g) return
    const siblings = interGroups.value.filter(x => x.outerGroupId === g.outerGroupId)
    if (siblings.length <= 1) return // 每个外层至少保留一个互动分组
    interGroups.value = interGroups.value.filter(x => x.id !== id)
    if (activeInterGroupId.value === id) {
      const next = interGroups.value.find(x => x.outerGroupId === g.outerGroupId)
      activeInterGroupId.value = next ? next.id : ''
    }
    // 启用分组选中的互动分组被删时，回退到同外层下一个互动分组
    if (shortcutGroupId.value === id) {
      const next = interGroups.value.find(x => x.outerGroupId === g.outerGroupId)
      shortcutGroupId.value = next ? next.id : firstInterGroupId()
      window.electronAPI.setShortcutTaskGroup(shortcutGroupId.value)
      window.electronAPI.refreshAllTaskHotkeys()
    }
    persist()
  }

  function reorderInterGroups(outerGroupId: string, ordered: InteractGroup[]) {
    const outer = outerGroupId || activeGroupId.value
    const orderedOfOuter = ordered.filter(g => g.outerGroupId === outer)
    const rest = interGroups.value.filter(g => g.outerGroupId !== outer)
    interGroups.value = [...rest, ...orderedOfOuter]
    persist()
  }

  async function setActiveInterGroup(interId: string) {
    activeInterGroupId.value = interId || ''
    await persist()
  }

  return {
    groups,
    interGroups,
    activeGroupId,
    activeInterGroupId,
    shortcutGroupId,
    activeGroup,
    activeGroupInterGroups,
    shortcutInterGroup,
    shortcutOuterGroupId,
    taskGroupId,
    taskInterGroupId,
    loadFromDisk,
    persist,
    createGroup,
    renameGroup,
    reorderGroups,
    deleteGroup,
    setActive,
    setShortcut,
    createInterGroup,
    renameInterGroup,
    deleteInterGroup,
    reorderInterGroups,
    setActiveInterGroup,
    ensureInterGroupsFor,
  }
})
