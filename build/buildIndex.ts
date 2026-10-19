// 索引建置:原始遊戲資料 → 索引。純函式,不做任何 I/O。
//
// 每段敘述(技能、天賦、特性的某個階段)都由一個「產生器」對國服與台服各解析一次:
// 國服文字用於國服模式的比對;台服文字用於台服模式的比對與顯示,
// 並在術語、數值、補充關鍵字都和國服一致時,供國服模式改顯示繁中。
// 模組3 階段只有國服資料(台服資料庫沒有模組戰鬥資料)。
import { createHash } from 'node:crypto'
import type {
  DataVersion,
  EffectType,
  IndexEntry,
  IndexKeyword,
  IndexModule,
  IndexOperator,
  IndexStage,
  IndexSummon,
  IndexText,
  Profession,
  Run,
  SearchIndex,
  Server,
} from '../src/core/types'
import { PROFESSION_LABELS, PROFESSIONS } from '../src/core/types'
import { ruleEffectTypes, sortTypes } from './effectType'
import { withPotentialBonus } from './potential'
import type {
  RawCharacter,
  RawEquip,
  RawEquipPart,
  RawEquipTalentCandidate,
  RawEquipTraitCandidate,
  RawServer,
  RawSkill,
  RawSkillLevel,
  RawTalentCandidate,
  RawUnlockCondition,
} from './raw'
import { parseRichText, plainText, toValues } from './richText'
import { type SupplementMatcher, markSupplements } from './supplements'

function dataVersion(raw: RawServer): DataVersion {
  return { version: raw.gamedataConst.dataVersion ?? '', downloadedAt: raw.downloadedAt }
}

/** 維護者清單:關鍵字分組。沒列到的關鍵字歸到「未分組」。 */
export interface KeywordGroup {
  name: string
  keywords: string[]
}

/** 維護者清單:補充關鍵字。關鍵字 id 為 sup.<id>。 */
export interface SupplementKeyword {
  id: string
  name: string
  /** 簡中比對字串(國服文字)。 */
  cn: string[]
  /** 繁中比對字串(台服文字)。 */
  tw: string[]
  definition: string
  group: string
}

/** 效果類型覆寫檔:以「敘述文字雜湊:關鍵字」為鍵,建置時優先於規則判定。types 為空表示複核後判定沒有效果類型。 */
export type Overrides = Record<string, { types: EffectType[]; reviewed: boolean; note?: string }>

/** 覆寫檔的文字格式:依鍵排序、一筆一行,讓版控 diff 穩定好讀。 */
export function formatOverrides(overrides: Overrides): string {
  const lines = Object.entries(overrides)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  return `{\n${lines.join(',\n')}\n}\n`
}

/** 待複核的配對:雜湊還不在覆寫檔裡的「敘述 × 關鍵字」。 */
export interface PendingReview {
  key: string
  keyword: string
  /** 規則判定的效果類型;判定不出時為空清單。 */
  ruleTypes: EffectType[]
  text: string
  /** 這段敘述出現的位置,例如「char_002_amiya 技能1 m3」。 */
  where: string[]
}

export interface BuildInput {
  cn: RawServer
  tw?: RawServer
  groups?: KeywordGroup[]
  supplements?: SupplementKeyword[]
  overrides?: Overrides
}

export interface BuildOutput {
  index: SearchIndex
  warnings: string[]
  pending: PendingReview[]
}

const UNGROUPED = '未分組'

/** 一個模組在第3級對特性與天賦的改寫。 */
interface ModuleLevel3 {
  equip: RawEquip
  trait?: RawEquipTraitCandidate
  /** 天賦位置 → 改寫後的候選版本(各潛能);-1 為模組新增的天賦。 */
  talents: Map<number, RawEquipTalentCandidate[]>
}

/** 對某個伺服器產生一段敘述的 runs;該伺服器沒有這段敘述時回傳 undefined。 */
type Producer = (server: Server) => Run[] | undefined

class Builder {
  readonly warnings: string[] = []
  readonly warn = (message: string) => {
    this.warnings.push(message)
  }
  readonly pending = new Map<string, PendingReview>()
  readonly matchers: Record<Server, SupplementMatcher[]>

