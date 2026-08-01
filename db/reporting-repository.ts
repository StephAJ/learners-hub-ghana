import { ensureAssessmentFoundation } from "./assessment-repository";
import { getSchoolDatabase } from "./index";
import type { SchoolDatabase, SchoolStatement } from "./school-database";
import { SCIENCE_OFFERING_ID } from "./learning-repository";
import {
  adjustGradeEntry,
  approveReport,
  calculateWeightedGrade,
  canViewReleasedReport,
  gradeFromScale,
  releaseReport,
  ReportingPolicyError,
  submitGradebook,
} from "../domain/reporting/gradebook";
import type {
  GradeCategory,
  GradeEntry,
  GradeEntryStatus,
  GradeItem,
  GradeScaleBand,
  ReportCard,
  ReportStatus,
} from "../domain/reporting/types";
import {
  AuthorizationError,
  canAccessLearner,
  canPerform,
  canTeachOffering,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";

const TENANT_ID = "tenant-greenfield";
export const CURRENT_PERIOD_ID = "period-2026-term1";

export type GradebookCell = {
  adjusted: boolean;
  entryId: string;
  itemId: string;
  maximumMarks: number;
  status: GradeEntryStatus;
  value: number | null;
};

export type GradebookLearner = {
  cells: GradebookCell[];
  grade: string;
  id: string;
  missingCount: number;
  name: string;
  remark: string;
  studentId: string;
  totalPercent: number | null;
};

export type GradebookReportSummary = {
  averagePercent: number;
  id: string;
  learnerName: string;
  status: ReportStatus;
  updatedAt: string;
  version: number;
};

export type TeacherGradebookWorkspace = {
  categories: GradeCategory[];
  className: string;
  items: Array<GradeItem & { categoryName: string }>;
  learners: GradebookLearner[];
  offeringId: string;
  period: {
    academicYear: string;
    id: string;
    name: string;
    policyVersion: number;
    submissionStatus: "open" | "submitted" | "reviewed" | "locked";
  };
  reports: GradebookReportSummary[];
  scale: GradeScaleBand[];
  subjectName: string;
};

export type GuardianSubjectResult = {
  grade: string;
  remark: string;
  scorePercent: number;
  subjectCode: string;
  subjectName: string;
  teacherComment: string;
};

export type GuardianReport = {
  approved: boolean;
  attendance: { present: number; total: number };
  classTeacherComment: string;
  conduct: string;
  headteacherComment: string;
  id: string;
  nextTermBeginsOn: string | null;
  overallAverage: number;
  periodName: string;
  promotionDecision: string;
  releasedAt: string;
  subjects: GuardianSubjectResult[];
  version: number;
};

export type GuardianReportWorkspace = {
  child: {
    className: string;
    id: string;
    name: string;
    studentId: string;
  };
  linkedChildren: Array<{ id: string; name: string }>;
  reports: GuardianReport[];
  schoolName: string;
};

export type SaveGradeEntryInput = {
  adjustmentReason?: string;
  entryId: string;
  marks: number;
  status?: GradeEntryStatus;
};

export async function listTeacherGradebookWorkspace(
  access: AccessContext,
): Promise<TeacherGradebookWorkspace> {
  requireGradebookPermission(access);
  await ensureReportingFoundation();
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, SCIENCE_OFFERING_ID)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getSchoolDatabase();
  const [categories, items, scale, period, submission, reports] =
    await Promise.all([
      loadCategories(database, access.tenantId),
      loadItems(database, access.tenantId),
      loadScale(database, access.tenantId),
      loadPeriod(database, access.tenantId),
      loadSubmission(database, access.tenantId),
      loadReportQueue(database, access.tenantId),
    ]);
  const learners = await loadGradebookLearners(
    database,
    access.tenantId,
    categories,
    items,
    scale,
  );

  return {
    categories,
    className: "JHS 2 Gold",
    items,
    learners,
    offeringId: SCIENCE_OFFERING_ID,
    period: {
      academicYear: period.academic_year_id,
      id: period.id,
      name: period.name,
      policyVersion: period.policy_version,
      submissionStatus: submission.status,
    },
    reports,
    scale,
    subjectName: "Integrated Science",
  };
}

