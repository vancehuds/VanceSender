import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
    },
    {
        path: '/send',
        name: 'send',
        component: () => import('@/views/SendView.vue'),
    },
    {
        path: '/quick-send',
        name: 'quick-send',
        component: () => import('@/views/QuickSendView.vue'),
    },
    {
        path: '/ai',
        name: 'ai',
        component: () => import('@/views/AIGenerateView.vue'),
    },
    {
        path: '/presets',
        name: 'presets',
        component: () => import('@/views/PresetsView.vue'),
    },
    {
        path: '/settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

export default router
