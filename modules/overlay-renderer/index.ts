import { NativeModule, requireNativeModule } from 'expo'

export interface RenderOptions {
  /** A nyers videó elérési útja (file:// vagy sima útvonal) */
  inputPath: string
  /** A logó PNG elérési útja */
  logoPath: string
  /** A logó alatti szöveg */
  label: string
  /**
   * Telemetria, lapítva: [t, sebesség, balraDőlés, jobbraDőlés, t, ...]
   * t = másodperc a felvétel kezdetétől
   */
  samples: number[]
  /** Elrendezési arányok (src/layout.ts OVERLAY_LAYOUT) */
  margin: number
  logoAreaFraction: number
  logoAspect: number
  labelBandRatio: number
  speedFont: number
  unitScale: number
  leanFont: number
  leanLabelFont: number
}

type Events = {
  onRenderProgress: (event: { progress: number }) => void
}

declare class OverlayRendererModuleType extends NativeModule<Events> {
  /** Ráégeti az overlay-t a videóra. Visszaadja a kész fájl útvonalát. */
  renderOverlay(options: RenderOptions): Promise<string>
  /** Videó mentése a Fotók appba. */
  saveVideoToPhotos(path: string): Promise<void>
  /** Szövegfájl írása a Dokumentumok mappába, visszaadja a file:// URI-t. */
  writeTextFile(fileName: string, content: string): Promise<string>
  /** Fájl törlése (ha létezik). */
  deleteFile(path: string): Promise<void>
}

export default requireNativeModule<OverlayRendererModuleType>('OverlayRenderer')
