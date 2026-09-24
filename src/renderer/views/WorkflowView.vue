<template>
  <div class="workflow-view">
    <div ref="scrollTopSentinel" class="sticky-sentinel"></div>
    <div class="sticky-header" :class="{ stuck: headerStuck }">
    <div class="section-header">
      <div class="header-left">
        <h2>自动工作流</h2>
        <div class="shortcut-group-wrap">
          <span class="shortcut-group-label">启用分组</span>
          <el-select
            v-model="groupStore.shortcutGroupId"
            class="enable-group-select"
            :style="shortcutSel ? { '--slcolor': shortcutSel.color } : {}"
            placeholder="选择互动分组"
            size="default"
            @change="handleShortcutGroupChange"
          >
            <template #label>
              <span v-if="shortcutSel" class="enable-group-selected">
                <span class="shortcut-opt-outer">{{ shortcutSel.outerName }}</span>
                <span class="shortcut-opt-sep"> / </span>
                <span class="shortcut-opt-inter">{{ shortcutSel.interName }}</span>
              </span>
              <span v-else class="shortcut-opt-outer">选择互动分组</span>
            </template>
            <el-option
              v-for="ig in groupStore.interGroups"
              :key="ig.id"
              :value="ig.id"
              :label="interLabel(ig)"
            >
              <span class="shortcut-opt-outer">{{ groupNameOf(ig.outerGroupId) }}</span>
              <span class="shortcut-opt-sep"> / </span>
              <span class="shortcut-opt-inter">{{ ig.name }}</span>
            </el-option>
          </el-select>
        </div>
        <span class="global-disable-label" :class="{ active: globalDisabled }" @click="toggleGlobalDisable">全部禁用</span>
        <el-switch
          v-model="globalDisabled"
          style="margin-left: 0.5em"
          @change="onGlobalDisabledChange"
        />
      </div>
      <el-space>
        <el-button @click="showDraftBox = true">
          <el-icon><Document /></el-icon>
          草稿箱
          <el-badge v-if="store.drafts.length > 0" :value="store.drafts.length" type="warning" style="margin-left: 4px" />
        </el-button>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建任务
        </el-button>
        <el-button type="danger" @click="openBatchDelete">
          <el-icon><Delete /></el-icon>
          删除
        </el-button>
        <el-button @click="importTask">
          <el-icon><Download /></el-icon>
          导入
        </el-button>
        <el-button @click="openBatchExport">
          <el-icon><Upload /></el-icon>
          导出
        </el-button>
      </el-space>
    </div>

    <!-- 分组切换栏 -->
    <div ref="groupBarRef" class="group-bar">
      <span class="group-bar-title">分组</span>
      <div
        v-for="g in groupStore.groups"
        :key="g.id"
        class="group-chip"
        :class="{ active: g.id === groupStore.activeGroupId, enabled: g.id === groupStore.shortcutOuterGroupId }"
        :style="{ '--gcolor': g.color }"
        :title="g.name"
        @click="switchGroup(g.id)"
      >
        <span class="group-name">{{ g.name }}</span>
        <el-tooltip
          v-if="g.id === groupStore.shortcutOuterGroupId"
          content="启用中"
          placement="top"
          :show-after="200"
        >
          <span class="group-star"><el-icon><StarFilled /></el-icon></span>
        </el-tooltip>
      </div>
      <div class="group-bar-actions">
        <el-button size="small" @click="createGroup">
          <el-icon><Plus /></el-icon>新建分组
        </el-button>
        <el-button size="small" @click="showManageGroup = true">
          <el-icon><Setting /></el-icon>管理分组
        </el-button>
      </div>
    </div>

    <!-- 互动分组切换栏 -->
    <div class="inter-group-bar">
      <div class="inter-group-bar-row inter-group-bar-row-top">
        <span class="inter-group-title">互动分组</span>
        <div class="inter-group-actions">
          <el-button size="small" @click="createInterGroup">
            <el-icon><Plus /></el-icon>新建互动分组
          </el-button>
          <el-button size="small" @click="showManageInterGroup = true">
            <el-icon><Setting /></el-icon>管理互动分组
          </el-button>
        </div>
      </div>
      <div class="inter-group-bar-row inter-group-bar-row-nav">
        <div
          v-for="ig in groupStore.activeGroupInterGroups"
          :key="ig.id"
          class="inter-group-chip"
          :class="{ active: ig.id === groupStore.activeInterGroupId, enabled: ig.id === groupStore.shortcutGroupId }"
          :title="ig.name"
          @click="switchInterGroup(ig.id)"
        >
          <span class="inter-group-name">{{ ig.name }}</span>
          <el-tooltip
            v-if="ig.id === groupStore.shortcutGroupId"
            content="生效中"
            placement="top"
            :show-after="200"
          >
            <span class="inter-group-star"><el-icon><StarFilled /></el-icon></span>
          </el-tooltip>
        </div>
      </div>
    </div>
    </div><!-- /sticky-header -->

    <div v-show="draggableCards.length === 0" class="empty-state">
      <el-empty description="暂无任务" />
      <p>点击「新建任务」或「导入」开始</p>
    </div>

    <div v-show="draggableCards.length > 0" class="card-list-wrap">
      <draggable
        v-model="draggableCards"
        item-key="id"
        class="card-grid"
        ghost-class="drag-ghost"
        :animation="200"
        @end="onCardDragEnd"
      >
        <template #item="{ element: card }">
      <div
        class="card-wrapper"
        :class="{ selected: store.selectedId === card.id }"
        @click="store.select(card.id)"
      >
        <el-card shadow="hover" :class="`status-${card.status}`">
          <template #header>
            <div class="card-header">
              <span class="card-title">{{ card.name }}</span>
              <div class="card-header-right">
                <span class="mode-badge" :class="`mode-${card.taskMode || 'comment'}`">{{ modeLabel(card.taskMode) }}</span>
                <span v-if="card.hotkey" class="hotkey-tag">
                  <span class="hotkey-label">快捷键</span>
                  <span class="hotkey-value">{{ card.hotkey }}</span>
                </span>
              </div>
            </div>
          </template>

          <div class="card-body">
            <template v-if="(card.taskMode || 'comment') === 'link'">
              <div class="info-row">
                <span class="info-label">商品ID</span>
                <el-tag size="small">{{ card.linkProductId || '未填写' }}</el-tag>
              </div>
              <div class="info-row">
                <span class="info-label">修改链接号为</span>
                <el-tag size="small" type="info">{{ card.linkNumber || '1' }}</el-tag>
              </div>
              <div class="info-row">
                <span class="info-label">坐标</span>
                <el-tag size="small" :type="linkCoordCount(card) === 3 ? 'success' : 'danger'">
                  {{ linkCoordCount(card) }}/3 已配置
                </el-tag>
              </div>
            </template>
            <template v-else>
              <div class="info-row">
                <span class="info-label">水军数量</span>
                <el-tag size="small">{{ card.bots.length }}</el-tag>
              </div>
              <div class="info-row">
                <span class="info-label">发送顺序</span>
                <el-tag size="small" :type="card.sendMode === 'sequential' ? 'info' : 'warning'">
                  {{ card.sendMode === 'sequential' ? '顺序' : '随机' }}
                </el-tag>
                <el-tag size="small" type="info" style="margin-left: 4px">
                  {{ (card.commentCount ?? 0) > 0 ? card.commentCount + '条' : '全部' }}
                </el-tag>
                <el-tag size="small" type="info" style="margin-left: 4px">
                  {{ (card.commentInterval ?? 500) }}ms
                </el-tag>
              </div>
              <div class="info-row">
                <span class="info-label">评论绑定</span>
                <el-tag size="small" :type="card.commentItems?.length > 0 ? 'success' : 'info'">
                  {{ card.commentItems?.length ?? 0 }} 条
                </el-tag>
              </div>
            </template>
            <div class="info-row">
              <span class="info-label">任务联动</span>
              <el-tag size="small" effect="plain" :type="card.linkageEnabled ? 'success' : 'danger'">
                {{ card.linkageEnabled ? '已开启' : '未开启' }}
              </el-tag>
            </div>
          </div>

          <div class="card-actions">
            <div class="card-actions-left">
              <el-switch
                v-model="card.enabled"
                size="small"
                @change="handleTaskEnable(card)"
              />
              <span class="enable-hint" :class="{ on: card.enabled }">{{ card.enabled ? '启用' : '停用' }}</span>
            </div>
            <el-button type="primary" size="small" @click.stop="handleEdit(card)">编辑</el-button>
          </div>
          </el-card>
        </div>
        </template>
      </draggable>
    </div>

    <TaskCreateDialog
      v-model:visible="showCreateDialog"
      @create="handleCreate"
    />
    <TaskCreateDialog
      v-model:visible="showEditDialog"
      :edit-data="editingTask"
      @create="handleUpdate"
      @copy-to-group="openCopyDialog"
    />

    <!-- 草稿箱弹窗 -->
    <el-dialog v-model="showDraftBox" title="草稿箱" width="500px">
      <div v-if="store.drafts.length === 0" class="draft-empty">
        <el-empty description="暂无草稿" :image-size="60" />
      </div>
      <div v-else class="draft-list">
        <div v-for="draft in store.drafts" :key="draft.id" class="draft-item">
          <span class="draft-name">{{ draft.name }}</span>
          <div class="draft-actions">
            <el-button text type="primary" size="small" @click="editDraft(draft)">编辑</el-button>
            <el-button text type="danger" size="small" @click="deleteDraft(draft.id)">删除</el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 管理分组弹窗 -->
    <el-dialog v-model="showManageGroup" title="管理分组" width="460px">
      <div class="manage-group-tip">拖动可调整分组顺序</div>
      <draggable
        v-model="manageGroups"
        item-key="id"
        class="manage-group-list"
        ghost-class="drag-ghost"
        :animation="200"
        @end="onGroupDragEnd"
      >
        <template #item="{ element: g }">
          <div
            class="manage-group-item"
            :class="{ active: g.id === groupStore.activeGroupId }"
          >
            <span class="manage-group-tag" :style="{ '--gcolor': g.color }">{{ g.name }}</span>
            <div class="manage-group-actions">
              <el-button text type="primary" size="small" @click="renameGroup(g)">改名</el-button>
              <el-button text type="danger" size="small" @click="deleteGroup(g)">删除</el-button>
            </div>
          </div>
        </template>
      </draggable>
      <template #footer>
        <div class="manage-group-footer">
          <el-button @click="showManageGroup = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 管理互动分组弹窗 -->
    <el-dialog v-model="showManageInterGroup" title="管理互动分组" width="460px">
      <div class="manage-group-tip">拖动可调整互动分组顺序</div>
      <draggable
        v-model="manageInterGroups"
        item-key="id"
        class="manage-group-list"
        ghost-class="drag-ghost"
        :animation="200"
        @end="onInterGroupDragEnd"
      >
        <template #item="{ element: ig }">
          <div
            class="manage-group-item"
            :class="{ active: ig.id === groupStore.activeInterGroupId }"
          >
            <span class="manage-inter-tag">{{ ig.name }}</span>
            <div class="manage-group-actions">
              <el-button text type="primary" size="small" @click="renameInterGroup(ig)">改名</el-button>
              <el-button text type="danger" size="small" @click="deleteInterGroup(ig)">删除</el-button>
            </div>
          </div>
        </template>
      </draggable>
      <template #footer>
        <div class="manage-group-footer">
          <el-button @click="showManageInterGroup = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 复制到分组弹窗 -->
    <el-dialog v-model="showCopyDialog" title="复制到分组" width="520px">
      <div class="copy-dialog-body">
        <div class="copy-panel copy-panel-left">
          <div class="copy-panel-title">外层分组</div>
          <div class="copy-panel-list">
            <div
              v-for="g in groupStore.groups"
              :key="g.id"
              class="copy-panel-item"
              :class="{ active: copyTargetOuterId === g.id }"
              @click="selectCopyOuter(g.id)"
            >
              <span class="copy-item-tag" :style="{ '--gcolor': g.color }">{{ g.name }}</span>
            </div>
          </div>
        </div>
        <div class="copy-panel copy-panel-right">
          <div class="copy-panel-title">互动分组</div>
          <div v-if="copyTargetInters.length === 0" class="copy-empty">该分组暂无互动分组</div>
          <div v-else class="copy-panel-list">
            <div
              v-for="ig in copyTargetInters"
              :key="ig.id"
              class="copy-panel-item"
              :class="{ active: copyTargetInterId === ig.id }"
              @click="copyTargetInterId = ig.id"
            >
              <span class="copy-item-name">{{ ig.name }}</span>
              <span class="copy-item-count">{{ interGroupTaskCount(ig.id) }}</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showCopyDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCopyTask" :disabled="!copyTargetOuterId || !copyTargetInterId">确认复制</el-button>
      </template>
    </el-dialog>

    <!-- 批量删除/导出弹窗 -->
    <el-dialog v-model="showBatchDialog" :title="batchMode === 'delete' ? '批量删除任务' : '批量导出任务'" width="480px">
      <div class="batch-tip">
        {{ batchMode === 'delete' ? '勾选要删除的任务（当前分组内）：' : '勾选要导出的任务（当前分组内）：' }}
        <el-checkbox
          v-if="batchTasks.length > 0"
          class="batch-select-all"
          :model-value="batchAllChecked"
          @change="(val: any) => toggleBatchSelectAll(!!val)"
        >全选</el-checkbox>
        <span class="batch-count">已选 {{ batchSelectedIds.length }} / {{ batchTasks.length }}</span>
      </div>
      <div v-if="batchTasks.length === 0" class="batch-empty">
        <el-empty description="当前分组暂无任务" :image-size="60" />
      </div>
      <div v-else class="batch-list">
        <div
          v-for="t in batchTasks"
          :key="t.id"
          class="batch-item"
          :class="{ selected: batchSelectedIds.includes(t.id) }"
          @click="toggleBatchSelect(t.id, !batchSelectedIds.includes(t.id))"
        >
          <el-checkbox
            :model-value="batchSelectedIds.includes(t.id)"
            @click.stop
            @change="(val) => toggleBatchSelect(t.id, !!val)"
          >
            <span class="batch-item-name">{{ t.name }}</span>
          </el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="showBatchDialog = false">取消</el-button>
        <el-button
          v-if="batchMode === 'delete'"
          type="danger"
          :disabled="batchSelectedIds.length === 0"
          @click="confirmBatchDelete"
        >删除</el-button>
        <el-button
          v-else
          type="primary"
          :disabled="batchSelectedIds.length === 0"
          @click="confirmBatchExport"
        >导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import draggable from 'vuedraggable'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Download, Upload, Document, Setting, StarFilled } from '@element-plus/icons-vue'
