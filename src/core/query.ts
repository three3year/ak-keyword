// 查詢:索引 + 查詢條件 → 排好序的幹員清單與命中敘述。純函式。
import type {
  DataVersion,
  DetailEntry,
  DetailTab,
  EffectType,
  IndexEntry,
  IndexKeyword,
  IndexOperator,
  IndexStage,
  IndexSummon,
  IndexText,
  OperatorDetail,
  OperatorFile,
  QueryOptions,
  ResultEntry,
  ResultOperator,
  ResultStage,
  Run,
  SearchIndex,
  Server,
  SkillStats,
} from './types'
import { PROFESSION_LABELS, PROFESSIONS, type Profession, SP_TYPE_LABELS, sortTypes, TRIGGER_LABELS } from './types'
import { DATA_SOURCES, type DataSource, prtsUrl, repoUrl } from './sources'

/** 敘述所屬的幹員:索引裡的幹員或幹員檔,兩者都帶模組、召喚物與敘述。 */
type Owner = Pick<IndexOperator, 'inTw' | 'modules' | 'summons' | 'entries'>

function moduleOf(stage: IndexStage, op: Owner): { name: string; code: string } {
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
  /** 模組3 階段的模組台服未實裝,而幹員本身台服已有。 */
  twUnreleased: boolean
}

/**
 * 依伺服器挑出看得到的階段:
 * - 台服模式:比對與顯示都用台服文字;台服沒有的階段不列出。模組3 只列台服已實裝的模組,文字取陸服。
 * - 陸服模式:比對用陸服文字;台服文字一致時顯示繁中,否則顯示簡中。
 *   台服已有的幹員身上台服未實裝的模組標「台服未實裝」;幹員本身台服未實裝時卡頭已經標了,模組不再標。
 */
function visibleStages(entry: IndexEntry, op: Owner, server: Server): Visible[] {
  const out: Visible[] = []
  for (const stage of entry.stages) {
    if (stage.kind === 'module') {
      const inTw = !!op.modules.find((m) => m.id === stage.module)?.inTw
      if (server === 'tw' && !inTw) continue
      out.push({ stage, match: stage.cn, runs: stage.cn.runs, twUnreleased: op.inTw && !inTw })
    } else if (server === 'tw') {
      if (stage.tw) out.push({ stage, match: stage.tw, runs: stage.tw.runs, twUnreleased: false })
    } else {
      out.push({ stage, match: stage.cn, runs: stage.twSame && stage.tw ? stage.tw.runs : stage.cn.runs, twUnreleased: false })
    }
  }
  return out
}

