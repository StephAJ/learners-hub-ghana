# Learners Hub: Product Scope and Delivery Plan

Status: Draft for stakeholder review  
Date: 23 July 2026  
Product type: Ghanaian school-centred learning and school management platform

## 1. Executive summary

Learners Hub will be a web and mobile-friendly platform for Ghanaian pre-tertiary schools. It combines a learning management system (LMS), the academic core of a student information system (SIS), admissions, assessment, gradebooks, report cards, guardian access, and interactive digital content.

Its defining idea is that learning begins with the Ghanaian school structure:

- A learner belongs to a class for an academic year, such as `JHS 2 Gold` or `SHS 1 General Arts A`.
- A class has compulsory subjects. Class enrolment automatically gives every learner access to all those subjects.
- A learner may take approved optional or additional subjects, but cannot drop a compulsory class subject.
- A subject is the learning container that other LMS products often call a course.
- A subject offering is the delivery of a subject to a specific class in a specific academic period, with assigned teachers, lessons, assessments, attendance, and a gradebook.
- A teacher may be a class teacher, a subject teacher, or both.
- Parents and guardians see only the children and records they are authorised to see.

The recommended product is a custom, multi-school-capable platform, built first as a modular monolith and progressive web app (PWA). H5P packages and/or an H5P service should provide broad interactive-content coverage. Open education standards should be supported at integration boundaries.

The first production release should focus on the end-to-end school loop:

`admit learner → place in class → auto-enrol in compulsory subjects → teach → assess → mark → calculate grades → approve and release report → guardian views report`

## 2. Product vision

### Vision

Give Ghanaian schools one dependable digital home for admissions, teaching, assessment, academic records, and parent engagement, using the language and structures schools already understand.

### Product principles

1. **Class-first, not course-first.** The class and academic year govern subject access.
2. **Ghanaian by default, configurable by design.** Support KG, Primary, JHS, SHS/SHTS structures, terms or semesters, programmes, core/elective rules, and local grading while allowing private-school variation.
3. **One source of academic truth.** Admissions, enrolment, learning activity, grades, reports, and progression use the same learner record.
4. **Mobile-first and bandwidth-conscious.** Essential flows must work well on entry-level Android devices and unstable connections.
5. **Assessment is a first-class subsystem.** Quizzes are not merely lesson widgets; they require secure delivery, rich item types, moderation, analytics, accommodations, and durable attempt records.
6. **Interactive but measurable.** Video, simulations, branching scenarios, and H5P activities should emit progress and result events.
7. **Safe for minors.** Privacy, safeguarding, scoped communication, auditability, and age-appropriate defaults are product requirements.
8. **Teacher efficiency matters.** Content reuse, bulk operations, rubrics, question banks, and fast marking must reduce administrative work.
9. **Standards at the edges.** Use QTI, LTI, OneRoster, xAPI, H5P, and common file exports where useful; do not make an external standard the internal domain model.

## 3. Assumptions for this first scope

These assumptions replace a discovery interview and should be explicitly accepted, changed, or rejected during review.

- Learners Hub is intended for multiple schools eventually, even if the pilot begins with one school.
- Initial scope is pre-tertiary education: KG, Primary, JHS, SHS, and SHTS. Tertiary education and corporate training are not initial targets.
- English is the first interface language. Content may be authored in any language; Ghanaian-language interface localisation is later.
- A school may have one or more campuses.
- Each school controls its calendar, classes, streams, subjects, grading rules, report templates, roles, branding, and admissions forms.
- The usual academic period is an academic year containing terms, but semesters must also be configurable.
- A learner has one primary class placement at a time within a school and academic year, with preserved history.
- Class subjects can be compulsory, elective-group based, optional, or enrichment subjects.
- Extra-subject access normally requires approval; schools may enable self-selection within configured limits.
- Learning content can be centrally templated and locally adapted by authorised schools and teachers.
- Guardians may have several children; a learner may have several guardians with different permissions and contact priorities.
- Fees, accounting, payroll, hostel, transport, library circulation, and inventory are adjacent school-management domains, not part of the initial core. Integration points will be retained.
- Payment collection is required initially only where admissions fees or deposits are enabled; full school-fee accounting is a separate product module.
- Offline capability initially covers reading/downloading selected learning content and queuing low-risk activity. High-stakes exams remain online unless a later secure offline-exam design is approved.
- Artificial intelligence may assist authoring and analysis later, but must not autonomously make admission, discipline, progression, or final grading decisions.

## 4. Research-grounded product position

The product should combine the strongest patterns of established systems without copying their terminology or constraints:

- LearnDash demonstrates group-based bulk enrolment, group leaders, progress reporting, assignments, and course/quiz reporting.
- Moodle demonstrates a mature question bank, varied item types, configurable question behaviour, rubrics, outcomes, assignments, gradebook workflows, and H5P support.
- Khan Academy demonstrates mastery goals and teacher reports that connect time, skill comprehension, assignments, and individual learner detail.
- Canva for Education demonstrates approachable authoring, templates, collaboration, assignment workflows, safe-for-school content, and LMS integration.
- Udemy demonstrates a clean self-paced lesson experience and distinct practice versus exam modes.
- H5P demonstrates reusable interactive content types such as interactive video, course presentation, drag-and-drop, dictation, virtual tours, and branching scenarios.

Ghana-specific requirements materially change the centre of the model:

- NaCCA defines Basic Education as two years of KG, six years of Primary, and three years of JHS, followed by secondary education.
- The standards-based curriculum uses strands, sub-strands, content standards, indicators, exemplars, and cross-cutting competencies.
- WAEC school examination structures require durable subject enrolment and cumulative continuous-assessment records. Current published guidance describes a 30% continuous-assessment and 70% external-examination split for BECE, while SHS includes core subjects plus programme/elective choices. These must be configurable rules, never irreversible hard-coded constants.

## 5. Domain model and academic rules

### 5.1 Core hierarchy

```text
Platform
└── School/Tenant
    ├── Campus
    ├── Academic Year
    │   └── Academic Period (Term/Semester)
    ├── Education Level (KG, Primary, JHS, SHS/SHTS)
    ├── Grade/Class Level (Basic 4, JHS 2, SHS 1)
    ├── Programme/Track (where applicable)
    ├── Class Group/Stream (JHS 2 Gold)
    │   ├── Class Teacher assignment
    │   ├── Learner class enrolments
    │   └── Subject offerings
    └── Subject catalogue
        └── Curriculum and reusable learning content
```