import { useWorkflowStore } from '../stores/workflow'
import { useCommentStore } from '../stores/comments'
import { useGroupStore, DEFAULT_GROUP_ID } from '../stores/groups'
import TaskCreateDialog from '../components/TaskCreateDialog.vue'
import type { BotCard, TaskGroup, InteractGroup } from '../../shared/types'

const store = useWorkflowStore()
const commentStore = useCommentStore()
const groupStore = useGroupStore()
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDraftBox = ref(false)
const showManageGroup = ref(false)
const showManageInterGroup = ref(false)
const showCopyDialog = ref(false)
const editingTask = ref<BotCard | null>(null)
const globalDisabled = ref(false)
// 复制到分组相关
const copyTargetOuterId = ref('')
const copyTargetInterId = ref('')

// 吸顶仅在滚动到标题行离开视野时激活（内容不足不可滚动时不悬浮）
const headerStuck = ref(false)
const scrollTopSentinel = ref<HTMLElement | null>(null)
let stickyObserver: IntersectionObserver | null = null

const activeGroupCards = computed(() =>
  store.nonDraftCards.filter(c =>
    groupStore.taskGroupId(c) === groupStore.activeGroupId &&
    (c.interGroupId || '') === groupStore.activeInterGroupId
  )
)

// 当前「启用分组」选中的互动分组所属外层分组（用于选中胶囊上色与选中项蓝橙文字）
const shortcutSel = computed(() => {
  const inter = groupStore.shortcutInterGroup
  if (!inter) return null
  const g = groupStore.groups.find(x => x.id === inter.outerGroupId)
  if (!g) return null
  return { color: g.color, name: g.name, outerName: g.name, interName: inter.name, interId: inter.id }
})

