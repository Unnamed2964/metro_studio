<script setup>
import { onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { setMessageApi } from '../composables/useToast.js'
import { setDialogApi } from '../composables/useDialog.js'

const message = useMessage()
const dialog = useDialog()

onMounted(() => {
  setMessageApi(message)
  setDialogApi(dialog)
})
</script>

<template>
  <slot />
</template>
