const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// A portable app keeps its preferences alongside the executable, not in AppData.
if (app.isPackaged) {
  const directory =
    process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  const dataPath = path.join(directory, "Godoy3D-dados");
  try {
    fs.mkdirSync(dataPath, { recursive: true });
    app.setPath("userData", dataPath);
  } catch (error) {
    // Read-only drives use the OS default. Never prevent the editor from opening.
    console.error(
      "Não foi possível criar a pasta de preferências portátil:",
      error.message,
    );
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 1000,
    minWidth: 900,
    minHeight: 650,
    title: "Godoy 3D Editor",
    backgroundColor: "#14161b",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("https://github.com/gabrielgfernandes1998-oss/Godoy-3D")
    ) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
