import { describe, expect, it } from 'vitest'
import { useStudioPersistenceSession, type PersistenceWriteResult } from '../../app/composables/useStudioPersistenceSession'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
const onError = () => 'Unable to save'

describe('studio persistence session', () => {
  it('never acknowledges an old write into a newly selected target', async () => {
    const session = useStudioPersistenceSession<string>()
    const write = deferred<PersistenceWriteResult<string>>()
    session.select('A', 'old A')
    session.observe('new A')
    const result = session.save({ target: 'A', snapshot: 'new A', mode: 'manual', write: () => write.promise, onError })
    session.select('B', 'B text')
    session.observe('B text')
    write.resolve({ ok: true, target: 'A' })
    expect(await result).toBe(false)
    expect(session.selection.value).toEqual({ kind: 'selected', target: 'B', persistedSnapshot: 'B text', hasSavedInSession: false })
    expect(session.isSaving.value).toBe(false)
  })

  it('serializes and coalesces writes while keeping the newest pending request busy', async () => {
    const session = useStudioPersistenceSession<string>()
    const firstWrite = deferred<PersistenceWriteResult<string>>()
    const secondWrite = deferred<PersistenceWriteResult<string>>()
    const writes: string[] = []
    session.select('A', 'old')
    const first = session.save({ target: 'A', snapshot: 'one', mode: 'manual', write: () => {
      writes.push('one')
      return firstWrite.promise
    }, onError
    })
    const secondRequest = { target: 'A', snapshot: 'two', mode: 'manual' as const, write: () => {
      writes.push('two')
      return secondWrite.promise
    }, onError
    }
    const second = session.save(secondRequest)
    expect(session.save(secondRequest)).toBe(second)
    expect(writes).toEqual(['one'])
    firstWrite.resolve({ ok: true, target: 'A' })
    expect(await first).toBe(true)
    expect(session.isSaving.value).toBe(true)
    expect(writes).toEqual(['one', 'two'])
    secondWrite.resolve({ ok: true, target: 'A' })
    expect(await second).toBe(true)
    expect(session.persistedSnapshot.value).toBe('two')
    expect(session.isSaving.value).toBe(false)
  })

  it('preserves the final request when content returns to an earlier pending snapshot', async () => {
    const session = useStudioPersistenceSession<string>()
    const firstWrite = deferred<PersistenceWriteResult<string>>()
    const writes: string[] = []
    session.select('A', 'old')
    const first = session.save({ target: 'A', snapshot: 'one', mode: 'manual', write: () => {
      writes.push('one')
      return firstWrite.promise
    }, onError
    })
    const second = session.save({ target: 'A', snapshot: 'two', mode: 'manual', write: () => {
      writes.push('two')
      return { ok: true, target: 'A' }
    }, onError
    })
    const third = session.save({ target: 'A', snapshot: 'one', mode: 'manual', write: () => {
      writes.push('one')
      return { ok: true, target: 'A' }
    }, onError
    })
    expect(third).not.toBe(first)
    firstWrite.resolve({ ok: true, target: 'A' })
    await Promise.all([first, second, third])
    expect(writes).toEqual(['one', 'two', 'one'])
    expect(session.persistedSnapshot.value).toBe('one')
  })

  it('skips superseded autosaves and clears busy status', async () => {
    const session = useStudioPersistenceSession<string>()
    session.select('A', 'old')
    session.observe('latest')
    let wrote = false
    expect(await session.save({ target: 'A', snapshot: 'stale', mode: 'autosave', write: () => {
      wrote = true
      return { ok: true, target: 'A' }
    }, onError
    })).toBe(false)
    expect(wrote).toBe(false)
    expect(session.isSaving.value).toBe(false)
  })

  it('coalesces passive requests while retaining a live joined owner and its full writer context', async () => {
    const session = useStudioPersistenceSession<string>()
    const active = deferred<PersistenceWriteResult<string>>()
    const writes: string[] = []
    let ownerA = true
    session.select('A', 'old')
    const first = session.save({ target: 'A', snapshot: 'one', mode: 'manual', write: () => active.promise, onError })
    session.observe('two')
    const oldOwner = session.save({ target: 'A', snapshot: 'two', mode: 'autosave', isAutosaveEligible: () => ownerA, write: () => {
      writes.push('disposed writer')
      return { ok: true, target: 'A' }
    }, onError })
    const liveOwner = session.save({ target: 'A', snapshot: 'two', mode: 'autosave', isAutosaveEligible: () => true, write: () => {
      writes.push('live writer')
      return { ok: true, target: 'A' }
    }, onError })
    expect(liveOwner).toBe(oldOwner)
    ownerA = false
    active.resolve({ ok: true, target: 'A' })
    await first
    expect(await liveOwner).toBe(true)
    expect(writes).toEqual(['live writer'])
    expect(session.persistedSnapshot.value).toBe('two')
    expect(session.isSaving.value).toBe(false)
  })

  it('rechecks passive eligibility after a queued autosave waits for an earlier write', async () => {
    const session = useStudioPersistenceSession<string>()
    const active = deferred<PersistenceWriteResult<string>>()
    const writes: string[] = []
    let eligible = true
    session.select('A', 'old')
    const first = session.save({ target: 'A', snapshot: 'one', mode: 'manual', write: () => active.promise, onError })
    session.observe('two')
    const queued = session.save({ target: 'A', snapshot: 'two', mode: 'autosave', isAutosaveEligible: () => eligible, write: () => {
      writes.push('two')
      return { ok: true, target: 'A' }
    }, onError })
    eligible = false
    active.resolve({ ok: true, target: 'A' })
    expect(await first).toBe(true)
    expect(await queued).toBe(false)
    expect(writes).toEqual([])
    expect(session.error.value).toBe(null)
    expect(session.persistedSnapshot.value).toBe('one')
    expect(session.isSaving.value).toBe(false)
  })

  it('retains dirty baseline after failure and allows retry', async () => {
    const session = useStudioPersistenceSession<string>()
    session.select('A', 'old')
    expect(await session.save({ target: 'A', snapshot: 'new', mode: 'manual', write: () => {
      throw new Error('denied')
    }, onError
    })).toBe(false)
    expect(session.error.value).toBe('Unable to save')
    expect(session.persistedSnapshot.value).toBe('old')
    expect(await session.save({ target: 'A', snapshot: 'new', mode: 'manual', write: () => ({ ok: true, target: 'A' }), onError })).toBe(true)
    expect(session.error.value).toBeNull()
    expect(session.persistedSnapshot.value).toBe('new')
  })

  it('keeps the physical queue across resets and discards queued old generations', async () => {
    const session = useStudioPersistenceSession<string>()
    const write = deferred<PersistenceWriteResult<string>>()
    const writes: string[] = []
    session.select('A', 'old')
    const first = session.save({ target: 'A', snapshot: 'one', mode: 'manual', write: () => write.promise, onError })
    const stale = session.save({ target: 'A', snapshot: 'two', mode: 'manual', write: () => {
      writes.push('stale')
      return { ok: true, target: 'A' }
    }, onError
    })
    session.clear()
    session.select('B', 'B')
    const latest = session.save({ target: 'B', snapshot: 'latest', mode: 'manual', write: () => {
      writes.push('B')
      return { ok: true, target: 'B' }
    }, onError
    })
    expect(writes).toEqual([])
    write.resolve({ ok: true, target: 'A' })
    expect(await first).toBe(false)
    expect(await stale).toBe(false)
    expect(await latest).toBe(true)
    expect(writes).toEqual(['B'])
  })
})
