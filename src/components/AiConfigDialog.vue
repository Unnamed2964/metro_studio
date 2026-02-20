<script setup>
import { nextTick, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { getAiConfig, setAiConfig, testAiConnection } from '../lib/ai/aiConfig.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

const baseUrlInputRef = ref(null)
const apiKeyInputRef = ref(null)
const modelInputRef = ref(null)

const baseUrl = ref('')
const apiKey = ref('')
const model = ref('')
const testing = ref(false)
const testResult = ref({ success: false, message: '' })

function loadConfig() {
  const config = getAiConfig()
  baseUrl.value = config.baseUrl
  apiKey.value = config.apiKey
  model.value = config.model
}

function doSave() {
  const trimmedBaseUrl = String(baseUrl.value || '').trim()
  const trimmedApiKey = String(apiKey.value || '').trim()
  const trimmedModel = String(model.value || '').trim()

  if (!trimmedBaseUrl) {
    baseUrlInputRef.value?.focus()
    return
  }

  const success = setAiConfig({
    baseUrl: trimmedBaseUrl,
    apiKey: trimmedApiKey,
    model: trimmedModel,
  })

  if (success) {
    emit('save')
    emit('close')
  }
}

function doCancel() {
  emit('close')
}

async function doTestConnection() {
  if (testing.value) return

  testing.value = true
  testResult.value = { success: false, message: '' }

  try {
    await testAiConnection()
    testResult.value = { success: true, message: '连接成功！' }
  } catch (error) {
    testResult.value = { success: false, message: String(error?.message || '连接失败') }
  } finally {
    testing.value = false
  }
}

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      loadConfig()
      await nextTick()
      if (apiKey.value) {
        baseUrlInputRef.value?.focus()
      } else {
        baseUrlInputRef.value?.focus()
      }
    }
  }
)
</script>

<template>
  <NModal :show="visible" preset="card" title="AI 配置" style="width:440px;max-width:calc(100vw - 32px)" @close="doCancel" @mask-click="doCancel">
    <div class="ai-config-dialog__body">
      <div class="ai-config-dialog__field">
        <label class="ai-config-dialog__label" for="ai-config-base-url">API Base URL</label>
        <input
          id="ai-config-base-url"
          ref="baseUrlInputRef"
          v-model="baseUrl"
          type="text"
          class="pp-input ai-config-dialog__input"
          placeholder="https://api.bltcy.ai"
        />
        <p class="ai-config-dialog__hint">兼容 OpenAI 格式的 API 地址</p>
      </div>
      <div class="ai-config-dialog__field">
        <label class="ai-config-dialog__label" for="ai-config-api-key">API Key</label>
        <input
          id="ai-config-api-key"
          ref="apiKeyInputRef"
          v-model="apiKey"
          type="password"
          class="pp-input ai-config-dialog__input"
          placeholder="sk-..."
        />
        <p class="ai-config-dialog__hint">用于 AI 站点翻译功能</p>
      </div>
      <div class="ai-config-dialog__field">
        <label class="ai-config-dialog__label" for="ai-config-model">模型名称</label>
        <input
          id="ai-config-model"
          ref="modelInputRef"
          v-model="model"
          type="text"
          class="pp-input ai-config-dialog__input"
          placeholder="如：gpt-4o, gemini-2.5-flash"
        />
        <p class="ai-config-dialog__hint">使用的 AI 模型标识符</p>
      </div>
      <div
        v-if="testResult.message"
        :class="['ai-config-dialog__test-result', testResult.success ? 'ai-config-dialog__test-result--success' : 'ai-config-dialog__test-result--error']"
      >
        {{ testResult.message }}
      </div>
    </div>
    <template #footer>
      <div class="ai-config-dialog__footer">
        <button
          class="ai-config-dialog__btn ai-config-dialog__btn--test"
          type="button"
          :disabled="testing"
          @click="doTestConnection"
        >
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button
          class="ai-config-dialog__btn ai-config-dialog__btn--cancel"
          type="button"
          @click="doCancel"
        >
          取消
        </button>
        <button
          class="ai-config-dialog__btn ai-config-dialog__btn--primary"
          type="button"
          @click="doSave"
        >
          保存
        </button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.ai-config-dialog__body {
  padding: 14px 20px 4px;
}

.ai-config-dialog__field {
  margin-bottom: 16px;
}

.ai-config-dialog__field:last-child {
  margin-bottom: 0;
}

.ai-config-dialog__label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--toolbar-text);
}

.ai-config-dialog__input {
  width: 100%;
  box-sizing: border-box;
}

.ai-config-dialog__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--toolbar-muted);
  line-height: 1.4;
}

.ai-config-dialog__test-result {
  margin: 8px 0 0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.ai-config-dialog__test-result--success {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.ai-config-dialog__test-result--error {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.ai-config-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
}

.ai-config-dialog__btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-normal);
  outline: none;
}

.ai-config-dialog__btn:focus-visible {
  box-shadow: var(--focus-ring);
}

.ai-config-dialog__btn--cancel {
  background: var(--toolbar-button-bg);
  border-color: var(--toolbar-button-border);
  color: var(--toolbar-button-text);
}

.ai-config-dialog__btn--cancel:hover {
  border-color: var(--toolbar-button-hover-border);
}

.ai-config-dialog__btn--primary {
  background: var(--ark-pink);
  border-color: var(--ark-pink);
  color: #fff;
}

.ai-config-dialog__btn--primary:hover {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

.ai-config-dialog__btn--test {
  background: var(--toolbar-button-bg);
  border-color: var(--toolbar-button-border);
  color: var(--toolbar-button-text);
  margin-right: auto;
}

.ai-config-dialog__btn--test:hover:not(:disabled) {
  border-color: var(--toolbar-button-hover-border);
}

.ai-config-dialog__btn--test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
