"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import ReactFlow, { Controls, Handle, Position, useReactFlow, Panel } from "reactflow";
import type { Node, Edge, NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { DateTime } from "luxon";
import { supabase } from "../../lib/supabaseClient";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// ================= TYPES =================
type Task = {
  id: string;
  title: string;
  parent_id: string | null;
  completed: boolean;
  due_at: string | null;
  sort_order: number;
  notes: string | null;
  owner_id: string | null;
  completed_at: string | null;
  assignee: string | null;
};

const ROOT_ID = "ROOT_NODE";
const LS_EXPANDED = "taskManager.expandedMap";
const LS_ROOT_LABEL = "taskManager.rootLabel";
const LS_SHOW_COMPLETED = "taskManager.showCompleted";
const LS_FONT = "taskManager.mapFont";
const LS_BG_COLOR = "taskManager.mapBgColor";
const LS_ACCENT_COLOR = "taskManager.mapAccentColor";

// ================= SETTINGS =================
const FONT_OPTIONS = [
  { label: "Patrick Hand",        value: "var(--font-patrick-hand)" },
  { label: "Caveat",              value: "var(--font-caveat)" },
  { label: "Kalam",               value: "var(--font-kalam)" },
  { label: "Indie Flower",        value: "var(--font-indie-flower)" },
  { label: "Architects Daughter", value: "var(--font-architects-daughter)" },
] as const;

const BG_COLORS = [
  { label: "Bianco",    value: "#ffffff" },
  { label: "Crema",     value: "#fdf6e3" },
  { label: "Sabbia",    value: "#f5f0e8" },
  { label: "Cielo",     value: "#eef2ff" },
  { label: "Menta",     value: "#eefaf3" },
  { label: "Pesca",     value: "#fff4ee" },
  { label: "Rosa",      value: "#fce4ec" },
  { label: "Giallo",    value: "#fffde7" },
] as const;

const ACCENT_COLORS = [
  { label: "Nero",      value: "#000000" },
  { label: "Navy",      value: "#1e3a5f" },
  { label: "Foresta",   value: "#1b4332" },
  { label: "Viola",     value: "#4a1560" },
  { label: "Mogano",    value: "#4e1a00" },
  { label: "Ardesia",   value: "#2d3748" },
] as const;

type ExpandedMap = Record<string, boolean>;

type RootNodeData = {
  label: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (label: string) => void;
  onCancel: () => void;
  fanCount: number;
  onAddRoot: () => void;
};

type TaskNodeData = {
  id: string;
  title: string;
  completed: boolean;
  dueAt: string | null;
  notes: string | null;

  descendantCount: number;
  isDueToday: boolean;
  isOverdue: boolean;

  isEditing: boolean;
  isTopLevel: boolean;
  isSelected: boolean;

  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;

  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;

  onStartEdit: (id: string) => void;
  onCommit: (id: string, title: string) => void;
  onCancel: () => void;
  onSelect: (id: string) => void;

  onSetDue: (id: string, dateISO: string | null) => void;
  onOpenNotes: (id: string) => void;
  onSetAssignee: (id: string, assignee: string | null) => void;
  assignee: string | null;
  nodeAccentColor: string;

  // nessun callback DnD: il drag è gestito nativamente da ReactFlow
};

const InvisibleHandleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  opacity: 0,
  border: "none",
  background: "transparent",
};

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso).setZone("Europe/Rome");
  if (!dt.isValid) return "";
  return dt.toISODate() ?? "";
}

function dateInputToDueISO(dateStr: string): string | null {
  const clean = dateStr.trim();
  if (!clean) return null;
  const dt = DateTime.fromISO(clean, { zone: "Europe/Rome" }).set({
    hour: 12,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}

function safeParseExpanded(raw: string | null): ExpandedMap {
  try {
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch {
    return {};
  }
}

function stripHtmlToOneLine(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ================= NOTES UI =================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NotesToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    ["rounded-lg border px-2 py-1 text-sm", active ? "border-gray-800 bg-gray-100" : "border-gray-300 bg-white"].join(" ");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-white p-2">
      <button className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} type="button">
        H
      </button>
      <button className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} type="button">
        •
      </button>
      <button className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} type="button">
        1.
      </button>
      <button className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} type="button">
        B
      </button>
      <button className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} type="button">
        I
      </button>
      <button className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()} type="button">
        S
      </button>
      <button className={btn(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()} type="button">
        —
      </button>
      <button className={btn(false)} onClick={() => editor.chain().focus().undo().run()} type="button">
        ↶
      </button>
      <button className={btn(false)} onClick={() => editor.chain().focus().redo().run()} type="button">
        ↷
      </button>
    </div>
  );
}

