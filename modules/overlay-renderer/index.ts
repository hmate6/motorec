import { NativeModule, requireNativeModule } from 'expo'

export interface RenderOptions {
  /** A nyers videó elérési útja (file:// vagy sima útvonal) */
  inputPath: string
  /** A logó kép elérési útja */
  logoPath: string
  /** Overlay + effektek konfigurációja JSON-ként (src/overlayConfig.ts) */
  overlayJson: string
  /**
   * Telemetria, lapítva: [t, sebesség, főÉrték, balraDőlés, jobbraDőlés, t, ...]
   * főÉrték: a jobb felső elem (km/h, vagy G-erőnél a G tizedrésze)
   * t = másodperc a felvétel kezdetétől
   */
  samples: number[]
}

type Events = {
  onRenderProgress: (event: { progress: number }) => void
}

declare class OverlayRendererModuleType extends NativeModule<Events> {
  /** Ráégeti az overlay-t (és az effekteket) a videóra. Visszaadja a kész fájl útvonalát. */
  renderOverlay(options: RenderOptions): Promise<string>
  /** Videó mentése a Fotók appba. */
  saveVideoToPhotos(path: string): Promise<void>
  /** Szövegfájl írása a Dokumentumok mappába, visszaadja a file:// URI-t. */
  writeTextFile(fileName: string, content: string): Promise<string>
  /** Fájl törlése (ha létezik). */
  deleteFile(path: string): Promise<void>
  /** Fájl bemásolása a Dokumentumok mappába, visszaadja a fájlnevet. */
  copyToDocuments(source: string, fileName: string): Promise<string>
  /** Fájl törlése a Dokumentumok mappából. */
  deleteDocumentFile(fileName: string): Promise<void>
  /** A Dokumentumok mappában lévő fájl file:// URI-ja, vagy null ha nincs. */
  documentFileUri(fileName: string): string | null
}

export default requireNativeModule<OverlayRendererModuleType>('OverlayRenderer')