// 互动分组下拉框选项标签：「分组名 / 互动分组名」
function interLabel(ig: { outerGroupId: string; name: string }): string {
  return `${groupNameOf(ig.outerGroupId)} / ${ig.name}`
}

// 根据外层分组 ID 获取分组名
function groupNameOf(outerId: string): string {
  return groupStore.groups.find(x => x.id === outerId)?.name || outerId
}

// 当前分组卡片的可排序视图（拖拽用），随分组/任务变化同步
const draggableCards = ref<BotCard[]>([])
watch(activeGroupCards, (val) => {
  draggableCards.value = val
}, { immediate: true })

// 管理分组弹窗内的分组排序视图
const manageGroups = ref<TaskGroup[]>([])
watch(() => groupStore.groups, (val) => {
  manageGroups.value = [...val]
}, { immediate: true, deep: true })

// 管理互动分组弹窗内的排序视图
const manageInterGroups = ref<InteractGroup[]>([])
watch(() => groupStore.activeGroupInterGroups, (val) => {
  manageInterGroups.value = [...val]
}, { immediate: true, deep: true })

// 复制到分组 - 目标外层分组下的互动分组列表
const copyTargetInters = computed(() =>
  copyTargetOuterId.value ? groupStore.interGroups.filter(g => g.outerGroupId === copyTargetOuterId.value) : []
)