  constructor(readonly input: BuildInput) {
    const supplements = input.supplements ?? []
    this.matchers = {
      cn: supplements.map((s) => ({ id: supplementId(s), strings: s.cn })),
      tw: supplements.map((s) => ({ id: supplementId(s), strings: s.tw })),
    }
  }

  raw(server: Server): RawServer | undefined {
    return server === 'cn' ? this.input.cn : this.input.tw
  }

  /** 幹員、召喚物或職業形態(阿米婭)。 */
  char(server: Server, id: string): RawCharacter | undefined {
    const raw = this.raw(server)
    return raw?.characterTable[id] ?? raw?.charPatchTable?.patchChars[id]
  }

  build(): SearchIndex {
    const { cn, tw } = this.input
    const operators: IndexOperator[] = []
    // 阿米婭等有多個職業形態的幹員:每個形態各成一位幹員,名字後面標職業
    const forms = new Set(Object.values(cn.charPatchTable?.infos ?? {}).flatMap((i) => i.tmplIds))
    const chars = [...Object.entries(cn.characterTable), ...Object.entries(cn.charPatchTable?.patchChars ?? {})]
    for (const [id, char] of chars) {
      if (!isOperator(id, char)) continue
      const op = this.operator(id, char)
      if (forms.has(id)) op.name = `${op.name}(${PROFESSION_LABELS[op.profession]})`
      operators.push(op)
    }
    const versions: SearchIndex['versions'] = { cn: dataVersion(cn) }
    if (tw) versions.tw = dataVersion(tw)
    return {
      versions,
      groups: this.groups(),
      keywords: this.keywords(operators),
      subProfessions: this.subProfessions(operators),
      operators,
    }
  }

  /** 分支名稱優先用台服。 */
  subProfessions(operators: IndexOperator[]): SearchIndex['subProfessions'] {
    const out: SearchIndex['subProfessions'] = {}
    const twNames = this.input.tw?.uniequipTable?.subProfDict ?? {}
    const cnNames = this.input.cn.uniequipTable?.subProfDict ?? {}
    for (const op of operators) {
      const id = op.subProfession
      if (out[id]) continue
      out[id] = { name: twNames[id]?.subProfessionName ?? cnNames[id]?.subProfessionName ?? id, profession: op.profession }
    }
    return out
  }

  /**
   * 實裝順序:遊戲資料沒有可靠的實裝時間欄位,以潛能信物的排序編號近似
   * (同星級內依實裝先後遞增);沒有潛能信物的幹員視為最舊。
   */
  release(char: RawCharacter): number {
    const items = this.input.cn.itemTable?.items ?? {}
    const itemId = [char.potentialItemId, char.classicPotentialItemId, char.activityPotentialItemId].find((i) => i && items[i])
    return itemId ? items[itemId].sortId : 0
  }

  operator(id: string, char: RawCharacter): IndexOperator {
    const twChar = this.char('tw', id)
    const modules = this.modules(id)
    const entries: IndexEntry[] = []

    const trait = this.traitEntry(id, modules)
    if (trait) entries.push(trait)
    ;(char.talents ?? []).forEach((_, i) => {
      const entry = this.talentEntry(id, i, modules)
      if (entry) entries.push(entry)
    })
    const added = this.addedTalentEntry(id, (char.talents ?? []).length + 1, modules)
    if (added) entries.push(added)
    entries.push(...this.skillEntries(id))

    // 召喚物的天賦與技能歸到所屬幹員
    const summons: IndexSummon[] = []
    const displayOnly = new Set(Object.keys(char.displayTokenDict ?? {}))
    for (const summonId of summonIds(char)) {
      const summon = this.char('cn', summonId)
      if (!summon) {
        // 顯示用清單裡偶有只供顯示的 id(實際召喚物另有 id),不必警告
        if (!displayOnly.has(summonId)) this.warn(`幹員 ${id}:幹員表沒有召喚物 ${summonId}`)
        continue
      }
      const twSummon = this.char('tw', summonId)
      summons.push({ id: summonId, name: twSummon?.name ?? summon.name, inTw: !!twSummon })
      const summonEntries: IndexEntry[] = []
      ;(summon.talents ?? []).forEach((_, i) => {
        const entry = this.talentEntry(summonId, i, [])
        if (entry) summonEntries.push(entry)
      })
      summonEntries.push(...this.skillEntries(summonId))
      for (const e of summonEntries) entries.push({ ...e, summon: summonId })
    }

    const twEquips = this.input.tw?.uniequipTable?.equipDict ?? {}
    const indexModules: IndexModule[] = modules.map((m) => {
      const twEquip = twEquips[m.equip.uniEquipId]
      return { id: m.equip.uniEquipId, name: twEquip?.uniEquipName ?? m.equip.uniEquipName, code: m.equip.typeIcon.toUpperCase(), inTw: !!twEquip }
    })

    return {
      id,
      name: twChar?.name ?? char.name,
      rarity: Number(char.rarity.replace('TIER_', '')),
      profession: char.profession as Profession,
      subProfession: char.subProfessionId,
      release: this.release(char),
      inTw: !!twChar,
      modules: indexModules,
      summons,
      entries: entries.filter((e) => e.stages.some((st) => hasHits(st.cn) || (st.tw && hasHits(st.tw)))),
    }
  }

