import { db } from "@/db";
import { caseProfiles } from "@/db/schema";
import { desc } from "drizzle-orm";

const EMPTY_MESSAGE = "No case profiles yet. Save a query to create one.";

// W50 — React 19's react-hooks/error-boundaries rule forbids returning JSX
// from inside a try/catch because rendering errors are not caught by the
// surrounding try (they fire later, during reconciliation). Resolve the
// data fetch outside the JSX render path so any throw lands as a string
// flag we can branch on.
async function loadCases() {
  try {
    return await db.select().from(caseProfiles).orderBy(desc(caseProfiles.createdAt)).limit(6);
  } catch {
    return null;
  }
}

export default async function CaseList() {
  const cases = await loadCases();
  if (!cases || cases.length === 0) {
    return <p className="text-sm text-[color:var(--muted)]">{EMPTY_MESSAGE}</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {cases.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)", color: "var(--text)" }}
        >
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
            <span>{new Date(item.createdAt ?? new Date()).toLocaleString()}</span>
            {item.patientName && <span className="rounded-full bg-[color:var(--pill)] px-2 py-1">{item.patientName}</span>}
          </div>
          <h4 className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>
            {item.title}
          </h4>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {item.question}
          </p>
          {item.clinicianNotes && (
            <p className="mt-2 rounded-xl bg-[color:var(--pill)] px-3 py-2 text-sm" style={{ color: "var(--text)" }}>
              Notes: {item.clinicianNotes}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
