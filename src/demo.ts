/** Resolve the bundled example alongside the app, including non-root deployments. */
export async function loadDemoFiles(signal: AbortSignal): Promise<[File, File]> {
  const files = await Promise.all(
    (['before', 'after'] as const).map(async (side) => {
      const name = `handoff-${side}.csv`
      const response = await fetch(`${import.meta.env.BASE_URL}fixtures/${name}`, { signal })
      if (!response.ok)
        throw new Error('Synthetic files could not be loaded. Choose CSV files instead.')
      return new File([await response.arrayBuffer()], name, { type: 'text/csv' })
    }),
  )
  return [files[0], files[1]]
}
