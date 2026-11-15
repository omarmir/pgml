import { describe, expect, it } from 'vitest'
import { useAsyncOperation } from '../../app/composables/useAsyncOperation'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

describe('latest async operation', () => {
  it('applies only the latest completion and retains pending while an older result settles', async () => {
    const operation = useAsyncOperation()
    const first = deferred<string>()
    const second = deferred<string>()
    const values: string[] = []
    const options = { apply: (value: string) => {
      values.push(value)
    }, onError: () => 'failed'
    }
    const old = operation.run({ ...options, task: () => first.promise })
    const latest = operation.run({ ...options, task: () => second.promise })
    first.resolve('old')
    expect((await old).kind).toBe('stale')
    expect(operation.pending.value).toBe(true)
    second.resolve('latest')
    expect((await latest).kind).toBe('applied')
    expect(values).toEqual(['latest'])
    expect(operation.pending.value).toBe(false)
  })

  it('ignores invalidated failures and lets a failed operation retry', async () => {
    const operation = useAsyncOperation()
    const held = deferred<string>()
    const pending = operation.run({ task: () => held.promise, apply: () => {}, onError: () => 'old error' })
    operation.invalidate()
    held.reject(new Error('stale'))
    expect((await pending).kind).toBe('stale')
    expect(operation.error.value).toBeNull()
    await operation.run({ task: async () => {
      throw new Error('failed')
    }, apply: () => {}, onError: () => 'retry me'
    })
    expect(operation.error.value).toBe('retry me')
    await operation.run({ task: async () => 'good', apply: () => {}, onError: () => 'failed' })
    expect(operation.error.value).toBeNull()
  })
})
