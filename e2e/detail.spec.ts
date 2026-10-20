import { expect, type Page, test } from '@playwright/test'

async function search(page: Page, keyword: string) {
  await page.goto('./')
  await page.getByRole('button', { name: keyword, exact: true }).first().click()
  await expect(page.getByTestId('result-card').first()).toBeVisible()
}

const card = (page: Page, name: string) => page.getByTestId('result-card').filter({ has: page.getByRole('heading', { name, exact: true }) })

test('結果卡的技能分頁有技能圖示與技力疊字', async ({ page }) => {
  await search(page, '暈眩')
  const icon = card(page, '忍冬').getByTestId('skill-icon')
  await expect(icon).toHaveCount(1)
  await expect(icon.locator('img')).toHaveAttribute('src', /^skill-icons\/.+\.webp$/)
  await expect(icon.getByRole('img')).toHaveAccessibleName(/^(自動|攻擊|受擊)回復,初始技力 \d+,所需技力 \d+$/)
})

test('點頭像打開幹員詳情:每段敘述一個頁籤,預設特性;技能頁籤數等於實際技能數;技能頭部有圖示與文字欄位,切到專精3 後技力跟著換', async ({ page }) => {
  await search(page, '暈眩')
  await card(page, '忍冬').getByRole('button', { name: '檢視忍冬的詳情' }).click()
  const dialog = page.getByRole('dialog', { name: '忍冬' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('先鋒 · 尖兵')).toBeVisible()
  await expect(dialog.getByRole('heading').getByRole('link', { name: '忍冬' })).toHaveAttribute('href', /prts\.wiki/)
  await expect(dialog.getByRole('tab')).toHaveText(['特性', '天賦1', '天賦2', '技能1', '技能2', '技能3'])
  await expect(dialog.getByRole('tab', { name: '特性' })).toHaveAttribute('aria-selected', 'true')
  // 打開時焦點在對話框內
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)

  // 特性的名稱是分支名稱:無模組階段只有分支名,模組3 階段接模組名
  const entries = dialog.getByTestId('detail-entry')
  await expect(entries).toHaveCount(1)
  await expect(entries.locator('.entry-name')).toHaveText('尖兵')
  await entries.getByRole('button', { name: /^模組3/ }).first().click()
  await expect(entries.locator('.entry-name')).toHaveText(/^尖兵-.+/)

  for (const tab of await dialog.getByRole('tab', { name: /^技能/ }).all()) {
    await tab.click()
    await expect(entries.first().getByTestId('skill-icon')).toBeVisible()
    await expect(entries.first().getByTestId('skill-facts')).toContainText('所需技力')
  }
  await dialog.getByRole('tab', { name: '技能1' }).click()
  const first = entries.first()
  const sp = async () =>
    `${await first.getByTestId('skill-facts').textContent()}|${await first.getByTestId('skill-icon').getByRole('img').getAttribute('aria-label')}`
  const before = await sp()
  await first.getByRole('button', { name: '專精3' }).click()
  await expect(first.getByRole('button', { name: '專精3' })).toHaveAttribute('aria-pressed', 'true')
  expect(await sp()).not.toBe(before)

  // 技力文字在技能圖示下方
  const icon = (await first.getByTestId('skill-icon').boundingBox())!
  const facts = (await first.getByTestId('skill-facts').boundingBox())!
  expect(facts.y).toBeGreaterThanOrEqual(icon.y + icon.height)

  // 其他頁籤也列出沒有命中的敘述,沒有技能圖示
  await dialog.getByRole('tab', { name: '天賦1' }).click()
  await expect(entries).not.toHaveCount(0)
  await expect(entries.first().getByTestId('skill-icon')).toHaveCount(0)
})

test('沒有技能的幹員沒有技能頁籤,預設特性', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: '1★' }).check()
  await page.getByRole('button', { name: '近衛', exact: true }).click()
  await card(page, 'Castle-3').getByRole('button', { name: '檢視Castle-3的詳情' }).click()
  const dialog = page.getByRole('dialog', { name: 'Castle-3' })
  await expect(dialog.getByRole('tab')).toHaveText(['特性', '天賦1'])
  await expect(dialog.getByRole('tab', { name: '特性' })).toHaveAttribute('aria-selected', 'true')
})

