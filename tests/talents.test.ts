import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import type { Run } from '../src/core/types'
import { COMMON_TERMS, type OperatorSpec, highlights, operator, plain, server } from './fixtures'

function search(spec: OperatorSpec, keyword: string) {
  const cn = server({ terms: COMMON_TERMS, operators: { char_100_t: operator(spec) } })
  const { index, warnings } = buildIndex({ cn })
  return { results: query(index, { keywords: [keyword], server: 'cn' }), warnings }
}

function bonuses(runs: Run[]): [string, string][] {
  return runs.filter((r) => r.p).map((r) => [r.t, r.p!])
}

describe('天賦', () => {
  test('天賦取精英二、潛能1 的版本,敘述來源標「天賦N」', () => {
    const { results } = search(
      {
        name: '天賦者',
        talents: [
          { name: '无关', description: '攻击力+10%' },
          { name: '冰心', e1Description: '攻击使敌人<$ba.cold>寒冷</>1秒', description: '攻击使敌人<$ba.cold>寒冷</>2秒' },
        ],
      },
      'ba.cold',
    )
    expect(results.map((r) => r.name)).toEqual(['天賦者'])
    const [entry] = results[0].entries
    expect(entry.source).toBe('天賦2')
    expect(entry.name).toBe('冰心')
    expect(entry.stages.map((s) => plain(s.runs))).toEqual(['攻击使敌人寒冷2秒'])
  })

  test('潛能加成以「A(+B)」呈現:A 為潛能1效果,B 註明由第幾潛能獲得', () => {
    const { results, warnings } = search(
      {
        name: '潛能者',
        talents: [
          {
            name: '寒意',
            description: '使敌人<$ba.cold>寒冷</>，攻击力+6%；对精英敌人攻击力+15%',
            potentials: [{ rank: 4, description: '使敌人<$ba.cold>寒冷</>，攻击力+9%<@ba.talpu>（+3%）</>；对精英敌人攻击力+18%<@ba.talpu>（+3%）</>' }],
          },
        ],
      },
      'ba.cold',
    )
    const runs = results[0].entries[0].stages[0].runs
    expect(plain(runs)).toBe('使敌人寒冷，攻击力+6%（+3%）；对精英敌人攻击力+15%（+3%）')
    expect(bonuses(runs)).toEqual([
      ['（+3%）', '潛能 5 獲得'],
      ['（+3%）', '潛能 5 獲得'],
    ])
    expect(highlights(runs)).toEqual([['寒冷', 'ba.cold']])
    expect(warnings).toEqual([])
  })

  test('逐級提升的潛能加成註明潛能範圍', () => {
    const { results } = search(
      {
        name: '機器人',
        talents: [
          {
            name: '冷却',
            description: '使敌人<$ba.cold>寒冷</>4秒',
            potentials: [
              { rank: 1, description: '使敌人<$ba.cold>寒冷</>5<@ba.talpu>（+1）</>秒' },
              { rank: 2, description: '使敌人<$ba.cold>寒冷</>6<@ba.talpu>（+2）</>秒' },
            ],
          },
        ],
      },
      'ba.cold',
    )
    const runs = results[0].entries[0].stages[0].runs
    expect(plain(runs)).toBe('使敌人寒冷4（+2）秒')
    expect(bonuses(runs)).toEqual([['（+2）', '潛能 2~3 逐級獲得']])
  })

  test('高潛能版本措辭稍有不同時,仍依數字順序對齊加成', () => {
    const { results, warnings } = search(
      {
        name: '措辭',
        talents: [
          {
            name: '坚守',
            description: '当阻挡住两个及以上的敌人时使其<$ba.cold>寒冷</>，防御力+16%',
            potentials: [{ rank: 4, description: '阻挡两个及以上的敌人时使其<$ba.cold>寒冷</>，防御力+19%<@ba.talpu>（+3%）</>' }],
          },
        ],
      },
      'ba.cold',
    )
    expect(plain(results[0].entries[0].stages[0].runs)).toBe('当阻挡住两个及以上的敌人时使其寒冷，防御力+16%（+3%）')
    expect(warnings).toEqual([])
  })

  test('數字個數對不上時只顯示潛能1 敘述並警告', () => {
    const { results, warnings } = search(
      {
        name: '對不齊',
        talents: [
          {
            name: '乱',
            description: '使敌人<$ba.cold>寒冷</>，攻击力+16%',
            potentials: [{ rank: 4, description: '使敌人<$ba.cold>寒冷</>3秒，攻击力+19%<@ba.talpu>（+3%）</>' }],
          },
        ],
      },
      'ba.cold',
    )
    expect(plain(results[0].entries[0].stages[0].runs)).toBe('使敌人寒冷，攻击力+16%')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('char_100_t')
  })

  test('隱藏的天賦不收錄', () => {
    const { results } = search({ name: '隱藏', talents: [{ name: '暗', description: '使敌人<$ba.cold>寒冷</>', hidden: true }] }, 'ba.cold')
    expect(results).toEqual([])
  })
})

describe('特性', () => {
  test('特性敘述參與比對,敘述來源標「特性」', () => {
    const { results } = search({ name: '特性者', trait: '攻击使目标<$ba.levitate>浮空</>' }, 'ba.levitate')
    expect(results[0].entries.map((e) => [e.source, plain(e.stages[0].runs)])).toEqual([['特性', '攻击使目标浮空']])
  })

  test('改寫的特性以數值表填入佔位符', () => {
    const { results } = search(
      { name: '改寫者', trait: '原本的特性', traitOverride: { description: '攻击使目标<$ba.levitate>浮空</>{t}秒', values: { t: 1.5 } } },
      'ba.levitate',
    )
    expect(plain(results[0].entries[0].stages[0].runs)).toBe('攻击使目标浮空1.5秒')
  })

  test('結果依特性、天賦、技能的順序列出,並帶各自的敘述來源種類', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_100_t: operator({
          name: '全都有',
          trait: '使敌人<$ba.cold>寒冷</>',
          talents: [{ name: '冰', description: '使敌人<$ba.cold>寒冷</>' }],
          skills: ['sk_1'],
        }),
      },
      skills: [{ skillId: 'sk_1', levels: Array(7).fill({ name: '技', description: '使敌人<$ba.cold>寒冷</>', blackboard: [] }) }],
    })
    const [r] = query(buildIndex({ cn }).index, { keywords: ['ba.cold'], server: 'cn' })
    expect(r.entries.map((e) => [e.source, e.kind])).toEqual([
      ['特性', 'trait'],
      ['天賦1', 'talent'],
      ['技能1', 'skill'],
    ])
  })
})
