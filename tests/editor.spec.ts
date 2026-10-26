import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("boina e insígnia: unir, deformar, apagar, desfazer e reabrir GLB", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("Boina");
  await page.getByLabel("Selecionar Insígnia", { exact: true }).check();
  await page.getByRole("button", { name: "Unir", exact: true }).click();
  await expect(page.getByLabel("Nome do objeto")).toHaveValue(
    "Boina + insígnia",
  );
  await page.getByRole("button", { name: "Vértices", exact: true }).click();
  await page.getByRole("button", { name: "Inverter", exact: true }).click();
  await page.getByRole("button", { name: "Puxar região", exact: true }).click();
  await page.getByRole("button", { name: "Puxar −0,15", exact: true }).click();
  // Save edited geometry, then use this as an exact comparison after GLB round-trip.
  let save = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  let download = await save;
  const before = JSON.parse(await readFile((await download.path())!, "utf8"));
  const geometry = before.scene.geometries[0];
  const positions = geometry.data.attributes.position.array;
  expect(positions.length).toBeGreaterThan(100);
  expect(before.scene.object.children).toHaveLength(1);
  await page.getByRole("button", { name: "Faces", exact: true }).click();
  await page.getByRole("button", { name: "Inverter", exact: true }).click();
  await page.getByRole("button", { name: "Apagar", exact: true }).click();
  await page
    .getByRole("button", { name: "Desfazer última edição", exact: true })
    .click();
  await page.getByRole("button", { name: /^Exportar/ }).click();
  save = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar modelo GLB", exact: true })
    .click();
  download = await save;
  const glbPath = (await download.path())!;
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles({
      name: "resultado.glb",
      mimeType: "model/gltf-binary",
      buffer: await readFile(glbPath),
    });
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("resultado", {
    timeout: 20000,
  });
  save = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  download = await save;
  const after = JSON.parse(await readFile((await download.path())!, "utf8"));
  const found = after.scene.geometries.find(
    (g: any) =>
      g.data.attributes.position.array.length === positions.length &&
      g.data.attributes.position.array.every(
        (v: number, i: number) => Math.abs(v - positions[i]) < 1e-6,
      ),
  );
  expect(found).toBeTruthy();
  expect(found.data.attributes.uv).toBeTruthy();
  expect(after.scene.materials.length).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath("editor.png") });
  expect(errors).toEqual([]);
});
test("OBJ real, UV e projeto persistente", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("Boina");
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles({
      name: "triangulo.obj",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "o Triangulo\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n",
      ),
    });
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("triangulo");
  // OBJ hierarchy is preserved. An imported group with one mesh supports part editing.
  await page.getByRole("button", { name: "Faces", exact: true }).click();
  await page.getByRole("button", { name: "Inverter", exact: true }).click();
  await page.getByRole("button", { name: "Editar UV", exact: true }).click();
  await page
    .getByRole("button", { name: "Espelhar UV horizontalmente", exact: true })
    .click();
  let pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const file = await pending;
  const json = JSON.parse(await readFile((await file.path())!, "utf8"));
  const g = json.scene.geometries.find(
    (x: any) => x.data?.attributes.position.array.length === 9,
  );
  expect(g.data.attributes.uv.array).toEqual(
    [2 / 3, 0, -1 / 3, 0, 2 / 3, 1].map(Math.fround),
  );
  await page
    .getByRole("button", { name: "Desfazer última edição", exact: true })
    .click();
  pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const undo = await pending;
  const restored = JSON.parse(await readFile((await undo.path())!, "utf8"));
  expect(
    restored.scene.geometries.find(
      (x: any) => x.data?.attributes.position.array.length === 9,
    ).data.attributes.uv.array,
  ).toEqual([0, 0, 1, 0, 0, 1]);
});
test("formatos não implementados geram erro claro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("Boina");
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles({
      name: "teste.blend",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("BLENDER"),
    });
  await expect(page.getByRole("status")).toContainText(
    "BLEND requer um serviço separado com Blender",
  );
  await expect(
    page.getByLabel("Selecionar Boina", { exact: true }),
  ).toBeChecked();
});
test("texturas, reabertura de projeto e exportações OBJ/STL", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("Boina");
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 8, 8);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator('input[accept="image/png,image/jpeg"]')
    .setInputFiles({
      name: "textura.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
  await expect(
    page.getByText("Textura carregada", { exact: true }),
  ).toBeVisible();
  let pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  let file = await pending;
  const project = await readFile((await file.path())!);
  const json = JSON.parse(project.toString());
  expect(json.scene.images[0].url).toMatch(/^data:image\/png/);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .locator('input[accept=".godoy"]')
    .setInputFiles({
      name: "restaurado.godoy",
      mimeType: "application/json",
      buffer: project,
    });
  await expect(page.getByLabel("Nome do objeto")).toHaveValue("restaurado");
  await page.getByRole("button", { name: /^Exportar/ }).click();
  await page.getByRole("button", { name: /^OBJ \+ MTL/ }).click();
  pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar modelo OBJ", exact: true })
    .click();
  file = await pending;
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(Object.keys(zip.files)).toContain("modelo.obj");
  expect(Object.keys(zip.files).some((x) => x.endsWith(".png"))).toBe(true);
  expect(await zip.file("materiais.mtl")!.async("string")).toContain("map_Kd");
  await page.getByRole("button", { name: /^Exportar/ }).click();
  await page.getByRole("button", { name: /^STL Somente/ }).click();
  pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar modelo STL", exact: true })
    .click();
  file = await pending;
  const bytes = await readFile((await file.path())!);
  expect(bytes.readUInt32LE(80)).toBeGreaterThan(2000);
  expect(bytes.length).toBe(84 + 50 * bytes.readUInt32LE(80));
});