### 5.2 Important distinctions

| Concept | Meaning |
|---|---|
| Subject | Canonical discipline, e.g. Mathematics or Integrated Science |
| Class level | Curriculum stage, e.g. JHS 2 |
| Class group | Actual learner cohort, e.g. JHS 2 Gold |
| Subject curriculum | Reusable standards/content map for a subject and level |
| Subject offering | A subject taught to one or more class groups in an academic year/period |
| Class enrolment | A learner's official placement in a class group |
| Subject enrolment | A learner's entitlement to a subject offering |
| Teacher assignment | A teacher's authorised relationship to a class or subject offering |

Separating these concepts prevents a common LMS failure: duplicating the entire Mathematics subject and its content whenever a new stream or academic year is created.

### 5.3 Class and subject entitlement rules

1. Creating or activating a class enrolment evaluates the class subject policy.
2. The system creates subject enrolments for all compulsory offerings.
3. Compulsory subject enrolments are locked against learner self-removal.
4. Elective groups enforce minimum/maximum choices, permitted combinations, programme rules, prerequisites, capacity, and approval.
5. Optional or enrichment subjects may be requested, approved, waitlisted, rejected, or assigned.
6. Moving a learner to another class recalculates future entitlements but preserves all historical activity, attempts, marks, and reports.
7. Removing a subject from a class never deletes learner history; it closes or supersedes the entitlement from an effective date.
8. A manual exception requires an authorised role, reason, effective date, and audit event.
9. Content access and gradebook membership derive from the active subject enrolment, not from a loose user-content link.
10. A school can configure whether a subject offering spans the whole year or selected terms.

### 5.4 Academic lifecycle

- Configure academic year and periods.
- Create or roll over class groups.
- Define class subject policies.
- assign class and subject teachers.
- Admit, transfer, reactivate, or bulk-import learners.
- Place learners in classes and subject offerings.
- Teach, assess, record attendance, and report.
- Close grading periods.
- Promote, repeat, graduate, transfer, or withdraw learners.
- Archive the year as read-only while retaining correction workflows with audit.

## 6. Users, roles, and permissions

Permissions must combine role-based access control with record scope. Being a "teacher" does not grant access to every learner in the school.

### Platform and school roles

- Platform super administrator
- Platform support agent with time-limited, audited impersonation
- School owner/proprietor
- School administrator
- Headteacher/headmaster/headmistress
- Academic administrator
- Admissions officer
- Examination officer
- Head of department
- Teacher
- Class teacher
- Assistant/co-teacher
- Marker/moderator
- Counsellor or welfare officer
- Data/protection administrator
- Learner
- Parent/guardian
- Read-only auditor/inspector

### Scope rules

- School users are tenant-scoped.
- Teachers see only assigned subjects/classes unless given a broader departmental role.
- Class teachers see pastoral and class-level information defined by policy, but cannot silently change marks owned by another subject teacher.
- Parents see only linked children and only the information permitted by the guardianship relationship.
- A separated or restricted guardian may have communication, pickup, financial, academic, or medical permissions independently enabled or disabled.
- Learners cannot access another learner's submissions, marks, accommodations, or private feedback.
- Sensitive fields such as health, special educational needs, disciplinary notes, and safeguarding records require separately scoped permissions.
- Support impersonation must require reason capture, visible session indication, expiry, and an immutable audit trail.

## 7. Functional scope

### 7.1 School setup and administration

- School and campus profiles, logos, colours, addresses, contacts, regulatory identifiers.
- Academic year, term/semester, holiday, teaching-day, and grading-period configuration.
- Education levels, class levels, streams, houses, programmes, elective groups, and subject catalogue.
- Class creation, rollover, merge/split, archival, and capacity.
- Staff profiles, departments, qualifications, and assignment history.
- Configurable learner/staff ID formats and printable ID exports.
- Bulk import with preview, validation, duplicate detection, correction, and rollback report.
- Custom fields with data type, visibility, sensitivity, and retention settings.
- School-specific terminology and report templates.
- Feature flags and school-level module enablement.

### 7.2 Admissions portal

#### Applicant experience

- Public admissions landing page by school, campus, level, and intake.
- Account creation or assisted application by admissions staff.
- Save-and-return application.
- Responsive form with conditional sections and configurable questions.
- Applicant, guardian, previous-school, programme, class-level, health, support-needs, and emergency-contact data.
- Secure document/photo upload with allowed-type and malware checks.
- Application fee or deposit integration where enabled.
- Application status, checklist, messages, interview/test schedule, offer, and acceptance.
- Consent capture with versioned policy text, timestamp, actor, and evidence.

#### Admissions team

- Intake/campaign management, opening/closing dates, capacity, and eligibility rules.
- Pipeline: draft, submitted, incomplete, under review, assessment, interview, waitlisted, offered, conditionally offered, accepted, rejected, withdrawn, enrolled.
- Reviewer assignment, internal notes, checklists, scoring rubrics, and conflict controls.
- Duplicate applicant matching and merge review.
- Bulk communications using approved templates.
- Entrance assessment and interview scheduling.
- Offer-letter generation, conditions, expiry, acceptance, and deposit status.
- Decision approval workflow and audit.
- Conversion of an accepted application into learner, guardian, document, class-placement, and subject-entitlement records without re-keying.
- Admissions funnel, source, conversion, capacity, turnaround, and outstanding-document reports.
- Export and API integration.

### 7.3 Student records and enrolment

- Demographic, contact, identity, photo, previous-school, emergency, language, and support information.
- Guardian relationships and permission matrix.
- Enrolment history by school, campus, level, class, programme, and status.
- Subject enrolment history with compulsory/elective/extra reason.
- Transfers in/out with cumulative record package.
- Promotion, repetition, withdrawal, suspension, graduation, and alumni status.
- Document vault with category, expiry, visibility, and verification.
- Notes with audience and sensitivity levels.
- Learner support plans and assessment accommodations.
- Complete audit trail and authorised correction workflow.

### 7.4 Class and timetable management

- Class roster, profile, capacity, class teacher, assistant, and room.
- Period definitions and timetable grid.
- Subject lessons linked to class/room/teacher with clash detection.
- Teacher, class, learner, and room timetable views.
- Substitution and cancellation.
- Calendar events, examinations, deadlines, school activities, and holidays.
- Optional timetable import/export until automatic scheduling is justified.

