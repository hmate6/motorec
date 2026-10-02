/**
 * Böngészős előnézet a UI-hoz (csak fejlesztéshez).
 *
 * Indítás a projekt mappájában:   npx expo start --web
 * A böngészőben az src/Overlay.tsx és az src/overlayConfig.ts módosításai
 * mentés után azonnal megjelennek.
 *
 * Ez a fájl csak a böngészőben fut (a ".web" végződés miatt), a telefonos
 * appba nem kerül bele. A kamera, GPS, szenzorok és a videóra égetés itt nincs.
 *
 * FONTOS: ez a React Native-es UI-t mutatja (amit felvétel közben látsz).
 * A kész videóra a Swift kód rajzol. Az Oswald betű itt is ugyanaz; a
 * "Rendszer" betű viszont Windowson más, mint iPhone-on.
 */
import { useFonts } from 'expo-font'
import React, { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { LOGO, Overlay } from './src/Overlay'
import { speedCropPct } from './src/overlayConfig'
import { useSettings } from './src/settings'
import { SettingsModal } from './src/SettingsModal'
import { displayedSpeed } from './src/speed'
import { ACCENT, Segmented, Stepper } from './src/ui'

type Bg = 'road' | 'dark' | 'light'

export default function WebPreview() {
  const { settings, update, updateOverlay, updateElement, updateEffects } =
    useSettings()
  const [speed, setSpeed] = useState(87)
  const [lean, setLean] = useState(34)
  const [sim, setSim] = useState(false)
  const [showCrop, setShowCrop] = useState(true)
  const maxRef = useRef({ l: 0, r: 0 })

  // Szimuláció: kanyarok egymás után, hogy látszódjon a folyamatos mozgás
  useEffect(() => {
    if (!sim) return
    let raf = 0
    const t0 = performance.now()
    maxRef.current = { l: 0, r: 0 }
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      setLean(42 * Math.sin(t * 0.9) * Math.min(1, t / 2))
      setSpeed(95 + 35 * Math.sin(t * 0.45))
      setG(Math.abs(Math.tan((42 * Math.sin(t * 0.9) * Math.PI) / 180)) * 0.9)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sim])
  const [g, setG] = useState(1.1)
  const [bg, setBg] = useState<Bg>('road')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { width: SW } = useWindowDimensions()
  // A telefonon a betűk az app.json-ból épülnek be; a böngészőben itt töltjük be.
  const [fontsLoaded] = useFonts({
    'OswaldTab-Medium': require('./assets/fonts/OswaldTab-Medium.ttf'),
    'OswaldTab-SemiBold': require('./assets/fonts/OswaldTab-SemiBold.ttf'),
    'OswaldTab-Bold': require('./assets/fonts/OswaldTab-Bold.ttf'),
  })

  const W = Math.min(SW - 32, 1280)
  const H = (W * 9) / 16
  const s = settings
  const shown = displayedSpeed(speed, s.speedCorrection, s.speedThreshold, s.speedFactor)
  const L = Math.max(0, lean)
  const R = Math.max(0, -lean)
  if (L > maxRef.current.l) maxRef.current.l = L
  if (R > maxRef.current.r) maxRef.current.r = R

  if (!fontsLoaded) return <View style={styles.root} />

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>MotoRec – UI előnézet</Text>

      <View style={[styles.frame, { width: W, height: H }, BG[bg]]}>
        {bg === 'road' ? <View style={styles.road} /> : null}
        <Overlay
          width={W}
          height={H}
          config={s.overlay}
          logoSource={LOGO}
          speedKmh={shown}
          g={g}
          leanLeft={L}
          leanRight={R}
          maxLeft={maxRef.current.l}
          maxRight={maxRef.current.r}
        />
        {showCrop && s.overlay.speed.anchor[0] === 't' ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: (speedCropPct(s.overlay).cropPct / 100) * H,
              borderBottomWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#ff4d4d',
              backgroundColor: 'rgba(255,77,77,0.12)',
            }}
          />
        ) : null}
      </View>

      <View style={[styles.controls, { width: W }]}>
        <View style={styles.col}>
          <Stepper
            label="Sebesség (km/h)"
            value={speed}
            onChange={setSpeed}
            min={0}
            max={300}
            step={5}
            decimals={0}
            hint={`Kijelzett (korrekcióval): ${Math.round(shown)} km/h`}
          />
          <Stepper
            label="Dőlés (+ bal / − jobb)"
            value={lean}
            onChange={setLean}
            min={-65}
            max={65}
            step={1}
            decimals={0}
            suffix="°"
          />
          <Stepper
            label="G-erő"
            value={g}
            onChange={setG}
            min={-2}
            max={2}
            step={0.1}
            decimals={1}
          />
        </View>
        <View style={styles.col}>
          <View style={{ paddingVertical: 6 }}>
            <Text style={styles.label}>Háttér</Text>
            <Segmented<Bg>
              options={[
                { label: 'Út', value: 'road' },
                { label: 'Sötét', value: 'dark' },
                { label: 'Világos', value: 'light' },
              ]}
              value={bg}
              onChange={setBg}
            />
          </View>
          <Pressable style={[styles.button, sim && { backgroundColor: '#444' }]} onPress={() => setSim((v) => !v)}>
            <Text style={styles.buttonText}>{sim ? 'Szimuláció leállítása' : 'Menet szimulálása (mozgás)'}</Text>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: '#2a2d33' }]}
            onPress={() => setShowCrop((v) => !v)}
          >
            <Text style={styles.buttonText}>
              {showCrop ? 'Vágási sáv elrejtése' : 'Vágási sáv mutatása'}
            </Text>
          </Pressable>
          <Text style={styles.note}>
            {`A piros sáv: ennyit vágj le a videó tetejéből, hogy a sebesség eltűnjön (${speedCropPct(s.overlay).cropPct.toFixed(1)}%, 1080p-ben ${Math.ceil((speedCropPct(s.overlay).cropPct / 100) * 1080)} px).`}
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: '#2a2d33' }]}
            onPress={() => (maxRef.current = { l: 0, r: 0 })}
          >
            <Text style={styles.buttonText}>Max dőlés nullázása</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.buttonText}>Beállítások megnyitása</Text>
          </Pressable>
          <Text style={styles.note}>
            A beállítások itt a böngészőben mentődnek, nem a telefonon. A saját
            logó választása itt nem működik – helyette cseréld le az
            assets/moto-icon.png fájlt. Az effektek csak a kész videón látszanak.
          </Text>
        </View>
      </View>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={update}
        updateOverlay={updateOverlay}
        updateElement={updateElement}
        updateEffects={updateEffects}
        logoSource={LOGO}
        hasCustomLogo={false}
        onPickLogo={() => {}}
        onResetLogo={() => updateElement('logo', { customFile: null })}
        availableLenses={['ultra-wide', 'wide', 'tele']}
        activeFormat={null}
        onShareLog={() => {}}
        hasLog={false}
      />
    </ScrollView>
  )
}

const BG: Record<Bg, object> = {
  road: { backgroundColor: '#55654f' },
  dark: { backgroundColor: '#111' },
  light: { backgroundColor: '#d9dde2' },
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0e10' },
  content: { alignItems: 'center', padding: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  frame: { overflow: 'hidden', borderRadius: 8 },
  road: {
    position: 'absolute',
    bottom: 0,
    left: '35%',
    width: '30%',
    height: '55%',
    backgroundColor: '#3d3f42',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    backgroundColor: '#16181c',
    borderRadius: 10,
    padding: 12,
    gap: 24,
  },
  col: { flex: 1, minWidth: 280 },
  label: { color: '#eee', fontSize: 15, marginBottom: 6 },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  note: { color: '#999', fontSize: 12, marginTop: 4 },
})
