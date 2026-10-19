// 查詢:索引 + 查詢條件 → 排好序的幹員清單與命中敘述。純函式。
import type {
  DataVersion,
  EffectType,
  IndexEntry,
  IndexKeyword,
  IndexOperator,
  IndexStage,
  IndexSummon,
  IndexText,
  QueryOptions,
  ResultEntry,
  ResultOperator,
  ResultStage,
  Run,
  SearchIndex,
  Server,
} from './types'
import { PROFESSION_LABELS, PROFESSIONS, type Profession, sortTypes } from './types'
import { DATA_SOURCES, type DataSource, prtsUrl, repoUrl } from './sources'

function moduleOf(stage: IndexStage, op: IndexOperator): { name: string; code: string } {
  const m = op.modules.find((m) => m.id === stage.module)
  return { name: m?.name ?? stage.module ?? '', code: m?.code ?? stage.module ?? '' }
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
 * - 台服模式:比對與顯示都用台服文字;台服沒有的階段不列出。模組3 只列台服已實裝的模組,文字取陸服。
 * - 陸服模式:比對用陸服文字;台服文字一致時顯示繁中,否則顯示簡中。
 */
function visibleStages(entry: IndexEntry, op: IndexOperator, server: Server): Visible[] {
  const out: Visible[] = []
  for (const stage of entry.stages) {
    if (stage.kind === 'module') {
      const inTw = !!op.modules.find((m) => m.id === stage.module)?.inTw
      if (server === 'tw' && !inTw) continue
      out.push({ stage, match: stage.cn, runs: stage.cn.runs, cnData: !inTw })
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
      return `模組3 · ${moduleOf(stage, op).code}`
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
      return `天賦${entry.no}`
    case 'trait':
      return '特性'
  }
}

function resultStage(v: Visible, visible: Visible[], op: IndexOperator, opts: QueryOptions): ResultStage {
  const effects: ResultStage['effects'] = {}
  for (const c of opts.conditions)
    if (v.match.hits[c.keyword]?.includes(c.type)) effects[c.keyword] = sortTypes([...(effects[c.keyword] ?? []), c.type])
  const result: ResultStage = { label: stageLabel(v.stage, visible, op), runs: v.runs, hit: Object.keys(effects).length > 0, effects }
  if (v.stage.kind === 'module') result.module = moduleOf(v.stage, op).name
  if (v.cnData) result.cnData = true
  return result
}

/** 某個伺服器模式下看得到的敘述:台服模式略過台服未實裝的幹員與召喚物。 */
function* visibleEntries(op: IndexOperator, server: Server): Generator<{ entry: IndexEntry; summon?: IndexSummon }> {
  if (server === 'tw' && !op.inTw) return
  for (const entry of op.entries) {
    const summon = entry.summon ? op.summons.find((s) => s.id === entry.summon) : undefined
    if (server === 'tw' && summon && !summon.inTw) continue
    yield { entry, summon }
  }
}

function resultOperator(op: IndexOperator, opts: QueryOptions): ResultOperator | undefined {
  const entries: ResultEntry[] = []
  for (const { entry, summon } of visibleEntries(op, opts.server)) {
    const visible = visibleStages(entry, op, opts.server)
    const stages = visible.map((v) => resultStage(v, visible, op, opts))
    if (!stages.some((s) => s.hit)) continue
    // 模組新增的天賦沒有無模組階段:補一個不存在的,讓介面看得出要裝模組才有
    if (entry.kind === 'talent' && !entry.stages.some((s) => s.kind === 'base')) stages.unshift({ label: '無模組', runs: [], hit: false, effects: {}, absent: true })
    const result: ResultEntry = { source: entrySource(entry), kind: entry.kind, stages }
    if (entry.name) result.name = entry.name
    if (entry.summon) result.summon = summon?.name ?? entry.summon
    entries.push(result)
  }
  // 搜尋條件一律 OR:有任一命中敘述就列入
  if (entries.length === 0) return undefined
  const result: ResultOperator = {
    id: op.id,
    name: op.name,
    rarity: op.rarity,
    profession: op.profession,
    subProfession: op.subProfession,
    prtsUrl: prtsUrl(op.prtsPage),
    entries: mergeSummonEntries(entries),
  }
  if (op.avatar) result.avatar = op.avatar
  return result
}

function passesFilters(op: IndexOperator, opts: QueryOptions): boolean {
  if (opts.rarities?.length && !opts.rarities.includes(op.rarity)) return false
  if (opts.professions?.length && !opts.professions.includes(op.profession)) return false
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
  if (opts.conditions.length === 0) return []
  const results: ResultOperator[] = []
  for (const op of [...index.operators].sort(compareOperators)) {
    if (!passesFilters(op, opts)) continue
    const r = resultOperator(op, opts)
    if (r) results.push(r)
  }
  return results
}

/**
 * 某關鍵字在某伺服器下有資料的效果類型(依 EFFECT_TYPES 順序),供 chip 的類型鈕反灰。
 * 只看關鍵字本身,不考慮篩選或其他搜尋條件;伺服器可見性與查詢一致。
 */
export function availableTypes(index: SearchIndex, server: Server, keyword: string): EffectType[] {
  const found: EffectType[] = []
  for (const hits of visibleHits(index, server)) found.push(...(hits[keyword] ?? []))
  return sortTypes(found)
}

/** 某個伺服器模式下看得到的每段敘述的命中;伺服器可見性與查詢一致。 */
function* visibleHits(index: SearchIndex, server: Server): Generator<IndexText['hits']> {
  for (const op of index.operators)
    for (const { entry } of visibleEntries(op, server)) for (const v of visibleStages(entry, op, server)) yield v.match.hits
}

/** 某個伺服器有幹員具有任一效果類型的關鍵字。 */
function keywordsWithData(index: SearchIndex, server: Server): Set<string> {
  const found = new Set<string>()
  for (const hits of visibleHits(index, server)) for (const [k, types] of Object.entries(hits)) if (types.length > 0) found.add(k)
  return found
}

/** 面板點選關鍵字時新 chip 預設亮的效果類型:該伺服器有資料的第一個(依 EFFECT_TYPES 順序);都沒有時為施加。 */
export function defaultType(index: SearchIndex, server: Server, keyword: string): EffectType {
  return availableTypes(index, server, keyword)[0] ?? 'apply'
}

export interface FilterOptions {
  rarities: number[]
  professions: { id: Profession; name: string }[]
}

/** 篩選列的選項:索引裡實際出現的星級與職業(遊戲內順序)。 */
export function filterOptions(index: SearchIndex): FilterOptions {
  const rarities = [...new Set(index.operators.map((o) => o.rarity))].sort((a, b) => b - a)
  const professions = PROFESSIONS.filter((p) => index.operators.some((o) => o.profession === p)).map((p) => ({ id: p, name: PROFESSION_LABELS[p] }))
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
  /** 每行從新的一行開始,順序就是面板順序。 */
  rows: PanelKeyword[][]
}

/**
 * 關鍵字面板:依索引的分組與行,列出該伺服器有幹員具有任一效果類型的關鍵字;拿掉後變空的行與分組不列。
 * 星級、職業篩選不影響面板。
 */
export function keywordGroups(index: SearchIndex, server: Server): PanelGroup[] {
  const withData = keywordsWithData(index, server)
  const keywords = new Map(index.keywords.map((k) => [k.id, k]))
  const panelKeyword = (k: IndexKeyword): PanelKeyword => ({ id: k.id, name: k.name, definition: k.definition, unofficial: k.kind === 'supplement' })
  return index.groups
    .map((g) => ({
      name: g.name,
      rows: g.rows
        .map((row) => row.filter((id) => withData.has(id)).map((id) => panelKeyword(keywords.get(id)!)))
        .filter((row) => row.length > 0),
    }))
    .filter((g) => g.rows.length > 0)
}

export interface FooterItem {
  /** 陸服、台服或頭像。 */
  label: string
  /** 伺服器資料的版號;頭像沒有。 */
  version?: string
  /** 伺服器資料的下載時間,台灣時間,例如「2026-10-19 12:14(UTC+8)」;頭像沒有。 */
  downloadedAt?: string
  source: { name: string; url: string }
}

/** 以台灣時間(UTC+8,沒有日光節約時間)顯示到分,不受執行環境的時區影響。 */
function taiwanTime(iso: string): string {
  const t = new Date(Date.parse(iso) + 8 * 3600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}(UTC+8)`
}

function serverItem(label: string, data: DataVersion, source: DataSource): FooterItem {
  return { label, version: data.version, downloadedAt: taiwanTime(data.downloadedAt), source: footerSource(source) }
}

function footerSource(source: DataSource): FooterItem['source'] {
  return { name: source.name, url: repoUrl(source) }
}

/** 頁尾:各伺服器的資料版本與資料來源,最後是頭像的資料來源。索引沒有台服資料時不列台服。 */
export function footerItems(index: SearchIndex): FooterItem[] {
  const items: FooterItem[] = [serverItem('陸服', index.versions.cn, DATA_SOURCES.cn)]
  if (index.versions.tw) items.push(serverItem('台服', index.versions.tw, DATA_SOURCES.tw))
  items.push({ label: '頭像', source: footerSource(DATA_SOURCES.avatar) })
  return items
}
