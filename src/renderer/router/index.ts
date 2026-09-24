import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'workflow', component: () => import('../views/WorkflowView.vue') },
    { path: '/bots', name: 'bots', component: () => import('../views/BotManageView.vue') },
    { path: '/comments', name: 'comments', component: () => import('../views/CommentTable.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsPage.vue') },
  ],
})

export default router