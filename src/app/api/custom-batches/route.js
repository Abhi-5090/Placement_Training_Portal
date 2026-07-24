import { NextResponse } from "next/server";
import { collection } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const norm = (t) => (t || "").trim().toUpperCase();
const slugify = (s) => (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Custom cohorts (a named set of students, e.g. "AIRE Batch - III Year") defined
 * by an explicit roster. Members carry their Torii number so attendance/analytics
 * can be pulled across the real backend batches. Stored in `customBatches`.
 */
export async function GET() {
  try {
    const col = await collection("customBatches");
    const list = await col.find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
    return NextResponse.json({ ok: true, batches: list });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}

/**
 * Upsert a cohort. body = { name, slug?, students: [{usn,name,branch,phone,torii}] }.
 * Upserts by slug (derived from name when omitted).
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const slug = slugify(body.slug || name);
  const students = (Array.isArray(body.students) ? body.students : []).map((s) => ({
    usn: norm(s.usn),
    name: (s.name || "").trim(),
    branch: (s.branch || "").trim(),
    phone: (s.phone || "").toString().trim(),
    torii: norm(s.torii),
  }));

  if (!name || !slug) {
    return NextResponse.json({ ok: false, error: "Cohort name is required." }, { status: 400 });
  }

  try {
    const col = await collection("customBatches");
    const rolls = students.map((s) => s.torii).filter(Boolean);
    await col.updateOne(
      { slug },
      { $set: { slug, name, students, rolls, studentCount: students.length, updatedAt: Date.now() } },
      { upsert: true },
    );
    return NextResponse.json({ ok: true, slug, name, studentCount: students.length, withTorii: rolls.length });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
