<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import {
  appHeaderMobileMenuContent,
  appHeaderMobileMenuUi
} from '~/constants/ui'
import {
  getStudioStateButtonClass,
  joinStudioClasses
} from '~/utils/uiStyles'
import {
  diagramPanelTabIconByValue,
  diagramPanelTabLabelByValue,
  studioMobileWorkspaceViewIconByValue,
  studioMobileWorkspaceViewLabelByValue,
  type DiagramPanelTab,
  type StudioMobileWorkspaceView
} from '~/utils/studio-workspace'

const activePanelTab = defineModel<DiagramPanelTab>('activePanelTab', {
  required: true
})
const activeView = defineModel<StudioMobileWorkspaceView>('activeView', {
  required: true
})

const setActiveView = (view: StudioMobileWorkspaceView) => {
  activeView.value = view
}

const setPanelView = (tab: DiagramPanelTab) => {
  activePanelTab.value = tab
  activeView.value = 'panel'
}

const currentViewLabel = computed(() => {
  if (activeView.value === 'panel') {
    return `${diagramPanelTabLabelByValue[activePanelTab.value]} panel`
  }

  return studioMobileWorkspaceViewLabelByValue[activeView.value]
})
const currentCanvasView = computed(() => {
  return activeView.value === 'panel' ? 'panel' : 'diagram'
})
const mobileQuickViewButtons = computed(() => {
  return [
    {
      icon: studioMobileWorkspaceViewIconByValue.diagram,
      key: 'diagram',
      label: studioMobileWorkspaceViewLabelByValue.diagram,
      onSelect: () => {
        setActiveView('diagram')
      }
    },
    {
      icon: studioMobileWorkspaceViewIconByValue.panel,
      key: 'panel',
      label: diagramPanelTabLabelByValue[activePanelTab.value],
      onSelect: () => {
        setPanelView(activePanelTab.value)
      }
    },
    {
      icon: studioMobileWorkspaceViewIconByValue.pgml,
      key: 'pgml',
      label: studioMobileWorkspaceViewLabelByValue.pgml,
      onSelect: () => {
        setActiveView('pgml')
      }
    }
  ] satisfies Array<{
    icon: string
    key: StudioMobileWorkspaceView
    label: string
    onSelect: () => void
  }>
})

const studioMenuItems = computed<DropdownMenuItem[][]>(() => {
  return [[
    {
      icon: studioMobileWorkspaceViewIconByValue.diagram,
      label: studioMobileWorkspaceViewLabelByValue.diagram,
      onSelect: () => {
        setActiveView('diagram')
      }
    },
    {
      icon: studioMobileWorkspaceViewIconByValue.pgml,
      label: studioMobileWorkspaceViewLabelByValue.pgml,
      onSelect: () => {
        setActiveView('pgml')
      }
    },
    {
      icon: studioMobileWorkspaceViewIconByValue.panel,
      label: studioMobileWorkspaceViewLabelByValue.panel,
      children: [[
        {
          icon: diagramPanelTabIconByValue.inspector,
          label: diagramPanelTabLabelByValue.inspector,
          onSelect: () => {
            setPanelView('inspector')
          }
        },
        {
          icon: diagramPanelTabIconByValue.entities,
          label: diagramPanelTabLabelByValue.entities,
          onSelect: () => {
            setPanelView('entities')
          }
        },
        {
          icon: diagramPanelTabIconByValue.export,
          label: diagramPanelTabLabelByValue.export,
          onSelect: () => {
            setPanelView('export')
          }
        }
      ]]
    }
  ]]
})
</script>

<template>
  <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)]">
    <div class="border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-3 py-2.5">
      <div class="flex items-center gap-3">
        <UDropdownMenu
          :items="studioMenuItems"
          :content="appHeaderMobileMenuContent"
          :ui="appHeaderMobileMenuUi"
        >
          <button
            type="button"
            data-mobile-studio-menu="true"
            class="inline-flex cursor-default items-center gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
          >
            <UIcon
              name="i-lucide-panels-top-left"
              class="h-3.5 w-3.5 text-[color:var(--studio-shell-label)]"
            />
            <span>Studio</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="h-3.5 w-3.5 text-[color:var(--studio-shell-muted)]"
            />
          </button>
        </UDropdownMenu>

        <div class="min-w-0">
          <div class="font-mono text-[0.56rem] uppercase tracking-[0.12em] text-[color:var(--studio-shell-label)]">
            Mobile workspace
          </div>
          <div
            data-mobile-studio-current-view="true"
            class="truncate text-[0.84rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]"
          >
            {{ currentViewLabel }}
          </div>
        </div>
      </div>

      <div class="mt-2.5 grid grid-cols-3 gap-2">
        <button
          v-for="button in mobileQuickViewButtons"
          :key="button.key"
          :data-mobile-quick-view="button.key"
          type="button"
          :class="joinStudioClasses(
            getStudioStateButtonClass({
              compact: true,
              emphasized: activeView === button.key
            }),
            'flex min-w-0 cursor-default items-center justify-center gap-1.5 px-2.5 py-2'
          )"
          @click="button.onSelect"
        >
          <UIcon
            :name="button.icon"
            class="h-3.5 w-3.5 shrink-0"
          />
          <span class="truncate">
            {{ button.label }}
          </span>
        </button>
      </div>
    </div>

    <div class="min-h-0 overflow-hidden">
      <section
        v-show="activeView !== 'pgml'"
        data-mobile-studio-pane="canvas"
        :data-mobile-studio-canvas-view="currentCanvasView"
        class="h-full min-h-0"
      >
        <slot name="canvas" />
      </section>

      <section
        v-show="activeView === 'pgml'"
        data-mobile-studio-pane="pgml"
        data-mobile-studio-view="pgml"
        class="h-full min-h-0"
      >
        <slot name="pgml" />
      </section>
    </div>
  </div>
</template>
