/**
 * 2027 Batch — 4th Year training programs.
 * Transcribed from the official timetable + day-wise syllabus sheets.
 *
 * Three cohorts:
 *   1. AI Ready Engineer
 *   2. Placement Training Batch 1  (CSE, CSE - AI ML, CSE - DS, ISE)
 *   3. Placement Training Batch 2  (ECE, CIVIL)
 *
 * @typedef {Object} TimetableSlot
 * @property {string} time
 * @property {string} activity
 *
 * @typedef {Object} Timetable
 * @property {string} batch
 * @property {TimetableSlot[]} slots
 *
 * @typedef {Object} SyllabusDay
 * @property {number} day
 * @property {string} aptitude
 * @property {string} coding
 * @property {string} [ai]
 * @property {string} [commSkills]
 * @property {string} [sql]
 *
 * @typedef {Object} Assessment
 * @property {string} title
 * @property {string} timing
 * @property {string} description
 *
 * @typedef {Object} Program
 * @property {string} slug
 * @property {string} title
 * @property {string} tagline
 * @property {string} description
 * @property {string[]} tracks
 * @property {number} durationDays
 * @property {Assessment[]} assessments
 * @property {Timetable[]} timetables
 * @property {SyllabusDay[]} syllabus
 */

const COMM_SKILLS = "Communication Skills (Myna)";

/** Shared assessment block — same for every cohort. */
const ASSESSMENTS = [
  {
    title: "Pre-Assessment Test",
    timing: "On Day 1",
    description:
      "A baseline test taken on Day 1, before the sessions begin, to gauge each participant's starting level.",
  },
  {
    title: "Daily Test",
    timing: "30 min, every day",
    description:
      "A 30-minute test held at the start of the day, before classes begin, to reinforce the previous day's learning across the tracks.",
  },
  {
    title: "Grand Test",
    timing: "Day 6 & Day 12",
    description:
      "Two milestone tests — Grand Test-1 at the mid-point (Day 6) and Grand Test-2 at the finish (Day 12) — to benchmark cumulative progress.",
  },
];

/** Placement Training Batch 1 daily timetable. */
const PLACEMENT_BATCH1_SLOTS = [
  { time: "9:00 AM – 9:30 AM", activity: COMM_SKILLS },
  { time: "9:30 AM – 10:30 AM", activity: "SQL" },
  { time: "10:30 AM – 12:00 PM", activity: "Aptitude" },
  { time: "12:00 PM – 1:00 PM", activity: "Lunch" },
  { time: "1:00 PM – 4:00 PM", activity: "Coding" },
];

/** Placement Training Batch 2 daily timetable. */
const PLACEMENT_BATCH2_SLOTS = [
  { time: "9:00 AM – 10:30 AM", activity: "Aptitude" },
  { time: "10:30 AM – 11:00 AM", activity: COMM_SKILLS },
  { time: "11:00 AM – 12:00 PM", activity: "SQL" },
  { time: "12:00 PM – 1:00 PM", activity: "Lunch" },
  { time: "1:00 PM – 4:00 PM", activity: "Coding" },
];

/** Placement Training Batch 3 daily timetable. */
const PLACEMENT_BATCH3_SLOTS = [
  { time: "9:00 AM – 10:30 AM", activity: "Aptitude" },
  { time: "10:30 AM – 11:00 AM", activity: COMM_SKILLS },
  { time: "11:00 AM – 12:00 PM", activity: "SQL" },
  { time: "12:00 PM – 1:00 PM", activity: "Lunch" },
  { time: "1:00 PM – 4:00 PM", activity: "Coding" },
];

/** Communication Skills (Myna) day-wise topics — shared across programs. */
const COMM_SKILLS_DAYS = [
  "Response Selection",
  "Passage Comprehension",
  "Module Test on Listening",
  "Read Out, Answer Questions",
  "Speaking Situation, Give your opinion",
  "Module Test on Speaking",
  "Reading Comprehension",
  "Sentence Completion",
  "Module Test on Reading",
  "Dictation, Wordflow",
  "Email-writing",
  "Module Test on Writing",
];

/** SQL day-wise topics — shared across programs. */
const SQL_DAYS = [
  "SQL Basics & Command Categories",
  "SELECT, Filtering & Operators",
  "Aggregate Functions, GROUP BY & HAVING",
  "Joins",
  "Subqueries & Nested Queries",
  "Advanced Query Patterns",
  "Set Operations & Built-in Functions",
  "Window Functions",
  "Constraints & Keys",
  "Normalization & Database Design",
  "Views, Indexes, Stored Procedures & Triggers",
  "Transactions, ACID & Query Optimization",
];

