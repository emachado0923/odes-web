// Prepara los videos del robot ODES de /principal (apps/web/public/principal/robot): quita el fondo gris plano
// del render, con un recorte cuadrado. Solo macOS (AVFoundation y vImage).
//
// Robot sin fondo (desde v2.28 del bloque): el modo "cuadros" saca PNG con transparencia y ffmpeg arma un .webm
// (VP9 con alfa: Chrome, Edge y Firefox) y un .mov (HEVC con alfa: Safari). Ver apps/web/principal/LEEME.md.
//
//   /tmp/procesar-robot cuadros robotsapiencia.mp4 /tmp/aterrizaje 520 70 760 384
//   /tmp/procesar-robot cuadros saludo.mp4 /tmp/saludo 520 70 760 384
//
// Antes (hasta v2.27) los videos llevaban el fondo blanco de la pagina:
//
//   swiftc -O scripts/robot/procesar-robot.swift -o /tmp/procesar-robot
//   /tmp/procesar-robot video robotsapiencia.mp4 robot-aterrizaje.mp4 520 70 760 640 FFFFFF 450 robot-inicio.jpg
//   /tmp/procesar-robot video saludo.mp4 robot-saludo.mp4 520 70 760 640 FFFFFF 500 robot-saludo.jpg
//
// Modos:
//   muestras <entrada> <carpeta> <x> <y> <lado> <salida-px> <RRGGBB> <t1,t2,...>   PNG de prueba en esos segundos
//   video    <entrada> <salida.mp4> <x> <y> <lado> <salida-px> <RRGGBB> <kbps> [primer.jpg] [ultimo.jpg]
//   cuadros  <entrada> <carpeta> <x> <y> <lado> <salida-px>        PNG con alfa c00000.png... y fps.txt
//
// x, y y lado son el recorte en el video original (1920x1080); salida-px, el tamano final. El fondo se quita
// con un relleno desde los bordes (el gris del render es parejo) y el borde del robot se suaviza para que no
// quede halo. El blanco se codifica un poco por encima del nominal (Y=242): con pocos kbps el fondo plano se
// cuantiza hacia abajo y se veria un recuadro gris sobre la pagina.
import AVFoundation
import Accelerate
import AppKit

let FONDO: (Int, Int, Int) = (91, 92, 91)   // gris del render, tal como lo entrega AVAssetReader (BGRA)
let UMBRAL_RELLENO = 6                       // diferencia maxima por canal para considerar un pixel "fondo"
let UMBRAL_OPACO = 48                        // desde esta diferencia, el borde es opaco
let BOLSILLO_MIN = 150                       // huecos de fondo encerrados (entre brazos o piernas) de al menos esta area
// ...y con al menos esta fraccion de pixeles exactamente del gris del fondo. El hueco entre las piernas tiene ~60 %;
// los reflejos del gris en el casco y en otras superficies brillantes son degradados (0 a 10 %) y no se tocan.
let BOLSILLO_EXACTOS = 0.4

struct Recorte { let x: Int; let y: Int; let lado: Int; let salida: Int }

