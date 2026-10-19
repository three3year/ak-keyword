import { expect, test } from '@playwright/test'

test('點一個關鍵字後看到結果卡,切換伺服器後結果更新', async ({ page }) => {
  await page.goto('./')
  // 頁尾顯示這次建置所用的國服與台服資料版本
  await expect(page.locator('footer')).toContainText(/國服 \d+\.\d+\.\d+ · 台服 \d+\.\d+\.\d+/)
  await page.getByRole('button', { name: '暈眩', exact: true }).first().click()
  const cards = page.getByTestId('result-card')
  await expect(cards.first()).toBeVisible()
  await expect(cards.first().locator('mark.hl').first()).toHaveText(/暈眩|晕眩/)

  const count = page.getByTestId('result-count')
  const cnCount = await count.textContent()
  await page.getByRole('radio', { name: '台服' }).click()
  await expect(count).not.toHaveText(cnCount ?? '')
  await expect(cards.first()).toBeVisible()
})