### 7.5 Attendance

- Daily attendance for younger levels and period/subject attendance for older levels.
- Present, absent, late, excused, sick, school activity, remote, and configurable codes.
- Bulk class entry, individual correction, notes, evidence, and reason.
- Teacher and authorised office workflows.
- Parent notification rules and absence escalation.
- Attendance percentage, streak, lateness, chronic absence, and class trends.
- Report-card aggregation and export.
- Offline-friendly capture with conflict handling.

### 7.6 Subject and curriculum management

- Subject catalogue with level, code, description, department, and active dates.
- Curriculum versions by authority, year, subject, and level.
- Standards hierarchy: strand, sub-strand, content standard, indicator, exemplar, competency, and learning objective.
- Import from structured templates.
- Map lessons, resources, questions, assignments, and rubrics to standards.
- Coverage dashboard by teacher, class, term, and curriculum.
- Central content templates that schools can adopt, clone, or locally adapt.
- Versioning and dependency tracking when source content changes.

### 7.7 Lesson and content authoring

#### Structure

`Subject → Unit/Strand → Topic → Lesson → Learning blocks/Activities`

Each lesson can include:

- Title, summary, objectives, prerequisite knowledge, estimated time, keywords, and standards.
- Rich text, callout, image, gallery, audio, video, downloadable file, link, table, equation/MathML, code, embed, and glossary blocks.
- Teacher notes separate from learner content.
- Worked examples, practice activities, checks for understanding, and exit ticket.
- Prerequisites, completion rules, release date, due date, expiry, and drip schedule.
- Sequential, free, or teacher-controlled navigation.
- Draft, review, approved, scheduled, published, retired, and archived states.
- Co-authoring, comments, change history, preview-as-learner, and restore version.
- Content duplication and reuse across classes/years without losing provenance.

#### Media

- Direct upload to object storage with resumable/chunked upload.
- Adaptive video streaming, multiple qualities, thumbnailing, captions, transcript, chapters, and downloadable low-bandwidth alternative.
- Audio transcript and playback-speed controls.
- Alt text, long descriptions, captions, and accessibility checks before publishing.
- Virus/malware scan, file type/size rules, copyright/source metadata, and takedown workflow.

### 7.8 Interactive learning

The platform should integrate H5P rather than attempting to recreate its complete ecosystem in the first releases.

Supported interactive families should include:

- Interactive video with in-video questions, navigation, bookmarks, and completion.
- Course/slide presentation with embedded questions.
- Branching scenarios and decision paths.
- Drag and drop, drag words, image sequencing, and ordering.
- Hotspots, find-the-hotspot, image labels, and interactive diagrams.
- Fill-in-the-blanks, mark-the-words, dictation, flashcards, and dialog cards.
- Memory and matching games.
- Timelines, accordions, charts, image comparison, and 360-degree virtual tours.
- Audio recording and spoken response where browser/device support permits.
- Simulations or external tools via secure embed/LTI.

Interactive-content requirements:

- H5P package upload/download and reusable content library.
- Author permissions and content-type allowlist.
- Completion, score, response, time-spent, and interaction event capture where the content type emits them.
- xAPI-compatible event mapping where practical.
- Gradebook mapping only when a valid, explainable score exists.
- Attempt history and reset controls.
- Accessibility status by content type; inaccessible interaction must have an equivalent alternative.
- Version pinning so a package update cannot silently alter a completed assessment.
- Sandboxed rendering, dependency scanning, content security policy, and upload limits.

### 7.9 Assessment engine: quizzes and examinations

Assessment must be its own bounded module with immutable published versions and durable attempts.

#### Assessment purposes

- Diagnostic/pre-test
- Formative practice
- Lesson check/exit ticket
- Homework quiz
- Summative class test
- Mock examination
- Timed examination
- Survey/poll
- Adaptive or mastery check
- Question-by-question oral/practical marking form

#### Question types

**Selected response**

- Multiple choice, single answer
- Multiple response, several correct
- True/false and yes/no
- Matching
- Ordering/sequencing
- Classification/grouping
- Matrix/grid response
- Select missing word

**Constructed response**

- Short text with multiple accepted answers and case/normalisation rules
- Long response/essay
- Fill in the blanks
- Embedded-answer/Cloze passage
- Numerical answer with tolerance and units
- Calculated answer using variable datasets
- Formula or algebraic response
- Table completion
- File upload
- Image, drawing, or annotation response
- Audio/video/oral response
- Code response and test cases as a later controlled extension

**Visual and interactive**

- Drag words into text
- Drag items into zones
- Drag markers onto an image
- Hotspot selection
- Label a diagram
- Image sequencing
- Coordinate/graph response
- Interactive content/H5P scored activity

**Composite**

- Reading passage/case study with linked sub-questions
- Listening comprehension
- Data set, chart, map, or stimulus with sub-questions
- Branching scenario
- Random question set
- Instruction/information item with no score

#### Question bank

- School, department, teacher-private, and shared banks.
- Folder and taxonomy by subject, level, curriculum standard, topic, difficulty, cognitive level, language, source, author, and status.
- Draft, peer review, approved, retired, and compromised states.
- Versioning; published attempts remain bound to the exact question version.
- Reusable stimuli and question groups.
- Bulk import/export, including QTI where feasible and a documented spreadsheet template.
- Duplicate/similarity warning.
- Metadata for expected time, marks, negative marks, discrimination, difficulty, and usage history.
- Question comments and reviewer workflow.
- Restricted high-stakes bank with stronger permissions and access logging.

#### Quiz assembly and delivery settings

- Manual assembly or blueprint/random draw by taxonomy and mark totals.
- Per-learner randomisation of questions, options, variables, or matched sets.
- Sections/pages, instructions, mark distribution, and navigation policy.
- Open/close window, time limit, grace period, and server-authoritative clock.
- Number of attempts, attempt cooldown, continuation, and best/latest/average/first scoring.
- Practice mode with immediate feedback versus exam mode with delayed feedback.
- Pass mark, mastery threshold, prerequisite, and completion action.
- Password/access code, supervised start, allowed network/device policy where required.
- Backtracking, question flagging, unanswered warnings, and submit confirmation.
- Autosave after each response and recovery after network interruption.
- Accommodations per learner: extra time, rest breaks, alternative format, reader, scribe, reduced-distraction room, or manual override.
- Attempt state: not started, in progress, paused, submitted, auto-submitted, needs marking, marked, moderated, released, invalidated.
- Reasoned teacher reset, reopen, extra attempt, or invalidate action with audit.

