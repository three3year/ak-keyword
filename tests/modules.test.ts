import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { query } from '../src/core/query'
import { COMMON_TERMS, type ModuleSpec, type OperatorSpec, operator, plain, server } from './fixtures'

function search(spec: OperatorSpec, modules: Omit<ModuleSpec, 'charId'>[], keyword: string) {
  const cn = server({
    terms: COMMON_TERMS,
    operators: { char_200_m: operator(spec) },
    modules: modules.map((m) => ({ ...m, charId: 'char_200_m' })),
  })
  const { index, warnings } = buildIndex({ cn })
  return { results: query(index, { keywords: [keyword], server: 'cn' }), warnings }
}

const stagesOf = (e: { stages: { label: string; runs: { t: string }[]; hit: boolean }[] }) =>
  e.stages.map((s) => [s.label, plain(s.runs as never), s.hit])

describe('模組3 階段', () => {
  test('只有模組3 改寫後才有的效果也搜得到;模組3 階段標模組代碼,模組全名另以欄位提供', () => {
    const { results } = search(
      { name: '模組者', trait: '攻击造成法术伤害' },
      [{ id: 'uniequip_002_m', name: '冰霜核心', code: 'CCR-X', trait: { add: '攻击使敌人<$ba.cold>寒冷</>' } }],
      'ba.cold',
    )
    const [entry] = results[0].entries
    expect(entry.source).toBe('特性')
    expect(stagesOf(entry)).toEqual([
      ['無模組', '攻击造成法术伤害', false],
      ['模組3 · CCR-X', '攻击造成法术伤害\n攻击使敌人寒冷', true],
    ])
    expect(entry.stages.map((s) => s.module)).toEqual([undefined, '冰霜核心'])
  })

  test('多模組各自比對:兩個模組只有其一命中時,只有那一個階段命中', () => {
    const { results } = search(
      { name: '雙模組', talents: [{ name: '天赋', description: '攻击力+10%' }] },
      [
        { id: 'uniequip_002_m', name: '甲模組', code: 'CCR-X', talents: [{ index: 0, name: '天赋', description: '攻击力+12%' }] },
        { id: 'uniequip_003_m', name: '乙模組', code: 'CCR-Y', talents: [{ index: 0, name: '天赋', description: '攻击力+12%，并使敌人<$ba.cold>寒冷</>' }] },
      ],
      'ba.cold',
    )
    const [entry] = results[0].entries
    expect(entry.source).toBe('天賦1')
    expect(stagesOf(entry)).toEqual([
      ['無模組', '攻击力+10%', false],
      ['模組3 · CCR-X', '攻击力+12%', false],
      ['模組3 · CCR-Y', '攻击力+12%，并使敌人寒冷', true],
    ])
    expect(entry.stages.map((s) => s.module)).toEqual([undefined, '甲模組', '乙模組'])
  })

  test('無模組與模組3 都命中;特性的 override 取代原特性', () => {
    const { results } = search(
      { name: '都有', trait: '攻击使敌人<$ba.cold>寒冷</>' },
      [{ id: 'uniequip_002_m', name: '強化', code: 'CCR-X', trait: { override: '攻击使敌人<$ba.cold>寒冷</>{t}秒', values: { t: 2 } } }],
      'ba.cold',
    )
    const [entry] = results[0].entries
    expect(stagesOf(entry)).toEqual([
      ['無模組', '攻击使敌人寒冷', true],
      ['模組3 · CCR-X', '攻击使敌人寒冷2秒', true],
    ])
  })

  test('模組沒有改寫的天賦或特性,不重複列出模組3 階段', () => {
    const { results } = search(
      { name: '只改特性', trait: '攻击力提升', talents: [{ name: '冰心', description: '使敌人<$ba.cold>寒冷</>' }] },
      [{ id: 'uniequip_002_m', name: '特性模組', code: 'CCR-X', trait: { add: '额外攻击力' } }],
      'ba.cold',
    )
    expect(results[0].entries.map((e) => [e.source, e.stages.map((s) => s.label)])).toEqual([['天賦1', ['']]])
  })

  test('模組新增的天賦接續編號成為天賦N,最前面是不存在的無模組階段;也呈現潛能加成', () => {
    const { results } = search(
      {
        name: '新天賦',
        talents: [
          { name: '原天赋一', description: '攻击力+10%' },
          { name: '原天赋二', description: '防御力+10%' },
        ],
      },
      [
        {
          id: 'uniequip_002_m',
          name: '新增模組',
          code: 'CCR-X',
          talents: [
            {
              index: -1,
              name: '寒流',
              description: '攻击使敌人<$ba.cold>寒冷</>2秒',
              potentials: [{ rank: 4, description: '攻击使敌人<$ba.cold>寒冷</>3<@ba.talpu>（+1）</>秒' }],
            },
          ],
        },
      ],
      'ba.cold',
    )
    const [entry] = results[0].entries
    expect([entry.source, entry.name]).toEqual(['天賦3', '寒流'])
    expect(entry.stages.map((s) => [s.label, plain(s.runs), s.hit, s.absent ?? false])).toEqual([
      ['無模組', '', false, true],
      ['模組3 · CCR-X', '攻击使敌人寒冷2（+1）秒', true, false],
    ])
    expect(entry.stages.map((s) => s.module)).toEqual([undefined, '新增模組'])
  })

  test('兩個模組各新增天賦時併成同一段天賦,各有一個模組3 階段;天賦名不同時發警告並取第一個', () => {
    const { results, warnings } = search(
      { name: '雙新增', talents: [{ name: '原天赋', description: '攻击力+10%' }] },
      [
        { id: 'uniequip_002_m', name: '甲模組', code: 'CCR-X', talents: [{ index: -1, name: '寒流', description: '攻击力+5%' }] },
        { id: 'uniequip_003_m', name: '乙模組', code: 'CCR-Y', talents: [{ index: -1, name: '霜降', description: '攻击使敌人<$ba.cold>寒冷</>' }] },
      ],
      'ba.cold',
    )
    expect(results[0].entries.map((e) => [e.source, e.name])).toEqual([['天賦2', '寒流']])
    expect(stagesOf(results[0].entries[0])).toEqual([
      ['無模組', '', false],
      ['模組3 · CCR-X', '攻击力+5%', false],
      ['模組3 · CCR-Y', '攻击使敌人寒冷', true],
    ])
    expect(warnings.filter((w) => w.includes('寒流') && w.includes('霜降'))).toHaveLength(1)
  })
})
