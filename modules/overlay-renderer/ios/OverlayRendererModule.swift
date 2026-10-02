import AVFoundation
import CoreImage
import ExpoModulesCore
import Photos
import UIKit

// MARK: - Bemenet

struct RenderOptions: Record {
  @Field var inputPath: String = ""
  @Field var logoPath: String = ""
  /// Az overlay + effektek konfigurációja JSON-ként (src/overlayConfig.ts)
  @Field var overlayJson: String = "{}"
  /// [t, sebesség (km/h), G-erő, bal dőlés, jobb dőlés, t, ...]
  @Field var samples: [Double] = []
}

struct LogoCfg: Decodable {
  let visible: Bool
  let anchor: String
  let size: Double
  let opacity: Double
  let aspect: Double
  let labelVisible: Bool
  let labelText: String
  let labelSize: Double
  let labelColor: String
}

/// Közös mezők a sebesség és a G-erő kijelzőhöz
protocol ValueCfg {
  var size: Double { get }
  var opacity: Double { get }
  var color: String { get }
  var unitVisible: Bool { get }
  var unitText: String { get }
}

struct SpeedCfg: Decodable, ValueCfg {
  let visible: Bool
  /// A sebesség + G csoport helye
  let anchor: String
  let size: Double
  let opacity: Double
  let color: String
  let unitVisible: Bool
  let unitText: String
}

struct GForceCfg: Decodable, ValueCfg {
  let visible: Bool
  let size: Double
  let opacity: Double
  let color: String
  let unitVisible: Bool
  let unitText: String
}

struct LeanGaugeCfg: Decodable {
  let visible: Bool
  let anchor: String
  /// számok betűmérete (H %)
  let size: Double
  /// ív átmérője (H %)
  let gaugeSize: Double
  let gaugeVisible: Bool
  let numbersVisible: Bool
  let opacity: Double
  let color: String
  let showMax: Bool
  let warnEnabled: Bool
  let warnAngle: Double
  let warnColor: String
}

struct EffectsCfg: Decodable {
  let enabled: Bool
  /// 0–100: elmosás a kép szélein, sebességgel nő
  let speedBlur: Double
  /// 0–100: sötétített szélek
  let vignette: Double
  /// 0–100: enyhe ráközelítés sebességgel
  let speedZoom: Double
  /// 0–100: kontraszt + telítettség
  let punch: Double
  /// Ettől a (kijelzett) sebességtől kezdenek erősödni a sebességfüggő effektek
  let fromKmh: Double
  /// Ennél a sebességnél érik el a teljes erősséget
  let fullKmh: Double
}

struct OverlayCfg: Decodable {
  let margin: Double
  /// "oswald" vagy "system" (src/overlayConfig.ts FontChoice)
  let font: String?
  let weight: String
  let shadow: Double
  let bgEnabled: Bool
  let bgColor: String
  let bgOpacity: Double
  let logo: LogoCfg
  let speed: SpeedCfg
  let gforce: GForceCfg
  let lean: LeanGaugeCfg
  let effects: EffectsCfg?
}

// Arányok – ugyanezek vannak a JS oldalon (src/overlayConfig.ts)
private let SHADOW_RADIUS: CGFloat = 0.12
private let BG_PAD_H: CGFloat = 0.22
private let BG_PAD_V: CGFloat = 0.08
private let BG_RADIUS: CGFloat = 0.18
private let LABEL_FONT: CGFloat = 0.72
private let GAUGE_LINE: CGFloat = 1.5

// MARK: - Segédfüggvények

private func fileURL(_ path: String) -> URL {
  if path.hasPrefix("file://"), let u = URL(string: path) { return u }
  return URL(fileURLWithPath: path)
}

private func uiColor(_ hex: String, _ alpha: CGFloat = 1) -> UIColor {
  var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if s.hasPrefix("#") { s.removeFirst() }
  guard s.count == 6, let v = UInt64(s, radix: 16) else {
    return UIColor.white.withAlphaComponent(alpha)
  }
  return UIColor(
    red: CGFloat((v >> 16) & 0xFF) / 255,
    green: CGFloat((v >> 8) & 0xFF) / 255,
    blue: CGFloat(v & 0xFF) / 255,
    alpha: alpha)
}

private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }

// MARK: - Telemetria

struct TelemetrySample {
  var speed: Double
  var g: Double
  var left: Double
  var right: Double
  /// a felvétel kezdete óta mért legnagyobb dőlés
  var maxLeft: Double
  var maxRight: Double
}