// 统计某个互动分组下所有正式任务的数量（含当前正在编辑/复制的任务）
function interGroupTaskCount(interGroupId: string): number {
  return store.nonDraftCards.filter(c => (c.interGroupId || '') === interGroupId).length
}

function onCardDragEnd() {
  store.reorderInInterGroup(groupStore.activeGroupId, groupStore.activeInterGroupId, draggableCards.value)
}

function onGroupDragEnd() {
  groupStore.reorderGroups([...manageGroups.value])
}

function onInterGroupDragEnd() {
  groupStore.reorderInterGroups(groupStore.activeGroupId, [...manageInterGroups.value])
}

function modeLabel(mode: string): string {
  if (mode === 'mouse') return '操作鼠标'
  if (mode === 'mixed') return '混合操作'
  if (mode === 'link') return '上链接'
  return '发评论'
}

function linkCoordCount(card: any): number {
  return [card.linkSearchPos, card.linkExplainPos, card.linkNumberPos].filter(Boolean).length
}

function toggleGlobalDisable() {
  globalDisabled.value = !globalDisabled.value
  onGlobalDisabledChange(globalDisabled.value)
}

function onGlobalDisabledChange(val: boolean) {
  if (val) {
    window.electronAPI.stopAllTaskHotkeys()
    for (const card of store.cards) {
      if (card.hotkey) {
        window.electronAPI.unregisterTaskHotkey(card.id)
      }
    }
    window.electronAPI.clearRunningTasks()
    showGlobalDisableNotify('已全局禁用所有快捷键', 'warning')
  } else {
    // 恢复时按当前「启用分组」与任务启用状态重新注册
    window.electronAPI.refreshAllTaskHotkeys()
    showGlobalDisableNotify('已恢复分组快捷键', 'success')
  }
}

// 全部禁用通知：悬浮在外层分组栏正中间，显示 1 秒，不遮挡上方的「全部禁用」开关
const groupBarRef = ref<HTMLElement | null>(null)
let globalNotifyTimer: ReturnType<typeof setTimeout> | null = null
function showGlobalDisableNotify(message: string, type: 'success' | 'warning') {
  let offset = 80
  if (groupBarRef.value) {
    const barRect = groupBarRef.value.getBoundingClientRect()
    offset = barRect.top + barRect.height / 2 + 20
  }
  ElMessage({
    message,
    type,
    duration: 1000,
    offset,
    customClass: 'global-disable-message',
  })
  clearTimeout(globalNotifyTimer ?? undefined)
  globalNotifyTimer = setTimeout(() => { globalNotifyTimer = null }, 1200)
}

function handleCreate(data: any) {
  data.groupId = groupStore.activeGroupId
  data.interGroupId = groupStore.activeInterGroupId
  store.addTask(data)
  if (data.isDraft) {
    ElMessage.info(`草稿「${data.name}」已保存`)
  } else {
    ElMessage.success(`任务「${data.name}」已创建`)
    if (data.hotkey && !globalDisabled.value) {
      const card = store.cards[store.cards.length - 1]
      if (card) {
        window.electronAPI.registerTaskHotkey(card.id, data.hotkey)
      }
    }
  }
}

function handleEdit(card: BotCard) {
  editingTask.value = card
  showEditDialog.value = true
}

