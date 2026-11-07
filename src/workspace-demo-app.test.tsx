// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import App from './App'
import { loadDemoFiles } from './demo'
vi.mock('./demo', () => ({ loadDemoFiles: vi.fn() }))
const file = (name: string, text: string) =>
  ({
    name,
    size: text.length,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }) as File
it('App keeps manual chooser usable during demo fetch and manual import wins', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let resolve!: (files: [File, File]) => void
  vi.mocked(loadDemoFiles).mockReturnValue(
    new Promise((yes) => {
      resolve = yes
    }),
  )
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((el) => el.textContent?.includes(text))!
  try {
    await act(() => root.render(<App />))
    await act(() => button('Load synthetic example').click())
    const chooser = host.querySelector<HTMLInputElement>('input[aria-label="Choose before CSV"]')
    expect(chooser).not.toBeNull()
    Object.defineProperty(chooser, 'files', {
      value: [file('manual.csv', 'id,value\n1,Manual\n')],
      configurable: true,
    })
    await act(async () => {
      chooser!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(vi.mocked(loadDemoFiles).mock.calls[0][0].aborted).toBe(true)
    await act(async () => {
      resolve([
        file('demo-before.csv', 'id,value\n1,Demo\n'),
        file('demo-after.csv', 'id,value\n1,Demo\n'),
      ])
    })
    expect(host.textContent).toContain('manual.csv')
    expect(host.textContent).not.toContain('demo-before.csv')
    expect(host.querySelector('input[aria-label="Choose after CSV"]')).not.toBeNull()
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})
it('App preserves an actual mapped comparison through a failed demo request', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((el) => el.textContent?.includes(text))!
  const choose = async (label: string) => {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
    await act(() => {
      select.value = '0'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  vi.mocked(loadDemoFiles).mockResolvedValue([
    file('original-before.csv', 'id,value\n1,Before\n'),
    file('original-after.csv', 'id,value\n1,After\n'),
  ])
  try {
    await act(() => root.render(<App />))
    await act(async () => {
      button('Load synthetic example').click()
    })
    await act(() => button('Map columns').click())
    await choose('Before ID column')
    await choose('After ID column')
    await act(() => button('Map same-named fields').click())
    await act(() => button('Compare snapshots').click())
    const reviewText = host.querySelector('.step-content')!.textContent
    await act(() => button('Your snapshots').click())
    vi.mocked(loadDemoFiles).mockRejectedValue(new Error('Fetch failure'))
    await act(async () => {
      button('Load synthetic example').click()
    })
    expect(host.textContent).toContain('Previous workspace kept.')
    expect(button('Review & receipt').disabled).toBe(false)
    await act(() => button('Review & receipt').click())
    expect(host.querySelector('.step-content')!.textContent).toBe(reviewText)
    await act(() => button('Map the columns').click())
    expect(
      host.querySelector<HTMLSelectElement>('select[aria-label="Before ID column"]')!.value,
    ).toBe('0')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Field 1 label"]')!.value).toBe(
      'value',
    )
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})
