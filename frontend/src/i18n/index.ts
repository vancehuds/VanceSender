import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import en from './en'

export type MessageSchema = typeof zhCN

const savedLang = localStorage.getItem('vs_lang') || 'zh-CN'

const i18n = createI18n<[MessageSchema], 'zh-CN' | 'en'>({
    legacy: false,
    locale: savedLang,
    fallbackLocale: 'zh-CN',
    messages: {
        'zh-CN': zhCN,
        en,
    },
})

export default i18n

export function setLanguage(lang: 'zh-CN' | 'en') {
    i18n.global.locale.value = lang
    localStorage.setItem('vs_lang', lang)
    document.documentElement.lang = lang === 'zh-CN' ? 'zh-CN' : 'en'
}

export function getCurrentLang() {
    return i18n.global.locale.value
}
