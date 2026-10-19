import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIndex, type Overrides } from './buildIndex'
const ROOT = join(import.meta.dirname, '..')
const raw = (s: string, f: string) => JSON.parse(readFileSync(join(ROOT, '.cache', 'raw', s, f + '.json'), 'utf8'))
const map: Record<string, string> = { character_table: 'characterTable', skill_table: 'skillTable', gamedata_const: 'gamedataConst', uniequip_table: 'uniequipTable', battle_equip_table: 'battleEquipTable', char_patch_table: 'charPatchTable', item_table: 'itemTable' }
const load = (s: string, files: string[]) => Object.assign({ downloadedAt: '' }, ...files.map((f) => ({ [map[f]]: raw(s, f) })))
const cn = load('cn', Object.keys(map))
const tw = load('tw', ['character_table', 'skill_table', 'gamedata_const', 'uniequip_table', 'char_patch_table'])
const data = (f: string) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'))
const overrides: Overrides = data('effect-overrides.json')
const { pending, index } = buildIndex({ cn, tw, groups: data('keyword-groups.json'), supplements: data('supplementary-keywords.json'), excludedTerms: data('excluded-terms.json'), overrides: {} })
const names = new Map(index.keywords.map((k) => [k.id, k.name]))
const out = pending.filter((p) => overrides[p.key] && p.ruleTypes.length === 1 && JSON.stringify(p.ruleTypes) !== JSON.stringify(overrides[p.key].types))
  .map((p) => ({ cat: 'disagree', key: p.key, keyword: `${names.get(p.keyword)}(${p.keyword})`, rule: p.ruleTypes, old: overrides[p.key].types, oldNote: overrides[p.key].note, text: p.text, where: p.where[0] }))
writeFileSync(join(ROOT, 'review', 'disagree-0002.json'), JSON.stringify(out, null, 1))
const c: Record<string, number> = {}
for (const x of out) c[`${x.old}→${x.rule}`] = (c[`${x.old}→${x.rule}`] ?? 0) + 1
console.log(out.length, c)
