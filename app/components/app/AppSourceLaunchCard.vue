<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import {
  getStudioChoiceButtonClass,
  joinStudioClasses,
  studioButtonClasses,
  studioCompactBodyCopyClass,
  studioSectionKickerClass
} from '~/utils/uiStyles'

type SourceLaunchCardItem = {
  action?: {
    ariaLabel: string
    icon: string
    id: string
    value: string
  }
  description?: string
  label: string
  to?: RouteLocationRaw
  triggerAction?: {
    id: string
    value: string
  }
}

type SourceLaunchCardOperation = {
  description: string
  icon: string
  items?: SourceLaunchCardItem[]
  label: string
  placeholder?: boolean
  to?: RouteLocationRaw
  triggerAction?: {
    id: string
    value: string
  }
}

const {
  cardId,
  description,
  inventory,
  operations,
  sqlDumpDescription,
  statusLabel,
  statusTone = 'placeholder',
  title
} = defineProps<{
  cardId: string
  description: string
  inventory: string
  operations: SourceLaunchCardOperation[]
  sqlDumpDescription: string
  statusLabel: string
  statusTone?: 'live' | 'placeholder'
  title: string
}>()
const emit = defineEmits<{
  action: [payload: {
    actionId: string
    cardId: string
    value: string
  }]
}>()

const cardClass = joinStudioClasses(
  'relative flex h-full flex-col overflow-hidden border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-5 py-5 sm:px-6 sm:py-6'
)
const liveBadgeClass = 'inline-flex items-center gap-2 border border-[color:var(--studio-shell-label)] bg-[color:var(--studio-input-bg)] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-text)]'
const placeholderBadgeClass = 'inline-flex items-center gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-muted)]'
const operationLinkClass = getStudioChoiceButtonClass({
  extraClass: 'group flex w-full items-start justify-between gap-3 px-3 py-3 no-underline'
})
const operationPanelClass = 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-3'
const placeholderOperationClass = 'border border-dashed border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3 opacity-70'
const nestedItemLinkClass = getStudioChoiceButtonClass({
  extraClass: 'group flex w-full items-start justify-between gap-3 px-3 py-2 no-underline'
})
const nestedItemStaticClass = 'border border-dashed border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-2'
const nestedItemRowClass = 'flex items-start gap-2'
const itemActionButtonClass = joinStudioClasses(
  studioButtonClasses.iconGhost,
  'self-center'
)
const statusBadgeClass = computed(() => {
  return statusTone === 'live' ? liveBadgeClass : placeholderBadgeClass
})
const emitLaunchAction = (action: {
  id: string
  value: string
}) => {
  emit('action', {
    actionId: action.id,
    cardId,
    value: action.value
  })
}
const emitItemAction = (item: SourceLaunchCardItem) => {
  if (!item.action) {
    return
  }

  emitLaunchAction(item.action)
}
</script>

<template>
  <section
    :data-source-card="cardId"
    :class="cardClass"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <span :class="statusBadgeClass">
          {{ statusLabel }}
        </span>
        <h2 class="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--studio-shell-text)]">
          {{ title }}
        </h2>
        <p class="mt-2 text-[0.9rem] leading-7 text-[color:var(--studio-shell-muted)]">
          {{ description }}
        </p>
      </div>

      <div class="hidden border border-[color:var(--studio-shell-border)] px-3 py-2 text-right sm:block">
        <p class="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
          Inventory
        </p>
        <p class="mt-1 text-sm font-semibold text-[color:var(--studio-shell-text)]">
          {{ inventory }}
        </p>
      </div>
    </div>

    <div class="mt-6 grid flex-1 content-start gap-3">
      <template
        v-for="operation in operations"
        :key="operation.label"
      >
        <div
          v-if="operation.items?.length"
          :class="operationPanelClass"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                {{ operation.label }}
              </p>
              <p :class="studioCompactBodyCopyClass">
                {{ operation.description }}
              </p>
            </div>
            <UIcon
              :name="operation.icon"
              class="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-shell-label)]"
            />
          </div>

          <div class="mt-3 grid gap-2 border-t border-[color:var(--studio-shell-border)] pt-3">
            <template
              v-for="item in operation.items"
              :key="item.label"
            >
              <div :class="nestedItemRowClass">
                <NuxtLink
                  v-if="item.to"
                  :to="item.to"
                  :class="`${nestedItemLinkClass} flex-1`"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-[color:var(--studio-shell-text)]">
                      {{ item.label }}
                    </p>
                    <p
                      v-if="item.description"
                      :class="studioCompactBodyCopyClass"
                    >
                      {{ item.description }}
                    </p>
                  </div>
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-shell-label)] transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </NuxtLink>

                <button
                  v-else-if="item.triggerAction"
                  type="button"
                  :class="`${nestedItemLinkClass} flex-1 text-left`"
                  @click="emitLaunchAction(item.triggerAction)"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-[color:var(--studio-shell-text)]">
                      {{ item.label }}
                    </p>
                    <p
                      v-if="item.description"
                      :class="studioCompactBodyCopyClass"
                    >
                      {{ item.description }}
                    </p>
                  </div>
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-shell-label)] transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </button>

                <div
                  v-else
                  :class="`${nestedItemStaticClass} flex-1`"
                >
                  <p class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                    {{ item.label }}
                  </p>
                  <p
                    v-if="item.description"
                    :class="studioCompactBodyCopyClass"
                  >
                    {{ item.description }}
                  </p>
                </div>

                <UButton
                  v-if="item.action"
                  :icon="item.action.icon"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :class="itemActionButtonClass"
                  :aria-label="item.action.ariaLabel"
                  @click="emitItemAction(item)"
                >
                  <span class="sr-only">{{ item.action.ariaLabel }}</span>
                </UButton>
              </div>
            </template>
          </div>
        </div>

        <NuxtLink
          v-else-if="operation.to && !operation.placeholder"
          :to="operation.to"
          :class="operationLinkClass"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
              {{ operation.label }}
            </p>
            <p :class="studioCompactBodyCopyClass">
              {{ operation.description }}
            </p>
          </div>
          <UIcon
            :name="operation.icon"
            class="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-shell-label)] transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </NuxtLink>

        <button
          v-else-if="operation.triggerAction && !operation.placeholder"
          type="button"
          :class="`${operationLinkClass} text-left`"
          @click="emitLaunchAction(operation.triggerAction)"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
              {{ operation.label }}
            </p>
            <p :class="studioCompactBodyCopyClass">
              {{ operation.description }}
            </p>
          </div>
          <UIcon
            :name="operation.icon"
            class="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-shell-label)] transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </button>

        <div
          v-else
          :class="placeholderOperationClass"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                {{ operation.label }}
              </p>
              <p :class="studioCompactBodyCopyClass">
                {{ operation.description }}
              </p>
            </div>
            <UIcon
              :name="operation.icon"
              class="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--studio-shell-muted)]"
            />
          </div>
        </div>
      </template>
    </div>

    <div class="mt-6 border-t border-[color:var(--studio-shell-border)] pt-4">
      <div :class="studioSectionKickerClass">
        SQL dump
      </div>
      <p class="mt-2 text-[0.82rem] leading-6 text-[color:var(--studio-shell-muted)]">
        {{ sqlDumpDescription }}
      </p>
    </div>
  </section>
</template>
