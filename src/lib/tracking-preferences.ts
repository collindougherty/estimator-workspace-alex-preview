export type TrackingPreference = 'task-breakdown' | 'project-totals'

export const defaultTrackingPreference: TrackingPreference = 'task-breakdown'

export const trackingPreferenceOptions: Array<{
  description: string
  label: string
  value: TrackingPreference
}> = [
  {
    description: 'Keep labor and materials in the task / WBS breakdown by default.',
    label: 'Task / WBS breakdown',
    value: 'task-breakdown',
  },
  {
    description: 'Keep things simple with project totals first, then open WBS detail only when needed.',
    label: 'Project totals',
    value: 'project-totals',
  },
]

const getTrackingPreferenceStorageKey = (userId?: string | null) =>
  `profitbuilder:tracking-preference:${userId ?? 'anonymous'}`

const isTrackingPreference = (value: string | null): value is TrackingPreference =>
  value === 'task-breakdown' || value === 'project-totals'

export const readTrackingPreference = (userId?: string | null): TrackingPreference => {
  if (typeof window === 'undefined') {
    return defaultTrackingPreference
  }

  const storedValue = window.localStorage.getItem(getTrackingPreferenceStorageKey(userId))
  return isTrackingPreference(storedValue) ? storedValue : defaultTrackingPreference
}

export const writeTrackingPreference = (
  userId: string | null | undefined,
  preference: TrackingPreference,
) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(getTrackingPreferenceStorageKey(userId), preference)
}