#### Scoring and feedback

- Auto, manual, and hybrid marking.
- Partial credit, weighted choices, all-or-nothing, penalties, negative marking, tolerance, and rubric scoring.
- Per-answer, per-question, section, and overall feedback.
- Feedback release immediately, after attempt, after closing time, after marking, or on a scheduled date.
- Show/hide response, correctness, marks, correct answer, explanation, and rubric independently.
- Manual-marking queues, blind marking, second marking, moderation, discrepancy resolution, and grade lock.
- Regrade after an answer-key change with impact preview and audit.
- Optional anonymised marking.
- Learner challenge/remark request workflow.

#### Integrity controls

- Attempt and security event logging.
- Full-screen encouragement and focus-loss telemetry as signals, not proof of misconduct.
- Question/option randomisation and large item pools.
- Copy/paste and print policy controls where appropriate, with accessibility exceptions.
- Identity confirmation and invigilation integration as optional high-stakes capabilities.
- No claim that a standard browser can create a perfectly secure exam environment.
- Plagiarism/similarity integrations for essays and files, with human review and transparent policy.

#### Assessment analytics

- Score distribution, mean, median, standard deviation, completion, pass rate, and time.
- Item facility/difficulty, discrimination, distractor performance, omission, and average time.
- Performance by curriculum standard, topic, class, programme, and learner.
- Question exposure and compromise indicators.
- Comparison across offerings only when assessment versions and populations make it valid.
- Export of raw responses and item-level results under permission controls.

### 7.10 Assignments, projects, and practical work

- Individual or group assignment.
- Online text, file, link, image, audio, video, portfolio, practical observation, or offline submission.
- Instructions, attachments, exemplar, standards, due date, cut-off, and estimated effort.
- Draft, submitted, returned for changes, resubmitted, late, excused, marked, moderated, and released states.
- Multiple submissions and resubmission policy.
- Rubric, marking guide, points, scale, or completion grading.
- Group membership and one-submission or individual-contribution modes.
- Inline annotation, audio/video feedback, file feedback, private comments, and class-level feedback.
- Peer assessment with allocation, anonymity option, calibration, and teacher override.
- Submission receipt and immutable timestamp.
- Late penalties and extensions with reason/audit.
- Similarity/plagiarism service integration.
- Bulk download/upload of marking sheets and offline marking where safe.

### 7.11 Gradebook and continuous assessment

- Gradebook scoped to subject offering and academic period.
- Categories such as classwork, homework, quizzes, projects, practicals, mid-term, and examination.
- Configurable points, percentages, weighted categories, formulas, dropped-lowest items, extra credit, and minimum required items.
- School templates that can be applied to many offerings.
- Raw mark, adjusted mark, excluded/absent/excused status, comment, and evidence.
- Missing-mark and anomaly checks before closing.
- Configurable continuous-assessment/examination weighting, including but not limited to 30/70.
- Grading scales by level, subject, or period.
- Teacher submit → head of department review → examination officer lock → leadership approve → release workflow.
- Grade changes after lock require reason, authorisation, before/after values, and audit.
- Standards/mastery view alongside conventional grades.
- Import/export with validation and preview.
- No destructive recalculation of already issued reports; corrections create a new report version.

### 7.12 Report cards, transcripts, and academic records

- Configurable report templates by school and level.
- School branding, term details, learner identity, subjects, raw/weighted scores, grade, position if enabled, class average, attendance, conduct, competencies, comments, promotion decision, and next-term details.
- Subject-teacher comments, class-teacher comments, and headteacher approval/signature.
- Comment banks with editable suggestions, banned phrase checks, and length rules.
- Optional class/subject position; privacy-sensitive ranking should be school policy, not a universal default.
- Draft preview, completeness checks, approval, scheduled release, guardian notification, and acknowledgement.
- Tamper-evident PDF with report ID/QR verification.
- Version history for corrected reports.
- Cumulative record, transcript, and transfer package.
- Parent view and authorised print/download.
- Bulk generation must be asynchronous, resumable, and report failures clearly.

### 7.13 Mastery and personalised learning

- Map activities and questions to curriculum indicators and competencies.
- Define mastery scales and evidence rules by school/curriculum.
- Learner, class, and subject mastery views.
- Recommended remediation based on missed indicators.
- Teacher-created intervention groups and reassignment.
- Diagnostic → learning path → practice → reassessment loop.
- Keep algorithmic recommendations explainable and teacher-controlled.
- Do not infer high-impact labels or learning disabilities from activity data.

### 7.14 Communication and collaboration

- School, campus, level, class, subject, and targeted announcements.
- In-app and email notifications; SMS and WhatsApp through approved providers as optional channels.
- Notification preference, urgency, digest, quiet-hour, and delivery status.
- Teacher-to-class and authorised teacher-to-guardian messaging.
- Learner messaging defaults to closed or tightly moderated channels based on age and school policy.
- Discussion boards with teacher moderation, reporting, lock, pin, and participation settings.
- Calendar invitations and reminders.
- Message templates, approval for mass messages, and complete delivery audit.
- No public learner directory by default.

### 7.15 Learner portal

- Home dashboard: today's timetable, continue learning, due work, announcements, and progress.
- "My Class" and "My Subjects" with compulsory/optional labels.
- Subject home: teacher, overview, units, lessons, resources, assessments, grade summary, standards, and discussion.
- Lesson player with progress, notes, bookmarks, transcript, downloads, and accessible alternatives.
- Assessment centre with upcoming, active, submitted, and returned work.
- Calendar and timetable.
- Grades, feedback, mastery, attendance, report cards, and certificates/achievements if enabled.
- Profile and privacy-aware account settings.
- Help, support ticket, and safeguarding/report-a-concern route.

### 7.16 Teacher portal

- Dashboard: today's classes, attendance, unmarked work, upcoming lessons, at-risk learners, and announcements.
- Class and subject roster.
- Curriculum coverage and planning.
- Lesson/content authoring and preview.
- Question bank and assessment builder.
- Assignment, quiz, exam, rubric, marking, moderation, and gradebook tools.
- Attendance and learner notes within scope.
- Student/class analytics.
- Report comments and approvals.
- Communication tools.
- Resource library and content sharing.
- Professional account settings and notification preferences.