function stageLabel(stage: IndexStage, visible: Visible[], op: Owner): string {
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

function resultStage(v: Visible, visible: Visible[], op: Owner, opts: Pick<QueryOptions, 'conditions' | 'server'>): ResultStage {
  const effects: ResultStage['effects'] = {}
  for (const c of opts.conditions)
    if (v.match.hits[c.keyword]?.includes(c.type)) effects[c.keyword] = sortTypes([...(effects[c.keyword] ?? []), c.type])
  const result: ResultStage = { label: stageLabel(v.stage, visible, op), runs: v.runs, hit: Object.keys(effects).length > 0, effects }
  if (v.stage.kind === 'module') result.module = moduleOf(v.stage, op).name
  if (v.twUnreleased) result.twUnreleased = true
  if (v.stage.stats) result.stats = (opts.server === 'tw' && v.stage.stats.tw) || v.stage.stats.cn
  return result
}

/** 某個伺服器模式下看得到的敘述:台服模式略過台服未實裝的幹員與召喚物。 */
function* visibleEntries(op: Owner, server: Server): Generator<{ entry: IndexEntry; summon?: IndexSummon }> {
  if (server === 'tw' && !op.inTw) return
  for (const entry of op.entries) {
    const summon = entry.summon ? op.summons.find((s) => s.id === entry.summon) : undefined
    if (server === 'tw' && summon && !summon.inTw) continue
    yield { entry, summon }
  }
}

/** 模組新增的天賦沒有無模組階段:補一個不存在的,讓介面看得出要裝模組才有。 */
function withAbsentBase(entry: IndexEntry, stages: ResultStage[]): ResultStage[] {
  if (entry.kind !== 'talent' || entry.stages.some((s) => s.kind === 'base')) return stages
  return [{ label: '無模組', runs: [], hit: false, effects: {}, absent: true }, ...stages]
}

/** 分支名稱:優先用索引的分支名,沒有時用分支 id。結果卡卡頭與特性名稱共用。 */
export function branchName(index: SearchIndex, op: Pick<IndexOperator, 'subProfession'>): string {
  return index.subProfessions[op.subProfession]?.name ?? op.subProfession
}

/** 特性沒有自己的名稱,以分支名稱為名。 */
function resultEntry(entry: IndexEntry, summon: IndexSummon | undefined, stages: ResultStage[], branch: string): ResultEntry {
  const result: ResultEntry = { source: entrySource(entry), kind: entry.kind, stages }
  const name = entry.kind === 'trait' ? branch : entry.name
  if (name) result.name = name
  if (entry.summon) result.summon = summon?.name ?? entry.summon
  if (entry.icon) result.icon = entry.icon
  return result
}

function resultOperator(op: IndexOperator, branch: string, opts: QueryOptions): ResultOperator | undefined {
  const entries: ResultEntry[] = []
  for (const { entry, summon } of visibleEntries(op, opts.server)) {
    const visible = visibleStages(entry, op, opts.server)
    const stages = visible.map((v) => resultStage(v, visible, op, opts))
    if (!stages.some((s) => s.hit)) continue
    entries.push(resultEntry(entry, summon, withAbsentBase(entry, stages), branch))
  }
  // 搜尋條件一律 OR:有任一命中敘述就列入;沒有搜尋條件(只有職業條件)時全部列入,命中敘述為空
  if (entries.length === 0 && opts.conditions.length > 0) return undefined
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
  // 台服模式不會走到這裡(台服未實裝的幹員已在 query 略過),條件寫明只有陸服模式才標
  if (opts.server === 'cn' && !op.inTw) result.twUnreleased = true
  return result
}

function passesFilters(op: IndexOperator, opts: QueryOptions): boolean {
  if (opts.rarities?.length && !opts.rarities.includes(op.rarity)) return false
  if (opts.professions?.length && !opts.professions.includes(op.profession)) return false
  return true
}

/** 星級高到低,再依職業、分支(都是遊戲內順序),最後實裝新到舊。 */
function compareOperators(index: SearchIndex): (a: IndexOperator, b: IndexOperator) => number {
  const branch = (op: IndexOperator) => index.subProfessions[op.subProfession]?.order ?? Infinity
  return (a, b) =>
    b.rarity - a.rarity ||
    PROFESSIONS.indexOf(a.profession) - PROFESSIONS.indexOf(b.profession) ||
    // 兩邊都沒有分支順序時是 NaN,視同相等
    branch(a) - branch(b) ||
    b.release - a.release
}

/** 幾個召喚物(例如同一召喚物的不同型態)有完全相同的敘述(含技能圖示與技力)時,合併成一筆並列出所有召喚物名。 */
function mergeSummonEntries(entries: ResultEntry[]): ResultEntry[] {
  const out: ResultEntry[] = []
  const seen = new Map<string, ResultEntry>()
  for (const e of entries) {
    if (!e.summon) {
      out.push(e)
      continue
    }
    const key = JSON.stringify([e.source, e.name, e.icon, e.stages.map((s) => [s.label, s.runs, s.effects, s.stats])])
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

/** 幹員詳情的階段:命中的關鍵字標上高亮。 */
function detailStage(stage: ResultStage): ResultStage {
  if (!stage.hit) return stage
  return { ...stage, runs: stage.runs.map((r) => (r.k && stage.effects[r.k] ? { ...r, h: true } : r)) }
}

/**
 * 幹員詳情:幹員檔裡在這個伺服器看得到的全部敘述。幹員本身每段敘述一個分頁(特性、天賦、技能,依幹員檔的順序),
 * 帶出召喚物的分頁接著列出那些召喚物的天賦與技能;對應不到分頁的召喚物接在最後一個分頁。
 * 階段的標籤、命中、效果類型與「台服未實裝」規則同結果卡,但所有存在的階段都列出,預設停在第一個存在的階段。
 */
export function operatorDetail(file: OperatorFile, opts: Pick<QueryOptions, 'conditions' | 'server'> & { branchName: string }): OperatorDetail {
  // own:這個分頁的幹員本身那段敘述,召喚物依它的技能或天賦編號對應分頁
  const tabs: { own: IndexEntry; label: string; entries: ResultEntry[] }[] = []
  const summoned: { from: IndexSummon['from']; entry: ResultEntry }[] = []
  for (const { entry, summon } of visibleEntries(file, opts.server)) {
    const visible = visibleStages(entry, file, opts.server)
    if (visible.length === 0) continue
    const stages = visible.map((v) => detailStage(resultStage(v, visible, file, opts)))
    const result = resultEntry(entry, summon, withAbsentBase(entry, stages), opts.branchName)
    if (entry.summon) summoned.push({ from: summon?.from ?? [], entry: result })
    else tabs.push({ own: entry, label: result.source, entries: [result] })
  }
  // 幹員檔裡每個召喚物的天賦在技能之前,依序接上就是「召喚物天賦、召喚物技能」
  for (const { from, entry } of summoned) {
    const targets = tabs.filter((t) => from.some((f) => f.kind === t.own.kind && f.no === t.own.no))
    for (const t of targets.length > 0 ? targets : tabs.slice(-1)) t.entries.push(entry)
  }
  const withDefault = (e: ResultEntry): DetailEntry => ({ ...e, defaultStage: Math.max(0, e.stages.findIndex((s) => !s.absent)) })
  return { tabs: tabs.map((t): DetailTab => ({ kind: t.own.kind, label: t.label, entries: mergeSummonEntries(t.entries).map(withDefault) })), defaultTab: 0 }
}

/** 有搜尋條件或職業條件其中一種就開始搜尋;只有星級篩選不算。 */
export function startsSearch(opts: Pick<QueryOptions, 'conditions' | 'professions'>): boolean {
  return opts.conditions.length > 0 || !!opts.professions?.length
}

export function query(index: SearchIndex, opts: QueryOptions): ResultOperator[] {
  if (!startsSearch(opts)) return []
  const results: ResultOperator[] = []
  for (const op of [...index.operators].sort(compareOperators(index))) {
    // 台服模式略過台服未實裝的幹員;只有職業條件時不會因為沒有命中敘述而被濾掉,要在這裡擋
    if (opts.server === 'tw' && !op.inTw) continue
    if (!passesFilters(op, opts)) continue
    const r = resultOperator(op, branchName(index, op), opts)
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

/** 技能頭部的文字欄位:回復類型、觸發方式、初始技力、所需技力、持續、充能、彈藥;被動技能只有「被動」。 */
export function skillFacts(stats: SkillStats): string[] {
  if (stats.trigger === 'passive') return [TRIGGER_LABELS.passive]
  const facts: string[] = []
  if (stats.sp) facts.push(SP_TYPE_LABELS[stats.sp.type])
  facts.push(TRIGGER_LABELS[stats.trigger])
  if (stats.sp) facts.push(`初始技力 ${stats.sp.init}`, `所需技力 ${stats.sp.cost}`)
  if (stats.duration) facts.push(`持續 ${stats.duration} 秒`)
  if (stats.charges) facts.push(`充能 ${stats.charges} 次`)
  if (stats.ammo) facts.push('彈藥')
  return facts
}

/** 技能圖示疊字的完整意思,供螢幕閱讀器與懸停。 */
export function spLabel(sp: NonNullable<SkillStats['sp']>): string {
  return `${SP_TYPE_LABELS[sp.type]},初始技力 ${sp.init},所需技力 ${sp.cost}`
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
 * 星級篩選、職業條件不影響面板。
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
  /** 陸服、台服或頭像與圖示。 */
  label: string
  /** 伺服器資料的版號;圖片沒有。 */
  version?: string
  /** 伺服器資料的下載時間,台灣時間,例如「2026-10-19 12:14(UTC+8)」;圖片沒有。 */
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

/** 頁尾:各伺服器的資料版本與資料來源,最後是頭像與技能圖示的資料來源。索引沒有台服資料時不列台服。 */
export function footerItems(index: SearchIndex): FooterItem[] {
  const items: FooterItem[] = [serverItem('陸服', index.versions.cn, DATA_SOURCES.cn)]
  if (index.versions.tw) items.push(serverItem('台服', index.versions.tw, DATA_SOURCES.tw))
  items.push({ label: '頭像與圖示', source: footerSource(DATA_SOURCES.images) })
  return items
}
