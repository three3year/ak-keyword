// 索引建置:原始遊戲資料 → 索引。純函式,不做任何 I/O。
import { createHash } from 'node:crypto'
import type {
  EffectType,
  IndexEntry,
  IndexKeyword,
  IndexOperator,
  IndexStage,
  IndexSummon,
  IndexText,
  Profession,
  Run,
  SearchIndex,
} from '../src/core/types'
import { PROFESSION_LABELS, PROFESSIONS } from '../src/core/types'
import { ruleEffectTypes } from './effectType'
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

/** 維護者清單:關鍵字分組。沒列到的關鍵字歸到「未分組」。 */
export interface KeywordGroup {
  name: string
  keywords: string[]
}

/** 效果類型覆寫檔:以「敘述文字雜湊:關鍵字」為鍵,建置時優先於規則判定。 */
export type Overrides = Record<string, { type: EffectType; reviewed: boolean; note?: string }>

/** 待複核的配對:雜湊還不在覆寫檔裡的「敘述 × 關鍵字」。 */
export interface PendingReview {
  key: string
  keyword: string
  ruleType: EffectType
  text: string
  /** 這段敘述出現的位置,例如「char_002_amiya 技能1 專精3」。 */
  where: string[]
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

export interface BuildInput {
  cn: RawServer
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

class Builder {
  readonly warnings: string[] = []
  readonly warn = (message: string) => {
    this.warnings.push(message)
  }
  readonly pending = new Map<string, PendingReview>()
  readonly matchers: { cn: SupplementMatcher[]; tw: SupplementMatcher[] }

  constructor(readonly input: BuildInput) {
    const supplements = input.supplements ?? []
    this.matchers = {
      cn: supplements.map((s) => ({ id: supplementId(s), strings: s.cn })),
      tw: supplements.map((s) => ({ id: supplementId(s), strings: s.tw })),
    }
  }

  build(): SearchIndex {
    const { cn } = this.input
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
    return {
      versions: { cn: cn.gamedataConst.dataVersion ?? '' },
      groups: this.groups(),
      keywords: this.keywords(operators),
      subProfessions: {},
      operators,
    }
  }

  operator(id: string, char: RawCharacter): IndexOperator {
    const modules = this.modules(id)
    const entries: IndexEntry[] = []
    const trait = this.traitEntry(id, char, modules)
    if (trait) entries.push(trait)
    ;(char.talents ?? []).forEach((t, i) => {
      const entry = this.talentEntry(id, t.candidates ?? [], i, modules)
      if (entry) entries.push(entry)
    })
    for (const m of modules) {
      const added = m.talents.get(-1)
      if (!added) continue
      const runs = this.talentRuns(added, (c) => c.upgradeDescription!, `模組 ${m.equip.uniEquipId} 新增天賦`)
      const cn = this.finish(runs, `${id} 模組天賦 ${m.equip.uniEquipId}`)
      entries.push({ kind: 'talent', name: added[0].name ?? undefined, stages: [{ kind: 'module', module: m.equip.uniEquipId, cn }] })
    }
    entries.push(...this.skillEntries(id, char))

    // 召喚物的天賦與技能歸到所屬幹員
    const summons: IndexSummon[] = []
    for (const tokenId of summonIds(char)) {
      const token = this.input.cn.characterTable[tokenId]
      if (!token) {
        this.warn(`幹員 ${id}:幹員表沒有召喚物 ${tokenId}`)
        continue
      }
      summons.push({ id: tokenId, name: token.name, inTw: false })
      const tokenEntries: IndexEntry[] = []
      ;(token.talents ?? []).forEach((t, i) => {
        const entry = this.talentEntry(tokenId, t.candidates ?? [], i, [])
        if (entry) tokenEntries.push(entry)
      })
      tokenEntries.push(...this.skillEntries(tokenId, token))
      for (const e of tokenEntries) entries.push({ ...e, summon: tokenId })
    }
    return {
      id,
      name: char.name,
      rarity: Number(char.rarity.replace('TIER_', '')),
      profession: char.profession as Profession,
      subProfession: char.subProfessionId,
      release: 0,
      inTw: false,
      modules: modules.map((m) => ({ id: m.equip.uniEquipId, name: m.equip.uniEquipName, code: m.equip.typeIcon.toUpperCase(), inTw: false })),
      summons,
      entries: entries.filter((e) => e.stages.some((st) => Object.keys(st.cn.hits).length > 0)),
    }
  }

