"use client";

import { useState } from "react";

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");

  async function submit() {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    setStatus(res.ok ? "Thanks, feedback saved." : "Could not save feedback.");
    if (res.ok) setText("");
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Feedback
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">Beta feedback</h3>
            <p className="mb-3 mt-1 text-sm text-muted">Tell us what blocked you or what should be next.</p>
            <textarea
              className="input min-h-28"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your feedback"
            />
            <div className="mt-4 flex gap-2">
              <button className="btn-primary" onClick={submit}>
                Send
              </button>
              <button className="btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {status ? <p className="mt-2 text-sm text-muted">{status}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
