import { useKeepAwake } from 'expo-keep-awake'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  Camera,
  CommonResolutions,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type CameraSessionConfig,
  type CameraDevice,
  type Constraint,
  type Recorder,
} from 'react-native-vision-camera'
import OverlayRenderer from './modules/overlay-renderer'
import { Overlay } from './src/Overlay'
import { useSettings, type Lens, type Resolution, type Settings } from './src/settings'
import { SettingsModal } from './src/SettingsModal'
import { displayedSpeed, useSpeed } from './src/speed'
import { useLean } from './src/useLean'
import { useLogo } from './src/useLogo'

const RESOLUTIONS: Record<Resolution, { width: number; height: number }> = {
  '720p': CommonResolutions.HD_16_9,
  '1080p': CommonResolutions.FHD_16_9,
  '4k': CommonResolutions.UHD_16_9,
}

/** Telemetria mintavétel a felvétel alatt (ms) */
const SAMPLE_INTERVAL = 50

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function App() {
  useKeepAwake()
  const { settings, update, updateOverlay, updateElement, updateEffects } =
    useSettings()
  const settingsRef = useRef<Settings>(settings)
  settingsRef.current = settings

  const camPerm = useCameraPermission()
  const micPerm = useMicrophonePermission()
  const { speed, speedRef, speedNow } = useSpeed()
  const { angle, angleRef, g, gRef, calibrate, estimator } = useLean(
    speedRef,
    settings.invertLean,
    settings.invertLong,
  )

  // --- A videókép (16:9) területe a képernyőn ---
  const { width: SW, height: SH } = useWindowDimensions()
  const videoW = Math.min(SW, (SH * 16) / 9)
  const videoH = (videoW * 9) / 16
  const videoX = (SW - videoW) / 2
  const videoY = (SH - videoH) / 2

  // --- Kamera (lencse) ---
  const allDevices = useCameraDevices()
  const lensDevices = useMemo(() => {
    const map: Partial<Record<Lens, CameraDevice>> = {}
    for (const d of allDevices) {
      if (d.position !== 'back' || d.isVirtualDevice) continue
      if (d.type === 'ultra-wide-angle') map['ultra-wide'] ??= d
      else if (d.type === 'wide-angle') map.wide ??= d
      else if (d.type === 'telephoto') map.tele ??= d
    }
    return map
  }, [allDevices])
  const availableLenses = useMemo(
    () => (Object.keys(lensDevices) as Lens[]),
    [lensDevices],
  )
  const cameraDevice = lensDevices[settings.lens] ?? lensDevices.wide

  // --- Kamera ---
  const videoOutput = useVideoOutput({
    targetResolution: RESOLUTIONS[settings.resolution],
    enableAudio: micPerm.hasPermission,
    fileType: 'mp4',
  })
  const constraints = useMemo<Constraint[]>(
    () => [
      { fps: settings.fps },
      { resolutionBias: videoOutput },
      { videoStabilizationMode: 'standard' },
    ],
    [settings.fps, videoOutput],
  )
  const [activeFormat, setActiveFormat] = useState<string | null>(null)
  const sessionFps = useRef<number | undefined>(undefined)

  // --- Felvétel állapot ---
  const recorderRef = useRef<Recorder | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [processing, setProcessing] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [lastLog, setLastLog] = useState<string | null>(null)

  const samples = useRef<number[]>([])
  const logRows = useRef<string[]>([])
  const t0 = useRef(0)
  const sampleTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const updateLogo = useCallback(
    (patch: Parameters<typeof updateElement<'logo'>>[1]) => updateElement('logo', patch),
    [updateElement],
  )
  const logo = useLogo(settings.overlay.logo, updateLogo)
  const getLogoPath = useRef(logo.getLogoPath)
  getLogoPath.current = logo.getLogoPath

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    const sub = OverlayRenderer.addListener('onRenderProgress', (e) =>
      setProgress(e.progress),
    )
    return () => sub.remove()
  }, [])

  // --- Kijelzett értékek ---
  // folyamatos (interpolált) sebesség – a felület 30x/mp frissül a dőlés miatt
  const shownSpeed = displayedSpeed(
    speedNow() * 3.6,
    settings.speedCorrection,
    settings.speedThreshold,
    settings.speedFactor,
  )
  const leanLeft = Math.max(0, angle)
  const leanRight = Math.max(0, -angle)
  const gShown = g[settings.overlay.gforce.gMode]

  // Legnagyobb dőlés (felvételenként nullázódik)
  const maxLean = useRef({ l: 0, r: 0 })
  if (leanLeft > maxLean.current.l) maxLean.current.l = leanLeft
  if (leanRight > maxLean.current.r) maxLean.current.r = leanRight

  // --- Telemetria rögzítés ---
  const takeSample = useCallback(() => {
    const t = (Date.now() - t0.current) / 1000
    const s = settingsRef.current
    const kmh = speedNow() * 3.6
    const shown = displayedSpeed(
      kmh,
      s.speedCorrection,
      s.speedThreshold,
      s.speedFactor,
    )
    const a = angleRef.current
    const l = Math.max(0, a)
    const r = Math.max(0, -a)
    const gv = gRef.current
    const gm = s.overlay.gforce.gMode
    // [t, kijelzett sebesség, G-erő, bal dőlés, jobb dőlés] – tizedes pontossággal,
    // a videón a mintavételek között folyamatosan átmenetel
    const r1 = (v: number) => Math.round(v * 10) / 10
    const r2 = (v: number) => Math.round(v * 100) / 100
    samples.current.push(t, r1(shown), r2(gv[gm]), r1(l), r1(r))
    const d = estimator.current.debug
    logRows.current.push(
      [
        t.toFixed(3),
        kmh.toFixed(2),
        shown.toFixed(1),
        a.toFixed(2),
        d.gyroRate.toFixed(2),
        d.gravityAngle.toFixed(2),
        d.modelAngle.toFixed(2),
        d.yawRate.toFixed(2),
        d.weight.toFixed(2),
        gv.long.toFixed(3),
        gv.lat.toFixed(3),
        gv.total.toFixed(3),
      ].join(','),
    )
    setElapsed(t)
  }, [speedNow, angleRef, gRef, estimator])

  const finishRecording = useCallback(
    async (filePath: string) => {
      if (sampleTimer.current) clearInterval(sampleTimer.current)
      sampleTimer.current = null
      setRecording(false)
      recorderRef.current = null
      const s = settingsRef.current
      const data = samples.current.slice()
      const rows = logRows.current.slice()

      try {
        setProcessing('Nyers videó mentése…')
        await OverlayRenderer.saveVideoToPhotos(filePath)

        // napló (hibakereséshez)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const csv =
          't,speed_kmh,shown_kmh,lean_deg,gyro_z,gravity_angle,model_angle,yaw_rate,model_weight,g_long,g_lat,g_total\n' +
          rows.join('\n')
        const logUri = await OverlayRenderer.writeTextFile(
          `motorec-${stamp}.csv`,
          csv,
        )
        setLastLog(logUri)

        if (s.overlayVideo) {
          setProcessing('UI-s videó készítése…')
          setProgress(0)
          const out = await OverlayRenderer.renderOverlay({
            inputPath: filePath,
            logoPath: getLogoPath.current(),
            overlayJson: JSON.stringify({ ...s.overlay, effects: s.effects }),
            samples: data,
          })
          setProcessing('UI-s videó mentése…')
          await OverlayRenderer.saveVideoToPhotos(out)
          await OverlayRenderer.deleteFile(out)
        }
        await OverlayRenderer.deleteFile(filePath)
        showToast(s.overlayVideo ? '2 videó elmentve a Fotókba' : 'Videó elmentve a Fotókba')
      } catch (e: any) {
        Alert.alert('Hiba mentés közben', String(e?.message ?? e))
      } finally {
        setProcessing(null)
      }
    },
    [showToast],
  )

  const startRecording = useCallback(async () => {
    if (!camPerm.hasPermission) return
    try {
      const rec = await videoOutput.createRecorder({})
      recorderRef.current = rec
      samples.current = []
      maxLean.current = { l: 0, r: 0 }
      logRows.current = []
      await rec.startRecording(
        (filePath) => {
          finishRecording(filePath)
        },
        (error) => {
          if (sampleTimer.current) clearInterval(sampleTimer.current)
          setRecording(false)
          recorderRef.current = null
          Alert.alert('Felvételi hiba', error.message)
        },
      )
      t0.current = Date.now()
      setElapsed(0)
      setRecording(true)
      sampleTimer.current = setInterval(takeSample, SAMPLE_INTERVAL)
      takeSample()
    } catch (e: any) {
      Alert.alert('Nem indult el a felvétel', String(e?.message ?? e))
    }
  }, [camPerm.hasPermission, videoOutput, finishRecording, takeSample])

  const stopRecording = useCallback(async () => {
    try {
      takeSample()
      await recorderRef.current?.stopRecording()
    } catch (e: any) {
      Alert.alert('Hiba a leállításkor', String(e?.message ?? e))
    }
  }, [takeSample])

  const onCalibrate = useCallback(() => {
    if (calibrate()) showToast('Kalibrálva: ez most a 0°')
    else showToast('Nincs még szenzoradat')
  }, [calibrate, showToast])

  const onShareLog = useCallback(() => {
    if (lastLog) Share.share({ url: lastLog }).catch(() => {})
  }, [lastLog])

  const onSessionConfigSelected = useCallback((c: CameraSessionConfig) => {
    sessionFps.current = c.selectedFPS
  }, [])
  const onConfigured = useCallback(() => {
    const r = videoOutput.currentResolution
    const fps = sessionFps.current
    if (r) {
      const w = Math.max(r.width, r.height)
      const h = Math.min(r.width, r.height)
      setActiveFormat(`${w}×${h}${fps ? ` @ ${fps} fps` : ''}`)
    }
  }, [videoOutput])

  // --- Engedélykérés ---
  if (!camPerm.hasPermission) {
    return (
      <View style={styles.center}>
        <StatusBar hidden />
        <Text style={styles.permText}>
          A felvételhez kamera-hozzáférés kell.
        </Text>
        <Pressable
          style={styles.permButton}
          onPress={async () => {
            await camPerm.requestPermission()
            if (micPerm.canRequestPermission) await micPerm.requestPermission()
          }}
        >
          <Text style={styles.permButtonText}>Engedélyezés</Text>
        </Pressable>
        {camPerm.status === 'denied' ? (
          <Text style={styles.permHint}>
            Ha korábban elutasítottad: Beállítások → MotoRec → Kamera.
          </Text>
        ) : null}
      </View>
    )
  }

  const busy = processing != null

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Camera
        style={StyleSheet.absoluteFill}
        device={cameraDevice ?? 'back'}
        isActive={!busy}
        outputs={[videoOutput]}
        constraints={constraints}
        resizeMode="contain"
        orientationSource="interface"
        onSessionConfigSelected={onSessionConfigSelected}
        onConfigured={onConfigured}
        onError={(e) => showToast(`Kamera hiba: ${e.message}`)}
      />

      {/* Overlay pontosan a videókép területén */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: videoX,
          top: videoY,
          width: videoW,
          height: videoH,
        }}
      >
        <Overlay
          width={videoW}
          height={videoH}
          config={settings.overlay}
          logoSource={logo.logoSource}
          speedKmh={shownSpeed}
          g={gShown}
          maxLeft={maxLean.current.l}
          maxRight={maxLean.current.r}
          leanLeft={leanLeft}
          leanRight={leanRight}
        />
      </View>

      {/* Bal oldali sáv: beállítások (fent), kalibrálás (lent) */}
      <View style={[styles.sideBar, { left: 0, width: Math.max(videoX, 64) }]}>
        <Pressable
          disabled={recording || busy}
          onPress={() => setSettingsOpen(true)}
          style={[styles.smallBtn, (recording || busy) && styles.disabled]}
        >
          <Text style={styles.smallBtnText}>⚙︎</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={onCalibrate}
          style={[styles.smallBtn, busy && styles.disabled]}
        >
          <Text style={styles.smallBtnLabel}>KAL</Text>
        </Pressable>
      </View>

      {/* Jobb oldali sáv: idő / GPS (fent), felvétel gomb (lent) */}
      <View style={[styles.sideBar, { right: 0, width: Math.max(videoX, 64) }]}>
        <View style={styles.statusBox}>
          {recording ? (
            <>
              <View style={styles.recDot} />
              <Text style={styles.statusText}>{formatTime(elapsed)}</Text>
            </>
          ) : (
            <Text
              style={[
                styles.statusText,
                { color: speed.hasFix ? '#7CFC8A' : '#FFB347' },
              ]}
            >
              {speed.hasFix ? 'GPS' : 'GPS…'}
            </Text>
          )}
        </View>
        <Pressable
          disabled={busy}
          onPress={recording ? stopRecording : startRecording}
          style={[styles.recordOuter, busy && styles.disabled]}
        >
          <View style={recording ? styles.recordInnerStop : styles.recordInner} />
        </Pressable>
      </View>

      {busy ? (
        <View style={styles.processing}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.processingText}>{processing}</Text>
          {processing?.startsWith('UI-s videó készítése') ? (
            <Text style={styles.processingText}>
              {Math.round(progress * 100)}%
            </Text>
          ) : null}
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={update}
        updateOverlay={updateOverlay}
        updateElement={updateElement}
        updateEffects={updateEffects}
        logoSource={logo.logoSource}
        hasCustomLogo={logo.hasCustom}
        onPickLogo={logo.pick}
        onResetLogo={logo.reset}
        availableLenses={availableLenses}
        activeFormat={activeFormat}
        onShareLog={onShareLog}
        hasLog={lastLog != null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permText: { color: '#fff', fontSize: 17, marginBottom: 16, textAlign: 'center' },
  permButton: {
    backgroundColor: '#E4572E',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permHint: { color: '#aaa', marginTop: 14, textAlign: 'center' },
  sideBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
  },
  smallBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { color: '#fff', fontSize: 22 },
  smallBtnLabel: { color: '#fff', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff3b30',
    marginRight: 5,
  },
  statusText: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recordOuter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#ff3b30' },
  recordInnerStop: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#ff3b30' },
  processing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: { color: '#fff', marginTop: 10, fontSize: 16, fontWeight: '600' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 24,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  toastText: { color: '#fff', fontWeight: '600' },
})
