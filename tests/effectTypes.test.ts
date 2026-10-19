import { describe, expect, test } from 'vitest'
import { type Overrides, buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import type { EffectType } from '../src/core/types'
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

/** 一段敘述對某關鍵字的效果類型(勾選全部三種時);沒有命中時為 undefined。 */
function effectOf(description: string, keyword: string): EffectType[] | undefined {
  const { index } = buildIndex({ cn: fixture({ 甲: description }), supplements: [DODGE] })
  return query(index, { keywords: [keyword], server: 'cn', effectTypes: ['apply', 'exploit', 'counter'] })[0]?.entries[0].stages[0].effects[keyword]
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
    const [result] = query(index, { keywords: [keyword], server: 'tw', effectTypes: ['apply', 'exploit', 'counter'] })
    expect(result.entries[0].stages[0].effects[keyword]).toEqual(expected)
  })

  test('句型判定不出、又不在覆寫檔的配對不會成為命中敘述,並列入待複核清單', () => {
    const cn = fixture({ 甲: '场上存在<$ba.cold>寒冷</>相关的效果时攻击力提升' })
    const { index, pending } = buildIndex({ cn })
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply', 'exploit', 'counter'] })).toEqual([])
    expect(pending.map((p) => [p.keyword, p.ruleTypes])).toEqual([['ba.cold', []]])
  })
})

describe('效果類型篩選', () => {
  const cn = fixture({
    施加者: '攻击使敌人<$ba.cold>寒冷</>',
    利用者: '对<$ba.cold>寒冷</>状态的敌人伤害提升',
    反制者: '免疫<$ba.cold>寒冷</>',
    施加又利用: '使敌人<$ba.cold>寒冷</>，对<$ba.cold>寒冷</>的敌人伤害提升',
  })

  test('只勾一種效果類型時只列出該類型;一段多類型的敘述在每種類型下都找得到', () => {
    const { index } = buildIndex({ cn })
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply'] }).map((r) => r.name)).toEqual(['施加者', '施加又利用'])
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['exploit'] }).map((r) => r.name)).toEqual(['利用者', '施加又利用'])
  })

  test('複選多種效果類型時放寬結果,結果只列勾選的類型', () => {
    const { index } = buildIndex({ cn })
    const results = query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply', 'counter'] })
    expect(results.map((r) => [r.name, r.entries[0].stages[0].effects['ba.cold']])).toEqual([
      ['施加者', ['apply']],
      ['反制者', ['counter']],
      ['施加又利用', ['apply']],
    ])
  })

  test('多關鍵字時,每個已選關鍵字都要有一段效果類型符合的命中敘述', () => {
    const { index } = buildIndex({
      cn: fixture({
        兩者都施加: '使敌人<$ba.levitate>浮空</>并<$ba.magicfragile>法术脆弱</>',
        只施加浮空: '使敌人<$ba.levitate>浮空</>，对<$ba.magicfragile>法术脆弱</>的敌人伤害提升',
      }),
    })
    const names = query(index, { keywords: ['ba.levitate', 'ba.magicfragile'], server: 'cn', effectTypes: ['apply'] }).map((r) => r.name)
    expect(names).toEqual(['兩者都施加'])
  })
})

describe('覆寫檔與待複核清單', () => {
  test('覆寫檔的判定優先於規則,能覆寫成多種效果類型,且不再列入待複核', () => {
    const cn = fixture({ 甲: '使敌人<$ba.cold>寒冷</>' })
    const first = buildIndex({ cn })
    expect(first.pending.map((p) => [p.keyword, p.ruleTypes, p.text])).toEqual([['ba.cold', ['apply'], '使敌人寒冷']])

    const overrides: Overrides = { [first.pending[0].key]: { types: ['exploit', 'apply'], reviewed: true } }
    const second = buildIndex({ cn, overrides })
    const effects = query(second.index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply', 'exploit', 'counter'] })[0].entries[0].stages[0].effects
    expect(effects).toEqual({ 'ba.cold': ['apply', 'exploit'] })
    expect(second.pending).toEqual([])
  })

  test('覆寫成沒有效果類型的配對不會成為命中敘述', () => {
    const cn = fixture({ 甲: '使敌人<$ba.cold>寒冷</>' })
    const key = buildIndex({ cn }).pending[0].key
    const { index, pending } = buildIndex({ cn, overrides: { [key]: { types: [], reviewed: true } } })
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply', 'exploit', 'counter'] })).toEqual([])
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