function handleUpdate(data: any) {
  if (!editingTask.value) return
  const cardId = editingTask.value.id
  store.updateCard(cardId, {
    name: data.name,
    hotkey: data.hotkey,
    taskMode: data.taskMode,
    operationMode: data.operationMode,
    bots: data.bots,
    sendMode: data.sendMode,
    commentCount: data.commentCount,
    commentInterval: data.commentInterval,
    operationInterval: data.operationInterval,
    botCount: data.botCount,
    commentItems: data.commentItems,
    commentIds: data.commentItems.map((c: any) => c.key),
    operationSteps: data.operationSteps,
    preOperationSteps: data.preOperationSteps,
    postOperationSteps: data.postOperationSteps,
    linkProductId: data.linkProductId,
    linkSearchPos: data.linkSearchPos,
    linkExplainPos: data.linkExplainPos,
    linkNumberPos: data.linkNumberPos,
    linkNumber: data.linkNumber,
    linkDelays: data.linkDelays,
    isDraft: data.isDraft,
    linkageEnabled: data.linkageEnabled,
    linkageDelay: data.linkageDelay,
    linkedTasks: data.linkedTasks,
    interGroupId: data.interGroupId,
  })
  // 重新注册快捷键
  if (data.hotkey && !globalDisabled.value) {
    window.electronAPI.registerTaskHotkey(cardId, data.hotkey)
  } else {
    window.electronAPI.unregisterTaskHotkey(cardId)
  }
  ElMessage.success(`任务「${data.name}」已更新`)
  editingTask.value = null
}

const showBatchDialog = ref(false)
const batchMode = ref<'delete' | 'export'>('delete')
const batchSelectedIds = ref<string[]>([])
const batchTasks = activeGroupCards

function openBatchDelete() {
  batchMode.value = 'delete'
  batchSelectedIds.value = []
  showBatchDialog.value = true
}

function openBatchExport() {
  batchMode.value = 'export'
  batchSelectedIds.value = []
  showBatchDialog.value = true
}

function toggleBatchSelect(id: string, checked: boolean) {
  if (checked) {
    if (!batchSelectedIds.value.includes(id)) batchSelectedIds.value.push(id)
  } else {
    batchSelectedIds.value = batchSelectedIds.value.filter(x => x !== id)
  }
}

// 全选状态：全部选中时为 true（勾选），否则为 false（不勾）
const batchAllChecked = computed(() =>
  batchTasks.value.length > 0 && batchSelectedIds.value.length === batchTasks.value.length
)
function toggleBatchSelectAll(checked: boolean) {
  batchSelectedIds.value = checked ? batchTasks.value.map((t: any) => t.id) : []
}

