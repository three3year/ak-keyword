// 效果類型的句型規則:判定「一段敘述 × 一個關鍵字」是施加、利用還是反制(可同時多種)。
// 規則只是第一道判定,之後由維護者在 Claude Code session 裡讓 LLM 複核,結果寫進覆寫檔(見 docs/adr/0001、0002)。
// 判定不出就不給類型(不會成為命中敘述,等複核)。簡中與繁中都要能判定。
import { EFFECT_TYPES, type EffectType, type Run } from '../src/core/types'

const CLAUSE_END = /[，。；,;\n]/

/** 關鍵字前方同一子句內出現這些詞:不受該效果影響,或無視敵人的該效果。 */
const COUNTER_BEFORE = /(免疫|不会被|不會被|不受|无视|無視|抵抗|不会陷入|不會陷入|解除|驱散|驅散|移除|净化|淨化)/
/** 關鍵字後方緊接這些詞:減輕該效果,或使敵人的該效果失效。 */
const COUNTER_AFTER = /^((的)?(持续时间|持續時間)(减少|減少|减半|減半|缩短|縮短|降低)|(效果)?失效)/

/** 關鍵字前方緊接這些詞:對處於該效果的目標。 */
const EXPLOIT_BEFORE = /(对|對|攻击|攻擊|处于|處於|针对|針對|命中|若|如果|当|當)$/
/**
 * 關鍵字後方緊接「(狀態)的敵人」之類:處於該效果的目標;或緊接「後」:該效果發生後。
 * 關鍵字直接接「敵人」(例如「晕眩敌人」)是動詞用法,屬施加,不算。
 */
const EXPLOIT_AFTER = /^((状态|狀態|下|中|的|之)+(敌人|敵人|目标|目標|单位|單位|敌方|敵方)|后|後)/

/** 關鍵字前方同一子句內出現這些詞:使目標陷入該效果。 */
const APPLY_BEFORE = /(使|令|将|將|把|造成|施加|附加|陷入|进入|進入|获得|獲得|赋予|賦予|给予|給予|附带|附帶|变为|變為|提供|产生|產生|生成|叠加|疊加)/
/** 關鍵字當動詞用:後方緊接時間或目標。 */
const APPLY_AFTER = /^(效果)?(\d|周围|周圍|范围|範圍|目标|目標|敌人|敵人|其|该|該|所有|全体|全體)/

function clauseBefore(text: string): string {
  const parts = text.split(CLAUSE_END)
  return parts[parts.length - 1]
}

function clauseAfter(text: string): string {
  return text.split(CLAUSE_END)[0]
}

/** 一次出現的效果類型;沒有句型命中時為 undefined。 */
function judge(before: string, after: string): EffectType | undefined {
  if (COUNTER_BEFORE.test(before) || COUNTER_AFTER.test(after)) return 'counter'
  if (EXPLOIT_BEFORE.test(before) || EXPLOIT_AFTER.test(after)) return 'exploit'
  if (APPLY_BEFORE.test(before) || APPLY_AFTER.test(after)) return 'apply'
  return undefined
}

/**
 * 敘述中每個關鍵字的效果類型:每次出現各自判定,取聯集(依 EFFECT_TYPES 順序)。
 * 沒有句型命中的出現不貢獻類型;所有出現都判定不出的關鍵字對應空清單。
 */
export function ruleEffectTypes(runs: Run[]): Record<string, EffectType[]> {
  const found: Record<string, Set<EffectType>> = {}
  let before = ''
  runs.forEach((r, i) => {
    if (r.k) {
      const after = runs
        .slice(i + 1)
        .map((x) => x.t)
        .join('')
      const type = judge(clauseBefore(before), clauseAfter(after))
      found[r.k] ??= new Set()
      if (type) found[r.k].add(type)
    }
    before += r.t
  })
  return Object.fromEntries(Object.entries(found).map(([k, types]) => [k, sortTypes(types)]))
}

/** 去重並依 EFFECT_TYPES 順序排列。 */
export function sortTypes(types: Iterable<EffectType>): EffectType[] {
  const set = new Set(types)
  return EFFECT_TYPES.filter((t) => set.has(t))
}
