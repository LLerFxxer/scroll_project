export function dataURLToBuffer(dataURL: string): Buffer {
  const base64 = dataURL.split(',')[1] ?? ''
  return Buffer.from(base64, 'base64')
}

export function bufferToDataURL(buffer: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

// Crop dataURL by rect (used in overlay)
export async function cropDataURL(
  dataURL: string,
  rect: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = rect.width
      canvas.height = rect.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas context null'))
      ctx.drawImage(img, -rect.x, -rect.y)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataURL
  })
}
