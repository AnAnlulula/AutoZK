<template>
  <el-dialog
    v-model="dialogVisible"
    :title="editData ? '编辑任务' : '新建任务'"
    width="720px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form label-width="100px" label-position="left">
      <!-- 1. 任务名称 -->
      <el-form-item label="任务名称" :required="!form.name.trim()">
 <el-input v-model="form.name" placeholder="输入任务名称" style="width: 300px" />
 </el-form-item>

 <!-- 2. 快捷键 -->
 <el-form-item label="快捷键" :required="!form.hotkey">
        <div class="hotkey-row">
          <ShortcutRecorder
            :model-value="form.hotkey"
            @update:model-value="form.hotkey = $event"
            placeholder="点击录制快捷键..."
          />
          <span class="hotkey-hint">不要设置左ctrl为快捷键哦~</span>
        </div>
      </el-form-item>

      <!-- 3. 工作模式 -->
      <el-form-item label="工作模式">
        <el-radio-group v-model="form.taskMode">
          <el-radio value="comment">发评论</el-radio>
          <el-radio value="mouse">操作鼠标</el-radio>
          <el-radio value="mixed">混合操作</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 4. 选择水军（发评论 + 混合操作） -->
      <el-form-item v-if="form.taskMode !== 'mouse'" label="选择水军">
        <div v-if="botStore.bots.length === 0" class="empty-hint">
          暂无可用水军，请先去
          <el-button text type="primary" size="small" @click="goToBotPage">水军设置</el-button>
        </div>
        <div v-else class="bot-grid">
          <div
            v-for="bot in botStore.bots"
            :key="bot.id"
            class="bot-card"
            :class="{ selected: form.botIds.includes(bot.id) }"
            @click="toggleBot(bot.id)"
          >
            <span class="bot-name">{{ bot.name }}</span>
            <span class="bot-coord">({{ bot.screenX }},{{ bot.screenY }})</span>
          </div>
        </div>
      </el-form-item>

      <!-- 5. 操作步骤（操作鼠标模式） -->
      <el-form-item v-if="form.taskMode === 'mouse'" label="操作步骤">
        <OperationStepList
          :steps="form.operationSteps"
          :capturing="isCapturing"
          @capture="captureStep('main', -1)"
          @recapture="(i) => captureStep('main', i)"
          @remove="(i) => form.operationSteps.splice(i, 1)"
        />
      </el-form-item>

      <!-- 混合操作：评论前操作 -->
      <el-form-item v-if="form.taskMode === 'mixed'" label="评论前操作">
        <OperationStepList
          :steps="form.preOperationSteps"
          :capturing="isCapturing"
          @capture="captureStep('pre', -1)"
          @recapture="(i) => captureStep('pre', i)"
          @remove="(i) => form.preOperationSteps.splice(i, 1)"
        />
      </el-form-item>

      <!-- 6. 评论模块（发评论 + 混合操作） -->
      <el-form-item v-if="form.taskMode !== 'mouse'" label="评论">
        <div class="comment-section">
          <div class="comment-input-row">
            <el-input
              v-model="manualComment"
              placeholder="输入评论内容，按回车添加"
              @keyup.enter="addManualComment"
              style="flex: 1"
            />
            <el-button size="default" @click="showCommentPicker = true">
              <el-icon><Plus /></el-icon>
              从评论表格中选择
            </el-button>
          </div>

          <div v-if="form.commentItems.length >= 2" class="drag-hint">点击评论可拖拽调整排序哦~</div>

          <div v-if="form.commentItems.length > 0" class="batch-delay-row">
            <span class="batch-label">批量设置延迟</span>
            <el-input-number v-model="batchCommentDelay" :min="0" :max="60000" :step="100" size="small" style="width: 120px" />
            <span class="batch-unit">ms</span>
            <el-button size="small" @click="applyBatchCommentDelay">应用</el-button>
          </div>

          <div v-if="form.commentItems.length > 0" class="comment-list">
            <div
              v-for="(item, idx) in form.commentItems"
              :key="item.key"
              class="comment-item"
              draggable="true"
              @dragstart="onDragStart(idx)"
              @dragover.prevent="onDragOver(idx)"
              @drop="onDrop(idx)"
              @dragend="dragIndex = -1"
              :class="{ 'drag-over': dragIndex !== -1 && dragIndex !== idx && idx === dropIndex, 'dragging': dragIndex === idx }"
            >
              <span class="comment-index">{{ idx + 1 }}.</span>
              <span class="comment-content">{{ item.content }}</span>
              <el-tag size="small" :type="item.source === 'table' ? 'success' : 'warning'" class="comment-tag">
                {{ item.source === 'table' ? '表格' : '手动' }}
              </el-tag>
              <span class="delay-label">延迟</span>
              <el-input-number v-model="item.delay" :min="0" :max="60000" :step="100" size="small" class="delay-input" />
              <span class="delay-unit">ms</span>
              <span class="must-send-label">必发</span>
              <el-switch v-model="item.mustSend" size="small" @click.stop />
              <el-button text type="danger" size="small" @click.stop="removeCommentByKey(item.key)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <el-empty v-else description="暂无评论" :image-size="40" />
        </div>
      </el-form-item>

      <!-- 混合操作：评论后操作 -->
      <el-form-item v-if="form.taskMode === 'mixed'" label="评论后操作">
        <OperationStepList
          :steps="form.postOperationSteps"
          :capturing="isCapturing"
          @capture="captureStep('post', -1)"
          @recapture="(i) => captureStep('post', i)"
          @remove="(i) => form.postOperationSteps.splice(i, 1)"
        />
      </el-form-item>

      <!-- 7A. 发送规则（发评论 + 混合操作） -->
      <el-form-item v-if="form.taskMode !== 'mouse'" label="发送规则">
        <div class="send-rules">
          <div class="rule-row">
            <span class="rule-label">发送顺序</span>
            <el-radio-group v-model="form.sendMode">
              <el-radio value="sequential">顺序发送</el-radio>
              <el-radio value="random">随机发送</el-radio>
            </el-radio-group>
            <span class="rule-hint">顺序：按列表顺序依次发送；随机：随机选取不重复</span>
          </div>
          <div class="rule-row">
            <span class="rule-label">评论数</span>
            <el-input-number
              v-model="form.commentCount"
              :min="commentCountMin"
              :max="commentCountMax"
              style="width: 130px"
            />
            <span class="rule-hint">{{ commentCountHint }}</span>
          </div>
          <div class="rule-row">
            <span class="rule-label">间隔时间</span>
            <el-input-number v-model="form.commentInterval" :min="100" :max="60000" :step="100" style="width: 130px" />
            <span class="rule-hint">毫秒（按下回车后的延迟时间）</span>
          </div>
        </div>
      </el-form-item>

      <!-- 7B. 操作规则（操作鼠标模式） -->
      <el-form-item v-else label="操作规则">
        <div class="send-rules">
          <div class="rule-row">
            <el-radio-group v-model="form.operationMode">
              <el-radio value="once">一次性</el-radio>
              <el-radio value="loop">循环</el-radio>
            </el-radio-group>
            <span class="rule-hint">{{ form.operationMode === 'once' ? '按操作列表顺序依次点击坐标后结束' : '按操作列表顺序循环点击，再次按快捷键结束' }}</span>
          </div>
        </div>
      </el-form-item>

      <!-- 8. 任务联动 -->
      <el-form-item label="任务联动">
        <div class="linkage-section">
          <div class="linkage-header">
            <span class="linkage-label">是否开启</span>
            <el-switch v-model="form.linkageEnabled" />
            <template v-if="form.linkageEnabled">
              <el-button size="small" @click="openLinkagePicker">
                <el-icon><Plus /></el-icon>
                添加任务
              </el-button>
              <span class="linkage-delay-label">主任务结束后延迟</span>
              <el-input-number v-model="form.linkageDelay" :min="0" :max="60000" :step="100" size="small" style="width: 120px" />
              <span class="linkage-delay-unit">ms</span>
            </template>
          </div>

          <div v-if="form.linkageEnabled && form.linkedTasks.length > 0" class="linked-task-list">
            <div
              v-for="(lt, idx) in form.linkedTasks"
              :key="lt.taskId"
              class="linked-task-item"
              draggable="true"
              @dragstart="onLinkedDragStart(idx)"
              @dragover.prevent="onLinkedDragOver(idx)"
              @drop="onLinkedDrop(idx)"
              @dragend="linkedDragIndex = -1"
              :class="{ 'linked-dragging': linkedDragIndex === idx, 'linked-drag-over': linkedDragIndex !== -1 && linkedDragIndex !== idx && idx === linkedDropIndex }"
            >
              <span class="linked-task-index">{{ idx + 1 }}.</span>
              <span class="linked-task-name">{{ lt.taskName }}</span>
              <span class="linked-task-delay-label">完成后延迟</span>
              <el-input-number v-model="lt.delay" :min="0" :max="60000" :step="100" size="small" style="width: 110px" />
              <span class="linked-task-delay-unit">ms</span>
              <el-button text type="danger" size="small" @click.stop="removeLinkedTask(lt.taskId)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>

 <div v-if="validationErrors.length > 0" class="validation-summary">
 <span class="validation-title">未配置：</span>
 <span v-for="err in validationErrors" :key="err" class="validation-tag">{{ err }}</span>
 </div>

 <template #footer>
 <el-button @click="dialogVisible = false">取消</el-button>
 <el-button v-if="editData" type="warning" @click="handleCopyToGroup">
   <el-icon><CopyDocument /></el-icon>
   复制到分组
 </el-button>
 <el-button v-if="!editData" @click="saveDraft">保存草稿</el-button>
 <el-button type="primary" @click="confirm" :disabled="!canCreate">
 {{ editData ? '保存' : '创建' }}
 </el-button>
 </template>

    <!-- 评论选择器 -->
    <el-dialog v-model="showCommentPicker" title="选择评论" width="500px" append-to-body @opened="syncPickerSelection">
      <div class="picker-filter-bar">
        <el-button
          v-for="opt in pickerFilterOptions"
          :key="opt.value"
          :type="pickerFilter === opt.value ? 'primary' : 'default'"
          size="small"
          @click="pickerFilter = opt.value"
        >{{ opt.label }}</el-button>
      </div>
      <el-table
        ref="pickerTableRef"
        :data="filteredPickerComments"
        size="default"
        height="300"
        @selection-change="handlePickerSelection"
        @row-click="togglePickerRow"
        style="width: 100%"
      >
        <el-table-column type="selection" width="40" />
        <el-table-column prop="content" label="评论内容" show-overflow-tooltip />
        <el-table-column label="已选" width="60">
          <template #default="{ row }">
            <el-tag v-if="isCommentSelected(row.id)" size="small" type="success">是</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showCommentPicker = false">取消</el-button>
        <el-button type="primary" @click="addComments">添加选中</el-button>
      </template>
    </el-dialog>

    <!-- 任务联动选择器 -->
    <el-dialog v-model="showLinkagePicker" title="选择联动任务" width="500px" append-to-body>
      <div v-if="availableLinkageTasks.length === 0" class="empty-hint">
        暂无可联动任务，请先创建其他任务
      </div>
      <div v-else class="linkage-picker-list">
        <div
          v-for="task in availableLinkageTasks"
          :key="task.id"
          class="linkage-picker-item"
          :class="{ selected: linkagePickerSelection.includes(task.id) }"
          @click="toggleLinkageTask(task.id)"
        >
          <el-checkbox :model-value="linkagePickerSelection.includes(task.id)" @click.stop @change="toggleLinkageTask(task.id)" />
          <span class="linkage-picker-name">{{ task.name }}</span>
          <span class="linkage-picker-mode">{{ modeLabel(task.taskMode) }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="showLinkagePicker = false">取消</el-button>
        <el-button type="primary" @click="confirmLinkageSelection">确认</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Delete, Aim, CopyDocument } from '@element-plus/icons-vue'