  // ---------- 技能 ----------

  skillEntries(ownerId: string): IndexEntry[] {
    const char = this.char('cn', ownerId)!
    const entries: IndexEntry[] = []
    char.skills.forEach((s, i) => {
      if (!s.skillId) return
      const skillId = s.skillId
      const skill = this.input.cn.skillTable[skillId]
      if (!skill) {
        this.warn(`${ownerId}:技能表沒有 ${skillId}`)
        return
      }
      const no = i + 1
      const stages: IndexStage[] = []
      for (const { kind, index } of skillStages(skill)) {
        const stage = this.stage({ kind }, `${ownerId} 技能${no} ${kind}`, (server) => {
          const level = this.raw(server)?.skillTable[skillId]?.levels[index]
          if (!level) return undefined
          return this.parse(level.description ?? '', skillValues(level), `${serverPrefix(server)}技能 ${skillId} ${kind}`)
        })
        if (!stage) continue
        if (kind === 'max') stage.level = index + 1
        stages.push(stage)
      }
      const name = this.input.tw?.skillTable[skillId]?.levels[0]?.name ?? skill.levels[0]?.name
      entries.push({ kind: 'skill', no, name, stages })
    })
    return entries
  }

  // ---------- 特性 ----------

  traitEntry(id: string, modules: ModuleLevel3[]): IndexEntry | undefined {
    const traitRuns = (server: Server) => {
      const char = this.char(server, id)
      if (!char) return undefined
      const top = [...(char.trait?.candidates ?? [])]
        .filter((c) => c.requiredPotentialRank === 0)
        .sort((a, b) => unlockOrder(b.unlockCondition) - unlockOrder(a.unlockCondition))[0]
      const raw = top?.overrideDescripton ?? char.description
      if (!raw) return undefined
      return this.parse(raw, toValues(top?.blackboard), `${serverPrefix(server)}幹員 ${id} 特性`)
    }
    const base = this.stage({ kind: 'base' }, `${id} 特性`, traitRuns)
    if (!base) return undefined
    const stages: IndexStage[] = [base]
    for (const m of modules) {
      const trait = m.trait
      if (!trait) continue
      const stage = this.stage({ kind: 'module', module: m.equip.uniEquipId }, `${id} 特性 模組3 ${m.equip.uniEquipId}`, (server) => {
        if (server !== 'cn') return undefined
        const where = `模組 ${m.equip.uniEquipId} 特性`
        const values = toValues(trait.blackboard)
        const runs = trait.overrideDescripton ? this.parse(trait.overrideDescripton, values, where) : [...(traitRuns('cn') ?? [])]
        if (trait.additionalDescription) runs.push({ t: '\n' }, ...this.parse(trait.additionalDescription, values, where))
        return runs
      })
      if (stage) stages.push(stage)
    }
    return { kind: 'trait', stages }
  }

  // ---------- 天賦 ----------

