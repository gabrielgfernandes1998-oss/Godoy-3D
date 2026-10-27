import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as T from "three";
import {
  AlertCircle,
  Box,
  Upload,
  Undo2,
  Redo2,
  Move,
  Rotate3D,
  Scaling,
  MousePointer2,
  Trash2,
  Combine,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  Plus,
  Focus,
  Grid2X2,
  Layers,
  Download,
  HelpCircle,
  X,
  Copy,
  Group,
  Magnet,
  ArrowDown,
  Save,
  FolderOpen,
  Settings2,
  PanelTop,
  Scan,
  Hand,
  Check,
  Image,
  FlipHorizontal,
  FlipVertical,
  CircleDot,
  GitBranch,
  Maximize,
  Triangle,
  Spline,
  CheckSquare,
  Sparkles,
} from "lucide-react";
import { Editor, download } from "./editor";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./style.css";

type Icon = React.ComponentType<{ size?: number; strokeWidth?: number }>;
function Button({
  icon: Icon,
  children,
  onClick,
  active = false,
  title = "",
  disabled = false,
  className = "",
}: {
  icon?: Icon;
  children?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`${active ? "active " : ""}${className}`}
      onClick={onClick}
    >
      {Icon && <Icon size={17} strokeWidth={1.65} />} {children}
    </button>
  );
}
function App() {
  const viewport = useRef<HTMLDivElement>(null),
    engine = useRef<Editor | null>(null);
  const [, render] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState("model");
  const [tutorial, setTutorial] = useState(false),
    [step, setStep] = useState(0);
  const [modal, setModal] = useState<"import" | "export" | "limits" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1),
    [up, setUp] = useState("y");
  const [format, setFormat] = useState("glb"),
    [exportScope, setExportScope] = useState(false);
  const [grid, setGrid] = useState(true),
    [wire, setWire] = useState(false),
    [axes, setAxes] = useState(true);
  const [uvOpacity, setUvOpacity] = useState(0.65),
    [uvLines, setUvLines] = useState(true);
  const [uvTool, setUvTool] = useState("move");
  const [uvAmount, setUvAmount] = useState(0.05);
  const [dragging, setDragging] = useState(false);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    textureInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const uvDrag = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    old: Float32Array;
    ids: Set<number>;
  } | null>(null);
  const update = () => {
    render((x) => x + 1);
    setRevision((x) => x + 1);
  };
  const notify = (msg: string) => setMessages((old) => [...old.slice(-3), msg]);
  useEffect(() => {
    const e = new Editor(viewport.current!, update, notify);
    engine.current = e;
    update();
    return () => e.dispose();
  }, []);
  const e = engine.current;
  const selected = e?.selected ?? [],
    object = selected[0],
    mesh = e?.activeMesh;
  const selectedVertices = e?.partVertices() ?? new Set<number>();
  const mats = mesh
    ? Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    : [];
  const mat = mats[0] as T.MeshStandardMaterial | undefined;
  const act = (fn: (editor: Editor) => void) => {
    if (e) {
      fn(e);
      update();
    }
  };
  const mutate = (fn: () => void) => {
    if (e) {
      if (e.selected.some((o) => o.userData.locked))
        return notify("Desbloqueie o objeto antes de editar.");
      e.checkpoint();
      fn();
      e.refreshOverlay();
      update();
    }
  };
  const importFiles = async (files: File[]) => {
    if (!e) return;
    setModal(null);
    setBusy(true);
    await e.importFiles(files, scale, up);
    setBusy(false);
  };
  useEffect(() => {
    if (workspace !== "uv" || !canvas.current || !e) return;
    const c = canvas.current,
      ctx = c.getContext("2d")!;
    const w = (c.width = 720),
      h = (c.height = 720);
    ctx.fillStyle = "#171a20";
    ctx.fillRect(0, 0, w, h);
    const pad = 60,
      size = 600;
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#303640" : "#252a33";
        ctx.fillRect(
          pad + (x * size) / 10,
          pad + (y * size) / 10,
          size / 10,
          size / 10,
        );
      }
    if (mat?.map?.image) {
      try {
        ctx.globalAlpha = uvOpacity;
        ctx.drawImage(mat.map.image, pad, pad, size, size);
        ctx.globalAlpha = 1;
      } catch {}
    }
    ctx.strokeStyle = "#616b7b";
    ctx.strokeRect(pad, pad, size, size);
    ctx.fillStyle = "#8791a1";
    ctx.font = "13px monospace";
    ctx.fillText("0", pad - 16, h - pad + 20);
    ctx.fillText("1", w - pad, h - pad + 20);
    ctx.fillText("V", pad - 24, pad);
    ctx.fillText("U", w - pad + 16, h - pad + 4);
    const g = mesh?.geometry,
      uv = g?.getAttribute(e.uvChannel);
    if (!g || !uv) return;
    const faceCount = (g.index?.count ?? g.getAttribute("position").count) / 3;
    for (let f = 0; f < faceCount; f++) {
      const ids = [0, 1, 2].map((k) =>
        g.index ? g.index.getX(f * 3 + k) : f * 3 + k,
      );
      const highlighted =
        e.mode === "face"
          ? e.parts.has(f)
          : ids.some((i) => selectedVertices.has(i));
      ctx.beginPath();
      ids.forEach((id, k) => {
        const x = pad + uv.getX(id) * size,
          y = pad + (1 - uv.getY(id)) * size;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      if (highlighted) {
        ctx.fillStyle = "#e9b86b55";
        ctx.fill();
      }
      if (uvLines) {
        ctx.strokeStyle = highlighted ? "#f6c678" : "#7d929c88";
        ctx.lineWidth = highlighted ? 1.5 : 0.5;
        ctx.stroke();
      }
    }
    if (e.mode === "vertex")
      for (let i = 0; i < uv.count; i++) {
        ctx.beginPath();
        ctx.arc(
          pad + uv.getX(i) * size,
          pad + (1 - uv.getY(i)) * size,
          selectedVertices.has(i) ? 3.5 : 2,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = selectedVertices.has(i) ? "#ffd18c" : "#90a4b2";
        ctx.fill();
      }
  }, [workspace, revision, uvOpacity, uvLines]);
  const uvPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return new T.Vector2(
      ((event.clientX - r.left) / r.width) * 720,
      ((event.clientY - r.top) / r.height) * 720,
    );
  };
  const uvDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e || !mesh) return;
    const g = mesh.geometry,
      uv = g.getAttribute(e.uvChannel) as T.BufferAttribute;
    if (!uv) return notify("Esta malha não possui o canal UV escolhido.");
    const p = uvPoint(event),
      target = new T.Vector2((p.x - 60) / 600, 1 - (p.y - 60) / 600);
    let id = -1;
    if (e.mode === "vertex") {
      let dist = 0.035;
      for (let i = 0; i < uv.count; i++) {
        const d = target.distanceTo(new T.Vector2(uv.getX(i), uv.getY(i)));
        if (d < dist) {
          dist = d;
          id = i;
        }
      }
    } else {
      if (e.mode === "object") e.setMode("face");
      for (
        let f = 0;
        f < (g.index?.count ?? g.getAttribute("position").count) / 3;
        f++
      ) {
        const ids = [0, 1, 2].map((k) =>
          g.index ? g.index.getX(f * 3 + k) : f * 3 + k,
        );
        const tri = new T.Triangle(
          ...(ids.map((i) => new T.Vector3(uv.getX(i), uv.getY(i), 0)) as [
            T.Vector3,
            T.Vector3,
            T.Vector3,
          ]),
        );
        if (tri.containsPoint(new T.Vector3(target.x, target.y, 0))) {
          id = f;
          break;
        }
      }
    }
    if (id < 0) return;
    if (event.shiftKey) {
      if (e.parts.has(id)) e.parts.delete(id);
      else e.parts.add(id);
    } else if (!e.parts.has(id)) {
      e.parts.clear();
      e.parts.add(id);
    }
    const ids = e.partVertices();
    if (!ids.size) return;
    e.checkpoint();
    let cx = 0,
      cy = 0;
    ids.forEach((i) => {
      cx += uv.getX(i);
      cy += uv.getY(i);
    });
    uvDrag.current = {
      x: target.x,
      y: target.y,
      cx: cx / ids.size,
      cy: cy / ids.size,
      old: Float32Array.from(uv.array),
      ids,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    e.updateGizmo();
    e.refreshOverlay();
    update();
  };
  const uvMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const d = uvDrag.current;
    if (!d || !mesh || !e) return;
    const p = uvPoint(event),
      dx = (p.x - 60) / 600 - d.x,
      dy = 1 - (p.y - 60) / 600 - d.y;
    const uv = mesh.geometry.getAttribute(e.uvChannel) as T.BufferAttribute;
    d.ids.forEach((i) => {
      let x = d.old[i * 2],
        y = d.old[i * 2 + 1];
      if (uvTool === "move") {
        x += dx;
        y += dy;
      } else if (uvTool === "rotate") {
        const a = dx * Math.PI * 2,
          ox = x - d.cx,
          oy = y - d.cy;
        x = d.cx + ox * Math.cos(a) - oy * Math.sin(a);
        y = d.cy + ox * Math.sin(a) + oy * Math.cos(a);
      } else {
        x = d.cx + (x - d.cx) * Math.max(0.01, 1 + dx * 3);
        y = d.cy + (y - d.cy) * Math.max(0.01, 1 + dx * 3);
      }
      uv.setXY(i, x, y);
    });
    uv.needsUpdate = true;
    update();
  };
  const tutorials = [
    [
      "Duas peças, uma ideia",
      "A cena já contém uma boina e uma insígnia. Você também pode importar seus próprios modelos GLB ou OBJ.",
    ],
    [
      "Posicione a insígnia",
      "Selecione a insígnia na lista e use Mover, Girar e Redimensionar. Arraste os eixos coloridos ou digite valores no painel direito.",
    ],
    [
      "Una as peças",
      "Marque as caixas dos dois objetos na lista e clique em Unir. As malhas se tornam um objeto, preservando materiais e UVs.",
    ],
    [
      "Dê um caimento natural",
      "Escolha Vértices, clique na lateral da boina e ative Puxar região. Ajuste o raio e arraste o eixo verde para baixo.",
    ],
    [
      "Edite e exporte",
      "Selecione Faces para apagar uma parte. Desfazer recupera a edição. Exporte em GLB e importe o arquivo para continuar.",
    ],
  ];
  return (
    <div
      className="app"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void importFiles([...event.dataTransfer.files]);
      }}
    >
      <header className="main-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brand-icon">
            <Box size={24} />
          </span>
          <span>
            GODOY<span className="brand-3d">3D</span>
            <small>EDITOR</small>
          </span>
        </a>
        <span className="header-divider" />
        <div className="project-name">
          Projeto sem título <span className="local-badge">LOCAL</span>
        </div>
        <div className="header-spacer" />
        <Button
          icon={HelpCircle}
          onClick={() => {
            setTutorial(true);
            setStep(0);
          }}
        >
          Guia rápido
        </Button>
        <Button
          icon={Save}
          title="Baixar projeto completo para continuar depois"
          onClick={() => e?.saveProject()}
        >
          Salvar projeto
        </Button>
        <Button
          icon={Upload}
          className="import-button"
          onClick={() => setModal("import")}
        >
          Importar
        </Button>
        <Button
          icon={Download}
          className="primary"
          onClick={() => setModal("export")}
        >
          Exportar <ChevronDown size={13} />
        </Button>
      </header>
      <nav className="workspace-tabs">
        <button
          className={workspace === "model" ? "tab active" : "tab"}
          onClick={() => setWorkspace("model")}
        >
          <Box size={15} /> Modelar
        </button>
        <button
          className={workspace === "uv" ? "tab active" : "tab"}
          onClick={() => setWorkspace("uv")}
        >
          <Grid2X2 size={15} /> Editar UV
        </button>
        <span className="version">
          ESPAÇO DE CRIAÇÃO <span>•</span> v0.1.2
        </span>
      </nav>
      <div className="toolbar">
        <div className="tool-group">
          <Button
            icon={Undo2}
            title="Desfazer última edição"
            disabled={!e?.history.length}
            onClick={() => act((x) => x.undo())}
          />
          <Button
            icon={Redo2}
            title="Refazer edição"
            disabled={!e?.future.length}
            onClick={() => act((x) => x.redo())}
          />
        </div>
        <div className="tool-group">
          <Button
            icon={MousePointer2}
            active={e?.shape === "click"}
            onClick={() =>
              act((x) => {
                x.shape = "click";
              })
            }
            title="Selecionar com clique"
          >
            Selecionar
          </Button>
          <Button
            icon={Move}
            active={e?.tool === "translate"}
            onClick={() => act((x) => x.setTool("translate"))}
            title="Mover a seleção pelos eixos"
          >
            Mover
          </Button>
          <Button
            icon={Rotate3D}
            active={e?.tool === "rotate"}
            onClick={() => act((x) => x.setTool("rotate"))}
            title="Girar a seleção"
          >
            Girar
          </Button>
          <Button
            icon={Scaling}
            active={e?.tool === "scale"}
            onClick={() => act((x) => x.setTool("scale"))}
            title="Ajustar o tamanho da seleção"
          >
            Redimensionar
          </Button>
        </div>
        <div className="tool-group">
          <Button
            icon={Spline}
            active={e?.tool === "pull"}
            onClick={() =>
              act((x) => {
                if (x.mode === "object") x.setMode("vertex");
                x.setTool("pull");
              })
            }
            title="Deformar uma região com influência suave"
          >
            Puxar região
          </Button>
          <Button
            icon={Combine}
            onClick={() => act((x) => x.join())}
            title="Reunir malhas, mantendo materiais e UVs"
          >
            Unir
          </Button>
          <Button
            icon={Trash2}
            onClick={() => act((x) => x.remove())}
            title="Apagar seleção; pode deixar uma abertura"
          >
            Apagar
          </Button>
        </div>
        <div className="toolbar-end">
          <Button
            icon={Settings2}
            onClick={() => setModal("limits")}
            title="Formatos e recursos desta versão"
          />
        </div>
      </div>
      <main>
        <aside className="left-panel">
          <div className="panel-title">
            <span>CENA</span>
            <span className="subtle">
              {e?.root.children.length ?? 0} objetos
            </span>
            <Button
              icon={Plus}
              title="Adicionar modelos à cena"
              onClick={() => setModal("import")}
            />
          </div>
          <div className="scene-root">
            <ChevronDown size={14} />
            <Layers size={15} />
            <span>Coleção principal</span>
          </div>
          <div className="object-list">
            {e?.root.children.map((o) => (
              <div
                key={o.uuid}
                className={`object-row ${selected.includes(o) ? "selected" : ""}`}
              >
                <input
                  aria-label={`Selecionar ${o.name}`}
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={(ev) =>
                    e.select(
                      ev.target.checked
                        ? [...selected, o]
                        : selected.filter((s) => s !== o),
                    )
                  }
                />
                <button className="object-name" onClick={() => e.select([o])}>
                  <Box size={15} />
                  <span>{o.name || "Objeto"}</span>
                  {o instanceof T.Group && (
                    <span className="count-pill">{e.meshes([o]).length}</span>
                  )}
                </button>
                <button
                  title={o.visible ? "Ocultar objeto" : "Mostrar objeto"}
                  onClick={() =>
                    mutate(() => {
                      o.visible = !o.visible;
                    })
                  }
                >
                  {o.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  title={
                    o.userData.locked ? "Desbloquear objeto" : "Bloquear objeto"
                  }
                  onClick={() => {
                    e.checkpoint();
                    o.userData.locked = !o.userData.locked;
                    e.updateGizmo();
                    update();
                  }}
                >
                  {o.userData.locked ? (
                    <LockKeyhole size={13} />
                  ) : (
                    <UnlockKeyhole size={13} />
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="scene-actions">
            <Button
              icon={Copy}
              title="Duplicar a seleção"
              onClick={() => act((x) => x.duplicate())}
            />
            <Button
              icon={Group}
              title="Agrupar objetos selecionados sem unir as malhas"
              onClick={() => act((x) => x.group())}
            />
            <Button
              icon={Focus}
              title="Isolar seleção ou mostrar todos os objetos"
              onClick={() =>
                mutate(() => {
                  const hidden = e!.root.children.some((o) => !o.visible);
                  e!.root.children.forEach(
                    (o) => (o.visible = hidden || selected.includes(o)),
                  );
                })
              }
            />
            <Button
              icon={Trash2}
              title="Apagar seleção"
              onClick={() => act((x) => x.remove())}
            />
          </div>
          <section className="selection-section">
            <h3>SELECIONAR PARTE</h3>
            <div className="mode-buttons">
              {(
                [
                  { id: "object", label: "Objeto", icon: Box },
                  { id: "vertex", label: "Vértices", icon: CircleDot },
                  { id: "face", label: "Faces", icon: Triangle },
                ] as const
              ).map((m) => (
                <Button
                  key={m.id}
                  icon={m.icon}
                  active={e?.mode === m.id}
                  onClick={() => act((x) => x.setMode(m.id))}
                >
                  {m.label}
                </Button>
              ))}
            </div>
            <label className="field-label">Forma de seleção</label>
            <div className="segmented">
              {[
                { id: "click", label: "Clique", icon: MousePointer2 },
                { id: "box", label: "Retângulo", icon: Scan },
                { id: "lasso", label: "Laço", icon: Spline },
              ].map((m) => (
                <Button
                  key={m.id}
                  icon={m.icon}
                  active={e?.shape === m.id}
                  onClick={() =>
                    act((x) => {
                      x.shape = m.id;
                    })
                  }
                >
                  {m.label}
                </Button>
              ))}
            </div>
            <select
              aria-label="Operação da seleção"
              value={e?.selectionOp ?? "replace"}
              onChange={(ev) =>
                act((x) => {
                  x.selectionOp = ev.target.value;
                })
              }
            >
              <option value="replace">Substituir seleção</option>
              <option value="add">Adicionar à seleção</option>
              <option value="remove">Remover da seleção</option>
            </select>
            <label className="check-row">
              <input
                type="checkbox"
                checked={e?.through ?? false}
                onChange={(ev) =>
                  act((x) => {
                    x.through = ev.target.checked;
                    x.refreshOverlay();
                  })
                }
              />{" "}
              Selecionar através do objeto
            </label>
            <div className="small-actions">
              <button onClick={() => act((x) => x.invert())}>Inverter</button>
              <button onClick={() => act((x) => x.selectConnected())}>
                Região conectada
              </button>
            </div>
          </section>
          <div className="left-bottom">
            <div className="tip-icon">
              <Sparkles size={18} />
            </div>
            <h4>Sua ideia, em outra dimensão.</h4>
            <p>Comece com dois objetos e descubra o que você pode criar.</p>
            <button
              onClick={() => {
                setTutorial(true);
                setStep(0);
              }}
            >
              Conhecer o editor <span>↗</span>
            </button>
          </div>
        </aside>
        <section
          className={`workspace ${workspace === "uv" ? "uv-workspace" : ""}`}
        >
          <div className="viewport-shell">
            <div className="viewport" ref={viewport} />
            <div className="viewport-heading">
              <span className="view-dot" />
              <b>
                {e?.camera instanceof T.OrthographicCamera
                  ? "Ortográfica"
                  : "Perspectiva"}
              </b>
              <span> / </span>
              <span>Sólido</span>
              <ChevronDown size={12} />
            </div>
            <div className="viewport-selection">
              {object ? (
                <>
                  <span className="selection-dot" />
                  {selected.length > 1
                    ? `${selected.length} objetos selecionados`
                    : object.name}
                  <span className="subtle">
                    {e?.mode === "object"
                      ? "Objeto"
                      : `${e?.parts.size ?? 0} ${e?.mode === "vertex" ? "vértices" : "faces"}`}
                  </span>
                </>
              ) : (
                <>Nenhum objeto selecionado</>
              )}
            </div>
            <div className="view-controls">
              <div className="view-cube">
                <button
                  className="cube-top"
                  onClick={() => act((x) => x.view("top"))}
                >
                  CIMA
                </button>
                <button
                  className="cube-front"
                  onClick={() => act((x) => x.view("front"))}
                >
                  FRENTE
                </button>
                <button
                  className="cube-side"
                  onClick={() => act((x) => x.view("right"))}
                >
                  D
                </button>
              </div>
              <select
                aria-label="Vista da câmera"
                defaultValue=""
                onChange={(ev) => act((x) => x.view(ev.target.value))}
              >
                <option value="" disabled>
                  Vistas
                </option>
                <option value="front">Frontal</option>
                <option value="back">Traseira</option>
                <option value="left">Esquerda</option>
                <option value="right">Direita</option>
                <option value="top">Superior</option>
                <option value="bottom">Inferior</option>
              </select>
            </div>
            <div className="viewport-bottom">
              <div className="navigation-hint">
                <MousePointer2 size={13} />
                <span>Arraste para orbitar</span>
                <span>·</span>
                <span>Roda para zoom</span>
                <span>·</span>
                <span>Botão direito para deslocar</span>
              </div>
              <div className="viewport-tools">
                <Button
                  icon={Focus}
                  title="Mostrar toda a cena"
                  onClick={() => act((x) => x.frameScene())}
                />
                <Button
                  icon={Grid2X2}
                  active={grid}
                  title="Mostrar ou ocultar grade"
                  onClick={() => {
                    setGrid(!grid);
                    act((x) => {
                      x.grid.visible = !grid;
                    });
                  }}
                />
                <Button
                  icon={GitBranch}
                  active={axes}
                  title="Mostrar ou ocultar eixos"
                  onClick={() => {
                    setAxes(!axes);
                    act((x) => {
                      x.axes.visible = !axes;
                    });
                  }}
                />
                <Button
                  icon={Box}
                  active={wire}
                  title="Mostrar aramado"
                  onClick={() => {
                    setWire(!wire);
                    act((x) => x.wire(!wire));
                  }}
                />
                <Button
                  icon={PanelTop}
                  title="Alternar perspectiva e ortográfica"
                  onClick={() => act((x) => x.projection())}
                />
              </div>
            </div>
            {busy && (
              <div className="busy-overlay">
                <div className="spinner" />
                <b>Processando modelo…</b>
                <span>Carregando geometria e materiais</span>
              </div>
            )}
          </div>
          {workspace === "uv" && (
            <div className="uv-editor">
              <div className="uv-header">
                <Grid2X2 size={16} />
                <b>Mapa UV</b>
                <select
                  aria-label="Canal UV"
                  value={e?.uvChannel ?? "uv"}
                  onChange={(ev) =>
                    act((x) => {
                      x.uvChannel = ev.target.value;
                    })
                  }
                >
                  {["uv", "uv1", "uv2", "uv3"]
                    .filter((c) => c === "uv" || mesh?.geometry.getAttribute(c))
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
              </div>
              <div className="uv-tools">
                <Button
                  icon={Move}
                  active={uvTool === "move"}
                  onClick={() => setUvTool("move")}
                  title="Mover UV"
                />
                <Button
                  icon={Rotate3D}
                  active={uvTool === "rotate"}
                  onClick={() => setUvTool("rotate")}
                  title="Girar UV"
                />
                <Button
                  icon={Scaling}
                  active={uvTool === "scale"}
                  onClick={() => setUvTool("scale")}
                  title="Redimensionar UV"
                />
                <Button
                  icon={FlipHorizontal}
                  title="Espelhar UV horizontalmente"
                  onClick={() =>
                    e?.uvEdit(new T.Vector2(), 0, new T.Vector2(-1, 1))
                  }
                />
                <Button
                  icon={FlipVertical}
                  title="Espelhar UV verticalmente"
                  onClick={() =>
                    e?.uvEdit(new T.Vector2(), 0, new T.Vector2(1, -1))
                  }
                />
                <Button
                  icon={Image}
                  title="Carregar textura PNG ou JPG"
                  onClick={() => textureInput.current?.click()}
                />
              </div>
              <canvas
                ref={canvas}
                className="uv-canvas"
                onPointerDown={uvDown}
                onPointerMove={uvMove}
                onPointerUp={() => {
                  uvDrag.current = null;
                }}
                onPointerCancel={() => {
                  uvDrag.current = null;
                }}
              />
              <div className="uv-footer">
                <p>
                  {mesh?.geometry.getAttribute(e!.uvChannel)
                    ? "Clique para selecionar; arraste para editar. Shift adiciona ou remove."
                    : "Selecione uma malha com UV existente."}
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={uvLines}
                    onChange={(ev) => setUvLines(ev.target.checked)}
                  />{" "}
                  Linhas UV
                </label>
                <label>
                  Textura{" "}
                  <input
                    aria-label="Opacidade da textura"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={uvOpacity}
                    onChange={(ev) => setUvOpacity(+ev.target.value)}
                  />
                </label>
                <Button
                  icon={Download}
                  onClick={() => {
                    const c = canvas.current;
                    if (!c || !mesh || !e) return;
                    const out = document.createElement("canvas");
                    out.width = out.height = 1024;
                    const ctx = out.getContext("2d")!,
                      g = mesh.geometry,
                      uv = g.getAttribute(e.uvChannel);
                    if (!uv) return;
                    ctx.strokeStyle = "#000";
                    for (
                      let f = 0;
                      f <
                      (g.index?.count ?? g.getAttribute("position").count) / 3;
                      f++
                    ) {
                      ctx.beginPath();
                      for (let k = 0; k < 3; k++) {
                        const i = g.index ? g.index.getX(f * 3 + k) : f * 3 + k;
                        const x = uv.getX(i) * 1024,
                          y = (1 - uv.getY(i)) * 1024;
                        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                      }
                      ctx.closePath();
                      ctx.stroke();
                    }
                    out.toBlob((b) => {
                      if (b) download(b, "contorno-uv.png", "image/png");
                    });
                  }}
                >
                  Baixar contorno UV
                </Button>
              </div>
            </div>
          )}
        </section>
        <aside className="right-panel">
          <div className="panel-title">
            <span>PROPRIEDADES</span>
            <Settings2 size={14} />
          </div>
          {object ? (
            <>
              <div className="selected-object">
                <span className="selected-icon">
                  <Box size={20} />
                </span>
                <div>
                  <input
                    aria-label="Nome do objeto"
                    value={object.name}
                    onChange={(ev) =>
                      mutate(() => {
                        object.name = ev.target.value;
                      })
                    }
                  />
                  <small>
                    {object instanceof T.Group ? "Grupo de malhas" : "Malha 3D"}{" "}
                    <span>•</span> Selecionado
                  </small>
                </div>
              </div>
              <section className="property-section">
                <h3>
                  <Move size={14} /> Transformação <ChevronDown size={13} />
                </h3>
                <div className="space-toggle">
                  <Button
                    active={e?.gizmo.space === "world"}
                    onClick={() => act((x) => x.gizmo.setSpace("world"))}
                  >
                    Global
                  </Button>
                  <Button
                    active={e?.gizmo.space === "local"}
                    onClick={() => act((x) => x.gizmo.setSpace("local"))}
                  >
                    Local
                  </Button>
                </div>
                {(
                  [
                    { label: "Posição", key: "position" },
                    { label: "Rotação", key: "rotation" },
                    { label: "Escala", key: "scale" },
                  ] as const
                ).map((row) => (
                  <div className="transform-row" key={row.key}>
                    <label>
                      {row.label}
                      {row.key === "rotation" && <small>°</small>}
                    </label>
                    <div className="xyz-fields">
                      {(["x", "y", "z"] as const).map((axis) => (
                        <label key={axis} className={`axis-${axis}`}>
                          <span>{axis.toUpperCase()}</span>
                          <input
                            aria-label={`${row.label} ${axis.toUpperCase()}`}
                            type="number"
                            step={row.key === "rotation" ? 1 : 0.1}
                            value={
                              +(
                                object[row.key][axis] *
                                (row.key === "rotation" ? 180 / Math.PI : 1)
                              ).toFixed(3)
                            }
                            onChange={(ev) =>
                              mutate(() => {
                                object[row.key][axis] =
                                  Number(ev.target.value) *
                                  (row.key === "rotation" ? Math.PI / 180 : 1);
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <Button
                  icon={Focus}
                  className="full-width"
                  onClick={() => act((x) => x.frameSelection())}
                >
                  Enquadrar seleção
                </Button>
                <Button
                  icon={Maximize}
                  className="full-width"
                  onClick={() => act((x) => x.frameScene())}
                >
                  Mostrar toda a cena
                </Button>
                <Button
                  icon={Scaling}
                  className="full-width"
                  title="Ajustar explicitamente a escala ao tamanho dos outros objetos, sem mover a peça"
                  onClick={() => act((x) => x.matchSceneScale())}
                >
                  Ajustar tamanho à cena
                </Button>
              </section>
              {e?.tool === "pull" && (
                <section className="property-section pull-settings">
                  <h3>
                    <Spline size={15} /> Puxar região
                  </h3>
                  <p>
                    A influência diminui suavemente ao se afastar da seleção. O
                    raio usa as unidades locais da malha.
                  </p>
                  <label className="range-label">
                    Raio de influência <b>{e.radius.toFixed(2)}</b>
                  </label>
                  <input
                    aria-label="Raio de influência"
                    type="range"
                    min=".05"
                    max="3"
                    step=".05"
                    value={e.radius}
                    onChange={(ev) =>
                      act((x) => {
                        x.radius = +ev.target.value;
                        x.refreshOverlay();
                      })
                    }
                  />
                  <label className="range-label">
                    Intensidade <b>{e.strength.toFixed(1)}</b>
                  </label>
                  <input
                    aria-label="Intensidade"
                    type="range"
                    min=".1"
                    max="2"
                    step=".1"
                    value={e.strength}
                    onChange={(ev) =>
                      act((x) => {
                        x.strength = +ev.target.value;
                      })
                    }
                  />
                  <label className="range-label">
                    Suavidade <b>{e.smooth.toFixed(1)}</b>
                  </label>
                  <input
                    aria-label="Suavidade"
                    type="range"
                    min=".5"
                    max="4"
                    step=".1"
                    value={e.smooth}
                    onChange={(ev) =>
                      act((x) => {
                        x.smooth = +ev.target.value;
                      })
                    }
                  />
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={e.connected}
                      onChange={(ev) =>
                        act((x) => {
                          x.connected = ev.target.checked;
                        })
                      }
                    />{" "}
                    Somente partes conectadas
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={e.mirror}
                      onChange={(ev) =>
                        act((x) => {
                          x.mirror = ev.target.checked;
                        })
                      }
                    />{" "}
                    Espelhar no eixo X
                  </label>
                  <label className="field-label">
                    Eixo para ajuste numérico
                  </label>
                  <select
                    aria-label="Eixo de ajuste"
                    value={e.axis}
                    onChange={(ev) =>
                      act((x) => {
                        x.axis = ev.target.value;
                      })
                    }
                  >
                    <option value="x">X — lados</option>
                    <option value="y">Y — cima / baixo</option>
                    <option value="z">Z — frente / trás</option>
                  </select>
                  <div className="small-actions">
                    <Button
                      icon={ArrowDown}
                      onClick={() => act((x) => x.pullExact(-0.15))}
                    >
                      Puxar −0,15
                    </Button>
                    <Button
                      icon={Plus}
                      onClick={() => act((x) => x.pullExact(0.15))}
                    >
                      Puxar +0,15
                    </Button>
                  </div>
                </section>
              )}
              <section className="property-section">
                <h3>
                  <CircleDot size={14} /> Material <ChevronDown size={13} />
                </h3>
                {mat && "color" in mat ? (
                  <>
                    <div className="material-card">
                      <div
                        className="material-sphere"
                        style={{
                          background: `radial-gradient(circle at 35% 30%, #ffffff88, ${"#" + mat.color.getHexString()} 48%, #111 100%)`,
                        }}
                      />
                      <div>
                        <b>
                          {mats.length > 1
                            ? `${mats.length} materiais preservados`
                            : mat.name || "Material principal"}
                        </b>
                        <small>
                          {mat.map ? "Textura carregada" : "Cor sólida"}
                        </small>
                      </div>
                    </div>
                    <label className="color-field">
                      Cor base{" "}
                      <input
                        aria-label="Cor base"
                        type="color"
                        value={"#" + mat.color.getHexString()}
                        onChange={(ev) =>
                          mutate(() => mat.color.set(ev.target.value))
                        }
                      />
                      <span>#{mat.color.getHexString().toUpperCase()}</span>
                    </label>
                    {"roughness" in mat && (
                      <>
                        <label className="range-label">
                          Rugosidade <span>{mat.roughness.toFixed(2)}</span>
                        </label>
                        <input
                          aria-label="Rugosidade"
                          type="range"
                          min="0"
                          max="1"
                          step=".01"
                          value={mat.roughness}
                          onChange={(ev) =>
                            mutate(() => {
                              mat.roughness = +ev.target.value;
                            })
                          }
                        />
                        <label className="range-label">
                          Metálico <span>{mat.metalness.toFixed(2)}</span>
                        </label>
                        <input
                          aria-label="Metálico"
                          type="range"
                          min="0"
                          max="1"
                          step=".01"
                          value={mat.metalness}
                          onChange={(ev) =>
                            mutate(() => {
                              mat.metalness = +ev.target.value;
                            })
                          }
                        />
                      </>
                    )}
                    <Button
                      icon={Image}
                      className="full-width"
                      onClick={() => textureInput.current?.click()}
                    >
                      Carregar textura
                    </Button>
                  </>
                ) : (
                  <p>Selecione uma malha para editar seu material.</p>
                )}
              </section>
              <section className="property-section">
                <h3>
                  <Layers size={14} /> Operações
                </h3>
                <Button
                  icon={Magnet}
                  className="full-width"
                  onClick={() => {
                    if (selected.length !== 1)
                      return notify(
                        "Selecione apenas a peça que deseja encaixar.",
                      );
                    act((x) => {
                      x.snapTarget = object.uuid;
                    });
                    notify(
                      "Clique na superfície de outro objeto. O eixo Z da peça será alinhado à normal.",
                    );
                  }}
                >
                  Encaixar na superfície
                </Button>
                <Button
                  icon={Combine}
                  className="full-width"
                  onClick={() => act((x) => x.join())}
                >
                  Unir objetos
                </Button>
                <Button
                  icon={Group}
                  className="full-width"
                  onClick={() => act((x) => x.group())}
                >
                  Agrupar
                </Button>
                <Button
                  icon={Rotate3D}
                  className="full-width"
                  onClick={() =>
                    mutate(() =>
                      e
                        ?.meshes()
                        .forEach((m) => m.geometry.computeVertexNormals()),
                    )
                  }
                >
                  Recalcular normais
                </Button>
              </section>
              <div className="mesh-info">
                <span>GEOMETRIA</span>
                <div>
                  <span>Vértices</span>
                  <b>
                    {e
                      ?.meshes()
                      .reduce(
                        (n, m) => n + m.geometry.getAttribute("position").count,
                        0,
                      )
                      .toLocaleString("pt-BR")}
                  </b>
                </div>
                <div>
                  <span>Faces triangulares</span>
                  <b>
                    {e
                      ?.meshes()
                      .reduce(
                        (n, m) =>
                          n +
                          (m.geometry.index?.count ??
                            m.geometry.getAttribute("position").count) /
                            3,
                        0,
                      )
                      .toLocaleString("pt-BR")}
                  </b>
                </div>
                <div>
                  <span>Unidade de edição</span>
                  <b>Unidade local</b>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-properties">
              <MousePointer2 size={28} />
              <h4>Escolha um objeto</h4>
              <p>
                Clique no modelo ou em seu nome na lista da cena para começar a
                editar.
              </p>
            </div>
          )}
        </aside>
      </main>
      <footer className="statusbar">
        <span className="ready-dot" />
        <span>{busy ? "Processando…" : "Pronto para criar"}</span>
        <span className="status-divider" />
        <span>{e?.root.children.length ?? 0} objetos</span>
        <span>
          {selected.length} selecionado{selected.length !== 1 ? "s" : ""}
        </span>
        <div />
        <span>
          <LockKeyhole size={11} /> Seus arquivos ficam no navegador
        </span>
        <button onClick={() => setModal("limits")}>Sobre esta versão</button>
      </footer>
      {messages.length > 0 && (
        <div className="notifications" role="status">
          {messages.map((m, i) => (
            <div className="notification" key={`${m}-${i}`}>
              <span>
                {/Falha|interrompida|ausente|indisponível|cancelada/.test(m) ? (
                  <AlertCircle size={16} />
                ) : (
                  <Check size={16} />
                )}
              </span>
              <p>{m}</p>
              <button
                aria-label="Fechar aviso"
                onClick={() =>
                  setMessages((old) => old.filter((_, j) => j !== i))
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {tutorial && (
        <div className="tutorial-card">
          <div className="tutorial-top">
            <span>SEUS PRIMEIROS PASSOS</span>
            <button
              aria-label="Fechar tutorial"
              onClick={() => setTutorial(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="tutorial-number">
            0{step + 1}
            <span>/ 05</span>
          </div>
          <h2>{tutorials[step][0]}</h2>
          <p>{tutorials[step][1]}</p>
          <div className="tutorial-bottom">
            <div className="steps">
              {tutorials.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Passo ${i + 1}`}
                  className={i === step ? "current" : ""}
                  onClick={() => setStep(i)}
                />
              ))}
            </div>
            <Button
              className="primary"
              onClick={() =>
                step === 4 ? setTutorial(false) : setStep(step + 1)
              }
            >
              {step === 4 ? "Vamos criar" : "Próximo"}{" "}
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={45} />
          <h2>Solte seus modelos aqui</h2>
          <p>Inclua MTL e texturas junto com o arquivo OBJ.</p>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => !busy && setModal(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-heading">
              <h2>
                {modal === "import"
                  ? "Traga sua próxima ideia"
                  : modal === "export"
                    ? "Seu modelo, pronto para sair"
                    : "Recursos desta versão"}
              </h2>
              <Button icon={X} title="Fechar" onClick={() => setModal(null)} />
            </div>
            {modal === "import" ? (
              <>
                <p>
                  Importe vários modelos na mesma cena. Nenhuma conversão altera
                  sua geometria automaticamente.
                </p>
                <button
                  className="upload-zone"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={30} />
                  <b>Escolher arquivos</b>
                  <span>ou arraste os arquivos para a janela</span>
                  <small>GLB · GLTF · OBJ + MTL · STL · FBX · 3MF · USDZ</small>
                </button>
                <div className="import-options">
                  <label>
                    Escala de importação
                    <input
                      aria-label="Escala de importação"
                      type="number"
                      min=".00001"
                      step=".01"
                      value={scale}
                      onChange={(ev) =>
                        setScale(Math.max(0.00001, +ev.target.value))
                      }
                    />
                  </label>
                  <label>
                    Eixo vertical
                    <select
                      value={up}
                      onChange={(ev) => setUp(ev.target.value)}
                    >
                      <option value="y">Y (GLB / Three.js)</option>
                      <option value="z">Z (converter para Y)</option>
                    </select>
                  </label>
                </div>
                <p className="notice">
                  BLEND precisa de um serviço Blender separado. DXF ainda não
                  está disponível. Use GLB para preservar materiais e texturas.
                </p>
                <div className="modal-bottom">
                  <Button
                    icon={FolderOpen}
                    onClick={() => projectInput.current?.click()}
                  >
                    Abrir projeto .godoy
                  </Button>
                  <Button
                    icon={Sparkles}
                    onClick={() => {
                      act((x) => x.examples());
                      setModal(null);
                    }}
                  >
                    Carregar exemplos
                  </Button>
                </div>
              </>
            ) : modal === "export" ? (
              <>
                <p>Escolha o formato e o conteúdo que deseja levar com você.</p>
                <div className="export-formats">
                  {[
                    {
                      id: "glb",
                      title: "GLB",
                      desc: "Modelo, UVs, materiais e texturas. Recomendado.",
                    },
                    {
                      id: "obj",
                      title: "OBJ + MTL",
                      desc: "ZIP com geometria, UVs, cores e texturas básicas.",
                    },
                    {
                      id: "stl",
                      title: "STL",
                      desc: "Somente geometria. Para impressão 3D.",
                    },
                  ].map((f) => (
                    <button
                      className={
                        format === f.id ? "format-card chosen" : "format-card"
                      }
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                    >
                      <Box size={22} />
                      <b>{f.title}</b>
                      <small>{f.desc}</small>
                      {format === f.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={exportScope}
                    onChange={(ev) => setExportScope(ev.target.checked)}
                  />{" "}
                  Exportar somente os objetos selecionados
                </label>
                <p className="notice">
                  GLB é a melhor opção para reabrir o resultado neste editor.
                  Para guardar o trabalho completo, use “Salvar projeto”. OBJ
                  preserva materiais básicos; efeitos PBR não são equivalentes.
                </p>
                <Button
                  className="primary full-width"
                  icon={Download}
                  disabled={busy}
                  onClick={async () => {
                    if (!e) return;
                    setBusy(true);
                    await e.export(format, exportScope);
                    setBusy(false);
                    setModal(null);
                  }}
                >
                  Baixar modelo {format.toUpperCase()}
                </Button>
              </>
            ) : (
              <>
                <p>
                  Esta primeira versão prioriza edição real de malhas estáticas,
                  o fluxo boina + insígnia e UVs existentes.
                </p>
                <ul className="limits-list">
                  <li>
                    <b>Disponível:</b> importar modelos, editar
                    objetos/vértices/faces, seleção por clique/retângulo/laço,
                    edição proporcional, agrupamento, união sem fusão,
                    histórico, materiais, UVs, projetos e exportação.
                  </li>
                  <li>
                    <b>UV:</b> seleção sincronizada, mover/girar/escalar por
                    arraste, espelhar, trocar PNG/JPG e exportar contorno. Não
                    cria UVs automaticamente.
                  </li>
                  <li>
                    <b>Ainda não disponível:</b> arestas, dissolver, preencher
                    furos, soldar, separar região, união booleana, deformar peça
                    sobre uma superfície, costuras, relaxamento, ilhas UV, atlas
                    com bake e edição de animações.
                  </li>
                  <li>
                    <b>BLEND:</b> precisa de um serviço externo com Blender.
                    Nenhum serviço de conversão foi configurado.
                  </li>
                  <li>
                    <b>DXF:</b> entidades 2D e 3D ainda não são lidas. Converta
                    a malha para GLB ou OBJ em uma ferramenta apropriada.
                  </li>
                  <li>
                    <b>Desempenho:</b> arquivos são processados localmente.
                    Operações em malhas grandes ainda podem bloquear a
                    interface; não há cancelamento durante o parsing.
                  </li>
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept=".glb,.gltf,.obj,.mtl,.bin,.png,.jpg,.jpeg,.webp,.stl,.fbx,.3mf,.usdz,.blend,.dxf"
        onChange={(ev) => {
          void importFiles([...(ev.target.files ?? [])]);
          ev.target.value = "";
        }}
      />
      <input
        hidden
        ref={projectInput}
        type="file"
        accept=".godoy"
        onChange={(ev) => {
          void importFiles([...(ev.target.files ?? [])]);
          ev.target.value = "";
        }}
      />
      <input
        hidden
        ref={textureInput}
        type="file"
        accept="image/png,image/jpeg"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f)
            void e
              ?.loadTexture(f)
              .catch((err) => notify(`Falha na textura: ${err.message}`));
          ev.target.value = "";
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
