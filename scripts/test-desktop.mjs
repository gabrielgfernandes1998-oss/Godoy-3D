import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const binary = process.env.GODOY_DESKTOP_BINARY;
if (!binary)
  throw new Error(
    "Defina GODOY_DESKTOP_BINARY com o executável desktop compilado.",
  );
const app = await electron.launch({
  executablePath: path.resolve(binary),
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  timeout: 30000,
});
try {
  const window = await app.firstWindow();
  await window.waitForLoadState("load");
  const errors = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await expect(window.getByLabel("Nome do objeto")).toHaveValue("Boina");
  const configuration = await app.evaluate(({ BrowserWindow }) => {
    const web = BrowserWindow.getAllWindows()[0].webContents;
    const preferences = web.getLastWebPreferences();
    return {
      url: web.getURL(),
      nodeIntegration: preferences.nodeIntegration,
      contextIsolation: preferences.contextIsolation,
      sandbox: preferences.sandbox,
    };
  });
  expect(configuration.url).toMatch(/^file:/);
  expect(configuration.nodeIntegration).toBe(false);
  expect(configuration.contextIsolation).toBe(true);
  expect(configuration.sandbox).toBe(true);
  await window.getByLabel("Selecionar Insígnia", { exact: true }).check();
  await window.getByRole("button", { name: "Unir", exact: true }).click();
  await expect(window.getByLabel("Nome do objeto")).toHaveValue(
    "Boina + insígnia",
  );
  await window.getByRole("button", { name: "Vértices", exact: true }).click();
  await window.getByRole("button", { name: "Inverter", exact: true }).click();
  await window
    .getByRole("button", { name: "Puxar região", exact: true })
    .click();
  await window
    .getByRole("button", { name: "Puxar −0,15", exact: true })
    .click();
  // Avoid the native save dialog, and check the actual desktop download content.
  const downloadPath = path.resolve("release", "desktop-smoke.godoy");
  await app.evaluate(({ session }, filename) => {
    session.defaultSession.once("will-download", (_event, item) =>
      item.setSavePath(filename),
    );
  }, downloadPath);
  await window
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  let project;
  await expect(async () => {
    project = JSON.parse(await fs.readFile(downloadPath, "utf8"));
    expect(project.format).toBe("godoy-3d");
  }).toPass({ timeout: 15000 });
  expect(project.scene.object.children).toHaveLength(1);
  await window.getByRole("button", { name: "Editar UV", exact: true }).click();
  await expect(window.locator(".uv-canvas")).toBeVisible();
  await fs.unlink(downloadPath);
  expect(errors).toEqual([]);
  console.log(
    "Desktop validado: abertura offline, WebGL, isolamento, união, edição, UV e download de projeto.",
  );
} finally {
  await app.close();
}
