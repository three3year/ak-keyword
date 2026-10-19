import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { diffWarnings } from '../build/warnings'
import { basicSkill, COMMON_TERMS, operator, server } from './fixtures'

/** 每段技能敘述都缺結尾的關閉標記,各產生一則「標記未關閉」警告。 */
function warningsOf(descriptions: string[]): string[] {
  const skills = descriptions.map((description, i) => basicSkill(`sk_x_${i}`, '技', { description }))
  const cn = server({
    terms: COMMON_TERMS,
    operators: { char_001_x: operator({ name: '甲', skills: skills.map((s) => s.skillId) }) },
    skills,
  })
  return buildIndex({ cn }).warnings
}

const unclosedA = '使敌人<$ba.cold>寒冷'
const unclosedB = '使敌人<$ba.stun>晕眩'

describe('已知警告', () => {
  test('已知警告清單為空時,全部警告都是新警告', () => {
    const warnings = warningsOf([unclosedA, unclosedB])
    expect(warnings).toHaveLength(2)
    expect(diffWarnings(warnings, [])).toEqual({ newWarnings: warnings, resolvedWarnings: [] })
  })

  test('清單裡有的警告不算新警告', () => {
    const warnings = warningsOf([unclosedA, unclosedB])
    expect(diffWarnings(warnings, [warnings[0]])).toEqual({ newWarnings: [warnings[1]], resolvedWarnings: [] })
  })

  test('清單裡有、這次沒出現的警告列為已消失', () => {
    const known = warningsOf([unclosedA, unclosedB])
    expect(diffWarnings(warningsOf([unclosedA]), known)).toEqual({ newWarnings: [], resolvedWarnings: [known[1]] })
  })

  test('全文一字不差才算同一則', () => {
    const warnings = warningsOf([unclosedA])
    const known = [warnings[0] + ' ']
    expect(diffWarnings(warnings, known)).toEqual({ newWarnings: warnings, resolvedWarnings: known })
  })

  test('含換行的警告也能比對', () => {
    const warnings = warningsOf(['使敌人<$ba.cold>寒冷\n持续3秒'])
    expect(warnings[0]).toContain('\n')
    expect(diffWarnings(warningsOf(['使敌人<$ba.cold>寒冷\n持续3秒']), warnings)).toEqual({ newWarnings: [], resolvedWarnings: [] })
  })
})
