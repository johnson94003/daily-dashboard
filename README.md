# 每日儀錶板

手機用的每日待辦儀錶板，資料存在你自己的 Google Sheet。

- **頂部捕捉列**：想到什麼直接打字按 ＋，丟進收件匣
- **今日**：今天要做的任務 + 重複習慣，點圓圈打勾
- **收件匣**：把隨手記的東西整理成任務（可設不重複／每天／每週、分類、優先、截止日）
- **雜念**：隨手記心得、想法

任務和習慣是同一種東西，差別只在「重複」設定（不重複／每天／每週）。

## 技術

純 HTML + CSS + Vanilla JS（無框架）+ PWA（可加到手機主畫面）。
後端是一支 Google Apps Script，前端只跟它講話，Sheet 的存取權限留在你自己帳號下。

```
手機網站 (GitHub Pages) → Apps Script Web App → Google Sheet
```

---

## 安裝（一次性，約 10 分鐘）

### A. 建後端（Google Sheet + Apps Script）

1. 到 [sheets.new](https://sheets.new) 開一個新的 Google Sheet，取個名字（例如「每日儀錶板資料」）。
2. 上方選單 **擴充功能 (Extensions) → Apps Script**。
3. 把 `apps-script/Code.gs` 的內容整個貼進去，蓋掉原本的 `function myFunction(){}`，存檔（Ctrl/Cmd+S）。
4. 上方函式下拉選 **`setup`**，按 **執行**。第一次會跳授權 → 選你的帳號 → 「進階」→「前往（不安全）」→ 允許。
   執行完 Sheet 會自動長出 `Tasks` / `Completions` / `Notes` 三個分頁。
5. 右上 **部署 → 新增部署作業**：
   - 齒輪選 **網頁應用程式**
   - 執行身分：**我**
   - 誰可以存取：**任何人 (Anyone)**
   - 按部署，複製 **網頁應用程式網址**（`https://script.google.com/macros/s/..../exec`）

### B. 接上前端

把上一步的網址貼到 `js/config.js`：

```js
window.API_URL = "https://script.google.com/macros/s/你的部署ID/exec";
```

本機測試：直接雙擊 `index.html` 用瀏覽器打開。
（`API_URL` 留空時會跑「示範模式」，用假資料看畫面。）

### C. 部署到 GitHub Pages（手機用）

1. 在 GitHub 建一個新 repo（例如 `daily-dashboard`）。
2. 在這個資料夾：

```bash
git init
git remote add origin https://github.com/你的帳號/daily-dashboard.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
python3 deploy.py
```

3. GitHub repo → Settings → Pages → Source 選 `gh-pages` 分支。
4. 約 1-2 分鐘後開 `https://你的帳號.github.io/daily-dashboard`，
   在手機 Safari/Chrome 開這個網址 → 分享 → **加入主畫面**，就像 App 一樣。

> ⚠️ `js/config.js` 裡的 API_URL 會被推上 GitHub。這個網址等於後端入口，
> 若 repo 是 public 任何人拿到網址都能讀寫你的 Sheet。建議把 repo 設成 **private**，
> 或接受「知道網址才能用」這個風險（個人用通常可接受）。

### 後續更新

改完程式後：

```bash
git add . && git commit -m "update" && python3 deploy.py
```

改 `Code.gs` 後要回 Apps Script：**部署 → 管理部署作業 → 編輯(鉛筆) → 版本選「新版本」** 才會生效。

## 資料表結構（Apps Script 會自動建）

- **Tasks**：`id, content, category, repeat, repeat_days, priority, due, status, triaged, created_at, learning`
  - `learning`：每件事的學習筆記（在任務卡片點「📝 學到什麼」寫入，供日後回顧）
  - `repeat`：`none` / `daily` / `weekly`；`repeat_days` 每週時填星期（1=一…7=日，逗號分隔，如 `1,3,5`）
  - `triaged`：`FALSE` 在收件匣，`TRUE` 進今日
- **Completions**：`date, task_id, logged_at`（重複任務每天的完成紀錄）
- **Notes**：`id, content, created_at`