  talentEntry(id: string, index: number, modules: ModuleLevel3[]): IndexEntry | undefined {
    const no = index + 1
    const visible = (server: Server) =>
      (this.char(server, id)?.talents?.[index]?.candidates ?? []).filter((c) => !c.isHideTalent && c.description)
    const stages: IndexStage[] = []
    const base = this.stage({ kind: 'base' }, `${id} 天賦${no}`, (server) => {
      const candidates = visible(server)
      if (candidates.length === 0) return undefined
      return this.talentRuns(candidates, (c) => c.description!, `${serverPrefix(server)}幹員 ${id} 天賦${no}`)
    })
    if (base) stages.push(base)
    for (const m of modules) {
      const rewrite = m.talents.get(index)
      if (!rewrite) continue
      const stage = this.stage({ kind: 'module', module: m.equip.uniEquipId }, `${id} 天賦${no} 模組3 ${m.equip.uniEquipId}`, (server) =>
        server === 'cn' ? this.talentRuns(rewrite, (c) => c.upgradeDescription!, `模組 ${m.equip.uniEquipId} 天賦${no}`) : undefined,
      )
      if (stage) stages.push(stage)
    }
    if (stages.length === 0) return undefined
    const name = visible('tw')[0]?.name ?? visible('cn')[0]?.name ?? modules.map((m) => m.talents.get(index)?.[0].name).find(Boolean)
    return { kind: 'talent', no, name: name ?? undefined, stages }
  }

  /**
   * 模組新增的天賦:併成一段天賦,編號接續幹員原有天賦,每個新增天賦的模組各成一個模組3 階段。
   * 名稱取第一個模組的天賦名;各模組的天賦名不同時發警告。
   */
  addedTalentEntry(id: string, no: number, modules: ModuleLevel3[]): IndexEntry | undefined {
    const stages: IndexStage[] = []
    const names: string[] = []
    for (const m of modules) {
      const added = m.talents.get(-1)
      if (!added) continue
      const stage = this.stage({ kind: 'module', module: m.equip.uniEquipId }, `${id} 天賦${no} 模組3 ${m.equip.uniEquipId}`, (server) =>
        server === 'cn' ? this.talentRuns(added, (c) => c.upgradeDescription!, `模組 ${m.equip.uniEquipId} 新增天賦`) : undefined,
      )
      if (!stage) continue
      stages.push(stage)
      names.push(added[0].name ?? '')
    }
    if (stages.length === 0) return undefined
    const distinct = [...new Set(names)]
    if (distinct.length > 1) this.warn(`幹員 ${id}:各模組新增的天賦名稱不同(${distinct.join('、')}),只顯示第一個`)
    return { kind: 'talent', no, name: names[0] || undefined, stages }
  }

  /** 取最高解鎖條件(精英二)的潛能1 版本,並以高潛能版本補上「(+B)」。 */
  talentRuns<C extends RawTalentCandidate>(candidates: C[], textOf: (c: C) => string, where: string): Run[] {
    const top = Math.max(...candidates.map((c) => unlockOrder(c.unlockCondition)))
    const versions = candidates.filter((c) => unlockOrder(c.unlockCondition) === top).sort((a, b) => a.requiredPotentialRank - b.requiredPotentialRank)
    const parse = (c: C) => this.parse(textOf(c), toValues(c.blackboard), where)
    const [base, ...higher] = versions
    const baseRuns = parse(base)
    const merged = withPotentialBonus(
      baseRuns,
      higher.map((c) => ({ rank: c.requiredPotentialRank, runs: parse(c) })),
    )
    if (!merged) {
      this.warn(`${where}:潛能加成對不齊,只顯示潛能1 敘述:${textOf(versions[versions.length - 1])}`)
      return baseRuns
    }
    return merged
  }

  // ---------- 模組 ----------

  /** 幹員的進階模組,各取第3級對特性與天賦的改寫(只看幹員本身,不看召喚物)。 */
  modules(charId: string): ModuleLevel3[] {
    const { uniequipTable, battleEquipTable } = this.input.cn
    if (!uniequipTable || !battleEquipTable) return []
    const out: ModuleLevel3[] = []
    for (const equip of Object.values(uniequipTable.equipDict)) {
      if (equip.charId !== charId || equip.type !== 'ADVANCED') continue
      const level3 = battleEquipTable[equip.uniEquipId]?.phases.find((p) => p.equipLevel === 3)
      if (!level3) continue
      const parts = level3.parts.filter((p) => !p.isToken)
      out.push({ equip, trait: moduleTrait(parts), talents: moduleTalents(parts) })
    }
    return out
  }

