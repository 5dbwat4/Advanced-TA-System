import './index.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'

import App from './App.vue'
import router from './router'
import { initSentry } from './lib/sentry'

initSentry()

createApp(App).use(createPinia()).use(router).use(ui).mount('#app')