### 7.17 Parent/guardian portal

- One account with a child switcher.
- Child dashboard: timetable, attendance, current subjects, learning progress, upcoming/overdue work, recent results, teacher comments, and announcements.
- Report-card and transcript access.
- Absence explanation, consent response, acknowledgement, and document upload.
- Admissions status for applicants.
- Approved messaging and meeting request.
- Notification preferences and contact verification.
- Granular guardianship rights and visible explanation when information is restricted.
- Parent access changes take effect immediately and are audited.

### 7.18 Analytics and reporting

#### School leadership

- Enrolment, admissions funnel, retention, transfers, attendance, performance, report completion, curriculum coverage, platform adoption, and content usage.
- Filters by campus, level, class, programme, subject, period, and demographic fields where lawful.
- Cohort comparison with clear population and time definitions.

#### Teachers

- Completion, time-on-learning, assignment status, grade distribution, standards gaps, question analysis, and intervention groups.

#### Learners and guardians

- Clear progress trends, deadlines, strengths, areas for improvement, attendance, and teacher feedback without exposing other learners.

#### Data governance

- Suppress small-group comparisons where disclosure risk exists.
- Role-scoped export, watermarking for sensitive exports, expiry for generated downloads, and export audit.
- Scheduled reports and API access for authorised integrations.
- Analytics definitions catalogue so "active learner", "completion", and "average" remain consistent.

### 7.19 Search, help, and support

- Permission-aware search across learners, staff, classes, subjects, lessons, and resources.
- Search suggestions, filters, spelling tolerance, and recent items.
- Contextual help, onboarding checklists, knowledge base, release notes, and support tickets.
- Platform status and incident communication.
- Safe administrative tools for support, including tenant health and job retry, without direct database editing.

### 7.20 Integrations

- Email, SMS, and optional WhatsApp providers.
- Mobile money/payment gateway for application fees or deposits.
- Identity: email/password first, with Google/Microsoft SSO and enterprise federation later.
- H5P service or packages.
- Video streaming/transcoding provider.
- Malware scanning and optional similarity/plagiarism provider.
- Video-conferencing links or LTI tool launch.
- OneRoster for roster and grade exchange where partners support it.
- QTI for question/assessment import-export, with documented supported profiles.
- LTI Advantage for launching external tools and returning grades.
- xAPI-compatible learning event export where justified.
- SCORM import/player only if customer demand warrants its operational complexity.
- CSV/XLSX/PDF exports for school operations.
- Versioned REST API, webhooks, service accounts, rate limits, and integration audit.

## 8. Notifications and event model

Every important action should emit a domain event, such as:

- `ApplicationSubmitted`
- `OfferAccepted`
- `StudentEnrolledInClass`
- `CompulsorySubjectEnrolmentCreated`
- `LessonPublished`
- `AssignmentSubmitted`
- `QuizAttemptSubmitted`
- `GradeChanged`
- `GradebookLocked`
- `ReportReleased`
- `AttendanceMarkedAbsent`
- `GuardianAccessRevoked`

Events power notifications, audit, analytics, and integrations. Transactional actions must be idempotent so retries cannot create duplicate subject enrolments, payments, submissions, or notifications.

## 9. Non-functional requirements

### 9.1 Initial scale targets

These are planning targets, not load-test claims:

- Pilot: 1–5 schools and up to 5,000 learners.
- Early production: 50 schools and 50,000 learners.
- Architecture target without fundamental rewrite: 100,000 active learners, 10,000 concurrent users platform-wide, and 2,000 concurrent attempts in one large assessment window.
- Large files and video must bypass application servers using signed direct upload/download.

### 9.2 Performance

- Core learner and teacher pages should become usable within 2.5 seconds on a representative mid-range Android device and constrained 4G connection after authentication.
- API read requests: p95 below 500 ms for ordinary operations under expected load.
- Assessment response save acknowledged within 2 seconds under expected load, with client retry and visible save state.
- Search results within 1 second for normal queries.
- Bulk jobs run asynchronously with progress, cancellation where safe, and downloadable error reports.
- Images and video are responsive, compressed, and lazily loaded.

### 9.3 Availability and resilience

- Target monthly availability: 99.9% excluding announced maintenance.
- Assessment delivery, submission, and grade recording are priority critical paths.
- Multi-availability-zone production database where hosting allows.
- Automated backups, point-in-time recovery, encrypted copies, and quarterly restore tests.
- Initial RPO: 15 minutes; initial RTO: 4 hours. Tighter objectives may be set for assessment periods.
- Degraded mode should preserve reading cached lessons and queued low-risk actions when practical.

### 9.4 Security

- Tenant isolation enforced in application policy and database access patterns.
- Least privilege; role plus resource/relationship scope.
- MFA mandatory for platform administrators and school administrators; strongly recommended or configurable for teachers.
- Secure password hashing, session rotation, device/session list, logout-all, and brute-force protection.
- TLS in transit and encryption at rest.
- Secrets manager, short-lived credentials, signed URLs, and environment separation.
- OWASP ASVS-aligned secure development and testing.
- Dependency, container, static, dynamic, and infrastructure scanning.
- Malware scanning for uploads.
- Immutable security and academic audit events with retention policy.
- Annual penetration test before large-scale rollout and after major security-sensitive change.
- Incident response, breach assessment, notification workflow, and evidence preservation.

### 9.5 Privacy and child safeguarding

- Register applicable data controllers/processors with Ghana's Data Protection Commission before production processing.
- Maintain data inventory, purpose, lawful basis/authority, retention, processor, location, and access roles.
- Data minimisation, purpose limitation, accuracy, retention schedules, and secure deletion/anonymisation.
- Versioned privacy notices and consent/acknowledgement evidence.
- Data-subject access, correction, export, restriction, and deletion workflows subject to lawful educational-record retention.
- Special personal data receives stronger field-level access and audit.
- No behavioural advertising or sale of learner data.
- No use of learner content to train third-party AI models without explicit contractual and policy approval.
- Age-appropriate design, restricted direct messaging, reporting tools, moderation workflow, and staff conduct rules.
- Guardian identity and relationship verification.
- Data-processing agreements and subprocessor register.
- Cross-border data hosting/transfer reviewed by Ghanaian privacy counsel.

### 9.6 Accessibility and inclusion

