"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type Kind = "pdf" | "pdf-file" | "youtube" | "website" | "text";

export default function IngestForm() {
  const [kind, setKind] = useState<Kind>("pdf");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsUrl = kind !== "text" && kind !== "pdf-file";
  const needsFile = kind === "pdf-file";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const normalizedKind: "pdf" | "youtube" | "website" | "text" = kind === "pdf-file" ? "pdf" : kind;
    try {
      let res: Response;
      if (needsFile) {
        if (!file) throw new Error("Please attach a PDF file.");
        const form = new FormData();
        form.append("kind", "pdf-file");
        form.append("file", file);
        if (title) form.append("title", title);
        if (description) form.append("description", description);
        res = await fetch("/api/ingest", {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: normalizedKind,
            url: needsUrl ? url : undefined,
            text: normalizedKind === "text" ? text : undefined,
            title,
            description,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      setMessage(`Ingested ${kind.startsWith("pdf") ? "PDF" : kind} with ${data.chunkCount} chunks.`);
      setUrl("");
      setText("");
      setTitle("");
      setDescription("");
      setFile(null);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {(["pdf", "pdf-file", "youtube", "website", "text"] as Kind[]).map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => setKind(option)}
            className={`rounded-full border px-3 py-2 capitalize transition ${
              kind === option
                ? "border-[color:var(--accent)] bg-[color:var(--pill)] text-[color:var(--text)]"
                : "border-[color:var(--card-border)] bg-[color:var(--card)] text-[color:var(--muted)] hover:border-[color:var(--accent)]"
            }`}
          >
            {option.replace("-file", " (upload)")}
          </button>
        ))}
      </div>

      <div key={kind}>
        {needsFile ? (
          <label className="block text-sm" style={{ color: "var(--text)" }}>
            Upload PDF (text-based)
            <input
              required
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[color:var(--accent)] file:px-3 file:py-2 file:text-slate-900 focus:outline-none"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--card)",
                color: "var(--text)",
              }}
            />
          </label>
        ) : needsUrl ? (
          <label className="block text-sm" style={{ color: "var(--text)" }}>
            Source URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              type="url"
              placeholder="https://example.com/guideline.pdf"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--card)",
                color: "var(--text)",
              }}
            />
          </label>
        ) : (
          <label className="block text-sm" style={{ color: "var(--text)" }}>
            Paste text
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={5}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--card)",
                color: "var(--text)",
              }}
              placeholder="Drop research notes, case reports, or any text."
            />
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm" style={{ color: "var(--text)" }}>
          Title (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            type="text"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--card)",
              color: "var(--text)",
            }}
            placeholder="Internal medicine handbook"
          />
        </label>
        <label className="block text-sm" style={{ color: "var(--text)" }}>
          Short description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            type="text"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--card)",
              color: "var(--text)",
            }}
            placeholder="Why this source matters"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg transition disabled:opacity-60"
        style={{
          background: "linear-gradient(90deg, #22c55e, #06b6d4)",
          color: "#0f172a",
          boxShadow: "0 10px 30px rgba(34,197,94,0.25)",
        }}
      >
        {loading ? "Ingesting..." : "Ingest into AgentDB"}
      </button>

      {message && (
        <p className="text-sm" style={{ color: "var(--accent)" }}>
          {message}
        </p>
      )}
    </form>
  );
}
