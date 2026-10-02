import React, { useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native'
import { Overlay } from './Overlay'
import {
  DEFAULT_EFFECTS,
  DEFAULT_OVERLAY,
  type EffectsConfig,
  type FontChoice,
  type GForceElement,
  type GMode,
  type LeanGaugeElement,
  type LogoElement,
  type OverlayConfig,
  type SpeedElement,
  type Weight,
} from './overlayConfig'
import type { Fps, Lens, Resolution, Settings } from './settings'
import { displayedSpeed } from './speed'
import {
  ACCENT,
  AnchorPicker,
  Button,
  ColorPicker,
  Hint,
  NumberField,
  Row,
  Section,
  Segmented,
  Stepper,
  TextField,
  Toggle,
} from './ui'

type Tab = 'video' | 'measure' | 'look' | 'lean' | 'speed' | 'logo' | 'fx'

const TABS: { key: Tab; label: string }[] = [
  { key: 'video', label: 'Videó' },
  { key: 'measure', label: 'Mérés' },
  { key: 'look', label: 'Kinézet' },
  { key: 'lean', label: 'Dőlés' },
  { key: 'speed', label: 'Sebesség / G' },
  { key: 'logo', label: 'Logó' },
  { key: 'fx', label: 'Effektek' },
]

interface Props {
  visible: boolean
  onClose: () => void
  settings: Settings
  update: (patch: Partial<Settings>) => void
  updateOverlay: (patch: Partial<OverlayConfig>) => void
  updateElement: <K extends 'logo' | 'speed' | 'gforce' | 'lean'>(
    key: K,
    patch: Partial<OverlayConfig[K]>,
  ) => void
  updateEffects: (patch: Partial<EffectsConfig>) => void
  logoSource: ImageSourcePropType
  hasCustomLogo: boolean
  onPickLogo: () => void
  onResetLogo: () => void
  availableLenses: Lens[]
  activeFormat: string | null
  onShareLog: () => void
  hasLog: boolean
}

export function SettingsModal(p: Props) {
  const [tab, setTab] = useState<Tab>('video')
  const [previewW, setPreviewW] = useState(0)
  const s = p.settings
  const o = s.overlay

  const sampleSpeed = displayedSpeed(
    87,
    s.speedCorrection,
    s.speedThreshold,
    s.speedFactor,
  )
  const sampleG = { total: 1.1, long: 0.4, lat: 1.0 }[o.gforce.gMode]

  return (
    <Modal
      visible={p.visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={p.onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Beállítások</Text>
            <Pressable onPress={p.onClose} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeText}>Kész</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* Bal: élő előnézet */}
            <View
              style={styles.previewCol}
              onLayout={(e) => setPreviewW(e.nativeEvent.layout.width - 24)}
            >
              {previewW > 0 ? (
                <View
                  style={[
                    styles.preview,
                    { width: previewW, height: (previewW * 9) / 16 },
                  ]}
                >
                  <View style={styles.previewRoad} />
                  <Overlay
                    width={previewW}
                    height={(previewW * 9) / 16}
                    config={o}
                    logoSource={p.logoSource}
                    speedKmh={sampleSpeed}
                    g={sampleG}
                    leanLeft={34}
                    leanRight={0}
                    maxLeft={41}
                    maxRight={27}
                  />
                </View>
              ) : null}
              <Text style={styles.previewHint}>
                Előnézet (minta: 87 km/h, 1.1 G, 34° balra, eddigi max 41° / 27°). Így kerül rá a videóra is.
                {s.effects.enabled
                  ? '\nAz effektek itt nem látszanak, csak a kész UI-s videón.'
                  : ''}
              </Text>
            </View>

            {/* Jobb: fülek + beállítások */}
            <View style={styles.settingsCol}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabs}
                contentContainerStyle={{ paddingHorizontal: 8 }}
              >
                {TABS.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={[styles.tab, tab === t.key && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
              >
                {tab === 'video' && <VideoTab {...p} />}
                {tab === 'measure' && <MeasureTab {...p} />}
                {tab === 'look' && <LookTab {...p} />}
                {tab === 'lean' && <LeanTab {...p} />}
                {tab === 'speed' && <SpeedTab {...p} />}
                {tab === 'logo' && <LogoTab {...p} />}
                {tab === 'fx' && <EffectsTab {...p} />}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------- Videó

const LENS_LABEL: Record<Lens, string> = {
  'ultra-wide': '0.5× ultra',
  wide: '1× normál',
  tele: 'Tele',
}

function VideoTab(p: Props) {
  const s = p.settings
  return (
    <>
      <Section title="Kamera" />
      <Row label="Lencse">
        <Segmented<Lens>
          options={(['ultra-wide', 'wide', 'tele'] as Lens[]).map((l) => ({
            label: LENS_LABEL[l],
            value: l,
            disabled: !p.availableLenses.includes(l),
          }))}
          value={s.lens}
          onChange={(v) => p.update({ lens: v })}
        />
      </Row>
      <Hint>
        Az ultraszéles lencsének nagyobb a látószöge (jobban átjön a sebesség), de
        nincs optikai stabilizálása, és gyenge fényben zajosabb. Ha egy lencse
        nem támogatja a választott felbontást/fps-t, a kamera a legközelebbit
        választja.
      </Hint>

      <Section title="Videó" />
      <Row label="Felbontás">
        <Segmented<Resolution>
          options={[
            { label: '720p', value: '720p' },
            { label: '1080p', value: '1080p' },
            { label: '4K', value: '4k' },
          ]}
          value={s.resolution}
          onChange={(v) => p.update({ resolution: v })}
        />
      </Row>
      <Row label="Képkocka/mp">
        <Segmented<Fps>
          options={[
            { label: '30', value: 30 },
            { label: '60', value: 60 },
          ]}
          value={s.fps}
          onChange={(v) => p.update({ fps: v })}
        />
      </Row>
      {p.activeFormat ? <Hint>Kamera most: {p.activeFormat}</Hint> : null}
      <Toggle
        label="UI-s második videó mentése"
        value={s.overlayVideo}
        onChange={(v) => p.update({ overlayVideo: v })}
      />
      {s.resolution === '4k' && s.overlayVideo ? (
        <Hint>
          4K-ban az UI-s videó elkészítése jóval tovább tart, és a telefon
          melegedhet.
        </Hint>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Mérés

function MeasureTab(p: Props) {
  const s = p.settings
  const ex = (v: number) =>
    Math.round(displayedSpeed(v, s.speedCorrection, s.speedThreshold, s.speedFactor))
  return (
    <>
      <Section title="Sebesség-korrekció" />
      <Toggle
        label="Korrekció a küszöb felett"
        value={s.speedCorrection}
        onChange={(v) => p.update({ speedCorrection: v })}
      />
      <NumberField
        label="Küszöb (km/h)"
        value={s.speedThreshold}
        onCommit={(v) => p.update({ speedThreshold: v })}
      />
      <NumberField
        label="Szorzó a küszöb feletti részre"
        value={s.speedFactor}
        onCommit={(v) => p.update({ speedFactor: v })}
      />
      <Hint>
        Példa: 50 → {ex(50)}, 70 → {ex(70)}, 100 → {ex(100)}, 150 → {ex(150)} km/h
      </Hint>

      <Section title="Dőlésszög" />
      <Toggle
        label="Bal/jobb felcserélése"
        value={s.invertLean}
        onChange={(v) => p.update({ invertLean: v })}
      />
      <Hint>
        Rögzítés: fekvő helyzet, hátsó kamera előre néz. Kalibrálás (KAL) álló,
        egyenesen tartott motornál.
      </Hint>

      <Section title="G-erő" />
      <Toggle
        label="Gyorsítás/fékezés előjel csere"
        value={s.invertLong}
        onChange={(v) => p.update({ invertLong: v })}
        hint="Ha gyorsításnál negatív, fékezésnél pozitív G-t mutat, kapcsold be."
      />

      <Section title="Hibakereséshez" />
      <Button
        title="Utolsó menet naplójának megosztása"
        onPress={p.onShareLog}
        disabled={!p.hasLog}
      />
    </>
  )
}

// ---------------------------------------------------------------- Kinézet

function LookTab(p: Props) {
  const o = p.settings.overlay
  return (
    <>
      <Section title="Általános" />
      <Stepper
        label="Távolság a szélektől"
        value={o.margin}
        onChange={(v) => p.updateOverlay({ margin: v })}
        min={0}
        max={20}
        step={0.5}
        suffix="%"
        hint="A kép magasságának százalékában."
      />
      <Row label="Betűtípus">
        <Segmented<FontChoice>
          options={[
            { label: 'Oswald', value: 'oswald' },
            { label: 'Rendszer', value: 'system' },
          ]}
          value={o.font}
          onChange={(v) => p.updateOverlay({ font: v })}
        />
      </Row>
      <Row label="Betűvastagság">
        <Segmented<Weight>
          options={[
            { label: 'Normál', value: 'medium' },
            { label: 'Félkövér', value: 'bold' },
            { label: 'Vastag', value: 'black' },
          ]}
          value={o.weight}
          onChange={(v) => p.updateOverlay({ weight: v })}
        />
      </Row>
      <Stepper
        label="Árnyék a feliratokon"
        value={o.shadow}
        onChange={(v) => p.updateOverlay({ shadow: v })}
        min={0}
        max={100}
        step={5}
        suffix="%"
        decimals={0}
      />

      <Section title="Háttér a feliratok mögött" />
      <Toggle
        label="Háttér"
        value={o.bgEnabled}
        onChange={(v) => p.updateOverlay({ bgEnabled: v })}
      />
      {o.bgEnabled ? (
        <>
          <ColorPicker
            label="Háttér színe"
            value={o.bgColor}
            onChange={(v) => p.updateOverlay({ bgColor: v })}
          />
          <Stepper
            label="Háttér átlátszatlansága"
            value={o.bgOpacity}
            onChange={(v) => p.updateOverlay({ bgOpacity: v })}
            min={0}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
          />
        </>
      ) : null}

      <Section title="Visszaállítás" />
      <Button
        title="Teljes kinézet alaphelyzetbe"
        danger
        onPress={() =>
          Alert.alert(
            'Alaphelyzetbe állítás',
            'Minden méret, szín, pozíció és szöveg visszaáll az alapértékre. A saját logó is törlődik.',
            [
              { text: 'Mégse', style: 'cancel' },
              {
                text: 'Visszaállítás',
                style: 'destructive',
                onPress: () => {
                  p.onResetLogo()
                  p.updateOverlay({ ...DEFAULT_OVERLAY })
                },
              },
            ],
          )
        }
      />
    </>
  )
}

// ---------------------------------------------------------------- Logó

function LogoTab(p: Props) {
  const l = p.settings.overlay.logo
  const set = (patch: Partial<LogoElement>) => p.updateElement('logo', patch)
  return (
    <>
      <Toggle label="Logó megjelenítése" value={l.visible} onChange={(v) => set({ visible: v })} />
      {l.visible ? (
        <>
          <Section title="Kép" />
          <Button title="Kép kiválasztása a Fotókból" onPress={p.onPickLogo} />
          {p.hasCustomLogo ? (
            <Button title="Beépített motoros kép visszaállítása" onPress={p.onResetLogo} />
          ) : null}
          <Hint>
            Átlátszó hátterű PNG mutat a legjobban. A kép bármilyen arányú lehet.
          </Hint>

          <Section title="Elhelyezés" />
          <AnchorPicker value={l.anchor} onChange={(v) => set({ anchor: v })} />
          <Stepper
            label="Méret"
            value={l.size}
            onChange={(v) => set({ size: v })}
            min={0.5}
            max={30}
            step={0.5}
            suffix="%"
            hint="A logó + felirat a teljes kép területének ennyi százaléka."
          />
          <Stepper
            label="Átlátszatlanság"
            value={l.opacity}
            onChange={(v) => set({ opacity: v })}
            min={10}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
          />

          <Section title="Felirat a logó alatt" />
          <Toggle
            label="Felirat"
            value={l.labelVisible}
            onChange={(v) => set({ labelVisible: v })}
          />
          {l.labelVisible ? (
            <>
              <TextField
                value={l.labelText}
                onChange={(v) => set({ labelText: v })}
                placeholder="Szöveg a logó alatt"
              />
              <Stepper
                label="Felirat mérete"
                value={l.labelSize}
                onChange={(v) => set({ labelSize: v })}
                min={5}
                max={60}
                step={1}
                suffix="%"
                decimals={0}
                hint="A logó kép magasságához képest."
              />
              <ColorPicker
                label="Felirat színe"
                value={l.labelColor}
                onChange={(v) => set({ labelColor: v })}
              />
            </>
          ) : null}
        </>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Sebesség / G

function ValueControls({
  e,
  set,
  unitPlaceholder,
}: {
  e: SpeedElement | GForceElement
  set: (patch: Partial<SpeedElement & GForceElement>) => void
  unitPlaceholder: string
}) {
  return (
    <>
      <Stepper
        label="Méret"
        value={e.size}
        onChange={(v) => set({ size: v })}
        min={1}
        max={30}
        step={0.25}
        suffix="%"
        decimals={2}
        hint="A kép magasságának százalékában."
      />
      <Stepper
        label="Átlátszatlanság"
        value={e.opacity}
        onChange={(v) => set({ opacity: v })}
        min={5}
        max={100}
        step={5}
        suffix="%"
        decimals={0}
        hint="Kisebb érték = halványabb, alig látható."
      />
      <ColorPicker label="Szín" value={e.color} onChange={(v) => set({ color: v })} />
      <Toggle
        label="Mértékegység kiírása"
        value={e.unitVisible}
        onChange={(v) => set({ unitVisible: v })}
      />
      {e.unitVisible ? (
        <TextField
          value={e.unitText}
          onChange={(v) => set({ unitText: v })}
          placeholder={unitPlaceholder}
          maxLength={12}
        />
      ) : null}
    </>
  )
}

function SpeedTab(p: Props) {
  const sp = p.settings.overlay.speed
  const gf = p.settings.overlay.gforce
  const setSp = (patch: Partial<SpeedElement>) => p.updateElement('speed', patch)
  const setG = (patch: Partial<GForceElement>) => p.updateElement('gforce', patch)
  return (
    <>
      <Hint>
        A sebesség és alatta a G-erő egy csoportot alkot. A sebesség-korrekciót
        (pl. 60 felett ×0,8) a „Mérés” fülön kapcsolhatod ki, akkor a valós
        sebességet mutatja.
      </Hint>
      <AnchorPicker value={sp.anchor} onChange={(v) => setSp({ anchor: v })} />
      <Stepper
        label="Távolság a kép szélétől"
        value={sp.edge}
        onChange={(v) => setSp({ edge: v })}
        min={0}
        max={20}
        step={0.1}
        suffix="%"
        hint="A számjegyek tetejétől mérve, a kép magasságának százalékában."
      />

      <Section title="Sebesség" />
      <Toggle label="Sebesség megjelenítése" value={sp.visible} onChange={(v) => setSp({ visible: v })} />
      {sp.visible ? <ValueControls e={sp} set={setSp} unitPlaceholder="km/h" /> : null}

      <Section title="G-erő (a sebesség alatt)" />
      <Toggle label="G-erő megjelenítése" value={gf.visible} onChange={(v) => setG({ visible: v })} />
      {gf.visible ? (
        <>
          <Row label="Fajtája">
            <Segmented<GMode>
              options={[
                { label: 'Összes', value: 'total' },
                { label: 'Gyorsítás/fék', value: 'long' },
                { label: 'Kanyar', value: 'lat' },
              ]}
              value={gf.gMode}
              onChange={(v) => setG({ gMode: v })}
            />
          </Row>
          <Hint>
            Összes: gyorsítás/fékezés és kanyar együtt. Gyorsítás/fék: gyorsításnál
            pozitív, fékezésnél negatív. Kanyar: oldalirányú G (sebességből és
            fordulásból számolva). A motor rezgése miatt simítva, kb. 0,3 mp késéssel.
          </Hint>
          <ValueControls e={gf} set={setG} unitPlaceholder="G" />
        </>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Dőlés

function LeanTab(p: Props) {
  const e = p.settings.overlay.lean
  const set = (patch: Partial<LeanGaugeElement>) => p.updateElement('lean', patch)
  return (
    <>
      <Toggle label="Dőlés megjelenítése" value={e.visible} onChange={(v) => set({ visible: v })} />
      {e.visible ? (
        <>
          <Section title="Elhelyezés" />
          <AnchorPicker value={e.anchor} onChange={(v) => set({ anchor: v })} />
          <Stepper
            label="Átlátszatlanság"
            value={e.opacity}
            onChange={(v) => set({ opacity: v })}
            min={10}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
          />
          <ColorPicker label="Szín" value={e.color} onChange={(v) => set({ color: v })} />

          <Section title="Ív (grafikus mutató)" />
          <Toggle label="Ív megjelenítése" value={e.gaugeVisible} onChange={(v) => set({ gaugeVisible: v })} />
          {e.gaugeVisible ? (
            <>
              <Stepper
                label="Ív mérete"
                value={e.gaugeSize}
                onChange={(v) => set({ gaugeSize: v })}
                min={4}
                max={50}
                step={0.5}
                suffix="%"
                hint="Az ív átmérője a kép magasságának százalékában."
              />
              <Toggle
                label="Legnagyobb dőlés jelzése"
                value={e.showMax}
                onChange={(v) => set({ showMax: v })}
                hint="Kis vonás az íven a felvétel eddigi legnagyobb bal és jobb dőlésénél."
              />
            </>
          ) : null}

          <Section title="Számok (bal | jobb)" />
          <Toggle label="Számok megjelenítése" value={e.numbersVisible} onChange={(v) => set({ numbersVisible: v })} />
          {e.numbersVisible ? (
            <Stepper
              label="Számok mérete"
              value={e.size}
              onChange={(v) => set({ size: v })}
              min={1}
              max={20}
              step={0.2}
              suffix="%"
              hint="A kép magasságának százalékában."
            />
          ) : null}

          <Section title="Figyelmeztető szín" />
          <Toggle label="Színváltás nagy dőlésnél" value={e.warnEnabled} onChange={(v) => set({ warnEnabled: v })} />
          {e.warnEnabled ? (
            <>
              <Stepper
                label="Ettől a szögtől"
                value={e.warnAngle}
                onChange={(v) => set({ warnAngle: v })}
                min={5}
                max={70}
                step={1}
                suffix="°"
                decimals={0}
              />
              <ColorPicker label="Szín" value={e.warnColor} onChange={(v) => set({ warnColor: v })} />
            </>
          ) : null}
        </>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Effektek

function EffectsTab(p: Props) {
  const fx = p.settings.effects
  const set = p.updateEffects
  return (
    <>
      <Toggle
        label="Effektek bekapcsolása"
        value={fx.enabled}
        onChange={(v) => set({ enabled: v })}
        hint="Csak a UI-s (második) videón jelennek meg, a nyers videó érintetlen marad. Felvétel közben nem látszanak, és lassítják a kész videó elkészítését."
      />
      {fx.enabled ? (
        <>
          <Section title="Sebességfüggő" />
          <Stepper
            label="Sebesség-elmosás a széleken"
            value={fx.speedBlur}
            onChange={(v) => set({ speedBlur: v })}
            min={0}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
            hint="Sugárirányú elmosás, a kép közepe éles marad. Ez a legerősebb „gyorsabb” hatás, de ez lassítja a legjobban a feldolgozást."
          />
          <Stepper
            label="Dinamikus ráközelítés"
            value={fx.speedZoom}
            onChange={(v) => set({ speedZoom: v })}
            min={0}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
            hint="Gyorsuláskor finoman ráközelít (max. ~8%)."
          />
          <NumberField
            label="Ettől a sebességtől (km/h)"
            value={fx.fromKmh}
            onCommit={(v) => set({ fromKmh: v })}
          />
          <NumberField
            label="Teljes erősség ennél (km/h)"
            value={fx.fullKmh}
            onCommit={(v) => set({ fullKmh: Math.max(v, fx.fromKmh + 1) })}
            hint="A kijelzett (korrigált) sebességhez viszonyít."
          />

          <Section title="Hangulat" />
          <Stepper
            label="Vignetta (sötét szélek)"
            value={fx.vignette}
            onChange={(v) => set({ vignette: v })}
            min={0}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
          />
          <Stepper
            label="Élénk színek (kontraszt)"
            value={fx.punch}
            onChange={(v) => set({ punch: v })}
            min={0}
            max={100}
            step={5}
            suffix="%"
            decimals={0}
          />

          <Button
            title="Effektek alaphelyzetbe"
            onPress={() => set({ ...DEFAULT_EFFECTS, enabled: true })}
          />
        </>
      ) : null}
    </>
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
    width: '94%',
    height: '94%',
    backgroundColor: '#16181c',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  closeText: { color: ACCENT, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, flexDirection: 'row' },
  previewCol: {
    width: '42%',
    padding: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#333',
  },
  preview: {
    backgroundColor: '#55654f',
    borderRadius: 6,
    overflow: 'hidden',
  },
  previewRoad: {
    position: 'absolute',
    bottom: 0,
    left: '35%',
    width: '30%',
    height: '55%',
    backgroundColor: '#3d3f42',
    transform: [{ perspective: 200 }, { rotateX: '35deg' }],
  },
  previewHint: { color: '#999', fontSize: 11, marginTop: 8 },
  settingsCol: { flex: 1 },
  tabs: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: ACCENT },
  tabText: { color: '#aaa', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  content: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 },
})