- WCAG 2.2 AA target for complete user journeys, not isolated pages.
- Keyboard access, screen-reader semantics, visible focus, colour contrast, large targets, reduced motion, and accessible authentication.
- Captions/transcripts, alt text, accessible documents, MathML, and non-drag alternatives.
- Learner accommodations are applied consistently to assessments.
- Authoring lint/checklist identifies missing accessibility data before publishing.
- Interfaces work at 200% zoom and in portrait mobile orientation.
- Plain-language errors and recovery guidance.

### 9.7 Low bandwidth, mobile, and offline

- Responsive PWA before native apps.
- Cache the application shell, timetable, selected lessons, text, thumbnails, and small resources.
- Allow authorised lesson packs to be downloaded on Wi-Fi.
- Clear offline state and sync queue.
- Conflict rules for attendance, notes, and progress.
- Resumable uploads and downloads.
- Text/transcript alternative to every required video lesson.
- Video quality selector and audio-only option where licensed.
- Offline high-stakes assessment is excluded from the initial release.

### 9.8 Maintainability and operations

- Modular monolith with strict domain boundaries and internal APIs.
- Automated database migrations and backward-compatible deployment strategy.
- Central logs, metrics, traces, audit search, health checks, and alerting.
- Error budgets and service-level dashboards for assessment windows.
- Feature flags and staged rollout by school.
- Automated unit, integration, contract, end-to-end, accessibility, performance, and security tests.
- Runbooks for enrolment, assessment, report generation, backup restore, and incident response.
- API and domain documentation maintained with the code.

## 10. Recommended architecture

### 10.1 Recommendation: custom modular monolith

Build a custom web platform with independently owned modules in one deployable application initially:

- Identity and access
- School/tenant configuration
- People and guardianship
- Admissions
- Academic structure and enrolment
- Curriculum and content
- Interactive content integration
- Assessment and question bank
- Assignments and grading
- Attendance and timetable
- Reports and documents
- Communications
- Analytics/integration

Recommended infrastructure shape:

- Responsive PWA for learner, parent, teacher, and administrator experiences.
- Server-side application/API with background workers.
- PostgreSQL for transactional and reporting foundations.
- Redis-compatible cache/queue support where useful.
- S3-compatible object storage and CDN for media/documents.
- Search initially through PostgreSQL, moving to a dedicated search service only when evidence demands it.
- H5P as an isolated integration/service boundary.
- Outbox/event pattern for reliable jobs, notifications, analytics, and webhooks.
- Tenant key on all tenant-owned records plus automated isolation tests.
- Managed observability and error tracking.

The exact framework should be chosen only after team capability and hosting constraints are known. The domain architecture is more important than choosing a fashionable framework.

### 10.2 Alternatives considered

#### Moodle-based core

**Strengths:** mature quizzes, gradebook, roles, activities, competencies, H5P, plugins, and import/export.  
**Weaknesses:** Ghanaian admissions, guardian permissions, class-subject entitlement, polished multi-school product UX, and unified school operations require substantial customisation. Upgrades and plugin compatibility become ongoing product constraints.  
**Best fit:** fastest institutional deployment when schools accept Moodle's mental model and interface.

#### WordPress with LearnDash or Tutor LMS Pro

**Strengths:** rapid content publishing, themes, broad plugin ecosystem, familiar administration, and good basic course/quiz commerce flows.  
**Weaknesses:** a school SIS/admissions/reporting data model becomes distributed across WordPress users, metadata, posts, plugins, and custom tables. Fine-grained guardian, academic-year, assessment-locking, moderation, and audit requirements would require a large custom application inside WordPress.  
**Best fit:** a content-led academy selling optional courses, not the recommended core for this school-centred platform.

#### Microservices from the start

**Strengths:** independent scale and deployment boundaries.  
**Weaknesses:** higher operational cost, distributed transactions, harder reporting, more infrastructure, slower iteration, and a larger team requirement.  
**Best fit:** later extraction of proven hotspots such as media, notifications, search, analytics, or assessment delivery.

## 11. Data integrity rules that must never be weakened

- Historical enrolments, submitted attempts, marks, and issued reports are never hard-deleted through ordinary UI.
- Published assessments and questions are versioned; an attempt always references the delivered version.
- A compulsory subject cannot be dropped by the learner or guardian.
- A grade change after submission/lock is attributed, reasoned, time-stamped, and reviewable.
- Report correction creates a new version and does not replace the audit history.
- Guardian access is relationship-based, time-aware, and revocable.
- Tenant boundaries apply to queries, exports, background jobs, caches, files, and logs.
- Bulk import never silently skips invalid rows.
- Time limits use server time while the client retains recoverable local response state.
- Generated analytics never become the authoritative grade or enrolment record.

## 12. Release scope and prioritisation

### 12.1 Minimum viable production release

The MVP is not a demonstration. It must support one complete real-school term:

1. School, year, term, class, subject, staff, learner, and guardian setup.
2. Class placement and automatic compulsory-subject enrolment.
3. Teacher/class-teacher assignments and scoped permissions.
4. Learner, teacher, parent, and administrator dashboards.
5. Subject units, lessons, resources, video, and progress.
6. Core H5P display and result capture for approved content types.
7. Question bank and essential item types: single/multiple choice, true/false, matching, ordering, fill blank, short answer, numerical, essay, file upload, passage sets.
8. Quiz windows, attempts, timing, randomisation, autosave, accommodations, feedback timing, auto/manual marking, and attempt review.
9. Assignments, rubrics, submission, resubmission, marking, and feedback.
10. Gradebook categories, formulas, configurable CA/exam weights, approval, and lock.
11. Daily attendance.
12. Report-card generation, approval, release, guardian view, and PDF.
13. Admissions application, review, offer, acceptance, and conversion to learner.
14. Announcements and email notifications.
15. Audit, privacy controls, backups, accessibility, monitoring, and operational support.

### 12.2 Next release

- Timetable and period attendance.
- Full elective-group rules and learner requests.
- Curriculum/standards mapping and mastery dashboards.
- Expanded H5P authoring/reuse.
- Remaining visual/audio question types.
- Assessment item analysis and moderation enhancements.
- SMS/WhatsApp and mobile money integrations.
- PWA lesson downloads and stronger offline attendance.
- Bulk rollover, promotion, transfers, and transcripts.
- Discussion boards and intervention groups.
- OneRoster/QTI/LTI integration profiles.

### 12.3 Later extensions

