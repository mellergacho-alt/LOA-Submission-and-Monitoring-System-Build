import { PrismaClient, SchoolLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

async function main() {
  // The current School Year, with its 3 terms auto-created and Second Term
  // active (matches the app's long-standing default).
  const schoolYear = await prisma.schoolYear.upsert({
    where: { label: "2026-2027" },
    update: {},
    create: {
      label: "2026-2027",
      isActive: true,
      terms: { create: ["First", "Second", "Third"].map((name) => ({ name, isActive: name === "Second" })) },
    },
    include: { terms: true },
  });
  const secondTerm = schoolYear.terms.find((t) => t.name === "Second")!;

  // Learning areas (grade-specific, per the Information Sheet's Notes)
  for (const [grade, areas] of Object.entries(GRADE_LEARNING_AREAS)) {
    for (const name of areas) {
      await prisma.learningArea.upsert({
        where: { name_grade: { name, grade } },
        update: {},
        create: { name, grade },
      });
    }
  }

  // Clusters, numbered 1-10. Cluster 1 keeps its real head/consultant; the
  // rest are placeholders until the Division assigns them.
  const CLUSTER_NUMBERS = Array.from({ length: 10 }, (_, i) => String(i + 1));
  for (const number of CLUSTER_NUMBERS) {
    await prisma.cluster.upsert({
      where: { id: Number(number) },
      update: { name: number },
      create: {
        id: Number(number),
        name: number,
        clusterHeadName: number === "1" ? "Iris P. Berangbe" : "",
        clusterConsultant: number === "1" ? "Ma. Elena Ramos" : "",
      },
    });
  }
  const cluster = await prisma.cluster.findUniqueOrThrow({ where: { id: 1 } });

  // Schools
  const mandii = await prisma.school.upsert({
    where: { schoolIdNumber: "2026-0818" },
    update: {},
    create: {
      schoolIdNumber: "2026-0818",
      schoolName: "Mandi-i Elementary School",
      schoolHeadName: "Maria Clara Santos",
      schoolEmail: "mandii.es@deped.gov.ph",
      schoolLevel: SchoolLevel.ES,
      clusterId: cluster.id,
      gradeLevels: {
        create: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"].map((gradeName) => ({
          gradeName,
        })),
      },
    },
    include: { gradeLevels: true },
  });

  const pinucauan = await prisma.school.upsert({
    where: { schoolIdNumber: "2026-0715" },
    update: {},
    create: {
      schoolIdNumber: "2026-0715",
      schoolName: "Pinucauan National High School",
      schoolHeadName: "Ramon Cruz Villareal",
      schoolEmail: "pinucauan.nhs@deped.gov.ph",
      schoolLevel: SchoolLevel.JHS_SHS,
      clusterId: cluster.id,
      gradeLevels: {
        create: ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"].map((gradeName) => ({
          gradeName,
        })),
      },
    },
    include: { gradeLevels: true },
  });

  // Class sections for Mandi-i (Grade 1: Rizal, Bonifacio; Grade 6: Mabini)
  const mandiiGrade1 = mandii.gradeLevels.find((g) => g.gradeName === "Grade 1")!;
  const mandiiGrade6 = mandii.gradeLevels.find((g) => g.gradeName === "Grade 6")!;
  for (const className of ["Rizal", "Bonifacio"]) {
    await prisma.classSection.upsert({
      where: { gradeLevelId_className: { gradeLevelId: mandiiGrade1.id, className } },
      update: {},
      create: { gradeLevelId: mandiiGrade1.id, className },
    });
  }
  const mabini = await prisma.classSection.upsert({
    where: { gradeLevelId_className: { gradeLevelId: mandiiGrade6.id, className: "Mabini" } },
    update: {},
    create: { gradeLevelId: mandiiGrade6.id, className: "Mabini" },
  });

  // Class sections for Pinucauan (Grade 7: Diamond; Grade 11: STEM-A)
  const pinucauanGrade7 = pinucauan.gradeLevels.find((g) => g.gradeName === "Grade 7")!;
  const pinucauanGrade11 = pinucauan.gradeLevels.find((g) => g.gradeName === "Grade 11")!;
  const diamond = await prisma.classSection.upsert({
    where: { gradeLevelId_className: { gradeLevelId: pinucauanGrade7.id, className: "Diamond" } },
    update: {},
    create: { gradeLevelId: pinucauanGrade7.id, className: "Diamond" },
  });
  await prisma.classSection.upsert({
    where: { gradeLevelId_className: { gradeLevelId: pinucauanGrade11.id, className: "STEM-A" } },
    update: {},
    create: { gradeLevelId: pinucauanGrade11.id, className: "STEM-A" },
  });

  // A couple of demo submissions
  const scienceG6 = await prisma.learningArea.findUniqueOrThrow({
    where: { name_grade: { name: "Science", grade: "Grade 6" } },
  });
  const filipinoG7 = await prisma.learningArea.findUniqueOrThrow({
    where: { name_grade: { name: "Filipino", grade: "Grade 7" } },
  });

  await prisma.submission.upsert({
    where: {
      classSectionId_learningAreaId_termId: {
        classSectionId: mabini.id,
        learningAreaId: scienceG6.id,
        termId: secondTerm.id,
      },
    },
    update: {},
    create: {
      classSectionId: mabini.id,
      learningAreaId: scienceG6.id,
      termId: secondTerm.id,
      status: "SUBMITTED",
      fileName: "G6-Science-Mabini-Q2.pdf",
      submittedAt: new Date(),
    },
  });

  await prisma.submission.upsert({
    where: {
      classSectionId_learningAreaId_termId: {
        classSectionId: diamond.id,
        learningAreaId: filipinoG7.id,
        termId: secondTerm.id,
      },
    },
    update: {},
    create: {
      classSectionId: diamond.id,
      learningAreaId: filipinoG7.id,
      termId: secondTerm.id,
      status: "LATE",
    },
  });

  // Accounts
  const adminPasswordHash = await bcrypt.hash("Admin@2026", 10);
  await prisma.user.upsert({
    where: { email: "admin@loa.local" },
    update: { name: "Mel E. Gacho", passwordHash: adminPasswordHash },
    create: {
      email: "admin@loa.local",
      passwordHash: adminPasswordHash,
      name: "Mel E. Gacho",
      role: "ADMIN",
    },
  });

  const schoolPasswordHash = await bcrypt.hash("School@2026", 10);
  await prisma.user.upsert({
    where: { email: "school@loa.local" },
    update: { name: "Ana Marie Santos", passwordHash: schoolPasswordHash },
    create: {
      email: "school@loa.local",
      passwordHash: schoolPasswordHash,
      name: "Ana Marie Santos",
      role: "SCHOOL",
      schoolId: mandii.id,
    },
  });

  console.log("Seed complete.");
  console.log("Admin login:  admin@loa.local  / Admin@2026");
  console.log("School login: school@loa.local / School@2026");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
