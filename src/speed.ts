import * as Location from 'expo-location'
import { useEffect, useRef, useState } from 'react'

/**
 * Folytonos sebesség-korrekció:
 *   v <= T  ->  v
 *   v >  T  ->  T + (v - T) * k
 * Így nincs ugrás a küszöbnél (pl. T=60, k=0.8: 70 km/h -> 68 km/h).
 */
export function displayedSpeed(
  kmh: number,
  enabled: boolean,
  threshold: number,
  factor: number,
): number {
  if (!enabled || kmh <= threshold) return kmh
  return threshold + (kmh - threshold) * factor
}

export interface SpeedState {
  /** Mért sebesség km/h-ban (korrekció nélkül) */
  kmh: number
  /** GPS pontosság méterben, ha ismert */
  accuracy: number | null
  /** Van-e friss GPS adat */
  hasFix: boolean
  error: string | null
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * GPS alapú sebesség. Az iOS általában másodpercenként ad új értéket.
 * Ha a GPS nem ad sebességet, két pozícióból számol.
 * A `speedRef` mindig a legfrissebb m/s értéket tartja (a dőlésszög
 * számításához kell, újrarenderelés nélkül).
 */
export function useSpeed() {
  const [state, setState] = useState<SpeedState>({
    kmh: 0,
    accuracy: null,
    hasFix: false,
    error: null,
  })
  const speedRef = useRef(0) // m/s
  const lastPos = useRef<{ lat: number; lon: number; t: number } | null>(null)

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    let cancelled = false
    let staleTimer: ReturnType<typeof setInterval> | null = null
    let lastUpdate = 0

    ;(async () => {
      const perm = await Location.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') {
        setState((s) => ({ ...s, error: 'Nincs helymeghatározási engedély' }))
        return
      }
      if (cancelled) return
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 200,
          distanceInterval: 0,
        },
        (loc) => {
          const { latitude, longitude, speed, accuracy } = loc.coords
          const t = loc.timestamp / 1000
          let ms: number | null = speed != null && speed >= 0 ? speed : null

          if (ms == null && lastPos.current) {
            const dt = t - lastPos.current.t
            if (dt > 0.2) {
              ms =
                haversineMeters(
                  lastPos.current.lat,
                  lastPos.current.lon,
                  latitude,
                  longitude,
                ) / dt
            }
          }
          lastPos.current = { lat: latitude, lon: longitude, t }
          if (ms == null) return

          // enyhe simítás, hogy ne ugráljon a kijelzés
          const smoothed = speedRef.current * 0.3 + ms * 0.7
          speedRef.current = smoothed < 0.6 ? 0 : smoothed // ~2 km/h alatt 0
          lastUpdate = Date.now()
          setState({
            kmh: speedRef.current * 3.6,
            accuracy: accuracy ?? null,
            hasFix: true,
            error: null,
          })
        },
        (err) => setState((s) => ({ ...s, error: String(err) })),
      )
      if (cancelled) sub.remove()
    })()

    // Ha 3 mp-ig nincs új GPS adat, jelezzük
    staleTimer = setInterval(() => {
      if (lastUpdate > 0 && Date.now() - lastUpdate > 3000) {
        setState((s) => (s.hasFix ? { ...s, hasFix: false } : s))
      }
    }, 1000)

    return () => {
      cancelled = true
      sub?.remove()
      if (staleTimer) clearInterval(staleTimer)
    }
  }, [])

  return { speed: state, speedRef }
}