function NotesModal({
  open,
  title,
  initialContent,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initialContent: string;
  onClose: () => void;
  onSave: (content: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent || "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "prose max-w-none min-h-[360px] p-4 outline-none" } },
  });

  useEffect(() => {
    if (editor) editor.commands.setContent(initialContent || "");
  }, [initialContent, editor]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div className="font-semibold truncate">Note: {title}</div>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-gray-300 px-3 py-2 text-sm" type="button" onClick={onClose}>
              Chiudi
            </button>
            <button className="rounded-xl border border-gray-900 bg-gray-900 px-3 py-2 text-sm text-white" type="button" onClick={() => onSave(editor?.getHTML() ?? "")}>
              Salva
            </button>
          </div>
        </div>
        <NotesToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ================= NODES =================
const RootTextNode = memo(function RootTextNode({ data }: NodeProps<RootNodeData>) {
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(data.label), [data.label]);

  useEffect(() => {
    if (data.isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [data.isEditing]);

  const step = 12;
  const startTop = -((data.fanCount - 1) * step) / 2 + 28;

  return (
    <div
      className="relative select-none"
      title="Doppio clic per rinominare"
      onDoubleClick={(e) => {
        e.stopPropagation();
        data.onStartEdit();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, opacity: 0, border: "none", background: "transparent", left: -6, top: 30, position: "absolute" }} />
      {Array.from({ length: Math.max(1, data.fanCount) }).map((_, i) => (
        <Handle key={`out-${i}`} id={`out-${i}`} type="source" position={Position.Right} style={{ width: 8, height: 8, opacity: 0, border: "none", background: "transparent", position: "absolute", right: -6, top: startTop + i * step }} />
      ))}

      {data.isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") data.onCommit(draft);
            if (e.key === "Escape") data.onCancel();
          }}
          onBlur={() => data.onCommit(draft)}
          className="w-[260px] border-b border-gray-400 bg-transparent text-4xl font-semibold italic outline-none"
        />
      ) : (
        <div className="flex items-center gap-2">
          <div className="text-5xl font-semibold italic tracking-wide text-black">{data.label}</div>
          <button
            type="button"
            className="nodrag nopan rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-800"
            title="Aggiungi task principale"
            style={{ pointerEvents: "all" }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); data.onAddRoot(); }}
          >
            ＋
          </button>
        </div>
      )}
    </div>
  );
});