  skillEntries(ownerId: string, char: RawCharacter): IndexEntry[] {
    const entries: IndexEntry[] = []
    char.skills.forEach((s, i) => {
      if (!s.skillId) return
      const skill = this.input.cn.skillTable[s.skillId]
      if (!skill) {
        this.warn(`${ownerId}:技能表沒有 ${s.skillId}`)
        return
      }
      entries.push(this.skillEntry(ownerId, skill, i + 1))
    })
    return entries
  }

  skillEntry(ownerId: string, skill: RawSkill, no: number): IndexEntry {
    const stages: IndexStage[] = skillStages(skill).map(({ kind, level, levelNo }) => {
      const runs = this.parse(skillLevelText(level), skillValues(level), `技能 ${skill.skillId} ${kind}`)
      const stage: IndexStage = { kind, cn: this.finish(runs, `${ownerId} 技能${no} ${kind}`) }
      if (kind === 'max') stage.level = levelNo
      return stage
    })
    return { kind: 'skill', no, name: skill.levels[0]?.name, stages }
  }

  traitEntry(id: string, char: RawCharacter, modules: ModuleLevel3[]): IndexEntry | undefined {
    const candidates = char.trait?.candidates ?? []
    const top = [...candidates].filter((c) => c.requiredPotentialRank === 0).sort((a, b) => unlockOrder(b.unlockCondition) - unlockOrder(a.unlockCondition))[0]
    const raw = top?.overrideDescripton ?? char.description
    if (!raw) return undefined
    const baseRuns = this.parse(raw, toValues(top?.blackboard), `幹員 ${id} 特性`)
    const stages: IndexStage[] = [{ kind: 'base', cn: this.finish(baseRuns, `${id} 特性`) }]
    for (const m of modules) {
      if (!m.trait) continue
      const where = `模組 ${m.equip.uniEquipId} 特性`
      const values = toValues(m.trait.blackboard)
      const runs = m.trait.overrideDescripton ? this.parse(m.trait.overrideDescripton, values, where) : [...baseRuns]
      if (m.trait.additionalDescription) runs.push({ t: '\n' }, ...this.parse(m.trait.additionalDescription, values, where))
      stages.push({ kind: 'module', module: m.equip.uniEquipId, cn: this.finish(runs, `${id} 特性 模組3 ${m.equip.uniEquipId}`) })
    }
    return { kind: 'trait', stages }
  }

  talentEntry(id: string, candidates: RawTalentCandidate[], index: number, modules: ModuleLevel3[]): IndexEntry | undefined {
    const no = index + 1
    const visible = candidates.filter((c) => !c.isHideTalent && c.description)
    const stages: IndexStage[] = []
    if (visible.length > 0) {
      const runs = this.talentRuns(visible, (c) => c.description!, `幹員 ${id} 天賦${no}`)
      stages.push({ kind: 'base', cn: this.finish(runs, `${id} 天賦${no}`) })
    }
    for (const m of modules) {
      const rewrite = m.talents.get(index)
      if (!rewrite) continue
      const runs = this.talentRuns(rewrite, (c) => c.upgradeDescription!, `模組 ${m.equip.uniEquipId} 天賦${no}`)
      stages.push({ kind: 'module', module: m.equip.uniEquipId, cn: this.finish(runs, `${id} 天賦${no} 模組3 ${m.equip.uniEquipId}`) })
    }
    if (stages.length === 0) return undefined
    const name = visible[0]?.name ?? modules.map((m) => m.talents.get(index)?.[0].name).find(Boolean)
    return { kind: 'talent', no, name: name ?? undefined, stages }
  }

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

