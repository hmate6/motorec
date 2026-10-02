import { Asset } from 'expo-asset'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, type ImageSourcePropType } from 'react-native'
import OverlayRenderer from '../modules/overlay-renderer'
import { LOGO } from './Overlay'
import { BUILTIN_LOGO_ASPECT, type LogoElement } from './overlayConfig'

/**
 * A logó kezelése: beépített vagy a Fotókból választott saját kép.
 * A saját kép az app Dokumentumok mappájába másolódik, és csak a fájlnevét
 * tároljuk (az app mappájának útvonala újratelepítéskor megváltozhat).
 */
export function useLogo(
  logo: LogoElement,
  updateLogo: (patch: Partial<LogoElement>) => void,
) {
  const [builtinPath, setBuiltinPath] = useState<string | null>(null)
  const builtinRef = useRef<string | null>(null)

  useEffect(() => {
    Asset.fromModule(LOGO)
      .downloadAsync()
      .then((a) => {
        builtinRef.current = a.localUri ?? a.uri
        setBuiltinPath(builtinRef.current)
      })
      .catch(() => {})
  }, [])

  /** A saját logó aktuális URI-ja, vagy null ha nincs / elveszett */
  const customUri = useMemo(() => {
    if (!logo.customFile) return null
    try {
      return OverlayRenderer.documentFileUri(logo.customFile)
    } catch {
      return null
    }
  }, [logo.customFile])

  const logoSource: ImageSourcePropType = customUri ? { uri: customUri } : LOGO
  /** A natív renderelőnek átadandó útvonal */
  const logoPath = customUri ?? builtinPath ?? ''

  const pick = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      })
      if (res.canceled || !res.assets?.length) return
      const a = res.assets[0]
      const extMatch = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(a.uri)
      const ext = (extMatch?.[1] ?? 'png').toLowerCase()
      const fileName = `motorec-logo-${Date.now()}.${ext}`
      await OverlayRenderer.copyToDocuments(a.uri, fileName)
      const old = logo.customFile
      updateLogo({
        customFile: fileName,
        aspect: a.width > 0 && a.height > 0 ? a.width / a.height : BUILTIN_LOGO_ASPECT,
      })
      if (old) OverlayRenderer.deleteDocumentFile(old).catch(() => {})
    } catch (e: any) {
      Alert.alert('Nem sikerült a képet betölteni', String(e?.message ?? e))
    }
  }, [logo.customFile, updateLogo])

  const reset = useCallback(() => {
    const old = logo.customFile
    updateLogo({ customFile: null, aspect: BUILTIN_LOGO_ASPECT })
    if (old) OverlayRenderer.deleteDocumentFile(old).catch(() => {})
  }, [logo.customFile, updateLogo])

  return {
    logoSource,
    logoPath,
    pick,
    reset,
    hasCustom: customUri != null,
    getLogoPath: () => customUri ?? builtinRef.current ?? '',
  }
}
