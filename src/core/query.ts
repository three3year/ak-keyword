// 查詢:索引 + 查詢條件 → 排好序的幹員清單與命中敘述。純函式。
import type {
  IndexEntry,
  IndexOperator,
  IndexStage,
  QueryOptions,
  ResultEntry,
  ResultOperator,
  ResultStage,
  SearchIndex,
} from './types'

function stageLabel(stage: IndexStage): string {
  switch (stage.kind) {
    case 'lv7':
      return '等級7'
    case 'm3':
      return '專精3'
    case 'max':
      return `等級${stage.level ?? ''}`
    case 'base':
      return '無模組'
    case 'module':
      return '模組3'
  }
}

function entrySource(entry: IndexEntry): string {
  switch (entry.kind) {
    case 'skill':
      return `技能${entry.no}`
    case 'talent':
      return `天賦${entry.no ?? ''}`
    case 'trait':
      return '特性'
  }
}

function resultStage(stage: IndexStage, opts: QueryOptions): ResultStage {
  const text = stage.cn
  const effects: ResultStage['effects'] = {}
  for (const k of opts.keywords) {
    const type = text.hits[k]
    if (type && (!opts.effectTypes || opts.effectTypes.includes(type))) effects[k] = type
  }
  return { label: stageLabel(stage), runs: text.runs, hit: Object.keys(effects).length > 0, effects }
}

function onlyLabel(stages: ResultStage[]): string | undefined {
  const hit = stages.filter((s) => s.hit)
  if (hit.length === 0 || hit.length === stages.length) return undefined
  return `僅${hit.map((s) => s.label).join('、')}`
}

function resultOperator(op: IndexOperator, opts: QueryOptions): ResultOperator | undefined {
  const entries: ResultEntry[] = []
  const found = new Set<string>()
  for (const entry of op.entries) {
    const stages = entry.stages.map((st) => resultStage(st, opts))
    if (!stages.some((s) => s.hit)) continue
    for (const s of stages) for (const k of Object.keys(s.effects)) found.add(k)
    const result: ResultEntry = { source: entrySource(entry), stages }
    if (entry.name) result.name = entry.name
    const only = onlyLabel(stages)
    if (only) result.only = only
    entries.push(result)
  }
  if (!opts.keywords.every((k) => found.has(k))) return undefined
  const result: ResultOperator = {
    id: op.id,
    name: op.name,
    rarity: op.rarity,
    profession: op.profession,
    subProfession: op.subProfession,
    entries,
  }
  if (op.avatar) result.avatar = op.avatar
  return result
}

export function query(index: SearchIndex, opts: QueryOptions): ResultOperator[] {
  if (opts.keywords.length === 0) return []
  const results: ResultOperator[] = []
  for (const op of index.operators) {
    const r = resultOperator(op, opts)
    if (r) results.push(r)
  }
  return results
}
