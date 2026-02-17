"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function signIn() {
    const origin = window.location.origin;
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/dashboard` }
    });

    setMessage(error ? error.message : "Check your inbox for your magic link.");
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    setMessage("Signed out.");
  }

  return (
    <div className="card space-y-3">
      <h3 className="text-lg font-semibold">Sign in</h3>
      <input
        className="input"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn-primary" onClick={signIn}>
          Send magic link
        </button>
        <button className="btn-secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
