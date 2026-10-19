import { describe, expect, test } from 'vitest'
import { type SupplementKeyword, buildIndex } from '../build/buildIndex'
import { keywordGroups, query } from '../src/core/query'
import { applying, COMMON_TERMS, basicSkill, highlights, operator, plain, server } from './fixtures'

const supplements: SupplementKeyword[] = [
  { id: 'knockback', name: '擊退', cn: ['推开', '击退'], tw: ['推開', '擊退'], definition: '把敵人往遠離自己的方向推動', group: '控場' },
  { id: 'truedmg', name: '真實傷害', cn: ['真实伤害'], tw: ['真實傷害'], definition: '無視防禦與法術抗性的傷害', group: '傷害' },
  { id: 'lift', name: '浮起', cn: ['浮空'], tw: ['浮空'], definition: '測試用', group: '控場' },
]

function fixture(descriptions: Record<string, string>) {
  const operators = Object.fromEntries(Object.keys(descriptions).map((name, i) => [`char_${500 + i}_s`, operator({ name, skills: [`sk_${i}`] })]))
  const skills = Object.values(descriptions).map((d, i) => basicSkill(`sk_${i}`, `技${i}`, { description: d }))
  return server({ terms: COMMON_TERMS, operators, skills })
}

describe('補充關鍵字', () => {
  test('以純文字比對清單中的字串,命中處高亮', () => {
    const { index } = buildIndex({ cn: fixture({ 推人者: '攻击将敌人<@ba.vup>推开</>一段距离', 無關者: '攻击力提升' }), supplements })
    const results = query(index, { conditions: applying('sup.knockback'), server: 'cn' })
    expect(results.map((r) => r.name)).toEqual(['推人者'])
    const runs = results[0].entries[0].stages[0].runs
    expect(plain(runs)).toBe('攻击将敌人推开一段距离')
    expect(highlights(runs)).toEqual([['推开', 'sup.knockback']])
  })

  test('比對字串可以跨越樣式標記', () => {
    const { index } = buildIndex({ cn: fixture({ 甲: '造成<@ba.vup>真实</>伤害' }), supplements })
    const [r] = query(index, { conditions: applying('sup.truedmg'), server: 'cn' })
    expect(highlights(r.entries[0].stages[0].runs)).toEqual([['真实伤害', 'sup.truedmg']])
  })

  test('已在術語標記內的文字不重複計算', () => {
    const { index } = buildIndex({
      cn: fixture({ 術語者: '使敌人<$ba.levitate>浮空</>', 純文字者: '使敌人浮空2秒' }),
      supplements,
    })
    expect(query(index, { conditions: applying('sup.lift'), server: 'cn' }).map((r) => r.name)).toEqual(['純文字者'])
    expect(query(index, { conditions: applying('ba.levitate'), server: 'cn' }).map((r) => r.name)).toEqual(['術語者'])
  })

  test('補充關鍵字可與術語多選 OR,並接受效果類型判定', () => {
    const { index } = buildIndex({
      cn: fixture({ 兩者: '使敌人<$ba.cold>寒冷</>并将其推开', 只寒冷: '使敌人<$ba.cold>寒冷</>', 無關: '攻击力提升' }),
      supplements,
    })
    const results = query(index, { conditions: applying('ba.cold', 'sup.knockback'), server: 'cn' })
    expect(results.map((r) => r.name)).toEqual(['兩者', '只寒冷'])
    expect(results.map((r) => r.entries[0].stages[0].effects)).toEqual([
      { 'ba.cold': ['apply'], 'sup.knockback': ['apply'] },
      { 'ba.cold': ['apply'] },
    ])
  })

  test('面板依清單分組,定義標為非官方', () => {
    const { index } = buildIndex({
      cn: fixture({ 甲: '将敌人推开', 乙: '造成真实伤害', 丙: '使敌人浮空2秒' }),
      groups: [{ name: '控場', keywords: ['ba.stun'] }],
      supplements,
    })
    const panel = keywordGroups(index, 'cn')
    expect(panel.map((g) => [g.name, g.keywords.map((k) => k.name)])).toEqual([
      ['控場', ['擊退', '浮起']],
      ['傷害', ['真實傷害']],
    ])
    const knockback = panel[0].keywords[0]
    expect(knockback.unofficial).toBe(true)
    expect(plain(knockback.definition)).toBe('把敵人往遠離自己的方向推動')
  })
})