import { useBotStore } from '../stores/bots'
import { useCommentStore } from '../stores/comments'
import { useWorkflowStore } from '../stores/workflow'
import { useGroupStore } from '../stores/groups'
import ShortcutRecorder from './ShortcutRecorder.vue'
import OperationStepList from './OperationStepList.vue'
import type { SendMode, BotInstance, TaskMode, OperationStep, OperationMode } from '../../shared/types'

type StepTarget = 'main' | 'pre' | 'post'

const props = defineProps<{ visible: boolean; editData?: any }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  create: [data: {
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
 commentItems: { key: string; content: string; source: 'manual' | 'table'; mustSend: boolean; delay: number }[]
 operationSteps: OperationStep[]
 preOperationSteps: OperationStep[]
 postOperationSteps: OperationStep[]
 isDraft?: boolean
 linkageEnabled: boolean
 linkageDelay: number
 linkedTasks: { taskId: string; taskName: string; delay: number }[]
 interGroupId?: string
 }]
  copyToGroup: []
}>()

const dialogVisible = ref(false)
watch(() => props.visible, (val) => {
  dialogVisible.value = val
  window.electronAPI?.setHotkeysSuspended(val)
  if (val && props.editData) {
    skipCommentCountSync = true
    form.value = {
      name: props.editData.name || '',
      hotkey: props.editData.hotkey || '',
      taskMode: props.editData.taskMode || 'comment',
      operationMode: props.editData.operationMode || 'once',
      botIds: props.editData.bots?.map((b: any) => b.id) || [],
      commentItems: (props.editData.commentItems ? JSON.parse(JSON.stringify(props.editData.commentItems)) : []).map((c: any) => ({
 ...c,
 mustSend: c.mustSend ?? false,
 delay: c.delay ?? 0,
 })),
      operationSteps: props.editData.operationSteps ? JSON.parse(JSON.stringify(props.editData.operationSteps)) : [],
      preOperationSteps: props.editData.preOperationSteps ? JSON.parse(JSON.stringify(props.editData.preOperationSteps)) : [],
      postOperationSteps: props.editData.postOperationSteps ? JSON.parse(JSON.stringify(props.editData.postOperationSteps)) : [],
      sendMode: props.editData.sendMode || 'sequential',
      commentCount: props.editData.commentCount ?? 0,
      commentInterval: props.editData.commentInterval ?? 500,
      operationInterval: props.editData.operationInterval ?? 1000,
      linkageEnabled: props.editData.linkageEnabled ?? false,
      linkageDelay: props.editData.linkageDelay ?? 0,
      linkedTasks: props.editData.linkedTasks ? JSON.parse(JSON.stringify(props.editData.linkedTasks)) : [],
      interGroupId: props.editData.interGroupId || '',
    }
    nextTick(() => { skipCommentCountSync = false })
  }
}, { immediate: true })
watch(dialogVisible, (val) => {
  if (!val) {
    window.electronAPI?.setHotkeysSuspended(false)
    emit('update:visible', false)
  }
})

