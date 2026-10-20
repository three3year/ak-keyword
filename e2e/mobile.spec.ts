import { expect, test } from '@playwright/test'

test('手機寬度:抽屜選關鍵字、點擊顯示定義、點高亮詞只顯示定義不改搜尋,職業 chip 不算進抽屜計數,且沒有水平捲動', async ({ page }) => {
  await page.goto('./')
  const noHorizontalScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

  // 面板收在抽屜裡
  const panel = page.getByRole('complementary', { name: '關鍵字面板' })
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: /^關鍵字/ }).click()
  await expect(panel).toBeVisible()
  // 抽屜裡的面板照同樣分組分行,一行放不下時在行內折行
  await expect(panel.locator('.kw-group').first().locator('.kw-list').first().locator('.kw').first()).toHaveText('減速')
  expect(await noHorizontalScroll()).toBe(true)
  // 抽屜裡的面板一樣沒有過濾欄位與清除按鈕
  await expect(panel.getByRole('searchbox')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '清除' })).toHaveCount(0)
  await panel.getByRole('button', { name: '暈眩', exact: true }).first().tap()
  await expect(page.getByTestId('tip')).toContainText('無法移動')
  await panel.getByRole('button', { name: '完成' }).tap()
  await expect(panel).toBeHidden()

  const cards = page.getByTestId('result-card')
  await expect(cards.first()).toBeVisible()
  // chip 上的類型鈕一併受檢
  await expect(page.getByTestId('chip').getByRole('button', { name: '反制' })).toBeVisible()
  expect(await noHorizontalScroll()).toBe(true)

  // 職業 chip 多一行也沒有水平捲動;抽屜按鈕只算關鍵字
  await page.getByRole('group', { name: '職業' }).getByRole('button', { name: '先鋒', exact: true }).tap()
  await page.getByRole('group', { name: '職業' }).getByRole('button', { name: '近衛', exact: true }).tap()
  await expect(page.getByTestId('profession-chip')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^關鍵字/ })).toHaveText('關鍵字(1)')
  expect(await noHorizontalScroll()).toBe(true)
  await page.getByRole('button', { name: '移除 先鋒' }).tap()
  await page.getByRole('button', { name: '移除 近衛' }).tap()

  // 點擊高亮詞:只顯示定義,提示框沒有加入/移出按鈕,搜尋不變
  const count = page.getByTestId('result-count')
  const before = await count.textContent()
  await cards.first().locator('mark.hl').first().tap()
  const tip = page.getByTestId('tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('暈眩')
  await expect(tip.getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('chip')).toHaveCount(1)
  await expect(count).toHaveText(before ?? '')
  expect(await noHorizontalScroll()).toBe(true)

  // 點別處關閉提示框
  await page.getByTestId('result-count').tap()
  await expect(tip).toBeHidden()
})

test('手機寬度:幹員詳情占滿螢幕、沒有水平捲動,返回鍵關閉後仍在結果列表', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('group', { name: '職業' }).getByRole('button', { name: '先鋒', exact: true }).tap()
  const count = await page.getByTestId('result-count').textContent()
  await page.getByRole('button', { name: '檢視忍冬的詳情' }).tap()
  const dialog = page.getByRole('dialog', { name: '忍冬' })
  await expect(dialog.getByTestId('detail-entry').first()).toBeVisible()
  const box = (await dialog.boundingBox())!
  const viewport = page.viewportSize()!
  expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, viewport.width, viewport.height])
  // 技能頁籤有技力文字,放不下時只在欄位之間換行
  await dialog.getByRole('tab', { name: '技能1' }).tap()
  await expect(dialog.getByTestId('skill-facts').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true)

  await page.goBack()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('result-count')).toHaveText(count ?? '')
  await expect(page.getByTestId('profession-chip')).toHaveText([/先鋒/])
})