/// A felvétel alatt ~20x/mp rögzített adatok. A videó képkockáinál a két
/// szomszédos minta között lineárisan átmenetel, így a számok és a mutató
/// folyamatosan mozognak.
private final class Telemetry {
  private var t: [Double] = []
  private var rows: [TelemetrySample] = []

  init(flat: [Double]) {
    var i = 0
    var ml = 0.0
    var mr = 0.0
    while i + 4 < flat.count {
      let l = flat[i + 3]
      let r = flat[i + 4]
      ml = max(ml, l)
      mr = max(mr, r)
      t.append(flat[i])
      rows.append(
        TelemetrySample(
          speed: flat[i + 1], g: flat[i + 2], left: l, right: r, maxLeft: ml, maxRight: mr))
      i += 5
    }
  }

  func sample(at time: Double) -> TelemetrySample {
    guard !rows.isEmpty else {
      return TelemetrySample(speed: 0, g: 0, left: 0, right: 0, maxLeft: 0, maxRight: 0)
    }
    if time <= t[0] { return rows[0] }
    if time >= t[t.count - 1] { return rows[rows.count - 1] }
    var lo = 0
    var hi = t.count - 1
    while lo < hi {
      let mid = (lo + hi + 1) / 2
      if t[mid] <= time { lo = mid } else { hi = mid - 1 }
    }
    let a = rows[lo]
    let b = rows[lo + 1]
    let span = t[lo + 1] - t[lo]
    let k = span > 0 ? (time - t[lo]) / span : 0
    func mix(_ x: Double, _ y: Double) -> Double { x + (y - x) * k }
    return TelemetrySample(
      speed: mix(a.speed, b.speed), g: mix(a.g, b.g),
      left: mix(a.left, b.left), right: mix(a.right, b.right),
      maxLeft: a.maxLeft, maxRight: a.maxRight)
  }
}

// MARK: - Effektek

private final class EffectProcessor {
  let cfg: EffectsCfg

  init(cfg: EffectsCfg) {
    self.cfg = cfg
  }

  /// 0..1: mennyire "gyors" a pillanat a beállított tartományban
  private func intensity(speed: Int) -> Double {
    let span = max(1, cfg.fullKmh - cfg.fromKmh)
    return clamp01((Double(speed) - cfg.fromKmh) / span)
  }

  func apply(_ source: CIImage, speed: Int) -> CIImage {
    guard cfg.enabled else { return source }
    let extent = source.extent
    let W = extent.width
    let H = extent.height
    let center = CIVector(x: extent.midX, y: extent.midY)
    let t = intensity(speed: speed)
    var img = source

    // 1) Dinamikus ráközelítés (a középpont felé, sebességgel)
    if cfg.speedZoom > 0 && t > 0 {
      let scale = 1 + CGFloat(cfg.speedZoom / 100 * 0.08 * t)
      let tr = CGAffineTransform(translationX: -extent.midX, y: -extent.midY)
        .concatenating(CGAffineTransform(scaleX: scale, y: scale))
        .concatenating(CGAffineTransform(translationX: extent.midX, y: extent.midY))
      img = img.transformed(by: tr).cropped(to: extent)
    }

    // 2) Sebesség-elmosás: sugárirányú elmosás, a közepe éles marad
    if cfg.speedBlur > 0 && t > 0.01 {
      let amount = CGFloat(cfg.speedBlur / 100 * t) * H * 0.035
      if let blur = CIFilter(name: "CIZoomBlur") {
        blur.setValue(img.clampedToExtent(), forKey: kCIInputImageKey)
        blur.setValue(center, forKey: "inputCenter")
        blur.setValue(amount, forKey: "inputAmount")
        if let blurred = blur.outputImage?.cropped(to: extent),
          let grad = CIFilter(name: "CIRadialGradient"),
          let mix = CIFilter(name: "CIBlendWithMask")
        {
          grad.setValue(center, forKey: "inputCenter")
          grad.setValue(H * 0.28, forKey: "inputRadius0")
          grad.setValue(max(W, H) * 0.62, forKey: "inputRadius1")
          grad.setValue(CIColor(red: 0, green: 0, blue: 0), forKey: "inputColor0")
          grad.setValue(CIColor(red: 1, green: 1, blue: 1), forKey: "inputColor1")
          if let mask = grad.outputImage?.cropped(to: extent) {
            mix.setValue(blurred, forKey: kCIInputImageKey)
            mix.setValue(img, forKey: kCIInputBackgroundImageKey)
            mix.setValue(mask, forKey: kCIInputMaskImageKey)
            if let out = mix.outputImage { img = out.cropped(to: extent) }
          }
        }
      }
    }

    // 3) Szín: kontraszt + telítettség
    if cfg.punch > 0, let cc = CIFilter(name: "CIColorControls") {
      let p = cfg.punch / 100
      cc.setValue(img, forKey: kCIInputImageKey)
      cc.setValue(1 + p * 0.35, forKey: kCIInputSaturationKey)
      cc.setValue(1 + p * 0.12, forKey: kCIInputContrastKey)
      cc.setValue(0, forKey: kCIInputBrightnessKey)
      if let out = cc.outputImage { img = out.cropped(to: extent) }
    }

    // 4) Vignetta (sebességgel kicsit erősödik)
    if cfg.vignette > 0, let v = CIFilter(name: "CIVignetteEffect") {
      let strength = cfg.vignette / 100 * (0.6 + 0.4 * t)
      v.setValue(img, forKey: kCIInputImageKey)
      v.setValue(center, forKey: "inputCenter")
      v.setValue(max(W, H) * 0.55, forKey: "inputRadius")
      v.setValue(strength, forKey: "inputIntensity")
      v.setValue(0.6, forKey: "inputFalloff")
      if let out = v.outputImage { img = out.cropped(to: extent) }
    }

    return img
  }
}

