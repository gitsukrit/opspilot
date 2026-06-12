import React, { useState, useRef } from "react";
import { Zap, ShieldAlert, UserCheck, CheckCircle2, Inbox, ScrollText, Play, Loader2, ArrowRight, Pencil, AlertTriangle } from "lucide-react";

// ---------- Synthetic ticket data (travel/e-commerce support) ----------
const SEED_TICKETS = [
  { id: "T-1041", from: "Marta K.", tier: "Standard", amount: 0, subject: "How do I change the dates on my booking?", body: "Hi, I booked a hotel in Lisbon for July 12-15 and need to move it one week later. Can I do that in the app? Thanks!" },
  { id: "T-1042", from: "Daniel O.", tier: "Genius L2", amount: 450, subject: "Refund for cancelled flight + hotel package", body: "My flight was cancelled by the airline and I couldn't reach the hotel. I want a full refund of €450 for the package. I have the cancellation confirmation from the airline." },
  { id: "T-1043", from: "Priya S.", tier: "Standard", amount: 89, subject: "Charged twice for the same reservation", body: "I see two charges of €89 on my card for booking #88231. One of them must be a mistake. Please fix this." },
  { id: "T-1044", from: "Jonas W.", tier: "Standard", amount: 612, subject: "Filing a chargeback if this isn't resolved", body: "Third email now. The apartment was nothing like the photos and host refused to help. Refund my €612 or I will file a chargeback with my bank and contact my lawyer." },
  { id: "T-1045", from: "Aiko T.", tier: "Genius L3", amount: 0, subject: "Can't log in after changing my email", body: "I updated my account email yesterday and now the verification link never arrives. I've checked spam. I have a trip in 3 days and need access to my booking confirmation." },
  { id: "T-1046", from: "Sam B.", tier: "Standard", amount: 35, subject: "Late checkout fee seems wrong", body: "I was charged €35 for late checkout but I left the room at 11:02 and checkout is 11:00. Two minutes! Can this be waived?" },
  { id: "T-1047", from: "Lucia M.", tier: "Standard", amount: 0, subject: "Where is my invoice for a business trip?", body: "I need an invoice with my company's VAT number for booking #77120 to submit expenses. How do I get one?" },
  { id: "T-1048", from: "Omar R.", tier: "Genius L1", amount: 1280, subject: "Suspicious booking I never made", body: "There is a €1,280 reservation in Bangkok on my account that I never made. I think my account was hacked. Please freeze everything and investigate." },
];

// ---------- Deterministic rules layer (runs AFTER AI triage) ----------
const RULES = [
  { id: "R-01", label: "Legal / chargeback language", desc: "Keywords: chargeback, lawyer, legal, lawsuit, fraud, hacked", lane: "escalated" },
  { id: "R-02", label: "AI risk score ≥ 70", desc: "High financial / reputational exposure per AI assessment", lane: "escalated" },
  { id: "R-03", label: "Refund exposure > €200", desc: "Amounts above autonomous-resolution authority", lane: "review" },
  { id: "R-04", label: "AI confidence < 0.75", desc: "Model is unsure — route to a person", lane: "review" },
  { id: "R-05", label: "Default", desc: "Low risk + high confidence → auto-resolve with AI draft", lane: "auto" },
];

const LEGAL_RX = /(chargeback|lawyer|legal|lawsuit|fraud|hacked)/i;

function applyRules(ticket, ai) {
  if (LEGAL_RX.test(ticket.subject + " " + ticket.body)) return { lane: "escalated", rule: RULES[0] };
  if (ai.risk_score >= 70) return { lane: "escalated", rule: RULES[1] };
  if (ticket.amount > 200) return { lane: "review", rule: RULES[2] };
  if (ai.confidence < 0.75) return { lane: "review", rule: RULES[3] };
  return { lane: "auto", rule: RULES[4] };
}

