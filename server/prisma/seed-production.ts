// Production bootstrap -- creates the reference data the app genuinely
// needs to function (Learning Areas, Clusters, one School Year/Term) plus
// exactly one real Division Admin account, and nothing else: no demo
// schools, no demo submissions, no known/shared password. Deliberately a
// separate script from prisma/seed.ts (the dev/demo seed used by
// `npm run prisma:seed`) -- that one creates fake schools and a
// publicly-documented admin@loa.local/Admin@2026 login, which is exactly
// the kind of thing that must never exist on a real database (see
// CLAUDE.md's "Security fix: real admin/school credentials were displayed
// on the public login page" section for why that's not hypothetical).
//
// Run once, after the schema itself is in place (via `prisma migrate
// deploy` or database/schema.sql -- see BUILD.md), with the admin's real
// details supplied through environment variables rather than hardcoded
// here or typed as a CLI arg (which would land in shell history):
//
//   set BOOTSTRAP_ADMIN_NAME=Juan Dela Cruz
//   set BOOTSTRAP_ADMIN_EMAIL=juan.delacruz@deped.gov.ph
//   set BOOTSTRAP_ADMIN_PASSWORD=a-real-strong-password
//   npx ts-node prisma/seed-production.ts
//
// Safe to re-run: every write here is an upsert, so running it again (e.g.
// after an interrupted first attempt) won't duplicate rows or fail on
// what's already there. It will, however, update the bootstrap admin's
// name/password to whatever the env vars currently hold if that account
// already exists -- expected for "I mistyped the password the first time,"
// but worth knowing before re-running against a database someone has
// since changed that admin's password through the app itself.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mirrors prisma/seed.ts's own GRADE_LEARNING_AREAS exactly (kept as a
// separate copy rather than a shared import, matching this codebase's
// existing convention of duplicating small reference-data constants rather
// than adding a shared module two very-different-purpose scripts both
// depend on).
const GRADE_LEARNING_AREAS: Record<string, string[]> = {
  "Grade 1": ["Language", "Reading and Literacy", "Math", "MAKABANSA", "GMRC"],
  "Grade 2": ["English", "Filipino", "Math", "MAKABANSA", "GMRC"],
  "Grade 3": ["English", "Filipino", "Math", "MAKABANSA", "Science", "GMRC"],
  "Grade 4": ["English", "Filipino", "Math", "AP", "MAPEH", "Science", "GMRC", "EPP"],
  "Grade 5": ["English", "Filipino", "Math", "AP", "MAPEH", "Science", "GMRC", "EPP"],
  "Grade 6": ["English", "Filipino", "Math", "AP", "MAPEH", "Science", "GMRC", "EPP"],
  "Grade 7": [
    "Science",
    "English",
    "Math",
    "Filipino",
    "AP",
    "ESP",
    "MAPEH",
    "TLE",
    "Creative Tech (Elective)",
    "Research (Elective)",
  ],
  "Grade 8": [
    "Science",
    "English",
    "Math",
    "Filipino",
    "AP",
    "ESP",
    "MAPEH",
    "TLE",
    "Creative Tech (Elective)",
    "Research (Elective)",
  ],
  "Grade 9": [
    "Science",
    "English",
    "Math",
    "Filipino",
    "AP",
    "ESP",
    "MAPEH",
    "TLE",
    "Creative Tech (Elective)",
    "Research (Elective)",
  ],
  "Grade 10": [
    "Science",
    "English",
    "Math",
    "Filipino",
    "AP",
    "ESP",
    "MAPEH",
    "TLE",
    "Creative Tech (Elective)",
    "Research (Elective)",
  ],
  "Grade 11": [
    "Effective Communication",
    "Life Skills",
    "General Mathematics",
    "Pag-aaral ng Kasaysayan at Lipunang Pilipino",
    "Academic Cluster",
    "Business and Entrep",
    "STEM",
    "TechPro",
  ],
  "Grade 12": [
    "Effective Communication",
    "Life Skills",
    "General Mathematics",
    "Pag-aaral ng Kasaysayan at Lipunang Pilipino",
    "Academic Cluster",
    "Business and Entrep",
    "STEM",
    "TechPro",
  ],
};

function currentSchoolYearLabel(): string {
  // A reasonable default so the division doesn't land on an empty School
  // Year list with no obvious next step -- the admin can add/activate a
  // different one immediately from School Year & Term regardless. Assumes
  // the Philippine school year convention (starts mid-year, so a school
  // year spans two calendar years) rather than trying to be clever about
  // "the current term" -- that's exactly what the app's own active-Term UI
  // is for, not something a bootstrap script should guess at.
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1; // June (0-indexed 5) onward = new SY
  return `${startYear}-${startYear + 1}`;
}

async function main() {
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME;
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminName || !adminEmail || !adminPassword) {
    console.error(
      "Missing BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD environment variables."
    );
    console.error("Set all three before running this script -- see the comment at the top of this file.");
    process.exit(1);
  }
  if (adminPassword.length < 6) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 6 characters (same rule the app itself enforces).");
    process.exit(1);
  }

  const label = currentSchoolYearLabel();
  const schoolYear = await prisma.schoolYear.upsert({
    where: { label },
    update: {},
    create: {
      label,
      isActive: true,
      terms: { create: ["First", "Second", "Third"].map((name) => ({ name, isActive: name === "First" })) },
    },
  });
  console.log(`School Year ${schoolYear.label} ready (First Term active).`);

  let learningAreaCount = 0;
  for (const [grade, areas] of Object.entries(GRADE_LEARNING_AREAS)) {
    for (const name of areas) {
      await prisma.learningArea.upsert({
        where: { name_grade: { name, grade } },
        update: {},
        create: { name, grade },
      });
      learningAreaCount += 1;
    }
  }
  console.log(`${learningAreaCount} Learning Area rows ready across ${Object.keys(GRADE_LEARNING_AREAS).length} grades.`);

  const CLUSTER_NUMBERS = Array.from({ length: 10 }, (_, i) => String(i + 1));
  for (const number of CLUSTER_NUMBERS) {
    await prisma.cluster.upsert({
      where: { id: Number(number) },
      update: {},
      create: { id: Number(number), name: number, clusterHeadName: "", clusterConsultant: "" },
    });
  }
  console.log("Clusters 1-10 ready (head/consultant left blank -- set from within the app once known).");

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, passwordHash, role: "ADMIN" },
    create: { email: adminEmail, name: adminName, passwordHash, role: "ADMIN" },
  });
  console.log(`Division Admin account ready: ${admin.email}`);

  console.log("\nBootstrap complete. Sign in with the admin account above, then create School Admin accounts");
  console.log("from Administration > School Admin -- every other account in the system is provisioned from there");
  console.log("(or by that School's own account, for Grade Level Chairmen), never by self-registration.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
