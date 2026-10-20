// 幹員頭像與技能圖示:建置時從公開的遊戲資源庫下載、壓縮成小圖,隨網頁部署。
// 原圖快取在 .cache/<種類>,壓縮後放 public/<種類>;已存在的檔案不重複處理。
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { DATA_SOURCES, rawBase } from '../src/core/sources'

const SOURCE = rawBase(DATA_SOURCES.images)

interface ImageJob {
  /** 輸出檔名(不含副檔名)。 */
  id: string
  /** 依序嘗試的原圖路徑(相對資源庫的資料夾,不含副檔名)。 */
  candidates: string[]
}

interface ImageKind {
  /** 快取與輸出的資料夾名,也是網頁上的路徑開頭。 */
  dir: string
  /** 輸出的邊長。 */
  size: number
  missing: (job: ImageJob) => string
}

/** 原圖在快取裡的位置:只取檔名。 */
function cachePath(cacheDir: string, candidate: string): string {
  return join(cacheDir, `${basename(candidate)}.png`)
}

async function fetchOriginal(cacheDir: string, candidate: string): Promise<string | undefined> {
  const path = cachePath(cacheDir, candidate)
  if (existsSync(path)) return path
  const res = await fetch(`${SOURCE}/${candidate.split('/').map(encodeURIComponent).join('/')}.png`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`圖片下載失敗 ${res.status}:${candidate}`)
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  return path
}

/**
 * 處理一批圖片,回傳 id → 網頁上的相對路徑。找不到原圖的不在結果裡,並產生警告。
 * offline 時只用已下載的原圖。
 */
async function prepareImages(
  kind: ImageKind,
  jobs: ImageJob[],
  opts: { root: string; offline: boolean; warn: (message: string) => void },
): Promise<Map<string, string>> {
  const cacheDir = join(opts.root, '.cache', kind.dir)
  const outDir = join(opts.root, 'public', kind.dir)
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
          const cached = cachePath(cacheDir, candidate)
          original = opts.offline ? (existsSync(cached) ? cached : undefined) : await fetchOriginal(cacheDir, candidate)
          if (original) break
        }
        if (!original) {
          opts.warn(kind.missing(job))
          continue
        }
        await sharp(original).resize(kind.size, kind.size, { fit: 'cover' }).webp({ quality: 72 }).toFile(out)
      }
      result.set(job.id, `${kind.dir}/${job.id}.webp`)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  return result
}

export interface AvatarJob {
  id: string
  /** 依序嘗試的頭像 id(例如阿米婭的醫療形態沒有專屬頭像時,改用預設形態)。 */
  candidates: string[]
}

/** 幹員 id → 頭像的相對路徑。 */
export function prepareAvatars(jobs: AvatarJob[], opts: { root: string; offline: boolean; warn: (message: string) => void }) {
  const kind: ImageKind = {
    dir: 'avatars',
    size: 80,
    missing: (job) => `幹員 ${job.id}:找不到頭像(${job.candidates.map((c) => c.slice('avatar/'.length)).join('、')}),顯示預留圖`,
  }
  return prepareImages(kind, jobs.map((j) => ({ id: j.id, candidates: j.candidates.map((c) => `avatar/${c}`) })), opts)
}

/**
 * 技能圖示(網頁上的相對路徑,例如 skill-icons/skchr_x_1.webp)→ 實際存在的那些。
 * 原圖檔名是 skill_icon_<iconId 或 skillId>.png;邊長約為幹員詳情顯示尺寸的兩倍。
 */
export async function prepareSkillIcons(
  icons: { path: string; iconId: string }[],
  opts: { root: string; offline: boolean; warn: (message: string) => void },
): Promise<Set<string>> {
  const kind: ImageKind = { dir: 'skill-icons', size: 112, missing: (job) => `技能圖示 ${job.id}:找不到原圖,顯示預留圖` }
  const id = (path: string) => path.slice('skill-icons/'.length, -'.webp'.length)
  const done = await prepareImages(kind, icons.map((i) => ({ id: id(i.path), candidates: [`skill/skill_icon_${i.iconId}`] })), opts)
  return new Set(done.values())
}