const botStore = useBotStore()
const commentStore = useCommentStore()
const wfStore = useWorkflowStore()
const groupStore = useGroupStore()
const router = useRouter()

const form = ref({
  name: '',
  hotkey: '',
  taskMode: 'comment' as TaskMode,
  operationMode: 'once' as OperationMode,
  botIds: [] as string[],
  commentItems: [] as { key: string; content: string; source: 'manual' | 'table'; mustSend: boolean }[],
  operationSteps: [] as OperationStep[],
  preOperationSteps: [] as OperationStep[],
  postOperationSteps: [] as OperationStep[],
  sendMode: 'sequential' as SendMode,
  commentCount: 0,
  commentInterval: 500,
  operationInterval: 1000,
  linkageEnabled: false,
  linkageDelay: 0,
  linkedTasks: [] as { taskId: string; taskName: string; delay: number }[],
  interGroupId: '',
})

const commentCountMin = computed(() => form.value.commentItems.length >= 2 ? 2 : 1)
const commentCountMax = computed(() => form.value.commentItems.length >= 2 ? form.value.commentItems.length : 9999)

const validationErrors = computed(() => {
  const errs: string[] = []
  if (!form.value.name.trim()) errs.push('任务名称')
  if (!form.value.hotkey) errs.push('快捷键')
  if (form.value.taskMode !== 'mouse') {
    if (form.value.botIds.length === 0) errs.push('选择水军')
    if (form.value.commentItems.length === 0) errs.push('评论')
  }
  if (form.value.taskMode === 'mouse') {
    if (form.value.operationSteps.length === 0) errs.push('操作步骤')
  }
  if (form.value.taskMode === 'mixed') {
    if (form.value.botIds.length === 0) errs.push('选择水军')
    if (form.value.commentItems.length === 0) errs.push('评论')
  }
  return errs
})

