<template>
  <div
    class="shortcut-recorder"
    :class="{ recording: isRecording }"
    :style="{ width: width || '300px' }"
    @click="startRecording"
  >
    <span v-if="isRecording" class="recording-hint">监听中…</span>
    <span v-else-if="modelValue" class="shortcut-value">{{ modelValue }}</span>
    <span v-else class="placeholder">{{ placeholder }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  width?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isRecording = ref(false)
const justFinished = ref(false)
const pressedKeys = ref<Set<string>>(new Set())

const KEY_ZH: Record<string, string> = {
  'Space': '空格',
  'MouseLeft': '鼠标左键',
  'MouseRight': '鼠标右键',
  'MouseMiddle': '鼠标中键',
  'MouseBack': '鼠标侧键1',
  'MouseForward': '鼠标侧键2',
}

function toChinese(key: string): string {
  return KEY_ZH[key] ?? key
}

function startRecording() {
  if (isRecording.value || justFinished.value) return
  isRecording.value = true
  pressedKeys.value = new Set()
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('keyup', handleKeyUp, true)
  document.addEventListener('mousedown', handleMouseDown, true)
  document.addEventListener('mouseup', handleMouseUp, true)
}

function finishWithKeys(keys: string[]) {
  if (keys.length > 0) {
    const display = keys.map(toChinese).join('+')
    emit('update:modelValue', display)
  }
  cleanup()
  justFinished.value = true
  setTimeout(() => { justFinished.value = false }, 200)
}

function cancelRecording() {
  cleanup()
}

function cleanup() {
  isRecording.value = false
  pressedKeys.value = new Set()
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('keyup', handleKeyUp, true)
  document.removeEventListener('mousedown', handleMouseDown, true)
  document.removeEventListener('mouseup', handleMouseUp, true)
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isRecording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    cancelRecording()
    return
  }
  const key = mapKey(e)
  if (key) {
    pressedKeys.value.add(key)
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (!isRecording.value) return
  e.preventDefault()
  e.stopPropagation()
  const key = mapKey(e)
  if (!key) return
  const snapshot = [...pressedKeys.value]
  pressedKeys.value.delete(key)
  if (pressedKeys.value.size === 0 && snapshot.length > 0) {
    finishWithKeys(snapshot)
  }
}

function handleMouseDown(e: MouseEvent) {
  if (!isRecording.value) return
  e.preventDefault()
  e.stopPropagation()
  const mouseKey = mapMouseButton(e.button)
  if (mouseKey) {
    pressedKeys.value.add(mouseKey)
  }
}

function handleMouseUp(e: MouseEvent) {
  if (!isRecording.value) return
  e.preventDefault()
  e.stopPropagation()
  const mouseKey = mapMouseButton(e.button)
  if (!mouseKey) return
  const snapshot = [...pressedKeys.value]
  pressedKeys.value.delete(mouseKey)
  if (pressedKeys.value.size === 0 && snapshot.length > 0) {
    finishWithKeys(snapshot)
  }
}

function mapKey(e: KeyboardEvent): string {
  // 左/右修饰键
  if (e.code === 'ControlLeft') return '左Ctrl'
  if (e.code === 'ControlRight') return '右Ctrl'
  if (e.code === 'ShiftLeft') return '左Shift'
  if (e.code === 'ShiftRight') return '右Shift'
  if (e.code === 'AltLeft') return '左Alt'
  if (e.code === 'AltRight') return '右Alt'
  if (e.code === 'MetaLeft') return '左Win'
  if (e.code === 'MetaRight') return '右Win'

  // 数字键盘区
  if (e.code.startsWith('Numpad')) {
    const numKey = e.code.replace('Numpad', '')
    const map: Record<string, string> = {
      'Add': '+', 'Subtract': '-', 'Multiply': '*', 'Divide': '/', 'Decimal': '.', 'Enter': 'Enter',
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    }
    return map[numKey] ? `num ${map[numKey]}` : ''
  }

  if (e.key.startsWith('F') && /^F\d+$/.test(e.key)) return e.key
  const special: Record<string, string> = {
    'Escape': 'Esc',
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Insert': 'Insert',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
  }
  if (special[e.key]) return special[e.key]
  if (e.key.length === 1) return e.key.toUpperCase()
  return ''
}

function mapMouseButton(button: number): string {
  switch (button) {
    case 0: return 'MouseLeft'
    case 1: return 'MouseMiddle'
    case 2: return 'MouseRight'
    case 3: return 'MouseBack'
    case 4: return 'MouseForward'
    default: return ''
  }
}

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.shortcut-recorder {
  height: 32px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  cursor: pointer;
  font-size: 13px;
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s;
  outline: none;
  user-select: none;
}
.shortcut-recorder:hover {
  border-color: var(--el-color-primary);
}
.shortcut-recorder.recording {
  border-color: var(--el-color-success);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}
.recording-hint {
  color: var(--el-color-success);
  font-weight: 500;
}
.shortcut-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.placeholder {
  color: var(--el-text-color-placeholder);
}
</style>
