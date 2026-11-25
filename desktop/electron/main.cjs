const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { startLocalServer } = require("../server/index.cjs");

let mainWindow;
let localServer;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 650,
    show: false,
    backgroundColor: "#101820",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadFile(path.join(__dirname, "../ui/index.html"));
}

app.whenReady().then(async () => {
  try {
    localServer = await startLocalServer({
      userDataPath: app.getPath("userData")
    });
    await createWindow();
  } catch (error) {
    dialog.showErrorBox(
      "ARKAN POS could not start",
      error && error.message ? error.message : String(error)
    );
    app.quit();
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", async () => {
  if (localServer) {
    const server = localServer;
    localServer = null;
    await server.close().catch(() => {});
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
