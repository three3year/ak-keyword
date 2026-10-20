import { describe, expect, test } from 'vitest'
import { attachOperatorFiles, buildIndex } from '../build/buildIndex'
import type { RawServer } from '../build/raw'
import { operatorDetail } from '../src/core/query'
import type { DetailEntry, OperatorDetail, SearchCondition, Server } from '../src/core/types'
import { applying, basicSkill, COMMON_TERMS, highlights, masteredSkill, operator, plain, server } from './fixtures'

function detail(raw: { cn: RawServer; tw?: RawServer }, id: string, opts: { server?: Server; conditions?: SearchCondition[] } = {}): OperatorDetail {
  const { operatorFiles } = buildIndex(raw)
  const file = operatorFiles.find((f) => f.id === id)!
  return operatorDetail(file, { server: opts.server ?? 'cn', conditions: opts.conditions ?? [] })
}

const entriesOf = (d: OperatorDetail, label: string): DetailEntry[] => d.tabs.find((t) => t.label === label)?.entries ?? []

/** 特性、兩段天賦(只有天賦1 有關鍵字)、兩個技能(只有技能2 有關鍵字)。 */
function caster() {
  return server({
    terms: COMMON_TERMS,
    operators: {
      char_001_x: operator({
        name: '冰原',
        trait: '攻击造成法术伤害',
        talents: [
          { name: '冰心', description: '攻击使敌人<$ba.cold>寒冷</>' },
          { name: '博学', description: '攻击力+10%' },
        ],
        skills: ['sk_1', 'sk_2'],
      }),
    },
    skills: [
      masteredSkill('sk_1', '强力击', { description: '攻击力+50%', sp: { spCost: 9 } }, { description: '攻击力+80%', sp: { spCost: 8 } }),
      masteredSkill('sk_2', '冰封', { description: '攻击力提升' }, { description: '攻击力提升并使敌人<$ba.cold>寒冷</>' }),
    ],
  })
}

