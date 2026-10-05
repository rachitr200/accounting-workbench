import React, { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  Clock,
  ArrowLeftRight,
  Receipt,
  Send,
  BookOpen,
  History,
  Plus,
  Check,
  AlertTriangle,
  Download,
  Search,
  ChevronRight,
  X,
  FileText,
  ShieldCheck,
} from "lucide-react";
import Workflows from "./Workflows";
import Enablement from "./Enablement";
const nav = [
  ["Overview", LayoutDashboard],
  ["Workflow centre", ShieldCheck],
  ["Clients & leads", Users],
  ["Jobs & time", Clock],
  ["Reconciliation", ArrowLeftRight],
  ["Invoices", Receipt],
  ["Reminder drafts", Send],
  ["Knowledge desk", BookOpen],
  ["Activity log", History],
  ["Rollout & impact", ShieldCheck],
  ["Staff playbook", BookOpen],
];
const currency = (c, code = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: code }).format(
    c / 100,
  );
const hours = (m) =>
  (m / 60).toLocaleString("en-CA", { maximumFractionDigits: 2 });
const tag = (text, tone = "") => <span className={"tag " + tone}>{text}</span>;
async function api(path, body) {
  const r = await fetch(
    "/api/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((x) => x.msg).join("; ")
          : "Request failed",
    );
  return data;
}
function Empty({ children }) {
  return (
    <div className="empty">
      <FileText size={28} />
      <p>{children}</p>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({ title, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="modalhead">
        <h2>{title}</h2>
        <button
          type="button"
          className="iconbtn"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Form({ children, onSubmit, busy, submit = "Save" }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      {children}
      <div className="formfoot">
        <button disabled={busy} className="primary">
          {busy ? "Saving…" : submit}
        </button>
      </div>
    </form>
  );
}
export default function App() {
  const [importRows, setImportRows] = useState([]);
  const [data, setData] = useState(null),
    [page, setPage] = useState("Overview"),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("AR"),
    [answer, setAnswer] = useState(null),
    [asking, setAsking] = useState(false),
    [expanded, setExpanded] = useState(null);
  const load = async () => {
    try {
      setData(await api("state"));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  async function act(path, p = {}, message = "Saved", next) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api(path, p);
      await load();
      setNotice(
        r.existing ? "A draft already exists for this request today." : message,
      );
      if (next) setPage(next);
      setModal(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="loading">
        <h1>Accounting Workbench</h1>
        <p>{error || "Loading your demonstration workspace…"}</p>
        {error && <button onClick={load}>Retry</button>}
      </div>
    );
  const missing = data.clients.reduce(
      (n, c) => n + c.documents.filter((d) => !d.received).length,
      0,
    ),
    unmatched = data.bank.filter((b) => !b.match).length,
    overdue = data.invoices.filter(
      (i) => i.kind === "AR" && i.status === "Open" && i.due_date < data.today,
    ),
    pending = data.invoices.filter(
      (i) => i.kind === "AP" && i.status === "Review",
    ),
    used = data.jobs.reduce((n, j) => n + j.used_minutes, 0),
    budget = data.jobs.reduce((n, j) => n + j.budget_minutes, 0);
  const summary = {
    Overview: "A clear view of the work that needs attention.",
    "Workflow centre": "Run connected CRM and accounting checks, then review the results.",
    "Clients & leads": "Track relationships and complete client onboarding.",
    "Jobs & time": "Allocate staff time and spot budget overruns.",
    Reconciliation: "Compare sample bank activity with ledger entries.",
    Invoices: "Review payables and follow up on receivables.",
    "Reminder drafts": "Review messages before they leave the workspace.",
    "Knowledge desk": "Find approved source excerpts by jurisdiction and year.",
    "Activity log": "Trace changes made in this demonstration.",
    "Rollout & impact": "CRM first. Record evidence and measure practical improvements.",
    "Staff playbook": "Simple procedures, reusable prompts, and a clear handover.",
  };
  const table = (headers, body) => (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brandmark">W</div>
          <div>
            Workbench<small>ACCOUNTING OPERATIONS</small>
          </div>
        </div>
        <div className="workspace">
          <span className="avatar">RR</span>
          <div>
            TMP Workbench<small>Accounting operations for TMP</small>
          </div>
        </div>
        <nav aria-label="Workspace">
          {nav.map(([n, I]) => (
            <button
              key={n}
              className={page === n ? "selected" : ""}
              aria-current={page === n ? "page" : undefined}
              onClick={() => {
                setPage(n);
                setSearch("");
              }}
            >
              <I size={19} />
              {n}
              {n === "Reminder drafts" && data.drafts.length > 0 && (
                <b>{data.drafts.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebottom">
          <ShieldCheck size={20} />
          <div>
            {data.public_demo ? 'Public demonstration' : 'Local demonstration'}
            <small>Fictional records · No live banking</small>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <span>
            WORKSPACE / <strong>{page.toUpperCase()}</strong>
          </span>
          <a className="textbutton" href="/api/export" download>
            <Download size={16} />
            Export snapshot
          </a>
        </div>
        <main>
          <div className="pagehead">
            <div>
              <h1>{page}</h1>
              <p>{summary[page]}</p>
            </div>
            <span className="demo">Sample data</span>
          </div>
          <div className="disclaimer">
            {data.public_demo ? 'Sample data only. Each browser has a separate temporary workspace; records may reset after a restart. No emails or payments are sent.' : 'Changes are saved on this computer. Emails and payments are not sent.'} This is Rachit’s prototype, not TMP’s production CRM.
          </div>
          {error && (
            <div className="error" role="alert">
              <AlertTriangle size={18} />
              {error}
              <button
                className="iconbtn"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {["Rollout & impact", "Staff playbook"].includes(page) && <Enablement page={page} data={data} act={act} busy={busy} />}
          {page === "Workflow centre" && <Workflows data={data} act={act} busy={busy} />}
          {page === "Overview" && (
            <>
              <section className="stats">
                <div>
                  <span>Documents outstanding</span>
                  <strong>{missing}</strong>
                  <small>Across the client checklist</small>
                </div>
                <div>
                  <span>Transactions to review</span>
                  <strong>{unmatched}</strong>
                  <small>Human approval required</small>
                </div>
                <div>
                  <span>Overdue receivables</span>
                  <strong>{overdue.length}</strong>
                  <small>Open invoices past due</small>
                </div>
                <div>
                  <span>Hours used / budget</span>
                  <strong>
                    {hours(used)}
                    <em> / {hours(budget)}</em>
                  </strong>
                  <small>Logged time across all jobs</small>
                </div>
              </section>
              <div className="twocol">
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Review queue</h2>
                    {tag("Next actions", "teal")}
                  </div>
                  {[
                    [
                      "Finish client onboarding",
                      `${missing} documents still outstanding`,
                      "Clients & leads",
                      Users,
                    ],
                    [
                      "Reconcile bank activity",
                      `${unmatched} transactions awaiting review`,
                      "Reconciliation",
                      ArrowLeftRight,
                    ],
                    [
                      "Check payable invoices",
                      `${pending.length} bills pending approval`,
                      "Invoices",
                      Receipt,
                    ],
                  ].map(([title, sub, to, I]) => (
                    <button
                      className="queue"
                      key={title}
                      onClick={() => {
                        setPage(to);
                        if (to === "Invoices") setKind("AP");
                      }}
                    >
                      <div className="queueicon">
                        <I size={22} />
                      </div>
                      <div>
                        <strong>{title}</strong>
                        <small>{sub}</small>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                  ))}
                </section>
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Job capacity</h2>
                    <button
                      className="link"
                      onClick={() => setPage("Jobs & time")}
                    >
                      View jobs
                    </button>
                  </div>
                  {data.jobs.map((j) => (
                    <div className="capacity" key={j.id}>
                      <div>
                        <strong>{j.name}</strong>
                        <span>
                          {hours(j.used_minutes)} / {hours(j.budget_minutes)} h
                        </span>
                      </div>
                      <progress
                        value={j.used_minutes}
                        max={Math.max(j.budget_minutes, j.used_minutes)}
                        className={
                          j.used_minutes > j.budget_minutes ? "over" : ""
                        }
                      />
                      <small>
                        {j.client_name}
                        {j.used_minutes > j.budget_minutes
                          ? " · Over budget"
                          : ""}
                      </small>
                    </div>
                  ))}
                </section>
              </div>
              <section className="panel">
                <div className="sectionhead">
                  <h2>Built for review, not blind automation</h2>
                </div>
                <div className="principles">
                  <div>
                    <b>01</b>
                    <h3>Connect the work</h3>
                    <p>
                      Clients, onboarding, jobs and time in one working
                      demonstration.
                    </p>
                  </div>
                  <div>
                    <b>02</b>
                    <h3>Make exceptions visible</h3>
                    <p>
                      Duplicate bills and ambiguous transaction matches stay in
                      a review queue.
                    </p>
                  </div>
                  <div>
                    <b>03</b>
                    <h3>Keep decisions traceable</h3>
                    <p>
                      Approvals and changes appear in the local activity log.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
          {page === "Clients & leads" && (
            <>
              <div className="toolbar">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search clients"
                    placeholder="Search clients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button className="primary" onClick={() => setModal("client")}>
                  <Plus size={17} />
                  Add client
                </button>
              </div>
              <div className="clientgrid">
                {data.clients
                  .filter((c) =>
                    (c.name + " " + c.service)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <section className="panel client" key={c.id}>
                      <div className="sectionhead">
                        <span className="avatar">
                          {c.name.slice(0, 2).toUpperCase()}
                        </span>
                        {tag(c.stage, c.stage === "Active" ? "teal" : "amber")}
                      </div>
                      <h2>{c.name}</h2>
                      <p>{c.service}</p>
                      <small>{c.email}</small>
                      <div className="checklist">
                        <h3>Document checklist</h3>
                        {c.documents.map((d, i) => (
                          <label key={d.name}>
                            <input
                              type="checkbox"
                              checked={d.received}
                              disabled={busy}
                              onChange={(e) =>
                                act(
                                  `clients/${c.id}/document`,
                                  { index: i, received: e.target.checked },
                                  "Checklist updated",
                                )
                              }
                            />
                            <span>{d.name}</span>
                          </label>
                        ))}
                      </div>
                      <div className="cardfoot">
                        <select
                          aria-label={"Stage for " + c.name}
                          value={c.stage}
                          disabled={busy}
                          onChange={(e) =>
                            act(
                              `clients/${c.id}/stage`,
                              { stage: e.target.value },
                              "Stage updated",
                            )
                          }
                        >
                          {["Lead", "Onboarding", "Active"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <button
                          disabled={
                            busy || c.documents.every((d) => d.received)
                          }
                          onClick={() =>
                            act(
                              `clients/${c.id}/reminder`,
                              {},
                              "Reminder drafted",
                              "Reminder drafts",
                            )
                          }
                        >
                          Draft reminder
                        </button>
                      </div>
                    </section>
                  ))}
              </div>
            </>
          )}
          {page === "Jobs & time" && (
            <>
              <div className="toolbar">
                <span>{data.jobs.length} jobs · staff time in hours</span>
                <div>
                  <button onClick={() => setModal("job")}>
                    <Plus size={16} />
                    New job
                  </button>
                  <button className="primary" onClick={() => setModal("time")}>
                    <Clock size={16} />
                    Log time
                  </button>
                </div>
              </div>
              <section className="panel">
                {table(
                  ["Job / client", "Budget", "Used", "Remaining", "Progress"],
                  data.jobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        <strong>{j.name}</strong>
                        <small>{j.client_name}</small>
                      </td>
                      <td>{hours(j.budget_minutes)} h</td>
                      <td>{hours(j.used_minutes)} h</td>
                      <td>
                        {j.budget_minutes - j.used_minutes < 0
                          ? tag(
                              `${hours(j.used_minutes - j.budget_minutes)} h over`,
                              "red",
                            )
                          : `${hours(j.budget_minutes - j.used_minutes)} h`}
                      </td>
                      <td>
                        <progress
                          value={j.used_minutes}
                          max={Math.max(j.used_minutes, j.budget_minutes)}
                        />
                      </td>
                    </tr>
                  )),
                )}
              </section>
              <section className="panel">
                <div className="sectionhead">
                  <h2>Time entries</h2>
                </div>
                {table(
                  ["Date", "Staff", "Job", "Time", "Note"],
                  data.time_entries.map((t) => (
                    <tr key={t.id}>
                      <td>{t.work_date}</td>
                      <td>{t.staff}</td>
                      <td>{data.jobs.find((j) => j.id === t.job_id)?.name}</td>
                      <td>{hours(t.minutes)} h</td>
                      <td>{t.note || "—"}</td>
                    </tr>
                  )),
                )}
              </section>
            </>
          )}
          {page === "Reconciliation" && (
            <>
              <div className="toolbar">
                <span>Compare, investigate, then approve.</span>
                <button
                  onClick={() => {
                    setImportRows([]);
                    setModal("import");
                  }}
                >
                  <Plus size={16} />
                  Import CSV
                </button>
              </div>
              <div className="notice">
                <ShieldCheck size={20} />
                <div>
                  <strong>Rules propose. Accountants decide.</strong>
                  <p>
                    Equal signed amount and currency, within 3 days. References
                    help prioritize. No automatic ledger posting.
                  </p>
                </div>
              </div>
              <div className="toolbar">
                <span>
                  {data.bank.length - data.bank.filter((b) => !b.match).length}{" "}
                  of {data.bank.length} transactions matched
                </span>
                {tag("CAD / USD kept separate", "teal")}
              </div>
              {data.bank.map((b) => (
                <section
                  className={
                    "panel reconciliation " + (b.match ? "matched" : "")
                  }
                  key={b.id}
                >
                  <div className="transaction">
                    <div>
                      <small>
                        {b.txn_date} · {b.id}
                      </small>
                      <h3>{b.description}</h3>
                      <span>Reference: {b.reference || "Not supplied"}</span>
                    </div>
                    <div className="amount">
                      <strong>{currency(b.amount_cents, b.currency)}</strong>
                      {tag(
                        b.match
                          ? "Matched"
                          : b.candidates.length === 0
                            ? "No candidate"
                            : b.candidates.length > 1
                              ? "Ambiguous"
                              : "Review",
                        b.match
                          ? "teal"
                          : b.candidates.length > 1
                            ? "amber"
                            : "",
                      )}
                    </div>
                  </div>
                  {b.match ? (
                    <div className="matchresult">
                      <span>
                        <Check size={17} />
                        Matched to {b.match.ledger_id}. Approved{" "}
                        {new Date(b.match.approved_at).toLocaleString()}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(`matches/${b.id}/undo`, {}, "Match reversed")
                        }
                      >
                        Undo match
                      </button>
                    </div>
                  ) : b.candidates.length ? (
                    <div className="candidates">
                      {b.candidates.map((l) => (
                        <div className="candidate" key={l.id}>
                          <div>
                            <strong>
                              {l.description} <small>{l.id}</small>
                            </strong>
                            <small>{l.reason}</small>
                          </div>
                          <button
                            disabled={busy}
                            onClick={() =>
                              setModal({ type: "match", bank: b, ledger: l })
                            }
                          >
                            Review match
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="nomatch">
                      No eligible ledger entry. Investigate the original
                      records; this demo does not create balancing entries.
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
          {page === "Invoices" && (
            <>
              <div className="toolbar">
                <div className="tabs" role="tablist" aria-label="Invoice type">
                  {[
                    ["AR", "Receivables"],
                    ["AP", "Payables"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      role="tab"
                      aria-selected={kind === v}
                      className={kind === v ? "active" : ""}
                      onClick={() => setKind(v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <button className="primary" onClick={() => setModal("invoice")}>
                  <Plus size={16} />
                  Add invoice
                </button>
              </div>
              <div className="notice">
                <Receipt size={20} />
                <p>
                  {kind === "AP"
                    ? "Potential duplicates are blocked until reviewed. Approval records a decision only; it never initiates payment."
                    : "Reminders are generated from fixed templates for review. An invoice stays open until a real settlement integration is added."}
                </p>
              </div>
              <section className="panel">
                {table(
                  [
                    "Reference / party",
                    "Amount",
                    "Due date",
                    "Status",
                    "Action",
                  ],
                  data.invoices
                    .filter((i) => i.kind === kind)
                    .map((i) => (
                      <tr key={i.id}>
                        <td>
                          <strong>{i.reference}</strong>
                          <small>{i.party}</small>
                        </td>
                        <td>{currency(i.amount_cents, i.currency)}</td>
                        <td>{i.due_date}</td>
                        <td>
                          {tag(
                            i.duplicate ? "Potential duplicate" : i.status,
                            i.duplicate
                              ? "red"
                              : i.status === "Approved"
                                ? "teal"
                                : "",
                          )}
                          {i.kind === "AR" &&
                            i.due_date < data.today &&
                            tag("Overdue", "amber")}
                        </td>
                        <td>
                          <div className="actions">
                            {i.kind === "AR" ? (
                              <button
                                disabled={busy || i.due_date >= data.today}
                                onClick={() =>
                                  act(
                                    `invoices/${i.id}/reminder`,
                                    {},
                                    "Payment reminder drafted",
                                    "Reminder drafts",
                                  )
                                }
                              >
                                Draft reminder
                              </button>
                            ) : i.status === "Review" ? (
                              <>
                                <button
                                  disabled={busy || i.duplicate}
                                  onClick={() =>
                                    setModal({ type: "approve", invoice: i })
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  className="danger"
                                  disabled={busy}
                                  onClick={() =>
                                    setModal({ type: "reject", invoice: i })
                                  }
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span>Review complete</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )),
                )}
              </section>
            </>
          )}
          {page === "Reminder drafts" && (
            <>
              <div className="toolbar">
                <span>
                  Prepare outstanding-document and overdue-invoice reminders.
                </span>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "automations/followups",
                      {},
                      "Follow-up batch complete — drafts only",
                    )
                  }
                >
                  Run follow-up batch
                </button>
              </div>
              <div className="notice">
                <Send size={20} />
                <div>
                  <strong>Outbox preview — sending is not connected</strong>
                  <p>
                    Repeated requests for the same reminder today reuse its
                    draft. Review the recipient and current records before using
                    a message.
                  </p>
                </div>
              </div>
              {data.drafts.length ? (
                data.drafts.map((d) => (
                  <section key={d.id} className="panel draft">
                    <div className="sectionhead">
                      <div>
                        <h2>{d.subject}</h2>
                        <small>To: {d.recipient}</small>
                      </div>
                      {tag(
                        d.status,
                        d.status === "Reviewed" ? "teal" : "amber",
                      )}
                    </div>
                    <pre>{d.body}</pre>
                    <div className="cardfoot">
                      <small>
                        Created {new Date(d.created_at).toLocaleString()}
                      </small>
                      <div>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(d.body);
                              setNotice("Draft copied");
                            } catch {
                              setError(
                                "Copy is unavailable. Select the draft text to copy it.",
                              );
                            }
                          }}
                        >
                          Copy text
                        </button>
                        <button
                          className="primary"
                          disabled={busy || d.status === "Reviewed"}
                          onClick={() =>
                            act(
                              `drafts/${d.id}/approve`,
                              {},
                              "Marked reviewed — not sent",
                            )
                          }
                        >
                          Mark reviewed
                        </button>
                      </div>
                    </div>
                  </section>
                ))
              ) : (
                <Empty>
                  Generate a reminder from a client checklist or an overdue
                  invoice.
                </Empty>
              )}
            </>
          )}
          {page === "Knowledge desk" && (
            <>
              <div className="notice">
                <BookOpen size={20} />
                <div>
                  <strong>
                    {data.knowledge_model_configured
                      ? "AI connected · semantic source search available"
                      : "Semantic source search available · AI model not connected"}
                  </strong>
                  <p>
                    The included procedure is synthetic, not tax law. Add
                    reviewed sources to explore retrieval. Generated answers
                    always require accountant review.
                  </p>
                </div>
              </div>
              <div className="twocol knowledge">
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Ask your sources</h2>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      setAsking(true);
                      setAnswer(null);
                      setError("");
                      try {
                        setAnswer(
                          await api("knowledge/ask", {
                            question: f.question,
                            jurisdiction: f.jurisdiction,
                            tax_year: Number(f.tax_year),
                            use_model: f.use_model === "on",
                            retrieval: f.retrieval,
                          }),
                        );
                      } catch (e) {
                        setError(e.message);
                      } finally {
                        setAsking(false);
                      }
                    }}
                  >
                    <div className="formrow">
                      <Field label="Jurisdiction">
                        <select name="jurisdiction">
                          <option value="CA">Canada</option>
                          <option value="US">United States</option>
                        </select>
                      </Field>
                      <Field label="Tax year">
                        <input
                          name="tax_year"
                          type="number"
                          min="2000"
                          max="2100"
                          defaultValue="2026"
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Search method">
                      <select name="retrieval"><option value="semantic">Semantic search — meaning and context</option><option value="keyword">Keyword search — exact terms</option></select>
                    </Field>
                    <Field label="Question">
                      <textarea
                        name="question"
                        rows="4"
                        minLength="3"
                        maxLength="1500"
                        required
                        defaultValue="Which documents are required for onboarding?"
                      />
                    </Field>
                    <label className="check">
                      <input
                        type="checkbox"
                        name="use_model"
                        disabled={!data.knowledge_model_configured}
                      />
                      {data.public_demo ? "Draft with cloud AI — sends your question and retrieved passages" : "Draft an answer with AI using retrieved sources"}
                    </label>
                    <button className="primary" disabled={asking}>
                      {asking
                        ? "Searching sources…"
                        : "Search approved sources"}
                    </button>
                  </form>
                  {answer && (
                    <div className="answer" aria-live="polite">
                      <h3>{answer.mode}</h3>
                      <p className="preserve">{answer.answer}</p>
                      {answer.citations.map((s) => (
                        <div className="citation" key={s.chunk_id || s.id}>
                          <b>
                            [{s.chunk_id || s.id}] {s.title}
                          </b>
                          <p>{s.excerpt}</p>
                          {s.score != null && <small>Semantic similarity: {s.score.toFixed(3)} · {s.jurisdiction} · {s.tax_year}</small>}
                          {s.source_url && (
                            <a
                              href={s.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View source
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="sectionhead">
                    <h2>Source library</h2>
                    <button onClick={() => setModal("source")}>
                      <Plus size={16} />
                      Add source
                    </button>
                  </div>
                  <button disabled={busy} onClick={() => act("knowledge/official-sources", {}, "CRA and IRS reference summaries added")}>Add CRA / IRS references</button>
                  <button disabled={busy} onClick={() => act("knowledge/index", {}, "Vector index updated")}>Build / update vector index</button>
                  {data.sources.map((s) => (
                    <div className="source" key={s.id}>
                      <button
                        className="sourcebtn"
                        onClick={() =>
                          setExpanded(expanded === s.id ? null : s.id)
                        }
                      >
                        <FileText size={19} />
                        <div>
                          <strong>{s.title}</strong>
                          <small>
                            {s.jurisdiction} · {s.tax_year} ·{" "}
                            {s.approved
                              ? "Approved for demo retrieval"
                              : "Not approved"}
                          </small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                      {expanded === s.id && (
                        <p className="preserve">{s.body}</p>
                      )}
                    </div>
                  ))}
                  <p className="muted">
                    Approved sources are split into passages and stored in Qdrant with semantic embeddings. Search filters by country and tax year. Similarity and citations still need accountant review; CRA / IRS reference summaries are available above. They were checked October 5, 2026 and indexed under 2026 for discovery; this is not a complete tax-law corpus or confirmation of year-specific applicability.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === "Activity log" && (
            <section className="panel">
              {table(
                ["When", "Event", "Details"],
                data.audit.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">
                      {new Date(a.at).toLocaleString()}
                    </td>
                    <td>
                      <strong>{a.action}</strong>
                    </td>
                    <td>{a.detail}</td>
                  </tr>
                )),
              )}
              <p className="muted pad">
                Local development log, not a tamper-proof audit system. Latest
                100 entries shown.
              </p>
            </section>
          )}
          <footer>
            Accounting Workbench · Built by Rachit Raj{" "}
            <span>Demonstration, not a production accounting system</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {modal && (
        <Modal
          title={
            typeof modal === "object"
              ? modal.type === "match"
                ? "Approve this match?"
                : modal.type === "reject"
                  ? "Reject payable invoice?"
                  : "Approve payable invoice?"
              : {
                  client: "Add a sample client",
                  job: "Create a job",
                  time: "Log staff time",
                  invoice: "Record an invoice",
                  source: "Add a reviewed source",
                  import: "Import sample transactions",
                }[modal]
          }
          close={() => setModal(null)}
        >
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {modal === "client" && (
            <Form
              busy={busy}
              onSubmit={(f) => act("clients", f, "Client created")}
            >
              <Field label="Client name">
                <input
                  name="name"
                  required
                  minLength="2"
                  maxLength="120"
                  placeholder="Example Studio (sample)"
                />
              </Field>
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="finance@example.test"
                />
              </Field>
              <Field label="Service">
                <input
                  name="service"
                  required
                  minLength="2"
                  placeholder="Monthly bookkeeping"
                />
              </Field>
            </Form>
          )}
          {modal === "job" && (
            <Form
              busy={busy}
              onSubmit={(f) =>
                act(
                  "jobs",
                  {
                    client_id: f.client_id,
                    name: f.name,
                    budget_minutes: Math.round(Number(f.hours) * 60),
                  },
                  "Job created",
                )
              }
            >
              <Field label="Client">
                <select name="client_id">
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Job name">
                <input name="name" required minLength="2" />
              </Field>
              <Field label="Budget (hours)">
                <input
                  name="hours"
                  type="number"
                  min="0.25"
                  max="10000"
                  step="0.25"
                  required
                  defaultValue="10"
                />
              </Field>
            </Form>
          )}
          {modal === "time" && (
            <Form
              busy={busy}
              onSubmit={(f) =>
                act(
                  "time",
                  {
                    job_id: f.job_id,
                    staff: f.staff,
                    minutes: Math.round(Number(f.hours) * 60),
                    work_date: f.work_date,
                    note: f.note,
                  },
                  "Time logged",
                )
              }
            >
              <Field label="Job">
                <select name="job_id">
                  {data.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name} — {j.client_name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="formrow">
                <Field label="Staff name">
                  <input name="staff" required minLength="2" />
                </Field>
                <Field label="Hours">
                  <input
                    name="hours"
                    type="number"
                    required
                    min="0.25"
                    max="24"
                    step="0.25"
                    defaultValue="1"
                  />
                </Field>
              </div>
              <Field label="Date">
                <input
                  name="work_date"
                  type="date"
                  required
                  max={data.today}
                  defaultValue={data.today}
                />
              </Field>
              <Field label="Note">
                <input name="note" maxLength="500" />
              </Field>
            </Form>
          )}
          {modal === "invoice" && (
            <Form
              busy={busy}
              onSubmit={(f) =>
                act(
                  "invoices",
                  {
                    kind: f.kind,
                    party: f.party,
                    reference: f.reference,
                    amount_cents: Math.round(Number(f.amount) * 100),
                    currency: f.currency,
                    due_date: f.due_date,
                  },
                  "Invoice recorded",
                )
              }
            >
              <Field label="Type">
                <select name="kind" defaultValue={kind}>
                  <option value="AR">Receivable</option>
                  <option value="AP">Payable</option>
                </select>
              </Field>
              <Field label="Client / supplier">
                <input name="party" required minLength="2" list="parties" />
                <datalist id="parties">
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Invoice reference">
                <input name="reference" required maxLength="60" />
              </Field>
              <div className="formrow">
                <Field label="Amount">
                  <input
                    name="amount"
                    required
                    type="number"
                    min="0.01"
                    max="100000000"
                    step="0.01"
                  />
                </Field>
                <Field label="Currency">
                  <select name="currency">
                    <option>CAD</option>
                    <option>USD</option>
                  </select>
                </Field>
              </div>
              <Field label="Due date">
                <input
                  name="due_date"
                  type="date"
                  required
                  defaultValue={data.today}
                />
              </Field>
            </Form>
          )}

          {modal === "import" && (
            <Form
              busy={busy}
              submit="Import transactions"
              onSubmit={(f) => {
                if (!importRows.length) {
                  setError("Choose a CSV file with at least one row");
                  return;
                }
                act(
                  "transactions/import",
                  { target: f.target, transactions: importRows },
                  "Transactions imported",
                );
              }}
            >
              <p className="muted">
                Required columns: id, description, reference, amount_cents,
                currency, txn_date. Signed amounts are integer cents; dates use
                YYYY-MM-DD. Same IDs with identical data are skipped.
              </p>
              <Field label="Import into">
                <select name="target">
                  <option value="bank">Bank transactions</option>
                  <option value="ledger">Ledger entries</option>
                </select>
              </Field>
              <Field label="Sample CSV file">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={async (e) => {
                    setImportRows([]);
                    setError("");
                    try {
                      const f = e.target.files[0];
                      if (!f) return;
                      if (f.size > 1000000)
                        throw Error("File must be smaller than 1 MB");
                      setImportRows(parseTransactions(await f.text()));
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                />
              </Field>
              <p>{importRows.length} rows ready to import</p>
            </Form>
          )}
          {modal === "source" && (
            <Form
              busy={busy}
              onSubmit={(f) =>
                act(
                  "sources",
                  {
                    title: f.title,
                    jurisdiction: f.jurisdiction,
                    tax_year: Number(f.tax_year),
                    body: f.body,
                    source_url: f.source_url,
                    approved: f.approved === "on",
                  },
                  "Source added",
                )
              }
            >
              <p className="muted">
                Use sample or approved public text only. Adding a source does
                not verify its accuracy or legal authority.
              </p>
              <Field label="Source title">
                <input name="title" minLength="3" maxLength="200" required />
              </Field>
              <div className="formrow">
                <Field label="Jurisdiction">
                  <select name="jurisdiction">
                    <option value="CA">Canada</option>
                    <option value="US">United States</option>
                  </select>
                </Field>
                <Field label="Tax year">
                  <input
                    name="tax_year"
                    type="number"
                    min="2000"
                    max="2100"
                    defaultValue="2026"
                    required
                  />
                </Field>
              </div>
              <Field label="Source URL (optional)">
                <input name="source_url" type="url" placeholder="https://…" />
              </Field>
              <Field label="Source text">
                <textarea
                  name="body"
                  rows="7"
                  required
                  minLength="20"
                  maxLength="30000"
                />
              </Field>
              <label className="check">
                <input name="approved" type="checkbox" />
                Mark this source approved for demo retrieval
              </label>
            </Form>
          )}
          {typeof modal === "object" && modal.type === "match" && (
            <>
              <p>Confirm you have checked these sample records.</p>
              <div className="reviewbox">
                <b>Bank: {modal.bank.description}</b>
                <p>
                  {currency(modal.bank.amount_cents, modal.bank.currency)} ·{" "}
                  {modal.bank.reference || "No reference"}
                </p>
                <b>Ledger: {modal.ledger.description}</b>
                <p>
                  {currency(modal.ledger.amount_cents, modal.ledger.currency)} ·{" "}
                  {modal.ledger.reference}
                </p>
              </div>
              {!modal.ledger.reference_match && (
                <div className="notice">
                  References do not match. Equal amounts alone do not establish
                  a correct match.
                </div>
              )}
              <div className="formfoot">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "matches",
                      { bank_id: modal.bank.id, ledger_id: modal.ledger.id },
                      "Match approved",
                    )
                  }
                >
                  Approve sample match
                </button>
              </div>
            </>
          )}
          {typeof modal === "object" &&
            ["approve", "reject"].includes(modal.type) && (
              <>
                <p>
                  {modal.invoice.reference} · {modal.invoice.party}
                </p>
                <h2>
                  {currency(modal.invoice.amount_cents, modal.invoice.currency)}
                </h2>
                <p>
                  {modal.type === "approve"
                    ? "This records an approval only. No payment will be made."
                    : "Reject this pending record. It remains in the activity history."}
                </p>
                <div className="formfoot">
                  <button
                    disabled={busy}
                    className={modal.type === "reject" ? "danger" : "primary"}
                    onClick={() =>
                      act(
                        `invoices/${modal.invoice.id}/${modal.type}`,
                        {},
                        modal.type === "reject"
                          ? "Invoice rejected"
                          : "Invoice approved — no payment sent",
                      )
                    }
                  >
                    Confirm {modal.type === "reject" ? "rejection" : "approval"}
                  </button>
                </div>
              </>
            )}
        </Modal>
      )}
    </div>
  );
}

function parseTransactions(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("CSV has an unclosed quoted field");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = (rows.shift() || []).map((x) => x.trim());
  const expected = [
    "id",
    "description",
    "reference",
    "amount_cents",
    "currency",
    "txn_date",
  ];
  if (header.length !== 6 || !expected.every((k) => header.includes(k)))
    throw Error("CSV columns must be: " + expected.join(", "));
  if (!rows.length || rows.length > 1000)
    throw Error("Import between 1 and 1,000 rows");
  return rows.map((r, i) => {
    if (r.length !== header.length)
      throw Error("Incorrect column count on row " + (i + 2));
    const o = Object.fromEntries(header.map((h, j) => [h, r[j].trim()]));
    if (!/^-?\d+$/.test(o.amount_cents))
      throw Error("amount_cents must be an integer on row " + (i + 2));
    o.amount_cents = Number(o.amount_cents);
    return o;
  });
}
