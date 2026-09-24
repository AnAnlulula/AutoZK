<template>
  <div class="app-layout">
    <el-container>
      <el-aside width="200px" class="app-sidebar">
        <el-menu :default-active="activeMenu" router class="sidebar-menu">
          <el-menu-item index="/">
            <el-icon><Monitor /></el-icon>
            <span>自动工作流</span>
          </el-menu-item>
          <el-menu-item index="/bots">
            <el-icon><User /></el-icon>
            <span>水军设置</span>
          </el-menu-item>
          <el-menu-item index="/comments">
            <el-icon><ChatLineSquare /></el-icon>
            <span>评论表格</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-container>
        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Monitor, User, ChatLineSquare, Setting } from '@element-plus/icons-vue'
import { useWorkflowStore } from './stores/workflow'
import { useBotStore } from './stores/bots'
import { useCommentStore } from './stores/comments'

const route = useRoute()
const activeMenu = computed(() => route.path)

const store = useWorkflowStore()
const botStore = useBotStore()
const commentStore = useCommentStore()
const runningTasks = ref<Set<string>>(new Set())

function onTaskStarted(data: { taskId: string; taskName: string }) {
  runningTasks.value.add(data.taskId)
  window.electronAPI.showTaskNotify(`「${data.taskName}」开始`, 'success')
  window.electronAPI.addRunningTask(data.taskName)
}

function onTaskStopped(data: { taskId: string; taskName: string }) {
  runningTasks.value.delete(data.taskId)
  window.electronAPI.showTaskNotify(`「${data.taskName}」结束`, 'error')
  window.electronAPI.removeRunningTask(data.taskName)
}

function onTaskEnded(data: { taskId: string; taskName: string }) {
  runningTasks.value.delete(data.taskId)
  window.electronAPI.removeRunningTask(data.taskName)
}

onMounted(async () => {
  await Promise.all([
    store.loadFromDisk(),
    botStore.loadFromDisk(),
    commentStore.loadFromDisk(),
  ])
  window.electronAPI.onTaskHotkeyStarted(onTaskStarted)
  window.electronAPI.onTaskHotkeyStopped(onTaskStopped)
  window.electronAPI.onTaskHotkeyEnded(onTaskEnded)
})

onUnmounted(() => {
  window.electronAPI.removeTaskHotkeyListeners()
})
</script>

<style scoped>
.app-layout { height: 100vh; background: var(--el-bg-color-page); }
.app-sidebar { background: var(--el-bg-color); border-right: 1px solid var(--el-border-color-light); }
.sidebar-menu { border-right: none; height: 100vh; }
.app-main { padding: 0 24px 24px; overflow-y: auto; height: 100vh; }
</style>