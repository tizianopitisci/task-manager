"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("tizianopitisci@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // se già loggato, vai su /map
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/";
    });
  }, []);

  const signIn = async () => {
    setMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-xl font-semibold">Login</div>
        <div className="mt-1 text-sm text-gray-600">Accesso riservato.</div>

        <label className="mt-5 block text-sm font-medium text-gray-700">Email</label>
        <input
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <label className="mt-4 block text-sm font-medium text-gray-700">Password</label>
        <input
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
        />

        {msg ? <div className="mt-3 text-sm text-red-700">{msg}</div> : null}

        <button
          onClick={signIn}
          disabled={loading || !password}
          className="mt-5 w-full rounded-xl bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Accesso..." : "Entra"}
        </button>
      </div>
    </main>
  );
}