<template>
  <div class="operation-section">
    <div class="capture-row">
      <el-button type="primary" size="small" :disabled="capturing" @click="emit('capture')">
        <el-icon><Aim /></el-icon>
        {{ capturing ? '捕获中...' : '捕获' }}
      </el-button>
      <template v-if="steps.length > 0">
        <span class="batch-label">批量设置延迟</span>
        <el-input-number v-model="batchDelay" :min="100" :max="60000" :step="100" size="small" style="width: 120px" />
        <span class="batch-unit">ms</span>
        <el-button size="small" @click="applyBatchDelay">应用</el-button>
      </template>
    </div>

    <div v-if="steps.length > 0" class="operation-list">
      <div
        v-for="(step, idx) in steps"
        :key="step.id"
        class="operation-item"
      >
        <span class="op-index">{{ idx + 1 }}.</span>
        <span class="op-coord">({{ String(step.x).padStart(4, '\u00A0') }}, {{ String(step.y).padStart(4, '\u00A0') }})</span>
        <el-input
          v-model="step.note"
          placeholder="备注"
          size="small"
          class="op-note-input"
        />
        <el-input-number
          v-model="step.interval"
          :min="100"
          :max="60000"
          :step="100"
          size="small"
          class="op-interval-input"
        />
        <span class="op-ms">ms</span>
        <el-button text type="primary" size="small" :disabled="capturing" @click="emit('recapture', idx)" class="op-action-btn">重新捕获</el-button>
        <el-button text type="danger" size="small" :disabled="capturing" @click="emit('remove', idx)" class="op-action-btn">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>
    <el-empty v-else description="暂无操作步骤，点击上方捕获按钮添加" :image-size="40" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Aim, Delete } from '@element-plus/icons-vue'
import type { OperationStep } from '../../shared/types'

const props = defineProps<{ steps: OperationStep[]; capturing?: boolean }>()
const emit = defineEmits<{
  capture: []
  recapture: [idx: number]
  remove: [idx: number]
}>()

const batchDelay = ref(300)

function applyBatchDelay() {
  props.steps.forEach(step => {
    step.interval = batchDelay.value
  })
}
</script>

<style scoped>
.operation-section { width: 100%; }
.capture-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-label { font-size: 13px; color: var(--el-text-color-secondary); margin-left: 8px; }
.batch-unit { font-size: 12px; color: var(--el-text-color-secondary); }
.operation-list {
  margin-top: 8px;
  max-height: 250px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 4px 0;
}
.operation-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  gap: 8px;
}
.operation-item:last-child { border-bottom: none; }
.op-index { color: var(--el-text-color-secondary); min-width: 24px; flex-shrink: 0; }
.op-coord { color: var(--el-text-color-regular); font-size: 13px; font-family: monospace; min-width: 130px; white-space: pre; flex-shrink: 0; }
.op-note-input { width: 120px; flex-shrink: 0; }
.op-interval-input { width: 110px; flex-shrink: 0; }
.op-action-btn { flex-shrink: 0; }
.op-ms { font-size: 12px; color: var(--el-text-color-secondary); flex-shrink: 0; }
</style>