test('技能召喚的召喚物只出現在召喚它的技能頁籤', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '醫療', exact: true }).click()
  await card(page, '赫默').getByRole('button', { name: '檢視赫默的詳情' }).click()
  const dialog = page.getByRole('dialog', { name: '赫默' })
  const summonBadges = dialog.getByTestId('detail-entry').locator('.badge.summon')
  for (const tab of await dialog.getByRole('tab').all()) {
    const label = await tab.textContent()
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    if (label?.trim() === '技能2') await expect(summonBadges.first()).toBeVisible()
    else await expect(summonBadges).toHaveCount(0)
  }
})

test('結果卡頭像的「i」標記在頭像左上角', async ({ page }) => {
  await search(page, '暈眩')
  const avatarBtn = card(page, '忍冬').getByRole('button', { name: '檢視忍冬的詳情' })
  const avatar = (await avatarBtn.locator('img').boundingBox())!
  const badge = (await avatarBtn.locator('.info-badge').boundingBox())!
  const [cx, cy] = [badge.x + badge.width / 2, badge.y + badge.height / 2]
  expect(cx).toBeLessThan(avatar.x + avatar.width / 2)
  expect(cy).toBeLessThan(avatar.y + avatar.height / 2)
})

test('關閉鈕、Esc、點背景、返回鍵都能關閉,回到原本的結果列表,結果卡的分頁與焦點都還在', async ({ page }) => {
  await search(page, '暈眩')
  const count = await page.getByTestId('result-count').textContent()
  const target = card(page, '忍冬')
  await target.getByRole('tab', { name: '技能3' }).click()
  const avatar = target.getByRole('button', { name: '檢視忍冬的詳情' })
  const dialog = page.getByRole('dialog')

  const closers = [
    () => dialog.getByRole('button', { name: '關閉' }).click(),
    () => page.keyboard.press('Escape'),
    () => page.mouse.click(5, 450),
    () => page.goBack(),
  ]
  for (const close of closers) {
    await avatar.click()
    await expect(dialog).toBeVisible()
    await close()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('result-count')).toHaveText(count ?? '')
    await expect(page.getByTestId('chip')).toHaveCount(1)
    await expect(target.getByRole('tab', { name: '技能3' })).toHaveAttribute('aria-selected', 'true')
    await expect(avatar).toBeFocused()
    // 不留多餘的瀏覽紀錄
    expect(await page.evaluate(() => history.state?.operatorDetail ?? false)).toBe(false)
  }
})

test('詳情裡命中的關鍵字高亮並標效果類型,點關鍵字顯示定義但不改搜尋條件', async ({ page }) => {
  await search(page, '暈眩')
  const count = await page.getByTestId('result-count').textContent()
  await card(page, '忍冬').getByRole('button', { name: '檢視忍冬的詳情' }).click()
  const dialog = page.getByRole('dialog')
  // 忍冬的技能2 有命中的暈眩,也有沒命中的遲緩
  await dialog.getByRole('tab', { name: '技能2' }).click()
  await expect(dialog.locator('mark.hl').first()).toHaveText(/暈眩|晕眩/)
  await expect(dialog.locator('.fx').first()).toHaveText('施加')

  await dialog.locator('.stage-text .term').first().click()
  const tip = page.getByTestId('tip')
  await expect(tip).toBeVisible()
  // 提示框在對話框之上
  const box = (await tip.boundingBox())!
  const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid=tip]'), [box.x + box.width / 2, box.y + box.height / 2])
  expect(onTop).toBe(true)

  // 第一次 Esc 只關掉釘住的定義,第二次才關閉詳情
  await dialog.locator('mark.hl').first().click()
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('chip').locator('.chip-name')).toHaveText(['暈眩'])
  await expect(page.getByTestId('result-count')).toHaveText(count ?? '')
})

