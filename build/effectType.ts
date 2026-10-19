// 效果類型的句型規則:判定「一段敘述 × 一個關鍵字」是施加、利用、抵抗還是其他。
// 規則只是第一道判定,之後由維護者在 Claude Code session 裡讓 LLM 複核,結果寫進覆寫檔(見 docs/adr/0001)。
// 簡中與繁中都要能判定。
import type { EffectType, Run } from '../src/core/types'

const CLAUSE_END = /[，。；,;\n]/

/** 關鍵字前方同一子句內出現這些詞:不受該效果影響。 */
const RESIST_BEFORE = /(免疫|不会被|不會被|不受|无视|無視|抵抗|不会陷入|不會陷入|解除|驱散|驅散|移除|净化|淨化)/
/** 關鍵字後方緊接這些詞:減輕該效果。 */
const RESIST_AFTER = /^(的)?(持续时间|持續時間)(减少|減少|减半|減半|缩短|縮短|降低)/

/** 關鍵字前方緊接這些詞:對處於該效果的目標。 */
const EXPLOIT_BEFORE = /(对|對|攻击|攻擊|处于|處於|针对|針對|命中|若|如果|当|當)$/
/** 關鍵字後方緊接「(狀態)的敵人」之類:處於該效果的目標。 */
const EXPLOIT_AFTER = /^(状态|狀態)?(下|中)?(的|之)?(敌人|敵人|目标|目標|单位|單位|敌方|敵方)/

/** 關鍵字前方同一子句內出現這些詞:使目標陷入該效果。 */
const APPLY_BEFORE = /(使|令|将|將|把|造成|施加|附加|陷入|进入|進入|获得|獲得|赋予|賦予|给予|給予|附带|附帶|变为|變為|提供|产生|產生|生成|叠加|疊加)/
/** 關鍵字當動詞用:後方緊接時間或目標。 */
const APPLY_AFTER = /^(效果)?(\d|周围|周圍|范围|範圍|目标|目標|敌人|敵人|其|该|該|所有|全体|全體)/

const PRIORITY: EffectType[] = ['apply', 'exploit', 'resist', 'other']

function clauseBefore(text: string): string {
  const parts = text.split(CLAUSE_END)
  return parts[parts.length - 1]
}

function clauseAfter(text: string): string {
  return text.split(CLAUSE_END)[0]
}

function judge(before: string, after: string): EffectType {
  if (RESIST_BEFORE.test(before) || RESIST_AFTER.test(after)) return 'resist'
  if (EXPLOIT_BEFORE.test(before) || EXPLOIT_AFTER.test(after)) return 'exploit'
  if (APPLY_BEFORE.test(before) || APPLY_AFTER.test(after)) return 'apply'
  return 'other'
}

/** 敘述中每個關鍵字的效果類型;同一關鍵字出現多次時取最強的(施加 > 利用 > 抵抗 > 其他)。 */
export function ruleEffectTypes(runs: Run[]): Record<string, EffectType> {
  const result: Record<string, EffectType> = {}
  let before = ''
  runs.forEach((r, i) => {
    if (r.k) {
      const after = runs
        .slice(i + 1)
        .map((x) => x.t)
        .join('')
      const type = judge(clauseBefore(before), clauseAfter(after))
      const prev = result[r.k]
      if (!prev || PRIORITY.indexOf(type) < PRIORITY.indexOf(prev)) result[r.k] = type
    }
    before += r.t
  })
  return result
}