export async function savePersistentGradeEntry(
  access: AccessContext,
  input: SaveGradeEntryInput,
): Promise<TeacherGradebookWorkspace> {
  await ensureReportingFoundation();
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT
        e.id,
        e.raw_marks,
        e.adjusted_marks,
        e.status,
        e.learner_person_id,
        e.item_id,
        i.maximum_marks,
        i.offering_id,
        s.status AS submission_status
      FROM grade_entries e
      INNER JOIN grade_items i ON i.id = e.item_id
      INNER JOIN gradebook_submissions s
        ON s.period_id = i.period_id AND s.offering_id = i.offering_id
      WHERE e.id = ? AND e.tenant_id = ?
      LIMIT 1`,
    )
    .bind(input.entryId, access.tenantId)
    .first<{
      adjusted_marks: number | null;
      id: string;
      item_id: string;
      learner_person_id: string;
      maximum_marks: number;
      offering_id: string;
      raw_marks: number | null;
      status: GradeEntryStatus;
      submission_status: string;
    }>();
  if (!row) throw new ReportingPolicyError("Grade entry was not found.");
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, row.offering_id)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  if (row.submission_status !== "open") {
    throw new ReportingPolicyError(
      "This gradebook has been submitted. Reopen it through the authorised correction workflow before changing marks.",
    );
  }
  if (
    !Number.isFinite(input.marks) ||
    input.marks < 0 ||
    input.marks > row.maximum_marks
  ) {
    throw new ReportingPolicyError(
      `Marks must be between 0 and ${row.maximum_marks}.`,
    );
  }

  const existing: GradeEntry = {
    adjustedMarks: row.adjusted_marks,
    id: row.id,
    itemId: row.item_id,
    learnerPersonId: row.learner_person_id,
    rawMarks: row.raw_marks ?? 0,
    status: row.status,
  };
  const isCorrection =
    row.raw_marks !== null &&
    row.status === "recorded" &&
    row.raw_marks !== input.marks;
  const updated = isCorrection
    ? adjustGradeEntry(
        existing,
        input.marks,
        input.adjustmentReason ?? "",
      )
    : {
        ...existing,
        adjustedMarks: null,
        rawMarks: input.marks,
        status: input.status ?? ("recorded" as const),
      };

  await database.batch([
    database
      .prepare(
        `UPDATE grade_entries
        SET raw_marks = ?, adjusted_marks = ?, status = ?,
          adjustment_reason = ?, recorded_by_person_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        updated.rawMarks,
        updated.adjustedMarks,
        updated.status,
        updated.adjustmentReason ?? null,
        access.actorPersonId,
        row.id,
        access.tenantId,
      ),
    auditStatement(
      database,
      access,
      isCorrection ? "grade.adjusted" : "grade.recorded",
      "grade-entry",
      row.id,
      {
        adjustedMarks: updated.adjustedMarks,
        rawMarks: updated.rawMarks,
        reason: updated.adjustmentReason,
      },
    ),
  ]);
  return listTeacherGradebookWorkspace(access);
}

export async function submitPersistentGradebook(
  access: AccessContext,
): Promise<TeacherGradebookWorkspace> {
  await ensureReportingFoundation();
  const workspace = await listTeacherGradebookWorkspace(access);
  const database = await getSchoolDatabase();
  const entries = await loadAllEntries(database, access.tenantId);
  submitGradebook(entries, new Date().toISOString());
  const reportUpdateStatements = workspace.learners.map((learner) => {
    const scale = learner.totalPercent === null
      ? { grade: "—", remark: "Incomplete" }
      : gradeFromScale(learner.totalPercent, workspace.scale);
    return database
      .prepare(
        `UPDATE report_subject_results
        SET score_tenths = ?, grade = ?, remark = ?
        WHERE report_version_id = ?
          AND subject_code = 'IS'
          AND tenant_id = ?`,
      )
      .bind(
        Math.round((learner.totalPercent ?? 0) * 10),
        scale.grade,
        scale.remark,
        `report-${learner.id}-term1:v0`,
        access.tenantId,
      );
  });
  const averageUpdateStatements = workspace.learners.map((learner) =>
    database
      .prepare(
        `UPDATE report_card_versions
        SET overall_average_tenths = (
          SELECT CAST(ROUND(AVG(score_tenths)) AS INTEGER)
          FROM report_subject_results
          WHERE report_version_id = ? AND tenant_id = ?
        )
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        `report-${learner.id}-term1:v0`,
        access.tenantId,
        `report-${learner.id}-term1:v0`,
        access.tenantId,
      ),
  );
  await database.batch([
    ...reportUpdateStatements,
    ...averageUpdateStatements,
    database
      .prepare(
        `UPDATE gradebook_submissions
        SET status = 'submitted', submitted_by_person_id = ?,
          submitted_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND period_id = ? AND offering_id = ?`,
      )
      .bind(
        access.actorPersonId,
        access.tenantId,
        CURRENT_PERIOD_ID,
        SCIENCE_OFFERING_ID,
      ),
    database
      .prepare(
        `UPDATE report_cards
        SET status = 'submitted', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND period_id = ? AND status = 'draft'`,
      )
      .bind(access.tenantId, CURRENT_PERIOD_ID),
    database
      .prepare(
        `UPDATE report_card_versions
        SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
          AND report_card_id IN (
            SELECT id FROM report_cards WHERE period_id = ?
          )
          AND version = 0`,
      )
      .bind(access.tenantId, CURRENT_PERIOD_ID),
    auditStatement(
      database,
      access,
      "gradebook.submitted",
      "subject-offering",
      SCIENCE_OFFERING_ID,
      { periodId: CURRENT_PERIOD_ID },
    ),
  ]);
  return listTeacherGradebookWorkspace(access);
}

export async function approvePersistentReport(
  access: AccessContext,
  reportId: string,
): Promise<TeacherGradebookWorkspace> {
  if (!canPerform(access, "report:approve")) {
    throw new AuthorizationError(
      "Your school role cannot approve reports.",
    );
  }
  await ensureReportingFoundation();
  const database = await getSchoolDatabase();
  const current = await loadReportCard(database, access.tenantId, reportId);
  const approved = approveReport(access, current, new Date().toISOString());
  await database.batch([
    database
      .prepare(
        `UPDATE report_cards
        SET status = 'approved', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(reportId, access.tenantId),
    database
      .prepare(
        `UPDATE report_card_versions
        SET status = 'approved', approved_by_person_id = ?, approved_at = ?
        WHERE report_card_id = ? AND version = ? AND tenant_id = ?`,
      )
      .bind(
        access.actorPersonId,
        approved.approvedAt,
        reportId,
        approved.version,
        access.tenantId,
      ),
    auditStatement(
      database,
      access,
      "report.approved",
      "report-card",
      reportId,
      { version: approved.version },
    ),
  ]);
  return listTeacherGradebookWorkspace(access);
}