// MARK: - Overlay rajzoló

/// A feliratokat és a dőlés-műszert értékenként egyszer rajzolja meg, és
/// gyorsítótárazza (a videó képkockáin csak összeilleszti őket).
private final class OverlayPainter {
  let W: CGFloat
  let H: CGFloat
  let cfg: OverlayCfg
  let logoPath: String
  private let lock = NSLock()
  private var speedCache: [Int: CIImage] = [:]
  private var gCache: [Int: CIImage] = [:]
  private var leanCache: [String: CIImage] = [:]
  private var logoImage: CIImage?
  /// A sebesség és a G sor magassága (a háttérrel együtt) – az egymás alá
  /// helyezéshez. Értéktől független, ezért egyszer számoljuk ki.
  private var speedLineH: CGFloat = 0
  private var gLineH: CGFloat = 0
  private var geo: Geo!

  init(width: CGFloat, height: CGFloat, cfg: OverlayCfg, logoPath: String) {
    W = width
    H = height
    self.cfg = cfg
    self.logoPath = logoPath
    geo = OverlayPainter.makeGeo(cfg, height)
    if cfg.logo.visible { logoImage = makeLogo() }
    speedLineH = cfg.speed.visible ? valueBlockSize("0", cfg.speed.size, cfg.speed).height : 0
    gLineH = cfg.gforce.visible ? valueBlockSize("0.0", cfg.gforce.size, cfg.gforce).height : 0
  }

  private var margin: CGFloat { CGFloat(cfg.margin) / 100 * H }

  private var weight: UIFont.Weight {
    switch cfg.weight {
    case "medium": return .medium
    case "bold": return .bold
    default: return .black
    }
  }

  /// A beépített betű PostScript-neve (ugyanaz, mint FONT_NAMES a JS oldalon).
  /// nil = rendszerbetű.
  private var fontName: String? {
    switch cfg.font {
    case "oswald":
      switch cfg.weight {
      case "medium": return "OswaldTab-Medium"
      case "bold": return "OswaldTab-SemiBold"
      default: return "OswaldTab-Bold"
      }
    default:
      return nil
    }
  }

  private func numberFont(_ size: CGFloat) -> UIFont {
    if let name = fontName, let f = UIFont(name: name, size: size) { return f }
    return UIFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
  }

  private func textFont(_ size: CGFloat) -> UIFont {
    if let name = fontName, let f = UIFont(name: name, size: size) { return f }
    return UIFont.systemFont(ofSize: size, weight: weight)
  }

  private func shadow(for fontSize: CGFloat) -> NSShadow? {
    guard cfg.shadow > 0 else { return nil }
    let s = NSShadow()
    s.shadowColor = UIColor.black.withAlphaComponent(CGFloat(cfg.shadow / 100))
    s.shadowBlurRadius = max(1, fontSize * SHADOW_RADIUS)
    s.shadowOffset = .zero
    return s
  }

