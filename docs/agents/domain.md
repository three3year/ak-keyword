# 領域文件

工程類技能在探索程式碼時，應如何使用本 repo 的領域文件。

## 探索前先讀

- repo 根目錄的 **`GLOSSARY.md`**，或
- repo 根目錄的 **`GLOSSARY-MAP.md`**(若存在)——它指向每個 context 各自的 `GLOSSARY.md`。讀與主題相關的那幾份。
- **`docs/adr/`**——讀與你即將動到的範圍相關的 ADR。多 context 的 repo 也要看 `src/<context>/docs/adr/` 的 context 層級決策。

上述檔案不存在時，**直接往下做**。不要提醒它們不存在，也不要建議先建立。`/mattpocock-skills:domain-modeling` 技能(經由 `/mattpocock-skills:grill-with-docs` 與 `/mattpocock-skills:improve-codebase-architecture` 觸發)會在名詞或決策真正定案時才延遲建立它們。

## 檔案結構

單一 context 的 repo(多數 repo):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多 context 的 repo(根目錄有 `GLOSSARY-MAP.md`):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 系統層級決策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context 層級決策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## 使用詞彙表的用語

輸出中提到領域概念時(議題標題、重構提案、假設、測試名稱)，使用 `GLOSSARY.md` 定義的詞。不要改用詞彙表明確列在 _Avoid_ 的同義詞。

需要的概念不在詞彙表裡，就是一個訊號——要不是你在發明專案沒在用的語言(重新考慮)，就是真的有缺口(記下來交給 `/mattpocock-skills:domain-modeling`)。

## 標出與 ADR 的衝突

輸出若與既有 ADR 矛盾，要明確指出，不要默默覆蓋:

> _與 ADR-0007(event-sourced orders)矛盾——但值得重新討論，因為…_
