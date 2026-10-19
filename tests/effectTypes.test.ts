import { describe, expect, test } from 'vitest'
import { type Overrides, buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import { EFFECT_TYPES, type EffectType, type SearchIndex, type Server } from '../src/core/types'
import { COMMON_TERMS, basicSkill, operator, server } from './fixtures'

const DODGE = { id: 'dodge', name: '閃避', cn: ['闪避'], tw: ['閃避'], definition: '使攻擊無效', group: '增益' }

/** 每位幹員一個技能,技能敘述由參數給定。 */
function fixture(descriptions: Record<string, string>) {
  const operators = Object.fromEntries(
    Object.keys(descriptions).map((name, i) => [`char_${400 + i}_x`, operator({ name, skills: [`sk_${i}`] })]),
  )
  const skills = Object.values(descriptions).map((d, i) => basicSkill(`sk_${i}`, `技${i}`, { description: d }))
  return server({
    terms: { ...COMMON_TERMS, 'ba.inspire': ['鼓舞', '攻击力提升'], 'ba.sleep': ['沉睡', '无法行动'], 'ba.invisible': ['隐匿', '不会成为目标'] },
    operators,
    skills,
  })
}

/** 以哪些效果類型搭配這個關鍵字當搜尋條件時,找得到索引裡唯一的幹員。 */
function typesFound(index: SearchIndex, keyword: string, server: Server = 'cn'): EffectType[] {
  return EFFECT_TYPES.filter((type) => query(index, { conditions: [{ keyword, type }], server }).length > 0)
}

function effectOf(description: string, keyword: string): EffectType[] {
  return typesFound(buildIndex({ cn: fixture({ 甲: description }), supplements: [DODGE] }).index, keyword)
}

function names(index: SearchIndex, conditions: [EffectType, string][]): string[] {
  return query(index, { conditions: conditions.map(([type, keyword]) => ({ keyword, type })), server: 'cn' }).map((r) => r.name)
}

describe('效果類型的規則判定', () => {
  test.each([
    ['攻击使敌人<$ba.cold>寒冷</>3秒', 'ba.cold', ['apply']],
    ['对周围敌人造成伤害并使其陷入<$ba.stun>晕眩</>', 'ba.stun', ['apply']],
    ['范围内友方单位获得<$ba.inspire>鼓舞</>', 'ba.inspire', ['apply']],
    ['对<$ba.cold>寒冷</>状态的敌人造成的伤害提升30%', 'ba.cold', ['exploit']],
    ['攻击处于<$ba.levitate>浮空</>的敌人时攻击力提升', 'ba.levitate', ['exploit']],
    ['成功闪避后自身下一次攻击攻击力+100%', 'sup.dodge', ['exploit']],
    ['自身免疫<$ba.stun>晕眩</>', 'ba.stun', ['counter']],
    ['技能期间不会被<$ba.frozen>冻结</>', 'ba.frozen', ['counter']],
    ['攻击范围内敌人的<$ba.invisible>隐匿</>效果失效', 'ba.invisible', ['counter']],
    ['攻击无视目标的物理闪避', 'sup.dodge', ['counter']],
    ['使敌人<$ba.sleep>沉睡</>，攻击<$ba.sleep>沉睡</>的目标时攻击力提升', 'ba.sleep', ['apply', 'exploit']],
  ])('%s → %s 為 %j', (description, keyword, expected) => {
    expect(effectOf(description, keyword)).toEqual(expected)
  })

  test.each([
    ['成功闪避后自身下一次攻击攻击力+100%', '成功閃避後自身下一次攻擊攻擊力+120%', 'sup.dodge', ['exploit']],
    ['攻击范围扩大并使敌人<$ba.invisible>隐匿</>失效1', '攻擊範圍擴大並使敵人<$ba.invisible>隱匿</>失效2', 'ba.invisible', ['counter']],
    ['自身免疫<$ba.stun>晕眩</>1', '自身免疫<$ba.stun>暈眩</>2', 'ba.stun', ['counter']],
  ])('繁中(台服文字與國服不一致時各自判定):%s → %s', (cnText, twText, keyword, expected) => {
    const { index } = buildIndex({ cn: fixture({ 甲: cnText }), tw: fixture({ 甲: twText }), supplements: [DODGE] })
    expect(typesFound(index, keyword, 'tw')).toEqual(expected)
  })

  test('句型判定不出、又不在覆寫檔的配對不會成為命中敘述,並列入待複核清單', () => {
    const cn = fixture({ 甲: '场上存在<$ba.cold>寒冷</>相关的效果时攻击力提升' })
    const { index, pending } = buildIndex({ cn })
    expect(typesFound(index, 'ba.cold')).toEqual([])
    expect(pending.map((p) => [p.keyword, p.ruleTypes])).toEqual([['ba.cold', []]])
  })
})

describe('搜尋條件', () => {
  const cn = fixture({
    施加者: '攻击使敌人<$ba.cold>寒冷</>',
    利用者: '对<$ba.cold>寒冷</>状态的敌人伤害提升',
    反制者: '免疫<$ba.cold>寒冷</>',
    施加又利用: '使敌人<$ba.cold>寒冷</>，对<$ba.cold>寒冷</>的敌人伤害提升',
  })

  test('一個搜尋條件只列出該效果類型;一段多類型的敘述在每種類型下都找得到', () => {
    const { index } = buildIndex({ cn })
    expect(names(index, [['apply', 'ba.cold']])).toEqual(['施加者', '施加又利用'])
    expect(names(index, [['exploit', 'ba.cold']])).toEqual(['利用者', '施加又利用'])
    expect(names(index, [['counter', 'ba.cold']])).toEqual(['反制者'])
  })

  test('同一關鍵字的施加-X AND 利用-X 只列兩者都有的幹員,兩者可來自不同敘述', () => {
    const operators = {
      char_401_a: operator({ name: '分兩段', skills: ['sk_a', 'sk_b'] }),
      char_402_b: operator({ name: '只施加', skills: ['sk_a'] }),
    }
    const skills = [
      basicSkill('sk_a', '甲', { description: '使敌人<$ba.cold>寒冷</>' }),
      basicSkill('sk_b', '乙', { description: '对<$ba.cold>寒冷</>的敌人伤害提升' }),
    ]
    const { index } = buildIndex({ cn: server({ terms: COMMON_TERMS, operators, skills }) })
    const conditions: [EffectType, string][] = [
      ['apply', 'ba.cold'],
      ['exploit', 'ba.cold'],
    ]
    expect(names(index, conditions)).toEqual(['分兩段'])
    const [r] = query(index, { conditions: conditions.map(([type, keyword]) => ({ keyword, type })), server: 'cn' })
    // 每段命中敘述只標出它符合的搜尋條件
    expect(r.entries.map((e) => [e.source, e.stages[0].effects])).toEqual([
      ['技能1', { 'ba.cold': ['apply'] }],
      ['技能2', { 'ba.cold': ['exploit'] }],
    ])
  })

  test('施加-X AND 利用-Y', () => {
    const { index } = buildIndex({
      cn: fixture({
        施加暈眩利用寒冷: '使敌人<$ba.stun>晕眩</>，对<$ba.cold>寒冷</>的敌人伤害提升',
        兩者都施加: '使敌人<$ba.stun>晕眩</>并<$ba.cold>寒冷</>',
      }),
    })
    expect(names(index, [['apply', 'ba.stun'], ['exploit', 'ba.cold']])).toEqual(['施加暈眩利用寒冷'])
    expect(names(index, [['apply', 'ba.stun'], ['apply', 'ba.cold']])).toEqual(['兩者都施加'])
  })

  test('結果階段只列符合搜尋條件的效果類型', () => {
    const { index } = buildIndex({ cn })
    const [r] = query(index, { conditions: [{ keyword: 'ba.cold', type: 'exploit' }], server: 'cn' }).filter((r) => r.name === '施加又利用')
    expect(r.entries[0].stages[0].effects).toEqual({ 'ba.cold': ['exploit'] })
  })

  test('沒有搜尋條件時沒有結果', () => {
    const { index } = buildIndex({ cn })
    expect(query(index, { conditions: [], server: 'cn' })).toEqual([])
  })
})

describe('覆寫檔與待複核清單', () => {
  test('覆寫檔的判定優先於規則,能覆寫成多種效果類型,且不再列入待複核', () => {
    const cn = fixture({ 甲: '使敌人<$ba.cold>寒冷</>' })
    const first = buildIndex({ cn })
    expect(first.pending.map((p) => [p.keyword, p.ruleTypes, p.text])).toEqual([['ba.cold', ['apply'], '使敌人寒冷']])

    const overrides: Overrides = { [first.pending[0].key]: { types: ['exploit', 'apply'], reviewed: true } }
    const second = buildIndex({ cn, overrides })
    expect(typesFound(second.index, 'ba.cold')).toEqual(['apply', 'exploit'])
    expect(second.pending).toEqual([])
  })

  test('覆寫成沒有效果類型的配對不會成為命中敘述', () => {
    const cn = fixture({ 甲: '使敌人<$ba.cold>寒冷</>' })
    const key = buildIndex({ cn }).pending[0].key
    const { index, pending } = buildIndex({ cn, overrides: { [key]: { types: [], reviewed: true } } })
    expect(typesFound(index, 'ba.cold')).toEqual([])
    expect(pending).toEqual([])
  })

  test('待複核清單只列新增或變動的配對', () => {
    const before = fixture({ 甲: '使敌人<$ba.cold>寒冷</>', 乙: '免疫<$ba.stun>晕眩</>' })
    const first = buildIndex({ cn: before })
    expect(first.pending).toHaveLength(2)
    const overrides: Overrides = Object.fromEntries(first.pending.map((p) => [p.key, { types: p.ruleTypes, reviewed: true }]))

    const after = fixture({ 甲: '使敌人<$ba.cold>寒冷</>', 乙: '免疫<$ba.stun>晕眩</>和<$ba.cold>寒冷</>' })
    const second = buildIndex({ cn: after, overrides })
    expect(second.pending.map((p) => [p.keyword, p.text])).toEqual([
      ['ba.stun', '免疫晕眩和寒冷'],
      ['ba.cold', '免疫晕眩和寒冷'],
    ])
  })

  test('同一段敘述在多處出現時只列一次', () => {
    const { pending } = buildIndex({ cn: fixture({ 甲: '使敌人<$ba.cold>寒冷</>', 乙: '使敌人<$ba.cold>寒冷</>' }) })
    expect(pending).toHaveLength(1)
    expect(pending[0].where).toHaveLength(2)
  })
})