  private func attrs(
    font: UIFont, color: UIColor, size: CGFloat, align: NSTextAlignment? = nil
  ) -> [NSAttributedString.Key: Any] {
    var a: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: color,
    ]
    if let sh = shadow(for: size) { a[.shadow] = sh }
    if let align = align {
      let p = NSMutableParagraphStyle()
      p.alignment = align
      a[.paragraphStyle] = p
    }
    return a
  }

  /// Bal felső sarok (UIKit koordináták) az adott pozícióhoz és mérethez.
  private func origin(_ anchor: String, _ size: CGSize) -> CGPoint {
    let m = margin
    let x: CGFloat
    if anchor.hasSuffix("l") {
      x = m
    } else if anchor.hasSuffix("r") {
      x = W - m - size.width
    } else {
      x = (W - size.width) / 2
    }
    let y = anchor.hasPrefix("b") ? H - m - size.height : m
    return CGPoint(x: x, y: y)
  }

  // UIKit (bal felső origó) -> CoreImage (bal alsó origó)
  private func place(_ img: CIImage, uiX: CGFloat, uiY: CGFloat) -> CIImage {
    let e = img.extent
    return img.transformed(
      by: CGAffineTransform(
        translationX: uiX - e.origin.x, y: H - uiY - e.height - e.origin.y))
  }

  private func renderer(_ size: CGSize) -> UIGraphicsImageRenderer {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    return UIGraphicsImageRenderer(size: size, format: format)
  }

  // MARK: Sebesség + G (egymás alatt)

  private func valueString(_ text: String, _ sizePct: Double, _ e: ValueCfg) -> NSAttributedString {
    let f = CGFloat(sizePct / 100) * H
    let str = NSMutableAttributedString(
      string: text,
      attributes: attrs(font: numberFont(f), color: uiColor(e.color), size: f))
    if e.unitVisible && !e.unitText.isEmpty {
      let uf = f * 0.45
      str.append(
        NSAttributedString(
          string: " " + e.unitText,
          attributes: attrs(font: textFont(uf), color: uiColor(e.color), size: uf)))
    }
    return str
  }

  private func textSize(_ str: NSAttributedString) -> CGSize {
    str.boundingRect(
      with: CGSize(width: 10000, height: 10000),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      context: nil
    ).integral.size
  }

  private func valueBlockSize(_ text: String, _ sizePct: Double, _ e: ValueCfg) -> CGSize {
    let f = CGFloat(sizePct / 100) * H
    let ts = textSize(valueString(text, sizePct, e))
    let padH = cfg.bgEnabled ? f * BG_PAD_H : 0
    let padV = cfg.bgEnabled ? f * BG_PAD_V : 0
    return CGSize(width: ts.width + padH * 2, height: ts.height + padV * 2)
  }

  /// Egy érték sor kirajzolása (opcionális háttérrel), a megadott helyre téve.
  /// `rowTop`: a sor teteje (UIKit y). A vízszintes igazítás az anchor szerint.
  private func valueTile(_ text: String, _ e: ValueCfg, rowTop: CGFloat) -> CIImage? {
    let f = CGFloat(e.size / 100) * H
    let str = valueString(text, e.size, e)
    let ts = textSize(str)
    let bg = cfg.bgEnabled
    let padH = bg ? f * BG_PAD_H : 0
    let padV = bg ? f * BG_PAD_V : 0
    let block = CGSize(width: ts.width + padH * 2, height: ts.height + padV * 2)
    let sp = ceil(f * 0.35)
    let canvas = CGSize(width: block.width + sp * 2, height: block.height + sp * 2)
    let bgColor = uiColor(cfg.bgColor, CGFloat(cfg.bgOpacity / 100))

    let image = renderer(canvas).image { ctx in
      let cg = ctx.cgContext
      cg.setAlpha(CGFloat(e.opacity / 100))
      cg.beginTransparencyLayer(auxiliaryInfo: nil)
      if bg {
        bgColor.setFill()
        UIBezierPath(
          roundedRect: CGRect(x: sp, y: sp, width: block.width, height: block.height),
          cornerRadius: f * BG_RADIUS
        ).fill()
      }
      str.draw(
        with: CGRect(x: sp + padH, y: sp + padV, width: ts.width, height: ts.height),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        context: nil)
      cg.endTransparencyLayer()
    }
    guard let cgImg = image.cgImage else { return nil }
    let x = origin(cfg.speed.anchor, block).x
    return place(CIImage(cgImage: cgImg), uiX: x - sp, uiY: rowTop - sp)
  }

  /// A csoport (sebesség + G) teteje
  private var stackTop: CGFloat {
    let total = speedLineH + gLineH
    return cfg.speed.anchor.hasPrefix("b") ? H - margin - total : margin
  }

  private func speedTile(_ v: Int) -> CIImage? {
    lock.lock()
    if let c = speedCache[v] {
      lock.unlock()
      return c
    }
    lock.unlock()
    let tile = valueTile("\(v)", cfg.speed, rowTop: stackTop)
    lock.lock()
    speedCache[v] = tile
    lock.unlock()
    return tile
  }

  /// `tenths`: a G-erő tizedekben (12 = 1.2 G)
  private func gTile(_ tenths: Int) -> CIImage? {
    lock.lock()
    if let c = gCache[tenths] {
      lock.unlock()
      return c
    }
    lock.unlock()
    let v = Double(tenths) / 10
    let text = (v < 0 ? "−" : "") + String(format: "%.1f", abs(v))
    let tile = valueTile(text, cfg.gforce, rowTop: stackTop + speedLineH)
    lock.lock()
    gCache[tenths] = tile
    lock.unlock()
    return tile
  }

  // MARK: Dőlés-műszer (ív + "bal | jobb")

  /// Ugyanaz a geometria, mint gaugeGeometry() a JS oldalon.
  private struct Geo {
    let width: CGFloat
    let height: CGFloat
    let cx: CGFloat
    let cy: CGFloat
    let r: CGFloat
    let stroke: CGFloat
    let numbersTop: CGFloat
    let font: CGFloat
    let divGap: CGFloat
  }

  /// Az init-ben számoljuk (nem lazy), mert a képkockák párhuzamosan is
  /// renderelődhetnek.
  private static func makeGeo(_ cfg: OverlayCfg, _ H: CGFloat) -> Geo {
    let e = cfg.lean
    let font = CGFloat(e.size / 100) * H
    let D = e.gaugeVisible ? CGFloat(e.gaugeSize / 100) * H : font * 4
    let stroke = D * 0.075
    let arcH = e.gaugeVisible ? D / 2 + stroke / 2 : 0
    let gap = (e.gaugeVisible && e.numbersVisible) ? font * 0.2 : 0
    let numbersH = e.numbersVisible ? font * GAUGE_LINE : 0
    return Geo(
      width: D, height: arcH + gap + numbersH, cx: D / 2, cy: D / 2,
      r: D / 2 - stroke / 2, stroke: stroke, numbersTop: arcH + gap,
      font: font, divGap: font * 0.4)
  }

  /// Pont az íven (UIKit koordináták a dobozon belül), a = fok a függőlegestől, + = jobbra
  private func arcPoint(_ g: Geo, _ a: CGFloat, _ radius: CGFloat? = nil) -> CGPoint {
    let r = radius ?? g.r
    let rad = a * .pi / 180
    return CGPoint(x: g.cx + r * sin(rad), y: g.cy - r * cos(rad))
  }

  /// Ív 'from'-tól 'to'-ig (fok a függőlegestől). UIKit-ben a 0 rad = jobbra,
  /// a pozitív irány az óramutató járása (y lefelé nő).
  private func arcPath(_ g: Geo, _ from: CGFloat, _ to: CGFloat, offset: CGPoint) -> UIBezierPath {
    let start = (from - 90) * .pi / 180
    let end = (to - 90) * .pi / 180
    return UIBezierPath(
      arcCenter: CGPoint(x: offset.x + g.cx, y: offset.y + g.cy), radius: g.r,
      startAngle: start, endAngle: end, clockwise: to > from)
  }

  private func leanTile(left: Int, right: Int, maxL: Int, maxR: Int) -> CIImage? {
    let key = "\(left),\(right),\(maxL),\(maxR)"
    lock.lock()
    if let c = leanCache[key] {
      lock.unlock()
      return c
    }
    lock.unlock()

    let e = cfg.lean
    let g: Geo = geo
    let color = uiColor(e.color)
    let warnColor = uiColor(e.warnColor)
    func warn(_ deg: Int) -> Bool { e.warnEnabled && Double(deg) >= e.warnAngle }
    let active = CGFloat(left >= right ? -left : right)
    let activeDeg = Int(abs(active))
    let fill = warn(activeDeg) ? warnColor : color
    let outline = g.stroke * 0.35
    let outlineAlpha = CGFloat(cfg.shadow / 100) * 0.45
    let pad = ceil(max(outline, g.font * 0.35)) + 2
    let canvas = CGSize(width: g.width + pad * 2, height: g.height + pad * 2)
    let o = CGPoint(x: pad, y: pad)
    func clampA(_ a: CGFloat) -> CGFloat { max(-90, min(90, a)) }

    let image = renderer(canvas).image { ctx in
      let cg = ctx.cgContext
      cg.setAlpha(CGFloat(e.opacity / 100))
      cg.beginTransparencyLayer(auxiliaryInfo: nil)

      if e.gaugeVisible {
        // sötét körvonal
        if outlineAlpha > 0 {
          let p = arcPath(g, -90, 90, offset: o)
          p.lineWidth = g.stroke + outline * 2
          p.lineCapStyle = .round
          UIColor.black.withAlphaComponent(outlineAlpha).setStroke()
          p.stroke()
        }
        // skála
        let track = arcPath(g, -90, 90, offset: o)
        track.lineWidth = g.stroke
        track.lineCapStyle = .round
        color.withAlphaComponent(0.28).setStroke()
        track.stroke()
        // kitöltés
        if activeDeg >= 1 {
          let f = arcPath(g, 0, clampA(active), offset: o)
          f.lineWidth = g.stroke
          f.lineCapStyle = .round
          fill.setStroke()
          f.stroke()
        }
        // legnagyobb dőlés jelzése
        if e.showMax {
          for (deg, sign) in [(maxL, CGFloat(-1)), (maxR, CGFloat(1))] where deg >= 1 {
            let a = clampA(CGFloat(deg) * sign)
            let p0 = arcPoint(g, a, g.r - g.stroke * 1.4)
            let p1 = arcPoint(g, a, g.r - g.stroke * 0.6)
            let tick = UIBezierPath()
            tick.move(to: CGPoint(x: o.x + p0.x, y: o.y + p0.y))
            tick.addLine(to: CGPoint(x: o.x + p1.x, y: o.y + p1.y))
            tick.lineWidth = g.stroke * 0.45
            tick.lineCapStyle = .round
            color.withAlphaComponent(0.75).setStroke()
            tick.stroke()
          }
        }
        // mutató
        let k = arcPoint(g, clampA(active))
        let kr = g.stroke * 0.85
        fill.setFill()
        UIBezierPath(
          ovalIn: CGRect(x: o.x + k.x - kr, y: o.y + k.y - kr, width: kr * 2, height: kr * 2)
        ).fill()
      }

      if e.numbersVisible {
        let f = g.font
        let nf = numberFont(f)
        let top = o.y + g.numbersTop
        let l = NSAttributedString(
          string: "\(left)",
          attributes: attrs(font: nf, color: warn(left) ? warnColor : color, size: f))
        let r = NSAttributedString(
          string: "\(right)",
          attributes: attrs(font: nf, color: warn(right) ? warnColor : color, size: f))
        let d = NSAttributedString(
          string: "|", attributes: [.font: nf, .foregroundColor: color.withAlphaComponent(0.45)])
        let ls = textSize(l)
        let rs = textSize(r)
        let ds = textSize(d)
        l.draw(
          with: CGRect(x: o.x + g.cx - g.divGap - ls.width, y: top, width: ls.width, height: ls.height),
          options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        d.draw(
          with: CGRect(x: o.x + g.cx - ds.width / 2, y: top, width: ds.width, height: ds.height),
          options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        r.draw(
          with: CGRect(x: o.x + g.cx + g.divGap, y: top, width: rs.width, height: rs.height),
          options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
      }
      cg.endTransparencyLayer()
    }
    guard let cgImg = image.cgImage else { return nil }
    let pos = origin(e.anchor, CGSize(width: g.width, height: g.height))
    let tile = place(CIImage(cgImage: cgImg), uiX: pos.x - pad, uiY: pos.y - pad)

    lock.lock()
    if leanCache.count > 4000 { leanCache.removeAll() }
    leanCache[key] = tile
    lock.unlock()
    return tile
  }

  // MARK: Logó + felirat (statikus, egyszer készül)

  private func makeLogo() -> CIImage? {
    let l = cfg.logo
    let area = CGFloat(l.size / 100) * W * H
    let r: CGFloat = l.labelVisible ? CGFloat(l.labelSize / 100) : 0
    let a: CGFloat = l.aspect > 0 ? CGFloat(l.aspect) : 1.5
    let imgH = sqrt(area / (a * (1 + r)))
    let boxW = imgH * a
    let labelH = imgH * r
    let boxH = imgH + labelH
    let sp = ceil(max(labelH, 4) * 0.5)
    let canvas = CGSize(width: boxW + sp * 2, height: boxH + sp * 2)
    let logo = UIImage(contentsOfFile: fileURL(logoPath).path)

    let image = renderer(canvas).image { ctx in
      let cg = ctx.cgContext
      cg.setAlpha(CGFloat(l.opacity / 100))
      cg.beginTransparencyLayer(auxiliaryInfo: nil)
      if let logo = logo, logo.size.width > 0, logo.size.height > 0 {
        let s = min(boxW / logo.size.width, imgH / logo.size.height)
        let w = logo.size.width * s
        let h = logo.size.height * s
        logo.draw(in: CGRect(x: sp + (boxW - w) / 2, y: sp + (imgH - h) / 2, width: w, height: h))
      }
      if l.labelVisible && !l.labelText.isEmpty {
        let fontSize = labelH * LABEL_FONT
        var at = attrs(
          font: textFont(fontSize), color: uiColor(l.labelColor), size: fontSize, align: .center)
        if let p = at[.paragraphStyle] as? NSMutableParagraphStyle {
          p.lineBreakMode = .byTruncatingTail
          at[.paragraphStyle] = p
        }
        let text = NSAttributedString(string: l.labelText, attributes: at)
        let th = text.boundingRect(
          with: CGSize(width: boxW, height: labelH * 2),
          options: [.usesLineFragmentOrigin], context: nil
        ).height
        text.draw(
          with: CGRect(x: sp, y: sp + imgH + (labelH - th) / 2, width: boxW, height: th + 2),
          options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
      }
      cg.endTransparencyLayer()
    }
    guard let cgImg = image.cgImage else { return nil }
    let o = origin(l.anchor, CGSize(width: boxW, height: boxH))
    return place(CIImage(cgImage: cgImg), uiX: o.x - sp, uiY: o.y - sp)
  }

  func compose(over source: CIImage, s: TelemetrySample) -> CIImage {
    var out = source
    if cfg.logo.visible, let logo = logoImage { out = logo.composited(over: out) }
    if cfg.speed.visible, let t = speedTile(Int(s.speed.rounded())) {
      out = t.composited(over: out)
    }
    if cfg.gforce.visible, let t = gTile(Int((s.g * 10).rounded())) {
      out = t.composited(over: out)
    }
    if cfg.lean.visible,
      let t = leanTile(
        left: Int(s.left.rounded()), right: Int(s.right.rounded()),
        maxL: Int(s.maxLeft.rounded()), maxR: Int(s.maxRight.rounded()))
    {
      out = t.composited(over: out)
    }
    return out.cropped(to: source.extent)
  }
}

/// A rajzoló lustán jön létre az első képkockánál, mert csak akkor ismert
/// biztosan a kész (elforgatott) képméret.
private final class PainterBox {
  private let lock = NSLock()
  private var painter: OverlayPainter?

  func get(width: CGFloat, height: CGFloat, cfg: OverlayCfg, logoPath: String) -> OverlayPainter {
    lock.lock()
    defer { lock.unlock() }
    if let p = painter, p.W == width, p.H == height { return p }
    let p = OverlayPainter(width: width, height: height, cfg: cfg, logoPath: logoPath)
    painter = p
    return p
  }
}

// MARK: - Modul

public class OverlayRendererModule: Module {
  private var documentsDir: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }

  public func definition() -> ModuleDefinition {
    Name("OverlayRenderer")

    Events("onRenderProgress")

    AsyncFunction("renderOverlay") { (options: RenderOptions, promise: Promise) in
      self.render(options: options, promise: promise)
    }

    AsyncFunction("saveVideoToPhotos") { (path: String, promise: Promise) in
      let url = fileURL(path)
      guard FileManager.default.fileExists(atPath: url.path) else {
        promise.reject("E_NO_FILE", "A videófájl nem található: \(url.path)")
        return
      }
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        guard status == .authorized || status == .limited else {
          promise.reject("E_PHOTOS_PERMISSION", "Nincs engedély a Fotókba mentéshez.")
          return
        }
        PHPhotoLibrary.shared().performChanges({
          PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
        }) { success, error in
          if success {
            promise.resolve()
          } else {
            promise.reject(
              "E_PHOTOS_SAVE",
              "Mentés sikertelen: \(error?.localizedDescription ?? "ismeretlen hiba")")
          }
        }
      }
    }

    AsyncFunction("writeTextFile") { (fileName: String, content: String) throws -> String in
      let url = self.documentsDir.appendingPathComponent(fileName)
      try content.write(to: url, atomically: true, encoding: .utf8)
      return url.absoluteString
    }

    AsyncFunction("deleteFile") { (path: String) in
      _ = try? FileManager.default.removeItem(at: fileURL(path))
    }

    /// Fájl bemásolása a Dokumentumok mappába (pl. a kiválasztott logó).
    AsyncFunction("copyToDocuments") { (source: String, fileName: String) throws -> String in
      let dest = self.documentsDir.appendingPathComponent(fileName)
      if FileManager.default.fileExists(atPath: dest.path) {
        try FileManager.default.removeItem(at: dest)
      }
      try FileManager.default.copyItem(at: fileURL(source), to: dest)
      return fileName
    }

    AsyncFunction("deleteDocumentFile") { (fileName: String) in
      _ = try? FileManager.default.removeItem(
        at: self.documentsDir.appendingPathComponent(fileName))
    }

    /// A Dokumentumok mappában lévő fájl aktuális file:// URI-ja, vagy nil.
    /// (Az app mappájának útvonala újratelepítéskor változhat, ezért csak a
    /// fájlnevet tároljuk, és mindig itt oldjuk fel.)
    Function("documentFileUri") { (fileName: String) -> String? in
      let url = self.documentsDir.appendingPathComponent(fileName)
      return FileManager.default.fileExists(atPath: url.path) ? url.absoluteString : nil
    }
  }

  private func render(options: RenderOptions, promise: Promise) {
    let cfg: OverlayCfg
    do {
      cfg = try JSONDecoder().decode(OverlayCfg.self, from: Data(options.overlayJson.utf8))
    } catch {
      promise.reject("E_CONFIG", "Hibás overlay beállítás: \(error.localizedDescription)")
      return
    }

    let inputURL = fileURL(options.inputPath)
    let asset = AVURLAsset(url: inputURL)
    let telemetry = Telemetry(flat: options.samples)
    let effects = cfg.effects.map { EffectProcessor(cfg: $0) }
    let logoPath = options.logoPath

    let painterBox = PainterBox()
    let composition = AVMutableVideoComposition(asset: asset) { request in
      let source = request.sourceImage
      let s = telemetry.sample(at: request.compositionTime.seconds)
      let base = effects?.apply(source, speed: Int(s.speed.rounded())) ?? source
      let painter = painterBox.get(
        width: source.extent.width, height: source.extent.height, cfg: cfg, logoPath: logoPath)
      let output = painter.compose(over: base, s: s)
      request.finish(with: output, context: nil)
    }

    guard
      let export = AVAssetExportSession(
        asset: asset, presetName: AVAssetExportPresetHighestQuality)
    else {
      promise.reject("E_EXPORT", "Nem sikerült létrehozni az export munkamenetet.")
      return
    }

    let outURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("motorec-overlay-\(UUID().uuidString).mp4")
    export.videoComposition = composition
    export.outputURL = outURL
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = false

    // Előrehaladás jelzése a JS oldalnak
    DispatchQueue.global(qos: .utility).async { [weak self] in
      while export.status == .waiting || export.status == .exporting
        || export.status == .unknown
      {
        self?.sendEvent("onRenderProgress", ["progress": Double(export.progress)])
        Thread.sleep(forTimeInterval: 0.4)
      }
    }

    export.exportAsynchronously {
      switch export.status {
      case .completed:
        self.sendEvent("onRenderProgress", ["progress": 1.0])
        promise.resolve(outURL.path)
      case .cancelled:
        promise.reject("E_EXPORT_CANCELLED", "Az export megszakadt.")
      default:
        promise.reject(
          "E_EXPORT_FAILED",
          "Az overlay-es videó elkészítése sikertelen: \(export.error?.localizedDescription ?? "ismeretlen hiba")"
        )
      }
    }
  }
}
