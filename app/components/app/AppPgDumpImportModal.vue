<script setup lang="ts">
import type { Ref } from 'vue'
import {
  studioFieldUi
} from '~/constants/ui'
import {
  joinStudioClasses,
  studioBodyCopyClass,
  studioButtonClasses,
  studioCompactFieldKickerClass,
  studioFieldKickerClass,
  textareaClass
} from '~/utils/uiStyles'

const {
  confirmLabel,
  description,
  errorMessage = null,
  inputDescription,
  isSubmitting = false,
  modelValue,
  open,
  selectedFileName = '',
  title
} = defineProps<{
  confirmLabel: string
  description: string
  errorMessage?: string | null
  inputDescription: string
  isSubmitting?: boolean
  modelValue: string
  open: boolean
  selectedFileName?: string
  title: string
}>()

const emit = defineEmits<{
  'clear-file': []
  'select-file': [files: FileList | null]
  'submit': []
  'update:modelValue': [value: string]
  'update:open': [value: boolean]
}>()

const fileInputRef: Ref<HTMLInputElement | null> = ref(null)
const modalPrimaryButtonClass = studioButtonClasses.primary
const modalSecondaryButtonClass = studioButtonClasses.secondary
const fileSelectionPanelClass = 'grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3'
const errorPanelClass = 'grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]'

const triggerFilePicker = () => {
  fileInputRef.value?.click()
}

const handleFileSelection = (event: Event) => {
  const target = event.target as HTMLInputElement | null

  emit('select-file', target?.files || null)
}

const clearSelectedFile = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }

  emit('clear-file')
}

const handleTextInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement | null

  emit('update:modelValue', target?.value || '')
}
</script>

<template>
  <StudioModalFrame
    :open="open"
    :title="title"
    :description="description"
    surface-id="pg-dump-import"
    body-class="grid gap-4 px-4 py-3"
    @update:open="emit('update:open', $event)"
  >
    <div class="grid gap-4">
      <div :class="fileSelectionPanelClass">
        <div :class="studioCompactFieldKickerClass">
          Import rules
        </div>
        <p :class="studioBodyCopyClass">
          {{ inputDescription }}
        </p>
      </div>

      <label class="grid gap-1">
        <span :class="studioFieldKickerClass">
          Upload a text pg_dump file
        </span>
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <UInput
            :model-value="selectedFileName"
            placeholder="No file selected"
            color="neutral"
            variant="outline"
            size="sm"
            readonly
            :ui="studioFieldUi"
          />

          <UButton
            label="Choose file"
            color="neutral"
            variant="soft"
            :class="modalPrimaryButtonClass"
            :disabled="isSubmitting"
            @click="triggerFilePicker"
          />

          <UButton
            label="Clear"
            color="neutral"
            variant="outline"
            :class="modalSecondaryButtonClass"
            :disabled="selectedFileName.length === 0 || isSubmitting"
            @click="clearSelectedFile"
          />
        </div>

        <input
          ref="fileInputRef"
          class="sr-only"
          type="file"
          accept=".dump,.pgdump,.pgsql,.sql,.txt"
          @change="handleFileSelection"
        >
      </label>

      <label class="grid gap-1">
        <span :class="studioFieldKickerClass">
          Paste pg_dump text
        </span>
        <textarea
          :value="modelValue"
          rows="12"
          :class="joinStudioClasses(textareaClass, 'min-h-56 font-mono text-[0.74rem] leading-6')"
          placeholder="Paste a text pg_dump here."
          :disabled="isSubmitting"
          @input="handleTextInput"
        />
      </label>

      <div
        v-if="errorMessage"
        :class="errorPanelClass"
      >
        <div class="flex items-start gap-2">
          <UIcon
            name="i-lucide-circle-alert"
            class="mt-0.5 h-4 w-4 shrink-0"
          />
          <p>{{ errorMessage }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="outline"
        :class="modalSecondaryButtonClass"
        :disabled="isSubmitting"
        @click="emit('update:open', false)"
      />
      <UButton
        :label="confirmLabel"
        color="neutral"
        variant="soft"
        :class="modalPrimaryButtonClass"
        :loading="isSubmitting"
        @click="emit('submit')"
      />
    </template>
  </StudioModalFrame>
</template>
