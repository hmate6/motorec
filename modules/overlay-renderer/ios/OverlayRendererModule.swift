import AVFoundation
import CoreImage
import ExpoModulesCore
import Photos
import UIKit

// MARK: - Bemenet

struct RenderOptions: Record {
  @Field var inputPath: String = ""
  @Field var logoPath: String = ""
  @Field var label: String = ""
  /// [t, sebesség, balra, jobbra, t, ...]
  @Field var samples: [Double] = []
  @Field var margin: Double = 0.035
  @Field var logoAreaFraction: Double = 0.05
  @Field var logoAspect: Double = 1.5
  @Field var labelBandRatio: Double = 0.2
  @Field var speedFont: Double = 0.1
  @Field var unitScale: Double = 0.42
  @Field var leanFont: Double = 0.085
  @Field var leanLabelFont: Double = 0.032
}

// MARK: - Telemetria

private final class Telemetry {
  private var times: [Double] = []
  private var speeds: [Int] = []
  private var lefts: [Int] = []
  private var rights: [Int] = []

  init(flat: [Double]) {
    var i = 0
    while i + 3 < flat.count {
      times.append(flat[i])
      speeds.append(Int(flat[i + 1].rounded()))
      lefts.append(Int(flat[i + 2].rounded()))
      rights.append(Int(flat[i + 3].rounded()))
      i += 4
    }
  }

  /// Az adott időpontnál legutóbbi minta (bináris kereséssel).
  func sample(at t: Double) -> (speed: Int, left: Int, right: Int) {
    guard !times.isEmpty else { return (0, 0, 0) }
    if t <= times[0] { return (speeds[0], lefts[0], rights[0]) }
    var lo = 0
    var hi = times.count - 1
    while lo < hi {
      let mid = (lo + hi + 1) / 2
      if times[mid] <= t { lo = mid } else { hi = mid - 1 }
    }
    return (speeds[lo], lefts[lo], rights[lo])
  }
}

// MARK: - Overlay rajzoló

/// Kis szöveg-csempék rajzolása és gyorsítótárazása. A teljes képkocka helyett
/// csak a változó feliratokat rajzoljuk újra, és értékenként egyszer.
private final class OverlayPainter {
  let W: CGFloat
  let H: CGFloat
  let opts: RenderOptions
  private let lock = NSLock()
  private var speedCache: [Int: CIImage] = [:]
  private var leftCache: [Int: CIImage] = [:]
  private var rightCache: [Int: CIImage] = [:]
  private(set) var logoImage: CIImage?

  init(width: CGFloat, height: CGFloat, options: RenderOptions) {
    W = width
    H = height
    opts = options
    logoImage = makeLogo()
  }

  private var margin: CGFloat { CGFloat(opts.margin) * H }

  // UIKit (bal felső origó) -> CoreImage (bal alsó origó)
  private func place(_ img: CIImage, uiX: CGFloat, uiY: CGFloat) -> CIImage {
    let e = img.extent
    return img.transformed(
      by: CGAffineTransform(translationX: uiX - e.origin.x, y: H - uiY - e.height - e.origin.y))
  }

  private func shadow(for fontSize: CGFloat) -> NSShadow {
    let s = NSShadow()
    s.shadowColor = UIColor.black.withAlphaComponent(0.85)
    s.shadowBlurRadius = max(2, fontSize * 0.12)
    s.shadowOffset = .zero
    return s
  }

  private func numberFont(_ size: CGFloat) -> UIFont {
    UIFont.monospacedDigitSystemFont(ofSize: size, weight: .heavy)
  }

  /// Szöveg -> kép, `pad` pixel átlátszó szegéllyel az árnyéknak.
  private func renderText(_ str: NSAttributedString, pad: CGFloat) -> (CIImage, CGSize)? {
    let size = str.boundingRect(
      with: CGSize(width: 10000, height: 10000),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      context: nil
    ).integral.size
    let canvas = CGSize(width: size.width + pad * 2, height: size.height + pad * 2)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let img = UIGraphicsImageRenderer(size: canvas, format: format).image { _ in
      str.draw(
        with: CGRect(x: pad, y: pad, width: size.width, height: size.height),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        context: nil)
    }
    guard let cg = img.cgImage else { return nil }
    return (CIImage(cgImage: cg), size)
  }

  // MARK: Logó + felirat (statikus, egyszer készül)