func hex(_ s: String) -> (Int, Int, Int) {
  let v = Int(s, radix: 16)!
  return ((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
}

/// Procesa el recorte de un fotograma BGRA: fondo -> color nuevo, con borde suave. Devuelve BGRA de lado x lado.
/// Con `transparente`, el fondo queda con alfa 0 y el borde con alfa parcial (BGRA premultiplicado, sin el gris).
func procesar(_ buf: CVPixelBuffer, _ r: Recorte, _ color: (Int, Int, Int), transparente: Bool = false) -> [UInt8] {
  CVPixelBufferLockBaseAddress(buf, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buf, .readOnly) }
  let fila = CVPixelBufferGetBytesPerRow(buf)
  let base = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
  let n = r.lado
  var px = [UInt8](repeating: 0, count: n * n * 4)
  var dif = [Int16](repeating: 0, count: n * n)
  for y in 0..<n {
    for x in 0..<n {
      let o = (r.y + y) * fila + (r.x + x) * 4
      let i = (y * n + x) * 4
      px[i] = base[o]; px[i + 1] = base[o + 1]; px[i + 2] = base[o + 2]; px[i + 3] = 255
      let d = max(abs(Int(base[o + 2]) - FONDO.0), abs(Int(base[o + 1]) - FONDO.1), abs(Int(base[o]) - FONDO.2))
      dif[y * n + x] = Int16(d)
    }
  }
  // 0 = sin decidir, 1 = fondo
  var fondo = [UInt8](repeating: 0, count: n * n)
  var cola = [Int32](); cola.reserveCapacity(n * n)
  func llenar(desde semillas: [Int32]) -> [Int32] {
    var visitados = [Int32]()
    cola.removeAll(keepingCapacity: true)
    for s in semillas where fondo[Int(s)] == 0 && dif[Int(s)] <= UMBRAL_RELLENO { fondo[Int(s)] = 2; cola.append(s) }
    var k = 0
    while k < cola.count {
      let p = Int(cola[k]); k += 1
      visitados.append(Int32(p))
      let x = p % n, y = p / n
      for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let nx = x + dx, ny = y + dy
        if nx < 0 || ny < 0 || nx >= n || ny >= n { continue }
        let q = ny * n + nx
        if fondo[q] == 0 && dif[q] <= UMBRAL_RELLENO { fondo[q] = 2; cola.append(Int32(q)) }
      }
    }
    return visitados
  }
  // 1. Fondo conectado con los bordes del recorte
  var bordes = [Int32]()
  for i in 0..<n { bordes += [Int32(i), Int32((n - 1) * n + i), Int32(i * n), Int32(i * n + n - 1)] }
  for p in llenar(desde: bordes) { fondo[Int(p)] = 1 }
  // 2. Huecos de fondo encerrados (casi exactos y de cierto tamano)
  for p in 0..<(n * n) where fondo[p] == 0 && dif[p] <= 2 {
    let zona = llenar(desde: [Int32(p)])
    let exactos = Double(zona.filter { dif[Int($0)] == 0 }.count) / Double(zona.count)
    let marca: UInt8 = zona.count >= BOLSILLO_MIN && exactos >= BOLSILLO_EXACTOS ? 1 : 3
    for q in zona { fondo[Int(q)] = marca }
  }
  // 3. Alfa: 0 en el fondo; en la franja de 2 px junto al fondo, segun la diferencia con el gris; 1 adentro
  var cerca = [UInt8](repeating: 0, count: n * n)
  for y in 0..<n { for x in 0..<n where fondo[y * n + x] == 1 {
    for dy in -2...2 { for dx in -2...2 {
      let nx = x + dx, ny = y + dy
      if nx >= 0 && ny >= 0 && nx < n && ny < n { cerca[ny * n + nx] = 1 }
    } }
  } }
  let (cr, cg, cb) = color
  for p in 0..<(n * n) {
    var alfa: Double = 1
    if fondo[p] == 1 { alfa = 0 }
    else if cerca[p] == 1 { alfa = min(1, max(0, Double(Int(dif[p]) - UMBRAL_RELLENO) / Double(UMBRAL_OPACO - UMBRAL_RELLENO))) }
    if alfa >= 1 { continue }
    if transparente {
      // Premultiplicado: lo que queda del pixel al quitarle el gris mezclado, pixel - (1 - alfa) * gris
      let i = p * 4, f = 1 - alfa, tope = 255 * alfa
      px[i + 2] = UInt8(max(0, min(tope, Double(px[i + 2]) - f * Double(FONDO.0))).rounded())
      px[i + 1] = UInt8(max(0, min(tope, Double(px[i + 1]) - f * Double(FONDO.1))).rounded())
      px[i] = UInt8(max(0, min(tope, Double(px[i]) - f * Double(FONDO.2))).rounded())
      px[i + 3] = UInt8(tope.rounded())
      continue
    }
    // Se quita el gris mezclado en el borde y se pone el color nuevo: salida = pixel + (1 - alfa) * (color - gris)
    let i = p * 4, f = 1 - alfa
    px[i + 2] = UInt8(max(0, min(255, (Double(px[i + 2]) + f * Double(cr - FONDO.0)).rounded())))
    px[i + 1] = UInt8(max(0, min(255, (Double(px[i + 1]) + f * Double(cg - FONDO.1)).rounded())))
    px[i] = UInt8(max(0, min(255, (Double(px[i]) + f * Double(cb - FONDO.2)).rounded())))
  }
  return px
}

/// Escala BGRA de lado x lado a salida x salida (Lanczos de vImage) dentro de un CVPixelBuffer.
func escalar(_ px: [UInt8], _ lado: Int, en destino: CVPixelBuffer) {
  CVPixelBufferLockBaseAddress(destino, [])
  defer { CVPixelBufferUnlockBaseAddress(destino, []) }
  var copia = px
  copia.withUnsafeMutableBytes { origenBytes in
    var origen = vImage_Buffer(data: origenBytes.baseAddress, height: vImagePixelCount(lado), width: vImagePixelCount(lado), rowBytes: lado * 4)
    var dst = vImage_Buffer(data: CVPixelBufferGetBaseAddress(destino), height: vImagePixelCount(CVPixelBufferGetHeight(destino)), width: vImagePixelCount(CVPixelBufferGetWidth(destino)), rowBytes: CVPixelBufferGetBytesPerRow(destino))
    _ = vImageScale_ARGB8888(&origen, &dst, nil, vImage_Flags(kvImageHighQualityResampling))
  }
}