const TaskNode = memo(function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const [draft, setDraft] = useState(data.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dueDraft, setDueDraft] = useState<string>(isoToDateInput(data.dueAt));

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(data.title), [data.title]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDueDraft(isoToDateInput(data.dueAt)), [data.dueAt]);

  useEffect(() => {
    if (data.isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [data.isEditing]);

  const wrapperClass = data.isTopLevel
    ? ["relative min-w-[240px] max-w-[460px] rounded-2xl px-4 py-3 text-white shadow-sm", data.completed ? "opacity-60" : ""].join(" ")
    : ["relative min-w-[260px] max-w-[460px] rounded-xl border bg-white px-3 py-2 shadow-sm", data.completed ? "opacity-60" : "", data.isOverdue ? "border-red-300" : data.isDueToday ? "border-amber-300" : "border-gray-300"].join(" ");

  const dueLabel = useMemo(() => {
    if (!data.dueAt) return null;
    const dt = DateTime.fromISO(data.dueAt).setZone("Europe/Rome").setLocale("it");
    return dt.toFormat("LLL/dd");
  }, [data.dueAt]);

  const badgeClass = data.isOverdue ? "border-red-300 bg-red-50 text-red-700" : data.isDueToday ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-700";

  const notesPreview = stripHtmlToOneLine(data.notes);
  const notesHasContent = !!notesPreview;

  return (
    <div
      className={wrapperClass}
      style={data.isTopLevel ? { backgroundColor: data.nodeAccentColor } : undefined}
      title="Doppio clic per rinominare"
      onDoubleClick={(e) => {
        e.stopPropagation();
        data.onSelect(data.id);
        data.onStartEdit(data.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        data.onSelect(data.id);
      }}
    >
      {data.hasChildren ? (
        <button
          type="button"
          className={["nodrag nopan absolute top-1/2 -right-10 -translate-y-1/2", "h-8 w-8 rounded-full border bg-white shadow-sm", "flex items-center justify-center text-xl leading-none", "text-gray-900 border-gray-300"].join(" ")}
          title={data.isExpanded ? "Comprimi" : "Espandi"}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleExpand(data.id);
          }}
        >
          {data.isExpanded ? "−" : "+"}
        </button>
      ) : null}

      <Handle type="source" position={Position.Right} style={InvisibleHandleStyle} />
      <Handle type="target" position={Position.Left} style={InvisibleHandleStyle} />

      <div className="flex items-start gap-2">
        {/* Grip handle — drag-handle per ReactFlow nativo */}
        <div
          className={["drag-handle mt-1 cursor-grab select-none text-base leading-none active:cursor-grabbing", data.isTopLevel ? "text-white/30 hover:text-white/60" : "text-gray-300 hover:text-gray-500"].join(" ")}
          title="Trascina per riordinare tra i fratelli"
        >
          ⠿
        </div>

        <button
          type="button"
          className="nodrag mt-0.5 select-none text-lg leading-none"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle(data.id);
          }}
          title="Completa / riapri (con sotto-task)"
        >
          {data.completed ? "☑" : "☐"}
        </button>

        <div className="nodrag min-w-0 flex-1">
          {/* Riga titolo + badge scadenza */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {data.isEditing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") data.onCommit(data.id, draft);
                    if (e.key === "Escape") data.onCancel();
                  }}
                  onBlur={() => data.onCommit(data.id, draft)}
                  className={data.isTopLevel ? "w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white outline-none" : "w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"}
                />
              ) : (
                <div className="min-w-0">
                  <div className="truncate font-semibold">{data.title}</div>
                  {notesHasContent ? <div className={data.isTopLevel ? "mt-0.5 truncate text-xs text-white/70" : "mt-0.5 truncate text-xs text-gray-500"}>{notesPreview}</div> : null}
                </div>
              )}
            </div>
            {!data.isTopLevel && dueLabel ? <span className={["shrink-0 rounded-lg border px-2 py-0.5 text-xs", badgeClass].join(" ")}>{dueLabel}</span> : null}
          </div>

          {/* Azioni — visibili solo quando il nodo è selezionato */}
          {data.isSelected && (
            <>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className={data.isTopLevel ? "shrink-0 rounded-lg border border-white/25 bg-white/10 px-2 py-0.5 text-xs text-white" : "shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-800"}
                  title={notesHasContent ? "Apri note (già presenti)" : "Apri note"}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onOpenNotes(data.id);
                  }}
                >
                  {notesHasContent ? "📝" : "✎"}
                </button>

                <button
                  type="button"
                  className={data.isTopLevel ? "shrink-0 rounded-lg border border-white/25 bg-white/10 px-2 py-0.5 text-xs text-white" : "shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-800"}
                  title="Aggiungi sotto-task"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onAddChild(data.id);
                  }}
                >
                  ＋
                </button>

                <button
                  type="button"
                  className={
                    data.assignee === "chiara"
                      ? "shrink-0 rounded-lg border border-purple-400 bg-purple-50 px-2 py-0.5 text-xs text-purple-700"
                      : data.isTopLevel
                      ? "shrink-0 rounded-lg border border-white/25 bg-white/10 px-2 py-0.5 text-xs text-white/50"
                      : "shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400"
                  }
                  title={data.assignee === "chiara" ? "Assegnato a Chiara — clicca per rimuovere" : "Assegna a Chiara"}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onSetAssignee(data.id, data.assignee === "chiara" ? null : "chiara");
                  }}
                >
                  {data.assignee === "chiara" ? "👤 Chiara" : "👤"}
                </button>

                <button
                  type="button"
                  className={data.isTopLevel ? "shrink-0 rounded-lg border border-white/25 bg-white/10 px-2 py-0.5 text-xs text-white" : "shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-800"}
                  title="Elimina (con sotto-task)"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDelete(data.id);
                  }}
                >
                  🗑
                </button>
              </div>

              <div className={data.isTopLevel ? "mt-2 flex items-center gap-2 text-xs text-white/80" : "mt-2 flex items-center gap-2 text-xs text-gray-600"}>
                <span className={data.isTopLevel ? "text-white/70" : "text-gray-500"}>Scadenza</span>

                <input
                  type="date"
                  value={dueDraft}
                  onChange={(e) => setDueDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={data.isTopLevel ? "rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs text-white outline-none" : "rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs outline-none"}
                />

                <button
                  type="button"
                  className={data.isTopLevel ? "rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs text-white" : "rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onSetDue(data.id, dateInputToDueISO(dueDraft));
                  }}
                >
                  Salva
                </button>

                <button
                  type="button"
                  className={data.isTopLevel ? "rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs text-white/90" : "rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDueDraft("");
                    data.onSetDue(data.id, null);
                  }}
                >
                  Rimuovi
                </button>
              </div>

              <div className={data.isTopLevel ? "mt-1 flex items-center gap-2 text-xs text-white/70" : "mt-1 flex items-center gap-2 text-xs text-gray-500"}>
                {data.descendantCount > 0 ? <span>≡ {data.descendantCount}</span> : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

// Chiama fitView una volta sola, dopo che i task sono stati caricati e i nodi misurati;
// oppure ogni volta che fitViewTrigger viene incrementato (es. dopo l'aggiunta di un task).
function FitViewOnLoad({ nodeCount, fitViewTrigger }: { nodeCount: number; fitViewTrigger: number }) {
  const { fitView } = useReactFlow();
  const fitted = useRef(false);
  useEffect(() => {
    if (nodeCount > 1 && !fitted.current) {
      fitted.current = true;
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    }
  }, [nodeCount, fitView]);
  useEffect(() => {
    if (fitViewTrigger > 0) {
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
    }
  }, [fitViewTrigger, fitView]);
  return null;
}

function NodeSyncer({ nodes }: { nodes: Node[] }) {
  const { setNodes } = useReactFlow();
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);
  return null;
}

