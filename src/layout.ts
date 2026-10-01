/**
 * Az overlay elrendezése a videókép méretéhez (W x H) viszonyítva.
 * Ugyanezeket az arányokat kapja meg a natív renderelő is, így a képernyőn
 * látott UI és a videóra égetett UI ugyanúgy néz ki.
 */
export const OVERLAY_LAYOUT = {
  /** Szélső margó a videó magasságának arányában */
  margin: 0.035,
  /** Logó+szöveg doboz területe a teljes kép területének arányában (5%) */
  logoAreaFraction: 0.05,
  /** A motoros kép oldalaránya (szélesség / magasság) */
  logoAspect: 1.5,
  /** A logó alatti szöveg sávjának magassága a kép magasságához képest */
  labelBandRatio: 0.2,
  /** Sebesség betűmérete (H arányában) */
  speedFont: 0.1,
  /** "km/h" betűmérete a sebesség betűméretéhez képest */
  unitScale: 0.42,
  /** Dőlésszög betűmérete (H arányában) */
  leanFont: 0.085,
  /** Dőlés felirat (BAL / JOBB) betűmérete (H arányában) */
  leanLabelFont: 0.032,
} as const

export interface LogoBox {
  x: number
  y: number
  width: number
  imageHeight: number
  labelHeight: number
  height: number
}

/** A bal felső logó doboz mérete úgy, hogy a teljes doboz a kép 5%-a legyen. */
export function logoBox(W: number, H: number): LogoBox {
  const L = OVERLAY_LAYOUT
  // doboz: szélesség = w, magasság = w/aspect * (1 + labelBandRatio)
  // terület = w^2 * (1 + r) / aspect = fraction * W * H
  const k = (1 + L.labelBandRatio) / L.logoAspect
  const width = Math.sqrt((L.logoAreaFraction * W * H) / k)
  const imageHeight = width / L.logoAspect
  const labelHeight = imageHeight * L.labelBandRatio
  const m = L.margin * H
  return {
    x: m,
    y: m,
    width,
    imageHeight,
    labelHeight,
    height: imageHeight + labelHeight,
  }
}
