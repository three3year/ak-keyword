import { expect, test } from '@playwright/test'

test('點一個關鍵字後看到結果卡,切換伺服器後結果更新', async ({ page }) => {
  await page.goto('./')
  // 頁尾顯示這次建置所用的國服與台服資料版本;「國服」「台服」「頭像」在新分頁開啟各自的資料來源
  const footer = page.locator('footer')
  await expect(footer).toContainText(/國服 \d+\.\d+\.\d+ · 台服 \d+\.\d+\.\d+/)
  for (const [label, repo] of [
    ['國服', 'Kengxxiao/ArknightsGameData'],
    ['台服', 'arkntools/arknights-data-tw-for-maa'],
    ['頭像', 'yuanyan3060/ArknightsGameResource'],
  ]) {
    const link = footer.getByRole('link', { name: label, exact: true })
    await expect(link).toHaveAttribute('href', `https://github.com/${repo}`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link).toHaveAttribute('title', `資料來源:${repo}`)
  }
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
