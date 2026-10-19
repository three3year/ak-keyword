import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { keywordGroups, query } from '../src/core/query'
import type { SearchIndex, Server } from '../src/core/types'
import { applying, COMMON_TERMS, highlights, masteredSkill, operator, plain, server } from './fixtures'

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
      masteredSkill('sk_new', '新', { description: '使敌人<$ba.newterm>新效果</>' }, { description: '使敌人<$ba.newterm>新效果</>' }),
    ],
  })
}

const groups = [
  { name: '控場', rows: [['ba.levitate', 'ba.stun']] },
  { name: '減益', rows: [['ba.cold']] },
]

describe('多關鍵字', () => {
  test('多選為 OR:任一關鍵字命中就列入,不同關鍵字可以來自不同敘述', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    const results = query(index, { conditions: applying('ba.cold', 'ba.levitate'), server: 'cn' })
    expect(results.map((r) => r.name).sort()).toEqual(['兩技能', '只寒冷', '同一段'].sort())
    expect(results.find((r) => r.name === '兩技能')!.entries.map((e) => e.source)).toEqual(['技能1', '技能2'])
  })

  test('命中敘述裡所有已選關鍵字都帶高亮', () => {
    const { index } = buildIndex({ cn: fixture(), groups })
    const [r] = query(index, { conditions: applying('ba.cold', 'ba.levitate'), server: 'cn' }).filter((r) => r.name === '同一段')
    expect(highlights(r.entries[0].stages[0].runs)).toEqual([
      ['浮空', 'ba.levitate'],
      ['寒冷', 'ba.cold'],
    ])
  })
})

describe('關鍵字面板', () => {
  const supplements = [
    { id: 'push', name: '推', cn: ['推开'], tw: ['推开'], definition: '推遠' },
    { id: 'pull', name: '拉', cn: ['拉向'], tw: ['拉向'], definition: '拉近' },
    { id: 'mark', name: '標記', cn: ['标记'], tw: ['标记'], definition: '測試用' },
  ]
  const panelGroups = [
    { name: '控場', rows: [['sup.pull', 'ba.stun', 'sup.push'], ['ba.levitate']] },
    { name: '減益', rows: [['ba.cold']] },
  ]
  const skillOf: Record<string, string> = {
    sk_cold: '使敌人<$ba.cold>寒冷</>',
    sk_lev: '使敌人<$ba.levitate>浮空</>',
    sk_stun: '使敌人<$ba.stun>晕眩</>',
    sk_new: '使敌人<$ba.newterm>新效果</>',
    sk_push: '将敌人推开',
    sk_pull: '将敌人拉向自身',
    sk_mark: '使敌人标记',
  }
  function panelServer(skillIds: string[]) {
    return server({
      terms: { ...COMMON_TERMS, 'ba.newterm': ['新效果', '新的效果'] },
      operators: Object.fromEntries(skillIds.map((id) => [`char_${id}`, operator({ name: id, skills: [id] })])),
      skills: skillIds.map((id) => masteredSkill(id, id, { description: skillOf[id] }, { description: skillOf[id] })),
    })
  }
  const rows = (index: SearchIndex, s: Server) => keywordGroups(index, s).map((g) => [g.name, g.rows.map((r) => r.map((k) => k.name))])

  test('依清單的分組、行與順序排列,術語與補充關鍵字可以交錯;清單沒列到的術語與補充關鍵字歸到「未分組」,為一行', () => {
    const { index } = buildIndex({ cn: panelServer(Object.keys(skillOf)), groups: panelGroups, supplements })
    expect(rows(index, 'cn')).toEqual([
      ['控場', [['拉', '晕眩', '推'], ['浮空']]],
      ['減益', [['寒冷']]],
      ['未分組', [['新效果', '標記']]],
    ])
  })

  test('只列出該伺服器有幹員具有任一效果類型的關鍵字,不列空行與空分組', () => {
    const { index } = buildIndex({
      cn: panelServer(Object.keys(skillOf)),
      tw: panelServer(['sk_cold', 'sk_push']),
      groups: panelGroups,
      supplements,
    })
    expect(rows(index, 'tw')).toEqual([
      ['控場', [['推']]],
      ['減益', [['寒冷']]],
    ])
    expect(rows(index, 'cn')).toEqual([
      ['控場', [['拉', '晕眩', '推'], ['浮空']]],
      ['減益', [['寒冷']]],
      ['未分組', [['新效果', '標記']]],
    ])
  })

  test('判定不出效果類型的關鍵字不列出', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_a: operator({ name: '甲', skills: ['sk_x'] }) },
      skills: [masteredSkill('sk_x', '甲', cold, { description: '场上存在<$ba.levitate>浮空</>相关的效果时攻击力提升' })],
    })
    const { index } = buildIndex({ cn, groups: panelGroups })
    expect(rows(index, 'cn')).toEqual([['減益', [['寒冷']]]])
  })

  test('術語官方定義裡的巢狀術語標記被解析,不顯示原始標記;補充關鍵字的定義標為非官方', () => {
    const { index } = buildIndex({ cn: panelServer(['sk_cold', 'sk_push']), groups: panelGroups, supplements })
    const all = keywordGroups(index, 'cn').flatMap((g) => g.rows.flat())
    const coldKw = all.find((k) => k.name === '寒冷')!
    expect(plain(coldKw.definition)).toBe('攻击速度下降，如果在持续时间内再次受到寒冷效果则会变为冻结')
    expect(highlights(coldKw.definition)).toEqual([['冻结', 'ba.frozen']])
    expect(coldKw.unofficial).toBe(false)
    expect(all.find((k) => k.name === '推')!.unofficial).toBe(true)
  })
})

describe('排除的術語', () => {
  function excludedFixture() {
    const team = { description: '<$ba.mujica>Ave Mujica</>干员在场时使敌人<$ba.cold>寒冷</>' }
    return server({
      terms: { ...COMMON_TERMS, 'ba.mujica': ['Ave Mujica', '乐队'] },
      operators: {
        char_001_a: operator({ name: '隊員', skills: ['sk_team'] }),
        char_002_b: operator({ name: '只有隊名', skills: ['sk_only'] }),
      },
      skills: [
        masteredSkill('sk_team', '队', team, team),
        masteredSkill('sk_only', '名', { description: '使<$ba.mujica>Ave Mujica</>干员攻击力提升' }, { description: '使<$ba.mujica>Ave Mujica</>干员攻击力提升' }),
      ],
    })
  }

  test('排除的術語不在關鍵字清單,含它的敘述顯示為一般文字、不產生該術語的命中', () => {
    const { index, pending } = buildIndex({ cn: excludedFixture(), groups, excludedTerms: ['ba.mujica'] })
    expect(index.keywords.map((k) => k.id)).toEqual(['ba.cold'])
    expect(query(index, { conditions: applying('ba.mujica'), server: 'cn' })).toEqual([])
    const [r] = query(index, { conditions: applying('ba.cold'), server: 'cn' })
    expect(plain(r.entries[0].stages[0].runs)).toBe('Ave Mujica干员在场时使敌人寒冷')
    expect(highlights(r.entries[0].stages[0].runs)).toEqual([['寒冷', 'ba.cold']])
    expect(pending.map((p) => p.keyword)).toEqual(['ba.cold'])
  })
})