export async function releasePersistentReport(
  access: AccessContext,
  reportId: string,
): Promise<TeacherGradebookWorkspace> {
  if (!canPerform(access, "report:release")) {
    throw new AuthorizationError(
      "Your school role cannot release reports.",
    );
  }
  await ensureReportingFoundation();
  const database = await getSchoolDatabase();
  const current = await loadReportCard(database, access.tenantId, reportId);
  const released = releaseReport(access, current, new Date().toISOString());
  const source = await loadReportVersion(
    database,
    access.tenantId,
    reportId,
    current.version,
  );
  const sourceSubjects = await loadReportSubjects(
    database,
    access.tenantId,
    source.id,
  );
  const releasedVersionId = `${reportId}:v${released.version}`;

  await database.batch([
    database
      .prepare(
        `INSERT INTO report_card_versions
          (id, tenant_id, report_card_id, version, status, overall_average_tenths,
           attendance_present, attendance_total, conduct, class_teacher_comment,
           headteacher_comment, promotion_decision, next_term_begins_on,
           submitted_at, approved_by_person_id, approved_at, released_at,
           created_by_person_id)
        VALUES (?, ?, ?, ?, 'released', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        releasedVersionId,
        access.tenantId,
        reportId,
        released.version,
        source.overall_average_tenths,
        source.attendance_present,
        source.attendance_total,
        source.conduct,
        source.class_teacher_comment,
        source.headteacher_comment,
        source.promotion_decision,
        source.next_term_begins_on,
        source.submitted_at,
        source.approved_by_person_id,
        source.approved_at,
        released.releasedAt,
        access.actorPersonId,
      ),
    ...sourceSubjects.map((subject) =>
      database
        .prepare(
          `INSERT INTO report_subject_results
            (id, tenant_id, report_version_id, offering_id, subject_code,
             subject_name, score_tenths, grade, remark, teacher_comment, position)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          releasedVersionId,
          subject.offering_id,
          subject.subject_code,
          subject.subject_name,
          subject.score_tenths,
          subject.grade,
          subject.remark,
          subject.teacher_comment,
          subject.position,
        ),
    ),
    database
      .prepare(
        `UPDATE report_cards
        SET status = 'released', current_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(released.version, reportId, access.tenantId),
    auditStatement(
      database,
      access,
      "report.released",
      "report-card",
      reportId,
      { version: released.version },
    ),
  ]);
  return listTeacherGradebookWorkspace(access);
}

export async function getGuardianReportWorkspace(
  access: AccessContext,
  requestedLearnerId?: string,
): Promise<GuardianReportWorkspace> {
  await ensureReportingFoundation();
  const database = await getSchoolDatabase();
  const linkedChildren = await resolveAccessibleChildren(database, access);
  const defaultLearnerId =
    access.role === "guardian"
      ? linkedChildren[0]?.id
      : access.role === "learner"
        ? access.actorPersonId
        : "person-kwame";
  const learnerId =
    requestedLearnerId ?? defaultLearnerId ?? access.actorPersonId;
  const scopedAccess: AccessContext = {
    ...access,
    linkedLearnerIds: linkedChildren.map((child) => child.id),
  };
  if (!canAccessLearner(scopedAccess, learnerId)) {
    throw new AuthorizationError(
      "You are not authorised to view this learner's reports.",
    );
  }
  const child = await database
    .prepare(
      `SELECT id, first_name || ' ' || last_name AS name
      FROM people
      WHERE id = ? AND tenant_id = ? AND kind = 'learner'
      LIMIT 1`,
    )
    .bind(learnerId, access.tenantId)
    .first<{ id: string; name: string }>();
  if (!child) throw new ReportingPolicyError("Learner was not found.");
  const reports = await loadReleasedReports(
    database,
    scopedAccess,
    learnerId,
  );
  return {
    child: {
      className: "JHS 2 Gold",
      id: child.id,
      name: child.name,
      studentId: studentNumber(child.id),
    },
    linkedChildren:
      linkedChildren.length > 0 ? linkedChildren : [{ id: child.id, name: child.name }],
    reports,
    schoolName: "Greenfield Academy",
  };
}

export async function ensureReportingFoundation() {
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  await database.batch([
    ...seedLearners(database),
    ...seedPeriodsAndPolicy(database),
    ...seedGradebook(database),
    ...seedCurrentReports(database),
    ...seedReleasedReport(database),
  ]);
}

function seedLearners(database: SchoolDatabase) {
  return [
    seedLearner(
      database,
      "person-ama",
      "Ama",
      "Serwaa",
      "ama.serwaa@student.greenfield.edu.gh",
    ),
    seedLearner(
      database,
      "person-kojo",
      "Kojo",
      "Boateng",
      "kojo.boateng@student.greenfield.edu.gh",
    ),
    seedLearnerMembership(database, "person-ama"),
    seedLearnerMembership(database, "person-kojo"),
  ];
}

function seedLearner(
  database: SchoolDatabase,
  id: string,
  firstName: string,
  lastName: string,
  email: string,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO people
        (id, tenant_id, kind, first_name, last_name, email, status)
      VALUES (?, ?, 'learner', ?, ?, ?, 'active')`,
    )
    .bind(id, TENANT_ID, firstName, lastName, email);
}

function seedLearnerMembership(database: SchoolDatabase, personId: string) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, scope_id, accepted_at)
      VALUES (?, ?, ?, 'learner', 'active', 'class', 'JHS 2 Gold', CURRENT_TIMESTAMP)`,
    )
    .bind(`membership-${personId}`, TENANT_ID, personId);
}

function seedPeriodsAndPolicy(database: SchoolDatabase) {
  const statements: SchoolStatement[] = [
    database
      .prepare(
        `INSERT OR IGNORE INTO grading_periods
          (id, tenant_id, academic_year_id, name, starts_on, ends_on, status, policy_version)
        VALUES (?, ?, '2026 / 2027', 'Term 1', '2026-09-08', '2026-12-18', 'open', 1)`,
      )
      .bind(CURRENT_PERIOD_ID, TENANT_ID),
    database
      .prepare(
        `INSERT OR IGNORE INTO grading_periods
          (id, tenant_id, academic_year_id, name, starts_on, ends_on, status, policy_version)
        VALUES ('period-2025-term2', ?, '2025 / 2026', 'Term 2', '2026-01-06', '2026-04-10', 'closed', 1)`,
      )
      .bind(TENANT_ID),
    database
      .prepare(
        `INSERT OR IGNORE INTO grade_categories
          (id, tenant_id, period_id, offering_id, name, kind, weight_percent, position)
        VALUES ('category-science-ca', ?, ?, ?, 'Continuous assessment', 'continuous-assessment', 40, 1)`,
      )
      .bind(TENANT_ID, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID),
    database
      .prepare(
        `INSERT OR IGNORE INTO grade_categories
          (id, tenant_id, period_id, offering_id, name, kind, weight_percent, position)
        VALUES ('category-science-exam', ?, ?, ?, 'End-of-term examination', 'examination', 60, 2)`,
      )
      .bind(TENANT_ID, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID),
  ];
  const bands = [
    [80, 100, "A", "Excellent"],
    [70, 79.9, "B", "Very good"],
    [60, 69.9, "C", "Good"],
    [50, 59.9, "D", "Credit"],
    [40, 49.9, "E", "Pass"],
    [0, 39.9, "F", "Needs support"],
  ] as const;
  bands.forEach(([minimum, maximum, grade, remark], index) => {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO grading_scale_bands
            (id, tenant_id, period_id, position, minimum_tenths, maximum_tenths, grade, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `scale-term1-${grade}`,
          TENANT_ID,
          CURRENT_PERIOD_ID,
          index + 1,
          Math.round(minimum * 10),
          Math.round(maximum * 10),
          grade,
          remark,
        ),
    );
  });
  return statements;
}

function seedGradebook(database: SchoolDatabase) {
  const statements: SchoolStatement[] = [
    seedGradeItem(
      database,
      "grade-item-digestion-quiz",
      "category-science-ca",
      "Digestive system quiz",
      20,
      1,
      "assessment-digestion-check",
    ),
    seedGradeItem(
      database,
      "grade-item-model-project",
      "category-science-ca",
      "Body systems model",
      30,
      2,
      null,
    ),
    seedGradeItem(
      database,
      "grade-item-term-exam",
      "category-science-exam",
      "End-of-term examination",
      50,
      3,
      null,
    ),
    database
      .prepare(
        `INSERT OR IGNORE INTO gradebook_submissions
          (id, tenant_id, period_id, offering_id, status)
        VALUES ('submission-science-term1', ?, ?, ?, 'open')`,
      )
      .bind(TENANT_ID, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID),
  ];
  const marks: Array<[string, Array<number | null>]> = [
    ["person-kwame", [16, 25, 42]],
    ["person-ama", [18, 27, 45]],
    ["person-kojo", [12, null, 35]],
  ];
  const itemIds = [
    "grade-item-digestion-quiz",
    "grade-item-model-project",
    "grade-item-term-exam",
  ];
  marks.forEach(([learnerId, learnerMarks]) => {
    learnerMarks.forEach((mark, index) => {
      statements.push(
        database
          .prepare(
            `INSERT OR IGNORE INTO grade_entries
              (id, tenant_id, item_id, learner_person_id, raw_marks, status, recorded_by_person_id)
            VALUES (?, ?, ?, ?, ?, ?, 'person-grace')`,
          )
          .bind(
            `grade-entry-${learnerId}-${index + 1}`,
            TENANT_ID,
            itemIds[index],
            learnerId,
            mark,
            mark === null ? "missing" : "recorded",
          ),
      );
    });
  });
  return statements;
}

function seedGradeItem(
  database: SchoolDatabase,
  id: string,
  categoryId: string,
  title: string,
  maximumMarks: number,
  position: number,
  assessmentId: string | null,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO grade_items
        (id, tenant_id, period_id, offering_id, category_id, assessment_id,
         title, maximum_marks, status, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .bind(
      id,
      TENANT_ID,
      CURRENT_PERIOD_ID,
      SCIENCE_OFFERING_ID,
      categoryId,
      assessmentId,
      title,
      maximumMarks,
      position,
    );
}

function seedCurrentReports(database: SchoolDatabase) {
  const learners = [
    {
      average: 782,
      id: "person-kwame",
      name: "Kwame Agyeman",
      science: 832,
      comment: "Kwame is thoughtful and consistent. He should contribute more often during group practicals.",
    },
    {
      average: 873,
      id: "person-ama",
      name: "Ama Serwaa",
      science: 900,
      comment: "Ama shows excellent curiosity and explains scientific ideas clearly.",
    },
    {
      average: 692,
      id: "person-kojo",
      name: "Kojo Boateng",
      science: 0,
      comment: "Kojo is improving steadily. Completion of the model project is required.",
    },
  ];
  const statements: SchoolStatement[] = [];
  learners.forEach((learner) => {
    const reportId = `report-${learner.id}-term1`;
    const versionId = `${reportId}:v0`;
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO report_cards
            (id, tenant_id, learner_person_id, period_id, class_group_id, class_name, status, current_version)
          VALUES (?, ?, ?, ?, 'class-jhs2-gold', 'JHS 2 Gold', 'draft', 0)`,
        )
        .bind(reportId, TENANT_ID, learner.id, CURRENT_PERIOD_ID),
      database
        .prepare(
          `INSERT OR IGNORE INTO report_card_versions
            (id, tenant_id, report_card_id, version, status, overall_average_tenths,
             attendance_present, attendance_total, conduct, class_teacher_comment,
             headteacher_comment, promotion_decision, next_term_begins_on,
             created_by_person_id)
          VALUES (?, ?, ?, 0, 'draft', ?, 58, 60, 'Very good', ?, ?,
            'Progressing', '2027-01-12', 'person-emmanuel')`,
        )
        .bind(
          versionId,
          TENANT_ID,
          reportId,
          learner.average,
          learner.comment,
          "Continue the good work and make the most of every learning opportunity.",
        ),
      ...seedReportSubjects(
        database,
        versionId,
        learner.science,
        learner.name,
      ),
    );
  });
  return statements;
}