async function confirmBatchDelete() {
  const ids = batchSelectedIds.value
  if (ids.length === 0) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个任务？`, '批量删除', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  for (const id of ids) {
    const card = store.getTaskById(id)
    if (card?.hotkey) window.electronAPI.unregisterTaskHotkey(id)
    store.deleteTask(id)
  }
  ElMessage.success(`已删除 ${ids.length} 个任务`)
  showBatchDialog.value = false
}

async function confirmBatchExport() {
  const ids = batchSelectedIds.value
  if (ids.length === 0) return
  const tasks = ids.map(id => store.getTaskById(id)).filter((t): t is BotCard => !!t)
  if (tasks.length === 0) return
  const result = await window.electronAPI.exportTaskFiles(JSON.parse(JSON.stringify(tasks)))
  if (result?.ok) {
    ElMessage.success(`已导出 ${result.count} 个任务`)
    showBatchDialog.value = false
  } else if (result?.canceled) {
    // 用户取消选择目录
  }
}

let importSeq = 0

function importOneTask(task: any): void {
  // 自动添加评论表格中不存在的评论（无论手动输入还是表格选择）
  if (task.commentItems && Array.isArray(task.commentItems)) {
    for (const ci of task.commentItems) {
      const exists = commentStore.comments.find(c => c.id === ci.key || c.content === ci.content)
      if (!exists) {
        commentStore.addComment(ci.content)
      }
    }
  }

  // 生成新 ID 避免冲突（追加自增序号，避免同一毫秒内导入多个任务时 ID 重复）
  const newId = `task-${Date.now()}-${importSeq++}`
  const newTask: any = {
    ...task,
    id: newId,
    enabled: true,
    status: 'idle',
    groupId: groupStore.activeGroupId,
    interGroupId: groupStore.activeInterGroupId,
    // 导入后联动关系失效（linkedTasks 指向原任务 ID），自动关闭并清空
    linkageEnabled: false,
    linkedTasks: [],
  }
  store.cards.push(newTask)
  store.saveToDisk()

  // 注册快捷键
  if (newTask.hotkey && !globalDisabled.value) {
    window.electronAPI.registerTaskHotkey(newId, newTask.hotkey)
  }
}

async function importTask() {
  const result = await window.electronAPI.importTaskFiles()
  if (!result) return
  const tasks = (result.tasks || []).filter((t: any) => t && t.name)
  const skipped = result.errors?.length || 0
  if (tasks.length === 0) {
    if (skipped > 0) {
      ElMessage.error(`没有可导入的有效任务（${skipped} 个文件无效）`)
    } else {
      ElMessage.warning('未选择任何任务文件')
    }
    return
  }
  for (const task of tasks) {
    importOneTask(task)
  }
  const last = store.cards[store.cards.length - 1]
  if (last) store.select(last.id)
  ElMessage.success(`已导入 ${tasks.length} 个任务`)
  if (skipped > 0) {
    ElMessage.warning(`有 ${skipped} 个无效文件已跳过`)
  }
}

function editDraft(draft: BotCard) {
  showDraftBox.value = false
  editingTask.value = draft
  showEditDialog.value = true
}

async function deleteDraft(draftId: string) {
  try {
    await ElMessageBox.confirm('确定删除此草稿？', '删除确认', { type: 'warning' })
    store.deleteTask(draftId)
    ElMessage.success('草稿已删除')
  } catch { /* 取消 */ }
}

onMounted(async () => {
  const sentinel = scrollTopSentinel.value
  if (sentinel && 'IntersectionObserver' in window) {
    stickyObserver = new IntersectionObserver((entries) => {
      headerStuck.value = !entries[0].isIntersecting
    })
    stickyObserver.observe(sentinel)
  }
  await Promise.all([store.loadFromDisk(), groupStore.loadFromDisk()])
  // 迁移：旧任务（无分组）自动归入默认分组
  // 迁移：无互动分组的任务归入其外层分组的第一个互动分组
  let migrated = false
  for (const c of store.cards) {
    if (!c.groupId) {
      c.groupId = DEFAULT_GROUP_ID
      migrated = true
    }
    if (!c.interGroupId) {
      const firstInter = groupStore.interGroups.find(g => g.outerGroupId === (c.groupId || DEFAULT_GROUP_ID))
      if (firstInter) {
        c.interGroupId = firstInter.id
        migrated = true
      }
    }
  }
  if (migrated) await store.saveToDisk()
})

onUnmounted(() => {
  stickyObserver?.disconnect()
  stickyObserver = null
})

// 切换分组仅负责"查看"，不影响任何快捷键；快捷键由「启用分组」独立控制
async function switchGroup(groupId: string) {
  if (groupId === groupStore.activeGroupId) return
  await groupStore.setActive(groupId)
}

// 切换互动分组（仅视图切换）
async function switchInterGroup(interId: string) {
  if (interId === groupStore.activeInterGroupId) return
  await groupStore.setActiveInterGroup(interId)
}

// 「启用分组」下拉变化：切换生效的互动分组，保存并同步主进程，非全局禁用时重注册快捷键
async function handleShortcutGroupChange() {
  await groupStore.setShortcut(groupStore.shortcutGroupId)
  if (!globalDisabled.value) {
    await window.electronAPI.refreshAllTaskHotkeys()
  }
}

// 任务级启用开关：切换后的状态同样参与快捷键注册
async function handleTaskEnable(card: BotCard) {
  store.updateCard(card.id, { enabled: card.enabled })
  await store.saveToDisk()
  if (!globalDisabled.value) {
    await window.electronAPI.refreshAllTaskHotkeys()
  }
}

async function createGroup() {
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^\S+$/,
      inputErrorMessage: '分组名称不能为空',
    })
    const id = groupStore.createGroup(value)
    await switchGroup(id)
    ElMessage.success(`已创建并切换到分组「${groupStore.groups.find(g => g.id === id)?.name}」`)
  } catch { /* 取消 */ }
}

async function renameGroup(g: TaskGroup) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的分组名称', '重命名分组', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: g.name,
      inputPattern: /^\S+$/,
      inputErrorMessage: '分组名称不能为空',
    })
    groupStore.renameGroup(g.id, value)
    ElMessage.success('分组已重命名')
  } catch { /* 取消 */ }
}

async function deleteGroup(g: TaskGroup) {
  if (groupStore.groups.length <= 1) {
    ElMessage.warning('至少保留一个分组')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除分组「${g.name}」？该分组内的任务将移入默认分组。`,
      '删除分组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const migrating = store.cards.filter(c => groupStore.taskGroupId(c) === g.id)
  const wasActive = groupStore.activeGroupId === g.id
  // 找默认外层分组的第一个互动分组
  const firstInterOfDefault = groupStore.interGroups.find(ig => ig.outerGroupId === DEFAULT_GROUP_ID)
    ?? groupStore.interGroups[0]
  for (const c of migrating) {
    c.groupId = DEFAULT_GROUP_ID
    if (firstInterOfDefault) c.interGroupId = firstInterOfDefault.id
  }
  await store.saveToDisk()
  groupStore.deleteGroup(g.id)
  if (!globalDisabled.value) {
    // 旧激活组被删除时，其任务归入默认组并需恢复快捷键
    for (const c of migrating) {
      if (c.hotkey) await window.electronAPI.unregisterTaskHotkey(c.id)
    }
    if (wasActive) {
      for (const c of store.cards) {
        if (!c.hotkey || c.isDraft) continue
        if (groupStore.taskGroupId(c) === groupStore.activeGroupId) {
          await window.electronAPI.registerTaskHotkey(c.id, c.hotkey)
        }
      }
    }
    await window.electronAPI.refreshAllTaskHotkeys()
  }
  ElMessage.success(`已删除分组「${g.name}」`)
}

// ===== 互动分组操作 =====

async function createInterGroup() {
  try {
    const { value } = await ElMessageBox.prompt('请输入互动分组名称', '新建互动分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^\S+$/,
      inputErrorMessage: '互动分组名称不能为空',
    })
    const id = groupStore.createInterGroup(groupStore.activeGroupId, value)
    await groupStore.setActiveInterGroup(id)
    ElMessage.success(`已创建并切换到互动分组「${groupStore.interGroups.find(g => g.id === id)?.name}」`)
  } catch { /* 取消 */ }
}

async function renameInterGroup(ig: InteractGroup) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的互动分组名称', '重命名互动分组', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: ig.name,
      inputPattern: /^\S+$/,
      inputErrorMessage: '互动分组名称不能为空',
    })
    groupStore.renameInterGroup(ig.id, value)
    ElMessage.success('互动分组已重命名')
  } catch { /* 取消 */ }
}

