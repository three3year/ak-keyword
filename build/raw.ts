// 原始遊戲資料的形狀(只列建置用到的欄位)。陸服與台服大致相同,差別:
// 台服的 blackboard 多半是 { key: value } 物件,陸服是 [{ key, value, valueStr }] 陣列。

export interface RawBlackboardItem {
  key: string
  value?: number | null
  valueStr?: string | null
}

export type RawBlackboard = RawBlackboardItem[] | Record<string, number | string> | null | undefined

export interface RawUnlockCondition {
  phase: string
  level: number
}

export interface RawTalentCandidate {
  unlockCondition: RawUnlockCondition
  requiredPotentialRank: number
  name?: string | null
  description?: string | null
  blackboard?: RawBlackboard
  tokenKey?: string | null
  isHideTalent?: boolean
}

export interface RawTraitCandidate {
  unlockCondition: RawUnlockCondition
  requiredPotentialRank: number
  overrideDescripton?: string | null
  blackboard?: RawBlackboard
}

export interface RawCharSkill {
  skillId: string | null
  overrideTokenKey?: string | null
}

export interface RawCharacter {
  name: string
  description?: string | null
  potentialItemId?: string | null
  classicPotentialItemId?: string | null
  activityPotentialItemId?: string | null
  isNotObtainable?: boolean
  rarity: string
  profession: string
  subProfessionId: string
  trait?: { candidates: RawTraitCandidate[] | null } | null
  phases: unknown[]
  skills: RawCharSkill[]
  displayTokenDict?: Record<string, boolean> | null
  talents?: { candidates: RawTalentCandidate[] | null }[] | null
}

export interface RawSkillLevel {
  name: string
  description: string | null
  /** 負值與 0 表示沒有固定持續時間。 */
  duration?: number
  blackboard?: RawBlackboard
  /** MANUAL、AUTO、PASSIVE。 */
  skillType?: string
  /** AMMO 是彈藥技能。 */
  durationType?: string
  /** spType:INCREASE_WITH_TIME、INCREASE_WHEN_ATTACK、INCREASE_WHEN_TAKEN_DAMAGE;8 是沒有回復類型(被動與部分召喚物技能)。 */
  spData?: { spType: string | number; initSp: number; spCost: number; maxChargeTime: number }
}

export interface RawSkill {
  skillId: string
  /** 技能圖示的檔名 id;沒有時用 skillId。只有陸服有。 */
  iconId?: string | null
  levels: RawSkillLevel[]
}

export interface RawTerm {
  termId: string
  termName: string
  description: string
}

export interface RawGamedataConst {
  dataVersion?: string
  termDescriptionDict: Record<string, RawTerm>
}

export interface RawEquip {
  uniEquipId: string
  uniEquipName: string
  typeIcon: string
  charId: string
  type: string
}

export interface RawUniequipTable {
  equipDict: Record<string, RawEquip>
  /** subProfessionCatagory 是遊戲內的分支順序。 */
  subProfDict?: Record<string, { subProfessionId: string; subProfessionName: string; subProfessionCatagory?: number }>
}

export interface RawEquipTalentCandidate extends RawTalentCandidate {
  talentIndex: number
  upgradeDescription?: string | null
}

export interface RawEquipTraitCandidate extends RawTraitCandidate {
  additionalDescription?: string | null
}

export interface RawEquipPart {
  target: string
  isToken: boolean
  addOrOverrideTalentDataBundle?: { candidates: RawEquipTalentCandidate[] | null } | null
  overrideTraitDataBundle?: { candidates: RawEquipTraitCandidate[] | null } | null
}

export interface RawBattleEquip {
  phases: { equipLevel: number; parts: RawEquipPart[] }[]
}

export interface RawCharPatchTable {
  infos: Record<string, { tmplIds: string[]; default: string }>
  patchChars: Record<string, RawCharacter>
}

export interface RawItemTable {
  items: Record<string, { sortId: number }>
}

export interface RawServer {
  characterTable: Record<string, RawCharacter>
  skillTable: Record<string, RawSkill>
  gamedataConst: RawGamedataConst
  uniequipTable?: RawUniequipTable
  /** 只有陸服有。 */
  battleEquipTable?: Record<string, RawBattleEquip>
  charPatchTable?: RawCharPatchTable
  /** 只有陸服用到:以潛能信物編號近似實裝順序。 */
  itemTable?: RawItemTable
  /** 這份資料的下載時間(ISO 8601)。不在遊戲資料裡,由建置腳本從快取讀出。 */
  downloadedAt: string
}
