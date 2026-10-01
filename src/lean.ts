/**
 * Dőlésszög becslés motorhoz.
 *
 * Miért nem elég a gravitáció?
 *   Kanyarban a centripetális gyorsulás és a gravitáció eredője pont a motor
 *   dőlésével párhuzamos, ezért egy gyorsulásmérő alapú mérés kanyarban ~0°-ot
 *   mutatna. Ezért:
 *
 *   1. A giroszkóp forgási sebességét integráljuk (gyors, pontos rövid távon).
 *   2. A lassú elcsúszást egy referenciaértékkel korrigáljuk:
 *        - álló helyzetben / lassan: a gravitáció iránya (itt helyes),
 *        - menet közben: fizikai modell  tan(dőlés) = v * ω_függőleges / g
 *          (v = GPS sebesség, ω = elfordulási sebesség a függőleges körül).
 *
 * Feltételezett rögzítés: a telefon fekvő (landscape) helyzetben, a hátsó
 * kamera menetirányba néz, a képernyő a motoros felé. Ekkor a dőlés a
 * telefon z tengelye (képernyőre merőleges) körüli elfordulás.
 *
 * Előjel: pozitív = balra dőlés.
 * Koordináták: iOS CoreMotion eszköz-koordináták (x, y a képernyő síkjában,
 * z a képernyőből kifelé). Az expo-sensors iOS-en:
 *   rotationRate.alpha = z, beta = y, gamma = x (fok/s)
 *   accelerationIncludingGravity - acceleration = gravitáció (m/s², lefelé mutat)
 */

export type Vec3 = { x: number; y: number; z: number }

const G = 9.80665
const DEG = 180 / Math.PI
const RAD = Math.PI / 180

function wrapDeg(a: number): number {
  let r = a
  while (r > 180) r -= 360
  while (r < -180) r += 360
  return r
}

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}

/** v elforgatása a z tengely körül `deg` fokkal */
function rotateZ(v: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z }
}

export interface LeanDebug {
  gyroRate: number
  gravityAngle: number
  modelAngle: number
  yawRate: number
  weight: number
}

export class LeanEstimator {
  /** Kalibrált "lefelé" irány az eszköz koordinátáiban (egységvektor) */
  private down: Vec3 | null = null
  private lastT: number | null = null
  private lastGravity: Vec3 | null = null
  /** Aktuális dőlés fokban, + = balra */
  angle = 0
  /** Időállandó (s): mennyire gyorsan húzza a referencia a giroszkópos értéket */
  tau = 1.2
  debug: LeanDebug = {
    gyroRate: 0,
    gravityAngle: 0,
    modelAngle: 0,
    yawRate: 0,
    weight: 0,
  }

  get isCalibrated(): boolean {
    return this.down != null
  }

  /** A kalibrált referencia (mentéshez). */
  get reference(): Vec3 | null {
    return this.down
  }

  /** Korábban mentett kalibráció visszatöltése. */
  setReference(v: Vec3) {
    this.down = normalize(v)
    this.angle = 0
  }

  /** Az aktuális helyzet lesz a 0°. Álló motornál, egyenesben kell megnyomni. */
  calibrate(): boolean {
    if (!this.lastGravity) return false
    this.down = normalize(this.lastGravity)
    this.angle = 0
    return true
  }

  /**
   * @param gravity gravitáció vektor (m/s², eszköz koordináták, lefelé)
   * @param rate forgási sebesség (fok/s) az eszköz x, y, z tengelye körül
   * @param t időbélyeg másodpercben
   * @param speedMs GPS sebesség m/s
   */
  update(gravity: Vec3, rate: Vec3, t: number, speedMs: number): number {
    this.lastGravity = gravity
    if (!this.down) {
      // első minta: ideiglenes nullpont, amíg nincs kalibrálás
      this.down = normalize(gravity)
    }
    const dt =
      this.lastT == null ? 0 : Math.min(Math.max(t - this.lastT, 0), 0.1)
    this.lastT = t
    if (dt === 0) return this.angle

    // 1) Giroszkóp: dőlési sebesség a z tengely körül
    this.angle += rate.z * dt

    // 2a) Gravitáció alapú szög (álló helyzetben helyes)
    const ref = this.down
    const gravityAngle = -wrapDeg(
      Math.atan2(gravity.y, gravity.x) * DEG - Math.atan2(ref.y, ref.x) * DEG,
    )

    // 2b) Fizikai modell: függőleges tengely körüli fordulás * sebesség
    const downNow = rotateZ(ref, -this.angle)
    const up = { x: -downNow.x, y: -downNow.y, z: -downNow.z }
    const yawRate = (rate.x * up.x + rate.y * up.y + rate.z * up.z) * RAD // rad/s
    const modelAngle = Math.atan((speedMs * yawRate) / G) * DEG

    // Átmenet: 5 km/h alatt gravitáció, 15 km/h felett modell
    const kmh = speedMs * 3.6
    const w = Math.min(Math.max((kmh - 5) / 10, 0), 1)
    const target = w * modelAngle + (1 - w) * gravityAngle

    // 3) Komplementer szűrő
    const k = dt / (this.tau + dt)
    this.angle += (target - this.angle) * k
    this.angle = Math.max(-75, Math.min(75, this.angle))

    this.debug = {
      gyroRate: rate.z,
      gravityAngle,
      modelAngle,
      yawRate: yawRate * DEG,
      weight: w,
    }
    return this.angle
  }
}
