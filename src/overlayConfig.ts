/**
 * Az overlay (UI) teljes, testreszabható beállítása.
 *
 * Ugyanezt a konfigurációt kapja meg JSON-ként a natív renderelő is
 * (modules/overlay-renderer/ios/OverlayRendererModule.swift), így a képernyőn
 * látott UI és a videóra égetett UI ugyanazokból a számokból készül.
 *
 * Mértékegységek:
 *  - szöveg méret (size, unitSize, captionSize): a betűméret a videókép
 *    MAGASSÁGÁNAK %-ában (pl. 10 = a kép magasságának 10%-a)
 *  - logó méret: a logó+felirat doboz területe a teljes kép TERÜLETÉNEK %-ában
 *  - labelSize: a logó alatti felirat sáv magassága a logó kép magasságának %-ában
 *  - margin: a széltől mért távolság a kép magasságának %-ában
 *  - opacity, shadow, bgOpacity: 0–100
 */

/** Pozíció: t/b = fent/lent, l/c/r = bal/közép/jobb */
export type Anchor = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'
export type Weight = 'medium' | 'bold' | 'black'

export interface BaseElement {
  visible: boolean
  anchor: Anchor
  size: number
  opacity: number
}

export interface LogoElement extends BaseElement {
  /** Saját kép fájlneve az app Dokumentumok mappájában (null = beépített) */
  customFile: string | null
  /** A logó kép oldalaránya (szélesség / magasság) */
  aspect: number
  labelVisible: boolean
  labelText: string
  labelSize: number
  labelColor: string
}

/**
 * G-erő fajtája:
 *  - total: gyorsítás/fékezés és kanyar együtt (mindig pozitív)
 *  - long:  csak gyorsítás (+) / fékezés (−)
 *  - lat:   csak kanyar (oldalirányú)
 */
export type GMode = 'total' | 'long' | 'lat'

/** Szám kijelző (sebesség, G-erő) – a jobb felső sarokban egymás alatt */
export interface ValueElement {
  visible: boolean
  /** Betűméret a kép magasságának %-ában */
  size: number
  opacity: number
  color: string
  unitVisible: boolean
  unitText: string
}

export interface SpeedElement extends ValueElement {
  /** A sebesség + G-erő csoport helye */
  anchor: Anchor
  /**
   * A csoport távolsága a kép szélétől, a kép magasságának %-ában.
   * A számjegyek tetejétől mérve (nem a szövegdoboztól), így a sebesség
   * egészen közel kerülhet a kép széléhez.
   */
  edge: number
}

export interface GForceElement extends ValueElement {
  gMode: GMode
}

/**
 * Dőlésszög műszer: félköríves skála a dőlés irányába kitöltve,
 * alatta a két érték: "bal | jobb".
 */
export interface LeanGaugeElement {
  visible: boolean
  anchor: Anchor
  /** A számok betűmérete a kép magasságának %-ában */
  size: number
  /** Az ív átmérője a kép magasságának %-ában */
  gaugeSize: number
  gaugeVisible: boolean
  numbersVisible: boolean
  opacity: number
  color: string
  /** A legnagyobb dőlés jelzése kis vonással az íven (felvételenként) */
  showMax: boolean
  /** E fölött más színű (pl. piros) */
  warnEnabled: boolean
  warnAngle: number
  warnColor: string
}

/** Betűtípus: Oswald (beépítve) vagy az iPhone rendszerbetűje */
export type FontChoice = 'oswald' | 'system'

export interface OverlayConfig {
  margin: number
  font: FontChoice
  weight: Weight
  /** Árnyék erőssége 0–100 (0 = nincs) */
  shadow: number
  /** Lekerekített háttér a feliratok mögött */
  bgEnabled: boolean
  bgColor: string
  bgOpacity: number
  logo: LogoElement
  speed: SpeedElement
  gforce: GForceElement
  lean: LeanGaugeElement
}

/** Az overlay beállítás szerkezetének verziója (régi mentéskor újra alapértékre áll) */
export const OVERLAY_VERSION = 2

export const BUILTIN_LOGO_ASPECT = 1.5

