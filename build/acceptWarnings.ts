// 把已知警告清單 data/known-warnings.json 改成最近一次建置的全部警告:
// 加入新警告(review/new-warnings.json)、移除已消失的已知警告(review/resolved-warnings.json)。
//   npm run accept-warnings
// 維護者確認新警告都是上游問題後,緊接在建置之後執行。
import { readFile, writeFile } from 'node:fs/promises'
import { KNOWN_WARNINGS, NEW_WARNINGS, RESOLVED_WARNINGS } from './warnings'

async function readList(path: string): Promise<string[]> {
  return JSON.parse(await readFile(path, 'utf8')) as string[]
}

async function main() {
  const known = await readList(KNOWN_WARNINGS)
  const added = await readList(NEW_WARNINGS)
  const resolved = new Set(await readList(RESOLVED_WARNINGS))
  const next = [...new Set([...known.filter((w) => !resolved.has(w)), ...added])]
  await writeFile(KNOWN_WARNINGS, JSON.stringify(next, null, 2) + '\n')
  console.log(`已知警告:加入 ${added.length} 則、移除 ${resolved.size} 則,共 ${next.length} 則`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