test('幹員資料下載失敗時顯示錯誤與重試鈕,重試成功後顯示內容;重開不再下載', async ({ page }) => {
  let requests = 0
  let fail = true
  await page.route('**/data/operators/**', (route) => {
    requests++
    return fail ? route.fulfill({ status: 500 }) : route.continue()
  })
  await search(page, '暈眩')
  const avatar = card(page, '忍冬').getByRole('button', { name: '檢視忍冬的詳情' })
  await avatar.click()
  const dialog = page.getByRole('dialog', { name: '忍冬' })
  // 標題區不必等下載
  await expect(dialog.getByText('先鋒 · 尖兵')).toBeVisible()
  await expect(dialog.getByRole('alert')).toBeVisible()

  fail = false
  await dialog.getByRole('button', { name: '重試' }).click()
  await expect(dialog.getByTestId('detail-entry')).toHaveCount(1)
  expect(requests).toBe(2)

  await page.keyboard.press('Escape')
  await avatar.click()
  await expect(dialog.getByTestId('detail-entry')).toHaveCount(1)
  expect(requests).toBe(2)
})

test('陸服模式下台服未實裝幹員的小卡壓灰:整張卡有懸停文字、卡頭沒有徽章;詳情卡頭有徽章;台服模式沒有壓灰', async ({ page }) => {
  await page.goto('./')
  // 只選一個職業條件:結果卡是多欄小卡;不寫死幹員名,資料更新後才不用換人
  await page.getByRole('button', { name: '術師', exact: true }).click()
  const cards = page.getByTestId('result-card')
  await expect(cards.first()).toBeVisible()
  const title = '台服尚未實裝這位幹員,文字與數值取自陸服'
  const flagged = page.locator('[data-testid=result-card].tw-unreleased')
  await expect(flagged.first()).toBeVisible()
  await expect(flagged.first()).toHaveClass(/\bcompact\b/)
  await expect(flagged.first()).toHaveAttribute('title', title)
  await expect(flagged.first().locator('.card-head .badge')).toHaveCount(0)
  await expect(flagged.first().locator('.op-sub')).toHaveText(/^術師 · \S+\s*$/)
  // 沒有壓灰的小卡沒有懸停文字
  const plain = page.locator('[data-testid=result-card]:not(.tw-unreleased)')
  await expect(plain.first()).toBeVisible()
  await expect(plain.first()).not.toHaveAttribute('title')

  await flagged.first().getByRole('button', { name: /^檢視.+的詳情$/ }).click()
  const dialog = page.getByRole('dialog')
  const detailBadge = dialog.locator('.detail-head .op-sub .badge.tw-unreleased')
  await expect(detailBadge).toHaveText('台服未實裝')
  await expect(detailBadge).toHaveAttribute('title', title)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  const count = page.getByTestId('result-count')
  const cnCount = await count.textContent()
  await page.getByRole('radio', { name: '台服' }).click()
  await expect(count).not.toHaveText(cnCount ?? '')
  await expect(cards.first()).toBeVisible()
  await expect(flagged).toHaveCount(0)
  await expect(page.getByText('台服未實裝', { exact: true })).toHaveCount(0)
})

test('陸服模式下台服未實裝幹員的大卡只壓灰卡頭:卡頭有徽章、整張卡沒有懸停文字、命中敘述不壓灰', async ({ page }) => {
  // 「停頓」目前命中五位台服未實裝的幹員
  await search(page, '停頓')
  const flagged = page.locator('[data-testid=result-card].tw-unreleased')
  await expect(flagged.first()).toBeVisible()
  const badge = flagged.first().locator('.card-head .op-sub .badge.tw-unreleased')
  await expect(badge).toHaveText('台服未實裝')
  await expect(badge).toHaveAttribute('title', '台服尚未實裝這位幹員,文字與數值取自陸服')
  await expect(flagged.first()).not.toHaveAttribute('title')
  // 大卡不是小卡;命中敘述與高亮照常顯示(壓灰範圍只在卡頭,靠截圖人眼確認)
  await expect(flagged.first()).not.toHaveClass(/\bcompact\b/)
  await expect(flagged.first().getByTestId('entry').locator('mark.hl').first()).toBeVisible()
})

test('只有職業條件、沒有命中敘述的結果卡也能打開詳情,詳情裡沒有高亮', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '先鋒', exact: true }).click()
  await page.getByTestId('result-card').first().getByRole('button', { name: /^檢視.+的詳情$/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('detail-entry').first()).toBeVisible()
  await expect(dialog.locator('mark.hl')).toHaveCount(0)
})