const canCreate = computed(() => validationErrors.value.length === 0)
const commentCountHint = computed(() => {
  const len = form.value.commentItems.length
  if (len >= 2) return `条（范围 ${commentCountMin.value}-${commentCountMax.value}）`
  if (len === 1) return `条（将该评论发送${form.value.commentCount}次）`
  return '条（请先添加评论）'
})

let skipCommentCountSync = false

watch(() => form.value.commentItems.length, (len) => {
  if (skipCommentCountSync) return
  if (props.editData) return
  if (len >= 2) {
    form.value.commentCount = len
  } else if (len === 1) {
    form.value.commentCount = 1
  }
})

const manualComment = ref('')
const batchCommentDelay = ref(0)
const showCommentPicker = ref(false)
const pickerSelection = ref<string[]>([])
const pickerTableRef = ref()
const dragIndex = ref(-1)
const dropIndex = ref(-1)

const capturingTarget = ref<StepTarget>('main')
const capturingStepIndex = ref(-1)
const isCapturing = ref(false)

const pickerFilter = ref<'all' | 'selected' | 'unselected'>('all')
const pickerFilterOptions = [
  { value: 'all' as const, label: '全部评论' },
  { value: 'selected' as const, label: '已选' },
  { value: 'unselected' as const, label: '未选' },
]

