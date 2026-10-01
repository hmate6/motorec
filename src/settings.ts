import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

export type Resolution = '720p' | '1080p' | '4k'
export type Fps = 30 | 60

export interface Settings {
  resolution: Resolution
  fps: Fps
  /** A motoros ikon alatti kis szöveg */
  label: string
  /** Sebesség-korrekció be/ki */
  speedCorrection: boolean
  /** E fölött a sebesség felett szoroz (km/h) */
  speedThreshold: number
  /** A küszöb feletti részre alkalmazott szorzó */
  speedFactor: number
  /** Készüljön-e második, UI-s videó */
  overlayVideo: boolean
  /** Bal/jobb dőlés felcserélése, ha fordítva mérne */
  invertLean: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  resolution: '1080p',
  fps: 60,
  label: 'MotoRec',
  speedCorrection: true,
  speedThreshold: 60,
  speedFactor: 0.8,
  overlayVideo: true,
  invertLean: false,
}

const KEY = 'motorec.settings.v1'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
          } catch {
            // hibás mentés: maradnak az alapértékek
          }
        }
      })
      .finally(() => setLoaded(true))
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  return { settings, update, loaded }
}
