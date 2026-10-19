// 維護者在本機執行:抓國服與台服原始資料 → 建置索引 → 寫進 public/data/index.json。
//   npm run build-index            重新下載原始資料
//   npm run build-index:offline    沿用 .cache/raw 裡已下載的資料
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildIndex, type KeywordGroup, type Overrides, type SupplementKeyword } from './buildIndex'
import type { RawServer } from './raw'

const ROOT = join(import.meta.dirname, '..')
const CACHE = join(ROOT, '.cache', 'raw')
const OUT_INDEX = join(ROOT, 'public', 'data', 'index.json')
const REVIEW_DIR = join(ROOT, 'review')

const SOURCES = {
  cn: {
    base: 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel',
    files: ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'battle_equip_table', 'char_patch_table', 'item_table'],
  },
  tw: {
    base: 'https://raw.githubusercontent.com/arkntools/arknights-data-tw-for-maa/main',
    files: ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'char_patch_table'],
  },
} as const

type ServerKey = keyof typeof SOURCES

async function download(server: ServerKey, file: string): Promise<void> {
  const url = `${SOURCES[server].base}/${file}.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下載失敗 ${res.status}:${url}`)
  const path = join(CACHE, server, `${file}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  console.log(`已下載 ${server}/${file}.json`)
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
  }
}

async function main() {
  const offline = process.argv.includes('--offline')
  if (!offline) {
    const jobs: Promise<void>[] = []
    for (const server of Object.keys(SOURCES) as ServerKey[])
      for (const file of SOURCES[server].files) jobs.push(download(server, file))
    await Promise.all(jobs)
  }

  const cn = await loadServer('cn')
  const groups = await readJson<KeywordGroup[]>(join(ROOT, 'data', 'keyword-groups.json'))
  const overrides = await readJson<Overrides>(join(ROOT, 'data', 'effect-overrides.json'))
  const supplements = await readJson<SupplementKeyword[]>(join(ROOT, 'data', 'supplementary-keywords.json'))
  const { index, warnings, pending } = buildIndex({ cn, groups, supplements, overrides })

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