const filteredPickerComments = computed(() => {
  const all = commentStore.comments
  if (pickerFilter.value === 'selected') {
    return all.filter(c => isCommentSelected(c.id))
  }
  if (pickerFilter.value === 'unselected') {
    return all.filter(c => !isCommentSelected(c.id))
  }
  return all
})

function syncPickerSelection() {
  if (!pickerTableRef.value) return
  pickerTableRef.value.clearSelection()
  for (const c of filteredPickerComments.value) {
    if (isCommentSelected(c.id)) {
      pickerTableRef.value.toggleRowSelection(c, true)
    }
  }
  pickerSelection.value = filteredPickerComments.value
    .filter(c => isCommentSelected(c.id))
    .map(c => c.id)
}

function isCommentSelected(id: string) {
  return form.value.commentItems.some(c => c.source === 'table' && c.key === id)
}

function goToBotPage() { dialogVisible.value = false; router.push('/bots') }

function toggleBot(id: string) {
  const idx = form.value.botIds.indexOf(id)
  if (idx >= 0) {
    form.value.botIds.splice(idx, 1)
  } else {
    form.value.botIds.push(id)
  }
}

function addManualComment() {
 const text = manualComment.value.trim()
 if (!text) return
 form.value.commentItems.push({
 key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
 content: text,
 source: 'manual',
 mustSend: false,
 delay: 0,
 })
 manualComment.value = ''
}

function removeCommentByKey(key: string) {
  form.value.commentItems = form.value.commentItems.filter(c => c.key !== key)
}

function applyBatchCommentDelay() {
  for (const item of form.value.commentItems) {
    item.delay = batchCommentDelay.value
  }
}

function handlePickerSelection(rows: any[]) {
  pickerSelection.value = rows.map(r => r.id)
}

function addComments() {
  for (const id of pickerSelection.value) {
    if (!isCommentSelected(id)) {
      const c = commentStore.comments.find(item => item.id === id)
      form.value.commentItems.push({
        key: id,
        content: c?.content ?? '(已删除)',
        source: 'table',
        mustSend: false,
        delay: 0,
      })
    }
  }
  pickerSelection.value = []
  showCommentPicker.value = false
}

