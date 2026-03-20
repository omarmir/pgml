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

const studioFieldBaseClass = 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'

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
  getStudioSelectMenuSearchInputProps,
  studioDefaultInputMenuProps: {
    autocomplete: 'off',
    openOnClick: true,
    openOnFocus: true
  } satisfies Record<string, unknown>,
  studioFieldUi: {
    base: studioFieldBaseClass
  },
  studioInputMenuUi: {
    ...studioSelectMenuContentUi,
    base: `studio-select-trigger ${studioFieldBaseClass}`
  },
  studioModalSurfaceStyle: {
    backgroundColor: 'var(--studio-modal-bg)',
    borderColor: 'var(--studio-shell-border)',
    boxShadow: 'var(--studio-floating-shadow)',
    color: 'var(--studio-shell-text)'
  },
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
  textareaClass: 'w-full resize-y border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] outline-none'
})

export const useStudioUi = () => studioUi
