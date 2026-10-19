// 查詢:索引 + 查詢條件 → 排好序的幹員清單與命中敘述。純函式。
import type {
  IndexEntry,
  IndexKeyword,
  IndexOperator,
  IndexStage,
  QueryOptions,
  ResultEntry,
  ResultOperator,
  ResultStage,
  SearchIndex,
} from './types'

function moduleName(stage: IndexStage, op: IndexOperator): string {
  return op.modules.find((m) => m.id === stage.module)?.name ?? stage.module ?? ''
}

function stageLabel(stage: IndexStage, entry: IndexEntry, op: IndexOperator): string {
  switch (stage.kind) {
    case 'lv7':
      return '等級7'
    case 'm3':
      return '專精3'
    case 'max':
      return `等級${stage.level ?? ''}`
    case 'base':
      // 沒有模組階段可對照時,不需要標「無模組」
      return entry.stages.some((s) => s.kind === 'module') ? '無模組' : ''
    case 'module':
      return `模組3 · ${moduleName(stage, op)}`
  }
}

function entrySource(entry: IndexEntry): string {
  switch (entry.kind) {
    case 'skill':
      return `技能${entry.no}`
    case 'talent':
      return entry.no ? `天賦${entry.no}` : '模組天賦'
    case 'trait':
      return '特性'
  }
}

function resultStage(stage: IndexStage, entry: IndexEntry, op: IndexOperator, opts: QueryOptions): ResultStage {
  const text = stage.cn
  const effects: ResultStage['effects'] = {}
  for (const k of opts.keywords) {
    const type = text.hits[k]
    if (type && (!opts.effectTypes || opts.effectTypes.includes(type))) effects[k] = type
  }
  const result: ResultStage = { label: stageLabel(stage, entry, op), runs: text.runs, hit: Object.keys(effects).length > 0, effects }
  if (stage.kind === 'module') {
    result.module = moduleName(stage, op)
    result.cnData = true
  }
  return result
}

function onlyLabel(stages: ResultStage[]): string | undefined {
  const hit = stages.filter((s) => s.hit)
  if (hit.length === 0) return undefined
  // 只有模組3 才有(包括模組新增的天賦):標出要裝哪個模組
  if (hit.every((s) => s.module)) return `僅模組3(${hit.map((s) => s.module).join('、')})`
  if (hit.length === stages.length || stages.some((s) => s.module)) return undefined
  return `僅${hit.map((s) => s.label).join('、')}`
}

function resultOperator(op: IndexOperator, opts: QueryOptions): ResultOperator | undefined {
  const entries: ResultEntry[] = []
  const found = new Set<string>()
  for (const entry of op.entries) {
    const stages = entry.stages.map((st) => resultStage(st, entry, op, opts))
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

export interface PanelKeyword {
  id: string
  name: string
  definition: IndexKeyword['definition']
  /** 補充關鍵字的定義由維護者撰寫,不是官方定義。 */
  unofficial: boolean
}

export interface PanelGroup {
  name: string
  keywords: PanelKeyword[]
}

/** 關鍵字面板:依分組列出名稱含有 filter 的關鍵字,略過空的分組。 */
export function keywordGroups(index: SearchIndex, filter: string): PanelGroup[] {
  const needle = filter.trim().toLowerCase()
  const groups = new Map<string, PanelKeyword[]>(index.groups.map((g) => [g, []]))
  for (const k of index.keywords) {
    if (needle && !k.name.toLowerCase().includes(needle)) continue
    if (!groups.has(k.group)) groups.set(k.group, [])
    groups.get(k.group)!.push({ id: k.id, name: k.name, definition: k.definition, unofficial: k.kind === 'supplement' })
  }
  return [...groups].filter(([, ks]) => ks.length > 0).map(([name, keywords]) => ({ name, keywords }))
}
