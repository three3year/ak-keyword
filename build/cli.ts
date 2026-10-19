// 維護者在本機執行:抓國服與台服原始資料 → 建置索引 → 寫進 public/data/index.json。
//   npm run build-index            重新下載原始資料
//   npm run build-index:offline    沿用 .cache/raw 裡已下載的資料
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { prepareAvatars } from './avatars'
import { buildIndex, type KeywordGroup, type Overrides, type SupplementKeyword } from './buildIndex'
import type { RawServer } from './raw'
import { DATA_SOURCES, rawBase } from '../src/core/sources'

const ROOT = join(import.meta.dirname, '..')
const CACHE = join(ROOT, '.cache', 'raw')
const OUT_INDEX = join(ROOT, 'public', 'data', 'index.json')
const REVIEW_DIR = join(ROOT, 'review')

const SOURCES = {
  cn: {
    base: rawBase(DATA_SOURCES.cn),
    files: ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'battle_equip_table', 'char_patch_table', 'item_table'],
  },
  tw: {
    base: rawBase(DATA_SOURCES.tw),
    files: ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'char_patch_table'],
  },
} as const

type ServerKey = keyof typeof SOURCES

/** 快取裡記錄某個伺服器資料下載時間的檔案。 */
const DOWNLOADED_AT = 'downloaded_at.txt'

async function download(server: ServerKey, file: string): Promise<void> {
  const url = `${SOURCES[server].base}/${file}.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下載失敗 ${res.status}:${url}`)
  const path = join(CACHE, server, `${file}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  console.log(`已下載 ${server}/${file}.json`)
}

/** 下載某個伺服器的所有檔案,完成後在該服快取記下下載時間。 */
async function downloadServer(server: ServerKey): Promise<void> {
  await Promise.all(SOURCES[server].files.map((file) => download(server, file)))
  await writeFile(join(CACHE, server, DOWNLOADED_AT), new Date().toISOString())
}

/** 快取裡的下載時間;還沒有記錄的舊快取,以幹員表檔案的修改時間代替。 */
async function downloadedAt(server: ServerKey): Promise<string> {
  const record = join(CACHE, server, DOWNLOADED_AT)
  if (existsSync(record)) return (await readFile(record, 'utf8')).trim()
  return (await stat(join(CACHE, server, 'character_table.json'))).mtime.toISOString()
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function loadServer(server: ServerKey): Promise<RawServer> {
  const f = (name: string) => join(CACHE, server, `${name}.json`)
  const optional = async <T>(name: string): Promise<T | undefined> => (existsSync(f(name)) ? readJson<T>(f(name)) : undefined)
  return {
    characterTable: await readJson(f('character_table')),
    skillTable: await readJson(f('skill_table')),
    gamedataConst: await readJson(f('gamedata_const')),
    uniequipTable: await optional('uniequip_table'),
    battleEquipTable: await optional('battle_equip_table'),
    charPatchTable: await optional('char_patch_table'),
    itemTable: await optional('item_table'),
    downloadedAt: await downloadedAt(server),
  }
}

async function main() {
  const offline = process.argv.includes('--offline')
  if (!offline) await Promise.all((Object.keys(SOURCES) as ServerKey[]).map(downloadServer))

  const cn = await loadServer('cn')
  const tw = await loadServer('tw')
  const groups = await readJson<KeywordGroup[]>(join(ROOT, 'data', 'keyword-groups.json'))
  const overrides = await readJson<Overrides>(join(ROOT, 'data', 'effect-overrides.json'))
  const supplements = await readJson<SupplementKeyword[]>(join(ROOT, 'data', 'supplementary-keywords.json'))
  const excludedTerms = await readJson<string[]>(join(ROOT, 'data', 'excluded-terms.json'))
  const prtsPages = await readJson<Record<string, string>>(join(ROOT, 'data', 'prts-pages.json'))
  const { index, warnings, pending } = buildIndex({ cn, tw, groups, supplements, overrides, excludedTerms, prtsPages })

  // 頭像:職業形態(阿米婭)沒有專屬頭像時改用預設形態
  const formDefault = new Map<string, string>()
  for (const info of Object.values(cn.charPatchTable?.infos ?? {})) for (const id of info.tmplIds) formDefault.set(id, info.default)
  const avatars = await prepareAvatars(
    index.operators.map((o) => ({ id: o.id, candidates: [...new Set([o.id, formDefault.get(o.id) ?? o.id])] })),
    { root: ROOT, offline, warn: (m) => warnings.push(m) },
  )
  for (const op of index.operators) {
    const avatar = avatars.get(op.id)
    if (avatar) op.avatar = avatar
  }

  await mkdir(dirname(OUT_INDEX), { recursive: true })
  const json = JSON.stringify(index)
  await writeFile(OUT_INDEX, json)
  console.log(`索引:${index.operators.length} 位幹員、${index.keywords.length} 個關鍵字,${(json.length / 1024).toFixed(0)} KB`)

  await mkdir(REVIEW_DIR, { recursive: true })
  await writeFile(join(REVIEW_DIR, 'build-warnings.txt'), warnings.join('\n') + '\n')
  await writeFile(join(REVIEW_DIR, 'pending-review.json'), JSON.stringify(pending, null, 1))
  console.log(`待複核:${pending.length} 個配對(review/pending-review.json)`)
  if (warnings.length > 0) {
    console.warn(`⚠ ${warnings.length} 則警告(全文見 review/build-warnings.txt),前 10 則:`)
    for (const w of warnings.slice(0, 10)) console.warn('  ' + w)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
