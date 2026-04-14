export type StudioChoiceButtonClassOptions = {
  active?: boolean
  extraClass?: string
}

export type StudioStateButtonClassOptions = {
  compact?: boolean
  disabled?: boolean
  emphasized?: boolean
  extraClass?: string
}

export type StudioTabButtonClassOptions = {
  active: boolean
  withTrailingBorder?: boolean
}

export const joinStudioClasses = (...classes: Array<string | false | null | undefined>) => {
  return classes.filter(Boolean).join(' ')
}

export const studioButtonClasses = Object.freeze({
  ghost: 'studio-button studio-button--ghost',
  iconGhost: 'studio-button studio-button--ghost studio-button--icon',
  primary: 'studio-button studio-button--primary',
  secondary: 'studio-button'
})

export const studioPanelSurfaceClass = 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]'
export const studioEmptyStateClass = 'border border-dashed border-[color:var(--studio-shell-border)] px-3 py-4 text-[0.72rem] text-[color:var(--studio-shell-muted)]'
export const studioFieldBaseClass = 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
export const studioCompactInputClass = 'w-full border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-1.5 text-[0.68rem] text-[color:var(--studio-shell-text)] outline-none placeholder:text-[color:var(--studio-shell-muted)]'
export const studioModalSurfaceClass = 'flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-none border sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]'
export const studioModalHeaderClass = 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-[color:var(--studio-shell-border)] px-3 py-3 sm:px-4'
export const studioModalFooterClass = 'flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--studio-shell-border)] px-3 py-3 sm:px-4'
export const studioSectionKickerClass = 'font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]'
export const studioFieldKickerClass = 'font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]'
export const studioCompactFieldKickerClass = 'font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]'
export const studioBodyCopyClass = 'text-[0.8rem] leading-5 text-[color:var(--studio-shell-muted)]'
export const studioCompactBodyCopyClass = 'text-[0.74rem] leading-5 text-[color:var(--studio-shell-muted)]'
export const studioCodeBlockClass = 'spec-code-block max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]'
export const studioToolbarButtonClass = 'px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em]'
export const studioColorInputClass = 'h-9 w-full cursor-default border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] p-0.5'
export const textareaClass = 'w-full resize-y border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] outline-none'
export const studioPersistentSelectMenuProps = Object.freeze({
  resetSearchTermOnBlur: false,
  resetSearchTermOnSelect: false
})

export const getStudioChoiceButtonClass = ({
  active = false,
  extraClass = ''
}: StudioChoiceButtonClassOptions = {}) => {
  return joinStudioClasses(
    'studio-choice-button',
    active && 'studio-choice-button--active',
    extraClass
  )
}

export const getStudioStateButtonClass = ({
  compact = false,
  disabled = false,
  emphasized = false,
  extraClass = ''
}: StudioStateButtonClassOptions = {}) => {
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

export const getStudioTabButtonClass = ({
  active,
  withTrailingBorder = false
}: StudioTabButtonClassOptions) => {
  return joinStudioClasses(
    withTrailingBorder && 'border-r border-[color:var(--studio-divider)]',
    'px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.08em] transition-colors duration-150',
    active
      ? 'bg-[color:var(--studio-input-bg)] font-semibold text-[color:var(--studio-shell-text)] shadow-[inset_0_-2px_0_0_var(--studio-shell-label)]'
      : 'text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)]'
  )
}

export const getStudioToggleChipClass = ({
  active = false,
  extraClass = ''
}: StudioChoiceButtonClassOptions = {}) => {
  return joinStudioClasses(
    'studio-toggle-chip',
    active && 'studio-toggle-chip--active',
    extraClass
  )
}

export const getStudioSelectMenuSearchInputProps = (placeholder: string) => {
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
