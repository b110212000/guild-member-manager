# 公會成員管理 Guild Member Manager

以 **第一團、第二團、第三團、第四團、第五團、無遊戲團** 六個 Tab 為主的遊戲公會成員名單管理網站。

## 第一版功能

- 六個團別切換，各團獨立名單：遊戲 ID、LINE 名稱、隊伍、主號／小號
- 新增、編輯、刪除、修改所屬團別
- 全團搜尋；篩選已配對、缺 LINE 名稱、缺遊戲 ID
- **每團獨立匯入** Excel (.xlsx)、CSV (.csv)、TSV (.tsv)；預覽、跳過錯誤列、跨團重複遊戲 ID 可選擇跳過或更新並移團
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
4. 如尚未設定 Pages，程式碼合併後不代表已上線。

開發規則：Issue → `feature/*` → PR 到 `develop` → CI 驗收 → 合併，再定期由 `develop` PR 到 `main`。

## 名單匯入格式

CSV／Excel 第一列可使用中文標題，欄位順序可調整：

| 遊戲 ID | LINE 名稱 | 隊伍 | 帳號類型 |
| --- | --- | --- | --- |
| 範例玩家01 | 小明 | A隊 | 主號 |
| 範例分身01 | 小明 | B隊 | 小號 |
| | 尚未進團的人 | | 主號 |

可不填遊戲 ID 或 LINE 名稱其中之一，但不能都空白。相同 LINE 暱稱**不保證是同一人**；系統只做文字搜尋與人工配對。

## 下一階段

若需要「多人共編」和「Google 帳號＋真正可查詢誰做了什麼」：建議接 Cloudflare Workers + D1，實作 Google OAuth、管理員白名單、伺服器端持久化 Audit Log，再將前端儲存方式從 localStorage 改成 API；在此之前不要把本機版本誤認為共享系統。