function seedReleasedReport(database: SchoolDatabase) {
  const reportId = "report-person-kwame-term2-2025";
  const versionId = `${reportId}:v1`;
  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO report_cards
          (id, tenant_id, learner_person_id, period_id, class_group_id, class_name, status, current_version)
        VALUES (?, ?, 'person-kwame', 'period-2025-term2', 'class-jhs2-gold',
          'JHS 2 Gold', 'released', 1)`,
      )
      .bind(reportId, TENANT_ID),
    database
      .prepare(
        `INSERT OR IGNORE INTO report_card_versions
          (id, tenant_id, report_card_id, version, status, overall_average_tenths,
           attendance_present, attendance_total, conduct, class_teacher_comment,
           headteacher_comment, promotion_decision, next_term_begins_on,
           submitted_at, approved_by_person_id, approved_at, released_at,
           created_by_person_id)
        VALUES (?, ?, ?, 1, 'released', 748, 56, 58, 'Very good', ?, ?,
          'Progressing', '2026-05-05', '2026-04-12T10:00:00Z', 'person-mary',
          '2026-04-13T09:00:00Z', '2026-04-14T08:00:00Z', 'person-emmanuel')`,
      )
      .bind(
        versionId,
        TENANT_ID,
        reportId,
        "Kwame worked consistently and made good progress in scientific reasoning.",
        "A pleasing result. Keep reading widely and practising written explanations.",
      ),
    ...seedReleasedReportSubjects(database, versionId),
  ];
}

function seedReportSubjects(
  database: SchoolDatabase,
  versionId: string,
  scienceScore: number,
  learnerName: string,
) {
  const subjects: Array<[string, string, number, string]> = [
    ["MA", "Mathematics", learnerName.includes("Ama") ? 880 : 780, "Shows sound numerical reasoning."],
    ["EN", "English Language", learnerName.includes("Ama") ? 850 : 740, "Communicates ideas with growing confidence."],
    ["IS", "Integrated Science", scienceScore, "Applies lesson concepts well in practical work."],
    ["SS", "Social Studies", learnerName.includes("Kojo") ? 640 : 690, "Understands community and civic themes."],
    ["CT", "Computing", learnerName.includes("Ama") ? 910 : 850, "Uses digital tools responsibly and effectively."],
    ["RM", "Religious & Moral Education", learnerName.includes("Kojo") ? 720 : 800, "Contributes respectfully to class discussion."],
  ];
  return subjects.map(([code, name, score, comment], index) => {
    const scale = seedGrade(score / 10);
    return database
      .prepare(
        `INSERT OR IGNORE INTO report_subject_results
          (id, tenant_id, report_version_id, offering_id, subject_code,
           subject_name, score_tenths, grade, remark, teacher_comment, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${versionId}-${code}`,
        TENANT_ID,
        versionId,
        code === "IS" ? SCIENCE_OFFERING_ID : `offering-${code.toLowerCase()}-jhs2`,
        code,
        name,
        score,
        scale.grade,
        scale.remark,
        comment,
        index + 1,
      );
  });
}

function seedReleasedReportSubjects(
  database: SchoolDatabase,
  versionId: string,
) {
  const subjects: Array<[string, string, number, string]> = [
    ["MA", "Mathematics", 740, "Good progress in algebra and number work."],
    ["EN", "English Language", 710, "Written expression is becoming clearer."],
    ["IS", "Integrated Science", 790, "Shows strong understanding of body systems."],
    ["SS", "Social Studies", 660, "Participates thoughtfully in civic discussions."],
    ["CT", "Computing", 810, "Works confidently with data and documents."],
    ["RM", "Religious & Moral Education", 780, "Demonstrates respect and sound moral judgement."],
  ];
  return subjects.map(([code, name, score, comment], index) => {
    const scale = seedGrade(score / 10);
    return database
      .prepare(
        `INSERT OR IGNORE INTO report_subject_results
          (id, tenant_id, report_version_id, offering_id, subject_code,
           subject_name, score_tenths, grade, remark, teacher_comment, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${versionId}-${code}`,
        TENANT_ID,
        versionId,
        code === "IS" ? SCIENCE_OFFERING_ID : `offering-${code.toLowerCase()}-jhs2`,
        code,
        name,
        score,
        scale.grade,
        scale.remark,
        comment,
        index + 1,
      );
  });
}

function seedGrade(score: number) {
  if (score >= 80) return { grade: "A", remark: "Excellent" };
  if (score >= 70) return { grade: "B", remark: "Very good" };
  if (score >= 60) return { grade: "C", remark: "Good" };
  if (score >= 50) return { grade: "D", remark: "Credit" };
  if (score >= 40) return { grade: "E", remark: "Pass" };
  return { grade: "F", remark: "Needs support" };
}

async function loadCategories(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT id, name, weight_percent
      FROM grade_categories
      WHERE tenant_id = ? AND period_id = ? AND offering_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID)
    .all<{ id: string; name: string; weight_percent: number }>();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    weightPercent: row.weight_percent,
  }));
}

async function loadItems(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT i.id, i.category_id, i.title, i.maximum_marks, c.name AS category_name
      FROM grade_items i
      INNER JOIN grade_categories c ON c.id = i.category_id
      WHERE i.tenant_id = ? AND i.period_id = ? AND i.offering_id = ?
        AND i.status != 'excluded'
      ORDER BY i.position`,
    )
    .bind(tenantId, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID)
    .all<{
      category_id: string;
      category_name: string;
      id: string;
      maximum_marks: number;
      title: string;
    }>();
  return result.results.map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    id: row.id,
    maximumMarks: row.maximum_marks,
    title: row.title,
  }));
}