// ---------- AI triage call ----------
async function triageWithAI(ticket) {
  const prompt = `You are the AI triage engine inside a customer-support operations console for a travel booking platform. Analyze the ticket below.

Respond ONLY with raw JSON. No markdown fences, no preamble, no trailing text. Schema:
{"intent": "<3-6 word label>", "sentiment": "positive|neutral|negative", "risk_score": <integer 0-100>, "confidence": <number 0.0-1.0>, "suggested_action": "<one short sentence>", "draft_reply": "<2-3 sentence customer-facing reply, warm and concrete>", "reasoning": "<one short sentence on routing risk>"}

risk_score reflects financial, legal, fraud, and reputational exposure (a simple FAQ ≈ 5-15; an angry refund demand ≈ 40-60; legal threats or suspected fraud ≈ 75-95).
confidence reflects how certain you are that your classification and draft are safe to send without human review.

TICKET ${ticket.id}
From: ${ticket.from} (${ticket.tier})
Amount at stake: €${ticket.amount}
Subject: ${ticket.subject}
Body: ${ticket.body}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------- Small UI atoms ----------
const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

function Chip({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-rose-50 text-rose-800 border-rose-200",
    navy: "bg-indigo-50 text-indigo-800 border-indigo-200",
  };
  return <span className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-xs ${tones[tone]}`} style={MONO}>{children}</span>;
}

function riskTone(r) { return r >= 70 ? "red" : r >= 40 ? "amber" : "green"; }

const LANES = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "auto", label: "Auto-resolved", icon: Zap },
  { key: "review", label: "Human review", icon: UserCheck },
  { key: "escalated", label: "Escalated", icon: ShieldAlert },
  { key: "resolved", label: "Closed", icon: CheckCircle2 },
];

