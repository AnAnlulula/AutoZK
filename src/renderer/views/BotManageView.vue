<template>
  <div class="bot-manage">
    <div class="section-header">
      <h2>水军设置</h2>
      <el-space>
        <el-button type="primary" @click="promptAddBot">
          <el-icon><Plus /></el-icon>
          添加水军
        </el-button>
        <el-button
          v-if="!editing"
          @click="startEdit"
        >
          <el-icon><Edit /></el-icon>
          编辑（批量删除）
        </el-button>
        <template v-else>
          <el-button type="danger" :disabled="selectedIds.length === 0" @click="deleteSelected">
            <el-icon><Delete /></el-icon>
            删除选中
          </el-button>
          <el-button @click="editing = false">
            <el-icon><Check /></el-icon>
            完成编辑
          </el-button>
        </template>
      </el-space>
    </div>

    <div v-if="bots.length === 0" class="empty-state">
      <el-empty description="暂无水军" />
      <p>点击「添加水军」开始配置，卡片可拖动排序</p>
    </div>

    <draggable
      v-else
      v-model="bots"
      item-key="id"
      class="bot-grid"
      ghost-class="drag-ghost"
      :animation="200"
      @end="onBotDragEnd"
    >
      <template #item="{ element: bot }">
        <div
          class="bot-card"
          :class="{ selected: editing && selectedIds.includes(bot.id) }"
          @click="editing ? toggleSelect(bot.id) : undefined"
        >
          <div class="bot-top">
            <span class="bot-name">{{ bot.name }}</span>
            <div class="bot-ops">
              <el-button text size="small" title="重命名" @click.stop="promptRename(bot)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button text type="danger" size="small" title="删除" @click.stop="confirmDeleteOne(bot)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="coord-row">
            <span class="coord-label">X</span>
            <el-input-number
              v-model="bot.screenX"
              :min="0"
              :max="9999"
              size="small"
              controls-position="right"
              style="width: 100px"
              @change="handleCoordChange(bot)"
            />
            <span class="coord-label">Y</span>
            <el-input-number
              v-model="bot.screenY"
              :min="0"
              :max="9999"
              size="small"
              controls-position="right"
              style="width: 100px"
              @change="handleCoordChange(bot)"
            />
          </div>
          <el-button size="small" :disabled="isCapturing" @click.stop="capturePos(bot)" style="width: 100%">{{ isCapturing ? '捕获中...' : '捕获' }}</el-button>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import draggable from 'vuedraggable'
import { Plus, Edit, Delete, Check } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBotStore } from '../stores/bots'
import { useWorkflowStore } from '../stores/workflow'
import type { BotInstance } from '../../shared/types'

const store = useBotStore()
const wfStore = useWorkflowStore()

const editing = ref(false)
const selectedIds = ref<string[]>([])
const capturingBot = ref<BotInstance | null>(null)
const isCapturing = ref(false)

// 水军列表的可排序视图（拖拽用）
const bots = ref<BotInstance[]>([])
watch(() => store.bots, (val) => {
  bots.value = val
}, { immediate: true, deep: true })

// 添加水军：先命名
async function promptAddBot() {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入水军名称（留空则自动命名）',
      '添加水军',
      { inputPlaceholder: '例如：水军A，留空自动命名' }
    )
    const name = value && value.trim() ? value.trim() : undefined
    store.addBot(name)
    ElMessage.success('已添加')
  } catch { /* 取消 */ }
}

// 重命名单个水军
async function promptRename(bot: BotInstance) {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入新的水军名称',
      '重命名',
      { inputValue: bot.name, inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空') }
    )
    const name = value.trim()
    if (name === bot.name) return
    store.updateBot(bot.id, { name })
    ElMessage.success('已重命名')
  } catch { /* 取消 */ }
}

// 删除单个水军
async function confirmDeleteOne(bot: BotInstance) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${bot.name}」？`,
      '删除确认',
      { type: 'warning' }
    )
    store.deleteBot(bot.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// 编辑模式：多选批量删除
function startEdit() {
  editing.value = true
  selectedIds.value = []
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(id)
  }
}

async function deleteSelected() {
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedIds.value.length} 个水军？`,
      '删除确认',
      { type: 'warning' }
    )
    for (const id of selectedIds.value) {
      store.deleteBot(id)
    }
    ElMessage.success('已删除')
    selectedIds.value = []
  } catch { /* 取消 */ }
}

// 拖拽排序后持久化
function onBotDragEnd() {
  store.reorderBots([...bots.value])
}

function capturePos(bot: BotInstance) {
  if (isCapturing.value) return
  capturingBot.value = bot
  isCapturing.value = true
  const fontSize = parseInt(document.documentElement.style.fontSize) || 14
  window.electronAPI.openCaptureOverlay(fontSize)
}

function handleCoordChange(bot: BotInstance) {
  store.saveToDisk()
  wfStore.syncBotCoords(bot.id, bot.screenX, bot.screenY)
}

function handleCaptureResult(result: { x: number; y: number } | null) {
  isCapturing.value = false
  if (!capturingBot.value || !result) {
    capturingBot.value = null
    return
  }
  capturingBot.value.screenX = result.x
  capturingBot.value.screenY = result.y
  store.saveToDisk()
  wfStore.syncBotCoords(capturingBot.value.id, result.x, result.y)
  ElMessage.success(`已捕获坐标: ${result.x}, ${result.y}`)
  capturingBot.value = null
}

onMounted(async () => {
  await store.loadFromDisk()
  window.electronAPI.onCaptureResult(handleCaptureResult)
})

onUnmounted(() => {
  window.electronAPI.removeCaptureListeners()
})
</script>

<style scoped>
.bot-manage {
  padding-top: 24px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-header h2 {
  margin: 0;
  font-size: 18px;
}
.empty-state {
  text-align: center;
  padding: 48px 0;
}
.empty-state p {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 8px;
}
.bot-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.bot-card {
  width: 260px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 14px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  cursor: grab;
}
.bot-card:active { cursor: grabbing; }
.bot-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.bot-card.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.bot-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.bot-name {
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bot-ops {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.2s;
}
.bot-card:hover .bot-ops {
  opacity: 1;
}
.coord-row {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.coord-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.drag-ghost { opacity: 0.45; }
</style>