async function loadScale(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT grade, remark, minimum_tenths, maximum_tenths
      FROM grading_scale_bands
      WHERE tenant_id = ? AND period_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, CURRENT_PERIOD_ID)
    .all<{
      grade: string;
      maximum_tenths: number;
      minimum_tenths: number;
      remark: string;
    }>();
  return result.results.map((row) => ({
    grade: row.grade,
    maximumPercent: row.maximum_tenths / 10,
    minimumPercent: row.minimum_tenths / 10,
    remark: row.remark,
  }));
}

async function loadPeriod(database: SchoolDatabase, tenantId: string) {
  const period = await database
    .prepare(
      `SELECT id, academic_year_id, name, policy_version
      FROM grading_periods
      WHERE id = ? AND tenant_id = ?
      LIMIT 1`,
    )
    .bind(CURRENT_PERIOD_ID, tenantId)
    .first<{
      academic_year_id: string;
      id: string;
      name: string;
      policy_version: number;
    }>();
  if (!period) throw new ReportingPolicyError("Grading period was not found.");
  return period;
}

async function loadSubmission(database: SchoolDatabase, tenantId: string) {
  const submission = await database
    .prepare(
      `SELECT status
      FROM gradebook_submissions
      WHERE tenant_id = ? AND period_id = ? AND offering_id = ?
      LIMIT 1`,
    )
    .bind(tenantId, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID)
    .first<{
      status: TeacherGradebookWorkspace["period"]["submissionStatus"];
    }>();
  if (!submission) {
    throw new ReportingPolicyError("Gradebook submission was not found.");
  }
  return submission;
}

