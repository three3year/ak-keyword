// 把 LLM 複核(或維護者手動判定)的結果寫回覆寫檔 data/effect-overrides.json。
//   npx tsx build/applyReview.ts review/decisions/*.json
// 每個輸入檔是 [{ "key": "<雜湊>:<關鍵字>", "types": ["apply" | "exploit" | "counter", …], "note"?: "…" }]。
// types 可有多種;空清單表示這段敘述對該關鍵字沒有效果類型(例如補充關鍵字誤中)。
// 已存在的鍵會被新的判定取代。
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Overrides, formatOverrides } from './buildIndex'
import { EFFECT_TYPES, type EffectType, sortTypes } from '../src/core/types'

interface Decision {
  key: string
  types: EffectType[]
  note?: string
}

const OVERRIDES = join(import.meta.dirname, '..', 'data', 'effect-overrides.json')

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) throw new Error('用法:npx tsx build/applyReview.ts <判定檔.json> …')
  const overrides = JSON.parse(await readFile(OVERRIDES, 'utf8')) as Overrides
  let count = 0
  for (const file of files) {
    const decisions = JSON.parse(await readFile(file, 'utf8')) as Decision[]
    for (const d of decisions) {
      if (!/^[0-9a-f]{16}:.+$/.test(d.key)) throw new Error(`${file}:鍵格式錯誤 ${d.key}`)
      if (!Array.isArray(d.types) || !d.types.every((t) => EFFECT_TYPES.includes(t)))
        throw new Error(`${file}:效果類型錯誤 ${d.key} → ${JSON.stringify(d.types)}`)
      const types = sortTypes(d.types)
      overrides[d.key] = d.note ? { types, reviewed: true, note: d.note } : { types, reviewed: true }
      count++
    }
  }
  await writeFile(OVERRIDES, formatOverrides(overrides))
  console.log(`已寫入 ${count} 筆判定,覆寫檔共 ${Object.keys(overrides).length} 筆`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
