import sharp from 'sharp'
import { check, GameError } from './game.mjs'
export const PHOTO_BUCKET = 'secret-angel-photos'
export async function cleanPhoto(dataUrl) {
  check(typeof dataUrl === 'string' && dataUrl.length <= 2800000, '사진은 2MB 이하로 준비해 주세요.', 413)
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  check(match, 'JPG·PNG·WebP 사진을 선택해 주세요.')
  const bytes = Buffer.from(match[2], 'base64')
  check(bytes.length <= 2 * 1024 * 1024, '사진은 2MB 이하로 준비해 주세요.', 413)
  try {
    // Re-encoding strips EXIF/GPS and prevents trusting client MIME or file names.
    const image = sharp(bytes, { limitInputPixels: 25000000, animated: false })
    const metadata = await image.metadata()
    check(['jpeg', 'png', 'webp'].includes(metadata.format), '지원되는 사진 형식이 아닙니다.')
    return await image.rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  } catch { throw new GameError('사진을 읽을 수 없습니다. JPG·PNG·WebP 사진으로 다시 시도해 주세요.') }
}