function togglePickerRow(row: any) {
  pickerTableRef.value?.toggleRowSelection(row)
}

watch(pickerFilter, () => {
  nextTick(() => syncPickerSelection())
})

function onDragStart(idx: number) {
  dragIndex.value = idx
}

function onDragOver(idx: number) {
  dropIndex.value = idx
}

function onDrop(idx: number) {
  if (dragIndex.value === -1 || dragIndex.value === idx) return
  const items = form.value.commentItems
  const dragged = items[dragIndex.value]
  items.splice(dragIndex.value, 1)
  items.splice(idx, 0, dragged)
  dragIndex.value = -1
  dropIndex.value = -1
}

// ===== 操作步骤捕获 =====
function captureStep(target: StepTarget, idx: number) {
  if (isCapturing.value) return
  capturingTarget.value = target
  capturingStepIndex.value = idx
  const fontSize = parseInt(document.documentElement.style.fontSize) || 14
  isCapturing.value = true
  window.electronAPI.openCaptureOverlay(fontSize)
}

function handleCaptureResult(result: { x: number; y: number } | null) {
  isCapturing.value = false
  if (!result) {
    capturingStepIndex.value = -1
    return
  }
  const targetArr = capturingTarget.value === 'pre' ? form.value.preOperationSteps
    : capturingTarget.value === 'post' ? form.value.postOperationSteps
    : form.value.operationSteps

  if (capturingStepIndex.value === -1) {
    targetArr.push({
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: result.x,
      y: result.y,
      note: '',
      interval: form.value.operationInterval,
    })
  } else {
    const step = targetArr[capturingStepIndex.value]
    if (step) {
      step.x = result.x
      step.y = result.y
    }
  }
  capturingStepIndex.value = -1
}

onMounted(() => {
  window.electronAPI.onCaptureResult(handleCaptureResult)
})

onUnmounted(() => {
  window.electronAPI.removeCaptureListeners()
})

// ===== 任务联动 =====
const showLinkagePicker = ref(false)
const linkagePickerSelection = ref<string[]>([])

function modeLabel(mode: string): string {
  if (mode === 'mouse') return '操作鼠标'
  if (mode === 'mixed') return '混合操作'
  return '发评论'
}

const availableLinkageTasks = computed(() => {
  // 联动对象只看「当前任务所在互动分组」下的其他正式任务
  // 编辑：用 editData 记录的互动分组；新建：用当前预览/激活的互动分组（新任务也会归入该组）
  const interId = props.editData ? (props.editData.interGroupId || '') : groupStore.activeInterGroupId
  return wfStore.nonDraftCards.filter(c => c.id !== props.editData?.id && (c.interGroupId || '') === interId)
})

function openLinkagePicker() {
  linkagePickerSelection.value = form.value.linkedTasks.map(t => t.taskId)
  showLinkagePicker.value = true
}

function toggleLinkageTask(taskId: string) {
  const idx = linkagePickerSelection.value.indexOf(taskId)
  if (idx >= 0) {
    linkagePickerSelection.value.splice(idx, 1)
  } else {
    linkagePickerSelection.value.push(taskId)
  }
}

function confirmLinkageSelection() {
  const existing = new Map(form.value.linkedTasks.map(t => [t.taskId, t]))
  form.value.linkedTasks = linkagePickerSelection.value.map(id => {
    const task = availableLinkageTasks.value.find(c => c.id === id)
    const existingTask = existing.get(id)
    return {
      taskId: id,
      taskName: task?.name || existingTask?.taskName || '未知任务',
      delay: existingTask?.delay ?? 0,
    }
  })
  showLinkagePicker.value = false
}

function removeLinkedTask(taskId: string) {
  form.value.linkedTasks = form.value.linkedTasks.filter(t => t.taskId !== taskId)
}

// ===== 联动任务拖拽排序 =====
const linkedDragIndex = ref(-1)
const linkedDropIndex = ref(-1)