async function loadGradebookLearners(
  database: SchoolDatabase,
  tenantId: string,
  categories: GradeCategory[],
  items: Array<GradeItem & { categoryName: string }>,
  scale: GradeScaleBand[],
) {
  const learners = await database
    .prepare(
      `SELECT id, first_name || ' ' || last_name AS name
      FROM people
      WHERE tenant_id = ? AND id IN ('person-kwame', 'person-ama', 'person-kojo')
      ORDER BY first_name, last_name`,
    )
    .bind(tenantId)
    .all<{ id: string; name: string }>();
  const result: GradebookLearner[] = [];
  for (const learner of learners.results) {
    const entryRows = await database
      .prepare(
        `SELECT
          e.id,
          e.item_id,
          e.raw_marks,
          e.adjusted_marks,
          e.status,
          i.maximum_marks
        FROM grade_entries e
        INNER JOIN grade_items i ON i.id = e.item_id
        WHERE e.tenant_id = ? AND e.learner_person_id = ?
          AND i.period_id = ? AND i.offering_id = ?
        ORDER BY i.position`,
      )
      .bind(
        tenantId,
        learner.id,
        CURRENT_PERIOD_ID,
        SCIENCE_OFFERING_ID,
      )
      .all<{
        adjusted_marks: number | null;
        id: string;
        item_id: string;
        maximum_marks: number;
        raw_marks: number | null;
        status: GradeEntryStatus;
      }>();
    const cells = entryRows.results.map((entry) => ({
      adjusted: entry.adjusted_marks !== null,
      entryId: entry.id,
      itemId: entry.item_id,
      maximumMarks: entry.maximum_marks,
      status: entry.status,
      value: entry.adjusted_marks ?? entry.raw_marks,
    }));
    const domainEntries = entryRows.results.map((entry) => ({
      adjustedMarks: entry.adjusted_marks,
      id: entry.id,
      itemId: entry.item_id,
      learnerPersonId: learner.id,
      rawMarks: entry.raw_marks ?? 0,
      status: entry.status,
    }));
    const missingCount = domainEntries.filter(
      (entry) => entry.status === "missing",
    ).length;
    const totalPercent =
      missingCount > 0
        ? null
        : calculateWeightedGrade(categories, items, domainEntries).totalPercent;
    const grade =
      totalPercent === null
        ? { grade: "—", remark: "Incomplete" }
        : gradeFromScale(totalPercent, scale);
    result.push({
      cells,
      grade: grade.grade,
      id: learner.id,
      missingCount,
      name: learner.name,
      remark: grade.remark,
      studentId: studentNumber(learner.id),
      totalPercent,
    });
  }
  return result;
}