/// BGRA -> YUV 4:2:0 de rango de video con la matriz BT.709, sin gestion de color: el blanco 255 queda en Y=235.
var infoYUV: vImage_ARGBToYpCbCr = {
  var info = vImage_ARGBToYpCbCr()
  var rango = vImage_YpCbCrPixelRange(Yp_bias: 16, CbCr_bias: 128, YpRangeMax: 235, CbCrRangeMax: 240, YpMax: 235, YpMin: 16, CbCrMax: 240, CbCrMin: 16)
  _ = vImageConvert_ARGBToYpCbCr_GenerateConversion(kvImage_ARGBToYpCbCrMatrix_ITU_R_709_2, &rango, &info, kvImageARGB8888, kvImage420Yp8_CbCr8, vImage_Flags(kvImageNoFlags))
  return info
}()
func aYUV(_ bgra: CVPixelBuffer, en yuv: CVPixelBuffer) {
  CVPixelBufferLockBaseAddress(bgra, .readOnly); CVPixelBufferLockBaseAddress(yuv, [])
  defer { CVPixelBufferUnlockBaseAddress(bgra, .readOnly); CVPixelBufferUnlockBaseAddress(yuv, []) }
  let w = CVPixelBufferGetWidth(bgra), h = CVPixelBufferGetHeight(bgra)
  var origen = vImage_Buffer(data: CVPixelBufferGetBaseAddress(bgra), height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: CVPixelBufferGetBytesPerRow(bgra))
  var y = vImage_Buffer(data: CVPixelBufferGetBaseAddressOfPlane(yuv, 0), height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: CVPixelBufferGetBytesPerRowOfPlane(yuv, 0))
  var cbcr = vImage_Buffer(data: CVPixelBufferGetBaseAddressOfPlane(yuv, 1), height: vImagePixelCount(h / 2), width: vImagePixelCount(w / 2), rowBytes: CVPixelBufferGetBytesPerRowOfPlane(yuv, 1))
  var orden: [UInt8] = [3, 2, 1, 0]   // la memoria es B,G,R,A; vImage espera A,R,G,B
  _ = vImageConvert_ARGB8888To420Yp8_CbCr8(&origen, &y, &cbcr, &infoYUV, &orden, vImage_Flags(kvImageNoFlags))
  // El blanco (Y=235) pasa a 242: con 500 kbps el fondo plano se cuantiza un par de niveles hacia abajo y el
  // rizado del borde lo oscurece; por encima de 235 el navegador lo recorta a blanco puro igual que la pagina.
  let py = CVPixelBufferGetBaseAddressOfPlane(yuv, 0)!.assumingMemoryBound(to: UInt8.self)
  let filaY = CVPixelBufferGetBytesPerRowOfPlane(yuv, 0)
  for fy in 0..<h { for fx in 0..<w where py[fy * filaY + fx] >= 235 { py[fy * filaY + fx] = 242 } }
}

func guardarJPEG(_ buf: CVPixelBuffer, _ ruta: String, calidad: Double = 0.88) {
  let ci = CIImage(cvPixelBuffer: buf)
  let ctx = CIContext()
  let cg = ctx.createCGImage(ci, from: ci.extent)!
  let rep = NSBitmapImageRep(cgImage: cg)
  try! rep.representation(using: .jpeg, properties: [.compressionFactor: calidad])!.write(to: URL(fileURLWithPath: ruta))
}
func guardarPNG(_ buf: CVPixelBuffer, _ ruta: String) {
  let ci = CIImage(cvPixelBuffer: buf)
  let cg = CIContext().createCGImage(ci, from: ci.extent)!
  try! NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ruta))
}

func nuevoBuffer(_ lado: Int) -> CVPixelBuffer {
  var b: CVPixelBuffer?
  CVPixelBufferCreate(nil, lado, lado, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey as String: [:]] as CFDictionary, &b)
  return b!
}

func pista(_ asset: AVURLAsset) -> AVAssetTrack {
  let sem = DispatchSemaphore(value: 0)
  var t: AVAssetTrack?
  Task { t = try? await asset.loadTracks(withMediaType: .video).first; sem.signal() }
  sem.wait()
  return t!
}

let a = CommandLine.arguments
let modo = a[1], entrada = a[2], destino = a[3]
let rec = Recorte(x: Int(a[4])!, y: Int(a[5])!, lado: Int(a[6])!, salida: Int(a[7])!)
let color = a.count > 8 && modo != "cuadros" ? hex(a[8]) : (255, 255, 255)
let asset = AVURLAsset(url: URL(fileURLWithPath: entrada))
let track = pista(asset)
let lector = try AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
lector.add(out)
lector.startReading()