  /** 取最高解鎖條件(精英二)的潛能1 版本,並以高潛能版本補上「(+B)」。 */
  talentRuns<C extends RawTalentCandidate>(candidates: C[], textOf: (c: C) => string, where: string): Run[] {
    const top = Math.max(...candidates.map((c) => unlockOrder(c.unlockCondition)))
    const versions = candidates.filter((c) => unlockOrder(c.unlockCondition) === top).sort((a, b) => a.requiredPotentialRank - b.requiredPotentialRank)
    const parse = (c: C) => parseRichText(textOf(c), { values: toValues(c.blackboard), where, warn: this.warn })
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

  parse(raw: string, values: Map<string, number | string>, where: string): Run[] {
    return parseRichText(raw, { values, where, warn: this.warn })
  }

  /**
   * 解析完成的 runs → 索引文字。每個關鍵字的效果類型:覆寫檔優先,否則用規則判定;
   * 覆寫檔沒有的配對列入待複核清單。where 標出這段敘述在哪裡,供複核時參考。
   */
  finish(parsed: Run[], where: string): IndexText {
    const runs = markSupplements(parsed, this.matchers.cn)
    const text = plainText(runs)
    const hash = textHash(text)
    const hits: IndexText['hits'] = {}
    for (const [keyword, ruleType] of Object.entries(ruleEffectTypes(runs))) {
      const key = `${hash}:${keyword}`
      const override = this.input.overrides?.[key]
      hits[keyword] = override?.type ?? ruleType
      if (override) continue
      const pending = this.pending.get(key)
      if (pending) {
        if (!pending.where.includes(where)) pending.where.push(where)
      } else this.pending.set(key, { key, keyword, ruleType, text, where: [where] })
    }
    return { runs, hits }
  }

  /** 分組順序:維護者分組清單,再加上補充關鍵字清單裡新出現的分組,最後是「未分組」。 */
  groups(): string[] {
    const names = (this.input.groups ?? []).map((g) => g.name)
    for (const s of this.input.supplements ?? []) if (!names.includes(s.group)) names.push(s.group)
    return [...names, UNGROUPED]
  }

  keywords(operators: IndexOperator[]): IndexKeyword[] {
    const used = new Set<string>()
    for (const op of operators)
      for (const e of op.entries) for (const st of e.stages) for (const k of Object.keys(st.cn.hits)) used.add(k)
    const dict = this.input.cn.gamedataConst.termDescriptionDict
    const groupOf = new Map<string, string>()
    const order = new Map<string, number>()
    for (const g of this.input.groups ?? [])
      for (const k of g.keywords) {
        groupOf.set(k, g.name)
        order.set(k, order.size)
      }
    const sorted = [...used].filter((id) => !id.startsWith('sup.')).sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b))
    const keywords: IndexKeyword[] = []
    for (const s of this.input.supplements ?? [])
      keywords.push({ id: supplementId(s), name: s.name, kind: 'supplement', group: s.group, definition: [{ t: s.definition }] })
    for (const id of sorted) {
      const term = dict[id]
      if (!term) this.warn(`術語字典沒有 ${id}`)
      keywords.push({
        id,
        name: term?.termName ?? id,
        kind: 'term',
        group: groupOf.get(id) ?? UNGROUPED,
        definition: term ? parseRichText(term.description, { values: new Map(), where: `術語 ${id} 定義`, warn: this.warn }) : [],
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

function supplementId(s: SupplementKeyword): string {
  return `sup.${s.id}`
}

function isOperator(id: string, char: RawCharacter): boolean {
  return id.startsWith('char_') && (PROFESSIONS as readonly string[]).includes(char.profession) && !char.isNotObtainable
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

function skillStages(skill: RawSkill): { kind: IndexStage['kind']; level: RawSkillLevel; levelNo: number }[] {
  const n = skill.levels.length
  if (n >= 10) return [{ kind: 'lv7', level: skill.levels[6], levelNo: 7 }, { kind: 'm3', level: skill.levels[9], levelNo: 10 }]
  return [{ kind: 'max', level: skill.levels[n - 1], levelNo: n }]
}

function skillLevelText(level: RawSkillLevel): string {
  return level.description ?? ''
}

function skillValues(level: RawSkillLevel) {
  return toValues(level.blackboard, { duration: level.duration ?? 0 })
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