export default function OpsPilot() {
  const [tickets, setTickets] = useState(SEED_TICKETS.map(t => ({ ...t, lane: "inbox", ai: null, rule: null, trace: [], busy: false, editing: false, editText: "" })));
  const [activeLane, setActiveLane] = useState("inbox");
  const [audit, setAudit] = useState([]);
  const [runningAll, setRunningAll] = useState(false);
  const auditRef = useRef(null);

  const log = (msg) => setAudit(a => [{ ts: new Date().toLocaleTimeString(), msg }, ...a]);

  const patch = (id, fields) => setTickets(ts => ts.map(t => (t.id === id ? { ...t, ...fields } : t)));

  async function triageOne(id) {
    const ticket = tickets.find(t => t.id === id);
    if (!ticket || ticket.busy) return;
    patch(id, { busy: true });
    log(`${id} → AI triage started`);
    try {
      const ai = await triageWithAI(ticket);
      const { lane, rule } = applyRules(ticket, ai);
      const trace = [
        `AI: ${ai.intent} · risk ${ai.risk_score} · conf ${Math.round(ai.confidence * 100)}%`,
        `Rule ${rule.id}: ${rule.label}`,
        `→ ${lane === "auto" ? "Auto-resolved" : lane === "review" ? "Human review" : "Escalated"}`,
      ];
      patch(id, { ai, rule, lane, trace, busy: false, editText: ai.draft_reply });
      log(`${id} routed to ${lane.toUpperCase()} by ${rule.id} (risk ${ai.risk_score}, conf ${Math.round(ai.confidence * 100)}%)`);
    } catch (e) {
      patch(id, { busy: false });
      log(`${id} ✕ triage failed (${e.message}) — left in Inbox`);
    }
  }

  async function triageAll() {
    setRunningAll(true);
    const pending = tickets.filter(t => t.lane === "inbox").map(t => t.id);
    for (const id of pending) { await triageOne(id); }
    setRunningAll(false);
  }

  function approve(id) {
    patch(id, { lane: "resolved", editing: false });
    log(`${id} ✓ human approved AI draft → Closed`);
  }
  function saveEdit(id) {
    const t = tickets.find(x => x.id === id);
    patch(id, { lane: "resolved", editing: false, ai: { ...t.ai, draft_reply: t.editText } });
    log(`${id} ✎ human edited reply, sent → Closed`);
  }
  function escalateManually(id) {
    patch(id, { lane: "escalated" });
    log(`${id} ⚠ human escalated from review queue`);
  }

  // ---------- Metrics ----------
  const triaged = tickets.filter(t => t.ai).length;
  const autoCount = tickets.filter(t => t.lane === "auto").length + tickets.filter(t => t.lane === "resolved" && t.rule?.id === "R-05").length;
  const intercepts = tickets.filter(t => t.rule && t.rule.id !== "R-05").length;
  const closed = tickets.filter(t => t.lane === "resolved").length;
  const minutesSaved = autoCount * 8 + closed * 4;
  const deflection = triaged ? Math.round((autoCount / triaged) * 100) : 0;

  const laneTickets = tickets.filter(t => t.lane === activeLane);
  const counts = Object.fromEntries(LANES.map(l => [l.key, tickets.filter(t => t.lane === l.key).length]));

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-300 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-bold tracking-tight">OpsPilot</h1>
              <span className="text-xs text-slate-500" style={MONO}>v0.1 · demo data</span>
            </div>
            <p className="text-sm text-slate-600">AI-led, human-orchestrated support triage — AI drafts, rules intercept, people decide.</p>
          </div>
          <button
            onClick={triageAll}
            disabled={runningAll || counts.inbox === 0}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {runningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {runningAll ? "Triaging…" : `Run AI triage on inbox (${counts.inbox})`}
          </button>
        </div>
        {/* Metrics strip */}
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="max-w-6xl mx-auto px-5 py-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs" style={MONO}>
            <div>TRIAGED <span className="font-bold text-slate-900 ml-1">{triaged}/{tickets.length}</span></div>
            <div>DEFLECTION <span className="font-bold text-emerald-700 ml-1">{deflection}%</span></div>
            <div>RULE INTERCEPTS <span className="font-bold text-amber-700 ml-1">{intercepts}</span></div>
            <div>CLOSED <span className="font-bold text-slate-900 ml-1">{closed}</span></div>
            <div>EST. MIN SAVED <span className="font-bold text-indigo-700 ml-1">{minutesSaved}</span></div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: lanes + tickets */}
        <section className="lg:col-span-2">
          <div className="flex flex-wrap gap-1 mb-3">
            {LANES.map(l => {
              const Icon = l.icon;
              const active = activeLane === l.key;
              return (
                <button key={l.key} onClick={() => setActiveLane(l.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"}`}>
                  <Icon className="w-3.5 h-3.5" /> {l.label}
                  <span className={`text-xs ${active ? "text-slate-300" : "text-slate-400"}`} style={MONO}>{counts[l.key]}</span>
                </button>
              );
            })}
          </div>

          {laneTickets.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-lg p-8 text-center text-sm text-slate-500 bg-white">
              {activeLane === "inbox" ? "Inbox is clear. Every ticket has been routed." : "Nothing here yet — run triage from the inbox."}
            </div>
          )}

          <div className="space-y-3">
            {laneTickets.map(t => (
              <article key={t.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400" style={MONO}>{t.id}</span>
                      <h3 className="font-semibold text-sm">{t.subject}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{t.from} · {t.tier}{t.amount > 0 ? ` · €${t.amount} at stake` : ""}</p>
                  </div>
                  {t.lane === "inbox" && (
                    <button onClick={() => triageOne(t.id)} disabled={t.busy}
                      className="inline-flex items-center gap-1.5 text-sm border border-slate-300 px-3 py-1 rounded-md hover:border-slate-500 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {t.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Triage
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-700 mt-2">{t.body}</p>

                {t.ai && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex flex-wrap gap-1.5">
                      <Chip tone="navy">{t.ai.intent}</Chip>
                      <Chip tone={t.ai.sentiment === "negative" ? "red" : t.ai.sentiment === "positive" ? "green" : "slate"}>{t.ai.sentiment}</Chip>
                      <Chip tone={riskTone(t.ai.risk_score)}>risk {t.ai.risk_score}</Chip>
                      <Chip>conf {Math.round(t.ai.confidence * 100)}%</Chip>
                    </div>
                    {/* Signature: decision trace */}
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-600" style={MONO}>
                      {t.trace.map((step, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <ArrowRight className="w-3 h-3 text-slate-400" />}
                          <span className={i === t.trace.length - 1 ? "font-bold text-slate-900" : ""}>{step}</span>
                        </React.Fragment>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 italic">{t.ai.reasoning}</p>

                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-xs font-semibold text-slate-500 mb-1">AI DRAFT REPLY</p>
                      {t.editing ? (
                        <textarea value={t.editText} onChange={e => patch(t.id, { editText: e.target.value })}
                          rows={3} className="w-full text-sm border border-slate-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      ) : (
                        <p className="text-sm text-slate-700">{t.ai.draft_reply}</p>
                      )}
                    </div>

                    {(t.lane === "review" || t.lane === "escalated") && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {t.editing ? (
                          <button onClick={() => saveEdit(t.id)} className="inline-flex items-center gap-1 text-sm bg-emerald-700 text-white px-3 py-1 rounded-md hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"><CheckCircle2 className="w-3.5 h-3.5" /> Send edited reply</button>
                        ) : (
                          <>
                            <button onClick={() => approve(t.id)} className="inline-flex items-center gap-1 text-sm bg-emerald-700 text-white px-3 py-1 rounded-md hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"><CheckCircle2 className="w-3.5 h-3.5" /> Approve & send</button>
                            <button onClick={() => patch(t.id, { editing: true })} className="inline-flex items-center gap-1 text-sm border border-slate-300 px-3 py-1 rounded-md hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                            {t.lane === "review" && (
                              <button onClick={() => escalateManually(t.id)} className="inline-flex items-center gap-1 text-sm border border-rose-300 text-rose-700 px-3 py-1 rounded-md hover:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500"><AlertTriangle className="w-3.5 h-3.5" /> Escalate</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {t.lane === "auto" && (
                      <p className="text-xs text-emerald-700 mt-2 inline-flex items-center gap-1" style={MONO}><Zap className="w-3 h-3" /> sent autonomously under rule {t.rule.id}</p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Right: rules + audit */}
        <aside className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-bold flex items-center gap-1.5 mb-2"><ShieldAlert className="w-4 h-4" /> Routing rules <span className="text-xs font-normal text-slate-400">(deterministic, run after AI)</span></h2>
            <ol className="space-y-2">
              {RULES.map(r => (
                <li key={r.id} className="text-xs">
                  <span className="font-bold" style={MONO}>{r.id}</span>{" "}
                  <span className="font-medium">{r.label}</span>
                  <span className={`ml-1 ${r.lane === "escalated" ? "text-rose-700" : r.lane === "review" ? "text-amber-700" : "text-emerald-700"}`} style={MONO}>→ {r.lane}</span>
                  <p className="text-slate-500">{r.desc}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-bold flex items-center gap-1.5 mb-2"><ScrollText className="w-4 h-4" /> Audit log</h2>
            <div ref={auditRef} className="max-h-80 overflow-y-auto space-y-1.5">
              {audit.length === 0 && <p className="text-xs text-slate-400">Every routing decision and human action is recorded here.</p>}
              {audit.map((e, i) => (
                <p key={i} className="text-xs text-slate-600" style={MONO}><span className="text-slate-400">{e.ts}</span> {e.msg}</p>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">Demo with synthetic tickets. Pattern: AI performs first-pass triage with structured output; a transparent rules layer intercepts by risk, exposure, and confidence; humans review what matters. Built by Sukrit Chakravarty.</p>
        </aside>
      </main>
    </div>
  );
}
