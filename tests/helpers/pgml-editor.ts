import type { Locator, Page } from '@playwright/test'

type PgmlEditorState = {
  anchor: number
  head: number
  scrollTop: number
  value: string
}

export const getPgmlEditor = (page: Page): Locator => {
  return page.locator('[data-pgml-editor="true"]')
}

export const readPgmlEditorState = async (editor: Locator) => {
  return editor.evaluate((element): PgmlEditorState => {
    const host = element as HTMLDivElement & {
      __pgmlEditorView?: {
        scrollDOM: HTMLDivElement
        state: {
          doc: {
            toString: () => string
          }
          selection: {
            main: {
              anchor: number
              head: number
            }
          }
        }
      }
    }
    const view = host.__pgmlEditorView

    if (!view) {
      return {
        anchor: 0,
        head: 0,
        scrollTop: 0,
        value: ''
      }
    }

    return {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop,
      value: view.state.doc.toString()
    }
  })
}

export const readPgmlEditorValue = async (editor: Locator) => {
  const state = await readPgmlEditorState(editor)

  return state.value
}

export const setPgmlEditorValue = async (editor: Locator, value: string) => {
  await editor.evaluate((element, nextValue) => {
    const host = element as HTMLDivElement & {
      __pgmlEditorView?: {
        dispatch: (transaction: {
          changes: {
            from: number
            insert: string
            to: number
          }
        }) => void
        state: {
          doc: {
            length: number
          }
        }
      }
    }
    const view = host.__pgmlEditorView

    if (!view) {
      return
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextValue
      }
    })
  }, value)
}

export const setPgmlEditorSelection = async (editor: Locator, anchor: number, head: number) => {
  await editor.evaluate((element, selection) => {
    const host = element as HTMLDivElement & {
      __pgmlEditorView?: {
        dispatch: (transaction: {
          selection: {
            anchor: number
            head: number
          }
        }) => void
      }
    }
    const view = host.__pgmlEditorView

    if (!view) {
      return
    }

    view.dispatch({
      selection: {
        anchor: selection.anchor,
        head: selection.head
      }
    })
  }, {
    anchor,
    head
  })
}

export const setPgmlEditorScrollTop = async (editor: Locator, scrollTop: number) => {
  await editor.evaluate((element, nextScrollTop) => {
    const host = element as HTMLDivElement & {
      __pgmlEditorView?: {
        scrollDOM: HTMLDivElement
      }
    }
    const view = host.__pgmlEditorView

    if (!view) {
      return
    }

    view.scrollDOM.scrollTop = nextScrollTop
  }, scrollTop)
}
