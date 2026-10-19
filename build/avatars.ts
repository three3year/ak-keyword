// 幹員頭像:建置時從公開的遊戲資源庫下載、壓縮成小圖,隨網頁部署。
// 原圖快取在 .cache/avatars,壓縮後放 public/avatars;已存在的檔案不重複處理。
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const SOURCE = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar'
const SIZE = 80

export interface AvatarJob {
  id: string
  /** 依序嘗試的頭像 id(例如阿米婭的醫療形態沒有專屬頭像時,改用預設形態)。 */
  candidates: string[]
}

async function fetchOriginal(cacheDir: string, avatarId: string): Promise<string | undefined> {
  const path = join(cacheDir, `${avatarId}.png`)
  if (existsSync(path)) return path
  const res = await fetch(`${SOURCE}/${avatarId}.png`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`頭像下載失敗 ${res.status}:${avatarId}`)
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  return path
}

/**
 * 處理所有幹員的頭像,回傳 幹員 id → 網頁上的相對路徑。找不到頭像的幹員不在結果裡,並產生警告。
 * offline 時只用已下載的原圖。
 */
export async function prepareAvatars(
  jobs: AvatarJob[],
  opts: { root: string; offline: boolean; warn: (message: string) => void },
): Promise<Map<string, string>> {
  const cacheDir = join(opts.root, '.cache', 'avatars')
  const outDir = join(opts.root, 'public', 'avatars')
  await mkdir(cacheDir, { recursive: true })
  await mkdir(outDir, { recursive: true })

  const result = new Map<string, string>()
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      const out = join(outDir, `${job.id}.webp`)
      if (!existsSync(out)) {
        let original: string | undefined
        for (const candidate of job.candidates) {
          original = opts.offline
            ? existsSync(join(cacheDir, `${candidate}.png`))
              ? join(cacheDir, `${candidate}.png`)
              : undefined
            : await fetchOriginal(cacheDir, candidate)
          if (original) break
        }
        if (!original) {
          opts.warn(`幹員 ${job.id}:找不到頭像(${job.candidates.join('、')}),顯示預留圖`)
          continue
        }
        await sharp(original).resize(SIZE, SIZE, { fit: 'cover' }).webp({ quality: 72 }).toFile(out)
      }
      result.set(job.id, `avatars/${job.id}.webp`)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return result
}
