import { studioFieldBaseClass } from '../utils/uiStyles'

type DropdownMenuAlign = 'end' | 'start'
type DropdownMenuSide = 'bottom'

type DropdownMenuContentConfig = Readonly<{
  align: DropdownMenuAlign
  side: DropdownMenuSide
  sideOffset: number
}>

type StudioModalSurfaceStyle = Readonly<{
  backgroundColor: string
  borderColor: string
  boxShadow: string
  color: string
}>

type UiClassMap = Readonly<Record<string, string>>

const studioSelectMenuContentUi: UiClassMap = Object.freeze({
  content: 'z-[70] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm',
  item: 'studio-select-item rounded-none before:rounded-none text-[color:var(--studio-shell-text)]',
  itemDescription: 'whitespace-normal break-words text-[color:var(--studio-shell-muted)]',
  itemLabel: 'truncate',
  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
  itemTrailingIcon: 'text-[color:var(--studio-shell-label)]',
  placeholder: 'min-w-0 whitespace-normal break-words text-left text-[color:var(--studio-shell-muted)]',
  trailingIcon: 'text-[color:var(--studio-shell-muted)]',
  value: 'min-w-0 whitespace-normal break-words text-left text-[color:var(--studio-shell-text)]',
  viewport: 'scroll-py-1 overflow-y-auto'
})

const appHeaderMenuUiBase: UiClassMap = Object.freeze({
  content: 'min-w-[15rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-xl',
  group: 'p-0',
  separator: 'my-1 bg-[color:var(--studio-shell-border)]',
  item: 'rounded-none px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] data-[highlighted]:bg-[color:var(--studio-shell-text)]/10 data-[highlighted]:text-[color:var(--studio-shell-text)]',
  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
  itemLabel: 'truncate'
})

export const studioDefaultInputMenuProps = Object.freeze({
  autocomplete: 'off',
  openOnClick: true,
  openOnFocus: true
} satisfies Record<string, unknown>)

export const studioFieldUi = Object.freeze({
  base: studioFieldBaseClass
})

// Select and input menus share the same trigger/content surface on purpose.
const studioSelectTriggerUi: UiClassMap = Object.freeze({
  ...studioSelectMenuContentUi,
  base: `studio-select-trigger w-full min-w-0 ${studioFieldBaseClass}`
})

export const studioInputMenuUi = studioSelectTriggerUi

export const studioModalSurfaceStyle: StudioModalSurfaceStyle = Object.freeze({
  backgroundColor: 'var(--studio-modal-bg)',
  borderColor: 'var(--studio-shell-border)',
  boxShadow: 'var(--studio-floating-shadow)',
  color: 'var(--studio-shell-text)'
})

export const studioModalUi: UiClassMap = Object.freeze({
  overlay: 'z-40 bg-black/60 backdrop-blur-[2px]',
  content: 'z-[60] overflow-visible border-none bg-transparent p-0 shadow-none ring-0'
})

export const studioSelectUi = studioSelectTriggerUi

export const studioSwitchUi: UiClassMap = Object.freeze({
  base: 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-rail)] data-[state=checked]:bg-[color:var(--studio-shell-label)]',
  description: 'text-[0.7rem] text-[color:var(--studio-shell-muted)]',
  label: 'text-[0.78rem] text-[color:var(--studio-shell-text)]',
  thumb: 'bg-[color:var(--studio-modal-bg)]',
  wrapper: 'gap-1'
})

export const appHeaderDesktopMenuContent: DropdownMenuContentConfig = Object.freeze({
  align: 'start',
  side: 'bottom',
  sideOffset: 10
})

export const appHeaderDesktopMenuUi = appHeaderMenuUiBase

export const appHeaderMobileMenuContent: DropdownMenuContentConfig = Object.freeze({
  align: 'end',
  side: 'bottom',
  sideOffset: 10
})

export const appHeaderMobileMenuUi = Object.freeze({
  ...appHeaderMenuUiBase,
  content: 'min-w-[16rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-xl'
})
