# 議題追蹤:本地 Markdown

本 repo 的議題與規格以 markdown 檔存放在 `.scratch/`。

## 慣例

- 一個功能一個資料夾:`.scratch/<feature-slug>/`
- 規格放在 `.scratch/<feature-slug>/spec.md`
- 實作議題一張票一個檔案，放在 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，從 `01` 開始編號——不要把所有票合併成一個檔案
- 分流狀態寫在每個議題檔頂端附近的 `Status:` 行(角色字串見 `triage-labels.md`)
- 留言與對話紀錄附加在檔案底部的 `## Comments` 標題下

## 技能說「發布到議題追蹤」時

在 `.scratch/<feature-slug>/` 下建立新檔(資料夾不存在就建立)。

## 技能說「取得相關票」時

讀取所指路徑的檔案。使用者通常會直接給路徑或議題編號。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是一個檔案，每張票各一個 **child** 檔。

- **Map**:`.scratch/<effort>/map.md`——內容為 Notes / Decisions-so-far / Fog。
- **Child 票**:`.scratch/<effort>/issues/NN-<slug>.md`，從 `01` 編號，內文寫問題。`Type:` 行記錄票的類型(`research`/`prototype`/`grilling`/`task`);`Status:` 行記錄 `claimed`/`resolved`。
- **Blocking**:頂端附近一行 `Blocked by: NN, NN`。所列檔案全部 `resolved` 時，該票才解除阻擋。
- **Frontier**:掃描 `.scratch/<effort>/issues/`，找出未關閉、未被阻擋、未被認領的檔案;編號最小者優先。
- **Claim**:動工前先設 `Status: claimed` 並存檔。
- **Resolve**:在 `## Answer` 標題下附上答案，設 `Status: resolved`，再於 `map.md` 的 Decisions-so-far 附上脈絡指標(要點 + 連結)。
