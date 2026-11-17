# FEV 棒球公會管理 | Guild Member Manager

以 **第一團、第二團、第三團、第四團、第五團、無遊戲團** 六個 Tab 為主的遊戲公會成員名單管理網站。

## FEV 暗色棒球視覺

- 黑色俱樂部球場風格與電光藍操作狀態、球場弧線／球縫元素
- FEV 純英文字標 SVG 與 iPhone App 圖示一致；棒球場圖形只在背景。
- 保留原有六團名單、增修刪、搜尋、Excel/CSV 匯入、備份還原；不改動資料儲存與權限機制

## iPhone PWA 安裝
使用 Safari 開啟正式網址，點「分享」→「加入主畫面」→「新增」，即可像 App 一樣全螢幕使用 FEV。

- manifest、180px Apple Touch Icon、192/512px PWA Icon 和 safe area 支援 iPhone。
- 首次在線開啟後，Service Worker 快取 App Shell（含 Vite 打包後 JS/CSS）；離線可以啟動。
- 新版本可在頁面按更新載入；名單仍存在**本裝置的 localStorage**，不會跨管理員同步。
- **重要：** 若要重裝 PWA 或清除網站資料，先下載 JSON 備份，以免丟失名單。
- PNG App Icon 在 `npm run build` 時由 `sharp` 根據文字 Logo 產生，Service Worker 預載清單由 `scripts/finalize-sw.mjs` 寫入。

## 第一版功能

- 六個團別切換，各團獨立名單：遊戲 ID、LINE 名稱、隊伍、主號／小號
- 新增、編輯、刪除、修改所屬團別
- 全團搜尋；篩選已配對、缺 LINE 名稱、缺遊戲 ID
- **只需兩份資料來源**：一次匯入整個 LINE 群組名單、一次匯入包含第一至第五團的遊戲名單。支援 Excel (.xlsx)、CSV (.csv)、TSV (.tsv)，預覽並防重複；遊戲 ID 重複時更新所在團別，既有人工配對保留。
- 下載 CSV 匯入範本、匯出目前團 CSV
- JSON 完整備份與還原
- 本機操作紀錄（只保存在自己的瀏覽器）
- 桌面表格、手機卡片式響應畫面

> **重要限制：** v0.1 資料存於瀏覽器的 localStorage。不同管理員／裝置 **不會同步**，清除瀏覽器資料就可能遺失，請定期使用「備份」。本機操作紀錄**不是**真正的多人稽核 LOG。Google 登入、共享後端、中央稽核需另行實作。

> 本儲存庫為 **Public**。請勿將真實公會 LINE 名稱、遊戲名單或 Google 憑證提交到 GitHub。範本中的名字純屬示例；真實資料只放在網站內並定期備份。

## 開發與檢查

需要 Node.js 20+（建議 22）：

```sh
npm install
npm run dev
npm test
npm run build
```

React + Vite。網站預設部署路徑為 `/guild-member-manager/`。

## GitHub Pages 部署

1. 將功能 PR 經測試後併入 `develop`，驗收後再合併至 `main`。
2. Repository → **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. `main` push 後，`.github/workflows/deploy.yml` 會建置並部署到 `https://b110212000.github.io/guild-member-manager/`（必須先完成 Pages 啟用）。
4. **推薦 Source=GitHub Actions**，避免 GitHub 內建的 `pages build and deployment` 將原始碼蓋過 Vite `dist` 成品。若先前選了 Deploy from a branch，流程會在內建 Pages 發布結束後再部署 React 成品。\n5. 重跑工作時使用獨立的 artifact 名稱，避免重複名稱造成部署失敗。\n6. 如尚未設定 Pages，程式碼合併後不代表已上線。

開發規則：Issue → `feature/*` → PR 到 `develop` → CI 驗收 → 合併，再定期由 `develop` PR 到 `main`。

## 名單匯入格式（兩種獨立來源）

網站只有一個「匯入」入口，點開可選 **LINE 群組** 或 **遊戲五團**。六個 Tab 只是查看／編輯，不需逐團上傳。

### 1. LINE 名單

下載「LINE 群組範本」，一欄 `LINE 名稱`，每個 LINE 暱稱一行。每次匯入都會**以新 LINE 名單取代舊名單**（先預覽變化），但不會刪除遊戲 ID 與人工配對。此資料代表一個共同 LINE 群組，不是五個群組。

### 2. 遊戲名單

可使用單一 CSV／Excel 工作表（含 `團別` 欄）直接涵蓋五團，或將 Excel 五個工作表命名為「第一團」～「第五團」，各工作表只需遊戲 ID、隊伍等欄位。匯入會新增角色、更新既有角色所屬團別和隊伍，**不會清除檔案內沒列出的舊角色**。既有人工 LINE 配對優先保留。

遊戲 ID 與 LINE 名稱不一樣時，無法僅靠兩份清單可靠自動判定是否同一人；請在成員編輯畫面人工指定配對（同一個 LINE 名稱可以對應本號與小號）。「無遊戲團」會顯示還找不到對應遊戲 ID 的 LINE 名稱，不代表一定真的未進團。

單張整合表的欄位範例：

| 團別 | 遊戲 ID | 隊伍 | LINE 名稱（選填） | 帳號類型（選填） |
| --- | --- | --- | --- | --- |
| 第一團 | 範例玩家01 | A隊 | 小明 | 主號 |
| 第二團 | 範例分身01 | B隊 | 小明 | 小號 |
| 第三團 | 尚未配對的人物 | A隊 | | 主號 |

遊戲名單的遊戲 ID 和團別必填；LINE 清單則只需要 LINE 名稱。相同 LINE 暱稱**不保證是同一人**，沒有穩定 ID 時只能人工確認。

JSON 完整備份自 v2 格式同時包含 `records` 和 `lineRoster`，舊 v1 備份仍可還原。現有瀏覽器資料不會因新匯入介面而清除。

## 下一階段

若需要「多人共編」和「Google 帳號＋真正可查詢誰做了什麼」：建議接 Cloudflare Workers + D1，實作 Google OAuth、管理員白名單、伺服器端持久化 Audit Log，再將前端儲存方式從 localStorage 改成 API；在此之前不要把本機版本誤認為共享系統。