/** Add the shared Communication Skills + SQL topics to each day. */
function withCommSql(rows) {
  return rows.map((r) => ({
    ...r,
    commSkills: COMM_SKILLS_DAYS[r.day - 1] ?? "",
    sql: SQL_DAYS[r.day - 1] ?? "",
  }));
}

/** Placement Training day-wise syllabus — shared by both batches. */
const PLACEMENT_SYLLABUS = withCommSql([
  { day: 1, aptitude: "Percentages & Ratio-Proportion", coding: "C MCQs" },
  { day: 2, aptitude: "Profit & Loss", coding: "Pseudo Code MCQs" },
  { day: 3, aptitude: "Time, Speed & Distance", coding: "Data Structure MCQs" },
  { day: 4, aptitude: "Time & Work", coding: "OOPs" },
  { day: 5, aptitude: "Averages & Mixtures", coding: "OOPs" },
  { day: 6, aptitude: "Simple & Compound Interest", coding: "Grand Test-1" },
  { day: 7, aptitude: "Permutations & Combinations", coding: "Problem Solving on Numbers" },
  { day: 8, aptitude: "Probability", coding: "Problem Solving on Arrays" },
  { day: 9, aptitude: "Series Completion", coding: "Problem Solving on Arrays" },
  { day: 10, aptitude: "Coding-Decoding", coding: "Problem Solving on Strings" },
  { day: 11, aptitude: "Direction Sense", coding: "Problem Solving on Strings" },
  { day: 12, aptitude: "Blood Relations", coding: "Grand Test-2" },
]);

