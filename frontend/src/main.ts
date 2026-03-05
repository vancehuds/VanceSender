import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import i18n from './i18n'
import App from './App.vue'

// Styles
import './styles/variables.css'
import './styles/base.css'
import './styles/glassmorphism.css'
import './styles/animations.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
