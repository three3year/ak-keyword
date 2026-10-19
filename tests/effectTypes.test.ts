import { describe, expect, test } from 'vitest'
import { type Overrides, buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import type { EffectType } from '../src/core/types'
import { COMMON_TERMS, basicSkill, operator, server } from './fixtures'

/** 每位幹員一個技能,技能敘述由參數給定。 */
function fixture(descriptions: Record<string, string>) {
  const operators = Object.fromEntries(
    Object.keys(descriptions).map((name, i) => [`char_${400 + i}_x`, operator({ name, skills: [`sk_${i}`] })]),
  )
  const skills = Object.values(descriptions).map((d, i) => basicSkill(`sk_${i}`, `技${i}`, { description: d }))
  return server({ terms: { ...COMMON_TERMS, 'ba.inspire': ['鼓舞', '攻击力提升'] }, operators, skills })
}

function effectOf(description: string, keyword: string): EffectType | undefined {
  const { index } = buildIndex({ cn: fixture({ 甲: description }) })
  return query(index, { keywords: [keyword], server: 'cn' })[0]?.entries[0].stages[0].effects[keyword]
}

describe('效果類型的規則判定', () => {
  test.each([
    ['攻击使敌人<$ba.cold>寒冷</>3秒', 'ba.cold', 'apply'],
    ['对周围敌人造成伤害并使其陷入<$ba.stun>晕眩</>', 'ba.stun', 'apply'],
    ['范围内友方单位获得<$ba.inspire>鼓舞</>', 'ba.inspire', 'apply'],
    ['对<$ba.cold>寒冷</>状态的敌人造成的伤害提升30%', 'ba.cold', 'exploit'],
    ['攻击处于<$ba.levitate>浮空</>的敌人时攻击力提升', 'ba.levitate', 'exploit'],
    ['自身免疫<$ba.stun>晕眩</>', 'ba.stun', 'resist'],
    ['技能期间不会被<$ba.frozen>冻结</>', 'ba.frozen', 'resist'],
    ['场上存在<$ba.cold>寒冷</>相关的效果时攻击力提升', 'ba.cold', 'other'],
  ])('%s → %s 為 %s', (description, keyword, expected) => {
    expect(effectOf(description, keyword)).toBe(expected)
  })
})

describe('效果類型篩選', () => {
  const cn = fixture({
    施加者: '攻击使敌人<$ba.cold>寒冷</>',
    利用者: '对<$ba.cold>寒冷</>状态的敌人伤害提升',
    抵抗者: '免疫<$ba.cold>寒冷</>',
  })

  test('只勾一種效果類型時只列出該類型', () => {
    const { index } = buildIndex({ cn })
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply'] }).map((r) => r.name)).toEqual(['施加者'])
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['exploit'] }).map((r) => r.name)).toEqual(['利用者'])
  })

  test('複選多種效果類型時放寬結果', () => {
    const { index } = buildIndex({ cn })
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', effectTypes: ['apply', 'resist'] }).map((r) => r.name)).toEqual([
      '施加者',
      '抵抗者',
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
  test('覆寫檔的判定優先於規則,且不再列入待複核', () => {
    const cn = fixture({ 甲: '使敌人<$ba.cold>寒冷</>' })
    const first = buildIndex({ cn })
    expect(first.pending.map((p) => [p.keyword, p.ruleType, p.text])).toEqual([['ba.cold', 'apply', '使敌人寒冷']])

    const overrides: Overrides = { [first.pending[0].key]: { type: 'other', reviewed: true } }
    const second = buildIndex({ cn, overrides })
    expect(query(second.index, { keywords: ['ba.cold'], server: 'cn' })[0].entries[0].stages[0].effects).toEqual({ 'ba.cold': 'other' })
    expect(second.pending).toEqual([])
  })

  test('待複核清單只列新增或變動的配對', () => {
    const before = fixture({ 甲: '使敌人<$ba.cold>寒冷</>', 乙: '免疫<$ba.stun>晕眩</>' })
    const first = buildIndex({ cn: before })
    expect(first.pending).toHaveLength(2)
    const overrides: Overrides = Object.fromEntries(first.pending.map((p) => [p.key, { type: p.ruleType, reviewed: true }]))

    const after = fixture({ 甲: '使敌人<$ba.cold>寒冷</>', 乙: '免疫<$ba.stun>晕眩</>和<$ba.cold>寒冷</>' })
    const second = buildIndex({ cn: after, overrides })
    expect(second.pending.map((p) => [p.keyword, p.text])).toEqual([
      ['ba.stun', '免疫晕眩和寒冷'],
      ['ba.cold', '免疫晕眩和寒冷'],
    ])
  })

  test('同一段文字在多處出現時只列一次', () => {
    const { pending } = buildIndex({ cn: fixture({ 甲: '使敌人<$ba.cold>寒冷</>', 乙: '使敌人<$ba.cold>寒冷</>' }) })
    expect(pending).toHaveLength(1)
    expect(pending[0].where).toHaveLength(2)
  })
})
