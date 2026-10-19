// 把 LLM 複核(或維護者手動判定)的結果寫回覆寫檔 data/effect-overrides.json。
//   npx tsx build/applyReview.ts review/decisions/*.json
// 每個輸入檔是 [{ "key": "<雜湊>:<關鍵字>", "type": "apply" | "exploit" | "resist" | "other", "note"?: "…" }]。
// 已存在的鍵會被新的判定取代。
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Overrides } from './buildIndex'
import { EFFECT_TYPES, type EffectType } from '../src/core/types'

interface Decision {
  key: string
  type: EffectType
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
      if (!EFFECT_TYPES.includes(d.type)) throw new Error(`${file}:效果類型錯誤 ${d.key} → ${d.type}`)
      overrides[d.key] = d.note ? { type: d.type, reviewed: true, note: d.note } : { type: d.type, reviewed: true }
      count++
    }
  }
  // 依鍵排序,讓版控 diff 穩定
  const sorted = Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(OVERRIDES, JSON.stringify(sorted, null, 1) + '\n')
  console.log(`已寫入 ${count} 筆判定,覆寫檔共 ${Object.keys(sorted).length} 筆`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
