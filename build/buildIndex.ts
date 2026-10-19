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
import type { RawCharacter, RawServer, RawSkill, RawSkillLevel } from './raw'
import { parseRichText, toValues } from './richText'

export interface BuildInput {
  cn: RawServer
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
      groups: [UNGROUPED],
      keywords: this.keywords(operators),
      subProfessions: {},
      operators,
    }
  }

  operator(id: string, char: RawCharacter): IndexOperator {
    const entries: IndexEntry[] = []
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

  text(raw: string, values: Map<string, number | string>, where: string): IndexText {
    const runs = parseRichText(raw, { values, where, warn: this.warn })
    return { runs, hits: hitsOf(runs) }
  }

  keywords(operators: IndexOperator[]): IndexKeyword[] {
    const used = new Set<string>()
    for (const op of operators)
      for (const e of op.entries) for (const st of e.stages) for (const k of Object.keys(st.cn.hits)) used.add(k)
    const dict = this.input.cn.gamedataConst.termDescriptionDict
    const keywords: IndexKeyword[] = []
    for (const id of used) {
      const term = dict[id]
      if (!term) this.warn(`術語字典沒有 ${id}`)
      keywords.push({
        id,
        name: term?.termName ?? id,
        kind: 'term',
        group: UNGROUPED,
        definition: term ? parseRichText(term.description, { values: new Map(), where: `術語 ${id} 定義`, warn: this.warn }) : [],
      })
    }
    return keywords
  }
}

function isOperator(id: string, char: RawCharacter): boolean {
  return id.startsWith('char_') && (PROFESSIONS as readonly string[]).includes(char.profession) && !char.isNotObtainable
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
