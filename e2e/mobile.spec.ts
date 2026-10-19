import { expect, test } from '@playwright/test'

test('手機寬度:抽屜選關鍵字、點擊顯示定義、點高亮詞切換選取,且沒有水平捲動', async ({ page }) => {
  await page.goto('./')
  const noHorizontalScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

  // 面板收在抽屜裡
  const panel = page.getByRole('complementary', { name: '關鍵字面板' })
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: /^關鍵字/ }).click()
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '暈眩', exact: true }).first().tap()
  await expect(page.getByTestId('tip')).toContainText('無法移動')
  await panel.getByRole('button', { name: '完成' }).tap()
  await expect(panel).toBeHidden()

  const cards = page.getByTestId('result-card')
  await expect(cards.first()).toBeVisible()
  // chip 上的類型鈕一併受檢
  await expect(page.getByTestId('chip').getByRole('button', { name: '反制' })).toBeVisible()
  expect(await noHorizontalScroll()).toBe(true)

  // 點擊高亮詞:先顯示定義,再由提示框移出選取
  await cards.first().locator('mark.hl').first().tap()
  const tip = page.getByTestId('tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('暈眩')
  await tip.getByRole('button', { name: '移出選擇' }).tap()
  await expect(cards).toHaveCount(0)
  await expect(page.getByText('點選關鍵字開始搜尋')).toBeVisible()
  expect(await noHorizontalScroll()).toBe(true)
})
