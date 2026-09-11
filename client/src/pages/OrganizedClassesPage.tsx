import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import { api } from "../api/client";
import type { School } from "../types/api";
import { TrashIcon } from "../icons/Icons";
import { confirmDelete, showError, showSuccess } from "../utils/alerts";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";

// Grades whose learning areas include the two electives (Creative Tech, Research).
const ELECTIVE_ELIGIBLE_GRADES = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];

// Grades whose learning areas include the Cluster of Electives.
const CLUSTER_ELECTIVE_GRADES = ["Grade 11", "Grade 12"];
const CLUSTER_OF_ELECTIVES = ["Academic Cluster", "Business and Entrep", "STEM", "TechPro"];

export default function OrganizedClassesPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [draftByGrade, setDraftByGrade] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  function reload() {
    return api.get<School>("/schools/me").then((res) => setSchool(res.data));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleAddClassSections(gradeLevelId: number) {
    const classNames = draftByGrade[gradeLevelId];
    if (!classNames?.trim()) return;

    try {
      await api.post("/class-sections", { gradeLevelId, classNames });
      await reload();
      setDraftByGrade((prev) => ({ ...prev, [gradeLevelId]: "" }));
      showSuccess("Class section(s) added");
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to add class section(s)");
    }
  }

  async function handleToggleElectives(classSectionId: number, hasElectives: boolean) {
    try {
      await api.patch(`/class-sections/${classSectionId}`, { hasElectives });
      await reload();
      showSuccess("Electives updated");
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to update electives");
    }
  }

  async function handleSetElectiveFileTarget(
    classSectionId: number,
    currentTargets: Record<string, number>,
    electiveName: string,
    value: number
  ) {
    const electiveFileTargets = { ...currentTargets, [electiveName]: Math.max(0, Math.floor(value) || 0) };
    try {
      await api.patch(`/class-sections/${classSectionId}`, { electiveFileTargets });
      await reload();
    } catch (err: any) {
      // Intentionally no success toast here — this fires on every keystroke
      // of the number input, and a toast per keystroke would be noisy.
      showError(err?.response?.data?.message ?? "Failed to update file limit");
    }
  }

  async function handleDeleteClassSection(classSectionId: number, className: string) {
    const confirmed = await confirmDelete(
      `Delete "${className}"?`,
      "Any LOA files already submitted for this class will also be removed."
    );
    if (!confirmed) return;

    try {
      await api.delete(`/class-sections/${classSectionId}`);
      await reload();
      showSuccess("Class section deleted");
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to delete class section");
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Department of Education, Division of Guihulngan City"
          title="Organized Classes"
          subtitle="CLASS STRUCTURE PER GRADE LEVEL AND CLUSTER OF ELECTIVES FILE LIMITS"
        />
        <div className="card-stack" style={{ marginTop: 20 }}>
          <div className="card">
            <div className="table-scroll">
              <SkeletonTable columns={4} />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!school) return null;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="Organized Classes"
        subtitle="CLASS STRUCTURE PER GRADE LEVEL AND CLUSTER OF ELECTIVES FILE LIMITS"
      />

      <div className="card-stack">
        <div className="card">
          <h2 className="heading section-title">Organized Classes Per Grade Level</h2>
          <div className="section-subtitle">
            Grade levels are auto-populated based on your School Level. Add your class/section names per grade
            (comma-separated for multiple).
          </div>

          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grade Level</th>
                <th>No. of Organized Classes</th>
                <th>Class Names</th>
                <th>Add Class(es)</th>
              </tr>
            </thead>
            <tbody>
              {school.gradeLevels?.map((grade) => (
                <tr key={grade.id}>
                  <td style={{ fontWeight: 700 }}>{grade.gradeName}</td>
                  <td>{grade.classSections?.length ?? 0}</td>
                  <td>
                    {grade.classSections && grade.classSections.length > 0 ? (
                      <div className="class-chip-list">
                        {grade.classSections.map((c) => (
                          <span key={c.id} className="class-chip">
                            {c.className}
                            {ELECTIVE_ELIGIBLE_GRADES.includes(grade.gradeName) && (
                              <select
                                className="class-chip__electives"
                                value={c.hasElectives ? "yes" : "no"}
                                onChange={(e) => handleToggleElectives(c.id, e.target.value === "yes")}
                                title="Enables uploads for Creative Tech (Elective) and Research (Elective)"
                              >
                                <option value="no">No Electives</option>
                                <option value="yes">With Electives</option>
                              </select>
                            )}
                            <button
                              type="button"
                              className="class-chip__remove"
                              onClick={() => handleDeleteClassSection(c.id, c.className)}
                              aria-label={`Delete ${c.className}`}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ display: "flex", alignItems: "center" }}>
                    <input
                      placeholder="e.g. Rizal, Bonifacio"
                      value={draftByGrade[grade.id] ?? ""}
                      onChange={(e) => setDraftByGrade((prev) => ({ ...prev, [grade.id]: e.target.value }))}
                    />
                    <button className="table-add-btn" type="button" onClick={() => handleAddClassSections(grade.id)}>
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {school.gradeLevels?.some(
          (g) => CLUSTER_ELECTIVE_GRADES.includes(g.gradeName) && g.classSections && g.classSections.length > 0
        ) && (
          <div className="card">
            <h2 className="heading section-title">Cluster of Electives — File Limit Per Class</h2>
            <div className="section-subtitle">
              Set how many files each class/section may upload per elective (Grade 11-12). A limit of 0 blocks
              uploads for that elective until set.
            </div>

            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grade Level</th>
                  <th>Class</th>
                  {CLUSTER_OF_ELECTIVES.map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {school.gradeLevels
                  ?.filter(
                    (g) => CLUSTER_ELECTIVE_GRADES.includes(g.gradeName) && g.classSections && g.classSections.length > 0
                  )
                  .flatMap((grade) =>
                    grade.classSections!.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700 }}>{grade.gradeName}</td>
                        <td>{c.className}</td>
                        {CLUSTER_OF_ELECTIVES.map((name) => (
                          <td key={name}>
                            <input
                              type="number"
                              min={0}
                              className="cluster-elective-targets__input"
                              value={c.electiveFileTargets?.[name] ?? 0}
                              onChange={(e) =>
                                handleSetElectiveFileTarget(c.id, c.electiveFileTargets ?? {}, name, Number(e.target.value))
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
