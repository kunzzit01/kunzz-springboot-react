/**
 * 图片上传前处理（2026-10-23 抽出，task 2026-10-23-comphoto-upload-fix）
 *
 * 背景：后端没有 HEIC 解码能力，也无法把手机原图压小；Spring multipart 早期只允许 1MB。
 *       所以上传前在浏览器里统一做三件事：
 *         1) HEIC/HEIF → JPEG（Chrome/Edge/Firefox 都不能直接显示 HEIC）
 *         2) 长边超过 maxEdge 的等比缩小
 *         3) 体积超过 compressOver 的重新编码为 JPEG（默认 q0.88，透明底补白）
 *
 * 用法：
 *   const { file, compressed } = await prepareImage(raw, { maxEdge: 1920 })
 *   await uploadApi(file)
 *
 * 失败语义：
 *   - 不是图片 / 是 GIF / SVG：原样返回（GIF 走 canvas 会掉帧，SVG 是矢量）
 *   - 原图 > maxRawSize：抛 ImagePrepError('too-large')
 *   - HEIC 转不动：抛 ImagePrepError('heic-failed')
 *   - 其它解码失败（少见）：原样返回，交给后端/接口报错，不阻塞上传
 */

export interface ImagePrepOptions {
  /** 长边上限，超过就等比缩小。默认 2560 */
  maxEdge?: number
  /** 超过这个字节数才重编码（小于它且没超长边就不动）。默认 2MB */
  compressOver?: number
  /** JPEG 质量，0-1。默认 0.88 */
  quality?: number
  /** 原文件大小上限，超过直接抛 too-large。默认 60MB */
  maxRawSize?: number
  /** 是否把 HEIC/HEIF 转成 JPEG。默认 true */
  convertHeic?: boolean
}

export interface PreparedImage {
  file: File
  /** 是否做过转换/压缩（用于提示「已压缩」） */
  compressed: boolean
  originalSize: number
}

export type ImagePrepErrorCode = 'too-large' | 'heic-failed'

export class ImagePrepError extends Error {
  readonly code: ImagePrepErrorCode
  constructor(code: ImagePrepErrorCode, message: string) {
    super(message)
    this.name = 'ImagePrepError'
    this.code = code
  }
}

const DEFAULTS = {
  maxEdge: 2560,
  compressOver: 2 * 1024 * 1024,
  quality: 0.88,
  maxRawSize: 60 * 1024 * 1024,
  convertHeic: true,
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i

/** 是否是 HEIC/HEIF（按扩展名或 MIME） */
export function isHeicFile(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type)
}

/** 是否是需要处理的位图（GIF/SVG 会被排除在压缩之外，但仍算图片） */
export function isImageFile(file: File): boolean {
  return /^image\//.test(file.type) || IMAGE_EXT.test(file.name)
}

/** 可以安全走 canvas 重编码的类型（GIF 会掉帧，SVG 是矢量，都不动） */
function isRasterFile(file: File): boolean {
  if (/gif/i.test(file.type) || /\.gif$/i.test(file.name)) return false
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) return false
  return isImageFile(file)
}

export function formatMB(bytes: number): string {
  return (bytes / 1048576).toFixed(2) + 'MB'
}

/** HEIC/HEIF → JPEG（heic2any 是动态 import，普通上传不会加载那 1.3MB chunk） */
async function heicToJpeg(file: File, quality: number): Promise<File> {
  try {
    const mod: any = await import('heic2any')
    const convert = mod.default ?? mod
    const out = await convert({ blob: file, toType: 'image/jpeg', quality })
    const blob: Blob = Array.isArray(out) ? out[0] : out
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
  } catch {
    throw new ImagePrepError('heic-failed', 'HEIC 转换失败，请把手机相机设成「兼容性最佳 / 最兼容」后再拍，或先转成 JPG 上传')
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')) }
    img.src = url
  })
}

/** 等比缩小 + 重编码为 JPEG */
async function resizeToJpeg(file: File, maxEdge: number, quality: number): Promise<File> {
  const img = await loadImage(file)
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
  canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  // JPEG 没有透明通道：不补白底，透明 PNG 会变成黑底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/**
 * 上传前的统一图片处理。非图片文件原样返回（视频/PDF 等直接过）。
 * @throws ImagePrepError
 */
export async function prepareImage(raw: File, options: ImagePrepOptions = {}): Promise<PreparedImage> {
  const opts = { ...DEFAULTS, ...options }
  const originalSize = raw.size

  if (raw.size > opts.maxRawSize) {
    throw new ImagePrepError('too-large', `图片太大了（超过 ${Math.round(opts.maxRawSize / 1048576)}MB），请先压缩后再上传`)
  }
  if (!isRasterFile(raw)) {
    return { file: raw, compressed: false, originalSize }
  }

  let file = raw
  let compressed = false

  if (opts.convertHeic && isHeicFile(raw)) {
    file = await heicToJpeg(raw, Math.max(opts.quality, 0.9))
    compressed = true
  }

  try {
    const img = await loadImage(file)
    const tooBig = Math.max(img.naturalWidth || 0, img.naturalHeight || 0) > opts.maxEdge
    const tooHeavy = file.size > opts.compressOver
    if (tooBig || tooHeavy) {
      const out = await resizeToJpeg(file, opts.maxEdge, opts.quality)
      if (out !== file) {
        file = out
        compressed = true
      }
    }
  } catch {
    // 解码失败（少见格式）：原样上传，不阻塞
  }

  return { file, compressed, originalSize }
}