async function loadAllEntries(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT
        e.id,
        e.item_id,
        e.learner_person_id,
        e.raw_marks,
        e.adjusted_marks,
        e.status
      FROM grade_entries e
      INNER JOIN grade_items i ON i.id = e.item_id
      WHERE e.tenant_id = ? AND i.period_id = ? AND i.offering_id = ?`,
    )
    .bind(tenantId, CURRENT_PERIOD_ID, SCIENCE_OFFERING_ID)
    .all<{
      adjusted_marks: number | null;
      id: string;
      item_id: string;
      learner_person_id: string;
      raw_marks: number | null;
      status: GradeEntryStatus;
    }>();
  return result.results.map((entry) => ({
    adjustedMarks: entry.adjusted_marks,
    id: entry.id,
    itemId: entry.item_id,
    learnerPersonId: entry.learner_person_id,
    rawMarks: entry.raw_marks ?? 0,
    status: entry.status,
  }));
}

async function loadReportQueue(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT
        r.id,
        r.status,
        r.current_version,
        r.updated_at,
        p.first_name || ' ' || p.last_name AS learner_name,
        v.overall_average_tenths
      FROM report_cards r
      INNER JOIN people p ON p.id = r.learner_person_id
      INNER JOIN report_card_versions v
        ON v.report_card_id = r.id AND v.version = r.current_version
      WHERE r.tenant_id = ? AND r.period_id = ?
      ORDER BY p.first_name, p.last_name`,
    )
    .bind(tenantId, CURRENT_PERIOD_ID)
    .all<{
      current_version: number;
      id: string;
      learner_name: string;
      overall_average_tenths: number;
      status: ReportStatus;
      updated_at: string;
    }>();
  return result.results.map((row) => ({
    averagePercent: row.overall_average_tenths / 10,
    id: row.id,
    learnerName: row.learner_name,
    status: row.status,
    updatedAt: row.updated_at,
    version: row.current_version,
  }));
}

async function loadReportCard(
  database: SchoolDatabase,
  tenantId: string,
  reportId: string,
): Promise<ReportCard> {
  const row = await database
    .prepare(
      `SELECT id, tenant_id, learner_person_id, period_id, status, current_version
      FROM report_cards
      WHERE id = ? AND tenant_id = ?
      LIMIT 1`,
    )
    .bind(reportId, tenantId)
    .first<{
      current_version: number;
      id: string;
      learner_person_id: string;
      period_id: string;
      status: ReportStatus;
      tenant_id: string;
    }>();
  if (!row) throw new ReportingPolicyError("Report card was not found.");
  return {
    id: row.id,
    learnerPersonId: row.learner_person_id,
    periodId: row.period_id,
    status: row.status,
    tenantId: row.tenant_id,
    version: row.current_version,
  };
}

async function loadReportVersion(
  database: SchoolDatabase,
  tenantId: string,
  reportId: string,
  version: number,
) {
  const row = await database
    .prepare(
      `SELECT *
      FROM report_card_versions
      WHERE tenant_id = ? AND report_card_id = ? AND version = ?
      LIMIT 1`,
    )
    .bind(tenantId, reportId, version)
    .first<ReportVersionRow>();
  if (!row) throw new ReportingPolicyError("Report version was not found.");
  return row;
}

