import { createApp } from 'vue'
import App from './App.vue'
import pinia from './stores/index.js'
import './styles/main.css'

const app = createApp(App)
app.use(pinia)
app.mount('#app')
