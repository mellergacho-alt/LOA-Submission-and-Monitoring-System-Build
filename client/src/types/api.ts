export type SchoolLevel = "ES" | "JHS" | "JHS_SHS" | "SHS";
export type SubmissionStatus = "NOT_SUBMITTED" | "SUBMITTED" | "LATE";
export type Role = "ADMIN" | "SCHOOL" | "GRADE_CHAIRMAN" | "SUPERVISOR";
export type ExamType = "DIAGNOSTIC_TEST" | "SUMMATIVE_TEST_1" | "SUMMATIVE_TEST_2" | "END_OF_TERM_EXAM";
export type DocumentType = "LOA_RESULT" | "TEST_QUESTIONNAIRE" | "TABLE_OF_SPECIFICATIONS";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  schoolId: number | null;
  schoolName: string | null;
  gradeLevelIds: number[];
  gradeNames: string[];
  assignedLearningAreas: string[];
}

export interface Chairman {
  id: number;
  name: string;
  email: string;
  gradeLevelIds: number[];
  gradeLevels: { gradeName: string }[];
  multigrade: boolean;
}

export interface AdminAccount {
  id: number;
  name: string;
  email: string;
}

export interface Supervisor {
  id: number;
  name: string;
  email: string;
  assignedLearningAreas: string[];
}

export interface SupervisorSchoolOption {
  id: number;
  schoolName: string;
  clusterId: number;
}

export interface SupervisorSubmissionRow {
  id: number;
  fileName: string | null;
  filePath: string | null;
  status: SubmissionStatus;
  submittedAt: string | null;
  learningAreaName: string;
  gradeName: string;
  className: string;
  schoolId: number;
  schoolName: string;
}

export interface Cluster {
  id: number;
  name: string;
  clusterHeadName: string;
  clusterConsultant: string;
}

export interface ClassSection {
  id: number;
  gradeLevelId: number;
  className: string;
  hasElectives: boolean;
  electiveFileTargets: Record<string, number>;
}

export interface GradeLevel {
  id: number;
  schoolId: number;
  gradeName: string;
  classSections?: ClassSection[];
}

export interface School {
  id: number;
  schoolIdNumber: string;
  schoolName: string;
  schoolHeadName: string | null;
  schoolEmail: string | null;
  schoolLevel: SchoolLevel;
  clusterId: number;
  cluster?: Cluster;
  gradeLevels?: GradeLevel[];
  user?: { id: number; email: string; name: string; forceGoogleSignIn: boolean } | null;
  forceChairmenGoogleSignIn: boolean;
}

export interface LearningArea {
  id: number;
  name: string;
  grade: string;
}

export interface GridSubmission {
  id: number;
  classSectionId: number;
  learningAreaId: number;
  termId: number;
  fileName: string | null;
  filePath: string | null;
  status: SubmissionStatus;
  submittedAt: string | null;
}

export interface ExamSchedule {
  id: number;
  termId: number;
  examType: ExamType;
  documentType: DocumentType;
  required: boolean;
  startDate: string | null;
  deadline: string | null;
  allowedFileTypes: string[];
  allowLateSubmission: boolean;
  enforceOrder: boolean;
}

export interface SubmissionGridResponse {
  classSections: ClassSection[];
  learningAreas: LearningArea[];
  submissions: GridSubmission[];
  examSchedule: ExamSchedule | null;
}

export interface BulkSchoolImportResult {
  row: number;
  schoolIdNumber?: string;
  status: "created" | "error";
  message?: string;
}

export interface BulkSchoolImportResponse {
  created: number;
  failed: number;
  results: BulkSchoolImportResult[];
}

export interface BulkSupervisorImportResult {
  row: number;
  email?: string;
  status: "created" | "error";
  message?: string;
}

export interface BulkSupervisorImportResponse {
  created: number;
  failed: number;
  results: BulkSupervisorImportResult[];
}

export interface AdminStats {
  totalSchools: number;
  notSubmitted: number;
  late: number;
  submitted: number;
}

export interface StatusGridSubmission {
  id: number;
  classSectionId: number;
  learningAreaId: number;
  status: SubmissionStatus;
  fileName: string | null;
  filePath: string | null;
  submittedAt: string | null;
}

export interface StatusGridGradeLevel {
  id: number;
  gradeName: string;
  classSections: { id: number; className: string; hasElectives: boolean; electiveFileTargets: Record<string, number> }[];
  learningAreas: { id: number; name: string }[];
  submissions: StatusGridSubmission[];
}

export interface StatusGridResponse {
  school: { id: number; schoolName: string };
  gradeLevels: StatusGridGradeLevel[];
  examSchedule: ExamSchedule | null;
}

export interface SchoolRosterRow {
  schoolId: number;
  schoolName: string;
  schoolHeadName: string | null;
  clusterId: number;
  clusterName: string;
  gradeLevels: string[];
  gradeLevelLearningAreas: { gradeName: string; learningAreas: string[] }[];
  records: number;
  hasLateSubmission: boolean;
  isComplete: boolean;
}

export interface Term {
  id: number;
  schoolYearId: number;
  name: "First" | "Second" | "Third";
  isActive: boolean;
  examSchedules: ExamSchedule[];
}

export interface SchoolYear {
  id: number;
  label: string;
  isActive: boolean;
  terms: Term[];
}

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "SCHOOL_ACCOUNT_CREATE"
  | "SCHOOL_ACCOUNT_UPDATE"
  | "SCHOOL_ACCOUNT_DELETE"
  | "SCHOOL_ACCOUNT_PASSWORD_RESET"
  | "CHAIRMAN_CREATE"
  | "CHAIRMAN_UPDATE"
  | "CHAIRMAN_DELETE"
  | "CHAIRMAN_PASSWORD_RESET"
  | "SUPERVISOR_CREATE"
  | "SUPERVISOR_UPDATE"
  | "SUPERVISOR_DELETE"
  | "SUPERVISOR_PASSWORD_RESET"
  | "ADMIN_CREATE"
  | "ADMIN_UPDATE"
  | "ADMIN_DELETE"
  | "ADMIN_PASSWORD_RESET"
  | "SUBMISSION_UPLOAD"
  | "SUBMISSION_ACCESS"
  | "SUBMISSION_DELETE";

export interface AuditLog {
  id: number;
  action: AuditAction;
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: Role | null;
  targetType: string | null;
  targetId: number | null;
  details: string | null;
  createdAt: string;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}
