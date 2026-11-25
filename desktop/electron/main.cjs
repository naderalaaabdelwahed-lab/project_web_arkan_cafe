const { app, BrowserWindow, dialog, globalShortcut } = require("electron");
const path = require("node:path");
const { startLocalServer } = require("../server/index.cjs");

let mainWindow;
let kitchenWindow;
let localServer;

function loadDesktopEnv() {
  const fs = require("node:fs");
  const envPath = path.join(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\\r?\\n/)) {
    const match = line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\\1$/, "$2");
  }
}

async function createKitchenWindow() {
  if (kitchenWindow && !kitchenWindow.isDestroyed()) {
    kitchenWindow.focus();
    return;
  }
  kitchenWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#101820",
    title: "Egsoft - شاشة المطبخ",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  kitchenWindow.on("closed", () => { kitchenWindow = null; });
  await kitchenWindow.loadFile(path.join(__dirname, "../ui/kitchen.html"));
}

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
    localServer = await startLocalServer({ userDataPath: app.getPath("userData") });
    await createWindow();
    globalShortcut.register("CommandOrControl+K", createKitchenWindow);
  } catch (error) {
    dialog.showErrorBox(
      "Egsoft POS could not start",
      error && error.message ? error.message : String(error)
    );
    app.quit();
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());

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
