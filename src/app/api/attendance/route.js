import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND = process.env.TORII_BACKEND_URL || "https://toriiminds.com/backend/api";

// The 3 real placement batches — scanned to assemble a custom cohort's attendance.
const REAL_BATCH_IDS = [
  "6a3d01574748ff3d73afb7f3", // PT_AI_READY_2027
  "6a3d01c44748ff3d73afd0d5", // PT_NON_IT_2027
  "6a3d020d4748ff3d73afda62", // PT_IT_2027
];

async function fetchBatch(batchId) {
  const res = await fetch(`${BACKEND}/get-day-wise-batch-attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch_id: batchId }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { rows: Array.isArray(data?.result) ? data.result : [], note: data?.error || null };
}

/**
 * Proxy day-wise batch attendance.
 *   body = { batch_id }            → one real backend batch
 *   body = { rolls: [torii, …] }   → a custom cohort: union across the real
 *                                     batches, filtered to those Torii numbers
 * Upstream row: { roll_no, attendance:[{session,date,mode,status}], present, absent }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Custom cohort by roll numbers.
  if (Array.isArray(body.rolls)) {
    const want = new Set(body.rolls.map((r) => (r || "").trim().toUpperCase()).filter(Boolean));
    if (want.size === 0) return NextResponse.json({ ok: true, result: [] });
    try {
      const batches = await Promise.all(REAL_BATCH_IDS.map(fetchBatch));
      const seen = new Set();
      const result = [];
      for (const b of batches) {
        for (const row of b.rows) {
          const key = (row.roll_no || "").trim().toUpperCase();
          if (want.has(key) && !seen.has(key)) { seen.add(key); result.push(row); }
        }
      }
      return NextResponse.json({ ok: true, result });
    } catch {
      return NextResponse.json({ ok: false, error: "Could not reach the attendance source." }, { status: 502 });
    }
  }

  const batchId = (body.batch_id || "").trim();
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "Select a batch." }, { status: 400 });
  }

  try {
    const { rows, note } = await fetchBatch(batchId);
    return NextResponse.json({ ok: true, result: rows, note: rows.length ? undefined : note });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach the attendance source." }, { status: 502 });
  }
}
