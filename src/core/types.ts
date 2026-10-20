// 索引建置與瀏覽器查詢之間唯一的交界:索引 JSON 的形狀,以及查詢的輸入與輸出。

export type Server = 'cn' | 'tw'

/** 敘述與關鍵字的關係:施加、利用、反制。一段敘述對同一關鍵字可同時有多種。 */
export type EffectType = 'apply' | 'exploit' | 'counter'

export const EFFECT_TYPES: EffectType[] = ['apply', 'exploit', 'counter']

/** 去重並依 EFFECT_TYPES 順序排列。 */
export function sortTypes(types: Iterable<EffectType>): EffectType[] {
  const set = new Set(types)
  return EFFECT_TYPES.filter((t) => set.has(t))
}

export const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  apply: '施加',
  exploit: '利用',
  counter: '反制',
}

/**
 * 敘述中的一段文字。k:關鍵字 id;s:樣式;p:潛能加成由第幾潛能獲得(「潛能 5 獲得」);
 * h:幹員詳情裡命中目前搜尋條件的關鍵字(高亮),只出現在查詢輸出。
 */
export interface Run {
  t: string
  k?: string
  s?: string
  p?: string
  h?: true
}

/** 遊戲職業,依遊戲內順序。 */
export const PROFESSIONS = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'] as const
export type Profession = (typeof PROFESSIONS)[number]

/** 卡頭「台服未實裝」徽章與壓灰小卡的懸停文字。 */
export const TW_UNRELEASED_TITLE = '台服尚未實裝這位幹員,文字與數值取自陸服'

export const PROFESSION_LABELS: Record<Profession, string> = {
  PIONEER: '先鋒',
  WARRIOR: '近衛',
  TANK: '重裝',
  SNIPER: '狙擊',
  CASTER: '術師',
  MEDIC: '醫療',
  SUPPORT: '輔助',
  SPECIAL: '特種',
}

/** 回復類型:自動回復、攻擊回復、受擊回復。 */
export type SpType = 'time' | 'attack' | 'hit'

export const SP_TYPE_LABELS: Record<SpType, string> = {
  time: '自動回復',
  attack: '攻擊回復',
  hit: '受擊回復',
}

/** 觸發方式:手動觸發、自動觸發、被動。 */
export type Trigger = 'manual' | 'auto' | 'passive'

export const TRIGGER_LABELS: Record<Trigger, string> = {
  manual: '手動觸發',
  auto: '自動觸發',
  passive: '被動',
}

/** 一個技能階段的技力與發動資訊。 */
export interface SkillStats {
  trigger: Trigger
  /** 回復類型與技力;被動技能與沒有回復類型的技能沒有。 */
  sp?: { type: SpType; init: number; cost: number }
  /** 持續秒數;只有大於 0 時才有。 */
  duration?: number
  /** 彈藥技能:打完彈藥才結束。 */
  ammo?: true
  /** 可充能次數;只有大於 1 時才有。 */
  charges?: number
}

// ---------- 索引 ----------

export interface IndexText {
  runs: Run[]
  /** 這段文字含有的關鍵字與其效果類型(依 EFFECT_TYPES 順序);判定不出時為空清單,關鍵字照樣高亮。 */
  hits: Record<string, EffectType[]>
}

export type StageKind = 'lv7' | 'm3' | 'max' | 'base' | 'module'

export interface IndexStage {
  kind: StageKind
  /** kind 為 max(沒有專精的技能)時的最高等級。 */
  level?: number
  /** 模組3 階段所屬的模組 id。 */
  module?: string
  /** 陸服文字(比對用)。模組3 階段只有陸服文字。 */
  cn: IndexText
  /** 台服同一段敘述;台服沒有時省略。 */
  tw?: IndexText
  /** 台服文字與陸服的術語、數值、補充關鍵字一致,陸服模式可顯示台服文字。 */
  twSame?: boolean
  /** 技能階段的技力:各伺服器各用自己的數值;台服與陸服相同或台服沒有時省略 tw。 */
  stats?: { cn: SkillStats; tw?: SkillStats }
}

export type EntryKind = 'skill' | 'talent' | 'trait'

export interface IndexEntry {
  kind: EntryKind
  /** 技能或天賦的編號(1 起算);模組新增的天賦接續幹員原有天賦。特性沒有編號。 */
  no?: number
  name?: string
  /** 召喚物 id;敘述屬於召喚物時才有。 */
  summon?: string
  /** 技能圖示的相對路徑;缺圖時沒有。 */
  icon?: string
  stages: IndexStage[]
}

export interface IndexModule {
  id: string
  name: string
  /** 例如 SUM-X */
  code: string
  inTw: boolean
}

/** 帶出召喚物的敘述:召喚它的技能,或帶出它的天賦。 */
export interface SummonOrigin {
  kind: 'skill' | 'talent'
  no: number
}

export interface IndexSummon {
  id: string
  name: string
  inTw: boolean
  /** 帶出它的技能與天賦(依幹員資料的順序);對應不到時為空清單。 */
  from: SummonOrigin[]
}

