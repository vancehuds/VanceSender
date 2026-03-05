import { ref } from 'vue'

export interface OnboardingStep {
    title: string
    description: string
    target?: string
    position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * Composable providing the default onboarding steps for VanceSender.
 * Steps target specific CSS selectors in the sidebar and views.
 */
export function useOnboarding() {
    const steps = ref<OnboardingStep[]>([
        {
            title: '欢迎使用 VanceSender',
            description: '一个为 FiveM RP 文字发送而设计的工具。让我们快速了解一下主要功能吧！',
        },
        {
            title: '发送面板',
            description: '在这里编辑和管理你的 /me 和 /do 文本。支持拖拽排序、批量导入，还可以保存为预设。',
            target: '[data-nav="send"]',
            position: 'right',
        },
        {
            title: '快捷发送',
            description: '从预设中选择文本，点击即可快速发送。适合需要高效操作的场景。',
            target: '[data-nav="quick-send"]',
            position: 'right',
        },
        {
            title: 'AI 生成',
            description: '输入场景描述，让 AI 自动帮你生成 RP 文本。支持流式生成和场景模板。',
            target: '[data-nav="ai"]',
            position: 'right',
        },
        {
            title: '预设管理',
            description: '管理你保存的所有预设。支持标签筛选、批量操作、导入导出。',
            target: '[data-nav="presets"]',
            position: 'right',
        },
        {
            title: '设置',
            description: '调整发送延迟、输入方式、网络访问等参数。还可以切换语言。',
            target: '[data-nav="settings"]',
            position: 'right',
        },
        {
            title: '准备就绪！',
            description: '现在你可以开始使用了。如果需要再次查看引导，可以在设置中重置。',
        },
    ])

    return { steps }
}
