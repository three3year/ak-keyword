// 索引建置:原始遊戲資料 → 索引。純函式,不做任何 I/O。
import type {
  IndexEntry,
  IndexKeyword,
  IndexOperator,
  IndexStage,
  IndexText,
  Profession,
  Run,
  SearchIndex,
} from '../src/core/types'
import { PROFESSIONS } from '../src/core/types'
import { withPotentialBonus } from './potential'
import type { RawCharacter, RawServer, RawSkill, RawSkillLevel, RawTalentCandidate, RawUnlockCondition } from './raw'
import { parseRichText, toValues } from './richText'

/** 維護者清單:關鍵字分組。沒列到的關鍵字歸到「未分組」。 */
export interface KeywordGroup {
  name: string
  keywords: string[]
}

export interface BuildInput {
  cn: RawServer
  groups?: KeywordGroup[]
}

export interface BuildOutput {
  index: SearchIndex
  warnings: string[]
}

const UNGROUPED = '未分組'

class Builder {
  readonly warnings: string[] = []
  readonly warn = (message: string) => {
    this.warnings.push(message)
  }

  constructor(readonly input: BuildInput) {}

  build(): SearchIndex {
    const { cn } = this.input
    const operators: IndexOperator[] = []
    for (const [id, char] of Object.entries(cn.characterTable)) {
      if (!isOperator(id, char)) continue
      operators.push(this.operator(id, char))
    }
    return {
      versions: { cn: cn.gamedataConst.dataVersion ?? '' },
      groups: [...(this.input.groups ?? []).map((g) => g.name), UNGROUPED],
      keywords: this.keywords(operators),
      subProfessions: {},
      operators,
    }
  }

  operator(id: string, char: RawCharacter): IndexOperator {
    const entries: IndexEntry[] = []
    const trait = this.traitEntry(id, char)
    if (trait) entries.push(trait)
    ;(char.talents ?? []).forEach((t, i) => {
      const entry = this.talentEntry(id, t.candidates ?? [], i + 1)
      if (entry) entries.push(entry)
    })
    char.skills.forEach((s, i) => {
      if (!s.skillId) return
      const skill = this.input.cn.skillTable[s.skillId]
      if (!skill) {
        this.warn(`幹員 ${id}:技能表沒有 ${s.skillId}`)
        return
      }
      entries.push(this.skillEntry(skill, i + 1))
    })
    return {
      id,
      name: char.name,
      rarity: Number(char.rarity.replace('TIER_', '')),
      profession: char.profession as Profession,
      subProfession: char.subProfessionId,
      release: 0,
      inTw: false,
      modules: [],
      summons: [],
      entries: entries.filter((e) => e.stages.some((st) => Object.keys(st.cn.hits).length > 0)),
    }
  }

  skillEntry(skill: RawSkill, no: number): IndexEntry {
    const stages: IndexStage[] = skillStages(skill).map(({ kind, level, levelNo }) => {
      const stage: IndexStage = { kind, cn: this.text(skillLevelText(level), skillValues(level), `技能 ${skill.skillId} ${kind}`) }
      if (kind === 'max') stage.level = levelNo
      return stage
    })
    return { kind: 'skill', no, name: skill.levels[0]?.name, stages }
  }

  traitEntry(id: string, char: RawCharacter): IndexEntry | undefined {
    const candidates = char.trait?.candidates ?? []
    const top = [...candidates].filter((c) => c.requiredPotentialRank === 0).sort((a, b) => unlockOrder(b.unlockCondition) - unlockOrder(a.unlockCondition))[0]
    const raw = top?.overrideDescripton ?? char.description
    if (!raw) return undefined
    return { kind: 'trait', stages: [{ kind: 'base', cn: this.text(raw, toValues(top?.blackboard), `幹員 ${id} 特性`) }] }
  }

  talentEntry(id: string, candidates: RawTalentCandidate[], no: number): IndexEntry | undefined {
    const visible = candidates.filter((c) => !c.isHideTalent && c.description)
    if (visible.length === 0) return undefined
    const where = `幹員 ${id} 天賦${no}`
    const runs = this.talentRuns(visible, (c) => c.description!, where)
    return { kind: 'talent', no, name: visible[0].name ?? undefined, stages: [{ kind: 'base', cn: { runs, hits: hitsOf(runs) } }] }
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

  text(raw: string, values: Map<string, number | string>, where: string): IndexText {
    const runs = parseRichText(raw, { values, where, warn: this.warn })
    return { runs, hits: hitsOf(runs) }
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
    const sorted = [...used].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b))
    const keywords: IndexKeyword[] = []
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
    return keywords
  }
}

function isOperator(id: string, char: RawCharacter): boolean {
  return id.startsWith('char_') && (PROFESSIONS as readonly string[]).includes(char.profession) && !char.isNotObtainable
}

const PHASES: Record<string, number> = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 }

function unlockOrder(c: RawUnlockCondition): number {
  return (PHASES[c.phase] ?? 0) * 1000 + c.level
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

function hitsOf(runs: Run[]): IndexText['hits'] {
  const hits: IndexText['hits'] = {}
  for (const r of runs) if (r.k) hits[r.k] = 'other'
  return hits
}

export function buildIndex(input: BuildInput): BuildOutput {
  const builder = new Builder(input)
  const index = builder.build()
  return { index, warnings: builder.warnings }
}
