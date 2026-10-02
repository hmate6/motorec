import React from 'react'
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import {
  arcPoint,
  BG_PAD_H,
  BG_PAD_V,
  BG_RADIUS,
  fontStyle,
  formatG,
  gaugeGeometry,
  LABEL_FONT,
  logoDims,
  rgba,
  SHADOW_RADIUS,
  type Anchor,
  type GaugeGeometry,
  type OverlayConfig,
} from './overlayConfig'

export const LOGO = require('../assets/moto-icon.png')

interface Props {
  /** A videókép területe a képernyőn */
  width: number
  height: number
  config: OverlayConfig
  logoSource: ImageSourcePropType
  /** Kijelzett sebesség (km/h, korrekcióval) */
  speedKmh: number
  /** G-erő a kiválasztott fajtában */
  g: number
  leanLeft: number
  leanRight: number
  /** A felvétel eddigi legnagyobb dőlései */
  maxLeft: number
  maxRight: number
}

/** Abszolút pozíció a kiválasztott sarokhoz / középhez */
function anchorStyle(anchor: Anchor, m: number): ViewStyle {
  const s: ViewStyle = { position: 'absolute' }
  if (anchor[0] === 't') s.top = m
  else s.bottom = m
  if (anchor[1] === 'l') {
    s.left = m
    s.alignItems = 'flex-start'
  } else if (anchor[1] === 'r') {
    s.right = m
    s.alignItems = 'flex-end'
  } else {
    s.left = 0
    s.right = 0
    s.alignItems = 'center'
  }
  return s
}