async function loadReportSubjects(
  database: SchoolDatabase,
  tenantId: string,
  reportVersionId: string,
) {
  const result = await database
    .prepare(
      `SELECT *
      FROM report_subject_results
      WHERE tenant_id = ? AND report_version_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, reportVersionId)
    .all<ReportSubjectRow>();
  return result.results;
}

async function resolveAccessibleChildren(
  database: SchoolDatabase,
  access: AccessContext,
) {
  if (access.role === "guardian") {
    const result = await database
      .prepare(
        `SELECT p.id, p.first_name || ' ' || p.last_name AS name
        FROM guardian_relationships g
        INNER JOIN people p ON p.id = g.learner_person_id
        WHERE g.tenant_id = ? AND g.guardian_person_id = ? AND g.status = 'active'
        ORDER BY p.first_name, p.last_name`,
      )
      .bind(access.tenantId, access.actorPersonId)
      .all<{ id: string; name: string }>();
    return result.results;
  }
  if (access.role === "learner") {
    const learner = await database
      .prepare(
        `SELECT id, first_name || ' ' || last_name AS name
        FROM people WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
      .bind(access.actorPersonId, access.tenantId)
      .first<{ id: string; name: string }>();
    return learner ? [learner] : [];
  }
  const result = await database
    .prepare(
      `SELECT id, first_name || ' ' || last_name AS name
      FROM people
      WHERE tenant_id = ? AND kind = 'learner'
      ORDER BY first_name, last_name`,
    )
    .bind(access.tenantId)
    .all<{ id: string; name: string }>();
  return result.results;
}

async function loadReleasedReports(
  database: SchoolDatabase,
  access: AccessContext,
  learnerId: string,
) {
  const result = await database
    .prepare(
      `SELECT
        r.id,
        r.tenant_id,
        r.learner_person_id,
        r.period_id,
        r.status,
        r.current_version,
        p.name AS period_name,
        v.id AS version_id,
        v.overall_average_tenths,
        v.attendance_present,
        v.attendance_total,
        v.conduct,
        v.class_teacher_comment,
        v.headteacher_comment,
        v.promotion_decision,
        v.next_term_begins_on,
        v.approved_at,
        v.released_at
      FROM report_cards r
      INNER JOIN grading_periods p ON p.id = r.period_id
      INNER JOIN report_card_versions v
        ON v.report_card_id = r.id AND v.version = r.current_version
      WHERE r.tenant_id = ? AND r.learner_person_id = ?
        AND r.status = 'released' AND v.status = 'released'
      ORDER BY p.ends_on DESC`,
    )
    .bind(access.tenantId, learnerId)
    .all<{
      approved_at: string | null;
      attendance_present: number;
      attendance_total: number;
      class_teacher_comment: string;
      conduct: string;
      current_version: number;
      headteacher_comment: string;
      id: string;
      learner_person_id: string;
      next_term_begins_on: string | null;
      overall_average_tenths: number;
      period_id: string;
      period_name: string;
      promotion_decision: string;
      released_at: string | null;
      status: ReportStatus;
      tenant_id: string;
      version_id: string;
    }>();
  const reports: GuardianReport[] = [];
  for (const row of result.results) {
    const report: ReportCard = {
      id: row.id,
      learnerPersonId: row.learner_person_id,
      periodId: row.period_id,
      status: row.status,
      tenantId: row.tenant_id,
      version: row.current_version,
    };
    if (!canViewReleasedReport(access, report)) continue;
    const subjects = await loadReportSubjects(
      database,
      access.tenantId,
      row.version_id,
    );
    reports.push({
      approved: Boolean(row.approved_at),
      attendance: {
        present: row.attendance_present,
        total: row.attendance_total,
      },
      classTeacherComment: row.class_teacher_comment,
      conduct: row.conduct,
      headteacherComment: row.headteacher_comment,
      id: row.id,
      nextTermBeginsOn: row.next_term_begins_on,
      overallAverage: row.overall_average_tenths / 10,
      periodName: row.period_name,
      promotionDecision: row.promotion_decision,
      releasedAt: row.released_at ?? "",
      subjects: subjects.map((subject) => ({
        grade: subject.grade,
        remark: subject.remark,
        scorePercent: subject.score_tenths / 10,
        subjectCode: subject.subject_code,
        subjectName: subject.subject_name,
        teacherComment: subject.teacher_comment,
      })),
      version: row.current_version,
    });
  }
  return reports;
}

async function withTeacherAssignments(access: AccessContext) {
  if (access.role === "school-admin" || access.role === "academic-admin") {
    return access;
  }
  const database = await getSchoolDatabase();
  const result = await database
    .prepare(
      `SELECT offering_id
      FROM teacher_assignments
      WHERE tenant_id = ? AND teacher_person_id = ? AND status = 'active'`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{ offering_id: string }>();
  return {
    ...access,
    subjectOfferingIds: result.results.map((row) => row.offering_id),
  };
}

function requireGradebookPermission(access: AccessContext) {
  if (!canPerform(access, "gradebook:manage")) {
    throw new AuthorizationError(
      "Your school role does not allow gradebook management.",
    );
  }
}

function auditStatement(
  database: SchoolDatabase,
  access: AccessContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  return database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    );
}

function studentNumber(personId: string) {
  const suffix =
    personId === "person-kwame"
      ? "260138"
      : personId === "person-ama"
        ? "260112"
        : "260145";
  return `LH-${suffix}`;
}

type ReportVersionRow = {
  approved_at: string | null;
  approved_by_person_id: string | null;
  attendance_present: number;
  attendance_total: number;
  class_teacher_comment: string;
  conduct: string;
  created_by_person_id: string;
  headteacher_comment: string;
  id: string;
  next_term_begins_on: string | null;
  overall_average_tenths: number;
  promotion_decision: string;
  report_card_id: string;
  status: ReportStatus;
  submitted_at: string | null;
};

type ReportSubjectRow = {
  grade: string;
  offering_id: string;
  position: number;
  remark: string;
  score_tenths: number;
  subject_code: string;
  subject_name: string;
  teacher_comment: string;
};
