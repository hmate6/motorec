import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_EFFECTS,
  DEFAULT_OVERLAY,
  mergeOverlay,
  OVERLAY_VERSION,
  type EffectsConfig,
  type OverlayConfig,
} from './overlayConfig'

export type Resolution = '720p' | '1080p' | '4k'
export type Fps = 30 | 60
/** Melyik hátsó kamerát használja */
export type Lens = 'ultra-wide' | 'wide' | 'tele'

export interface Settings {
  resolution: Resolution
  fps: Fps
  lens: Lens
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
  /** G-erő: gyorsítás/fékezés előjelének cseréje, ha fordítva mérne */
  invertLong: boolean
  /** A UI teljes kinézete */
  overlay: OverlayConfig
  overlayVersion: number
  /** Videó effektek (csak a UI-s videón) */
  effects: EffectsConfig
}

export const DEFAULT_SETTINGS: Settings = {
  resolution: '1080p',
  fps: 60,
  lens: 'wide',
  speedCorrection: true,
  speedThreshold: 60,
  speedFactor: 0.8,
  overlayVideo: true,
  invertLean: false,
  invertLong: false,
  overlay: DEFAULT_OVERLAY,
  overlayVersion: OVERLAY_VERSION,
  effects: DEFAULT_EFFECTS,
}

const KEY = 'motorec.settings.v1'

function migrate(raw: any): Settings {
  // Új elrendezés: a régi overlay beállítás helyett az új alapértékek,
  // csak a betű és a saját logó marad meg.
  const oldOverlay = raw?.overlay
  const overlay =
    raw?.overlayVersion === OVERLAY_VERSION
      ? mergeOverlay(oldOverlay)
      : mergeOverlay({
          font: oldOverlay?.font ?? DEFAULT_OVERLAY.font,
          logo: {
            ...DEFAULT_OVERLAY.logo,
            customFile: oldOverlay?.logo?.customFile ?? null,
            aspect: oldOverlay?.logo?.aspect ?? DEFAULT_OVERLAY.logo.aspect,
          },
        })
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    overlay,
    overlayVersion: OVERLAY_VERSION,
    effects: { ...DEFAULT_EFFECTS, ...(raw?.effects ?? {}) },
  }
  // régi verzió: a logó felirata külön `label` mezőben volt
  if (typeof raw?.label === 'string' && !raw?.overlay) {
    merged.overlay.logo.labelText = raw.label
  }
  delete (merged as any).label
  return merged
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          try {
            setSettings(migrate(JSON.parse(raw)))
          } catch {
            // hibás mentés: maradnak az alapértékek
          }
        }
      })
      .finally(() => setLoaded(true))
  }, [])

  const save = (next: Settings) => {
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
    return next
  }

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => save({ ...prev, ...patch }))
  }, [])

  const updateOverlay = useCallback((patch: Partial<OverlayConfig>) => {
    setSettings((prev) => save({ ...prev, overlay: { ...prev.overlay, ...patch } }))
  }, [])

  /** Egy UI elem (logo / speed / gforce / lean) részleges módosítása */
  const updateElement = useCallback(
    <K extends 'logo' | 'speed' | 'gforce' | 'lean'>(
      key: K,
      patch: Partial<OverlayConfig[K]>,
    ) => {
      setSettings((prev) =>
        save({
          ...prev,
          overlay: {
            ...prev.overlay,
            [key]: { ...prev.overlay[key], ...patch },
          },
        }),
      )
    },
    [],
  )

  const updateEffects = useCallback((patch: Partial<EffectsConfig>) => {
    setSettings((prev) => save({ ...prev, effects: { ...prev.effects, ...patch } }))
  }, [])

  return { settings, update, updateOverlay, updateElement, updateEffects, loaded }
}
