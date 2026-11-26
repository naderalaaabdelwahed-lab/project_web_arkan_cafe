const { contextBridge } = require("electron");

const tokenArgument = process.argv.find((argument) => argument.startsWith("--egsoft-api-token="));
const apiToken = tokenArgument ? tokenArgument.slice("--egsoft-api-token=".length) : "";

contextBridge.exposeInMainWorld("arkanDesktop", Object.freeze({
  appName: "Egsoft POS",
  version: "0.1.0",
  healthUrl: "http://127.0.0.1:4317/api/health",
  apiToken
}));
