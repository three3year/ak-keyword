import { describe, expect, test } from 'vitest'
import { compareVersions } from '../build/upstream'

const upstream = { cn: '78.2.0', tw: '51.4.0' }

describe('比對上游版本', () => {
  test('兩服都沒變', () => {
    expect(compareVersions({ cn: '78.2.0', tw: '51.4.0' }, upstream)).toEqual([
      { server: 'cn', current: '78.2.0', upstream: '78.2.0', updated: false },
      { server: 'tw', current: '51.4.0', upstream: '51.4.0', updated: false },
    ])
  })

  test('只有國服變', () => {
    const result = compareVersions({ cn: '78.1.3', tw: '51.4.0' }, upstream)
    expect(result.map((r) => [r.server, r.updated])).toEqual([
      ['cn', true],
      ['tw', false],
    ])
  })

  test('只有台服變', () => {
    const result = compareVersions({ cn: '78.2.0', tw: '51.3.9' }, upstream)
    expect(result.map((r) => [r.server, r.updated])).toEqual([
      ['cn', false],
      ['tw', true],
    ])
  })

  test('兩服都變', () => {
    const result = compareVersions({ cn: '78.1.3', tw: '51.3.9' }, upstream)
    expect(result.map((r) => [r.server, r.updated])).toEqual([
      ['cn', true],
      ['tw', true],
    ])
  })

  test('版號只要不同就算有新版,即使上游看起來比較舊', () => {
    const [cn] = compareVersions({ cn: '79.0.0', tw: '51.4.0' }, upstream)
    expect(cn.updated).toBe(true)
  })

  test('索引沒有台服資料時,台服算有新版', () => {
    expect(compareVersions({ cn: '78.2.0' }, upstream)).toEqual([
      { server: 'cn', current: '78.2.0', upstream: '78.2.0', updated: false },
      { server: 'tw', current: undefined, upstream: '51.4.0', updated: true },
    ])
  })
})