  // ---------- 敘述文字 ----------

  parse(raw: string, values: Map<string, number | string>, where: string): Run[] {
    return parseRichText(raw, { values, where, warn: this.warn })
  }

  /** 以產生器分別產生國服與台服文字,組成一個階段。國服沒有這段敘述時回傳 undefined。 */
  stage(head: Pick<IndexStage, 'kind' | 'module'>, where: string, produce: Producer): IndexStage | undefined {
    const cnRuns = produce('cn')
    if (!cnRuns) return undefined
    const stage: IndexStage = { ...head, cn: this.finish(cnRuns, 'cn', where) }
    const twRuns = this.input.tw ? produce('tw') : undefined
    if (twRuns) {
      const marked = markSupplements(twRuns, this.matchers.tw)
      if (signature(marked) === signature(stage.cn.runs)) {
        // 與國服一致:沿用國服的效果類型,國服模式可改顯示繁中
        stage.tw = { runs: marked, hits: structuredClone(stage.cn.hits) }
        stage.twSame = true
      } else {
        stage.tw = this.finish(twRuns, 'tw', `${where}(台服)`)
      }
    }
    return stage
  }

  /**
   * 解析完成的 runs → 索引文字:標出補充關鍵字,判定每個關鍵字的效果類型
   * (覆寫檔優先,否則用規則判定,判定不出時為空清單;覆寫檔沒有的配對列入待複核清單)。
   */
  finish(parsed: Run[], server: Server, where: string): IndexText {
    const runs = markSupplements(parsed, this.matchers[server])
    const text = plainText(runs)
    const hash = textHash(text)
    const hits: IndexText['hits'] = {}
    for (const [keyword, ruleTypes] of Object.entries(ruleEffectTypes(runs))) {
      const key = `${hash}:${keyword}`
      const override = this.input.overrides?.[key]
      hits[keyword] = override ? sortTypes(override.types) : ruleTypes
      if (override) continue
      const pending = this.pending.get(key)
      if (pending) {
        if (!pending.where.includes(where)) pending.where.push(where)
      } else this.pending.set(key, { key, keyword, ruleTypes, text, where: [where] })
    }
    return { runs, hits }
  }

  // ---------- 關鍵字 ----------

  /** 分組順序:維護者分組清單,再加上補充關鍵字清單裡新出現的分組,最後是「未分組」。 */
  groups(): string[] {
    const names = (this.input.groups ?? []).map((g) => g.name)
    for (const s of this.input.supplements ?? []) if (!names.includes(s.group)) names.push(s.group)
    return [...names, UNGROUPED]
  }

  keywords(operators: IndexOperator[]): IndexKeyword[] {
    const used = new Set<string>()
    for (const op of operators)
      for (const e of op.entries)
        for (const st of e.stages) for (const k of [...Object.keys(st.cn.hits), ...Object.keys(st.tw?.hits ?? {})]) used.add(k)
    const cnTerms = this.input.cn.gamedataConst.termDescriptionDict
    const twTerms = this.input.tw?.gamedataConst.termDescriptionDict ?? {}
    const groupOf = new Map<string, string>()
    const order = new Map<string, number>()
    for (const g of this.input.groups ?? [])
      for (const k of g.keywords) {
        groupOf.set(k, g.name)
        order.set(k, order.size)
      }
    const terms = [...used]
      .filter((id) => !id.startsWith('sup.'))
      .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b))
    const keywords: IndexKeyword[] = []
    for (const s of this.input.supplements ?? [])
      keywords.push({ id: supplementId(s), name: s.name, kind: 'supplement', group: s.group, definition: [{ t: s.definition }] })
    for (const id of terms) {
      // 名稱與定義優先用台服
      const term = twTerms[id] ?? cnTerms[id]
      if (!term) this.warn(`術語字典沒有 ${id}`)
      keywords.push({
        id,
        name: term?.termName ?? id,
        kind: 'term',
        group: groupOf.get(id) ?? UNGROUPED,
        definition: term ? this.parse(term.description, new Map(), `術語 ${id} 定義`) : [],
      })
    }
    // 依分組順序排列;同一組內術語在前、補充關鍵字在後
    const groups = this.groups()
    const kindOrder = (k: IndexKeyword) => (k.kind === 'term' ? 0 : 1)
    return keywords
      .map((k, i) => ({ k, i }))
      .sort((a, b) => groups.indexOf(a.k.group) - groups.indexOf(b.k.group) || kindOrder(a.k) - kindOrder(b.k) || a.i - b.i)
      .map(({ k }) => k)
  }
}