export const DEFAULT_OVERLAY: OverlayConfig = {
  margin: 3.5,
  font: 'oswald',
  weight: 'black',
  shadow: 60,
  bgEnabled: false,
  bgColor: '#000000',
  bgOpacity: 35,
  logo: {
    visible: false,
    anchor: 'tl',
    size: 5,
    opacity: 100,
    customFile: null,
    aspect: BUILTIN_LOGO_ASPECT,
    labelVisible: true,
    labelText: 'MotoRec',
    labelSize: 20,
    labelColor: '#FFFFFF',
  },
  speed: {
    visible: true,
    anchor: 'tr',
    edge: 1.2,
    size: 4.5,
    opacity: 55,
    color: '#FFFFFF',
    unitVisible: false,
    unitText: 'km/h',
  },
  gforce: {
    visible: true,
    size: 3.2,
    opacity: 45,
    color: '#FFFFFF',
    unitVisible: false,
    unitText: 'G',
    gMode: 'total',
  },
  lean: {
    visible: true,
    anchor: 'bl',
    size: 3.6,
    gaugeSize: 13,
    gaugeVisible: true,
    numbersVisible: true,
    opacity: 100,
    color: '#FFFFFF',
    showMax: true,
    warnEnabled: true,
    warnAngle: 30,
    warnColor: '#FF3B30',
  },
}

/** Mentett (esetleg régebbi verziójú) beállítás összefésülése az alapértékekkel. */
export function mergeOverlay(saved: Partial<OverlayConfig> | undefined): OverlayConfig {
  const s = saved ?? {}
  return {
    ...DEFAULT_OVERLAY,
    ...s,
    logo: { ...DEFAULT_OVERLAY.logo, ...(s.logo ?? {}) },
    speed: { ...DEFAULT_OVERLAY.speed, ...(s.speed ?? {}) },
    gforce: { ...DEFAULT_OVERLAY.gforce, ...(s.gforce ?? {}) },
    lean: { ...DEFAULT_OVERLAY.lean, ...(s.lean ?? {}) },
  }
}

export interface LogoDims {
  width: number
  imageHeight: number
  labelHeight: number
  height: number
}

/** A logó doboz mérete úgy, hogy (kép + felirat) a kép területének size%-a legyen. */
export function logoDims(logo: LogoElement, W: number, H: number): LogoDims {
  const area = (logo.size / 100) * W * H
  const r = logo.labelVisible ? logo.labelSize / 100 : 0
  const a = logo.aspect > 0 ? logo.aspect : BUILTIN_LOGO_ASPECT
  const imageHeight = Math.sqrt(area / (a * (1 + r)))
  const labelHeight = imageHeight * r
  return {
    width: imageHeight * a,
    imageHeight,
    labelHeight,
    height: imageHeight + labelHeight,
  }
}

/**
 * A beépített betűk PostScript-nevei vastagságonként. Ugyanezeket a neveket
 * használja a Swift renderelő is. A fájlok: assets/fonts/ (app.json → expo-font).
 * Saját betű hozzáadása: a .ttf az assets/fonts-ba, az app.json expo-font
 * listájába, ide egy új FontChoice, és a Swift fájlban a fontName() függvénybe.
 */
export const FONT_NAMES: Record<Exclude<FontChoice, 'system'>, Record<Weight, string>> = {
  oswald: {
    medium: 'OswaldTab-Medium',
    bold: 'OswaldTab-SemiBold',
    black: 'OswaldTab-Bold',
  },
}

/** A React Native szövegstílus a betűhöz (fontFamily vagy rendszerbetű + vastagság) */
export function fontStyle(font: FontChoice, weight: Weight) {
  if (font === 'system') return { fontWeight: WEIGHT_RN[weight] }
  return { fontFamily: FONT_NAMES[font][weight], fontWeight: 'normal' as const }
}

export const WEIGHT_RN: Record<Weight, '500' | '700' | '900'> = {
  medium: '500',
  bold: '700',
  black: '900',
}