- Native mobile applications if PWA evidence shows a gap.
- Secure exam application or managed-device mode.
- Code runner and advanced STEM simulations.
- AI-assisted lesson/question drafting with teacher review and provenance.
- AI-assisted rubric feedback, never final autonomous grading for consequential work.
- Library, transport, hostel, clinic, discipline, fees/accounting, HR/payroll, and inventory modules.
- Government/district aggregation and inspection portals.
- Public marketplace for approved curriculum resources.

## 13. Delivery plan

Timing assumes a stable, dedicated cross-functional team. Phases may overlap, but data model, privacy, and assessment reliability cannot be rushed.

### Phase 0: product definition and service design — 4 to 6 weeks

- Validate workflows with representative basic and secondary schools.
- Finalise terminology, permission matrix, report formats, admissions forms, grading policies, and elective rules.
- Map NaCCA curriculum hierarchy and sample subjects.
- Prototype learner, teacher, parent, admissions, assessment, and report flows.
- Define data governance, retention, safeguarding, and support model.
- Select hosting region, stack, H5P approach, and payment/messaging providers.
- Produce threat model, architecture decision records, and measurable acceptance criteria.

**Exit:** tested clickable prototype, accepted domain model, prioritised backlog, security/privacy plan, and pilot-school agreement.

### Phase 1: platform and academic foundation — 8 to 10 weeks

- Identity, tenant, campus, roles, scoped permissions, and audit.
- Academic years/periods, levels, classes, subjects, and offerings.
- Staff, learner, guardian, class, and subject enrolment.
- Compulsory/elective entitlement rules.
- Imports, basic dashboards, notifications, and operational tooling.

**Exit:** administrators can configure a school and place learners in classes with correct subject access.

### Phase 2: teaching and learning — 10 to 14 weeks

- Curriculum/content model and lesson authoring.
- Media pipeline, lesson player, progress, and resource library.
- H5P display/integration and result events.
- Teacher and learner subject experiences.
- Assignments and basic rubrics.
- PWA and low-bandwidth optimisation.

**Exit:** teachers can publish lessons and assignments; learners can complete them on mobile; progress is recorded.

### Phase 3: assessment, gradebook, and reports — 12 to 16 weeks

- Question bank, core question types, quiz assembly and delivery.
- Autosave, timing, accommodations, marking, moderation, feedback, and review.
- Gradebook formulas, CA/exam policies, approvals, and locks.
- Attendance and report cards.
- Load, recovery, accessibility, security, and assessment-window testing.

**Exit:** a school can complete a controlled assessment and issue an approved term report.

### Phase 4: admissions, guardians, and school operations — 8 to 12 weeks

- Public admissions workflow, document collection, review, offer, and conversion.
- Full guardian dashboard and communication/consent flows.
- Timetable, period attendance, promotion/rollover, transfer, and transcript improvements.
- Leadership reporting.

**Exit:** the entire applicant-to-enrolled-to-reported learner lifecycle works without duplicate data entry.

### Phase 5: pilot and production hardening — 8 to 10 weeks

- Controlled pilot with one basic and one secondary school if possible.
- Data migration rehearsal and training.
- Assessment and report-day support.
- Fix workflow and usability defects.
- Penetration test, disaster recovery exercise, performance certification, privacy readiness, and accessibility audit.
- Operating procedures, help content, service desk, and school onboarding kit.

**Exit:** production go-live approval based on measured readiness, not calendar date.

### Indicative outcome

- Limited alpha: approximately month 4.
- End-to-end school beta: approximately months 6–8.
- Hardened production release: approximately months 9–12.

These are planning ranges. The major schedule drivers are breadth of quiz types, report policy variation, H5P integration depth, data migration quality, and pilot feedback.

## 14. Team and ownership

Recommended core team:

- Product manager/business analyst with Ghanaian school operations knowledge
- Product designer/researcher
- Technical lead/architect
- 3–5 full-stack engineers
- Quality engineer with automation responsibility
- DevOps/platform engineer, full- or part-time depending on managed services
- Curriculum and assessment specialist
- Implementation/training lead
- Part-time security/privacy, accessibility, and legal advisers

Schools need named owners for:

- School configuration and data quality
- Admissions
- Academic structure and timetable
- Assessment and grade approval
- Content quality and curriculum alignment
- Privacy/safeguarding
- Parent communication and support

## 15. Testing and release gates

### Automated coverage

- Unit tests for grading, entitlement, time, weighting, promotion, and permission rules.
- Integration tests for database, jobs, storage, H5P, messaging, and payment.
- Contract tests for APIs and webhooks.
- End-to-end journeys for every role.
- Tenant-isolation and authorisation tests.
- Accessibility checks plus manual screen-reader and keyboard testing.
- Load and soak tests for assessment start, autosave, submission, grading, and report generation.
- Property/fuzz tests for calculation and random question selection where useful.
- Backup-restore and disaster-recovery tests.

### Mandatory go-live scenarios

- Class enrolment creates all and only required subject enrolments.
- Class transfer preserves history and correctly changes future access.
- A guardian cannot access an unlinked learner through UI, API, export, URL, or notification.
- Network loss during a quiz does not lose acknowledged answers.
- Simultaneous submission around the deadline produces one valid attempt.
- Grade changes after lock follow the approved workflow.
- Report regeneration preserves the original issued version.
- Tenant A data never appears in Tenant B search, job, cache, file, analytics, or export.
- Bulk import produces a complete success/error reconciliation.
- Backup restoration recovers a consistent assessment and gradebook state.

## 16. Success measures

### Adoption

- Percentage of enrolled learners who access at least one subject weekly.
- Percentage of assigned teachers publishing or assigning learning each week.
- Parent activation and monthly report/attendance views.
- Admissions applications completed without staff re-entry.

### Learning operations

- Lesson and assignment completion.
- Median marking turnaround time.
- Percentage of assessments mapped to curriculum indicators.
- Curriculum coverage by term.
- Percentage of report cards released on schedule.

### Quality and efficiency

- Time to create a class and correctly enrol its learners in subjects.
- Time to build, review, and release an assessment.
- Grade/report correction rate.
- Support requests per 100 active users.
- Mobile page performance and failed-upload rate.
- Assessment answer-save and submission success rate.

### Trust

- Availability during scheduled assessment windows.
- Privacy/security incidents and time to containment.
- Access-control and tenant-isolation test pass rate.
- Accessibility defects in critical journeys.
- Guardian and teacher satisfaction.

