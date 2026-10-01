import AsyncStorage from '@react-native-async-storage/async-storage'
import { DeviceMotion } from 'expo-sensors'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { LeanEstimator } from './lean'

const CAL_KEY = 'motorec.calibration.v1'

/**
 * Mozgásszenzor feliratkozás + dőlésszög becslés.
 * A becslés 60 Hz-en fut, a kijelzés ~15 Hz-en frissül.
 */
export function useLean(speedRef: RefObject<number>, invert: boolean) {
  const estimator = useRef(new LeanEstimator())
  const angleRef = useRef(0) // + = balra (invert után)
  const [angle, setAngle] = useState(0)
  const [available, setAvailable] = useState<boolean | null>(null)
  const invertRef = useRef(invert)
  invertRef.current = invert

  useEffect(() => {
    let sub: { remove: () => void } | null = null
    let uiTimer: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    ;(async () => {
      // korábbi kalibráció visszatöltése
      try {
        const raw = await AsyncStorage.getItem(CAL_KEY)
        if (raw) estimator.current.setReference(JSON.parse(raw))
      } catch {
        // nincs mentett kalibráció
      }
      const ok = await DeviceMotion.isAvailableAsync()
      if (cancelled) return
      setAvailable(ok)
      if (!ok) return
      DeviceMotion.setUpdateInterval(16)
      sub = DeviceMotion.addListener((m) => {
        const rr = m.rotationRate
        const ag = m.accelerationIncludingGravity
        if (!rr || !ag) return
        const a = m.acceleration
        // gravitáció = (felhasználói gyorsulás + gravitáció) - felhasználói gyorsulás
        const gravity = a
          ? { x: ag.x - a.x, y: ag.y - a.y, z: ag.z - a.z }
          : { x: ag.x, y: ag.y, z: ag.z }
        // expo-sensors iOS: alpha = z, beta = y, gamma = x (fok/s)
        const rate = { x: rr.gamma, y: rr.beta, z: rr.alpha }
        const t = ag.timestamp ?? Date.now() / 1000
        const raw = estimator.current.update(
          gravity,
          rate,
          t,
          speedRef.current ?? 0,
        )
        angleRef.current = invertRef.current ? -raw : raw
      })
      uiTimer = setInterval(() => setAngle(angleRef.current), 66)
    })()

    return () => {
      cancelled = true
      sub?.remove()
      if (uiTimer) clearInterval(uiTimer)
    }
  }, [speedRef])

  const calibrate = useCallback(() => {
    const ok = estimator.current.calibrate()
    const ref = estimator.current.reference
    if (ok && ref) AsyncStorage.setItem(CAL_KEY, JSON.stringify(ref)).catch(() => {})
    return ok
  }, [])

  return { angle, angleRef, calibrate, available, estimator }
}