export interface IndexOperator {
  id: string
  name: string
  rarity: number
  profession: Profession
  subProfession: string
  /** 越大越新。 */
  release: number
  inTw: boolean
  avatar?: string
  /** PRTS 的幹員頁名:陸服名;陸服名與其他幹員重複時依維護者對照。 */
  prtsPage: string
  modules: IndexModule[]
  summons: IndexSummon[]
  /** 只有命中敘述(含任何關鍵字的敘述)。 */
  entries: IndexEntry[]
  /** 這位幹員的幹員檔的相對路徑;檔名帶內容雜湊,資料更新後不會讀到舊版。 */
  detail?: string
}

/** 幹員檔:一位幹員全部的特性、天賦、技能(含召喚物的),不論有沒有關鍵字;打開幹員詳情時才下載。 */
export interface OperatorFile {
  id: string
  inTw: boolean
  modules: IndexModule[]
  summons: IndexSummon[]
  entries: IndexEntry[]
}

export interface IndexKeyword {
  id: string
  name: string
  kind: 'term' | 'supplement'
  definition: Run[]
}

/** 關鍵字面板的一個分組:每行是一串關鍵字 id,順序就是面板順序。 */
export interface IndexGroup {
  name: string
  rows: string[][]
}

/** 某個伺服器遊戲資料的版號,加上建置時下載這份資料的時間。 */
export interface DataVersion {
  version: string
  /** ISO 8601,帶時區。 */
  downloadedAt: string
}

export interface SearchIndex {
  versions: { cn: DataVersion; tw?: DataVersion }
  /** 面板排列:維護者清單的分組與行,最後是「未分組」;只含索引裡的關鍵字,不含空行與空分組。 */
  groups: IndexGroup[]
  keywords: IndexKeyword[]
  /** order 是遊戲內的分支順序(取自陸服);沒有時排在最後。 */
  subProfessions: Record<string, { name: string; profession: Profession; order?: number }>
  operators: IndexOperator[]
}

// ---------- 查詢 ----------

/** 搜尋條件:效果類型 + 關鍵字,例如施加-暈眩。 */
export interface SearchCondition {
  keyword: string
  type: EffectType
}

export interface QueryOptions {
  /** 搜尋條件一律 OR:幹員滿足任一條件就列入,包括同一關鍵字的多種效果類型。 */
  conditions: SearchCondition[]
  server: Server
  /** 星級篩選:只縮小結果,單獨不開始搜尋。 */
  rarities?: number[]
  /** 職業條件:彼此 OR,與搜尋條件 AND;沒有搜尋條件時列出這些職業的全部幹員。 */
  professions?: Profession[]
}

export interface ResultStage {
  /** 例如「等級7」「專精3」「無模組」「模組3 · SUM-X」;沒有其他階段可對照的無模組階段為空字串。 */
  label: string
  runs: Run[]
  /** 這個階段符合任一搜尋條件。 */
  hit: boolean
  /** 關鍵字 → 這個階段符合的搜尋條件的效果類型;沒有符合的關鍵字不列。 */
  effects: Record<string, EffectType[]>
  /** 模組3 階段的模組台服未實裝(幹員本身台服已有);幹員也台服未實裝時不標,卡頭已經標了。 */
  twUnreleased?: boolean
  /** 模組3 階段的模組全名(標籤只寫模組代碼)。 */
  module?: string
  /** 不存在的階段:模組新增的天賦沒有無模組階段,仍列出一個沒有文字、未命中的「無模組」供對照。 */
  absent?: boolean
  /** 技能階段的技力(目前伺服器的數值)。 */
  stats?: SkillStats
}

export interface ResultEntry {
  /** 敘述來源,例如「技能2」「天賦1」「特性」「召喚物技能1」。 */
  source: string
  /** 敘述來源種類,供介面決定文字框顏色。 */
  kind: EntryKind
  name?: string
  summon?: string
  /** 技能圖示的相對路徑。 */
  icon?: string
  /** 各階段依序排列;介面預設顯示第一個命中的階段。 */
  stages: ResultStage[]
}

export interface ResultOperator {
  id: string
  name: string
  rarity: number
  profession: Profession
  subProfession: string
  avatar?: string
  /** PRTS 幹員頁的完整網址。 */
  prtsUrl: string
  /** 台服未實裝的幹員;只在陸服模式帶,台服模式不列出這種幹員。 */
  twUnreleased?: boolean
  entries: ResultEntry[]
}

// ---------- 幹員詳情 ----------

export interface DetailEntry extends ResultEntry {
  /** 一開始顯示的階段:第一個存在的階段,不看命中。 */
  defaultStage: number
}

export interface DetailTab {
  kind: EntryKind
  /** 敘述來源,例如「特性」「天賦1」「技能2」。 */
  label: string
  /** 幹員本身那段敘述在前,之後是它帶出的召喚物的敘述(每個召喚物依序是召喚物天賦、召喚物技能)。 */
  entries: DetailEntry[]
}

export interface OperatorDetail {
  /** 幹員本身每段敘述一個分頁,依序是特性、天賦(依編號,含模組新增的天賦)、技能(依編號)。 */
  tabs: DetailTab[]
  /** 一開始顯示的分頁:第一個分頁(特性)。 */
  defaultTab: number
}
