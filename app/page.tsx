"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type MapRow = {
  id: number;
  name: string;
  created_at: string;
  task_count?: number;
};

export default function Dashboard() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newMapName, setNewMapName] = useState("");

  // ---- auth guard ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.href = "/login";
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- carica mappe ----
  useEffect(() => {
    if (!sessionChecked) return;
    loadMaps();
  }, [sessionChecked]);

  async function loadMaps() {
    setLoading(true);
    const { data: mapsData } = await supabase
      .from("maps")
      .select("id, name, created_at")
      .order("id", { ascending: true });

    if (!mapsData) { setLoading(false); return; }

    // Conta i task attivi per ogni mappa
    const withCounts = await Promise.all(
      mapsData.map(async (m) => {
        const { count } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("map_id", m.id)
          .eq("completed", false);
        return { ...m, task_count: count ?? 0 };
      })
    );

    setMaps(withCounts);
    setLoading(false);
  }

  async function createMap() {
    const name = newMapName.trim();
    if (!name) return;
    const { data } = await supabase
      .from("maps")
      .insert({ name })
      .select("id")
      .single();
    if (data) {
      setNewMapName("");
      setCreating(false);
      router.push(`/map/${data.id}`);
    }
  }

  async function renameMap(id: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from("maps").update({ name: trimmed }).eq("id", id);
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, name: trimmed } : m)));
    setRenamingId(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!sessionChecked) return null;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Le mie mappe</h1>
            <p className="text-sm text-gray-500 mt-0.5">Seleziona una mappa o creane una nuova</p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Griglia mappe */}
        {loading ? (
          <div className="text-sm text-gray-400">Caricamento…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {maps.map((m) => (
              <div
                key={m.id}
                className="group relative rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => renamingId !== m.id && router.push(`/map/${m.id}`)}
              >
                {renamingId === m.id ? (
                  <input
                    autoFocus
                    className="w-full text-lg font-medium text-gray-900 border-b border-gray-300 outline-none bg-transparent pb-0.5"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => renameMap(m.id, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameMap(m.id, renameValue);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="text-lg font-medium text-gray-900">{m.name}</div>
                )}

                <div className="mt-1 text-sm text-gray-400">
                  {m.task_count === 0
                    ? "Nessun task attivo"
                    : `${m.task_count} task attiv${m.task_count === 1 ? "o" : "i"}`}
                </div>

                <button
                  className="absolute top-4 right-4 text-xs text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(m.id);
                    setRenameValue(m.name);
                  }}
                >
                  ✏️
                </button>
              </div>
            ))}

            {/* Card "Nuova mappa" */}
            {creating ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <input
                  autoFocus
                  placeholder="Nome della mappa…"
                  className="w-full text-lg font-medium text-gray-900 border-b border-gray-300 outline-none bg-transparent pb-0.5"
                  value={newMapName}
                  onChange={(e) => setNewMapName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createMap();
                    if (e.key === "Escape") { setCreating(false); setNewMapName(""); }
                  }}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={createMap}
                    disabled={!newMapName.trim()}
                    className="text-sm px-3 py-1 rounded-lg bg-gray-900 text-white disabled:opacity-40"
                  >
                    Crea
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewMapName(""); }}
                    className="text-sm px-3 py-1 rounded-lg text-gray-500 hover:text-gray-800"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="rounded-2xl border-2 border-dashed border-gray-200 bg-transparent p-5 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors text-left"
              >
                <span className="text-2xl">+</span>
                <div className="mt-1 text-sm font-medium">Nuova mappa</div>
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
