import { expect, test } from '@playwright/test'

test('點一個關鍵字後看到至少一張結果卡', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '寒冷', exact: true }).first().click()
  await expect(page.getByTestId('result-card').first()).toBeVisible()
  await expect(page.getByTestId('result-card').first().locator('mark.hl').first()).toHaveText(/寒冷/)
})
