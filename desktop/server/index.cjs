const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");
const { openDatabase } = require("./database.cjs");

async function startLocalServer({ userDataPath, port = 4317 }) {
  const { db, databasePath } = openDatabase(userDataPath);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "arkan-local",
      version: "0.1.0",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: false },
    maxHttpBufferSize: 1e6
  });

  io.on("connection", (socket) => {
    socket.emit("server:ready", {
      service: "arkan-local",
      timestamp: new Date().toISOString()
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", resolve);
  });

  return {
    db,
    io,
    databasePath,
    port,
    close: () => new Promise((resolve, reject) => {
      io.close();
      db.close();
      httpServer.close((error) => error ? reject(error) : resolve());
    })
  };
}

module.exports = { startLocalServer };
