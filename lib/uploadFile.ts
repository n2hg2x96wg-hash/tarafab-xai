'use client'

// Shared rules for the files a client uploads: deposit receipts and identity
// documents.
//
// Phone photos are routinely 4-8 MB, and the request body a serverless
// function can accept is smaller than that, so a large upload is cut off by
// the platform before our route ever runs. The browser then sees a failed
// fetch and reports it as "could not reach the server", which hides the real
// cause. Shrinking the image here keeps the request well inside that limit,
// makes the upload fast on mobile data, and leaves the receipt perfectly
// readable.
//
// PDFs cannot be re-encoded in the browser, so they are only size-checked.

export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

// Server and bucket both accept 5 MB. We stay below the platform's request
// limit so a file that reaches our route is never dropped in transit.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const TARGET_BYTES = 1_200_000
const MAX_EDGE = 1600

export function isAllowedUpload(file: File) {
  return ALLOWED_UPLOAD_TYPES.includes(file.type)
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')) }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// Returns a file ready to upload. An image larger than the target is scaled
// down and re-encoded as JPEG; anything else is returned unchanged. If the
// browser cannot do the conversion, the original file is used and the normal
// size check still applies.
export async function prepareUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= TARGET_BYTES) return file
  try {
    const img = await loadImage(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    let blob: Blob | null = null
    for (const quality of [0.82, 0.7, 0.6, 0.5]) {
      blob = await toBlob(canvas, quality)
      if (blob && blob.size <= TARGET_BYTES) break
    }
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

export function prettySize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