export default function MapPage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rootEditing, setRootEditing] = useState(false);
  const [rootLabel, setRootLabel] = useState("OGGI");

  const [expanded, setExpanded] = useState<ExpandedMap>({ [ROOT_ID]: true });
  const [showCompleted, setShowCompleted] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapFont, setMapFont] = useState("var(--font-patrick-hand)");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [nodeAccentColor, setNodeAccentColor] = useState("#000000");

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesTaskId, setNotesTaskId] = useState<string | null>(null);

  // posizioni libere salvate dall'utente con il drag
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});

  // incrementato per forzare fitView dopo l'aggiunta di un task
  const [fitViewTrigger, setFitViewTrigger] = useState(0);

  // Ref stabile per addRootTask: evita stale closure nei nodi ReactFlow (uncontrolled mode)
  const addRootTaskRef = useRef<() => Promise<void>>(() => Promise.resolve());



  // ---- auth guard ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setUserId(data.session.user.id);
      setSessionChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.href = "/login";
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedLabel = window.localStorage.getItem(LS_ROOT_LABEL);
    if (savedLabel && savedLabel.trim()) setRootLabel(savedLabel.trim());

    const savedExpanded = safeParseExpanded(window.localStorage.getItem(LS_EXPANDED));
    if (savedExpanded[ROOT_ID] === undefined) savedExpanded[ROOT_ID] = true;
    setExpanded(savedExpanded);

    const sc = window.localStorage.getItem(LS_SHOW_COMPLETED);
    setShowCompleted(sc === "true");

    const savedFont = window.localStorage.getItem(LS_FONT);
    if (savedFont) setMapFont(savedFont);
    const savedBg = window.localStorage.getItem(LS_BG_COLOR);
    if (savedBg) setBgColor(savedBg);
    const savedAccent = window.localStorage.getItem(LS_ACCENT_COLOR);
    if (savedAccent) setNodeAccentColor(savedAccent);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    window.localStorage.setItem(LS_EXPANDED, JSON.stringify(expanded));
  }, [expanded]);

  useEffect(() => {
    window.localStorage.setItem(LS_SHOW_COMPLETED, showCompleted ? "true" : "false");
  }, [showCompleted]);

  useEffect(() => {
    window.localStorage.setItem(LS_FONT, mapFont);
    document.documentElement.style.setProperty("--map-font", mapFont);
  }, [mapFont]);

  useEffect(() => {
    window.localStorage.setItem(LS_BG_COLOR, bgColor);
  }, [bgColor]);

  useEffect(() => {
    window.localStorage.setItem(LS_ACCENT_COLOR, nodeAccentColor);
  }, [nodeAccentColor]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const cur = prev[id] ?? true;
      return { ...prev, [id]: !cur };
    });
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,parent_id,completed,due_at,sort_order,notes,owner_id,completed_at,assignee")
      .order("sort_order", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }
    setTasks((data as Task[]) ?? []);
  };

  useEffect(() => {
    if (!sessionChecked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [sessionChecked]);

  const setDue = async (id: string, dueISO: string | null) => {
    setError(null);
    const { error } = await supabase.from("tasks").update({ due_at: dueISO }).eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_at: dueISO } : t)));
  };

  const setAssignee = async (id: string, assignee: string | null) => {
    setError(null);
    const { error } = await supabase.from("tasks").update({ assignee }).eq("id", id);
    if (error) { setError(error.message); return; }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, assignee } : t)));
  };

  const saveNotes = async (id: string, notesHtml: string) => {
    setError(null);
    const { error } = await supabase.from("tasks").update({ notes: notesHtml }).eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, notes: notesHtml } : t)));
  };

  const addRootTask = useCallback(async () => {
    setError(null);

    const roots = tasks.filter((t) => !t.parent_id);
    const nextSort = roots.length ? Math.max(...roots.map((r) => r.sort_order ?? 0)) + 1 : 0;

    const { data, error } = await supabase
      .from("tasks")
      .insert({ title: "Nuovo task", parent_id: null, completed: false, sort_order: nextSort, notes: "", owner_id: userId })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      return;
    }

    await load();
    if (data?.id) setEditingId(data.id);
    setFitViewTrigger((n) => n + 1);
  }, [tasks, userId]);

  // Aggiorna il ref dopo ogni render (useLayoutEffect = prima del paint, dopo DOM update)
  useLayoutEffect(() => { addRootTaskRef.current = addRootTask; });
  const stableAddRootTask = useCallback(() => { addRootTaskRef.current(); }, []);

  const addChild = async (parentId: string) => {
    setError(null);
    setExpanded((prev) => ({ ...prev, [parentId]: true }));

    const siblings = tasks.filter((t) => t.parent_id === parentId);
    const nextSort = siblings.length ? Math.max(...siblings.map((s) => s.sort_order ?? 0)) + 1 : 0;

    const { data, error } = await supabase
      .from("tasks")
      .insert({ title: "Nuovo sotto-task", parent_id: parentId, completed: false, sort_order: nextSort, notes: "", owner_id: userId })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    await load();
    if (data?.id) setEditingId(data.id);
    setFitViewTrigger((n) => n + 1);
  };

  const toggleCompletedCascade = async (id: string) => {
    const root = tasks.find((t) => t.id === id);
    if (!root) return;

    const nextCompleted = !root.completed;

    const childrenByParent = new Map<string | null, string[]>();
    for (const t of tasks) {
      const key = t.parent_id ?? null;
      const arr = childrenByParent.get(key) ?? [];
      arr.push(t.id);
      childrenByParent.set(key, arr);
    }

    const toUpdate: string[] = [];
    const stack = [id];
    const seen = new Set<string>();

    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      toUpdate.push(cur);

      const children = childrenByParent.get(cur) ?? [];
      for (const c of children) stack.push(c);
    }

    setError(null);
    const completedAt = nextCompleted ? new Date().toISOString() : null;
    const { error } = await supabase.from("tasks").update({ completed: nextCompleted, completed_at: completedAt }).in("id", toUpdate);
    if (error) {
      setError(error.message);
      return;
    }

    setTasks((prev) => prev.map((t) => (toUpdate.includes(t.id) ? { ...t, completed: nextCompleted } : t)));
  };

  const deleteTask = async (id: string) => {
    const t = tasks.find((x) => x.id === id);
    const label = t?.title ?? "questo task";
    const ok = window.confirm(`Eliminare “${label}” e tutti i suoi sotto-task?`);
    if (!ok) return;

    setError(null);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }

    if (editingId === id) setEditingId(null);

    setExpanded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    await load();
  };

  const commitRoot = (label: string) => {
    const clean = label.trim() || "OGGI";
    setRootEditing(false);
    setRootLabel(clean);
    window.localStorage.setItem(LS_ROOT_LABEL, clean);
  };

  const commitTaskTitle = async (id: string, title: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;

    const clean = title.trim();
    const finalTitle = clean.length ? clean : t.title;

    setEditingId(null);
    if (finalTitle === t.title) return;

    const { error } = await supabase.from("tasks").update({ title: finalTitle }).eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setTasks((prev) => prev.map((p) => (p.id === id ? { ...p, title: finalTitle } : p)));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRootEditing(false);
    setSelectedNodeId(null);
    setSettingsOpen(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const visibleTasks = useMemo(() => {
    return showCompleted ? tasks : tasks.filter((t) => !t.completed);
  }, [tasks, showCompleted]);

  const notesTask = useMemo(() => {
    if (!notesTaskId) return null;
    return tasks.find((t) => t.id === notesTaskId) ?? null;
  }, [tasks, notesTaskId]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const { nodes, edges } = useMemo(() => {
    const tasksById = new Map(visibleTasks.map((t) => [t.id, t] as const));

    const childrenByParent = new Map<string | null, Task[]>();
    for (const t of visibleTasks) {
      const key = t.parent_id ?? null;
      const arr = childrenByParent.get(key) ?? [];
      arr.push(t);
      childrenByParent.set(key, arr);
    }
    for (const [k, arr] of childrenByParent) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      childrenByParent.set(k, arr);
    }

    const childrenOf = (id: string) => childrenByParent.get(id) ?? [];
    const hasChildren = (id: string) => childrenOf(id).length > 0;
    const isExpandedLocal = (id: string) => expanded[id] ?? true;

    // subtree size
    const leafMemo = new Map<string, number>();
    const leafCount = (id: string): number => {
      if (leafMemo.has(id)) return leafMemo.get(id)!;
      if (!isExpandedLocal(id)) return 1;
      const kids = childrenOf(id);
      if (kids.length === 0) return 1;
      const sum = kids.reduce((acc, k) => acc + leafCount(k.id), 0);
      const v = Math.max(1, sum);
      leafMemo.set(id, v);
      return v;
    };

    const yUnits = new Map<string, number>();
    const assign = (id: string, top: number) => {
      const span = leafCount(id);
      const mid = top + span / 2;
      yUnits.set(id, mid);

      if (!isExpandedLocal(id)) return;
      const kids = childrenOf(id);
      if (kids.length === 0) return;

      let cursor = top;
      for (const k of kids) {
        const kSpan = leafCount(k.id);
        assign(k.id, cursor);
        cursor += kSpan;
      }
    };

    const idSet = new Set(Array.from(tasksById.keys()));
    const roots = (childrenByParent.get(null) ?? []).slice();
    const orphans = visibleTasks.filter((t) => t.parent_id && !idSet.has(t.parent_id));

    let cursor = 0;
    const rootOrder = [...roots, ...orphans];
    for (const r of rootOrder) {
      const span = leafCount(r.id);
      assign(r.id, cursor);
      cursor += span;
    }

    const allY = Array.from(yUnits.values());
    const center = allY.length ? (Math.min(...allY) + Math.max(...allY)) / 2 : 0;
    for (const [k, v] of yUnits.entries()) yUnits.set(k, v - center);

    // descendants count
    const descMemo = new Map<string, number>();
    const countDesc = (id: string): number => {
      if (descMemo.has(id)) return descMemo.get(id)!;
      const kids = childrenOf(id);
      const total = kids.reduce((sum, c) => sum + 1 + countDesc(c.id), 0);
      descMemo.set(id, total);
      return total;
    };

    const xGap = 440;
    const yGap = 110;

    const fanCount = Math.max(1, roots.length);
    const todayRome = DateTime.now().setZone("Europe/Rome").toISODate();

    const taskNodes: Node<TaskNodeData>[] = visibleTasks
      .filter((t) => yUnits.has(t.id))
      .map((t) => {
        // depth (x)
        let depth = 1;
        let cur = t;
        const seen = new Set<string>();
        while (cur.parent_id && tasksById.has(cur.parent_id) && !seen.has(cur.parent_id)) {
          seen.add(cur.parent_id);
          depth += 1;
          cur = tasksById.get(cur.parent_id)!;
        }

        const dueRome = t.due_at ? DateTime.fromISO(t.due_at).setZone("Europe/Rome") : null;
        const dueDateRome = dueRome ? dueRome.toISODate() : null;

        const isDueToday = !!dueDateRome && dueDateRome === todayRome;
        const isOverdue = !!dueRome && !t.completed && dueRome < DateTime.now().setZone("Europe/Rome").startOf("day");

        const isTopLevel = !t.parent_id || !tasksById.has(t.parent_id);

        return {
          id: t.id,
          type: "taskNode",
          dragHandle: ".drag-handle",
          position: manualPositions[t.id] ?? { x: depth * xGap, y: (yUnits.get(t.id) ?? 0) * yGap },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            id: t.id,
            title: t.title,
            completed: t.completed,
            dueAt: t.due_at,
            notes: t.notes,
            descendantCount: countDesc(t.id),
            isDueToday,
            isOverdue,
            isEditing: editingId === t.id,
            isTopLevel,
            isSelected: selectedNodeId === t.id,
            hasChildren: hasChildren(t.id),
            isExpanded: isExpandedLocal(t.id),
            onToggleExpand: toggleExpand,
            onToggle: toggleCompletedCascade,
            onAddChild: addChild,
            onDelete: deleteTask,
            onStartEdit: (id) => setEditingId(id),
            onCommit: commitTaskTitle,
            onCancel: cancelEdit,
            onSelect: (id) => setSelectedNodeId(id),
            nodeAccentColor,
            onSetDue: setDue,
            onOpenNotes: (id) => {
              setNotesTaskId(id);
              setNotesOpen(true);
            },
            onSetAssignee: setAssignee,
            assignee: t.assignee,
            // nessun callback drag: gestito da onNodeDragStop su ReactFlow
          },
        };
      });

    const rootNode: Node<RootNodeData> = {
      id: ROOT_ID,
      type: "rootText",
      position: { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      selectable: false,
      style: { pointerEvents: "all" },
      data: {
        label: rootLabel,
        isEditing: rootEditing,
        onStartEdit: () => setRootEditing(true),
        onCommit: commitRoot,
        onCancel: cancelEdit,
        fanCount,
        onAddRoot: stableAddRootTask,
      },
    };

    const nodes: Node[] = [rootNode, ...taskNodes];

    const visibleIds = new Set<string>([ROOT_ID, ...taskNodes.map((n) => n.id)]);

    const makeEdge = (source: string, target: string, isRootEdge: boolean, sourceHandle?: string): Edge => ({
      id: `e-${source}-${target}`,
      source,
      target,
      sourceHandle,
      type: "default",
      style: { stroke: "#000000", strokeWidth: isRootEdge ? 4 : 3, strokeOpacity: 1, strokeLinecap: "round" },
    });

    const edges: Edge[] = visibleTasks
      .map((t) => {
        const parentOk = t.parent_id && tasksById.has(t.parent_id) ? t.parent_id : null;
        if (!parentOk) {
          const idx = roots.findIndex((r) => r.id === t.id);
          const handleId = `out-${Math.max(0, idx)}`;
          return makeEdge(ROOT_ID, t.id, true, handleId);
        }
        return makeEdge(parentOk, t.id, false);
      })
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

    return { nodes, edges };
  }, [visibleTasks, tasks, editingId, selectedNodeId, nodeAccentColor, rootLabel, rootEditing, expanded, manualPositions]);

  // ---- drag-to-reorder via ReactFlow nativo ----
  // Quando l'utente trascina un nodo (dal grip ⠿), onNodeDragStop riceve
  // le posizioni aggiornate di TUTTI i nodi dopo il drop.
  // Usiamo la posizione Y per determinare il nuovo ordinamento tra i fratelli.
  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, draggedNode: Node, allCurrentNodes: Node[]) => {
      const draggedTask = tasks.find((t) => t.id === draggedNode.id);
      if (!draggedTask) return;

      // fratelli ordinati per sort_order attuale
      const siblings = tasks
        .filter((t) => t.parent_id === draggedTask.parent_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      if (siblings.length <= 1) {
        // figlio unico o nodo radice: salva solo la posizione libera
        setManualPositions((prev) => ({ ...prev, [draggedNode.id]: draggedNode.position }));
        return;
      }

      // ordinamento per posizione Y dopo il drag
      const siblingsByY = siblings
        .map((s) => {
          const rfNode = allCurrentNodes.find((n) => n.id === s.id);
          return { task: s, y: rfNode?.position.y ?? 0 };
        })
        .sort((a, b) => a.y - b.y);

      const oldIds = siblings.map((s) => s.id).join(",");
      const newIds = siblingsByY.map((s) => s.task.id).join(",");

      if (oldIds === newIds) {
        // nessun riordinamento: salva la posizione libera del nodo trascinato
        setManualPositions((prev) => ({ ...prev, [draggedNode.id]: draggedNode.position }));
        return;
      }

      // riordinamento rilevato: cancella le posizioni manuali dei fratelli
      // così dopo il reload il layout automatico si ricalcola correttamente
      setManualPositions((prev) => {
        const next = { ...prev };
        siblings.forEach((s) => delete next[s.id]);
        return next;
      });

      setError(null);
      const results = await Promise.all(
        siblingsByY.map(({ task }, i) =>
          supabase.from("tasks").update({ sort_order: i }).eq("id", task.id),
        ),
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) { setError(firstError.message); return; }

      await load();
    },
    [tasks],
  );


  if (!sessionChecked) {
    return <main className="min-h-screen bg-white p-6 text-sm text-gray-600">Caricamento…</main>;
  }

  return (
    <main className="h-screen w-screen">
      <style>{`
        .react-flow__edge-path { stroke: #000 !important; stroke-opacity: 1 !important; stroke-linecap: round !important; stroke-width: 3 !important; }
        .ProseMirror p { margin: 0 0 10px 0; }
        .ProseMirror ul { margin: 0 0 10px 18px; }
        .ProseMirror ol { margin: 0 0 10px 18px; }
      `}</style>

      <div style={{ width: "100%", height: "100%", backgroundColor: bgColor }}>
        <ReactFlow
          defaultNodes={[]}
          edges={edges}
          nodeTypes={{ taskNode: TaskNode, rootText: RootTextNode }}
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          nodesDraggable={true}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          onPaneClick={cancelEdit}
          onNodeDragStop={onNodeDragStop}
        >
          <Controls />
          <FitViewOnLoad nodeCount={nodes.length} fitViewTrigger={fitViewTrigger} />
          <NodeSyncer nodes={nodes} />
          <Panel position="top-right">
            <div className="flex flex-col items-end gap-2">
              {/* Barra controlli */}
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-3 py-2 shadow-sm text-sm backdrop-blur-sm">
                <label className="flex cursor-pointer items-center gap-1.5 text-gray-600">
                  <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
                  Completati
                </label>
                <div className="h-4 w-px bg-gray-200" />
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  className={settingsOpen ? "text-gray-900" : "text-gray-400 hover:text-gray-700"}
                  title="Personalizza"
                >
                  🎨
                </button>
                <div className="h-4 w-px bg-gray-200" />
                <button onClick={logout} className="text-gray-500 hover:text-gray-800">
                  Logout
                </button>
              </div>

              {/* Pannello settings */}
              {settingsOpen && (
                <div
                  className="w-72 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Font */}
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Font</div>
                  <div className="mb-4 flex flex-col gap-1">
                    {FONT_OPTIONS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        style={{ fontFamily: `${f.value}, cursive`, fontSize: 15 }}
                        className={[
                          "rounded-lg px-3 py-1.5 text-left transition-colors",
                          mapFont === f.value
                            ? "border border-gray-400 bg-gray-100"
                            : "border border-transparent hover:bg-gray-50",
                        ].join(" ")}
                        onClick={() => setMapFont(f.value)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Sfondo */}
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Sfondo</div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {BG_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        className={[
                          "h-7 w-7 rounded-full border-2 transition-transform",
                          bgColor === c.value ? "border-gray-500 scale-110" : "border-gray-200 hover:border-gray-400",
                        ].join(" ")}
                        style={{ backgroundColor: c.value }}
                        onClick={() => setBgColor(c.value)}
                      />
                    ))}
                  </div>

                  {/* Colore nodi */}
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Colore nodi</div>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        className={[
                          "h-7 w-7 rounded-full border-2 transition-transform",
                          nodeAccentColor === c.value ? "border-gray-400 scale-110" : "border-gray-200 hover:border-gray-400",
                        ].join(" ")}
                        style={{ backgroundColor: c.value }}
                        onClick={() => setNodeAccentColor(c.value)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>
          {error && (
            <Panel position="top-left">
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Errore: {error}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      <NotesModal
        open={notesOpen && !!notesTask}
        title={notesTask?.title ?? ""}
        initialContent={notesTask?.notes ?? ""}
        onClose={() => setNotesOpen(false)}
        onSave={async (content) => {
          if (!notesTask) return;
          await saveNotes(notesTask.id, content);
          setNotesOpen(false);
        }}
      />
    </main>
  );
}