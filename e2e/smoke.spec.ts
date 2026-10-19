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

test('階段切換:預設第一個命中的階段,未命中的階段停用,重新查詢後回到預設', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '暈眩', exact: true }).first().click()
  const cards = page.getByTestId('result-card')
  const card = (name: string) => cards.filter({ has: page.getByRole('heading', { name, exact: true }) })

  // 忍冬技能2 的等級7 與專精3 都會暈眩:預設等級7,可切到專精3
  const stages = card('忍冬').getByRole('group', { name: '階段' })
  await expect(stages.getByRole('button')).toHaveText(['等級7', '專精3'])
  await expect(stages.getByRole('button', { name: '等級7' })).toHaveAttribute('aria-pressed', 'true')
  await stages.getByRole('button', { name: '專精3' }).click()
  await expect(stages.getByRole('button', { name: '專精3' })).toHaveAttribute('aria-pressed', 'true')
  await expect(stages.getByRole('button', { name: '等級7' })).toHaveAttribute('aria-pressed', 'false')
  // 每張卡各自切換:另一張卡不受影響
  const other = card('繆爾賽思').getByRole('group', { name: '階段' })
  await expect(other.getByRole('button', { name: '等級7' })).toHaveAttribute('aria-pressed', 'true')

  // 赫德雷天賦1 只有模組3 會暈眩:無模組停用,預設顯示模組3 並在內容區寫模組全名
  const hedley = card('赫德雷')
  await hedley.getByRole('tab', { name: '天賦1' }).click()
  const talentStages = hedley.getByRole('group', { name: '階段' })
  await expect(talentStages.getByRole('button', { name: '無模組' })).toBeDisabled()
  const module = talentStages.getByRole('button', { name: /^模組3 · / })
  await expect(module).toHaveAttribute('aria-pressed', 'true')
  await expect(module).toBeEnabled()
  await expect(hedley.getByRole('tabpanel')).toContainText('筆跡')

  // 重新查詢(切伺服器再切回)後所有卡回到預設的分頁與階段
  await card('忍冬').getByRole('tab', { name: '技能3' }).click()
  await page.getByRole('radio', { name: '台服' }).click()
  await page.getByRole('radio', { name: '國服' }).click()
  await expect(card('忍冬').getByRole('tab', { name: '技能2' })).toHaveAttribute('aria-selected', 'true')
  await expect(stages.getByRole('button', { name: '等級7' })).toHaveAttribute('aria-pressed', 'true')
})

test('搜尋條件 chip:加入時只亮施加,再亮一顆後結果變多或不變,關掉最後一顆後 chip 消失', async ({ page }) => {
  await page.goto('./')
  // 篩選列不再有效果類型與分支選單
  await expect(page.getByRole('group', { name: '效果類型', exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '職業' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByText('全部分支')).toHaveCount(0)

  await page.getByRole('button', { name: '暈眩', exact: true }).first().click()
  const chip = page.getByTestId('chip')
  await expect(chip).toHaveCount(1)
  const types = chip.getByRole('group', { name: '暈眩的效果類型' })
  await expect(types.getByRole('button', { name: '施加' })).toHaveAttribute('aria-pressed', 'true')
  await expect(types.getByRole('button', { name: '利用' })).toHaveAttribute('aria-pressed', 'false')
  await expect(types.getByRole('button', { name: '反制' })).toHaveAttribute('aria-pressed', 'false')

  const count = page.getByTestId('result-count')
  const total = (text: string | null) => Number(/\d+/.exec(text ?? '')?.[0])
  const applyOnly = total(await count.textContent())
  expect(applyOnly).toBeGreaterThan(0)

  // 施加-暈眩 OR 利用-暈眩:結果變多(或不變)
  await types.getByRole('button', { name: '利用' }).click()
  await expect(types.getByRole('button', { name: '利用' })).toHaveAttribute('aria-pressed', 'true')
  const either = total(await count.textContent())
  expect(either).toBeGreaterThanOrEqual(applyOnly)
  // 命中敘述列出它符合的效果類型
  await expect(page.getByTestId('result-card').first().locator('.fx')).not.toHaveCount(0)

  // 關掉所有亮著的類型鈕:chip 消失,回到初始提示
  await types.getByRole('button', { name: '施加' }).click()
  await expect(chip).toHaveCount(1)
  await types.getByRole('button', { name: '利用' }).click()
  await expect(chip).toHaveCount(0)
  await expect(page.getByText('點選關鍵字開始搜尋')).toBeVisible()
})

test('沒有結果時列出搜尋條件', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '暈眩', exact: true }).first().click()
  await page.getByRole('button', { name: '停頓', exact: true }).first().click()
  await page.getByRole('group', { name: '停頓的效果類型' }).getByRole('button', { name: '利用' }).click()
  await page.getByRole('checkbox', { name: '1★' }).check()
  await expect(page.getByTestId('empty')).toContainText('搜尋條件:施加-暈眩、施加-停頓、利用-停頓')
})

test('類型鈕反灰:關鍵字在目前伺服器沒有該類型的敘述時停用', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '暈眩', exact: true }).first().click()
  const types = page.getByRole('group', { name: '暈眩的效果類型' })
  // 沒有幹員反制暈眩
  await expect(types.getByRole('button', { name: '反制' })).toBeDisabled()
  await expect(types.getByRole('button', { name: '施加' })).toBeEnabled()
  await expect(types.getByRole('button', { name: '利用' })).toBeEnabled()

  // 反制-侵蝕損傷 只有國服有資料:切到台服後反灰
  await page.getByRole('button', { name: '侵蝕損傷', exact: true }).first().click()
  const erosion = page.getByRole('group', { name: '侵蝕損傷的效果類型' }).getByRole('button', { name: '反制' })
  await expect(erosion).toBeEnabled()
  await page.getByRole('radio', { name: '台服' }).click()
  await expect(erosion).toBeDisabled()
})
