import 'maplibre-gl/dist/maplibre-gl.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const THEME_STORAGE_KEY = 'railmap_ui_theme'
try {
  const cachedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (cachedTheme === 'light' || cachedTheme === 'dark') {
    document.documentElement.setAttribute('data-ui-theme', cachedTheme)
  }
} catch {
  // Ignore unavailable localStorage runtime.
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