function onLinkedDragStart(idx: number) {
  linkedDragIndex.value = idx
}
function onLinkedDragOver(idx: number) {
  linkedDropIndex.value = idx
}
function onLinkedDrop(idx: number) {
  if (linkedDragIndex.value === -1 || linkedDragIndex.value === idx) return
  const items = form.value.linkedTasks
  const dragged = items[linkedDragIndex.value]
  items.splice(linkedDragIndex.value, 1)
  items.splice(idx, 0, dragged)
  linkedDragIndex.value = -1
  linkedDropIndex.value = -1
}

function handleCopyToGroup() {
  emit('copyToGroup')
}

function confirm() {
 const selectedBots = botStore.getBotsByIds(form.value.botIds)
 emit('create', {
 name: form.value.name.trim(),
 hotkey: form.value.hotkey,
 taskMode: form.value.taskMode,
 operationMode: form.value.operationMode,
 botCount: selectedBots.length,
 sendMode: form.value.sendMode,
 commentCount: form.value.commentCount,
 commentInterval: form.value.commentInterval,
 operationInterval: form.value.operationInterval,
 bots: JSON.parse(JSON.stringify(selectedBots)),
 commentItems: JSON.parse(JSON.stringify(form.value.commentItems)),
 operationSteps: JSON.parse(JSON.stringify(form.value.operationSteps)),
 preOperationSteps: JSON.parse(JSON.stringify(form.value.preOperationSteps)),
 postOperationSteps: JSON.parse(JSON.stringify(form.value.postOperationSteps)),
 isDraft: false,
 linkageEnabled: form.value.linkageEnabled,
	 linkageDelay: form.value.linkageDelay,
	 linkedTasks: JSON.parse(JSON.stringify(form.value.linkedTasks)),
	 interGroupId: form.value.interGroupId,
	 })
	 resetForm()
	 dialogVisible.value = false
}

function saveDraft() {
 const selectedBots = botStore.getBotsByIds(form.value.botIds)
 emit('create', {
 name: form.value.name.trim() || '未命名草稿',
 hotkey: form.value.hotkey,
 taskMode: form.value.taskMode,
 operationMode: form.value.operationMode,
 botCount: selectedBots.length,
 sendMode: form.value.sendMode,
 commentCount: form.value.commentCount,
 commentInterval: form.value.commentInterval,
 operationInterval: form.value.operationInterval,
 bots: JSON.parse(JSON.stringify(selectedBots)),
 commentItems: JSON.parse(JSON.stringify(form.value.commentItems)),
 operationSteps: JSON.parse(JSON.stringify(form.value.operationSteps)),
 preOperationSteps: JSON.parse(JSON.stringify(form.value.preOperationSteps)),
 postOperationSteps: JSON.parse(JSON.stringify(form.value.postOperationSteps)),
 isDraft: true,
	 linkageEnabled: form.value.linkageEnabled,
	 linkageDelay: form.value.linkageDelay,
	 linkedTasks: JSON.parse(JSON.stringify(form.value.linkedTasks)),
	 interGroupId: form.value.interGroupId,
	 })
	 resetForm()
	 dialogVisible.value = false
}

function resetForm() {
  form.value = {
    name: '', hotkey: '', taskMode: 'comment' as TaskMode,
    operationMode: 'once' as OperationMode,
    botIds: [], commentItems: [], operationSteps: [],
    preOperationSteps: [], postOperationSteps: [],
    sendMode: 'sequential' as SendMode, commentCount: 0,
    commentInterval: 500, operationInterval: 1000,
    linkageEnabled: false, linkageDelay: 0, linkedTasks: [],
    interGroupId: '',
  }
  manualComment.value = ''
}

function handleClose() {
  resetForm()
  emit('update:visible', false)
}
</script>

