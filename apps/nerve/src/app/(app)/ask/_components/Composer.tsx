"use client";

import { useRef, useState } from "react";

export function Composer({
  action,
  disabled = false,
}: {
  action: (formData: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || disabled) return;
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      await action(fd);
      formRef.current?.reset();
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="border border-border bg-bg-panel">
      <textarea
        name="query"
        required
        rows={3}
        autoFocus
        disabled={disabled || pending}
        placeholder={
          disabled
            ? "ANTHROPIC_API_KEY not set — /ask is disabled."
            : "Ask anything across the vault. Cmd+Enter to send."
        }
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-fg font-mono text-xs px-3 py-3 outline-none resize-none"
      />
      <div className="border-t border-border px-3 py-2 flex items-center justify-between">
        <span className="font-mono text-2xs text-fg-dim">
          {pending ? "Claude is responding…" : "Cmd+Enter to send"}
        </span>
        <button
          type="submit"
          disabled={disabled || pending}
          className="font-sans text-sm font-medium px-3 py-1 bg-fg text-bg
                     hover:bg-fg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "..." : "Send"}
        </button>
      </div>
    </form>
  );
}
