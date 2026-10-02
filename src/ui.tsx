import React, { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { Anchor } from './overlayConfig'

export const ACCENT = '#E4572E'

export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {children}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

export function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>
}

export function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <Row label={label} hint={hint}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: ACCENT }} />
    </Row>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          disabled={o.disabled}
          onPress={() => onChange(o.value)}
          style={[
            styles.segment,
            o.value === value && styles.segmentActive,
            o.disabled && { opacity: 0.3 },
          ]}
        >
          <Text
            style={[styles.segmentText, o.value === value && styles.segmentTextActive]}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/** Szám léptetése − / + gombokkal */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix = '',
  decimals = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  decimals?: number
  hint?: string
}) {
  const set = (v: number) => {
    const r = Math.round(v / step) * step
    onChange(Number(Math.max(min, Math.min(max, r)).toFixed(4)))
  }
  const shown = Number(value.toFixed(decimals)).toString()
  return (
    <Row label={label} hint={hint}>
      <View style={styles.stepper}>
        <Pressable onPress={() => set(value - step)} style={styles.stepBtn} hitSlop={6}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>
          {shown}
          {suffix}
        </Text>
        <Pressable onPress={() => set(value + step)} style={styles.stepBtn} hitSlop={6}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </Row>
  )
}

/** Szám beírása (pl. küszöb, szorzó) */
export function NumberField({
  label,
  value,
  onCommit,
  hint,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  hint?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <Row label={label} hint={hint}>
      <TextInput
        style={styles.numberInput}
        value={text}
        keyboardType="decimal-pad"
        onChangeText={setText}
        onEndEditing={() => {
          const n = parseFloat(text.replace(',', '.'))
          if (Number.isFinite(n) && n > 0) onCommit(n)
          else setText(String(value))
        }}
      />
    </Row>
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  maxLength = 40,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <TextInput
      style={styles.textInput}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#777"
      maxLength={maxLength}
      autoCorrect={false}
    />
  )
}

const SWATCHES = [
  '#FFFFFF',
  '#E6E6E6',
  '#999999',
  '#000000',
  '#FF3B30',
  '#E4572E',
  '#FF9F0A',
  '#FFD60A',
  '#32D74B',
  '#64D2FF',
  '#0A84FF',
  '#BF5AF2',
  '#FF2D55',
]

/** Szín választó: előre megadott színek + saját hex kód */
export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])
  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.hexWrap}>
          <View style={[styles.hexPreview, { backgroundColor: value }]} />
          <TextInput
            style={styles.hexInput}
            value={hex}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            onChangeText={setHex}
            onEndEditing={() => {
              const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
              if (m) onChange('#' + m[1].toUpperCase())
              else setHex(value)
            }}
          />
        </View>
      </View>
      <View style={styles.swatches}>
        {SWATCHES.map((c) => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={[
              styles.swatch,
              { backgroundColor: c },
              value.toUpperCase() === c && styles.swatchActive,
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const ANCHORS: { value: Anchor; label: string }[][] = [
  [
    { value: 'tl', label: '↖' },
    { value: 'tc', label: '↑' },
    { value: 'tr', label: '↗' },
  ],
  [
    { value: 'bl', label: '↙' },
    { value: 'bc', label: '↓' },
    { value: 'br', label: '↘' },
  ],
]

/** Pozíció választó: 6 hely (fent/lent × bal/közép/jobb) */
export function AnchorPicker({
  value,
  onChange,
}: {
  value: Anchor
  onChange: (v: Anchor) => void
}) {
  return (
    <Row label="Pozíció">
      <View>
        {ANCHORS.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            {row.map((a) => (
              <Pressable
                key={a.value}
                onPress={() => onChange(a.value)}
                style={[styles.anchorBtn, value === a.value && styles.segmentActive]}
              >
                <Text style={styles.anchorText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </Row>
  )
}

export function Button({
  title,
  onPress,
  disabled,
  danger,
}: {
  title: string
  onPress: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.buttonText, danger && { color: '#FF6B5E' }]}>{title}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rowWrap: { paddingVertical: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { color: '#eee', fontSize: 15, flexShrink: 1, marginRight: 12 },
  hint: { color: '#999', fontSize: 12, marginTop: 3 },
  section: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#2a2d33',
    borderRadius: 8,
    padding: 2,
  },
  segment: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  segmentActive: { backgroundColor: ACCENT },
  segmentText: { color: '#bbb', fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: 34,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#2a2d33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  stepValue: {
    color: '#fff',
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  numberInput: {
    backgroundColor: '#2a2d33',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    minWidth: 80,
    textAlign: 'right',
  },
  textInput: {
    backgroundColor: '#2a2d33',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    marginVertical: 4,
  },
  hexWrap: { flexDirection: 'row', alignItems: 'center' },
  hexPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#555',
    marginRight: 8,
  },
  hexInput: {
    backgroundColor: '#2a2d33',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    width: 92,
    fontVariant: ['tabular-nums'],
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  swatchActive: { borderWidth: 3, borderColor: ACCENT },
  anchorBtn: {
    width: 36,
    height: 30,
    margin: 2,
    borderRadius: 6,
    backgroundColor: '#2a2d33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorText: { color: '#fff', fontSize: 16 },
  button: {
    backgroundColor: '#2a2d33',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginVertical: 5,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
})
