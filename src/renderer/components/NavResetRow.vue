<template>
  <div class="rule-row">
    <span class="rule-label">导航栏重置</span>
    <template v-if="pos">
      <el-input :model-value="pos.x" readonly size="small" class="coord-input" />
      <el-input :model-value="pos.y" readonly size="small" class="coord-input" />
      <el-button size="small" :disabled="capturing" @click="emit('capture')">
        {{ capturing ? '捕获中...' : '重新捕获' }}
      </el-button>
    </template>
    <template v-else>
      <span class="coord-empty">未捕获</span>
      <el-button size="small" :disabled="capturing" @click="emit('capture')">
        {{ capturing ? '捕获中...' : '捕获坐标' }}
      </el-button>
    </template>
    <span class="nav-reset-hint">建议获取底部导航栏空白处哦~</span>
  </div>
</template>

<script setup lang="ts">
import type { ScreenPoint } from '../../shared/types'

defineProps<{
  pos: ScreenPoint | null
  capturing: boolean
}>()

const emit = defineEmits<{
  capture: []
}>()
</script>

<style scoped>
.rule-row { display: flex; align-items: center; gap: 8px; }
.rule-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  width: 64px;
  flex-shrink: 0;
}
.coord-input { width: 90px; flex-shrink: 0; }
.coord-input :deep(.el-input__inner) { text-align: center; }
.coord-empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 188px;
  height: 24px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
.nav-reset-hint { font-size: 11px; color: var(--el-text-color-secondary); flex-shrink: 0; }
</style>