const {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  dialog,
  Menu,
  shell,
} = require("electron")
const path = require("path")
const fs = require("fs")
const {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} = require("@google/generative-ai")
const Jimp = require("jimp")
const vision = require("@google-cloud/vision")

// 設定 Gemini 翻譯內容限制最小
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
]

let mainWindow
let apiKeyWindow
let aboutWindow
let translatedLanguage = "繁體中文"

// Gemini
let model
// Cloud Vision
let client

if (require("electron-squirrel-startup")) app.quit()

// -------- 監聽事件 --------
app.whenReady().then(() => {
  createMainWindow()
  loadCertificatePath()
  checkClipboardForImage()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// 翻譯
ipcMain.on("text:submit", (event, text) => {
  mainWindow.webContents.send("text:update", {
    originalText: text,
    translatedText: "Translating...",
  })
  translateText(text, translatedLanguage)
    .then((translatedText) => {
      mainWindow.webContents.send("text:update", {
        originalText: text,
        translatedText,
      })
    })
    .catch((err) => console.log("err:", err))
})

// 變更翻譯語言
ipcMain.on("translatedLanguage:submit", (event, language) => {
  translatedLanguage = language
})

// 儲存 Gemini API 金鑰
ipcMain.on("apiKey:submit", (event, apiKey) => {
  apiKeyWindow.close()
  saveApiKey(apiKey)
  loadAndUseApiKey(apiKey)
})

// 開啟外部連結
ipcMain.on("external:open", (event, url) => {
  shell.openExternal(url)
})

// -------- 建立window --------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  })

  mainWindow.loadFile("index.html")
  // 防止子視窗還存活
  mainWindow.on("closed", () => app.quit())
  const mainMenu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(mainMenu)
}

function createApiKeyWindow() {
  apiKeyWindow = new BrowserWindow({
    width: 400,
    height: 160,
    alwaysOnTop: true,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  })
  apiKeyWindow.loadURL(`file://${__dirname}/apiKey.html`)
  apiKeyWindow.on("closed", () => (apiKeyWindow = null))

  const apiKeyMenu = Menu.buildFromTemplate([])
  apiKeyWindow.setMenu(apiKeyMenu)
}

function createAboutWindow() {
  aboutWindow = new BrowserWindow({
    width: 700,
    height: 500,
    alwaysOnTop: true,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  })
  aboutWindow.loadURL(`file://${__dirname}/about.html`)
  aboutWindow.on("closed", () => (aboutWindow = null))

  const aboutMenu = Menu.buildFromTemplate([])
  aboutWindow.setMenu(aboutMenu)
}

// 定期檢查是否有新截圖
function checkClipboardForImage() {
  const image = clipboard.readImage()
  let previousImage = null
  if (!image.isEmpty()) {
    previousImage = clipboard.readImage()
  }

  setInterval(() => {
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      if (
        !previousImage ||
        !image.toDataURL().includes(previousImage.toDataURL())
      ) {
        console.log("New image detected in clipboard!")
        const imageBuffer = base64ToBuffer(image.toDataURL())
        Jimp.read(imageBuffer)
          .then((image) => {
            image.greyscale()
            return image.getBufferAsync(Jimp.MIME_PNG)
          })
          .then((buffer) => {
            // 本地儲存圖片 debug用
            // fs.writeFile("./image.png", buffer, (err) => {
            //   if (err) {
            //     console.error("Error saving image:", err)
            //   } else {
            //     console.log("Image saved successfully:")
            //   }
            // })

            return client.textDetection(buffer)
          })
          .then((results) => {
            const detections = results[0].textAnnotations
            const text = detections[0].description
            console.log("文字識別結果:", text)
            mainWindow.webContents.send("text:update", {
              originalText: text,
              translatedText: "Translating...",
            })
            return translateText(text, translatedLanguage).then(
              (translatedText) => {
                mainWindow.webContents.send("text:update", {
                  originalText: text,
                  translatedText,
                })
              }
            )
          })
          .catch((err) => {
            console.error("Error:", err)
          })
        previousImage = image
      }
    }
  }, 1000) // 每秒檢查一次是否有新截圖
}

