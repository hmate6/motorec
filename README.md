brave

# MotoRec – telepítés és használat

Motoros videófelvevő iPhone-ra: GPS-sebesség, dőlésszög, és minden felvétel
**két példányban** kerül a Fotókba – egyszer nyersen, egyszer a UI-val.

Az app Windowsról is felrakható, Mac nélkül:
**GitHub Actions** fordítja le (ott fut egy Mac), te pedig **Sideloadly**-vel
teszed fel a telefonra, ingyenes Apple ID-val.

---

## 1. Amit egyszer kell előkészíteni (Windows)

1. **GitHub fiók** – https://github.com (ingyenes).
2. **Git** – https://git-scm.com/download/win (vagy a GitHub Desktop, ha a grafikus felületet szereted).
3. **iTunes az Apple oldaláról** (nem a Microsoft Store-ból!) – a Sideloadly ennek a drivereit használja.
   https://www.apple.com/itunes/ → „Windows-ra keresel más verziót?” → 64 bites letöltés.
4. **Sideloadly** – https://sideloadly.io
5. Az iPhone-on: **Beállítások → Adatvédelem és biztonság → Fejlesztői mód → Be**
   (a telefon újraindul). Ez a menüpont néha csak az első Sideloadly-telepítés után jelenik meg.

Node.js-re **nincs szükség** a fordításhoz, az a felhőben történik.

## 2. Feltöltés GitHubra

1. GitHubon: **New repository** → név pl. `motorec`.
   - **Public (nyilvános)** repónál a macOS-fordítás ingyenes.
   - **Private** repónál a havi ingyenes keretből megy, és a macOS percek
     többszörösen számítanak – így havonta csak kb. 8–10 fordítás fér bele.
   A kódban nincs semmi titkos adat, a nyilvános repó nyugodtan mehet.
2. Csomagold ki ezt a ZIP-et, nyiss benne egy parancssort (a mappában: jobb klikk → „Open in Terminal”), és:

```bash
git init
git add .
git commit -m "MotoRec"
git branch -M main
git remote add origin https://github.com/<FELHASZNÁLÓNEVED>/motorec.git
git push -u origin main
```

## 3. Fordítás (≈ 20–35 perc)

1. A repó oldalán: **Actions** fül → bal oldalt **„iOS build (aláíratlan IPA)”**.
2. **Run workflow** → `Release` → zöld **Run workflow** gomb.
3. Ha kész (zöld pipa): a futásra kattintva lent az **Artifacts** résznél töltsd le
   a `MotoRec-Release-ipa` fájlt. Ez egy ZIP, benne a `MotoRec-Release.ipa`.

**Ha piros X lesz:** töltsd le a `build-log` artifactot, és küldd el nekem az
`errors.txt` tartalmát. Első fordításnál ez nem lenne meglepő – a Swift részt
nem tudtam Mac nélkül lefordítani, csak megírni.

## 4. Telepítés a telefonra (Sideloadly)

1. iPhone USB-n a géphez, a telefonon „Megbízol ebben a számítógépben?” → Igen.
2. Sideloadly: húzd be a `.ipa`-t, írd be az Apple ID-d e-mail címét → **Start**,
   majd add meg a jelszót (ha van kétlépcsős azonosítás, a kódot is).
3. Az iPhone-on: **Beállítások → Általános → VPN és eszközkezelés** → a saját
   Apple ID-d alatti profil → **Megbízom**.
4. Indítsd el a MotoRec appot.

**Ingyenes Apple ID korlátai:** az app **7 nap után lejár** – ugyanígy újra fel
kell tenni (a beállítások megmaradnak). Egyszerre max. 3 ilyen app lehet a telefonon.

Ha a Sideloadly azt írja, hogy a Bundle ID foglalt: Sideloadly → *Advanced options*
→ adj meg egyedi Bundle ID-t, pl. `com.sajatnev.motorec`.

## 5. Használat

- **Rögzítés:** fekvő (landscape) helyzetben, **a hátsó kamera menetirányba néz**,
  a képernyő feléd. A telefon legyen nagyjából függőleges és **mereven** rögzítve
  – ha mozog a tartóban, a dőlésszög is mozogni fog.
- **KAL (kalibrálás):** álló motornál nyomd meg, miközben a motor függőlegesen,
  egyenesen áll (nem az oldalsztenderen, hanem pl. ráülve, lábbal megtartva).
  Ez lesz a 0°. Ha a telefont kivetted és visszatetted a tartóba, kalibrálj újra.
- **Felvétel:** jobb alsó piros gomb. Leállítás után az app:
  1. elmenti a nyers videót a Fotókba,
  2. elkészíti és elmenti a UI-s példányt (ez **időbe telik**: kb. a videó hosszának
     fele–egésze 1080p-ben, 4K-ban több; közben a telefon melegszik).
- **Fogaskerék (beállítások):** felbontás (720p/1080p/4K), 30/60 fps, a logó alatti
  szöveg, sebesség-korrekció (küszöb és szorzó), UI-s videó be/ki, bal/jobb csere.
- **Sebesség-korrekció:** folytonos: a küszöb alatt a valós érték, felette
  `küszöb + (sebesség − küszöb) × szorzó`. Alapból 60 és 0,8 (pl. 70 → 68, 100 → 92).
- A képernyő nem alszik el, amíg az app nyitva van. **Ne zárd le a telefont
  és ne válts át más appra felvétel közben** – az iOS ilyenkor leállítja a kamerát.

## 6. Dőlésszög – amit tudni kell

- A mérés a giroszkópra épül, amit menet közben a GPS-sebességből és a fordulási
  sebességből számolt fizikai értékkel korrigál, álló helyzetben a gravitációval.
  Ez elméletben jó, de **a valóságban csak motoron tesztelve lehet belőni**.
- Ha **fordítva** mutat (balra dőlésnél a JOBB nő): Beállítások → *Bal/jobb felcserélése*.
- Ha **pontatlan**: Beállítások → *Utolsó menet naplójának megosztása* → küldd el
  nekem a CSV-t (és írd meg, nagyjából mennyi volt a valós dőlés). Ebből tudom
  hangolni.
- A GPS kb. másodpercenként frissül és kicsit késik; a sebesség és a modellből
  számolt dőlés ezért kb. 1 másodpercet késhet.

## 7. Gyorsabb fejlesztés (opcionális, később)

A `Debug` változatot fordítva és feltéve az app a gépeden futó fejlesztői
szerverhez csatlakozik, így a JavaScript-módosítások (pl. dőlés-hangolás)
újrafordítás nélkül, másodpercek alatt a telefonra kerülnek. Ehhez kell Node.js,
és a telefonnak ugyanazon a Wi-Fi-n kell lennie. Ha odáig jutunk, végigviszlek rajta.

## Fájlok

| Fájl | Mit csinál |
|---|---|
| `App.tsx` | Kamera, felvétel, gombok, mentés |
| `src/lean.ts` | Dőlésszög becslés (szenzorfúzió) |
| `src/speed.ts` | GPS sebesség és a korrekciós képlet |
| `src/Overlay.tsx`, `src/layout.ts` | A képernyős UI és az elrendezés arányai |
| `src/SettingsModal.tsx` | Beállítások |
| `modules/overlay-renderer/ios/OverlayRendererModule.swift` | Natív rész: UI ráégetése a videóra, mentés a Fotókba |
| `assets/moto-icon.svg` / `.png` | A motoros ikon (cserélhető, PNG 3:2 arányban) |
| `.github/workflows/ios-build.yml` | A felhős fordítás |
