// 查詢:索引 + 查詢條件 → 排好序的幹員清單與命中敘述。純函式。
import type {
  IndexEntry,
  IndexKeyword,
  IndexOperator,
  IndexStage,
  IndexText,
  QueryOptions,
  ResultEntry,
  ResultOperator,
  ResultStage,
  Run,
  SearchIndex,
  Server,
} from './types'
import { PROFESSION_LABELS, PROFESSIONS, type Profession } from './types'
import { DATA_SOURCES, type DataSource, repoUrl } from './sources'

function moduleName(stage: IndexStage, op: IndexOperator): string {
  return op.modules.find((m) => m.id === stage.module)?.name ?? stage.module ?? ''
}

/** 某個伺服器模式下看得到的一個階段:比對用的文字與顯示用的文字。 */
interface Visible {
  stage: IndexStage
  /** 比對用(命中與效果類型)。 */
  match: IndexText
  /** 顯示用。 */
  runs: Run[]
  cnData: boolean
}

/**
 * 依伺服器挑出看得到的階段:
 * - 台服模式:比對與顯示都用台服文字;台服沒有的階段不列出。模組3 只列台服已實裝的模組,文字取國服。
 * - 國服模式:比對用國服文字;台服文字一致時顯示繁中,否則顯示簡中。
 */
function visibleStages(entry: IndexEntry, op: IndexOperator, server: Server): Visible[] {
  const out: Visible[] = []
  for (const stage of entry.stages) {
    if (stage.kind === 'module') {
      if (server === 'tw' && !op.modules.find((m) => m.id === stage.module)?.inTw) continue
      out.push({ stage, match: stage.cn, runs: stage.cn.runs, cnData: true })
    } else if (server === 'tw') {
      if (stage.tw) out.push({ stage, match: stage.tw, runs: stage.tw.runs, cnData: false })
    } else {
      out.push({ stage, match: stage.cn, runs: stage.twSame && stage.tw ? stage.tw.runs : stage.cn.runs, cnData: false })
    }
  }
  return out
}

function stageLabel(stage: IndexStage, visible: Visible[], op: IndexOperator): string {
  switch (stage.kind) {
    case 'lv7':
      return '等級7'
    case 'm3':
      return '專精3'
    case 'max':
      return `等級${stage.level ?? ''}`
    case 'base':
      // 沒有模組階段可對照時,不需要標「無模組」
      return visible.some((v) => v.stage.kind === 'module') ? '無模組' : ''
    case 'module':
      return `模組3 · ${moduleName(stage, op)}`
  }
}

function entrySource(entry: IndexEntry): string {
  return (entry.summon ? '召喚物' : '') + baseSource(entry)
}

function baseSource(entry: IndexEntry): string {
  switch (entry.kind) {
    case 'skill':
      return `技能${entry.no}`
    case 'talent':
      return entry.no ? `天賦${entry.no}` : '模組天賦'
    case 'trait':
      return '特性'
  }
}

function resultStage(v: Visible, visible: Visible[], op: IndexOperator, opts: QueryOptions): ResultStage {
  const effects: ResultStage['effects'] = {}
  for (const k of opts.keywords) {
    const type = v.match.hits[k]
    if (type && (!opts.effectTypes || opts.effectTypes.includes(type))) effects[k] = type
  }
  const result: ResultStage = { label: stageLabel(v.stage, visible, op), runs: v.runs, hit: Object.keys(effects).length > 0, effects }
  if (v.stage.kind === 'module') result.module = moduleName(v.stage, op)
  if (v.cnData) result.cnData = true
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
  if (opts.server === 'tw' && !op.inTw) return undefined
  const entries: ResultEntry[] = []
  const found = new Set<string>()
  for (const entry of op.entries) {
    const summon = entry.summon ? op.summons.find((s) => s.id === entry.summon) : undefined
    if (opts.server === 'tw' && summon && !summon.inTw) continue
    const visible = visibleStages(entry, op, opts.server)
    const stages = visible.map((v) => resultStage(v, visible, op, opts))
    if (!stages.some((s) => s.hit)) continue
    for (const s of stages) for (const k of Object.keys(s.effects)) found.add(k)
    const result: ResultEntry = { source: entrySource(entry), stages }
    if (entry.name) result.name = entry.name
    if (entry.summon) result.summon = summon?.name ?? entry.summon
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
    entries: mergeSummonEntries(entries),
  }
  if (op.avatar) result.avatar = op.avatar
  return result
}

