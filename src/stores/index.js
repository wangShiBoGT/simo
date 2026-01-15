/**
 * Pinia Store 入口
 * 使用 pinia-plugin-persistedstate 自动持久化到 localStorage
 */

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

export default pinia
