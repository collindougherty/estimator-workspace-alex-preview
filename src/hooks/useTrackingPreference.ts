import { useCallback, useEffect, useState } from 'react'

import {
  defaultTrackingPreference,
  readTrackingPreference,
  type TrackingPreference,
  writeTrackingPreference,
} from '../lib/tracking-preferences'

export const useTrackingPreference = (userId?: string | null) => {
  const [trackingPreference, setTrackingPreferenceState] = useState<TrackingPreference>(
    defaultTrackingPreference,
  )

  useEffect(() => {
    setTrackingPreferenceState(readTrackingPreference(userId))
  }, [userId])

  const setTrackingPreference = useCallback(
    (preference: TrackingPreference) => {
      setTrackingPreferenceState(preference)
      writeTrackingPreference(userId, preference)
    },
    [userId],
  )

  return { setTrackingPreference, trackingPreference }
}
