import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDemoFiles } from './demo'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('bundled synthetic sources', () => {
  it.each(['/', '/review/', '/nested/app/', './'])(
    'uses the configured app base %s without requesting an origin-root fixture',
    async (base) => {
      vi.stubEnv('BASE_URL', base)
      const fetchMock = vi.fn().mockImplementation(async () => new Response('ID,Value\r\n1,é\r\n'))
      vi.stubGlobal('fetch', fetchMock)
      const controller = new AbortController()
      const files = await loadDemoFiles(controller.signal)
      expect(fetchMock.mock.calls).toEqual([
        [`${base}fixtures/handoff-before.csv`, { signal: controller.signal }],
        [`${base}fixtures/handoff-after.csv`, { signal: controller.signal }],
      ])
      expect(files.map((file) => file.name)).toEqual(['handoff-before.csv', 'handoff-after.csv'])
      for (const file of files) {
        expect(file.type).toBe('text/csv')
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(
          new TextEncoder().encode('ID,Value\r\n1,é\r\n'),
        )
      }
    },
  )

  it.each([0, 1])('does not accept a partial pair when source %s fails', async (failedSide) => {
    vi.stubEnv('BASE_URL', '/review/')
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async () => new Response('ID,Value\n1,x', { status: call++ === failedSide ? 404 : 200 }),
        ),
    )
    await expect(loadDemoFiles(new AbortController().signal)).rejects.toThrow(
      'Synthetic files could not be loaded. Choose CSV files instead.',
    )
  })

  it('propagates cancellation rather than returning a partial example', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, options: RequestInit) => {
        options.signal?.throwIfAborted()
        return new Response('ID,Value\n1,x')
      }),
    )
    await expect(loadDemoFiles(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
