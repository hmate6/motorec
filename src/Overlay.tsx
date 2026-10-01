import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { logoBox, OVERLAY_LAYOUT } from './layout'

export const LOGO = require('../assets/moto-icon.png')

interface Props {
  /** A videókép területe a képernyőn */
  width: number
  height: number
  label: string
  speed: number
  leanLeft: number
  leanRight: number
}

/**
 * A képernyőn látható overlay. Ugyanazokat az arányokat használja, mint a
 * natív renderelő, így a mentett UI-s videó ugyanígy fog kinézni.
 */
export function Overlay({
  width: W,
  height: H,
  label,
  speed,
  leanLeft,
  leanRight,
}: Props) {
  const L = OVERLAY_LAYOUT
  const box = logoBox(W, H)
  const m = L.margin * H
  const speedSize = L.speedFont * H
  const leanSize = L.leanFont * H
  const leanLabelSize = L.leanLabelFont * H

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      {/* Bal fent: motoros ikon + szöveg (a kép 5%-a) */}
      <View
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
        }}
      >
        <Image
          source={LOGO}
          resizeMode="contain"
          style={{ width: box.width, height: box.imageHeight }}
        />
        <View
          style={{
            height: box.labelHeight,
            justifyContent: 'center',
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.text,
              {
                fontSize: box.labelHeight * 0.72,
                fontWeight: '600',
                textAlign: 'center',
              },
            ]}
          >
            {label}
          </Text>
        </View>
      </View>

      {/* Jobb fent: sebesség */}
      <Text
        style={[
          styles.text,
          styles.number,
          { position: 'absolute', top: m, right: m, fontSize: speedSize },
        ]}
      >
        {Math.round(speed)}
        <Text
          style={[
            styles.text,
            { fontSize: speedSize * L.unitScale, fontWeight: '700' },
          ]}
        >
          {' km/h'}
        </Text>
      </Text>

      {/* Bal lent: balra dőlés */}
      <View style={{ position: 'absolute', left: m, bottom: m }}>
        <Text style={[styles.text, styles.leanLabel, { fontSize: leanLabelSize }]}>
          BAL
        </Text>
        <Text style={[styles.text, styles.number, { fontSize: leanSize }]}>
          {Math.round(leanLeft)}°
        </Text>
      </View>

      {/* Jobb lent: jobbra dőlés */}
      <View
        style={{
          position: 'absolute',
          right: m,
          bottom: m,
          alignItems: 'flex-end',
        }}
      >
        <Text style={[styles.text, styles.leanLabel, { fontSize: leanLabelSize }]}>
          JOBB
        </Text>
        <Text style={[styles.text, styles.number, { fontSize: leanSize }]}>
          {Math.round(leanRight)}°
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  text: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  number: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  leanLabel: {
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
})
