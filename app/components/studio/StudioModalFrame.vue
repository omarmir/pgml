<script setup lang="ts">
const {
  bodyClass = 'px-4 py-4',
  description,
  open,
  surfaceId = 'modal',
  title,
  widthClass = 'max-w-2xl'
} = defineProps<{
  bodyClass?: string
  description: string
  open: boolean
  surfaceId?: string
  title: string
  widthClass?: string
}>()

const emit = defineEmits<{
  'close': []
  'update:open': [value: boolean]
}>()

const {
  buttonClasses,
  joinStudioClasses,
  studioBodyCopyClass,
  studioModalFooterClass,
  studioModalHeaderClass,
  studioModalSurfaceClass,
  studioModalSurfaceStyle,
  studioModalUi
} = useStudioUi()

const handleOpenChange = (nextValue: boolean) => {
  emit('update:open', nextValue)

  if (!nextValue) {
    emit('close')
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :description="description"
    :ui="studioModalUi"
    @update:open="handleOpenChange"
  >
    <template #content>
      <div
        :data-studio-modal-surface="surfaceId"
        :class="[studioModalSurfaceClass, widthClass]"
        :style="studioModalSurfaceStyle"
      >
        <div :class="studioModalHeaderClass">
          <div class="grid gap-1">
            <h2 class="text-[1rem] font-semibold leading-6 text-[color:var(--studio-shell-text)]">
              {{ title }}
            </h2>
            <p :class="studioBodyCopyClass">
              {{ description }}
            </p>
          </div>

          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            :class="buttonClasses.iconGhost"
            aria-label="Close"
            @click="handleOpenChange(false)"
          />
        </div>

        <div :class="bodyClass">
          <slot />
        </div>

        <div
          v-if="$slots.footer"
          :class="joinStudioClasses(studioModalFooterClass, 'mt-auto')"
        >
          <slot name="footer" />
        </div>
      </div>
    </template>
  </UModal>
</template>
