// 手寫的小型原始資料片段。形狀照真實遊戲資料,只放案例需要的欄位。
import type {
  RawBattleEquip,
  RawBlackboard,
  RawCharacter,
  RawEquip,
  RawEquipPart,
  RawServer,
  RawSkill,
  RawSkillLevel,
  RawTalentCandidate,
  RawTerm,
} from '../build/raw'
import type { Run } from '../src/core/types'

export type Values = Record<string, number | string>

export interface LevelSpec {
  description: string
  values?: Values
  duration?: number
}

type BlackboardStyle = 'array' | 'object'

function blackboard(values: Values | undefined, style: BlackboardStyle): RawBlackboard {
  if (!values) return style === 'array' ? [] : {}
  if (style === 'object') return { ...values }
  return Object.entries(values).map(([key, v]) =>
    typeof v === 'number' ? { key, value: v, valueStr: null } : { key, value: 0, valueStr: v },
  )
}

function level(name: string, spec: LevelSpec, style: BlackboardStyle): RawSkillLevel {
  return {
    name,
    description: spec.description,
    duration: spec.duration ?? 0,
    blackboard: blackboard(spec.values, style),
  }
}

/** 有專精的技能:等級1~7 用 lv7,專精1~3 用 m3。 */
export function masteredSkill(id: string, name: string, lv7: LevelSpec, m3: LevelSpec, style: BlackboardStyle = 'array'): RawSkill {
  const levels = [...Array(7).fill(lv7), ...Array(3).fill(m3)].map((s: LevelSpec) => level(name, s, style))
  return { skillId: id, levels }
}

/** 沒有專精的技能:只有7個等級。 */
export function basicSkill(id: string, name: string, top: LevelSpec, style: BlackboardStyle = 'array'): RawSkill {
  return { skillId: id, levels: Array(7).fill(top).map((s: LevelSpec) => level(name, s, style)) }
}

export interface TalentSpec {
  name: string
  /** 精英二、潛能1 的敘述。 */
  description: string
  /** 潛能提升後的版本:rank 是 requiredPotentialRank(潛能等級 - 1)。 */
  potentials?: { rank: number; description: string }[]
  /** 精英一的版本(應被精英二蓋過)。 */
  e1Description?: string
  tokenKey?: string
  hidden?: boolean
}

function talent(spec: TalentSpec, style: BlackboardStyle): { candidates: RawTalentCandidate[] } {
  const c = (phase: string, rank: number, description: string): RawTalentCandidate => ({
    unlockCondition: { phase, level: 1 },
    requiredPotentialRank: rank,
    name: spec.name,
    description,
    blackboard: blackboard(undefined, style),
    tokenKey: spec.tokenKey ?? null,
    isHideTalent: spec.hidden ?? false,
  })
  const candidates: RawTalentCandidate[] = []
  if (spec.e1Description) candidates.push(c('PHASE_1', 0, spec.e1Description))
  candidates.push(c('PHASE_2', 0, spec.description))
  for (const p of spec.potentials ?? []) candidates.push(c('PHASE_2', p.rank, p.description))
  return { candidates }
}

export interface OperatorSpec {
  name: string
  rarity?: number
  profession?: string
  sub?: string
  skills?: string[]
  /** 技能 id → 召喚物 id(技能會召喚特定召喚物)。 */
  skillTokens?: Record<string, string>
  talents?: TalentSpec[]
  /** 特性敘述(幹員的 description)。 */
  trait?: string
  /** 以 overrideDescripton 改寫並帶數值表的特性。 */
  traitOverride?: { description: string; values?: Values }
  /** 潛能信物排序編號:越大越新。 */
  release?: number
  tokens?: string[]
  notObtainable?: boolean
  style?: BlackboardStyle
}

export function operator(spec: OperatorSpec): RawCharacter {
  const style = spec.style ?? 'array'
  const rarity = spec.rarity ?? 6
  return {
    name: spec.name,
    description: spec.trait ?? '',
    potentialItemId: `p_${spec.name}`,
    isNotObtainable: spec.notObtainable ?? false,
    rarity: `TIER_${rarity}`,
    profession: spec.profession ?? 'CASTER',
    subProfessionId: spec.sub ?? 'corecaster',
    trait: spec.traitOverride
      ? {
          candidates: [
            {
              unlockCondition: { phase: 'PHASE_0', level: 1 },
              requiredPotentialRank: 0,
              overrideDescripton: spec.traitOverride.description,
              blackboard: blackboard(spec.traitOverride.values, style),
            },
          ],
        }
      : null,
    phases: [{}, {}, {}],
    skills: (spec.skills ?? []).map((skillId) => ({ skillId, overrideTokenKey: spec.skillTokens?.[skillId] ?? null })),
    displayTokenDict: spec.tokens ? Object.fromEntries(spec.tokens.map((t) => [t, true])) : null,
    talents: (spec.talents ?? []).map((t) => talent(t, style)),
  }
}

export interface ModuleSpec {
  id: string
  charId: string
  name: string
  /** 例如 SUM-X */
  code: string
  /** 模組3 對特性的改寫:override 取代整段特性,add 追加在特性之後。 */
  trait?: { override?: string; add?: string; values?: Values }
  /** 模組3 對天賦的改寫:index 是天賦位置(0 起算),-1 表示模組新增的天賦。 */
  talents?: { index: number; name: string; description: string; potentials?: { rank: number; description: string }[] }[]
}

