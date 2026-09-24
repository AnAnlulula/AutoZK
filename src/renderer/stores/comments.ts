import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CommentItem, SendMode } from '../../shared/types'

export const useCommentStore = defineStore('comments', () => {
  const comments = ref<CommentItem[]>([])
  const sendMode = ref<SendMode>('sequential' as SendMode)
  const sendInterval = ref(2000)
  let _loaded = false

  async function loadFromDisk() {
    const data = await window.electronAPI.loadComments()
    if (data && Array.isArray(data.comments) && data.comments.length > 0) {
      comments.value = data.comments
      sendMode.value = (data.sendMode || 'sequential') as SendMode
      sendInterval.value = data.sendInterval || 2000
    } else {
      // 首次使用，创建默认4条评论
      comments.value = [
        { id: `comment-init-1`, content: '评论1', selected: false, createdAt: Date.now() },
        { id: `comment-init-2`, content: '评论2', selected: false, createdAt: Date.now() },
        { id: `comment-init-3`, content: '评论3', selected: false, createdAt: Date.now() },
        { id: `comment-init-4`, content: '评论4', selected: false, createdAt: Date.now() },
      ]
      await saveToDisk()
    }
    _loaded = true
  }

  async function saveToDisk() {
    if (!_loaded) return
    try {
      await window.electronAPI.saveComments({
        comments: JSON.parse(JSON.stringify(comments.value)),
        sendMode: sendMode.value,
        sendInterval: sendInterval.value,
      })
    } catch {}
  }

  let _commentCounter = 0
  function addComment(content: string) {
    comments.value.push({
      id: `comment-${Date.now()}-${_commentCounter++}`,
      content,
      selected: false,
      createdAt: Date.now(),
    })
    saveToDisk()
  }

  function updateComment(id: string, content: string) {
    const item = comments.value.find(c => c.id === id)
    if (item) {
      item.content = content
      saveToDisk()
    }
  }

  function deleteComment(id: string) {
    comments.value = comments.value.filter(c => c.id !== id)
    saveToDisk()
  }

  function deleteSelected() {
    comments.value = comments.value.filter(c => !c.selected)
    saveToDisk()
  }

  function toggleSelect(id: string) {
    const item = comments.value.find(c => c.id === id)
    if (item) item.selected = !item.selected
  }

  function selectAll() {
    comments.value.forEach(c => c.selected = true)
  }

  function deselectAll() {
    comments.value.forEach(c => c.selected = false)
  }

  const selectedComments = () => comments.value.filter(c => c.selected)

  return {
    comments, sendMode, sendInterval,
    addComment, updateComment, deleteComment, deleteSelected,
    toggleSelect, selectAll, deselectAll, selectedComments,
    loadFromDisk, saveToDisk,
  }
})
