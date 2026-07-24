"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { usePhase } from "@/components/layout/PhaseProvider";
import { PhaseSelect } from "@/components/layout/PhaseSelect";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Stars } from "@/components/ui/Stars";
import { StatCard, DonutChart, BarList } from "@/components/dashboard/charts";
import {
  scopeFeedback,
  feedbackOverview,
  aggregateBatches,
  byClass,
  ratingDistribution,
  batchClassMatrix,
  RATING_LABELS,
  dateKey,
  dateLabel,
  distinctDates,
  collectComments,
  commentClasses,
} from "@/lib/feedback";
import { downloadFeedbackExcel, downloadCommentsExcel } from "@/lib/feedbackExport";
import { downloadFeedbackPdf, downloadCommentsPdf } from "@/lib/feedbackPdf";
import { canManageUsers, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const FIELD =
  "h-10 rounded-full border border-border bg-surface px-4 text-sm text-foreground focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30";

function tone(v) {
  if (v >= 4) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 3) return "text-amber-600 dark:text-amber-400";
  return "text-red-500";
}
function cellTone(v) {
  if (v == null) return "bg-surface-2 text-muted";
  if (v >= 4) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (v >= 3) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-red-500/10 text-red-600 dark:text-red-400";
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { records } = useFeedback();
  const { phase, matches } = usePhase();
  const router = useRouter();

  const [batchF, setBatchF] = useState("all");
  const [dateF, setDateF] = useState("all");
  const [commentClass, setCommentClass] = useState("all");
  const [downloading, setDownloading] = useState(false);

  const scoped = useMemo(
    () => scopeFeedback(user, records).filter((s) => matches(s.createdAt)),
    [user, records, matches],
  );

  // A selected date can fall outside the chosen phase — reset it when phase changes.
  useEffect(() => { setDateF("all"); }, [phase]);

  const batchOptions = useMemo(() => {
    const m = new Map();
    for (const s of scoped) m.set(s.batchSlug, s.batchName);
    return [...m.entries()];
  }, [scoped]);

  const dateOptions = useMemo(() => distinctDates(scoped), [scoped]);

  const filtered = useMemo(
    () =>
      scoped.filter(
        (s) =>
          (batchF === "all" || s.batchSlug === batchF) &&
          (dateF === "all" || dateKey(s.createdAt) === dateF),
      ),
    [scoped, batchF, dateF],
  );

  const overview = useMemo(() => feedbackOverview(filtered), [filtered]);
  const batches = useMemo(() => aggregateBatches(filtered), [filtered]);
  const classRows = useMemo(() => byClass(filtered), [filtered]);
  const dist = useMemo(() => ratingDistribution(filtered), [filtered]);
  const matrix = useMemo(() => batchClassMatrix(filtered), [filtered]);
  const comments = useMemo(() => collectComments(filtered), [filtered]);
  const commentOptions = useMemo(() => commentClasses(comments), [comments]);
  const shownComments = useMemo(
    () => (commentClass === "all" ? comments : comments.filter((c) => c.class === commentClass)),
    [comments, commentClass],
  );

  if (!user) return null;

  const batchLabel = batchF !== "all" ? batchOptions.find(([slug]) => slug === batchF)?.[1] || batchF : "";
  const dateScopeLabel = dateF !== "all" ? dateOptions.find((d) => d.key === dateF)?.label || dateF : "All dates";
  const reportName = `feedback-report${batchF !== "all" ? "-" + batchF : ""}${dateF !== "all" ? "-" + dateF : ""}`;
  const commentsName = `feedback-comments${batchF !== "all" ? "-" + batchF : ""}${commentClass !== "all" ? "-" + commentClass.replace(/\s+/g, "_") : ""}${dateF !== "all" ? "-" + dateF : ""}`;

  const onDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadFeedbackPdf({
        filtered, overview, byBatch: batches, byClassRows: classRows, distribution: dist, matrix,
        context: batchLabel, dateScope: dateScopeLabel,
        filename: `${reportName}.pdf`,
      });
    } finally {
      setDownloading(false);
    }
  };
  const onDownloadExcel = async () => {
    setDownloading(true);
    try {
      await downloadFeedbackExcel({
        filtered, overview, byBatch: batches, byClassRows: classRows, distribution: dist, matrix,
        filename: `${reportName}.xlsx`,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Feedback Analytics</h2>
          <p className="mt-1 text-sm text-muted">Anonymous student feedback by batch and class.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="brand">{roleLabel(user.role)}</Badge>
          <Button variant="secondary" size="sm" onClick={onDownloadExcel} disabled={downloading || filtered.length === 0}>
            ⬇ Excel
          </Button>
          <Button size="sm" onClick={onDownloadPdf} disabled={downloading || filtered.length === 0}>
            {downloading ? "Preparing…" : "⬇ PDF"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <PhaseSelect />
        <select className={FIELD} value={batchF} onChange={(e) => setBatchF(e.target.value)}>
          <option value="all">All batches</option>
          {batchOptions.map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
        <select className={FIELD} value={dateF} onChange={(e) => setDateF(e.target.value)}>
          <option value="all">All dates</option>
          {dateOptions.map((d) => (
            <option key={d.key} value={d.key}>{d.label} ({d.count})</option>
          ))}
        </select>
        {(batchF !== "all" || dateF !== "all") && (
          <button
            type="button"
            onClick={() => { setBatchF("all"); setDateF("all"); }}
            className="text-sm font-medium text-brand hover:underline"
          >
            Reset
          </button>
        )}
        <span className="ml-auto text-sm text-muted">{filtered.length} responses</span>
      </Card>

      {filtered.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No feedback for this view</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {scoped.length === 0
              ? "Students haven't submitted feedback yet."
              : "No responses match the current filters."}
          </p>
          {canManageUsers(user) && scoped.length === 0 && (
            <div className="mt-5 flex justify-center">
              <Button href="/passkeys" size="md">Manage passkeys</Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Responses" value={overview.responses} hint="Student submissions" />
            <StatCard label="Avg Rating" value={`${overview.avgRating.toFixed(1)}/5`} hint="All parameters" />
            <StatCard label="Batches" value={overview.batches} hint="With feedback" />
            <StatCard label="Classes" value={overview.classes} hint="Rated" />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="Average by parameter" data={overview.criteria.map((c) => [c.label, Math.round(c.avg * 10) / 10])} />
            <DonutChart
              title="Rating distribution"
              data={[5, 4, 3, 2, 1].map((r) => [`${r} · ${RATING_LABELS[r]}`, dist[r] || 0]).filter(([, n]) => n > 0)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="Average rating by batch" data={batches.map((b) => [b.name, Math.round(b.avgRating * 10) / 10])} />
            <BarList title="Average rating by class" data={classRows.map((c) => [c.class, Math.round(c.avgRating * 10) / 10])} />
          </div>

          {/* Batch × Class matrix */}
          {matrix.classes.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-3.5">
                <h3 className="text-sm font-semibold text-foreground">Batch × Class average</h3>
                <p className="text-xs text-muted">Average rating (/5) per class in each batch.</p>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Batch</th>
                      {matrix.classes.map((c) => (
                        <th key={c} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matrix.batches.map((b) => (
                      <tr key={b}>
                        <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-medium text-foreground">{b}</th>
                        {matrix.classes.map((c) => {
                          const v = matrix.get(b, c);
                          return (
                            <td key={c} className="px-3 py-2 text-center">
                              <span className={cn("inline-block min-w-[2.75rem] rounded-md px-2 py-1 text-xs font-semibold", cellTone(v))}>
                                {v == null ? "—" : v.toFixed(1)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* By class detailed table */}
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">By class</h3>
              <p className="text-xs text-muted">Per-class responses and parameter averages.</p>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Class</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Responses</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Avg</th>
                    {overview.criteria.map((c) => (
                      <th key={c.key} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {classRows.map((r) => (
                    <tr key={r.class} className="transition-colors hover:bg-surface-2/60">
                      <td className="px-4 py-3 font-medium text-foreground">{r.class}</td>
                      <td className="px-4 py-3 text-center text-muted">{r.responses}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-semibold", tone(r.avgRating))}>{r.avgRating.toFixed(1)}</span>
                          <Stars value={r.avgRating} />
                        </div>
                      </td>
                      {r.criteria.map((c) => (
                        <td key={c.key} className={cn("px-3 py-3 text-center font-medium", tone(c.avg))}>{c.avg.toFixed(1)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* By batch (click-through) */}
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">By batch</h3>
              <p className="text-xs text-muted">Click a batch for per-class detail &amp; comments.</p>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Batch</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Responses</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Avg Rating</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((b) => (
                    <tr key={b.slug} onClick={() => router.push(`/feedback/${encodeURIComponent(b.slug)}`)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                      <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                      <td className="px-4 py-3 text-center text-muted">{b.responses}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-semibold", tone(b.avgRating))}>{b.avgRating.toFixed(1)}</span>
                          <Stars value={b.avgRating} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-brand">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Comments — table; ~10 rows visible, rest scrolls */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Comments</h3>
                <p className="text-xs text-muted">
                  {shownComments.length} comment{shownComments.length === 1 ? "" : "s"}
                  {commentClass !== "all" ? ` · ${commentClass}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select className={FIELD} value={commentClass} onChange={(e) => setCommentClass(e.target.value)}>
                  <option value="all">All comments</option>
                  {commentOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={shownComments.length === 0}
                  onClick={() => downloadCommentsExcel(shownComments, `${commentsName}.xlsx`)}
                >
                  ⬇ Excel
                </Button>
                <Button
                  size="sm"
                  disabled={shownComments.length === 0}
                  onClick={() => downloadCommentsPdf(shownComments, `${commentsName}.pdf`, dateScopeLabel)}
                >
                  ⬇ PDF
                </Button>
              </div>
            </div>
            {shownComments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No comments in this view.</p>
            ) : (
              <div className="max-h-[30rem] overflow-auto scrollbar-thin">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="sticky top-0 z-10 w-12 bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">#</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Class</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Comment</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Batch</th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shownComments.map((s, i) => (
                      <tr key={i} className="align-top transition-colors hover:bg-surface-2/60">
                        <td className="px-4 py-3 text-muted">{i + 1}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{s.class}</td>
                        <td className="px-4 py-3 text-foreground/85">{s.text}</td>
                        <td className="px-4 py-3 text-muted">{s.batchName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{dateLabel(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
