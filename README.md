# Clipboard Translator

### Translate the text in the image from the clipboard when taking a screenshot.

### 截圖時翻譯圖中的文字。

---

### 使用

1. Releases 下載打包好的執行檔並執行，目前僅提供 Windows 執行檔，其他作業系統需要下載 Source code 手動打包。
2. 準備「Cloud Vision API 憑證金鑰(JSON)」及「Gemini API 金鑰」，可於下方連結申請。
3. 將拿到的金鑰分別設定完成即可(可於選單的 File 底下找到變更選項)。

---

### 本專案使用 Gemini 1.5 Flash 模型，需要申請的服務均有免費額度方案，但不保證以後皆是如此，詳情請參考下方各服務的價格連結。

#### 建立專案以啟用 Cloud Vision API 並建立「服務帳戶」憑證後下載金鑰(JSON)，記得確保專案的帳單帳戶為啟用狀態

https://console.cloud.google.com/apis/library/vision.googleapis.com

#### 價格(每月截圖 1000 張內免費，不保證以後皆是如此)

https://cloud.google.com/vision/pricing

#### 啟用帳單帳戶，如果擔心也可以去帳單頁面設定預算

https://console.developers.google.com/billing/enable

---

#### 獲取 Gemini API 金鑰

https://aistudio.google.com/app/apikey

#### 價格

https://ai.google.dev/pricing

---

### 本地開發

#### 安裝

```
npm install
```

#### 啟動

```
npm run start
```

#### 打包

```
npm run make
```
