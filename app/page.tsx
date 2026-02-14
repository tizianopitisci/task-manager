"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  due_at: string | null;
  parent_id: string | null;
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  


  const [newTitle, setNewTitle] = useState("");
const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,completed,due_at,parent_id")
        .order("sort_order", { ascending: true });

      if (error) {
        setError(error.message);
        return;
      }
      setTasks(data ?? []);
    }

    load();
  }, []);
async function addTask() {
  const title = newTitle.trim();
  if (!title) return;

  setSaving(true);
  setError(null);

  const { error } = await supabase.from("tasks").insert({
    title,
    sort_order: tasks.length,
  });

  if (error) {
    setError(error.message);
    setSaving(false);
    return;
  }

  setNewTitle("");
  setSaving(false);

  const { data, error: reloadErr } = await supabase
    .from("tasks")
    .select("id,title,completed,due_at,parent_id")
    .order("sort_order", { ascending: true });

  if (reloadErr) {
    setError(reloadErr.message);
    return;
  }

  setTasks(data ?? []);
}

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold">Task Manager</h1>
      <p className="mt-2 text-gray-600">Lista task (presa da Supabase).</p>
      <div className="mt-6 flex gap-2">
  <input
    value={newTitle}
    onChange={(e) => setNewTitle(e.target.value)}
    placeholder="Nuovo task..."
    className="w-full rounded-xl border p-3"
  />
  <button
    onClick={addTask}
    disabled={saving}
    className="rounded-xl border px-4"
  >
    {saving ? "..." : "Aggiungi"}
  </button>
</div>


      {error ? (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          Errore: {error}
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {tasks.filter((t) => !t.parent_id).map((t) => (
            <li key={t.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <span className={t.completed ? "line-through text-gray-400" : ""}>
                  {t.title}
                </span>
                <span className="text-xs text-gray-500">
                  {t.due_at ? new Date(t.due_at).toLocaleDateString() : ""}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">Task principale</div>

<ul className="mt-2 space-y-2 pl-6">
  {tasks
    .filter((c) => c.parent_id === t.id)
    .map((c) => (
      <li key={c.id} className="rounded-xl border p-3">
        <div className="flex items-center justify-between">
          <span className={c.completed ? "line-through text-gray-400" : ""}>
            {c.title}
          </span>
          <span className="text-xs text-gray-500">
            {c.due_at ? new Date(c.due_at).toLocaleDateString() : ""}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500">Sotto-task</div>
      </li>
    ))}
</ul>

            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
