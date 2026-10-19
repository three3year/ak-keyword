import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { keywordGroups, query } from '../src/core/query'
import { COMMON_TERMS, highlights, masteredSkill, operator, plain, server } from './fixtures'

const cold = { description: '使敌人<$ba.cold>寒冷</>' }
const levitate = { description: '使敌人<$ba.levitate>浮空</>' }
const both = { description: '使敌人<$ba.levitate>浮空</>并<$ba.cold>寒冷</>' }

function fixture() {
  return server({
    terms: { ...COMMON_TERMS, 'ba.newterm': ['新效果', '新的效果'] },
    operators: {
      char_001_a: operator({ name: '兩技能', skills: ['sk_cold', 'sk_lev'] }),
      char_002_b: operator({ name: '只寒冷', skills: ['sk_cold'] }),
      char_003_c: operator({ name: '同一段', skills: ['sk_both'] }),
      char_004_d: operator({ name: '新術語', skills: ['sk_new'] }),
    },
    skills: [
      masteredSkill('sk_cold', '冰', cold, cold),
      masteredSkill('sk_lev', '浮', levitate, levitate),
      masteredSkill('sk_both', '双', both, both),
      masteredSkill('sk_new', '新', { description: '<$ba.newterm>新效果</>' }, { description: '<$ba.newterm>新效果</>' }),
    ],
  })
}

const groups = [
  { name: '控場', keywords: ['ba.levitate', 'ba.stun'] },
  { name: '減益', keywords: ['ba.cold'] },
]

describe('多關鍵字', () => {
  test('多選為 AND:不同關鍵字可以來自不同敘述', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    const results = query(index, { keywords: ['ba.cold', 'ba.levitate'], server: 'cn' })
    expect(results.map((r) => r.name).sort()).toEqual(['兩技能', '同一段'])
    expect(results.find((r) => r.name === '兩技能')!.entries.map((e) => e.source)).toEqual(['技能1', '技能2'])
  })

  test('命中敘述裡所有已選關鍵字都帶高亮', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    const [r] = query(index, { keywords: ['ba.cold', 'ba.levitate'], server: 'cn' }).filter((r) => r.name === '同一段')
    expect(highlights(r.entries[0].stages[0].runs)).toEqual([
      ['浮空', 'ba.levitate'],
      ['寒冷', 'ba.cold'],
    ])
  })
})

describe('關鍵字面板', () => {
  test('依維護者清單分組,清單沒列到的術語歸到「未分組」', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    const panel = keywordGroups(index, '')
    expect(panel.map((g) => [g.name, g.keywords.map((k) => k.name)])).toEqual([
      ['控場', ['浮空']],
      ['減益', ['寒冷']],
      ['未分組', ['新效果']],
    ])
  })

  test('打字過濾關鍵字名稱', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    expect(keywordGroups(index, '浮').map((g) => [g.name, g.keywords.map((k) => k.name)])).toEqual([['控場', ['浮空']]])
  })

  test('術語官方定義裡的巢狀術語標記被解析,不顯示原始標記', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    const coldKw = keywordGroups(index, '寒冷')[0].keywords[0]
    expect(plain(coldKw.definition)).toBe('攻击速度下降，如果在持续时间内再次受到寒冷效果则会变为冻结')
    expect(highlights(coldKw.definition)).toEqual([['冻结', 'ba.frozen']])
    expect(coldKw.unofficial).toBe(false)
  })
})