  private func makeLogo() -> CIImage? {
    let k = (1 + CGFloat(opts.labelBandRatio)) / CGFloat(opts.logoAspect)
    let boxW = sqrt(CGFloat(opts.logoAreaFraction) * W * H / k)
    let imgH = boxW / CGFloat(opts.logoAspect)
    let labelH = imgH * CGFloat(opts.labelBandRatio)
    let boxH = imgH + labelH

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let logo = UIImage(contentsOfFile: fileURL(opts.logoPath).path)
    let rendered = UIGraphicsImageRenderer(size: CGSize(width: boxW, height: boxH), format: format)
      .image { _ in
        if let logo = logo {
          // arányos illesztés a kép sávba
          let s = min(boxW / logo.size.width, imgH / logo.size.height)
          let w = logo.size.width * s
          let h = logo.size.height * s
          logo.draw(in: CGRect(x: (boxW - w) / 2, y: (imgH - h) / 2, width: w, height: h))
        }
        let fontSize = labelH * 0.72
        let para = NSMutableParagraphStyle()
        para.alignment = .center
        para.lineBreakMode = .byTruncatingTail
        let attrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: fontSize, weight: .semibold),
          .foregroundColor: UIColor.white,
          .paragraphStyle: para,
          .shadow: self.shadow(for: fontSize),
        ]
        let text = NSAttributedString(string: self.opts.label, attributes: attrs)
        let th = text.boundingRect(
          with: CGSize(width: boxW, height: labelH * 2),
          options: [.usesLineFragmentOrigin], context: nil
        ).height
        text.draw(
          with: CGRect(x: 0, y: imgH + (labelH - th) / 2, width: boxW, height: th + 2),
          options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
      }
    guard let cg = rendered.cgImage else { return nil }
    return place(CIImage(cgImage: cg), uiX: margin, uiY: margin)
  }

  // MARK: Sebesség (jobb felső sarok)

  private func speedTile(_ v: Int) -> CIImage? {
    lock.lock()
    if let c = speedCache[v] {
      lock.unlock()
      return c
    }
    lock.unlock()

    let big = CGFloat(opts.speedFont) * H
    let small = big * CGFloat(opts.unitScale)
    let str = NSMutableAttributedString(
      string: "\(v)",
      attributes: [
        .font: numberFont(big),
        .foregroundColor: UIColor.white,
        .shadow: shadow(for: big),
      ])
    str.append(
      NSAttributedString(
        string: " km/h",
        attributes: [
          .font: UIFont.systemFont(ofSize: small, weight: .bold),
          .foregroundColor: UIColor.white,
          .shadow: shadow(for: small),
        ]))
    let pad = ceil(big * 0.3)
    guard let rendered = renderText(str, pad: pad) else { return nil }
    let (img, size) = rendered
    let placed = place(img, uiX: W - margin - size.width - pad, uiY: margin - pad)

    lock.lock()
    speedCache[v] = placed
    lock.unlock()
    return placed
  }

  // MARK: Dőlés (alsó sarkok)

  private func leanTile(_ deg: Int, left: Bool) -> CIImage? {
    lock.lock()
    if let c = (left ? leftCache[deg] : rightCache[deg]) {
      lock.unlock()
      return c
    }
    lock.unlock()

    let big = CGFloat(opts.leanFont) * H
    let small = CGFloat(opts.leanLabelFont) * H
    let para = NSMutableParagraphStyle()
    para.alignment = left ? .left : .right
    let str = NSMutableAttributedString(
      string: left ? "BAL\n" : "JOBB\n",
      attributes: [
        .font: UIFont.systemFont(ofSize: small, weight: .bold),
        .foregroundColor: UIColor.white.withAlphaComponent(0.85),
        .shadow: shadow(for: small),
        .paragraphStyle: para,
      ])
    str.append(
      NSAttributedString(
        string: "\(deg)°",
        attributes: [
          .font: numberFont(big),
          .foregroundColor: UIColor.white,
          .shadow: shadow(for: big),
          .paragraphStyle: para,
        ]))
    let pad = ceil(big * 0.3)
    guard let rendered = renderText(str, pad: pad) else { return nil }
    let (img, size) = rendered
    let x = left ? margin - pad : W - margin - size.width - pad
    let y = H - margin - size.height - pad
    let placed = place(img, uiX: x, uiY: y)

    lock.lock()
    if left { leftCache[deg] = placed } else { rightCache[deg] = placed }
    lock.unlock()
    return placed
  }

  func compose(over source: CIImage, speed: Int, left: Int, right: Int) -> CIImage {
    var out = source
    if let logo = logoImage { out = logo.composited(over: out) }
    if let s = speedTile(speed) { out = s.composited(over: out) }
    if let l = leanTile(left, left: true) { out = l.composited(over: out) }
    if let r = leanTile(right, left: false) { out = r.composited(over: out) }
    return out.cropped(to: source.extent)
  }
}

// MARK: - Modul

private func fileURL(_ path: String) -> URL {
  if path.hasPrefix("file://"), let u = URL(string: path) { return u }
  return URL(fileURLWithPath: path)
}

public class OverlayRendererModule: Module {
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
              "E_PHOTOS_SAVE", "Mentés sikertelen: \(error?.localizedDescription ?? "ismeretlen hiba")")
          }
        }
      }
    }

    AsyncFunction("writeTextFile") { (fileName: String, content: String) throws -> String in
      let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      let url = dir.appendingPathComponent(fileName)
      try content.write(to: url, atomically: true, encoding: .utf8)
      return url.absoluteString
    }

    AsyncFunction("deleteFile") { (path: String) in
      _ = try? FileManager.default.removeItem(at: fileURL(path))
    }
  }

  private func render(options: RenderOptions, promise: Promise) {
    let inputURL = fileURL(options.inputPath)
    let asset = AVURLAsset(url: inputURL)
    let telemetry = Telemetry(flat: options.samples)

    let painterBox = PainterBox()
    let composition = AVMutableVideoComposition(asset: asset) { request in
      let source = request.sourceImage
      let painter: OverlayPainter = painterBox.get(
        width: source.extent.width, height: source.extent.height, options: options)
      let s = telemetry.sample(at: request.compositionTime.seconds)
      let output = painter.compose(over: source, speed: s.speed, left: s.left, right: s.right)
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
      while export.status == .waiting || export.status == .exporting || export.status == .unknown {
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

/// A rajzoló lustán jön létre az első képkockánál, mert csak akkor ismert
/// biztosan a kész (elforgatott) képméret.
private final class PainterBox {
  private let lock = NSLock()
  private var painter: OverlayPainter?

  func get(width: CGFloat, height: CGFloat, options: RenderOptions) -> OverlayPainter {
    lock.lock()
    defer { lock.unlock() }
    if let p = painter, p.W == width, p.H == height { return p }
    let p = OverlayPainter(width: width, height: height, options: options)
    painter = p
    return p
  }
}
