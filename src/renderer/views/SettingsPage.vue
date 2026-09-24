<template>
  <div class="settings-page">
    <!-- 其他设置 -->
    <el-card shadow="never">
      <template #header>
        <span>其他设置</span>
      </template>
      <el-form label-width="160px" label-position="left">
        <el-form-item label="页面字体大小">
          <el-slider
            v-model="settings.fontSize"
            :min="12"
            :max="20"
            :step="1"
            show-input
            style="width: 400px"
          />
          <span class="form-hint">px（默认14）</span>
        </el-form-item>
        <el-form-item label="全屏指针获取热键">
          <ShortcutRecorder
            :model-value="settings.pointerHotkey"
            @update:model-value="handleHotkeyChange"
            placeholder="点击录制热键..."
          />
          <span class="form-hint">按下此热键获取当前鼠标指针坐标</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import ShortcutRecorder from '../components/ShortcutRecorder.vue'
import type { AppSettings } from '../../shared/types'

const settings = ref<AppSettings>({
  fontSize: 14,
  pointerHotkey: '鼠标右键',
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false

onMounted(async () => {
  const s = await window.electronAPI.getAppSettings()
  settings.value = {
    fontSize: s.fontSize ?? 14,
    pointerHotkey: s.pointerHotkey || '鼠标右键',
  }
  applyFontSize(settings.value.fontSize)
  initialized = true
})

watch(settings, (newSettings) => {
  applyFontSize(newSettings.fontSize)
  if (!initialized) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await window.electronAPI.setAppSettings({ ...settings.value })
  }, 300)
}, { deep: true })

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  window.electronAPI.setAppSettings({ ...settings.value })
})

function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`
  document.documentElement.style.setProperty('--el-font-size-base', `${size}px`)
}

function handleHotkeyChange(accelerator: string) {
  settings.value.pointerHotkey = accelerator
}
</script>

<style scoped>
.settings-page {
  max-width: 700px;
  padding-top: 24px;
}
.form-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
