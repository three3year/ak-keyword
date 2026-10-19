# 明日方舟關鍵字搜尋

點選寒冷、凍結、浮空這類效果關鍵字,列出敘述(技能、天賦、特性、模組)含有該效果的幹員。
純前端網頁(Vue 3 + Vite + TypeScript),資料在本機建置成索引,隨網頁部署。名詞見 [CONTEXT.md](CONTEXT.md)。

## 開發

```bash
npm install
npm run dev          # 本機開發
npm test             # 建置 → 查詢的 Vitest 測試
npm run build        # 型別檢查 + 打包到 dist/(相對基底路徑,可放任何靜態主機)
npm run preview      # 本機預覽打包結果
npx playwright install chromium   # 第一次跑 e2e 前
npm run test:e2e     # Playwright 煙霧測試(桌機與手機寬度;先 npm run build)
```

## 更新遊戲資料

```bash
npm run build-index            # 重新下載國服與台服資料、頭像,產出 public/data/index.json
npm run build-index:offline    # 沿用 .cache/ 已下載的資料
```

建置會輸出:

- `review/build-warnings.txt`:無法辨識的標記、找不到數值的佔位符、潛能加成對不齊、找不到的頭像等。
- `review/pending-review.json`:效果類型還沒複核的「敘述 × 關鍵字」配對(覆寫檔裡沒有的)。

資料來源:國服 [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)、
台服 [arkntools/arknights-data-tw-for-maa](https://github.com/arkntools/arknights-data-tw-for-maa)、
頭像 [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)。

## 效果類型複核

效果類型(施加/利用/抵抗/其他)先以句型規則判定,再在 Claude Code session 裡交給 LLM 複核
(不呼叫外部 API,理由見 [docs/adr/0001](docs/adr/0001-effect-type-rules-plus-session-llm-review.md))。

1. `npm run build-index`,看 `review/pending-review.json` 有多少待複核配對。
2. 在 session 裡讓 LLM 逐筆判定,寫成 `[{ "key": "<雜湊>:<關鍵字>", "type": "apply" }]` 的判定檔。
3. `npx tsx build/applyReview.ts <判定檔.json> …` 寫進 `data/effect-overrides.json`(納入版控)。
4. 再跑一次 `npm run build-index:offline`,待複核清單應為空。

手動修正某一筆時,同樣寫一個判定檔套用即可;覆寫檔的判定一律優先於規則。
敘述文字改變時雜湊跟著變,該配對會重新出現在待複核清單。

## 維護者清單(`data/`)

| 檔案 | 內容 |
| --- | --- |
| `keyword-groups.json` | 關鍵字分組。沒列到的新術語會出現在「未分組」。 |
| `supplementary-keywords.json` | 補充關鍵字:名稱、簡中與繁中比對字串、定義(顯示為「非官方」)、分組。新增一筆即可,不用改程式。 |
| `effect-overrides.json` | 效果類型覆寫檔(由 `build/applyReview.ts` 維護)。 |

## 已知的近似

- 「實裝新到舊」:遊戲資料沒有實裝時間,以潛能信物的排序編號近似(同星級內依實裝先後遞增)。
- 台服資料庫沒有模組戰鬥資料:模組3 階段一律顯示國服簡中並標「國服資料」。
