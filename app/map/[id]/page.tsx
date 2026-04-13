"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, { Controls, Handle, Position, useReactFlow, Panel } from "reactflow";
import type { Node, Edge, NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { DateTime } from "luxon";
import { supabase } from "../../../lib/supabaseClient";

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
const LS_LAST_OPEN_DATE = "taskManager.lastOpenDate";
const LS_ROOT_LABEL = "taskManager.rootLabel";
const LS_SHOW_COMPLETED = "taskManager.showCompleted";
const LS_FONT = "taskManager.mapFont";
const LS_BG_COLOR = "taskManager.mapBgColor";
const LS_ACCENT_COLOR = "taskManager.mapAccentColor";
const LS_CHILD_COLOR = "taskManager.mapChildColor";
const LS_ROOT_TEXT_COLOR = "taskManager.mapRootTextColor";
const LS_NODE_SHADOW = "taskManager.mapNodeShadow";

const SHADOW_PRESETS = [
  "none",
  "0 1px 4px rgba(0,0,0,0.10)",
  "0 4px 10px rgba(0,0,0,0.15)",
  "0 8px 20px rgba(0,0,0,0.22)",
  "0 16px 36px rgba(0,0,0,0.28)",
] as const;

// ================= EMAIL SETTINGS =================
type EmailConfig = { enabled: boolean; subject: string; intro_text: string; outro_text: string; whatsapp_text: string };

const EMAIL_TYPE_META = [
  { type: "weekly_summary",   label: "Riepilogo settimanale", schedule: "Lunedì ore 06:00",     defaultSubject: "📅 Riepilogo settimanale",    defaultIntro: "Ecco i task in scadenza questa settimana." },
  { type: "due_alerts",       label: "Scadenze del giorno",   schedule: "Ogni giorno ore 06:30", defaultSubject: "⏰ Scadenze di oggi",           defaultIntro: "Hai questi task in scadenza oggi." },
  { type: "casa_summary",     label: "Riepilogo casa",        schedule: "Domenica ore 21:30",    defaultSubject: "🏠 Task casa completati",       defaultIntro: "Questa settimana Tiziano si è dato da fare per la casa — ha completato {count} task. Ogni piccola cosa conta! 🏠" },
  { type: "chiara_completed", label: "Completati da Chiara",  schedule: "Mercoledì ore 07:00",   defaultSubject: "✅ Task completati da Chiara",  defaultIntro: "Negli ultimi giorni hai fatto un lavoro fantastico — hai completato {count} task e ogni cosa che hai fatto fa la differenza. Grazie per l'energia e la dedizione che metti in tutto quello che fai! 💪" },
] as const;

// ================= SETTINGS =================
const FONT_OPTIONS = [
  { label: "Patrick Hand",        value: "var(--font-patrick-hand)" },
  { label: "Caveat",              value: "var(--font-caveat)" },
  { label: "Kalam",               value: "var(--font-kalam)" },
  { label: "Indie Flower",        value: "var(--font-indie-flower)" },
  { label: "Architects Daughter", value: "var(--font-architects-daughter)" },
  { label: "Permanent Marker",    value: "var(--font-permanent-marker)" },
  { label: "Shadows Into Light",  value: "var(--font-shadows-into-light)" },
  { label: "Gloria Hallelujah",   value: "var(--font-gloria-hallelujah)" },
  { label: "Dancing Script",      value: "var(--font-dancing-script)" },
  { label: "Amatic SC",           value: "var(--font-amatic-sc)" },
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

const CHILD_COLORS = [
  { label: "Bianco",    value: "#ffffff" },
  { label: "Grigio",    value: "#f5f5f5" },
  { label: "Giallo",    value: "#fffde7" },
  { label: "Cielo",     value: "#e8f4f8" },
  { label: "Menta",     value: "#e8f5e9" },
  { label: "Lavanda",   value: "#f3e5f5" },
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
  isDropTarget: boolean;
  rootTextColor: string;
  nodeShadow: string;
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
  showAssignee: boolean;
  nodeAccentColor: string;
  nodeChildColor: string;
  nodeShadow: string;
  isDropTarget: boolean;

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
      className={["relative select-none px-2 py-1 transition-all", data.isDropTarget ? "ring-2 ring-blue-400 ring-offset-2 bg-blue-50/30" : ""].join(" ")}
      style={{ borderRadius: "0 14px 14px 14px", boxShadow: data.nodeShadow }}
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
          <div className="text-5xl font-semibold italic tracking-wide" style={{ color: data.rootTextColor }}>{data.label}</div>
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

  const nodeRadius = "0 14px 14px 14px";
  const wrapperClass = data.isTopLevel
    ? ["relative min-w-[240px] max-w-[460px] px-4 py-3 text-white shadow-sm transition-all", data.completed ? "opacity-60" : "", data.isDropTarget ? "ring-2 ring-blue-400 ring-offset-2" : ""].join(" ")
    : ["relative min-w-[260px] max-w-[460px] border px-3 py-2 shadow-sm transition-all", data.completed ? "opacity-60" : "", data.isDropTarget ? "ring-2 ring-blue-400 ring-offset-1 border-blue-400" : data.isOverdue ? "border-red-400" : data.isDueToday ? "border-amber-300" : "border-gray-300"].join(" ");

  const dueLabel = useMemo(() => {
    if (!data.dueAt) return null;
    const dt = DateTime.fromISO(data.dueAt).setZone("Europe/Rome").setLocale("it");
    return dt.toFormat("LLL/dd");
  }, [data.dueAt]);

  const badgeClass = data.isOverdue ? "border-red-600 bg-red-600 text-white font-semibold" : data.isDueToday ? "border-red-600 bg-red-600 text-white font-semibold" : "border-gray-200 bg-gray-50 text-gray-700";

  const notesPreview = stripHtmlToOneLine(data.notes);
  const notesHasContent = !!notesPreview;

  return (
    <div
      className={wrapperClass}
      style={{ backgroundColor: data.isTopLevel ? data.nodeAccentColor : data.nodeChildColor, borderRadius: nodeRadius, boxShadow: data.nodeShadow }}
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

                {data.showAssignee && (
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
                )}

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

// Espone getNodes() all'esterno di ReactFlow tramite un ref stabile
function RFNodesTracker({ getNodesRef }: { getNodesRef: React.MutableRefObject<(() => Node[]) | null> }) {
  const { getNodes } = useReactFlow();
  getNodesRef.current = getNodes; // aggiornato ad ogni render, sempre fresco
  return null;
}

// Restituisce l'id del nodo sotto il centro del nodo trascinato, se esiste
function findDropTarget(draggedNode: Node, allNodes: Node[]): string | null {
  const cx = draggedNode.position.x + (draggedNode.width ?? 120) / 2;
  const cy = draggedNode.position.y + (draggedNode.height ?? 40) / 2;
  for (const n of allNodes) {
    if (n.id === draggedNode.id) continue;
    const w = n.width ?? 120;
    const h = n.height ?? 40;
    if (cx >= n.position.x && cx <= n.position.x + w && cy >= n.position.y && cy <= n.position.y + h) {
      return n.id;
    }
  }
  return null;
}

// Verifica se targetId è un discendente di ancestorId
function isDescendantOf(tasks: Task[], ancestorId: string, targetId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let cur = byId.get(targetId);
  const seen = new Set<string>();
  while (cur?.parent_id) {
    if (seen.has(cur.parent_id)) break;
    seen.add(cur.parent_id);
    if (cur.parent_id === ancestorId) return true;
    cur = byId.get(cur.parent_id);
  }
  return false;
}

// ================= EMAIL VIEW (preview + editing) =================

function buildPathText(taskId: string, allTasks: Task[]): string {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const path: string[] = [];
  let cur = byId.get(taskId);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    path.unshift(cur.title);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path.join(" → ");
}

function getDescendants(allTasks: Task[], parentId: string): Task[] {
  const children = allTasks.filter((t) => t.parent_id === parentId);
  const result: Task[] = [];
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(allTasks, child.id));
  }
  return result;
}

function EmailView({
  tasks,
  emailConfigs,
  setEmailConfigs,
  mapId,
  allowedEmailTypes,
  setAllowedEmailTypes,
}: {
  tasks: Task[];
  emailConfigs: Record<string, EmailConfig>;
  setEmailConfigs: React.Dispatch<React.SetStateAction<Record<string, EmailConfig>>>;
  mapId: number;
  allowedEmailTypes: string[];
  setAllowedEmailTypes: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const now = DateTime.now().setZone("Europe/Rome").setLocale("it");
  const startOfToday = now.startOf("day").toISO()!;
  const endOfToday = now.endOf("day").toISO()!;
  const endOfWeek = now.endOf("week").toISO()!;
  const startOfWeek = now.startOf("week").toISO()!;
  const sevenDaysAgo = now.minus({ days: 7 }).toISO()!;

  const [savedTypes, setSavedTypes] = useState<Set<string>>(new Set());

  const isChiara = (t: Task) => t.assignee === "chiara";
  const isTiziano = (t: Task) => !isChiara(t);

  const formatDate = (iso: string) =>
    DateTime.fromISO(iso).setZone("Europe/Rome").setLocale("it").toFormat("EEE d MMM");

  // Task data per tipo
  const dueThisWeek = tasks.filter(
    (t) => !t.completed && t.due_at && t.due_at >= startOfToday && t.due_at <= endOfWeek,
  );
  const overdue = tasks.filter((t) => !t.completed && t.due_at && t.due_at < startOfToday);
  const weeklyWouldSend = dueThisWeek.length > 0 || overdue.length > 0;

  const casaNode = tasks.find((t) => !t.parent_id && t.title === "CASA");
  const casaDesc = casaNode ? getDescendants(tasks, casaNode.id) : [];
  const casaCompleted = casaDesc.filter(
    (t) => t.completed && t.assignee !== "chiara" && t.completed_at && t.completed_at >= startOfWeek,
  );
  const casaWouldSend = casaCompleted.length > 0;

  const dueToday = tasks.filter(
    (t) => !t.completed && t.due_at && t.due_at >= startOfToday && t.due_at <= endOfToday,
  );
  const dueTodayWouldSend = dueToday.length > 0;

  const chiaraCompleted = tasks.filter(
    (t) => t.assignee === "chiara" && t.completed_at && t.completed_at >= sevenDaysAgo,
  );
  const chiaraWouldSend = chiaraCompleted.length > 0;

  const updateCfg = (type: string, partial: Partial<EmailConfig>) => {
    setEmailConfigs((prev) => ({
      ...prev,
      [type]: { ...(prev[type] ?? { enabled: false, subject: "", intro_text: "" }), ...partial },
    }));
  };

  const saveCfg = async (type: string) => {
    const cfg = emailConfigs[type] ?? { enabled: false, subject: "", intro_text: "", outro_text: "", whatsapp_text: "" };
    await supabase.from("email_configs").upsert(
      { map_id: mapId, type, enabled: cfg.enabled, subject: cfg.subject || null, intro_text: cfg.intro_text || null, outro_text: cfg.outro_text || null, whatsapp_text: cfg.whatsapp_text || null },
      { onConflict: "map_id,type" },
    );
    setSavedTypes((prev) => new Set([...prev, type]));
    setTimeout(
      () => setSavedTypes((prev) => { const next = new Set(prev); next.delete(type); return next; }),
      2000,
    );
  };

  const TaskRow = ({ task, extra }: { task: Task; extra?: string }) => (
    <div className="flex items-center gap-2 border-b border-gray-100 py-1.5 text-sm last:border-0">
      <span className="flex-1 text-gray-700">{buildPathText(task.id, tasks)}</span>
      {task.assignee === "chiara" && (
        <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-600">Chiara</span>
      )}
      {extra && <span className="shrink-0 text-xs text-gray-400">{extra}</span>}
    </div>
  );

  const weekLabel = `${now.startOf("week").toFormat("d MMM")} – ${now.endOf("week").toFormat("d MMM")}`;

  // Contenuto corpo email per tipo (senza chiara_completed che dipende da cfg)
  const bodyContentStatic: Record<string, React.ReactNode> = {
    weekly_summary: !weeklyWouldSend ? (
      <p className="text-sm italic text-gray-400">Nessun task in scadenza questa settimana né scaduto.</p>
    ) : (
      <>
        {dueThisWeek.filter(isTiziano).length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-gray-500">📌 Tiziano — in scadenza ({dueThisWeek.filter(isTiziano).length})</div>
            {dueThisWeek.filter(isTiziano).map((t) => <TaskRow key={t.id} task={t} extra={formatDate(t.due_at!)} />)}
          </div>
        )}
        {overdue.filter(isTiziano).length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-red-400">⚠️ Tiziano — scaduti ({overdue.filter(isTiziano).length})</div>
            {overdue.filter(isTiziano).map((t) => <TaskRow key={t.id} task={t} extra={formatDate(t.due_at!)} />)}
          </div>
        )}
        {dueThisWeek.filter(isChiara).length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-purple-500">📌 Chiara — in scadenza ({dueThisWeek.filter(isChiara).length})</div>
            {dueThisWeek.filter(isChiara).map((t) => <TaskRow key={t.id} task={t} extra={formatDate(t.due_at!)} />)}
          </div>
        )}
        {overdue.filter(isChiara).length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-red-400">⚠️ Chiara — scaduti ({overdue.filter(isChiara).length})</div>
            {overdue.filter(isChiara).map((t) => <TaskRow key={t.id} task={t} extra={formatDate(t.due_at!)} />)}
          </div>
        )}
      </>
    ),
    due_alerts: !dueTodayWouldSend ? (
      <p className="text-sm italic text-gray-400">Nessun task in scadenza oggi.</p>
    ) : (
      <div>
        <div className="mb-1 text-xs font-semibold text-gray-500">In scadenza oggi ({dueToday.length})</div>
        {dueToday.map((t) => (
          <TaskRow key={t.id} task={t} extra={t.due_at ? DateTime.fromISO(t.due_at).setZone("Europe/Rome").toFormat("HH:mm") : undefined} />
        ))}
      </div>
    ),
  };

  const wouldSendMap: Record<string, boolean> = {
    weekly_summary: weeklyWouldSend,
    due_alerts: dueTodayWouldSend,
    casa_summary: casaWouldSend,
    chiara_completed: chiaraWouldSend,
  };

  const toggleAllowedType = async (type: string) => {
    const next = allowedEmailTypes.includes(type)
      ? allowedEmailTypes.filter((t) => t !== type)
      : [...allowedEmailTypes, type];
    setAllowedEmailTypes(next);
    await supabase.from("maps").update({ email_types: next }).eq("id", mapId);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 pt-16">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="text-xs text-gray-400">
          Oggi: {now.toFormat("cccc d MMMM yyyy")} — settimana {weekLabel}
        </div>

        {/* Selezione tipi attivi */}
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Email attive per questa mappa</div>
          <div className="flex flex-wrap gap-2">
            {EMAIL_TYPE_META.map(({ type, label }) => {
              const active = allowedEmailTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleAllowedType(type)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-gray-800 bg-gray-800 text-white"
                      : "border-gray-300 bg-white text-gray-400 hover:border-gray-500 hover:text-gray-600"
                  }`}
                >
                  {active ? "✓ " : ""}{label}
                </button>
              );
            })}
          </div>
        </div>

        {EMAIL_TYPE_META.filter(({ type }) => allowedEmailTypes.includes(type)).map(({ type, label, schedule, defaultSubject, defaultIntro }) => {
          const cfg = emailConfigs[type] ?? { enabled: false, subject: "", intro_text: "" };
          const wouldSend = wouldSendMap[type] ?? false;
          const saved = savedTypes.has(type);

          // Anteprima email completa per i tipi con struttura ricca
          const resolvedChiaraIntro = (cfg.intro_text || defaultIntro).replace("{count}", String(chiaraCompleted.length));
          const resolvedCasaIntro = (cfg.intro_text || defaultIntro).replace("{count}", String(casaCompleted.length));

          const chiaraBodyContent = type === "chiara_completed" ? (
            !chiaraWouldSend ? (
              <p className="text-sm italic text-gray-400">Nessun task completato da Chiara negli ultimi 7 giorni.</p>
            ) : (
              <div className="space-y-3 text-sm text-gray-700">
                <p>Ciao Chiara! 🌟</p>
                <p>{resolvedChiaraIntro}</p>
                <div>
                  <p className="mb-1 font-semibold">Ecco cosa hai portato a termine:</p>
                  {chiaraCompleted.map((t) => (
                    <TaskRow key={t.id} task={t} extra={t.completed_at ? formatDate(t.completed_at) : undefined} />
                  ))}
                </div>
                <p>Continua così — sei una forza! 🎉</p>
              </div>
            )
          ) : null;

          const casaOutro = cfg.outro_text || "Dimostra la tua gratitudine a Tiziano regalandogli un buono Amazon 😊";
          const casaWaText = cfg.whatsapp_text || "";
          const casaBodyContent = type === "casa_summary" ? (
            !casaNode ? (
              <p className="text-sm italic text-red-400">Nodo "CASA" non trovato in questa mappa.</p>
            ) : !casaWouldSend ? (
              <p className="text-sm italic text-gray-400">Nessun task di Tiziano sotto CASA completato questa settimana.</p>
            ) : (
              <div className="space-y-3 text-sm text-gray-700">
                <p>Ciao Chiara,</p>
                <p>{resolvedCasaIntro}</p>
                <div>
                  {casaCompleted.map((t) => (
                    <TaskRow key={t.id} task={t} extra={t.completed_at ? formatDate(t.completed_at) : undefined} />
                  ))}
                </div>
                <p>{casaOutro}</p>
                {casaWaText && (
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L0 24l6.321-1.506A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.002-1.367l-.358-.214-3.724.888.924-3.638-.234-.374A9.791 9.791 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                      {casaWaText}
                    </span>
                  </div>
                )}
              </div>
            )
          ) : null;

          return (
            <div key={type} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {/* ── Header ── */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
                <button
                  onClick={() => { updateCfg(type, { enabled: !cfg.enabled }); }}
                  title={cfg.enabled ? "Disabilita" : "Abilita"}
                  className={`text-xl leading-none transition-colors ${cfg.enabled ? "text-green-500 hover:text-green-600" : "text-gray-300 hover:text-gray-400"}`}
                >
                  {cfg.enabled ? "●" : "○"}
                </button>
                <div className="flex-1">
                  <span className="font-semibold text-gray-900">{label}</span>
                  <span className="ml-2 text-xs text-gray-400">{schedule}</span>
                </div>
                {cfg.enabled && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${wouldSend ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {wouldSend ? "✓ partirebbe" : "✗ non partirebbe"}
                  </span>
                )}
              </div>

              {/* ── Corpo email (solo se abilitata) ── */}
              {cfg.enabled && (
                <div className="p-5">
                  {/* Oggetto */}
                  <div className="mb-4 flex items-baseline gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">Oggetto</span>
                    <input
                      type="text"
                      value={cfg.subject}
                      onChange={(e) => updateCfg(type, { subject: e.target.value })}
                      placeholder={defaultSubject}
                      className="flex-1 border-0 border-b border-dashed border-gray-300 bg-transparent pb-0.5 text-sm font-medium text-gray-800 placeholder-gray-300 focus:border-gray-500 focus:outline-none"
                    />
                  </div>

                  {/* Testo introduttivo (per chiara_completed mostra hint su {count}) */}
                  <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Testo introduttivo</span>
                      {(type === "chiara_completed" || type === "casa_summary") && (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-500" title="Verrà sostituito con il numero di task completati">{"{count}"}</span>
                      )}
                    </div>
                    <textarea
                      value={cfg.intro_text}
                      onChange={(e) => updateCfg(type, { intro_text: e.target.value })}
                      placeholder={defaultIntro}
                      rows={type === "chiara_completed" || type === "casa_summary" ? 3 : 2}
                      className="w-full resize-none bg-transparent text-sm text-gray-700 placeholder-gray-300 focus:outline-none"
                    />
                  </div>

                  {/* Frase finale + pulsante WhatsApp (solo casa_summary) */}
                  {type === "casa_summary" && (
                    <>
                      <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Frase finale</div>
                        <textarea
                          value={cfg.outro_text}
                          onChange={(e) => updateCfg(type, { outro_text: e.target.value })}
                          placeholder="Dimostra la tua gratitudine a Tiziano regalandogli un buono Amazon 😊"
                          rows={2}
                          className="w-full resize-none bg-transparent text-sm text-gray-700 placeholder-gray-300 focus:outline-none"
                        />
                      </div>
                      <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-green-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L0 24l6.321-1.506A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.002-1.367l-.358-.214-3.724.888.924-3.638-.234-.374A9.791 9.791 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Testo pulsante WhatsApp</span>
                          <span className="text-xs text-gray-400">(lascia vuoto per non mostrarlo)</span>
                        </div>
                        <input
                          type="text"
                          value={cfg.whatsapp_text}
                          onChange={(e) => updateCfg(type, { whatsapp_text: e.target.value })}
                          placeholder="Scrivi a Tiziano su WhatsApp 💬"
                          className="w-full border-0 bg-transparent text-sm text-gray-700 placeholder-gray-300 focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Anteprima email */}
                  <div className="mb-4 rounded-xl border border-gray-100 bg-white px-4 py-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Anteprima email</div>
                    {chiaraBodyContent ?? casaBodyContent ?? bodyContentStatic[type]}
                  </div>

                  {/* Salva */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => saveCfg(type)}
                      className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${saved ? "bg-green-500 text-white" : "bg-gray-900 text-white hover:bg-gray-700"}`}
                    >
                      {saved ? "✓ Salvato" : "Salva"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MapPage() {
  const params = useParams();
  const router = useRouter();
  const mapId = Number(params.id);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [mapName, setMapName] = useState<string>("");
  const [showAssignee, setShowAssignee] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rootEditing, setRootEditing] = useState(false);
  const [rootLabel, setRootLabel] = useState("OGGI");

  const [expanded, setExpanded] = useState<ExpandedMap>({ [ROOT_ID]: true });
  const [showCompleted, setShowCompleted] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailConfigs, setEmailConfigs] = useState<Record<string, EmailConfig>>({});
  const [allowedEmailTypes, setAllowedEmailTypes] = useState<string[]>(["weekly_summary","due_alerts","casa_summary","chiara_completed"]);
  const [mapFont, setMapFont] = useState("var(--font-patrick-hand)");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [nodeAccentColor, setNodeAccentColor] = useState("#000000");
  const [nodeChildColor, setNodeChildColor] = useState("#ffffff");
  const [rootTextColor, setRootTextColor] = useState("#000000");
  const [nodeShadowIndex, setNodeShadowIndex] = useState(2);

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesTaskId, setNotesTaskId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  // drag-to-reparent
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const getNodesRef = useRef<(() => Node[]) | null>(null);

  const onNodeDrag = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    const target = findDropTarget(draggedNode, getNodesRef.current?.() ?? []);
    setDragTargetId(target);
  }, []);

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

  // ---- carica nome mappa + impostazioni locali ----
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!mapId) return;
    const pfx = `${mapId}.`;

    // Carica configurazioni email
    supabase.from("email_configs").select("type,enabled,subject,intro_text,outro_text,whatsapp_text").eq("map_id", mapId).then(({ data }) => {
      const cfgMap: Record<string, EmailConfig> = {};
      (data ?? []).forEach((c: any) => {
        cfgMap[c.type] = { enabled: c.enabled, subject: c.subject ?? "", intro_text: c.intro_text ?? "", outro_text: c.outro_text ?? "", whatsapp_text: c.whatsapp_text ?? "" };
      });
      setEmailConfigs(cfgMap);
    });

    // Nome mappa: usato come default per il nodo radice se non salvato
    supabase.from("maps").select("name,show_assignee,email_types").eq("id", mapId).single().then(({ data }) => {
      if (data?.name) {
        setMapName(data.name);
        const savedLabel = window.localStorage.getItem(pfx + LS_ROOT_LABEL);
        setRootLabel(savedLabel?.trim() || data.name);
      }
      if (data?.show_assignee === false) setShowAssignee(false);
      if (Array.isArray(data?.email_types) && data.email_types.length > 0) setAllowedEmailTypes(data.email_types);
    });

    // expanded viene inizializzato in load() dove abbiamo i task

    const sc = window.localStorage.getItem(pfx + LS_SHOW_COMPLETED);
    setShowCompleted(sc === "true");

    const savedFont = window.localStorage.getItem(pfx + LS_FONT);
    if (savedFont) setMapFont(savedFont);
    const savedBg = window.localStorage.getItem(pfx + LS_BG_COLOR);
    if (savedBg) setBgColor(savedBg);
    const savedAccent = window.localStorage.getItem(pfx + LS_ACCENT_COLOR);
    if (savedAccent) setNodeAccentColor(savedAccent);
    const savedChild = window.localStorage.getItem(pfx + LS_CHILD_COLOR);
    if (savedChild) setNodeChildColor(savedChild);
    const savedRootTextColor = window.localStorage.getItem(pfx + LS_ROOT_TEXT_COLOR);
    if (savedRootTextColor) setRootTextColor(savedRootTextColor);
    const savedShadow = window.localStorage.getItem(pfx + LS_NODE_SHADOW);
    if (savedShadow !== null) setNodeShadowIndex(Number(savedShadow));
  }, [mapId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_EXPANDED}`, JSON.stringify(expanded));
  }, [expanded, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_SHOW_COMPLETED}`, showCompleted ? "true" : "false");
  }, [showCompleted, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_FONT}`, mapFont);
    document.documentElement.style.setProperty("--map-font", mapFont);
  }, [mapFont, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_BG_COLOR}`, bgColor);
  }, [bgColor, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_ACCENT_COLOR}`, nodeAccentColor);
  }, [nodeAccentColor, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_CHILD_COLOR}`, nodeChildColor);
  }, [nodeChildColor, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_ROOT_TEXT_COLOR}`, rootTextColor);
  }, [rootTextColor, mapId]);

  useEffect(() => {
    if (!mapId) return;
    window.localStorage.setItem(`${mapId}.${LS_NODE_SHADOW}`, String(nodeShadowIndex));
  }, [nodeShadowIndex, mapId]);

  const collapseAll = () => {
    setExpanded((prev) => {
      const next: ExpandedMap = { [ROOT_ID]: true };
      Object.keys(prev).forEach((id) => { if (id !== ROOT_ID) next[id] = false; });
      tasks.forEach((t) => { if (t.id !== ROOT_ID) next[t.id] = false; });
      return next;
    });
  };

  const collapseToToday = () => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const dueTasks = tasks.filter(
      (t) => !t.completed && t.due_at && new Date(t.due_at) <= todayEnd
    );
    const toExpand = new Set<string>([ROOT_ID]);
    for (const task of dueTasks) {
      let curId = task.parent_id;
      while (curId) {
        toExpand.add(curId);
        curId = byId.get(curId)?.parent_id ?? null;
      }
    }
    const next: ExpandedMap = { [ROOT_ID]: true };
    tasks.forEach((t) => { next[t.id] = toExpand.has(t.id); });
    setExpanded(next);
  };

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
      .eq("map_id", mapId)
      .order("sort_order", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }
    const loadedTasks = (data as Task[]) ?? [];
    setTasks(loadedTasks);

    // ── Inizializza expanded ──────────────────────────────────────────
    const pfx = `${mapId}.`;
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastOpenDate = window.localStorage.getItem(pfx + LS_LAST_OPEN_DATE);
    const isNewDay = lastOpenDate !== todayStr;

    const savedRaw = window.localStorage.getItem(pfx + LS_EXPANDED);
    const saved = safeParseExpanded(savedRaw);
    // "Stato reale" = contiene almeno un ID di task (non solo ROOT).
    // Il persist effect scrive subito {ROOT_NODE:true} al mount, quindi
    // savedRaw non-null non basta a distinguere stato reale da primo avvio.
    const hasRealState = Object.keys(saved).some((k) => k !== ROOT_ID);

    if (hasRealState && !isNewDay) {
      // Stesso giorno, stato salvato → ripristina
      if (saved[ROOT_ID] === undefined) saved[ROOT_ID] = true;
      setExpanded(saved);
    } else {
      // Primo avvio del giorno (o prima visita in assoluto):
      // collassa tutto, espandi solo gli antenati dei task scaduti/oggi
      window.localStorage.setItem(pfx + LS_LAST_OPEN_DATE, todayStr);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const byId = new Map(loadedTasks.map((t) => [t.id, t]));
      const dueTasks = loadedTasks.filter(
        (t) => !t.completed && t.due_at && new Date(t.due_at) <= todayEnd
      );
      const toExpand = new Set<string>([ROOT_ID]);
      for (const task of dueTasks) {
        let curId = task.parent_id;
        while (curId) {
          toExpand.add(curId);
          curId = byId.get(curId)?.parent_id ?? null;
        }
      }
      const initialExpanded: ExpandedMap = { [ROOT_ID]: true };
      loadedTasks.forEach((t) => { initialExpanded[t.id] = toExpand.has(t.id); });
      setExpanded(initialExpanded);
    }
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
      .insert({ title: "Nuovo task", parent_id: null, completed: false, sort_order: nextSort, notes: "", owner_id: userId, map_id: mapId })
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
      .insert({ title: "Nuovo sotto-task", parent_id: parentId, completed: false, sort_order: nextSort, notes: "", owner_id: userId, map_id: mapId })
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
    window.localStorage.setItem(`${mapId}.${LS_ROOT_LABEL}`, clean);
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
            nodeChildColor,
            onSetDue: setDue,
            onOpenNotes: (id) => {
              setNotesTaskId(id);
              setNotesOpen(true);
            },
            onSetAssignee: setAssignee,
            assignee: t.assignee,
            showAssignee,
            nodeShadow: SHADOW_PRESETS[nodeShadowIndex],
            isDropTarget: t.id === dragTargetId,
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
        isDropTarget: ROOT_ID === dragTargetId,
        rootTextColor,
        nodeShadow: SHADOW_PRESETS[nodeShadowIndex],
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
  }, [visibleTasks, tasks, editingId, selectedNodeId, nodeAccentColor, nodeChildColor, rootTextColor, nodeShadowIndex, rootLabel, rootEditing, expanded, manualPositions, dragTargetId]);

  // ---- drag-to-reorder via ReactFlow nativo ----
  // Quando l'utente trascina un nodo (dal grip ⠿), onNodeDragStop riceve
  // le posizioni aggiornate di TUTTI i nodi dopo il drop.
  // Usiamo la posizione Y per determinare il nuovo ordinamento tra i fratelli.
  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, draggedNode: Node, allCurrentNodes: Node[]) => {
      const draggedTask = tasks.find((t) => t.id === draggedNode.id);
      if (!draggedTask) return;

      setDragTargetId(null);

      // ---- reparenting: il nodo è stato rilasciato sopra un altro nodo ----
      // getNodesRef.current() chiama getNodes() di ReactFlow al momento preciso del drop
      const dropTargetId = findDropTarget(draggedNode, getNodesRef.current?.() ?? []);
      if (dropTargetId) {
        const newParentId = dropTargetId === ROOT_ID ? null : dropTargetId;
        if (draggedTask.parent_id === newParentId) return; // già figlio di quel nodo
        if (newParentId && isDescendantOf(tasks, draggedTask.id, newParentId)) {
          setError("Non puoi spostare un nodo su un suo discendente.");
          return;
        }
        setManualPositions((prev) => { const next = { ...prev }; delete next[draggedNode.id]; return next; });
        setError(null);
        const { error: err } = await supabase.from("tasks").update({ parent_id: newParentId }).eq("id", draggedTask.id);
        if (err) { setError(err.message); return; }
        await load();
        return;
      }

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
    <main className="relative h-screen w-screen">
      <style>{`
        .react-flow__edge-path { stroke: #000 !important; stroke-opacity: 1 !important; stroke-linecap: round !important; stroke-width: 3 !important; }
        .ProseMirror p { margin: 0 0 10px 0; }
        .ProseMirror ul { margin: 0 0 10px 18px; }
        .ProseMirror ol { margin: 0 0 10px 18px; }
      `}</style>

      {/* ── Controlli flotanti (nessuna barra di sfondo) ── */}
      {/* Sinistra: back + toggle mappa/email */}
      <div className="fixed top-3 left-3 z-50 flex items-center gap-1.5 text-sm">
        <button
          onClick={() => router.push("/")}
          className="rounded-xl border border-gray-200 bg-white/90 px-2.5 py-1.5 text-gray-500 shadow-sm backdrop-blur-sm hover:text-gray-800 transition-colors"
          title="Dashboard"
        >←</button>
        <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white/90 shadow-sm backdrop-blur-sm">
          <button onClick={() => setViewMode("map")} className={`px-3 py-1.5 transition-colors ${viewMode === "map" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"}`}>🗺</button>
          <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 transition-colors ${viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"}`}>📧</button>
        </div>
      </div>

      {/* Destra: Oggi + Completati + ⊖ + 🎨 */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 text-sm">
        <button
          onClick={collapseToToday}
          className="rounded-xl border border-orange-200 bg-white/90 px-2.5 py-1.5 font-medium text-orange-500 shadow-sm backdrop-blur-sm hover:text-orange-600 transition-colors"
          title="Mostra solo i task scaduti o in scadenza oggi"
        >Oggi</button>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm text-gray-600">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            <span className="hidden sm:inline">Completati</span>
          </label>
          <div className="h-4 w-px bg-gray-200" />
          <button onClick={collapseAll} className="text-gray-400 hover:text-gray-700" title="Chiudi tutti i nodi">⊖</button>
          <div className="h-4 w-px bg-gray-200" />
          <button onClick={() => setSettingsOpen((v) => !v)} className={settingsOpen ? "text-gray-900" : "text-gray-400 hover:text-gray-700"} title="Personalizza">🎨</button>
        </div>
      </div>

      {/* Pannello palette — fixed sotto la top bar a destra */}
      {settingsOpen && (
        <div
          className="fixed top-14 right-3 z-50 w-80 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm max-h-[calc(100vh-64px)] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Font */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Font</div>
          <div className="mb-4 flex flex-col gap-1">
            {FONT_OPTIONS.map((f) => (
              <button key={f.value} type="button"
                style={{ fontFamily: `${f.value}, cursive`, fontSize: 15 }}
                className={["rounded-lg px-3 py-1.5 text-left transition-colors", mapFont === f.value ? "border border-gray-400 bg-gray-100" : "border border-transparent hover:bg-gray-50"].join(" ")}
                onClick={() => setMapFont(f.value)}>{f.label}</button>
            ))}
          </div>

          {/* Sfondo */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Sfondo</div>
          <div className="flex flex-wrap gap-2">
            {BG_COLORS.map((c) => (
              <button key={c.value} type="button" title={c.label}
                className={["h-7 w-7 rounded-full border-2 transition-transform", bgColor === c.value ? "border-gray-500 scale-110" : "border-gray-200 hover:border-gray-400"].join(" ")}
                style={{ backgroundColor: c.value }} onClick={() => setBgColor(c.value)} />
            ))}
          </div>
          <div className="mt-2 mb-4 flex items-center gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#ffffff"} onChange={(e) => setBgColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-gray-200 p-0" />
            <input type="text" value={bgColor} maxLength={7} placeholder="#ffffff" onChange={(e) => setBgColor(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
          </div>

          {/* Nodi principali */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Nodi principali</div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((c) => (
              <button key={c.value} type="button" title={c.label}
                className={["h-7 w-7 rounded-full border-2 transition-transform", nodeAccentColor === c.value ? "border-gray-400 scale-110" : "border-gray-200 hover:border-gray-400"].join(" ")}
                style={{ backgroundColor: c.value }} onClick={() => setNodeAccentColor(c.value)} />
            ))}
          </div>
          <div className="mt-2 mb-4 flex items-center gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(nodeAccentColor) ? nodeAccentColor : "#000000"} onChange={(e) => setNodeAccentColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-gray-200 p-0" />
            <input type="text" value={nodeAccentColor} maxLength={7} placeholder="#000000" onChange={(e) => setNodeAccentColor(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
          </div>

          {/* Nodi figli */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Nodi figli</div>
          <div className="flex flex-wrap gap-2">
            {CHILD_COLORS.map((c) => (
              <button key={c.value} type="button" title={c.label}
                className={["h-7 w-7 rounded-full border-2 transition-transform", nodeChildColor === c.value ? "border-gray-400 scale-110" : "border-gray-200 hover:border-gray-400"].join(" ")}
                style={{ backgroundColor: c.value }} onClick={() => setNodeChildColor(c.value)} />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(nodeChildColor) ? nodeChildColor : "#ffffff"} onChange={(e) => setNodeChildColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-gray-200 p-0" />
            <input type="text" value={nodeChildColor} maxLength={7} placeholder="#ffffff" onChange={(e) => setNodeChildColor(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
          </div>

          {/* Testo nodo principale */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Testo nodo principale</div>
            <div className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(rootTextColor) ? rootTextColor : "#000000"} onChange={(e) => setRootTextColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-gray-200 p-0" />
              <input type="text" value={rootTextColor} maxLength={7} placeholder="#000000" onChange={(e) => setRootTextColor(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
            </div>
          </div>

          {/* Ombra nodi */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400">
              <span>Ombra nodi</span>
              <span className="font-normal normal-case">{["Nessuna","Leggera","Media","Forte","Intensa"][nodeShadowIndex]}</span>
            </div>
            <input type="range" min={0} max={4} step={1} value={nodeShadowIndex} onChange={(e) => setNodeShadowIndex(Number(e.target.value))} className="w-full accent-gray-800" />
            <div className="mt-1 flex justify-between text-xs text-gray-300"><span>○</span><span>◔</span><span>◑</span><span>◕</span><span>●</span></div>
          </div>

          {/* Opzioni */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Opzioni</div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={showAssignee} onChange={async (e) => { const val = e.target.checked; setShowAssignee(val); await supabase.from("maps").update({ show_assignee: val }).eq("id", mapId); }} />
              Mostra tasto "Assegna a Chiara"
            </label>
          </div>

          {/* Logout */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">Logout</button>
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <div className="absolute inset-0 z-10">
          <EmailView
            tasks={tasks}
            emailConfigs={emailConfigs}
            setEmailConfigs={setEmailConfigs}
            mapId={mapId}
            allowedEmailTypes={allowedEmailTypes}
            setAllowedEmailTypes={setAllowedEmailTypes}
          />
        </div>
      )}
      <div style={{ width: "100%", height: "100%", backgroundColor: bgColor, fontFamily: mapFont }}>
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
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
        >
          <Controls />
          <FitViewOnLoad nodeCount={nodes.length} fitViewTrigger={fitViewTrigger} />
          <NodeSyncer nodes={nodes} />
          <RFNodesTracker getNodesRef={getNodesRef} />
          {error && (
            <Panel position="top-left">
              <div className="mt-10 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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