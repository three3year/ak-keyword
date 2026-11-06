import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { PROFESSION_LABELS, type SearchIndex } from '../src/core/types'

// 台服資料持續更新:簡中詞名會換成繁中、陸服限定的資料會變成兩服都有。
// 測試要的資料事實從索引推算,或由 cnOnly 自己造,不寫死現況。

const index: SearchIndex = JSON.parse(readFileSync('public/data/index.json', 'utf8'))

export function keywordName(id: string): string {
  const keyword = index.keywords.find((k) => k.id === id)
  if (!keyword) throw new Error(`索引沒有關鍵字 ${id}`)
  return keyword.name
}

/** 索引裡某分組第 row 行(從 0 起)的關鍵字名稱,即面板該行應有的文字。 */
export function groupRowNames(group: string, row: number): string[] {
  const found = index.groups.find((g) => g.name === group)
  if (!found) throw new Error(`索引沒有分組 ${group}`)
  return found.rows[row].map(keywordName)
}

export function twRenamedOperator(): { name: string; prtsPage: string; rarity: number; profession: string } {
  const op = index.operators.find((o) => o.inTw && o.name !== o.prtsPage)
  if (!op) throw new Error('索引沒有名字與 PRTS 頁名不同的台服幹員')
  return { name: op.name, prtsPage: op.prtsPage, rarity: op.rarity, profession: PROFESSION_LABELS[op.profession] }
}

/** 把帶有這個關鍵字的幹員都當成台服未實裝,讓它只有陸服有資料。要在 page.goto 之前呼叫。 */
export async function cnOnly(page: Page, keyword: string): Promise<void> {
  await page.route('**/data/index.json', async (route) => {
    const response = await route.fetch()
    const data: SearchIndex = await response.json()
    for (const op of data.operators) if (JSON.stringify(op).includes(`"${keyword}"`)) op.inTw = false
    await route.fulfill({ response, json: data })
  })
}