/** #RRGGBB + 0–100 átlátszatlanság -> rgba() */
export function rgba(hex: string, opacity100 = 100): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const v = m ? parseInt(m[1], 16) : 0xffffff
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity100 / 100))})`
}

/** Az árnyék, a háttér és a betűkhöz tartozó arányok (natív oldalon ugyanígy) */
export const SHADOW_RADIUS = 0.12
export const BG_PAD_H = 0.22
export const BG_PAD_V = 0.08
export const BG_RADIUS = 0.18
export const LABEL_FONT = 0.72

/**
 * Videó effektek – csak a UI-s (második) videón jelennek meg, mert a felvétel
 * utáni feldolgozáskor kerülnek rá. Erősség: 0–100.
 */
export interface EffectsConfig {
  enabled: boolean
  /** Sugárirányú elmosás a kép szélein, sebességgel nő */
  speedBlur: number
  /** Sötétített szélek */
  vignette: number
  /** Enyhe ráközelítés sebességgel */
  speedZoom: number
  /** Erősebb kontraszt és telítettség */
  punch: number
  /** Ettől a (kijelzett) sebességtől kezdenek hatni a sebességfüggő effektek */
  fromKmh: number
  /** Ennél a sebességnél teljes az erősség */
  fullKmh: number
}

export const DEFAULT_EFFECTS: EffectsConfig = {
  enabled: false,
  speedBlur: 50,
  vignette: 40,
  speedZoom: 30,
  punch: 30,
  fromKmh: 50,
  fullKmh: 150,
}

/** G-erő kiírása (egy tizedes, a mínusz jel valódi mínusz) */
export function formatG(g: number): string {
  const v = Math.round(g * 10) / 10
  return (v < 0 ? '−' : '') + Math.abs(v).toFixed(1)
}

/**
 * A dőlés-műszer geometriája. A Swift renderelő pontosan ugyanezt számolja
 * (LeanGaugeGeometry), hogy a képernyőn és a videón egyforma legyen.
 *
 * Az ív felső félkör; a mutató szöge = a dőlés szöge (90° = vízszintes).
 */
export interface GaugeGeometry {
  width: number
  height: number
  /** Ív középpontja a dobozon belül */
  cx: number
  cy: number
  r: number
  stroke: number
  /** Az ív alatti számsor teteje és magassága */
  numbersTop: number
  numbersHeight: number
  font: number
  /** A "|" elválasztótól mért távolság a két számig */
  divGap: number
}

export function gaugeGeometry(e: LeanGaugeElement, H: number): GaugeGeometry {
  const font = (e.size / 100) * H
  const D = e.gaugeVisible ? (e.gaugeSize / 100) * H : font * 4
  const stroke = D * 0.075
  const r = D / 2 - stroke / 2
  const arcH = e.gaugeVisible ? D / 2 + stroke / 2 : 0
  const gap = e.gaugeVisible && e.numbersVisible ? font * 0.2 : 0
  const numbersHeight = e.numbersVisible ? font * GAUGE_LINE : 0
  return {
    width: D,
    height: arcH + gap + numbersHeight,
    cx: D / 2,
    cy: D / 2,
    r,
    stroke,
    numbersTop: arcH + gap,
    numbersHeight,
    font,
    divGap: font * 0.4,
  }
}

/** Pont az íven: a = szög a függőlegestől, + = jobbra (fok) */
export function arcPoint(g: GaugeGeometry, a: number, radius = g.r) {
  const rad = (a * Math.PI) / 180
  return { x: g.cx + radius * Math.sin(rad), y: g.cy - radius * Math.cos(rad) }
}

/** A számsor sormagassága a betűmérethez képest */
export const GAUGE_LINE = 1.5

/**
 * Betű-metrikák a betűméret arányában (a sebesség/G csoport pontos
 * elhelyezéséhez): ascent = a sor tetejétől az alapvonalig, digitTop = a
 * számjegyek magassága az alapvonal felett. Oswald: a fontfájlból mérve.
 * A Swift oldal ugyanezt a digitTop-ot használja (az ascent-et a betűből veszi).
 */
export const FONT_METRICS: Record<FontChoice, { ascent: number; digitTop: number }> = {
  oswald: { ascent: 1.193, digitTop: 0.822 },
  system: { ascent: 0.952, digitTop: 0.72 },
}

/**
 * Rés a sebesség alapvonala és a G-erő számjegyeinek teteje között, a
 * sebesség betűméretének arányában.
 */
export const VALUE_GAP = 0.5
