import React, { useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { displayedSpeed } from './speed'
import type { Fps, Resolution, Settings } from './settings'

interface Props {
  visible: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onShareLog: () => void
  hasLog: boolean
  activeFormat: string | null
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentActive]}
        >
          <Text
            style={[
              styles.segmentText,
              o.value === value && styles.segmentTextActive,
            ]}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function NumberField({
  value,
  onCommit,
}: {
  value: number
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
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
  )
}

export function SettingsModal({
  visible,
  settings,
  onChange,
  onClose,
  onShareLog,
  hasLog,
  activeFormat,
}: Props) {
  const s = settings
  const example = (v: number) =>
    Math.round(displayedSpeed(v, s.speedCorrection, s.speedThreshold, s.speedFactor))

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Beállítások</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Kész</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.section}>Videó</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Felbontás</Text>
              <Segmented<Resolution>
                options={[
                  { label: '720p', value: '720p' },
                  { label: '1080p', value: '1080p' },
                  { label: '4K', value: '4k' },
                ]}
                value={s.resolution}
                onChange={(v) => onChange({ resolution: v })}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Képkocka/mp</Text>
              <Segmented<Fps>
                options={[
                  { label: '30', value: 30 },
                  { label: '60', value: 60 },
                ]}
                value={s.fps}
                onChange={(v) => onChange({ fps: v })}
              />
            </View>
            {activeFormat ? (
              <Text style={styles.hint}>Kamera most: {activeFormat}</Text>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.label}>UI-s második videó mentése</Text>
              <Switch
                value={s.overlayVideo}
                onValueChange={(v) => onChange({ overlayVideo: v })}
              />
            </View>
            {s.resolution === '4k' && s.overlayVideo ? (
              <Text style={styles.hint}>
                4K-ban az UI-s videó elkészítése jóval tovább tart, és a telefon
                melegedhet.
              </Text>
            ) : null}

            <Text style={styles.section}>Logó felirat</Text>
            <TextInput
              style={styles.textInput}
              value={s.label}
              onChangeText={(t) => onChange({ label: t })}
              placeholder="Szöveg a motor alatt"
              placeholderTextColor="#777"
              maxLength={40}
            />

            <Text style={styles.section}>Sebesség</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Korrekció a küszöb felett</Text>
              <Switch
                value={s.speedCorrection}
                onValueChange={(v) => onChange({ speedCorrection: v })}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Küszöb (km/h)</Text>
              <NumberField
                value={s.speedThreshold}
                onCommit={(v) => onChange({ speedThreshold: v })}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Szorzó a küszöb feletti részre</Text>
              <NumberField
                value={s.speedFactor}
                onCommit={(v) => onChange({ speedFactor: v })}
              />
            </View>
            <Text style={styles.hint}>
              Példa: 50 → {example(50)}, 70 → {example(70)}, 100 → {example(100)},
              150 → {example(150)} km/h
            </Text>

            <Text style={styles.section}>Dőlésszög</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Bal/jobb felcserélése</Text>
              <Switch
                value={s.invertLean}
                onValueChange={(v) => onChange({ invertLean: v })}
              />
            </View>
            <Text style={styles.hint}>
              Rögzítés: fekvő helyzet, hátsó kamera előre néz. Kalibrálás álló,
              egyenesen tartott motornál.
            </Text>

            <Text style={styles.section}>Hibakereséshez</Text>
            <Pressable
              onPress={onShareLog}
              disabled={!hasLog}
              style={[styles.button, !hasLog && { opacity: 0.4 }]}
            >
              <Text style={styles.buttonText}>Utolsó menet naplójának megosztása</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '70%',
    maxHeight: '92%',
    backgroundColor: '#16181c',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  closeText: { color: '#E4572E', fontSize: 16, fontWeight: '700' },
  content: { padding: 18, paddingBottom: 32 },
  section: {
    color: '#E4572E',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: { color: '#eee', fontSize: 15, flexShrink: 1, marginRight: 12 },
  hint: { color: '#999', fontSize: 12, marginTop: 2, marginBottom: 4 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#2a2d33',
    borderRadius: 8,
    padding: 2,
  },
  segment: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  segmentActive: { backgroundColor: '#E4572E' },
  segmentText: { color: '#bbb', fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  textInput: {
    backgroundColor: '#2a2d33',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
  button: {
    backgroundColor: '#2a2d33',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
})