describe('幹員詳情', () => {
  test('分頁依序是特性、天賦、技能,預設技能;沒有關鍵字的敘述也列出', () => {
    const d = detail({ cn: caster() }, 'char_001_x')
    expect(d.tabs.map((t) => [t.kind, t.label])).toEqual([
      ['trait', '特性'],
      ['talent', '天賦'],
      ['skill', '技能'],
    ])
    expect(d.defaultTab).toBe('skill')
    expect(entriesOf(d, '特性').map((e) => [e.source, plain(e.stages[0].runs)])).toEqual([['特性', '攻击造成法术伤害']])
    expect(entriesOf(d, '天賦').map((e) => [e.source, e.name])).toEqual([
      ['天賦1', '冰心'],
      ['天賦2', '博学'],
    ])
    expect(entriesOf(d, '技能').map((e) => [e.source, e.name, e.stages.map((s) => s.label)])).toEqual([
      ['技能1', '强力击', ['等級7', '專精3']],
      ['技能2', '冰封', ['等級7', '專精3']],
    ])
  })

  test('沒有技能的幹員沒有技能頁,預設天賦', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_002_low: operator({ name: '低星', rarity: 1, trait: '不占部署位', talents: [{ name: '支援', description: '攻击力+10%' }] }) },
    })
    const d = detail({ cn }, 'char_002_low')
    expect(d.tabs.map((t) => t.label)).toEqual(['特性', '天賦'])
    expect(d.defaultTab).toBe('talent')
  })

  test('召喚物的天賦與技能排在同一頁最後,帶召喚物名', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_300_owner: operator({
          name: '召喚師',
          skills: ['sk_owner_1'],
          talents: [{ name: '主天赋', description: '攻击力+10%' }],
          tokens: ['token_300_ice'],
        }),
        token_300_ice: operator({
          name: '冰灵',
          profession: 'TOKEN',
          skills: ['sktok_ice_1'],
          talents: [{ name: '冰体', description: '防御力+10%' }],
        }),
      },
      skills: [
        masteredSkill('sk_owner_1', '召唤', { description: '召唤冰灵' }, { description: '召唤冰灵' }),
        basicSkill('sktok_ice_1', '冰息', { description: '吐息', skillType: 'AUTO', sp: { spType: 8 } }),
      ],
    })
    const d = detail({ cn }, 'char_300_owner')
    expect(entriesOf(d, '天賦').map((e) => [e.source, e.name, e.summon])).toEqual([
      ['天賦1', '主天赋', undefined],
      ['召喚物天賦1', '冰体', '冰灵'],
    ])
    expect(entriesOf(d, '技能').map((e) => [e.source, e.name, e.summon, e.stages.map((s) => s.label)])).toEqual([
      ['技能1', '召唤', undefined, ['等級7', '專精3']],
      ['召喚物技能1', '冰息', '冰灵', ['等級7']],
    ])
  })

  test('召喚物的同一段技能文字相同但技力不同時不合併', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: {
        char_304_m: operator({ name: '多召喚', tokens: ['token_304_a', 'token_304_b'] }),
        token_304_a: operator({ name: '甲型', profession: 'TOKEN', skills: ['sktok_a'] }),
        token_304_b: operator({ name: '乙型', profession: 'TOKEN', skills: ['sktok_b'] }),
      },
      skills: [
        basicSkill('sktok_a', '冲击', { description: '攻击力提升', sp: { spCost: 10 } }),
        basicSkill('sktok_b', '冲击', { description: '攻击力提升', sp: { spCost: 20 } }),
      ],
    })
    const skills = entriesOf(detail({ cn }, 'char_304_m'), '技能')
    expect(skills.map((e) => [e.summon, e.stages[0].stats?.sp?.cost])).toEqual([
      ['甲型', 10],
      ['乙型', 20],
    ])
  })

  test('模組新增的天賦:無模組階段不存在,預設停在第一個模組3', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_200_m: operator({ name: '模組者', talents: [{ name: '原天赋', description: '攻击力+10%' }] }) },
      modules: [
        { id: 'uniequip_002_m', charId: 'char_200_m', name: '甲模組', code: 'CCR-X', talents: [{ index: -1, name: '寒流', description: '攻击力+5%' }] },
        { id: 'uniequip_003_m', charId: 'char_200_m', name: '乙模組', code: 'CCR-Y', talents: [{ index: -1, name: '寒流', description: '攻击力+6%' }] },
      ],
    })
    const [, added] = entriesOf(detail({ cn }, 'char_200_m'), '天賦')
    expect([added.source, added.name]).toEqual(['天賦2', '寒流'])
    expect(added.stages.map((s) => [s.label, s.absent ?? false, s.module])).toEqual([
      ['無模組', true, undefined],
      ['模組3 · CCR-X', false, '甲模組'],
      ['模組3 · CCR-Y', false, '乙模組'],
    ])
    expect(added.defaultStage).toBe(1)
  })

  test('預設階段是最低的存在階段,即使只有專精3 命中', () => {
    const d = detail({ cn: caster() }, 'char_001_x', { conditions: applying('ba.cold') })
    const [, frozen] = entriesOf(d, '技能')
    expect(frozen.stages.map((s) => s.hit)).toEqual([false, true])
    expect(frozen.defaultStage).toBe(0)
  })

  test('命中目前搜尋條件的階段有高亮、命中旗標與效果類型;未命中的階段沒有', () => {
    const d = detail({ cn: caster() }, 'char_001_x', { conditions: applying('ba.cold') })
    const [, frozen] = entriesOf(d, '技能')
    const [lv7, m3] = frozen.stages
    expect([m3.hit, m3.effects]).toEqual([true, { 'ba.cold': ['apply'] }])
    expect(lit(m3.runs)).toEqual(['寒冷'])
    expect([lv7.hit, lv7.effects, lit(lv7.runs)]).toEqual([false, {}, []])
    const [skill1] = entriesOf(d, '技能')
    expect(skill1.stages.map((s) => s.hit)).toEqual([false, false])
  })

  test('同一關鍵字的效果類型不符合搜尋條件時,不算命中也不高亮;其他關鍵字照樣標關鍵字但不高亮', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_001_x: operator({ name: '甲', talents: [{ name: '冰', description: '对<$ba.cold>寒冷</>敌人造成伤害，并使其<$ba.stun>晕眩</>' }] }) },
    })
    const [talent] = entriesOf(detail({ cn }, 'char_001_x', { conditions: applying('ba.cold', 'ba.stun') }), '天賦')
    expect(talent.stages[0].effects).toEqual({ 'ba.stun': ['apply'] })
    expect(lit(talent.stages[0].runs)).toEqual(['晕眩'])
    expect(highlights(talent.stages[0].runs)).toEqual([
      ['寒冷', 'ba.cold'],
      ['晕眩', 'ba.stun'],
    ])
  })

  test('沒有搜尋條件時沒有命中、效果類型與高亮', () => {
    const d = detail({ cn: caster() }, 'char_001_x')
    for (const tab of d.tabs)
      for (const e of tab.entries)
        for (const s of e.stages) expect([s.hit, s.effects, lit(s.runs)]).toEqual([false, {}, []])
  })

  test('技能各階段帶技力與圖示,沒有關鍵字的技能也一樣', () => {
    const [skill1] = entriesOf(detail({ cn: caster() }, 'char_001_x'), '技能')
    expect(skill1.icon).toBe('skill-icons/sk_1.webp')
    expect(skill1.stages.map((s) => s.stats?.sp?.cost)).toEqual([9, 8])
  })

  test('台服:用台服文字與技力;台服沒有的模組不列出,陸服模式標「陸服資料」', () => {
    const cn = server({
      terms: COMMON_TERMS,
      operators: { char_630_m: operator({ name: '模組者', trait: '攻击造成法术伤害', skills: ['sk_1'] }) },
      skills: [masteredSkill('sk_1', '强击', { description: '攻击力+50%' }, { description: '攻击力+80%', sp: { spCost: 30 } })],
      modules: [
        { id: 'uniequip_002_m', charId: 'char_630_m', name: '甲模组', code: 'CCR-X', trait: { add: '攻击使敌人<$ba.cold>寒冷</>' } },
        { id: 'uniequip_003_m', charId: 'char_630_m', name: '乙模组', code: 'CCR-Y', trait: { add: '攻击力提升' } },
      ],
    })
    const tw = server({
      terms: COMMON_TERMS,
      operators: { char_630_m: operator({ name: '模組者', trait: '攻擊造成法術傷害', skills: ['sk_1'], style: 'object' }) },
      skills: [masteredSkill('sk_1', '強擊', { description: '攻擊力+50%' }, { description: '攻擊力+80%', sp: { spCost: 28 } }, 'object')],
    })
    tw.uniequipTable = {
      equipDict: { uniequip_002_m: { uniEquipId: 'uniequip_002_m', uniEquipName: '甲模組', typeIcon: 'ccr-x', charId: 'char_630_m', type: 'ADVANCED' } },
    }
    const twDetail = detail({ cn, tw }, 'char_630_m', { server: 'tw' })
    expect(entriesOf(twDetail, '特性')[0].stages.map((s) => [s.label, plain(s.runs)])).toEqual([
      ['無模組', '攻擊造成法術傷害'],
      ['模組3 · CCR-X', '攻击造成法术伤害\n攻击使敌人寒冷'],
    ])
    const [twSkill] = entriesOf(twDetail, '技能')
    expect([twSkill.name, plain(twSkill.stages[1].runs), twSkill.stages[1].stats?.sp?.cost]).toEqual(['強擊', '攻擊力+80%', 28])

    const cnDetail = detail({ cn, tw }, 'char_630_m', { server: 'cn' })
    expect(entriesOf(cnDetail, '特性')[0].stages.map((s) => [s.label, s.cnData ?? false])).toEqual([
      ['無模組', false],
      ['模組3 · CCR-X', false],
      ['模組3 · CCR-Y', true],
    ])
    expect(entriesOf(cnDetail, '技能')[0].stages[1].stats?.sp?.cost).toBe(30)
  })

  test('只存在陸服的幹員:幹員檔只有陸服資料', () => {
    const tw = server({ terms: COMMON_TERMS, operators: {} })
    const { operatorFiles } = buildIndex({ cn: caster(), tw })
    const [file] = operatorFiles
    expect(file.inTw).toBe(false)
    expect(file.entries.every((e) => e.stages.every((s) => !s.tw))).toBe(true)
  })
})

describe('幹員檔的位置', () => {
  test('每位幹員帶指向自己幹員檔的路徑,檔名帶內容雜湊,內容一變路徑就變', () => {
    const first = buildIndex({ cn: caster() })
    const files = attachOperatorFiles(first.index, first.operatorFiles)
    const [op] = first.index.operators
    expect(op.detail).toMatch(/^data\/operators\/char_001_x\.[0-9a-f]{8}\.json$/)
    expect(JSON.parse(files.get(op.detail!)!)).toEqual(first.operatorFiles[0])

    const raw = caster()
    raw.skillTable.sk_1.levels[9].description = '攻击力+90%'
    const second = buildIndex({ cn: raw })
    attachOperatorFiles(second.index, second.operatorFiles)
    expect(second.index.operators[0].detail).not.toBe(op.detail)
  })
})

/** 被標成高亮的文字。 */
function lit(runs: { t: string; h?: true }[]): string[] {
  return runs.filter((r) => r.h).map((r) => r.t)
}
