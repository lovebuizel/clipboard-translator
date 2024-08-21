const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("api", {
  receiveText: (onReceived) => {
    ipcRenderer.on("text:update", (event, { originalText, translatedText }) => {
      onReceived({ originalText, translatedText })
    })
  },
  sendText: (text) => {
    ipcRenderer.send("text:submit", text)
  },
  sendTranslatedLanguage: (language) => {
    ipcRenderer.send("translatedLanguage:submit", language)
  },
  sendApiKey: (text) => {
    ipcRenderer.send("apiKey:submit", text)
  },
  openExternal: (url) => {
    ipcRenderer.send("external:open", url)
  },
})