/** 警告訊息裡標出台服的文字,方便和國服的同一段區分。 */
function serverPrefix(server: Server): string {
  return server === 'tw' ? '台服' : ''
}

function supplementId(s: SupplementKeyword): string {
  return `sup.${s.id}`
}

function isOperator(id: string, char: RawCharacter): boolean {
  return id.startsWith('char_') && (PROFESSIONS as readonly string[]).includes(char.profession) && !char.isNotObtainable
}

function hasHits(text: IndexText): boolean {
  return Object.keys(text.hits).length > 0
}

const PHASES: Record<string, number> = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 }

function unlockOrder(c: RawUnlockCondition): number {
  return (PHASES[c.phase] ?? 0) * 1000 + c.level
}

/** 幹員會部署或產生的召喚物:顯示用召喚物清單、技能指定的召喚物、天賦帶出的召喚物。 */
function summonIds(char: RawCharacter): string[] {
  const ids = new Set<string>(Object.keys(char.displayTokenDict ?? {}))
  for (const s of char.skills) if (s.overrideTokenKey) ids.add(s.overrideTokenKey)
  for (const t of char.talents ?? []) for (const c of t.candidates ?? []) if (c.tokenKey) ids.add(c.tokenKey)
  return [...ids]
}

function moduleTrait(parts: RawEquipPart[]): RawEquipTraitCandidate | undefined {
  for (const p of parts) {
    const c = (p.overrideTraitDataBundle?.candidates ?? []).find((c) => c.overrideDescripton || c.additionalDescription)
    if (c) return c
  }
  return undefined
}

function moduleTalents(parts: RawEquipPart[]): Map<number, RawEquipTalentCandidate[]> {
  const talents = new Map<number, RawEquipTalentCandidate[]>()
  for (const p of parts) {
    const candidates = (p.addOrOverrideTalentDataBundle?.candidates ?? []).filter((c) => c.upgradeDescription && !c.isHideTalent)
    if (candidates.length === 0 || talents.has(candidates[0].talentIndex)) continue
    talents.set(candidates[0].talentIndex, candidates)
  }
  return talents
}

/** 技能取等級7與專精3;沒有專精的技能只取最高等級。index 為 levels 的位置。 */
function skillStages(skill: RawSkill): { kind: IndexStage['kind']; index: number }[] {
  const n = skill.levels.length
  if (n >= 10) return [{ kind: 'lv7', index: 6 }, { kind: 'm3', index: 9 }]
  return [{ kind: 'max', index: n - 1 }]
}

function skillValues(level: RawSkillLevel) {
  return toValues(level.blackboard, { duration: level.duration ?? 0 })
}

const NUMBER = /\d+(?:\.\d+)?/g

/** 比較國服與台服文字是否「一致」:術語順序、數值、補充關鍵字都相同。 */
function signature(runs: Run[]): string {
  const terms = runs.filter((r) => r.k && !r.k.startsWith('sup.')).map((r) => r.k)
  const sups = [...new Set(runs.filter((r) => r.k?.startsWith('sup.')).map((r) => r.k))].sort()
  const numbers = plainText(runs).match(NUMBER) ?? []
  return JSON.stringify([terms, numbers, sups])
}

/** 敘述文字的雜湊:覆寫檔的鍵。文字一變,雜湊就變,配對就重新列入待複核。 */
function textHash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 16)
}

export function buildIndex(input: BuildInput): BuildOutput {
  const builder = new Builder(input)
  const index = builder.build()
  return { index, warnings: builder.warnings, pending: [...builder.pending.values()] }
}