/// Despues de escalar (Lanczos), ningun canal premultiplicado puede pasar del alfa (el filtro hace pequenos rebotes).
func recortarAlAlfa(_ buf: CVPixelBuffer) {
  CVPixelBufferLockBaseAddress(buf, [])
  defer { CVPixelBufferUnlockBaseAddress(buf, []) }
  let fila = CVPixelBufferGetBytesPerRow(buf), w = CVPixelBufferGetWidth(buf), h = CVPixelBufferGetHeight(buf)
  let base = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
  for y in 0..<h { for x in 0..<w {
    let o = y * fila + x * 4, al = base[o + 3]
    for c in 0..<3 where base[o + c] > al { base[o + c] = al }
  } }
}

if modo == "cuadros" {
  try? FileManager.default.createDirectory(atPath: destino, withIntermediateDirectories: true)
  var n = 0
  while let m = out.copyNextSampleBuffer(), let buf = CMSampleBufferGetImageBuffer(m) {
    let px = procesar(buf, rec, color, transparente: true)
    let b = nuevoBuffer(rec.salida)
    escalar(px, rec.lado, en: b)
    recortarAlAlfa(b)
    guardarPNG(b, "\(destino)/c\(String(format: "%05d", n)).png")
    n += 1
  }
  let fps = track.nominalFrameRate
  try! "\(fps)\n".write(toFile: "\(destino)/fps.txt", atomically: true, encoding: .utf8)
  print("listo", destino, "cuadros", n, "fps", fps)
  exit(0)
}

if modo == "muestras" {
  let tiempos = a[9].split(separator: ",").map { Double($0)! }
  var siguiente = 0
  while siguiente < tiempos.count, let m = out.copyNextSampleBuffer(), let buf = CMSampleBufferGetImageBuffer(m) {
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(m))
    if t + 0.017 < tiempos[siguiente] { continue }
    let px = procesar(buf, rec, color)
    let b = nuevoBuffer(rec.salida)
    escalar(px, rec.lado, en: b)
    guardarPNG(b, "\(destino)/m\(String(format: "%05.2f", t)).png")
    siguiente += 1
  }
  exit(0)
}

// Video completo
let kbps = Int(a[9])!
try? FileManager.default.removeItem(atPath: destino)
let escritor = try AVAssetWriter(outputURL: URL(fileURLWithPath: destino), fileType: .mp4)
escritor.shouldOptimizeForNetworkUse = true
let ajustes: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: rec.salida, AVVideoHeightKey: rec.salida,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: kbps * 1000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: 60,
    AVVideoExpectedSourceFrameRateKey: 30,
  ],
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
]
let entradaVideo = AVAssetWriterInput(mediaType: .video, outputSettings: ajustes)
entradaVideo.expectsMediaDataInRealTime = false
let adaptador = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: entradaVideo, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  kCVPixelBufferWidthKey as String: rec.salida, kCVPixelBufferHeightKey as String: rec.salida,
])
escritor.add(entradaVideo)
escritor.startWriting()
escritor.startSession(atSourceTime: .zero)
var cuadros = 0
var ultimo: CVPixelBuffer?
while let m = out.copyNextSampleBuffer(), let buf = CMSampleBufferGetImageBuffer(m) {
  let t = CMSampleBufferGetPresentationTimeStamp(m)
  let px = procesar(buf, rec, color)
  let rgb = nuevoBuffer(rec.salida)
  escalar(px, rec.lado, en: rgb)
  var b: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptador.pixelBufferPool!, &b)
  aYUV(rgb, en: b!)
  // Los cuadros ya estan en BT.709 (asi los entrega AVAssetReader): sin estas etiquetas el codificador los
  // convierte como si fueran de otro espacio de color y el blanco 255 queda en Y=233 en vez de 235.
  CVBufferSetAttachment(b!, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
  CVBufferSetAttachment(b!, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
  CVBufferSetAttachment(b!, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
  while !entradaVideo.isReadyForMoreMediaData { usleep(2000) }
  adaptador.append(b!, withPresentationTime: t)
  if cuadros == 0, a.count > 10 { guardarJPEG(rgb, a[10]) }
  ultimo = rgb
  cuadros += 1
}
if a.count > 11, let u = ultimo { guardarJPEG(u, a[11]) }
entradaVideo.markAsFinished()
let fin = DispatchSemaphore(value: 0)
escritor.finishWriting { fin.signal() }
fin.wait()
print("listo", destino, "cuadros", cuadros, escritor.status == .completed ? "ok" : "error \(String(describing: escritor.error))")
