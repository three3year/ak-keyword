import { expect, test } from '@playwright/test'

test('點一個關鍵字後看到結果卡,切換伺服器後結果更新', async ({ page }) => {
  await page.goto('./')
  // 頁尾顯示國服與台服的資料版本(版號與台灣時間的下載時間);「國服」「台服」「頭像」在新分頁開啟各自的資料來源
  const footer = page.locator('footer')
  const dataVersion = String.raw`\d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2}\(UTC\+8\)`
  await expect(footer).toContainText(new RegExp(`國服 ${dataVersion} · 台服 ${dataVersion}`))
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

test('結果卡一次只顯示一段命中敘述,點分頁後換成該段', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '暈眩', exact: true }).first().click()
  const cards = page.getByTestId('result-card')
  await expect(cards.first()).toBeVisible()
  // 每張卡同一時間只有一段命中敘述
  for (const card of await cards.all()) await expect(card.getByTestId('entry')).toHaveCount(1)

  // 忍冬的技能2 與技能3 都會暈眩
  const card = cards.filter({ has: page.getByRole('heading', { name: '忍冬', exact: true }) })
  const tabs = card.getByRole('tab')
  await expect(tabs).toHaveText(['技能2', '技能3'])
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  const panel = card.getByRole('tabpanel')
  const first = await panel.textContent()
  await card.getByRole('tab', { name: '技能3' }).click()
  await expect(card.getByRole('tab', { name: '技能3' })).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'false')
  await expect(panel).not.toHaveText(first ?? '')
  await expect(panel.locator('mark.hl').first()).toHaveText(/暈眩|晕眩/)
})
