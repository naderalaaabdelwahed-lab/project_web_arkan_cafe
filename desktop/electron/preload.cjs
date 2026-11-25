const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("arkanDesktop", Object.freeze({
  appName: "ARKAN POS",
  version: "0.1.0",
  healthUrl: "http://127.0.0.1:4317/api/health"
}));
