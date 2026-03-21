type StudioChoiceButtonClassOptions = {
  active?: boolean
  extraClass?: string
}

type StudioStateButtonClassOptions = {
  compact?: boolean
  disabled?: boolean
  emphasized?: boolean
  extraClass?: string
}

const joinStudioClasses = (...classes: Array<string | false | null | undefined>) => {
  return classes.filter(Boolean).join(' ')
}

const studioSelectMenuContentUi = Object.freeze({
  content: 'rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm',
  item: 'studio-select-item rounded-none before:rounded-none text-[color:var(--studio-shell-text)]',
  itemDescription: 'whitespace-normal break-words text-[color:var(--studio-shell-muted)]',
  itemLabel: 'truncate',
  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
  itemTrailingIcon: 'text-[color:var(--studio-shell-label)]',
  placeholder: 'text-[color:var(--studio-shell-muted)]',
  trailingIcon: 'text-[color:var(--studio-shell-muted)]',
  value: 'text-[color:var(--studio-shell-text)]',
  viewport: 'scroll-py-1 overflow-y-auto'
})

const studioButtonClasses = Object.freeze({
  ghost: 'studio-button studio-button--ghost',
  iconGhost: 'studio-button studio-button--ghost studio-button--icon',
  primary: 'studio-button studio-button--primary',
  secondary: 'studio-button'
})

const studioPanelSurfaceClass = 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]'
const studioEmptyStateClass = 'border border-dashed border-[color:var(--studio-shell-border)] px-3 py-4 text-[0.72rem] text-[color:var(--studio-shell-muted)]'
const studioFieldBaseClass = 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
const studioCompactInputClass = 'w-full border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-1.5 text-[0.68rem] text-[color:var(--studio-shell-text)] outline-none placeholder:text-[color:var(--studio-shell-muted)]'
const studioModalSurfaceClass = 'flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-none border'
const studioModalHeaderClass = 'flex items-start justify-between gap-4 border-b border-[color:var(--studio-shell-border)] px-4 py-3'
const studioModalFooterClass = 'flex items-center justify-end gap-2 border-t border-[color:var(--studio-shell-border)] px-4 py-3'
const studioSectionKickerClass = 'font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]'
const studioFieldKickerClass = 'font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]'
const studioCompactFieldKickerClass = 'font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]'
const studioBodyCopyClass = 'text-[0.8rem] leading-5 text-[color:var(--studio-shell-muted)]'
const studioCompactBodyCopyClass = 'text-[0.74rem] leading-5 text-[color:var(--studio-shell-muted)]'
const studioCodeBlockClass = 'spec-code-block max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]'
const studioToolbarButtonClass = 'px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em]'

const getStudioChoiceButtonClass = ({
  active = false,
  extraClass = ''
}: StudioChoiceButtonClassOptions = {}) => {
  return joinStudioClasses(
    'studio-choice-button',
    extraClass,
    active && 'studio-choice-button--active'
  )
}

const getStudioStateButtonClass = ({
  compact = false,
  disabled = false,
  emphasized = false,
  extraClass = ''
}: StudioStateButtonClassOptions = {}) => {
  // These small state buttons power visibility toggles, tab switches, and
  // snap/export controls, so keeping the emphasis logic in one place prevents
  // each surface from drifting visually.
  return joinStudioClasses(
    'border px-2 py-1 font-mono uppercase tracking-[0.08em] transition-colors duration-150',
    compact ? 'text-[0.5rem]' : 'text-[0.52rem]',
    disabled && 'disabled:border-[color:var(--studio-divider)] disabled:text-[color:var(--studio-shell-muted)] disabled:opacity-60',
    emphasized
      ? 'border-[color:var(--studio-shell-label)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-label)] hover:bg-[color:var(--studio-surface-hover)]'
      : 'border-[color:var(--studio-divider)] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-surface-hover)]',
    extraClass
  )
}

const getStudioTabButtonClass = (active: boolean, withTrailingBorder = false) => {
  return joinStudioClasses(
    withTrailingBorder && 'border-r border-[color:var(--studio-divider)]',
    'px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.08em] transition-colors duration-150',
    active
      ? 'bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
      : 'text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)]'
  )
}

const getStudioToggleChipClass = ({
  active = false,
  extraClass = ''
}: StudioChoiceButtonClassOptions = {}) => {
  return joinStudioClasses(
    'studio-toggle-chip',
    extraClass,
    active && 'studio-toggle-chip--active'
  )
}

const getStudioSelectMenuSearchInputProps = (placeholder: string) => {
  return {
    placeholder,
    variant: 'none' as const,
    ui: {
      base: 'text-[color:var(--studio-shell-text)] placeholder:text-[color:var(--studio-shell-muted)]',
      leadingIcon: 'text-[color:var(--studio-shell-muted)]',
      root: 'px-1'
    }
  }
}

const studioUi = Object.freeze({
  buttonClasses: studioButtonClasses,
  getStudioChoiceButtonClass,
  getStudioSelectMenuSearchInputProps,
  getStudioStateButtonClass,
  getStudioTabButtonClass,
  getStudioToggleChipClass,
  joinStudioClasses,
  studioBodyCopyClass,
  studioCodeBlockClass,
  studioCompactBodyCopyClass,
  studioCompactFieldKickerClass,
  studioCompactInputClass,
  studioDefaultInputMenuProps: {
    autocomplete: 'off',
    openOnClick: true,
    openOnFocus: true
  } satisfies Record<string, unknown>,
  studioEmptyStateClass,
  studioFieldKickerClass,
  studioFieldUi: {
    base: studioFieldBaseClass
  },
  studioInputMenuUi: {
    ...studioSelectMenuContentUi,
    base: `studio-select-trigger ${studioFieldBaseClass}`
  },
  studioModalFooterClass,
  studioModalHeaderClass,
  studioModalSurfaceClass,
  studioModalSurfaceStyle: {
    backgroundColor: 'var(--studio-modal-bg)',
    borderColor: 'var(--studio-shell-border)',
    boxShadow: 'var(--studio-floating-shadow)',
    color: 'var(--studio-shell-text)'
  },
  studioModalUi: {
    overlay: 'bg-black/60 backdrop-blur-[2px]',
    content: 'overflow-visible border-none bg-transparent p-0 shadow-none ring-0'
  },
  studioPanelSurfaceClass,
  studioSectionKickerClass,
  studioSelectUi: {
    ...studioSelectMenuContentUi,
    base: `studio-select-trigger ${studioFieldBaseClass}`
  },
  studioSwitchUi: {
    base: 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-rail)] data-[state=checked]:bg-[color:var(--studio-shell-label)]',
    description: 'text-[0.7rem] text-[color:var(--studio-shell-muted)]',
    label: 'text-[0.78rem] text-[color:var(--studio-shell-text)]',
    thumb: 'bg-[color:var(--studio-modal-bg)]',
    wrapper: 'gap-1'
  },
  studioToolbarButtonClass,
  textareaClass: 'w-full resize-y border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] outline-none'
})

export const useStudioUi = () => studioUi
