import { expect, test } from '@playwright/test'

test('手機寬度:抽屜選關鍵字、點擊顯示定義、點高亮詞只顯示定義不改搜尋,且沒有水平捲動', async ({ page }) => {
  await page.goto('./')
  const noHorizontalScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

  // 面板收在抽屜裡
  const panel = page.getByRole('complementary', { name: '關鍵字面板' })
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: /^關鍵字/ }).click()
  await expect(panel).toBeVisible()
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
