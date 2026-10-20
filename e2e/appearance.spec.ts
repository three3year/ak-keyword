import { expect, test, type Page } from '@playwright/test'

// 底色只比相對關係:亮與暗不同、跟隨系統等於同一系統偏好下沒碰過開關時的底色,不寫死色碼。
const pageBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

const appearance = (page: Page) => page.getByRole('radiogroup', { name: '外觀' })

test('外觀開關:三格有全名,群組名稱為「外觀」,外觀接在伺服器切換右邊', async ({ page }) => {
  await page.goto('./')
  const radios = appearance(page).getByRole('radio')
  await expect(radios).toHaveText(['系統', '亮', '暗'])
  for (const [i, name] of ['跟隨系統', '亮色', '暗色'].entries()) {
    await expect(radios.nth(i)).toHaveAccessibleName(name)
    await expect(radios.nth(i)).toHaveAttribute('title', name)
  }
  // 外觀開關在伺服器切換右邊
  const server = (await page.getByRole('radiogroup', { name: '伺服器' }).boundingBox())!
  const box = (await appearance(page).boundingBox())!
  expect(box.x).toBeGreaterThan(server.x + server.width - 1)
})

test('系統亮色:沒碰過時選「系統」;切「暗」底色改變,重新整理後仍為暗色,切回「系統」回到亮色', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await expect(appearance(page).getByRole('radio', { name: '跟隨系統' })).toHaveAttribute('aria-checked', 'true')
  const light = await pageBg(page)

  await appearance(page).getByRole('radio', { name: '暗色' }).click()
  await expect.poll(() => pageBg(page)).not.toBe(light)
  const dark = await pageBg(page)

  // 網頁最前面就套用記住的外觀:網頁程式還沒執行時底色已是暗色,重新整理不閃色
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.reload()
  expect(await pageBg(page)).toBe(dark)
  await page.unroute('**/assets/*.js')

  await page.reload()
  expect(await pageBg(page)).toBe(dark)
  await expect(appearance(page).getByRole('radio', { name: '暗色' })).toHaveAttribute('aria-checked', 'true')

  await appearance(page).getByRole('radio', { name: '跟隨系統' }).click()
  await expect.poll(() => pageBg(page)).toBe(light)
})

test('系統暗色:選「亮」為亮色,系統亮暗來回切換時維持亮色', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  const light = await pageBg(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => pageBg(page)).not.toBe(light)

  await appearance(page).getByRole('radio', { name: '亮色' }).click()
  await expect.poll(() => pageBg(page)).toBe(light)
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await pageBg(page)).toBe(light)
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await pageBg(page)).toBe(light)
})

test('跟隨系統:系統切換亮暗時頁面即時跟著換,不必重新整理', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  const light = await pageBg(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => pageBg(page)).not.toBe(light)
  const dark = await pageBg(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => pageBg(page)).toBe(light)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => pageBg(page)).toBe(dark)
})

test('外觀開關可用鍵盤切換', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  const light = await pageBg(page)
  await appearance(page).getByRole('radio', { name: '暗色' }).focus()
  await page.keyboard.press('Enter')
  await expect(appearance(page).getByRole('radio', { name: '暗色' })).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => pageBg(page)).not.toBe(light)
})