function passesFilters(op: IndexOperator, opts: QueryOptions): boolean {
  if (opts.rarities?.length && !opts.rarities.includes(op.rarity)) return false
  if (opts.professions?.length && !opts.professions.includes(op.profession)) return false
  if (opts.subProfessions?.length && !opts.subProfessions.includes(op.subProfession)) return false
  return true
}

/** 星級高到低,再依職業(遊戲內順序),最後實裝新到舊。 */
function compareOperators(a: IndexOperator, b: IndexOperator): number {
  return b.rarity - a.rarity || PROFESSIONS.indexOf(a.profession) - PROFESSIONS.indexOf(b.profession) || b.release - a.release
}

/** 幾個召喚物(例如同一召喚物的不同型態)有完全相同的命中敘述時,合併成一筆並列出所有召喚物名。 */
function mergeSummonEntries(entries: ResultEntry[]): ResultEntry[] {
  const out: ResultEntry[] = []
  const seen = new Map<string, ResultEntry>()
  for (const e of entries) {
    if (!e.summon) {
      out.push(e)
      continue
    }
    const key = JSON.stringify([e.source, e.name, e.stages.map((s) => [s.label, s.runs, s.effects])])
    const prev = seen.get(key)
    if (prev) prev.summon = `${prev.summon}、${e.summon}`
    else {
      const copy = { ...e }
      seen.set(key, copy)
      out.push(copy)
    }
  }
  return out
}

export function query(index: SearchIndex, opts: QueryOptions): ResultOperator[] {
  if (opts.keywords.length === 0) return []
  const results: ResultOperator[] = []
  for (const op of [...index.operators].sort(compareOperators)) {
    if (!passesFilters(op, opts)) continue
    const r = resultOperator(op, opts)
    if (r) results.push(r)
  }
  return results
}

export interface FilterOptions {
  rarities: number[]
  professions: { id: Profession; name: string; branches: { id: string; name: string }[] }[]
}

/** 篩選列的選項:索引裡實際出現的星級、職業(遊戲內順序)與分支。 */
export function filterOptions(index: SearchIndex): FilterOptions {
  const rarities = [...new Set(index.operators.map((o) => o.rarity))].sort((a, b) => b - a)
  const professions = PROFESSIONS.filter((p) => index.operators.some((o) => o.profession === p)).map((p) => {
    const branches = [...new Set(index.operators.filter((o) => o.profession === p).map((o) => o.subProfession))]
      .map((id) => ({ id, name: index.subProfessions[id]?.name ?? id }))
    return { id: p, name: PROFESSION_LABELS[p], branches }
  })
  return { rarities, professions }
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

export interface FooterItem {
  /** 國服、台服或頭像。 */
  label: string
  /** 伺服器資料的版號;頭像沒有。 */
  version?: string
  source: { name: string; url: string }
}

function footerSource(source: DataSource): FooterItem['source'] {
  return { name: source.name, url: repoUrl(source) }
}

/** 頁尾:各伺服器的資料版本與資料來源,最後是頭像的資料來源。索引沒有台服資料時不列台服。 */
export function footerItems(index: SearchIndex): FooterItem[] {
  const items: FooterItem[] = [{ label: '國服', version: index.versions.cn, source: footerSource(DATA_SOURCES.cn) }]
  if (index.versions.tw !== undefined) items.push({ label: '台服', version: index.versions.tw, source: footerSource(DATA_SOURCES.tw) })
  items.push({ label: '頭像', source: footerSource(DATA_SOURCES.avatar) })
  return items
}