## 17. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope expands into every school ERP domain | Protect the applicant-to-report core; integrate before building finance, payroll, transport, and inventory |
| Every school has different grading/report rules | Configurable policy templates, versioned formulas, pilot samples, and explicit approval |
| Quiz breadth delays a usable release | Build a reliable assessment kernel first, then add item renderers in priority order |
| H5P content is inconsistent or inaccessible | Allowlist content types, sandbox, capture versions, publish accessibility status, provide alternatives |
| WordPress/Moodle shortcuts create long-term constraints | Use them as benchmarks or integration targets, not as the system of academic record |
| Poor connectivity causes lost work | PWA, local response buffer, autosave, resumable transfers, clear sync state, low-bandwidth media |
| Parents see the wrong child or sensitive data | Relationship-scoped authorisation, guardian verification, revocation, export controls, automated tests |
| School data imports are incomplete or duplicated | Staged import, deterministic matching, validation, reconciliation, and migration rehearsal |
| Teachers resist additional admin work | Fast bulk workflows, content reuse, mobile attendance, comment banks, training, and school champions |
| Exam traffic overloads the system | Capacity model, assessment-specific load tests, queue isolation, autoscaling/managed services, readiness checks |
| Analytics incorrectly label learners | Explainable metrics, minimum data thresholds, teacher judgement, no autonomous high-impact decision |
| Regulatory requirements are treated late | DPC registration, privacy owner, records of processing, retention policy, legal review before production |

## 18. Explicit non-goals for the first production release

- Replacing WAEC examination registration or result systems.
- A general public course marketplace like Udemy.
- A full design suite competing with Canva.
- Rebuilding every H5P content type.
- Guaranteed cheat-proof browser examinations.
- Full accounting, payroll, procurement, inventory, transport, hostel, or library system.
- Autonomous AI admission, discipline, final grading, or promotion decisions.
- Native iOS and Android apps before the PWA is validated.
- Microservices merely for architectural fashion.

## 19. Decision log

| Decision | Alternatives | Rationale |
|---|---|---|
| Make class placement the primary learning entitlement | Individual course purchase/enrolment | Matches Ghanaian school operations and guarantees compulsory subjects |
| Separate subject, curriculum, offering, and enrolment | Treat each class subject as a copied course | Enables reuse while preserving year/class-specific teaching and grades |
| Recommend a custom modular monolith | WordPress LMS, Moodle core, initial microservices | Best balance of domain fit, delivery speed, integrity, and maintainability |
| Design for multiple schools but pilot narrowly | Single-school-only or immediate nationwide scale | Avoids a rewrite without overbuilding operations |
| Integrate H5P | Rebuild all interactions | Gains a broad, reusable ecosystem while keeping an internal learning event model |
| Make assessment a bounded subsystem | Add simple quizzes inside lessons | Required for versioning, timing, moderation, analytics, and durable records |
| Store policy-driven grading rules | Hard-code 30/70 or one school's scheme | Schools, levels, and regulations vary; historical formulas must remain reproducible |
| Use a PWA first | Native apps first | Maximises reach and reduces platform duplication while supporting low-bandwidth work |
| Keep high-stakes exams online initially | General offline exams | Integrity, clock, identity, and conflict risks need a separate design |
| Use role plus relationship scope | Broad role-only access | Teachers and guardians need access to specific records, not the whole tenant |
| Support standards at integration boundaries | Force internal model to equal QTI/OneRoster/LTI | Preserves domain clarity while enabling interoperability |

## 20. Review checklist

The stakeholder review should approve or change:

- Target market: single school product versus multi-school SaaS.
- Levels included in the first pilot.
- Meaning of class, stream, programme, and subject offering.
- Compulsory, elective, and additional-subject approval policies.
- Role and permission matrix, particularly class teachers and guardians.
- First report-card templates and grading rules.
- Required first-release question types.
- Admissions decision and payment workflow.
- Attendance model: daily only versus period attendance.
- H5P hosting/licensing approach.
- Data hosting, retention, privacy owner, and DPC registration plan.
- Pilot school, implementation team, and first production term.

## 21. Authoritative references

- [NaCCA: Development of the Ghanaian Curriculum](https://nacca.gov.gh/curriculum/)
- [NaCCA: National Pre-tertiary Education Curriculum Framework](https://www.nacca.gov.gh/wp-content/uploads/2019/04/National-Pre-tertiary-Education-Curriculum-Framework-1.pdf)
- [Ghana Education Service: Organisational Structure and School Levels](https://ges.gov.gh/page.php?slug=organisational-structure)
- [WAEC Ghana: BECE Guidelines, Scheme and Structure](https://waecgh.org/wp-content/uploads/2024/05/2024-BECE-GUIDELINES-SCHEME-AND-STRUCTURE.pdf)
- [WAEC Ghana: WASSCE School Subjects and Entry Structure](https://waecgh.org/home/wassce-school/)
- [Ghana Data Protection Commission: Registration](https://dataprotection.org.gh/registration/)
- [Ghana Data Protection Act, 2012 (Act 843)](https://dataprotection.org.gh/wp-content/uploads/2025/05/Data-Protection-Act-2012-Act-843.pdf)
- [W3C: Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [H5P: Content Author Guide](https://h5p.org/documentation/for-authors)
- [H5P: Content Type Tutorials](https://h5p.org/documentation/for-authors/tutorials)
- [Moodle: Current Question Types](https://docs.moodle.org/501/en/question_types)
- [Moodle: Assignment Activity and Rubrics](https://docs.moodle.org/501/en/assignment)
- [Moodle: Outcomes](https://docs.moodle.org/501/en/Outcomes)
- [LearnDash: User Groups](https://learndash.com/support/kb/core/uncategorized/groups/)
- [Khan Academy: Teacher Performance Reports](https://support.khanacademy.org/hc/en-us/articles/360031129891-What-reporting-options-are-available-on-Khan-Academy-for-teachers-to-track-student-performance)
- [Canva for Education](https://www.canva.com/education/)
- [Udemy: Practice versus Exam Mode](https://support.udemy.com/hc/en-us/articles/231954647-Practice-Tests-Frequently-Asked-Questions)
- [1EdTech: OneRoster, LTI, QTI, and related standards](https://www.1edtech.org/blog/rostering-resources-and-gradebook-standards)
- [1EdTech: QTI Specification Documents](https://www.1edtech.org/standards/qti/index)