/** Ív a felső félkörön `from`-tól `to`-ig (fok a függőlegestől, + = jobbra) */
function arcPath(g: GaugeGeometry, from: number, to: number): string {
  const p0 = arcPoint(g, from)
  const p1 = arcPoint(g, to)
  const sweep = to > from ? 1 : 0
  const large = Math.abs(to - from) > 180 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${g.r} ${g.r} 0 ${large} ${sweep} ${p1.x} ${p1.y}`
}

const clampA = (a: number) => Math.max(-90, Math.min(90, a))

/**
 * A képernyőn látható overlay. Ugyanazokat az arányokat használja, mint a
 * natív renderelő, így a mentett UI-s videó ugyanígy fog kinézni.
 */
export function Overlay({
  width: W,
  height: H,
  config: c,
  logoSource,
  speedKmh,
  g,
  leanLeft,
  leanRight,
  maxLeft,
  maxRight,
}: Props) {
  const m = (c.margin / 100) * H
  const font = fontStyle(c.font, c.weight)

  const shadow = (fontSize: number): TextStyle =>
    c.shadow > 0
      ? {
          textShadowColor: rgba('#000000', c.shadow),
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: Math.max(1, fontSize * SHADOW_RADIUS),
        }
      : {}

  const bg = (fontSize: number): ViewStyle =>
    c.bgEnabled
      ? {
          backgroundColor: rgba(c.bgColor, c.bgOpacity),
          paddingHorizontal: fontSize * BG_PAD_H,
          paddingVertical: fontSize * BG_PAD_V,
          borderRadius: fontSize * BG_RADIUS,
        }
      : {}

  // --- Logó ---
  const logo = c.logo
  const dims = logoDims(logo, W, H)
  const labelFont = dims.labelHeight * LABEL_FONT

  // --- Sebesség + G (egymás alatt) ---
  const sp = c.speed
  const gf = c.gforce
  const valueLine = (
    key: string,
    text: string,
    e: { size: number; opacity: number; color: string; unitVisible: boolean; unitText: string },
  ) => {
    const f = (e.size / 100) * H
    return (
      <View key={key} style={[bg(f), { opacity: e.opacity / 100 }]}>
        <Text style={[styles.number, shadow(f), font, { fontSize: f, color: e.color }]}>
          {text}
          {e.unitVisible && e.unitText.length > 0 ? (
            <Text style={{ fontSize: f * 0.45 }}>{' ' + e.unitText}</Text>
          ) : null}
        </Text>
      </View>
    )
  }

  // --- Dőlés ---
  const ln = c.lean
  const geo = gaugeGeometry(ln, H)
  const active = leanLeft >= leanRight ? -leanLeft : leanRight // + = jobbra
  const activeDeg = Math.abs(active)
  const warn = (deg: number) => ln.warnEnabled && Math.round(deg) >= ln.warnAngle
  const fillColor = warn(activeDeg) ? ln.warnColor : ln.color
  const outline = geo.stroke * 0.35
  const outlineAlpha = (c.shadow / 100) * 45
  const knob = arcPoint(geo, clampA(active))
  const maxTick = (a: number) => {
    const p0 = arcPoint(geo, a, geo.r - geo.stroke * 1.4)
    const p1 = arcPoint(geo, a, geo.r - geo.stroke * 0.6)
    return { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y }
  }
  const numStyle = (deg: number): TextStyle[] => [
    styles.number,
    shadow(geo.font),
    font,
    { fontSize: geo.font, color: warn(deg) ? ln.warnColor : ln.color },
  ]

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {logo.visible ? (
        <View style={[anchorStyle(logo.anchor, m), { opacity: logo.opacity / 100 }]}>
          <View style={{ width: dims.width, height: dims.height }}>
            <Image
              source={logoSource}
              resizeMode="contain"
              style={{ width: dims.width, height: dims.imageHeight }}
            />
            {logo.labelVisible ? (
              <View style={{ height: dims.labelHeight, justifyContent: 'center' }}>
                <Text
                  numberOfLines={1}
                  style={[
                    shadow(labelFont),
                    font,
                    { fontSize: labelFont, color: logo.labelColor, textAlign: 'center' },
                  ]}
                >
                  {logo.labelText}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {sp.visible || gf.visible ? (
        <View style={anchorStyle(sp.anchor, m)}>
          {sp.visible ? valueLine('speed', String(Math.round(speedKmh)), sp) : null}
          {gf.visible ? valueLine('g', formatG(g), gf) : null}
        </View>
      ) : null}

      {ln.visible ? (
        <View style={[anchorStyle(ln.anchor, m), { opacity: ln.opacity / 100 }]}>
          <View style={{ width: geo.width, height: geo.height }}>
            {ln.gaugeVisible ? (
              <Svg
                width={geo.width}
                height={geo.cy + geo.stroke / 2 + outline}
                style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
              >
                {/* sötét körvonal, hogy világos háttér előtt is látsszon */}
                {outlineAlpha > 0 ? (
                  <Path
                    d={arcPath(geo, -90, 90)}
                    stroke={rgba('#000000', outlineAlpha)}
                    strokeWidth={geo.stroke + outline * 2}
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
                {/* skála */}
                <Path
                  d={arcPath(geo, -90, 90)}
                  stroke={rgba(ln.color, 28)}
                  strokeWidth={geo.stroke}
                  strokeLinecap="round"
                  fill="none"
                />
                {/* kitöltés a dőlés irányába */}
                {activeDeg >= 0.5 ? (
                  <Path
                    d={arcPath(geo, 0, clampA(active))}
                    stroke={fillColor}
                    strokeWidth={geo.stroke}
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
                {/* legnagyobb dőlés jelzése */}
                {ln.showMax && maxLeft >= 1 ? (
                  <Line
                    {...maxTick(clampA(-maxLeft))}
                    stroke={rgba(ln.color, 75)}
                    strokeWidth={geo.stroke * 0.45}
                    strokeLinecap="round"
                  />
                ) : null}
                {ln.showMax && maxRight >= 1 ? (
                  <Line
                    {...maxTick(clampA(maxRight))}
                    stroke={rgba(ln.color, 75)}
                    strokeWidth={geo.stroke * 0.45}
                    strokeLinecap="round"
                  />
                ) : null}
                {/* mutató */}
                <Circle cx={knob.x} cy={knob.y} r={geo.stroke * 0.85} fill={fillColor} />
              </Svg>
            ) : null}

            {ln.numbersVisible ? (
              <>
                <Text
                  style={[
                    ...numStyle(leanLeft),
                    {
                      position: 'absolute',
                      top: geo.numbersTop,
                      right: geo.width - (geo.cx - geo.divGap),
                      textAlign: 'right',
                    },
                  ]}
                >
                  {Math.round(leanLeft)}
                </Text>
                <View
                  style={{
                    position: 'absolute',
                    top: geo.numbersTop,
                    left: 0,
                    right: 0,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[styles.number, font, { fontSize: geo.font, color: rgba(ln.color, 45) }]}
                  >
                    |
                  </Text>
                </View>
                <Text
                  style={[
                    ...numStyle(leanRight),
                    { position: 'absolute', top: geo.numbersTop, left: geo.cx + geo.divGap },
                  ]}
                >
                  {Math.round(leanRight)}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  number: {
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
})