function moduleTables(modules: ModuleSpec[]) {
  const equipDict: Record<string, RawEquip> = {}
  const battle: Record<string, RawBattleEquip> = {}
  for (const m of modules) {
    equipDict[m.id] = { uniEquipId: m.id, uniEquipName: m.name, typeIcon: m.code.toLowerCase(), charId: m.charId, type: 'ADVANCED' }
    const parts = (level: number): RawEquipPart[] => {
      // 模組1、2 的文字刻意不同,確認只取模組3
      const lv = (t: string) => (level === 3 ? t : `${t}(模組${level})`)
      const out: RawEquipPart[] = []
      if (m.trait)
        out.push({
          target: 'TRAIT',
          isToken: false,
          addOrOverrideTalentDataBundle: { candidates: null },
          overrideTraitDataBundle: {
            candidates: [
              {
                unlockCondition: { phase: 'PHASE_2', level: 1 },
                requiredPotentialRank: 0,
                overrideDescripton: m.trait.override ? lv(m.trait.override) : null,
                additionalDescription: m.trait.add ? lv(m.trait.add) : null,
                blackboard: blackboard(m.trait.values, 'array'),
              },
            ],
          },
        })
      for (const t of m.talents ?? [])
        out.push({
          target: 'TALENT_DATA_ONLY',
          isToken: false,
          overrideTraitDataBundle: { candidates: null },
          addOrOverrideTalentDataBundle: {
            candidates: [{ rank: 0, description: t.description }, ...(t.potentials ?? [])].map((p) => ({
              talentIndex: t.index,
              unlockCondition: { phase: 'PHASE_2', level: 1 },
              requiredPotentialRank: p.rank,
              name: t.name,
              description: null,
              upgradeDescription: lv(p.description),
              blackboard: [],
              isHideTalent: false,
            })),
          },
        })
      return out
    }
    battle[m.id] = { phases: [1, 2, 3].map((equipLevel) => ({ equipLevel, parts: parts(equipLevel) })) }
  }
  return { uniequipTable: { equipDict }, battleEquipTable: battle }
}

export interface ServerSpec {
  version?: string
  /** 資料的下載時間(ISO 8601)。 */
  downloadedAt?: string
  terms?: Record<string, [name: string, description: string]>
  operators: Record<string, RawCharacter>
  skills?: RawSkill[]
  modules?: ModuleSpec[]
  /** 阿米婭式的職業形態:預設形態 id → 其他形態(在 char_patch_table 裡)。 */
  patches?: Record<string, Record<string, RawCharacter>>
}

export function server(spec: ServerSpec): RawServer {
  const termDescriptionDict: Record<string, RawTerm> = {}
  for (const [termId, [termName, description]] of Object.entries(spec.terms ?? {}))
    termDescriptionDict[termId] = { termId, termName, description }
  const items: Record<string, { sortId: number }> = {}
  const characterTable: Record<string, RawCharacter> = {}
  for (const [id, op] of Object.entries(spec.operators)) {
    characterTable[id] = op
    if (op.potentialItemId) items[op.potentialItemId] = { sortId: Number(op.rarity.slice(5)) * 100000 }
  }
  return {
    characterTable,
    skillTable: Object.fromEntries((spec.skills ?? []).map((s) => [s.skillId, s])),
    gamedataConst: { dataVersion: spec.version ?? '1.0.0', termDescriptionDict },
    downloadedAt: spec.downloadedAt ?? '2026-01-01T00:00:00Z',
    itemTable: { items },
    ...(spec.modules ? moduleTables(spec.modules) : {}),
    ...(spec.patches
      ? {
          charPatchTable: {
            infos: Object.fromEntries(
              Object.entries(spec.patches).map(([main, forms]) => [main, { tmplIds: [main, ...Object.keys(forms)], default: main }]),
            ),
            patchChars: Object.assign({}, ...Object.values(spec.patches)),
          },
        }
      : {}),
  }
}

/** 設定實裝順序:依傳入順序由舊到新。 */
export function withRelease(raw: RawServer, oldestFirst: string[]): RawServer {
  oldestFirst.forEach((id, i) => {
    const op = raw.characterTable[id]
    raw.itemTable!.items[op.potentialItemId!] = { sortId: Number(op.rarity.slice(5)) * 100000 + i + 1 }
  })
  return raw
}

export const COMMON_TERMS: Record<string, [string, string]> = {
  'ba.cold': ['寒冷', '攻击速度下降，如果在持续时间内再次受到寒冷效果则会变为<$ba.frozen>冻结</>'],
  'ba.frozen': ['冻结', '无法行动'],
  'ba.levitate': ['浮空', '无法移动和攻击'],
  'ba.magicfragile': ['法术脆弱', '受到的法术伤害提升'],
  'ba.stun': ['晕眩', '无法移动、阻挡、攻击及使用技能'],
}

/** 把 runs 接成純文字。 */
export function plain(runs: Run[]): string {
  return runs.map((r) => r.t).join('')
}

/** 列出 runs 裡被高亮(帶關鍵字)的文字與其關鍵字。 */
export function highlights(runs: Run[]): [string, string][] {
  return runs.filter((r) => r.k).map((r) => [r.t, r.k!])
}
