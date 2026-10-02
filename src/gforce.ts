/**
 * G-erő becslés motorhoz.
 *
 * Feltételezett rögzítés (ugyanaz, mint a dőlésszögnél): fekvő telefon, a
 * hátsó kamera menetirányba néz. Ekkor a menetirány a telefon −z tengelye.
 *
 *  - Hosszanti (gyorsítás/fékezés): a gravitáció nélküli gyorsulás a menetirány
 *    mentén. A motor dőlése a z tengely körüli forgás, ezért ezt nem zavarja.
 *  - Oldalirányú (kanyar): motoron a telefonhoz képest kanyarban szinte nincs
 *    oldalirányú gyorsulás (a motor "belefekszik"), ezért a valódi kanyar G-t
 *    a fizikából számoljuk:  sebesség × fordulási szögsebesség / g.
 *  - Összes: a kettő eredője.
 *
 * A motor rezgése miatt erős simítás kell (exponenciális szűrő).
 */

const G = 9.80665
const RAD = Math.PI / 180

export interface GValues {
  /** + = gyorsítás, − = fékezés (G) */
  long: number
  /** kanyar, mindig pozitív (G) */
  lat: number
  /** eredő (G) */
  total: number
}

export class GForceEstimator {
  /** Simítás időállandója (s). Nagyobb = nyugodtabb, de késik. */
  tau = 0.3
  /** Ha a gyorsítás/fékezés előjele fordítva jönne ki */
  invertLong = false
  private lastT: number | null = null
  values: GValues = { long: 0, lat: 0, total: 0 }

  /**
   * @param userAccel gravitáció nélküli gyorsulás, m/s², eszköz koordinátákban
   * @param yawRateDeg fordulási szögsebesség a függőleges körül (fok/s)
   * @param speedMs sebesség (m/s, korrekció nélkül)
   * @param t időbélyeg (s)
   */
  update(
    userAccel: { x: number; y: number; z: number } | null,
    yawRateDeg: number,
    speedMs: number,
    t: number,
  ): GValues {
    const dt =
      this.lastT == null ? 0 : Math.min(Math.max(t - this.lastT, 0), 0.1)
    this.lastT = t
    if (dt === 0) return this.values

    // Az iOS gyorsulásmérője az előjelet "fordítva" adja (asztalon fekve
    // z = −1 g), ezért a −z irányú (előre) gyorsulás itt +z-ként jelenik meg.
    // Ezt valódi menetben ellenőrizni kell; ha fordítva jön ki, a beállítások
    // "gyorsítás/fékezés előjel csere" kapcsolója megfordítja.
    let longRaw = userAccel ? userAccel.z / G : 0
    if (this.invertLong) longRaw = -longRaw
    const latRaw = Math.abs((speedMs * yawRateDeg * RAD) / G)

    const k = dt / (this.tau + dt)
    const long = this.values.long + (longRaw - this.values.long) * k
    const lat = speedMs < 1.5 ? this.values.lat * (1 - k) : this.values.lat + (latRaw - this.values.lat) * k
    this.values = {
      long: clamp(long),
      lat: clamp(lat),
      total: clamp(Math.hypot(long, lat)),
    }
    return this.values
  }
}

function clamp(v: number) {
  return Math.max(-3, Math.min(3, v))
}
