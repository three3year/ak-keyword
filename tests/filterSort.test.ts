import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { filterOptions, query } from '../src/core/query'
import { COMMON_TERMS, type OperatorSpec, basicSkill, operator, server, withRelease } from './fixtures'

const cold = { description: '使敌人<$ba.cold>寒冷</>' }

/** 依「舊 → 新」的順序建立幹員,每位都能上寒冷。 */
function fixture(specs: (Omit<OperatorSpec, 'skills'> & { id: string })[]) {
  const operators = Object.fromEntries(specs.map((s) => [s.id, operator({ ...s, skills: ['sk_cold'] })]))
  const cn = server({ terms: COMMON_TERMS, operators, skills: [basicSkill('sk_cold', '冷', cold)] })
  cn.uniequipTable = {
    equipDict: {},
    subProfDict: {
      corecaster: { subProfessionId: 'corecaster', subProfessionName: '中坚术师' },
      splashcaster: { subProfessionId: 'splashcaster', subProfessionName: '扩散术师' },
      instructor: { subProfessionId: 'instructor', subProfessionName: '教官' },
    },
  }
  const tw = server({ terms: COMMON_TERMS, operators: {} })
  tw.uniequipTable = {
    equipDict: {},
    subProfDict: { corecaster: { subProfessionId: 'corecaster', subProfessionName: '中堅術師' } },
  }
  return { cn: withRelease(cn, specs.map((s) => s.id)), tw }
}

const roster = [
  { id: 'char_701_a', name: '老六星術師', rarity: 6, profession: 'CASTER', sub: 'corecaster' },
  { id: 'char_702_b', name: '五星近衛', rarity: 5, profession: 'WARRIOR', sub: 'instructor' },
  { id: 'char_703_c', name: '新六星術師', rarity: 6, profession: 'CASTER', sub: 'splashcaster' },
  { id: 'char_704_d', name: '六星近衛', rarity: 6, profession: 'WARRIOR', sub: 'instructor' },
  { id: 'char_705_e', name: '四星術師', rarity: 4, profession: 'CASTER', sub: 'corecaster' },
]

describe('排序', () => {
  test('依星級高到低、職業(遊戲內順序)、實裝新到舊排列', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { keywords: ['ba.cold'], server: 'cn' }).map((r) => r.name)).toEqual([
      '六星近衛',
      '新六星術師',
      '老六星術師',
      '五星近衛',
      '四星術師',
    ])
  })
})

describe('篩選', () => {
  test('星級複選', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', rarities: [5, 4] }).map((r) => r.name)).toEqual(['五星近衛', '四星術師'])
  })

  test('職業篩選', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', professions: ['WARRIOR'] }).map((r) => r.name)).toEqual([
      '六星近衛',
      '五星近衛',
    ])
  })

  test('分支篩選', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { keywords: ['ba.cold'], server: 'cn', subProfessions: ['corecaster'] }).map((r) => r.name)).toEqual([
      '老六星術師',
      '四星術師',
    ])
  })

  test('篩選選項:職業依遊戲順序,分支名稱優先用台服', () => {
    const { index } = buildIndex(fixture(roster))
    expect(filterOptions(index)).toEqual({
      rarities: [6, 5, 4],
      professions: [
        { id: 'WARRIOR', name: '近衛', branches: [{ id: 'instructor', name: '教官' }] },
        {
          id: 'CASTER',
          name: '術師',
          branches: [
            { id: 'corecaster', name: '中堅術師' },
            { id: 'splashcaster', name: '扩散术师' },
          ],
        },
      ],
    })
  })
})