/** @type {Program[]} */
export const programs = [
  {
    slug: "ai-ready-engineer",
    title: "AI Ready Engineer Batch 1",
    tagline: "4th Year · AI Ready Engineer",
    description:
      "An intensive Program that blends quantitative aptitude, core coding, applied Artificial Intelligence, and communication skills — taking 4th-year engineers from fundamentals to building and showcasing their own AI-powered application.",
    tracks: ["Aptitude", "Coding", "AI", "Communication Skills", "SQL"],
    durationDays: 12,
    assessments: ASSESSMENTS,
    timetables: [
      {
        batch: "AI Ready Engineer Batch 1",
        slots: [
          { time: "9:00 AM – 11:00 AM", activity: "Coding" },
          { time: "11:00 AM – 12:00 PM", activity: "AI" },
          { time: "12:00 PM – 1:00 PM", activity: "Lunch" },
          { time: "1:00 PM – 1:30 PM", activity: COMM_SKILLS },
          { time: "1:30 PM – 2:30 PM", activity: "SQL" },
          { time: "2:30 PM – 4:00 PM", activity: "Aptitude" },
        ],
      },
    ],
    syllabus: withCommSql([
      { day: 1, aptitude: "Percentages & Ratio-Proportion", coding: "C MCQs", ai: "Introduction to Artificial Intelligence" },
      { day: 2, aptitude: "Profit & Loss", coding: "Pseudo Code MCQs", ai: "Prompt Engineering Fundamentals" },
      { day: 3, aptitude: "Time, Speed & Distance", coding: "Data Structure MCQs", ai: "AI for Learning & Research" },
      { day: 4, aptitude: "Time & Work", coding: "OOPs", ai: "AI for Content Creation" },
      { day: 5, aptitude: "Averages & Mixtures", coding: "OOPs", ai: "AI Image Generation" },
      { day: 6, aptitude: "Simple & Compound Interest", coding: "Grand Test-1", ai: "AI Video Generation" },
      { day: 7, aptitude: "Permutations & Combinations", coding: "Problem Solving on Numbers", ai: "AI for Presentations" },
      { day: 8, aptitude: "Probability", coding: "Problem Solving on Arrays", ai: "AI for Coding" },
      { day: 9, aptitude: "Series Completion", coding: "Problem Solving on Arrays", ai: "AI for Career Preparation" },
      { day: 10, aptitude: "Coding-Decoding", coding: "Problem Solving on Strings", ai: "AI Automation" },
      { day: 11, aptitude: "Direction Sense", coding: "Problem Solving on Strings", ai: "Building an AI-Powered Application" },
      { day: 12, aptitude: "Blood Relations", coding: "Grand Test-2", ai: "Project Showcase" },
    ]),
  },
  {
    slug: "aire-batch-iii-year",
    title: "AIRE Batch - III Year",
    tagline: "III Year · AI Ready Engineer",
    description:
      "AI Ready Engineer training for the III-year AIRE cohort — core coding, applied AI, and resume building.",
    tracks: ["Coding", "AI", "Resume Building"],
    durationDays: 12,
    assessments: ASSESSMENTS,
    timetables: [
      {
        batch: "AIRE Batch - III Year",
        slots: [
          { time: "9:00 AM – 11:00 AM", activity: "Coding" },
          { time: "11:00 AM – 1:00 PM", activity: "AI" },
          { time: "1:00 PM – 2:00 PM", activity: "Lunch" },
          { time: "2:00 PM – 4:00 PM", activity: "Resume Building" },
        ],
      },
    ],
  },
  {
    slug: "launchpad",
    title: "Launchpad",
    tagline: "Launchpad Program",
    description:
      "The Launchpad program — core coding paired with skill-development technologies.",
    tracks: ["Coding", "Skill Development Technologies"],
    durationDays: 12,
    assessments: ASSESSMENTS,
    timetables: [
      {
        batch: "Launchpad",
        slots: [
          { time: "9:00 AM – 1:00 PM", activity: "Coding" },
          { time: "1:00 PM – 2:00 PM", activity: "Lunch" },
          { time: "2:00 PM – 4:00 PM", activity: "Skill Development Technologies" },
        ],
      },
    ],
  },
  {
    slug: "placement-training-batch-2",
    title: "Placement Training Batch 2",
    tagline: "4th Year · Batch 2",
    description:
      "Placement Training for the CSE, CSE (AI & ML), CSE (Data Science), and ISE departments — combining quantitative aptitude, a deep coding ramp, and communication skills (Myna).",
    tracks: ["Aptitude", "Coding", "Communication Skills", "SQL"],
    durationDays: 12,
    assessments: ASSESSMENTS,
    timetables: [
      { batch: "Placement Training Batch 2", slots: PLACEMENT_BATCH2_SLOTS },
    ],
    syllabus: PLACEMENT_SYLLABUS,
  },
  {
    slug: "placement-training-batch-3",
    title: "Placement Training Batch 3",
    tagline: "4th Year · Batch 3",
    description:
      "Placement Training for the ECE and Civil departments — combining quantitative aptitude, a deep coding ramp, and communication skills (Myna).",
    tracks: ["Aptitude", "Coding", "Communication Skills", "SQL"],
    durationDays: 12,
    assessments: ASSESSMENTS,
    timetables: [
      { batch: "Placement Training Batch 3", slots: PLACEMENT_BATCH3_SLOTS },
    ],
    syllabus: PLACEMENT_SYLLABUS,
  },
  {
    slug: "tns-foundation-batch-4",
    title: "TNS Foundation Batch 4",
    tagline: "TNS Foundation · Batch 4",
    description:
      "The TNS Foundation program — building career-ready soft skills alongside hands-on technical training, delivered daily.",
    tracks: ["SoftSkills", "Technical Training"],
    timetables: [
      {
        batch: "TNS Foundation (Batch 4)",
        slots: [
          { time: "9:00 AM – 12:00 PM", activity: "SoftSkills" },
          { time: "12:00 PM – 1:00 PM", activity: "Lunch" },
          { time: "1:00 PM – 4:00 PM", activity: "Technical Training" },
        ],
      },
    ],
  },
  {
    slug: "tns-foundation-batch-5",
    title: "TNS Foundation Batch 5",
    tagline: "TNS Foundation · Batch 5",
    description:
      "The TNS Foundation program — building career-ready soft skills alongside hands-on technical training, delivered daily.",
    tracks: ["SoftSkills", "Technical Training"],
    timetables: [
      {
        batch: "TNS Foundation (Batch 5)",
        slots: [
          { time: "9:00 AM – 12:00 PM", activity: "Technical Training" },
          { time: "12:00 PM – 1:00 PM", activity: "Lunch" },
          { time: "1:00 PM – 4:00 PM", activity: "SoftSkills" },
        ],
      },
    ],
  },
];

/**
 * @param {string} slug
 * @returns {Program | undefined}
 */
export function getProgram(slug) {
  return programs.find((p) => p.slug === slug);
}
