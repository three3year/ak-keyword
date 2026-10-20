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

test('點頭像打開幹員詳情:預設技能頁,列出全部技能,技能頭部有圖示與文字欄位,切到專精3 後技力跟著換', async ({ page }) => {
  await search(page, '暈眩')
  await card(page, '忍冬').getByRole('button', { name: '檢視忍冬的詳情' }).click()
  const dialog = page.getByRole('dialog', { name: '忍冬' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('先鋒 · 尖兵')).toBeVisible()
  await expect(dialog.getByRole('heading').getByRole('link', { name: '忍冬' })).toHaveAttribute('href', /prts\.wiki/)
  await expect(dialog.getByRole('tab')).toHaveText(['特性', '天賦', '技能'])
  await expect(dialog.getByRole('tab', { name: '技能' })).toHaveAttribute('aria-selected', 'true')
  // 技能數和忍冬實際的技能數相同
  const entries = dialog.getByTestId('detail-entry')
  await expect(entries).toHaveCount(3)
  // 打開時焦點在對話框內
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)

  for (const entry of await entries.all()) {
    await expect(entry.getByTestId('skill-icon')).toBeVisible()
    await expect(entry.getByTestId('skill-facts')).toContainText('所需技力')
  }
  const first = entries.first()
  const sp = async () =>
    `${await first.getByTestId('skill-facts').textContent()}|${await first.getByTestId('skill-icon').getByRole('img').getAttribute('aria-label')}`
  const before = await sp()
  await first.getByRole('button', { name: '專精3' }).click()
  await expect(first.getByRole('button', { name: '專精3' })).toHaveAttribute('aria-pressed', 'true')
  expect(await sp()).not.toBe(before)

  // 其他分頁也列出沒有命中的敘述,沒有技能圖示
  await dialog.getByRole('tab', { name: '天賦' }).click()
  await expect(entries).not.toHaveCount(0)
  await expect(entries.first().getByTestId('skill-icon')).toHaveCount(0)
})

test('沒有技能的幹員沒有技能頁,預設天賦頁', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: '1★' }).check()
  await page.getByRole('button', { name: '近衛', exact: true }).click()
  await card(page, 'Castle-3').getByRole('button', { name: '檢視Castle-3的詳情' }).click()
  const dialog = page.getByRole('dialog', { name: 'Castle-3' })
  await expect(dialog.getByRole('tab')).toHaveText(['特性', '天賦'])
  await expect(dialog.getByRole('tab', { name: '天賦' })).toHaveAttribute('aria-selected', 'true')
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
  await expect(dialog.getByTestId('detail-entry')).toHaveCount(3)
  expect(requests).toBe(2)

  await page.keyboard.press('Escape')
  await avatar.click()
  await expect(dialog.getByTestId('detail-entry')).toHaveCount(3)
  expect(requests).toBe(2)
})

test('只有職業條件、沒有命中敘述的結果卡也能打開詳情,詳情裡沒有高亮', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '先鋒', exact: true }).click()
  await page.getByTestId('result-card').first().getByRole('button', { name: /^檢視.+的詳情$/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('detail-entry').first()).toBeVisible()
  await expect(dialog.locator('mark.hl')).toHaveCount(0)
})
