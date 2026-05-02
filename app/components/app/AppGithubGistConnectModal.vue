<script setup lang="ts">
import type { Ref } from 'vue'
import { githubFineGrainedTokenUrl } from '~/utils/github-gists'
import {
  joinStudioClasses,
  studioBodyCopyClass,
  studioButtonClasses,
  studioFieldKickerClass
} from '~/utils/uiStyles'
import { studioFieldUi } from '~/constants/ui'

const {
  accountLabel,
  errorMessage = null,
  gistId,
  isSubmitting = false,
  open,
  token
} = defineProps<{
  accountLabel: string
  errorMessage?: string | null
  gistId: string
  isSubmitting?: boolean
  open: boolean
  token: string
}>()

const emit = defineEmits<{
  'submit': []
  'update:accountLabel': [value: string]
  'update:gistId': [value: string]
  'update:open': [value: boolean]
  'update:token': [value: string]
}>()

const tokenInputRef: Ref<HTMLInputElement | null> = ref(null)
const modalPrimaryButtonClass = studioButtonClasses.primary
const modalSecondaryButtonClass = studioButtonClasses.secondary
const infoPanelClass = 'grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3'
const errorPanelClass = 'grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]'

const handleSubmit = () => {
  emit('submit')
}
</script>

<template>
  <StudioModalFrame
    :open="open"
    title="Connect GitHub Gist"
    description="Use a GitHub token with Gist write access to load and save remote PGML files. PGML keeps the token only in memory after this form is submitted."
    surface-id="github-gist-connect"
    body-class="grid gap-4 px-4 py-3"
    @update:open="emit('update:open', $event)"
    @after-leave="tokenInputRef?.blur()"
  >
    <form
      class="grid gap-4"
      autocomplete="on"
      @submit.prevent="handleSubmit"
    >
      <div :class="infoPanelClass">
        <div :class="studioFieldKickerClass">
          Password manager
        </div>
        <p :class="studioBodyCopyClass">
          Save the token in your browser password manager or Bitwarden when prompted. PGML stores only the Gist ID and account label locally.
        </p>
        <a
          :href="githubFineGrainedTokenUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="joinStudioClasses(studioButtonClasses.ghost, 'inline-flex w-fit items-center gap-2 px-2 py-1 text-[0.72rem] no-underline')"
        >
          <UIcon
            name="i-lucide-external-link"
            class="h-3.5 w-3.5"
          />
          Create GitHub token
        </a>
      </div>

      <label class="grid gap-1">
        <span :class="studioFieldKickerClass">
          Account label
        </span>
        <UInput
          :model-value="accountLabel"
          name="username"
          autocomplete="username"
          placeholder="GitHub username or account label"
          color="neutral"
          variant="outline"
          size="sm"
          :ui="studioFieldUi"
          :disabled="isSubmitting"
          @update:model-value="emit('update:accountLabel', String($event))"
        />
      </label>

      <label class="grid gap-1">
        <span :class="studioFieldKickerClass">
          Gist ID
        </span>
        <UInput
          :model-value="gistId"
          name="gist-id"
          autocomplete="off"
          placeholder="GitHub Gist ID"
          color="neutral"
          variant="outline"
          size="sm"
          :ui="studioFieldUi"
          :disabled="isSubmitting"
          @update:model-value="emit('update:gistId', String($event))"
        />
      </label>

      <label class="grid gap-1">
        <span :class="studioFieldKickerClass">
          GitHub token
        </span>
        <UInput
          ref="tokenInputRef"
          :model-value="token"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="GitHub token with Gist write access"
          color="neutral"
          variant="outline"
          size="sm"
          :ui="studioFieldUi"
          :disabled="isSubmitting"
          @update:model-value="emit('update:token', String($event))"
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

      <button
        class="sr-only"
        type="submit"
      >
        Connect GitHub Gist
      </button>
    </form>

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
        label="Connect Gist"
        color="neutral"
        variant="soft"
        :class="modalPrimaryButtonClass"
        :loading="isSubmitting"
        @click="handleSubmit"
      />
    </template>
  </StudioModalFrame>
</template>
