// 建置警告與已知警告清單 data/known-warnings.json 的比對,以及兩者在磁碟上的位置。
// 建置指令(build/cli.ts)寫出比對結果,build/acceptWarnings.ts 據以更新已知警告清單。
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

export const KNOWN_WARNINGS = join(ROOT, 'data', 'known-warnings.json')
/** 已知警告清單裡沒有的警告。 */
export const NEW_WARNINGS = join(ROOT, 'review', 'new-warnings.json')
/** 已知警告清單裡有、這次沒出現的警告。 */
export const RESOLVED_WARNINGS = join(ROOT, 'review', 'resolved-warnings.json')

/** 以全文比對(一字不差才算同一則),分出新警告與已消失的已知警告。 */
export function diffWarnings(warnings: string[], known: string[]): { newWarnings: string[]; resolvedWarnings: string[] } {
  const current = new Set(warnings)
  const knownSet = new Set(known)
  return {
    newWarnings: warnings.filter((w) => !knownSet.has(w)),
    resolvedWarnings: known.filter((w) => !current.has(w)),
  }
}