async function deleteInterGroup(ig: InteractGroup) {
  const siblings = groupStore.interGroups.filter(g => g.outerGroupId === ig.outerGroupId)
  if (siblings.length <= 1) {
    ElMessage.warning('每个外层分组至少保留一个互动分组')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除互动分组「${ig.name}」？该分组内的任务将移入同外层的第一个互动分组。`,
      '删除互动分组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  // 迁移任务到同外层第一个互动分组
  const firstInter = siblings.find(s => s.id !== ig.id)
  if (firstInter) {
    const migrating = store.cards.filter(c => c.interGroupId === ig.id)
    for (const c of migrating) c.interGroupId = firstInter.id
    await store.saveToDisk()
  }
  groupStore.deleteInterGroup(ig.id)
  if (!globalDisabled.value) {
    await window.electronAPI.refreshAllTaskHotkeys()
  }
  ElMessage.success(`已删除互动分组「${ig.name}」`)
}

// ===== 复制到分组 =====

function openCopyDialog() {
  if (!editingTask.value) return
  copyTargetOuterId.value = groupStore.activeGroupId
  copyTargetInterId.value = groupStore.activeInterGroupId
  showCopyDialog.value = true
}

function selectCopyOuter(outerId: string) {
  copyTargetOuterId.value = outerId
  // 确保目标外层分组有互动分组，没有则自动建一个"互动分组1"
  const first = groupStore.ensureInterGroupsFor(outerId)
  copyTargetInterId.value = first
}

async function confirmCopyTask() {
  if (!editingTask.value || !copyTargetOuterId.value || !copyTargetInterId.value) return
  const src = editingTask.value
  const newId = `task-${Date.now()}`
  const newName = src.name + ' 副本'
  const newCard: any = {
    ...JSON.parse(JSON.stringify(src)),
    id: newId,
    name: newName,
    groupId: copyTargetOuterId.value,
    interGroupId: copyTargetInterId.value,
    enabled: true,
    status: 'idle',
    // 复制到新分组后联动关系失效（linkedTasks 指向原任务 ID），自动关闭并清空
    linkageEnabled: false,
    linkedTasks: [],
  }
  store.cards.push(newCard)
  await store.saveToDisk()
  showCopyDialog.value = false
  // 注册快捷键
  if (newCard.hotkey && !globalDisabled.value) {
    window.electronAPI.registerTaskHotkey(newId, newCard.hotkey)
  }
  ElMessage.success(`已复制任务到目标分组`)
  // 询问是否切换到目标分组查看
  try {
    await ElMessageBox.confirm('是否切换到目标分组查看？', '复制成功', {
      confirmButtonText: '去查看',
      cancelButtonText: '留在当前',
      type: 'success',
    })
    // 关闭编辑弹窗和复制弹窗
    showEditDialog.value = false
    editingTask.value = null
    showCopyDialog.value = false
    await groupStore.setActive(copyTargetOuterId.value)
    await groupStore.setActiveInterGroup(copyTargetInterId.value)
    store.select(newId)
  } catch { /* 留在当前 */ }
}
</script>

<style scoped>
.group-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.group-bar-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.group-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border: 1.5px solid var(--gcolor, #909399);
  border-radius: 15%;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
  font-size: 13px;
}
.group-chip:hover { background: color-mix(in srgb, var(--gcolor, #409eff) 8%, white); }
.group-chip.active {
  background: color-mix(in srgb, var(--gcolor, #409eff) 15%, white);
  font-weight: 600;
  box-shadow: 0 0 0 1.5px var(--gcolor, #409eff);
}
.group-chip.enabled .group-star {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  color: #fadb14;
  font-size: 12px;
}
.group-name { line-height: 1.3; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-bar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.manage-group-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}
.manage-group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  transition: background 0.15s;
}
.manage-group-item.active { background: var(--el-fill-color-light); }
.manage-group-tag {
  padding: 2px 12px;
  border: 1.5px solid var(--gcolor, #909399);
  border-radius: 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.manage-group-actions { display: flex; gap: 4px; }
.manage-group-footer { text-align: right; }
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: 0 -24px;
  padding: 12px 24px 0;
  transition: background 0.2s, box-shadow 0.2s;
}
.sticky-header.stuck {
  background: var(--el-bg-color);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
.sticky-sentinel {
  height: 1px;
  margin: 0;
}
.drag-ghost { opacity: 0.45; }
.card-list-wrap { padding-top: 8px; }
.manage-group-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
.card-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 16px;
}
.global-disable-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-left: 2em;
  transition: color 0.2s;
  cursor: pointer;
  user-select: none;
}
.global-disable-label.active {
  color: var(--el-color-danger);
  font-weight: 600;
}
.header-left {
  display: flex;
  align-items: center;
}
.shortcut-group-wrap {
  display: flex;
  align-items: center;
  margin-left: 1.2em;
  gap: 6px;
}
.shortcut-group-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  user-select: none;
  white-space: nowrap;
}
.enable-group-select {
  width: 220px;
}
.enable-group-select :deep(.el-select__selected-item:not(.is-transparent)) {
  background: color-mix(in srgb, var(--slcolor, var(--el-color-danger)) 16%, #fff);
  border-radius: 4px;
  padding: 1px 9px;
  height: 24px;
  font-size: 13px;
  font-weight: 600;
  line-height: 22px;
}
.enable-group-select :deep(.el-select__selected-item:not(.is-transparent)) .shortcut-opt-outer {
  color: #409eff;
}
.enable-group-select :deep(.el-select__selected-item:not(.is-transparent)) .shortcut-opt-inter {
  color: #e6a23c;
}
.enable-group-select :deep(.el-select__selected-item:not(.is-transparent)) .shortcut-opt-sep {
  color: var(--el-text-color-secondary);
  margin: 0 2px;
}
.enable-group-select :deep(.el-select__selected-item.is-transparent) {
  background: transparent;
  padding: 0;
  height: auto;
  font-weight: 500;
}
.enable-group-select :deep(.el-select__selected-item.is-transparent) .shortcut-opt-outer {
  color: var(--el-color-danger);
}
.enable-group-select :deep(.el-select__placeholder:not(.is-transparent)) {
  color: var(--el-color-danger);
}
.enable-group-select :deep(.el-select__placeholder.is-transparent) {
  color: var(--el-color-danger);
}
.shortcut-opt-outer {
  color: #409eff;
  font-weight: 500;
}
.shortcut-opt-sep {
  color: var(--el-text-color-secondary);
  margin: 0 2px;
}
.shortcut-opt-inter {
  color: #e6a23c;
  font-weight: 500;
}
.section-header h2 {
  margin: 0;
  font-size: 18px;
}
.empty-state {
  padding: 48px 0;
  text-align: center;
}
.empty-state p {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 8px;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.card-wrapper {
  cursor: pointer;
  border-radius: 8px;
  transition: box-shadow 0.2s;
}
.card-wrapper.selected {
  box-shadow: 0 0 0 2px var(--el-color-primary);
}
.card-title {
  font-weight: 600;
}
.card-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.mode-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  font-weight: 500;
}
.mode-comment { background: #fef3cd; color: #92660c; border: 1px solid #f5d88b; }
.mode-mouse { background: #d4edda; color: #1a7a34; border: 1px solid #a3d9b1; }
.mode-mixed { background: #fce4ec; color: #a93764; border: 1px solid #f5b6cd; }
.mode-link { background: #d9ecff; color: #1a5fb4; border: 1px solid #a3c9f5; }
.mode-text-comment { color: #92660c; }
.mode-text-mouse { color: #1a7a34; }
.mode-text-mixed { color: #a93764; }
.mode-text-link { color: #1a5fb4; }
.hotkey-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 2px 6px;
}
.hotkey-label {
  color: var(--el-color-primary);
  font-weight: 600;
}
.hotkey-value {
  color: var(--el-text-color-regular);
}
.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.info-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  width: 72px;
  flex-shrink: 0;
}
.card-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}
.card-actions-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.enable-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.enable-hint.on {
  color: var(--el-color-success);
}
.draft-empty { padding: 24px 0; text-align: center; }
.draft-list {
  max-height: 400px;
  overflow-y: auto;
}
.draft-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background 0.15s;
}
.draft-item:hover { background: var(--el-fill-color-light); }
.draft-item:last-child { border-bottom: none; }
.draft-name { font-size: 14px; color: var(--el-text-color-regular); }
.draft-actions { display: flex; gap: 4px; }

/* ===== 互动分组栏 ===== */
.inter-group-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.inter-group-bar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.inter-group-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-right: 4px;
  font-weight: 500;
}
.inter-group-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
  font-size: 12px;
}
.inter-group-chip:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.inter-group-chip.active {
  background: var(--el-color-primary-light-8);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}
.inter-group-chip.enabled .inter-group-star {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  color: #fadb14;
  font-size: 11px;
}
.inter-group-name { line-height: 1.3; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inter-group-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 管理互动分组标签样式 */
.manage-inter-tag {
  padding: 2px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
}

/* ===== 复制到分组弹窗 ===== */
.copy-dialog-body {
  display: flex;
  gap: 16px;
  min-height: 280px;
}
.copy-panel {
  flex: 1;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.copy-panel-title {
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.copy-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.copy-panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
  margin-bottom: 2px;
}
.copy-panel-item:hover {
  background: var(--el-fill-color-light);
}
.copy-panel-item.active {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-weight: 500;
}
.copy-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-item-count {
  flex-shrink: 0;
  color: #409eff;
  font-weight: 600;
}
.copy-item-tag {
  padding: 2px 10px;
  border: 1.5px solid var(--gcolor, #909399);
  border-radius: 12px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.copy-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 20px;
}

/* ===== 批量删除/导出弹窗 ===== */
.batch-tip {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.batch-tip .batch-select-all :deep(.el-checkbox__label) {
  font-weight: 600;
}
.batch-tip .batch-count {
  margin-left: auto;
  color: var(--el-color-primary);
  font-weight: 600;
}
:deep(.batch-tip .el-checkbox) {
  margin-right: 0;
}
.batch-empty {
  padding: 8px 0;
}
.batch-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.batch-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  transition: background 0.15s, border-color 0.15s;
  cursor: pointer;
  user-select: none;
}
.batch-item:hover {
  background: var(--el-fill-color-light);
}
.batch-item.selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}
.batch-item :deep(.el-checkbox) {
  width: 100%;
  height: auto;
}
.batch-item :deep(.el-checkbox__label) {
  white-space: normal;
  word-break: break-all;
}
/* 全部禁用通知：统一淡底样式，悬浮于分组栏 */
.global-disable-message {
  border-radius: 6px;
  font-size: 13px;
  box-shadow: var(--el-box-shadow-light);
}
</style>