// 翻譯
async function translateText(text, targetLanguage = translatedLanguage) {
  const prompt = `Translate the following text to ${targetLanguage}:\n\n${text}`

  const result = await model.generateContent(prompt)
  const response = await result.response
  const translatedText = response.text()
  console.log(translatedText)
  return translatedText
}

// 將 Base64 編碼的圖像數據轉換為 Buffer
function base64ToBuffer(base64String) {
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "")
  return Buffer.from(base64Data, "base64")
}

// -------- Cloud Vision API 憑證金鑰 --------
function loadCertificatePath() {
  const configPath = path.join(app.getPath("userData"), "config.json")

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))

    if (config.certificatePath && fs.existsSync(config.certificatePath)) {
      loadAndUseCertificate(config.certificatePath)
    } else {
      console.log("配置文件中未找到憑證金鑰")
      promptForCertificate()
    }
  } else {
    console.log("未找到配置文件，請選取憑證金鑰")
    promptForCertificate()
  }
}

function promptForCertificate() {
  mainWindow.setAlwaysOnTop(false)
  dialog
    .showOpenDialog({
      title: "選擇您的 Google Cloud Vision API 憑證金鑰",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    .then((result) => {
      if (!result.canceled) {
        const filePath = result.filePaths[0]
        saveCertificatePath(filePath)
        loadAndUseCertificate(filePath)
        mainWindow.setAlwaysOnTop(true)
      }
    })
    .catch((err) => {
      console.error("文件選擇錯誤:", err)
    })
}

function saveCertificatePath(filePath) {
  const configPath = path.join(app.getPath("userData"), "config.json")
  let config = {}

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"))
  }

  config.certificatePath = filePath
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8")
  console.log("憑證金鑰位置已儲存")
}

function loadAndUseCertificate(certificatePath) {
  client = new vision.ImageAnnotatorClient({
    keyFilename: certificatePath,
  })
  loadApiKey()
}

// -------- Gemini API 金鑰 --------
function loadApiKey() {
  const configPath = path.join(app.getPath("userData"), "config.json")

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))

    if (config.apiKey) {
      loadAndUseApiKey(config.apiKey)
    } else {
      console.log("配置文件中未找到 Gemini API 金鑰")
      promptForApiKey()
    }
  } else {
    console.log("未找到配置文件，請輸入 Gemini API 金鑰")
    promptForApiKey()
  }
}

function promptForApiKey() {
  createApiKeyWindow()
}

function saveApiKey(apiKey) {
  const configPath = path.join(app.getPath("userData"), "config.json")
  let config = {}

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"))
  }

  config.apiKey = apiKey
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8")
  console.log("Gemini API 金鑰已儲存:", apiKey)
}

function loadAndUseApiKey(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey)
  model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    safetySettings,
  })
}

// -------- 選單 --------
const menuTemplate = [
  {
    label: "File",
    submenu: [
      {
        label: "變更 Google Cloud Vision API 憑證金鑰(JSON)",
        click: promptForCertificate,
      },
      { label: "變更 Gemini API 金鑰", click: promptForApiKey },
      {
        label: "Quit",
        accelerator: process.platform === "darwin" ? "Command+Q" : "Ctrl+Q",
        click: () => app.quit(),
      },
    ],
  },
  {
    label: "Help",
    submenu: [{ label: "About", click: createAboutWindow }],
  },
]

if (process.platform === "darwin") {
  menuTemplate.unshift({ label: "" })
}

// 啟用開發人員工具 debug用
// menuTemplate.push({
//   label: "View",
//   submenu: [
//     { role: "reload" },
//     {
//       label: "Toggle Developer Tools",
//       accelerator:
//         process.platform === "darwin" ? "Command+Alt+I" : "Ctrl+Shift+I",
//       click: (item, focusedWindow) => {
//         focusedWindow.toggleDevTools()
//       },
//     },
//   ],
// })