<style scoped>
.hotkey-row { display: flex; align-items: center; gap: 8px; }
.hotkey-hint { font-size: 12px; color: var(--el-color-warning); }
.empty-hint { padding: 8px 0; color: var(--el-text-color-secondary); font-size: 13px; }
.bot-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.bot-card {
  min-width: 120px;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  font-size: 13px;
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s, background 0.2s;
  user-select: none;
  white-space: nowrap;
}
.bot-card:hover {
  border-color: var(--el-color-primary);
}
.bot-card.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.bot-name {
  display: block;
  font-weight: 500;
}
.bot-coord {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  white-space: nowrap;
}
.comment-section { width: 100%; }
.comment-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
.drag-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.comment-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 4px 0;
}
.comment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: grab;
  transition: background 0.15s, opacity 0.15s;
}
.comment-item:hover { background: var(--el-fill-color-light); }
.comment-item.drag-over { background: var(--el-color-primary-light-8); border-top: 2px solid var(--el-color-primary); }
.comment-item:active { cursor: grabbing; }
.comment-item.dragging { opacity: 0.5; border: 1px solid var(--el-color-primary); }
.comment-item:last-child { border-bottom: none; }
.comment-index { color: var(--el-text-color-secondary); font-size: 13px; min-width: 24px; }
.comment-content { flex: 1; font-size: 13px; }
.comment-tag { margin-left: auto; }
.must-send-label { font-size: 12px; color: var(--el-text-color-secondary); }
.batch-delay-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 4px 0; }
.batch-label { font-size: 12px; color: var(--el-text-color-secondary); }
.batch-unit { font-size: 12px; color: var(--el-text-color-secondary); }
.delay-label { font-size: 12px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.delay-input { width: 100px; flex-shrink: 0; }
.delay-unit { font-size: 11px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.picker-filter-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.send-rules {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rule-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  width: 64px;
  flex-shrink: 0;
}
.rule-hint {
 font-size: 12px;
 color: var(--el-text-color-placeholder);
}
.validation-summary {
 padding: 8px 12px;
 margin-bottom: 8px;
 background: var(--el-color-danger-light-9);
 border: 1px solid var(--el-color-danger-light-5);
 border-radius: 6px;
 display: flex;
 align-items: center;
 gap: 6px;
 flex-wrap: wrap;
}
.validation-title { font-size: 13px; color: var(--el-color-danger); font-weight: 500; }
.validation-tag {
 font-size: 12px;
 color: var(--el-color-danger);
 background: #fff;
 padding: 2px 8px;
 border-radius: 4px;
 border: 1px solid var(--el-color-danger-light-5);
}
.req-asterisk { color: var(--el-color-danger); margin-right: 2px; }
.linkage-section { width: 100%; }
.linkage-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.linkage-label { font-size: 13px; color: var(--el-text-color-secondary); }
.linkage-delay-label { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 8px; }
.linkage-delay-unit { font-size: 12px; color: var(--el-text-color-secondary); }
.linked-task-list {
  margin-top: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 4px 0;
}
.linked-task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  cursor: grab;
  transition: background 0.15s, opacity 0.15s;
}
.linked-task-item:hover { background: var(--el-fill-color-light); }
.linked-task-item:last-child { border-bottom: none; }
.linked-task-item.linked-dragging { opacity: 0.5; border: 1px solid var(--el-color-primary); }
.linked-task-item.linked-drag-over { background: var(--el-color-primary-light-8); border-top: 2px solid var(--el-color-primary); }
.linked-task-item:active { cursor: grabbing; }
.linked-task-index { color: var(--el-text-color-secondary); min-width: 24px; flex-shrink: 0; }
.linked-task-name { flex: 1; color: var(--el-text-color-regular); }
.linked-task-delay-label { font-size: 12px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.linked-task-delay-unit { font-size: 11px; color: var(--el-text-color-secondary); flex-shrink: 0; }
.linkage-picker-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 4px 0;
}
.linkage-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: background 0.15s;
}
.linkage-picker-item:last-child { border-bottom: none; }
.linkage-picker-item:hover { background: var(--el-fill-color-light); }
.linkage-picker-item.selected { background: var(--el-color-primary-light-9); }
.linkage-picker-name { flex: 1; font-size: 14px; }
.linkage-picker-mode { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
