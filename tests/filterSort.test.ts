import { describe, expect, test } from 'vitest'
import { buildIndex } from '../build/buildIndex'
import { filterOptions, query } from '../src/core/query'
import { applying, COMMON_TERMS, type OperatorSpec, basicSkill, operator, server, withRelease } from './fixtures'

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
    expect(query(index, { conditions: applying('ba.cold'), server: 'cn' }).map((r) => r.name)).toEqual([
      '六星近衛',
      '新六星術師',
      '老六星術師',
      '五星近衛',
      '四星術師',
    ])
  })

  test('多個搜尋條件(OR)的結果照樣依星級、職業、實裝排列,不依符合項數', () => {
    const stun = { description: '使敌人<$ba.stun>晕眩</>' }
    const both = { description: '使敌人<$ba.stun>晕眩</>并<$ba.cold>寒冷</>' }
    const specs: [string, OperatorSpec][] = [
      ['char_711_a', { name: '老六星寒冷', rarity: 6, profession: 'CASTER', skills: ['sk_cold'] }],
      ['char_712_b', { name: '五星兩者', rarity: 5, profession: 'CASTER', skills: ['sk_both'] }],
      ['char_713_c', { name: '新六星暈眩', rarity: 6, profession: 'CASTER', skills: ['sk_stun'] }],
      ['char_714_d', { name: '六星近衛暈眩', rarity: 6, profession: 'WARRIOR', skills: ['sk_stun'] }],
    ]
    const cn = server({
      terms: COMMON_TERMS,
      operators: Object.fromEntries(specs.map(([id, s]) => [id, operator(s)])),
      skills: [basicSkill('sk_cold', '冷', cold), basicSkill('sk_stun', '晕', stun), basicSkill('sk_both', '双', both)],
    })
    const { index } = buildIndex({ cn: withRelease(cn, specs.map(([id]) => id)) })
    expect(query(index, { conditions: applying('ba.cold', 'ba.stun'), server: 'cn' }).map((r) => r.name)).toEqual([
      '六星近衛暈眩',
      '新六星暈眩',
      '老六星寒冷',
      '五星兩者',
    ])
  })
})

describe('篩選', () => {
  test('星級複選', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { conditions: applying('ba.cold'), server: 'cn', rarities: [5, 4] }).map((r) => r.name)).toEqual(['五星近衛', '四星術師'])
  })

  test('職業條件與搜尋條件同時符合才列入', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { conditions: applying('ba.cold'), server: 'cn', professions: ['WARRIOR'] }).map((r) => r.name)).toEqual([
      '六星近衛',
      '五星近衛',
    ])
  })

  test('只有職業條件:列出該職業全部幹員(含沒有任何關鍵字的),命中敘述為空', () => {
    const raw = fixture(roster)
    raw.cn.characterTable.char_706_f = operator({ name: '無關鍵字近衛', rarity: 3, profession: 'WARRIOR', sub: 'instructor' })
    const { index } = buildIndex(raw)
    const results = query(index, { conditions: [], server: 'cn', professions: ['WARRIOR'] })
    expect(results.map((r) => r.name)).toEqual(['六星近衛', '五星近衛', '無關鍵字近衛'])
    expect(results.every((r) => r.entries.length === 0)).toBe(true)
  })

  test('兩個職業條件:兩個職業的幹員都列入,照星級、職業、實裝排序', () => {
    const raw = fixture(roster)
    raw.cn.characterTable.char_706_f = operator({ name: '先鋒', profession: 'PIONEER', sub: 'pioneer' })
    const { index } = buildIndex(raw)
    expect(query(index, { conditions: [], server: 'cn', professions: ['CASTER', 'WARRIOR'] }).map((r) => r.name)).toEqual([
      '六星近衛',
      '新六星術師',
      '老六星術師',
      '五星近衛',
      '四星術師',
    ])
  })

  test('職業條件 + 星級篩選:只列符合星級的', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { conditions: [], server: 'cn', professions: ['CASTER'], rarities: [6] }).map((r) => r.name)).toEqual([
      '新六星術師',
      '老六星術師',
    ])
  })

  test('只有星級篩選不開始搜尋', () => {
    const { index } = buildIndex(fixture(roster))
    expect(query(index, { conditions: [], server: 'cn', rarities: [6] })).toEqual([])
  })

  test('台服模式的職業條件略過台服未實裝的幹員', () => {
    const raw = fixture(roster)
    raw.tw.characterTable.char_702_b = operator({ name: '五星近衛', rarity: 5, profession: 'WARRIOR', sub: 'instructor' })
    const { index } = buildIndex(raw)
    expect(query(index, { conditions: [], server: 'tw', professions: ['WARRIOR'] }).map((r) => r.name)).toEqual(['五星近衛'])
  })

  test('篩選選項:星級高到低,職業依遊戲順序,不含分支', () => {
    const { index } = buildIndex(fixture(roster))
    expect(filterOptions(index)).toEqual({
      rarities: [6, 5, 4],
      professions: [
        { id: 'WARRIOR', name: '近衛' },
        { id: 'CASTER', name: '術師' },
      ],
    })
  })

  test('分支名稱優先用台服,供結果卡顯示', () => {
    const { index } = buildIndex(fixture(roster))
    expect(Object.fromEntries(Object.entries(index.subProfessions).map(([id, s]) => [id, s.name]))).toEqual({
      corecaster: '中堅術師',
      instructor: '教官',
      splashcaster: '扩散术师',
    })
  })
})
