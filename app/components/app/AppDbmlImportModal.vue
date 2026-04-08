<script setup lang="ts">
import type { Ref } from 'vue'
import {
  studioFieldUi,
  studioSwitchUi
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
  parseExecutableComments = false,
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
  parseExecutableComments?: boolean
  selectedFileName?: string
  title: string
}>()

const emit = defineEmits<{
  'clear-file': []
  'select-file': [files: FileList | null]
  'submit': []
  'update:parseExecutableComments': [value: boolean]
  'update:modelValue': [value: string]
  'update:open': [value: boolean]
}>()

const fileInputRef: Ref<HTMLInputElement | null> = ref(null)
const modalPrimaryButtonClass = studioButtonClasses.primary
const modalSecondaryButtonClass = studioButtonClasses.secondary
const importRulesClass = 'grid gap-1.5'
const importRulesSummaryClass = 'border-t border-[color:var(--studio-divider)] pt-2 text-[0.68rem] leading-6 text-[color:var(--studio-shell-muted)]'
const settingsPanelClass = 'grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3'
const errorPanelClass = 'grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]'
const hasPastedText = computed(() => modelValue.trim().length > 0)
const hasSelectedFile = computed(() => selectedFileName.trim().length > 0)
const activeInputSummary = computed(() => {
  if (hasSelectedFile.value && hasPastedText.value) {
    return 'Both inputs are filled. Clear one before importing.'
  }

  if (hasSelectedFile.value) {
    return `Import will use the selected file: ${selectedFileName}.`
  }

  if (hasPastedText.value) {
    return 'Import will use the pasted DBML text.'
  }

  return 'Choose a file or paste DBML text to begin the import.'
})

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
    surface-id="dbml-import"
    body-class="grid gap-4 px-4 py-3"
    @update:open="emit('update:open', $event)"
  >
    <div class="grid gap-4">
      <div :class="importRulesClass">
        <div :class="studioCompactFieldKickerClass">
          Import rules
        </div>
        <p :class="studioBodyCopyClass">
          {{ inputDescription }}
        </p>
        <p :class="importRulesSummaryClass">
          {{ activeInputSummary }}
        </p>
      </div>

      <slot name="before-inputs" />

      <div :class="settingsPanelClass">
        <div class="flex items-start justify-between gap-4">
          <div class="grid gap-1">
            <div :class="studioFieldKickerClass">
              Comment parsing
            </div>
            <p :class="studioBodyCopyClass">
              Try to extract functions, triggers, procedures, sequences, simple indexes, and similar SQL entities from DBML block comments. When PGML can recognize one cleanly, it removes that SQL from the comment and carries the nearby comment context into the imported object note.
            </p>
          </div>

          <USwitch
            :model-value="parseExecutableComments"
            color="neutral"
            :ui="studioSwitchUi"
            @update:model-value="emit('update:parseExecutableComments', $event === true)"
          />
        </div>
      </div>

      <label class="grid gap-2">
        <div class="flex items-center justify-between gap-3">
          <span :class="studioFieldKickerClass">
            Option A · Upload a DBML file
          </span>
          <span
            class="border px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em]"
            :class="hasSelectedFile
              ? 'border-[color:var(--studio-ring)] text-[color:var(--studio-shell-text)]'
              : 'border-[color:var(--studio-shell-border)] text-[color:var(--studio-shell-muted)]'"
          >
            {{ hasSelectedFile ? 'Active' : 'Idle' }}
          </span>
        </div>
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <UInput
            :model-value="selectedFileName"
            placeholder="No file selected"
            color="neutral"
            variant="outline"
            size="md"
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
          accept=".dbml,.dbdiagram,.txt"
          @change="handleFileSelection"
        >
      </label>

      <label class="grid gap-2">
        <div class="flex items-center justify-between gap-3">
          <span :class="studioFieldKickerClass">
            Option B · Paste DBML text
          </span>
          <span
            class="border px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em]"
            :class="hasPastedText
              ? 'border-[color:var(--studio-ring)] text-[color:var(--studio-shell-text)]'
              : 'border-[color:var(--studio-shell-border)] text-[color:var(--studio-shell-muted)]'"
          >
            {{ hasPastedText ? 'Active' : 'Idle' }}
          </span>
        </div>
        <textarea
          :value="modelValue"
          rows="12"
          :class="joinStudioClasses(textareaClass, 'min-h-56 font-mono text-[0.74rem] leading-6')"
          placeholder="Paste DBML here."
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
