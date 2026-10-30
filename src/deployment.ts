/** Build-time choice. The standard local build retains its existing workflow. */
export const HOSTED_DEMO = import.meta.env.MODE === 'hosted'
