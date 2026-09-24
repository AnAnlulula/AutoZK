<template>
  <div class="comment-table">
    <div class="section-header">
      <h2>评论表格</h2>
      <el-space>
        <el-button :type="editMode ? 'success' : 'default'" @click="toggleEditMode">
          <el-icon><Edit /></el-icon>
          {{ editMode ? '完成编辑' : '编辑' }}
        </el-button>
        <el-button @click="importComments">
          <el-icon><Download /></el-icon>
          导入
        </el-button>
        <el-button @click="exportComments">
          <el-icon><Upload /></el-icon>
          导出
        </el-button>
        <el-button v-if="editMode && selectedIds.size > 0" type="danger" @click="deleteSelected">
          删除选中({{ selectedIds.size }})
        </el-button>
      </el-space>
    </div>

    <!-- 输入框 -->
    <el-card shadow="never" style="margin-bottom: 16px">
      <el-input
        v-model="inputContent"
        placeholder="输入评论内容，按回车添加"
        style="width: 100%"
        @keyup.enter="addCommentFromInput"
      >
        <template #append>
          <el-button @click="addCommentFromInput" :disabled="!inputContent.trim()">添加</el-button>
        </template>
      </el-input>
      <div v-if="editMode && store.comments.length >= 2" class="drag-hint">
        点击评论可拖拽调整排序哦~
      </div>
    </el-card>

    <!-- 评论列表 -->
    <el-card shadow="never">
      <div v-if="store.comments.length === 0" class="empty-state">
        <el-empty description="暂无评论数据" />
        <p>在上方输入框中输入内容，按回车添加</p>
      </div>

      <template v-else>
        <div class="copy-hint">点击评论即可复制~</div>
        <div class="comment-list">
        <div
          v-for="(item, index) in store.comments"
          :key="item.id"
          class="comment-row"
          :class="{
            selected: editMode && selectedIds.has(item.id),
            'edit-mode': editMode,
            dragging: dragIndex === index,
            'drag-over': dragOverIndex === index,
          }"
          @click="handleRowClick($event, item)"
          :draggable="editMode"
          @dragstart="onDragStart(index, $event)"
          @dragover.prevent="onDragOver(index)"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
        >
          <span class="comment-index">{{ index + 1 }}</span>
          <span class="comment-content">{{ item.content }}</span>
          <span v-if="editMode" class="comment-actions">
            <el-button text type="primary" size="small" @click.stop="openEditComment(item)">
              <el-icon><EditPen /></el-icon>
            </el-button>
            <el-checkbox :model-value="selectedIds.has(item.id)" @click.stop="toggleSelect(item.id)" />
          </span>
        </div>
        </div>
      </template>
    </el-card>

    <!-- 编辑评论弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑评论" width="400px" append-to-body>
      <el-input v-model="editingContent" type="textarea" :rows="3" placeholder="输入评论内容" />
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEditComment">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Edit, EditPen, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useCommentStore } from '../stores/comments'

const store = useCommentStore()

onMounted(async () => {
  await store.loadFromDisk()
})

const inputContent = ref('')
const editMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const editDialogVisible = ref(false)
const editingContent = ref('')
const editingCommentId = ref('')

function openEditComment(item: any) {
  editingCommentId.value = item.id
  editingContent.value = item.content
  editDialogVisible.value = true
}

function saveEditComment() {
  const content = editingContent.value.trim()
  if (!content) {
    ElMessage.warning('评论内容不能为空')
    return
  }
  store.updateComment(editingCommentId.value, content)
  editDialogVisible.value = false
  ElMessage.success('已修改')
}

function addCommentFromInput() {
  const content = inputContent.value.trim()
  if (!content) return
  store.addComment(content)
  inputContent.value = ''
}

async function handleRowClick(e: MouseEvent, item: any) {
  if (editMode.value) {
    toggleSelect(item.id)
  } else {
    const text = item.content
    try {
      if (window.electronAPI?.writeClipboard) {
        await window.electronAPI.writeClipboard(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      ElMessage.success({ message: '已复制', duration: 1000 })
    } catch {
      ElMessage.error('复制失败')
    }
  }
}

function toggleEditMode() {
  editMode.value = !editMode.value
  selectedIds.value = new Set()
  dragIndex.value = -1
  dragOverIndex.value = -1
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function deleteSelected() {
  selectedIds.value.forEach(id => store.deleteComment(id))
  selectedIds.value = new Set()
}

function onDragStart(index: number, e: DragEvent) {
  if (!editMode.value) return
  dragIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(index: number) {
  if (!editMode.value || dragIndex.value === -1) return
  dragOverIndex.value = index
}

function onDrop(index: number) {
  if (!editMode.value || dragIndex.value === -1 || dragIndex.value === index) return
  const comments = [...store.comments]
  const [moved] = comments.splice(dragIndex.value, 1)
  comments.splice(index, 0, moved)
  store.comments.splice(0, store.comments.length, ...comments)
  store.saveToDisk()
  dragIndex.value = -1
  dragOverIndex.value = -1
}

function onDragEnd() {
  dragIndex.value = -1
  dragOverIndex.value = -1
}

async function importComments() {
  const result = await window.electronAPI.importCommentFile()
  if (!result) return
  if (result.error) {
    ElMessage.error(`导入失败: ${result.error}`)
    return
  }
  result.comments.forEach((c: string) => store.addComment(c))
  ElMessage.success(`已导入 ${result.comments.length} 条评论`)
}

async function exportComments() {
  if (store.comments.length === 0) {
    ElMessage.warning('暂无评论可导出')
    return
  }
  const comments = store.comments.map(c => c.content)
  await window.electronAPI.exportCommentFile(comments)
  ElMessage.success('导出成功')
}
</script>

<style scoped>
.comment-table {
  padding-top: 24px;
}
.copy-hint {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding-bottom: 8px;
}

.comment-list {
  display: flex;
  flex-direction: column;
}

.comment-row {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s;
  gap: 12px;
  cursor: pointer;
}

.comment-row:hover {
  background: var(--el-fill-color-light);
}

.comment-row.edit-mode {
  cursor: pointer;
}

.comment-row.selected {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}

.comment-row.dragging {
  opacity: 0.5;
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
}

.comment-row.drag-over {
  border-top: 2px solid var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.comment-index {
  width: 32px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  flex-shrink: 0;
}

.comment-content {
  flex: 1;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.comment-checkbox {
  flex-shrink: 0;
}
.comment-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.drag-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
