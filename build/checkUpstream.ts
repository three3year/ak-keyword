// 維護者在本機執行:比對國服、台服上游的資料版本與目前索引(public/data/index.json)。
//   npm run check-upstream
// 只下載兩服含資料版號的 gamedata_const.json。最後一行是「結果:已是最新」或「結果:有新版(…)」。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RawGamedataConst } from './raw'
import { compareVersions } from './upstream'
import { DATA_SOURCES, rawBase } from '../src/core/sources'
import type { SearchIndex, Server } from '../src/core/types'

const INDEX = join(import.meta.dirname, '..', 'public', 'data', 'index.json')
const LABELS: Record<Server, string> = { cn: '國服', tw: '台服' }

async function upstreamVersion(server: Server): Promise<string> {
  const url = `${rawBase(DATA_SOURCES[server])}/gamedata_const.json`
  const res = await fetch(url).catch((err: unknown) => {
    throw new Error(`${LABELS[server]}上游版號下載失敗:${url}`, { cause: err })
  })
  if (!res.ok) throw new Error(`${LABELS[server]}上游版號下載失敗 ${res.status}:${url}`)
  const version = ((await res.json()) as RawGamedataConst).dataVersion
  if (!version) throw new Error(`${LABELS[server]}上游資料沒有版號:${url}`)
  return version
}

async function main() {
  const index = JSON.parse(await readFile(INDEX, 'utf8')) as SearchIndex
  const [cn, tw] = await Promise.all([upstreamVersion('cn'), upstreamVersion('tw')])
  const statuses = compareVersions({ cn: index.versions.cn.version, tw: index.versions.tw?.version }, { cn, tw })
  for (const s of statuses)
    console.log(`${LABELS[s.server]}:索引 ${s.current ?? '(無)'},上游 ${s.upstream},${s.updated ? '有新版' : '已是最新'}`)
  const updated = statuses.filter((s) => s.updated).map((s) => LABELS[s.server])
  console.log(updated.length > 0 ? `結果:有新版(${updated.join('、')})` : '結果:已是最新')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
