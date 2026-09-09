import { RoleCode } from '@prisma/client';

/**
 * Swanford Academy — Canonical Permission Catalog
 * Master Specification Reference: Sections 2, 5, 6, 18, 25
 *
 * System Invariant:
 * - ROLE != PERMISSION != SCOPE
 * - Permissions are fine-grained operational privileges.
 * - Roles are system-controlled collections of permissions.
 * - Ordinary administrators cannot arbitrarily grant permissions or redefine the catalog.
 */

export const PermissionCode = {
  // 1. SYSTEM / ADMINISTRATION
  SYSTEM_CONFIG_MANAGE: 'system_config:manage',
  USER_MANAGE: 'users:manage',
  ROLE_MANAGE: 'roles:manage', // Strictly assigning/removing system-defined roles to users
  AUDIT_LOG_VIEW: 'audit_logs:view',

  // 2. PEOPLE (Students, Guardians, Teachers)
  STUDENT_VIEW: 'students:view',
  STUDENT_CREATE: 'students:create',
  STUDENT_EDIT: 'students:edit',
  STUDENT_MEDICAL_VIEW: 'students:medical_view',
  STUDENT_MEDICAL_EDIT: 'students:medical_edit',
  STUDENT_ARCHIVE: 'students:archive',
  GUARDIAN_VIEW: 'guardians:view',
  GUARDIAN_EDIT: 'guardians:edit',
  GUARDIAN_RELATIONSHIP_MANAGE: 'guardian_relationships:manage',
  TEACHER_MANAGE: 'teachers:manage',

  // 3. ACADEMIC
  ACADEMIC_SESSION_MANAGE: 'academic_sessions:manage',
  PROGRAMME_MANAGE: 'programmes:manage',
  CLASS_MANAGE: 'classes:manage',
  SUBJECT_MANAGE: 'subjects:manage',
  ENROLLMENT_MANAGE: 'enrollments:manage',

  // 4. ADMISSION
  ADMISSION_CYCLE_MANAGE: 'admission_cycles:manage',
  ADMISSION_APPLICATION_VIEW: 'admission_applications:view',
  ADMISSION_APPLICATION_REVIEW: 'admission_applications:review',
  ADMISSION_APPLICATION_APPROVE: 'admission_applications:approve',

  // 5. FINANCE
  FEE_STRUCTURE_MANAGE: 'fee_structures:manage',
  FINANCE_INVOICE_VIEW: 'finance_invoices:view',
  FINANCE_INVOICE_MANAGE: 'finance_invoices:manage',
  FINANCE_PAYMENT_VIEW: 'finance_payments:view',
  FINANCE_PAYMENT_RECONCILE: 'finance_payments:reconcile',
  FINANCE_EXPENSE_MANAGE: 'finance_expenses:manage',
  FINANCE_REPORT_VIEW: 'finance_reports:view',

  // 6. ATTENDANCE
  ATTENDANCE_VIEW: 'attendance:view',
  ATTENDANCE_RECORD: 'attendance:record',

  // 7. ASSESSMENT
  ASSESSMENT_ENTER: 'assessments:enter',
  ASSESSMENT_VIEW: 'assessments:view',
  RESULT_PUBLISH: 'results:publish',
  REPORT_GENERATE: 'reports:generate',

  // 8. COMMUNICATION
  COMMUNICATION_ANNOUNCE: 'communication:announce',
  NOTIFICATION_VIEW: 'notifications:view',
  NOTIFICATION_RETRY: 'notifications:retry',

  // 9. PARENT (Subordinate to active GuardianStudentRelationship)
  PARENT_CHILD_VIEW: 'parent_child:view',
  PARENT_ATTENDANCE_VIEW: 'parent_attendance:view',
  PARENT_RESULT_VIEW: 'parent_results:view',
  PARENT_INVOICE_VIEW: 'parent_invoices:view',
} as const;

export type PermissionCodeType = (typeof PermissionCode)[keyof typeof PermissionCode];

export interface PermissionDefinition {
  code: PermissionCodeType;
  name: string;
  module: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: Record<PermissionCodeType, PermissionDefinition> = {
  // System / Administration
  [PermissionCode.SYSTEM_CONFIG_MANAGE]: {
    code: PermissionCode.SYSTEM_CONFIG_MANAGE,
    name: 'Manage System Configurations',
    module: 'system',
    description: 'Configure school-wide system settings and feature flags',
  },
  [PermissionCode.USER_MANAGE]: {
    code: PermissionCode.USER_MANAGE,
    name: 'Manage User Accounts',
    module: 'identity',
    description: 'Deactivate, reactivate, or unlock user accounts',
  },
  [PermissionCode.ROLE_MANAGE]: {
    code: PermissionCode.ROLE_MANAGE,
    name: 'Assign User Roles',
    module: 'identity',
    description: 'Assign or remove system-controlled roles from users (no arbitrary permission editing)',
  },
  [PermissionCode.AUDIT_LOG_VIEW]: {
    code: PermissionCode.AUDIT_LOG_VIEW,
    name: 'View Audit Logs',
    module: 'system',
    description: 'Inspect operational, security, and authorization audit logs',
  },

  // People
  [PermissionCode.STUDENT_VIEW]: {
    code: PermissionCode.STUDENT_VIEW,
    name: 'View Students',
    module: 'students',
    description: 'View student profiles and demographic information (subject to scope when teacher)',
  },
  [PermissionCode.STUDENT_CREATE]: {
    code: PermissionCode.STUDENT_CREATE,
    name: 'Create Students',
    module: 'students',
    description: 'Enroll existing students individually or via bulk intake',
  },
  [PermissionCode.STUDENT_EDIT]: {
    code: PermissionCode.STUDENT_EDIT,
    name: 'Edit Students',
    module: 'students',
    description: 'Modify student demographic and profile data',
  },
  [PermissionCode.STUDENT_MEDICAL_VIEW]: {
    code: PermissionCode.STUDENT_MEDICAL_VIEW,
    name: 'View Student Medical Details',
    module: 'students',
    description: 'View sensitive medical notes, blood group, genotype, allergies, and conditions',
  },
  [PermissionCode.STUDENT_MEDICAL_EDIT]: {
    code: PermissionCode.STUDENT_MEDICAL_EDIT,
    name: 'Edit Student Medical Details',
    module: 'students',
    description: 'Modify sensitive student medical conditions, allergies, and clinical notes',
  },
  [PermissionCode.STUDENT_ARCHIVE]: {
    code: PermissionCode.STUDENT_ARCHIVE,
    name: 'Archive Students',
    module: 'students',
    description: 'Transition student to ARCHIVED state rather than physical deletion',
  },
  [PermissionCode.GUARDIAN_VIEW]: {
    code: PermissionCode.GUARDIAN_VIEW,
    name: 'View Guardians',
    module: 'guardians',
    description: 'View parent and guardian contact profiles',
  },
  [PermissionCode.GUARDIAN_EDIT]: {
    code: PermissionCode.GUARDIAN_EDIT,
    name: 'Edit Guardians',
    module: 'guardians',
    description: 'Modify guardian contact information',
  },
  [PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE]: {
    code: PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE,
    name: 'Manage Guardian Relationships',
    module: 'guardians',
    description: 'Create, reassign, or revoke parent-student family relationships',
  },
  [PermissionCode.TEACHER_MANAGE]: {
    code: PermissionCode.TEACHER_MANAGE,
    name: 'Manage Teachers',
    module: 'teachers',
    description: 'Create teachers and configure teacher programme, class, and subject scopes',
  },

  // Academic
  [PermissionCode.ACADEMIC_SESSION_MANAGE]: {
    code: PermissionCode.ACADEMIC_SESSION_MANAGE,
    name: 'Manage Academic Sessions',
    module: 'academics',
    description: 'Create and configure academic sessions and terms',
  },
  [PermissionCode.PROGRAMME_MANAGE]: {
    code: PermissionCode.PROGRAMME_MANAGE,
    name: 'Manage Programmes',
    module: 'academics',
    description: 'Configure academic programmes and availability',
  },
  [PermissionCode.CLASS_MANAGE]: {
    code: PermissionCode.CLASS_MANAGE,
    name: 'Manage Classes',
    module: 'academics',
    description: 'Create and configure school classes, arms, and capacities',
  },
  [PermissionCode.SUBJECT_MANAGE]: {
    code: PermissionCode.SUBJECT_MANAGE,
    name: 'Manage Subjects',
    module: 'academics',
    description: 'Create and configure curricular subjects',
  },
  [PermissionCode.ENROLLMENT_MANAGE]: {
    code: PermissionCode.ENROLLMENT_MANAGE,
    name: 'Manage Programme Enrollments',
    module: 'academics',
    description: 'Enroll or withdraw students across multiple curricular programmes',
  },

  // Admission
  [PermissionCode.ADMISSION_CYCLE_MANAGE]: {
    code: PermissionCode.ADMISSION_CYCLE_MANAGE,
    name: 'Manage Admission Cycles',
    module: 'admissions',
    description: 'Open, close, and configure admission cycles and fees',
  },
  [PermissionCode.ADMISSION_APPLICATION_VIEW]: {
    code: PermissionCode.ADMISSION_APPLICATION_VIEW,
    name: 'View Applications',
    module: 'admissions',
    description: 'View public applicant dossiers and programme selections',
  },
  [PermissionCode.ADMISSION_APPLICATION_REVIEW]: {
    code: PermissionCode.ADMISSION_APPLICATION_REVIEW,
    name: 'Review Applications',
    module: 'admissions',
    description: 'Review applicant documents, interviews, and entrance assessment notes',
  },
  [PermissionCode.ADMISSION_APPLICATION_APPROVE]: {
    code: PermissionCode.ADMISSION_APPLICATION_APPROVE,
    name: 'Approve/Reject Admissions',
    module: 'admissions',
    description: 'Approve or reject admission selections per programme and convert to students',
  },

  // Finance
  [PermissionCode.FEE_STRUCTURE_MANAGE]: {
    code: PermissionCode.FEE_STRUCTURE_MANAGE,
    name: 'Manage Fee Structures',
    module: 'finance',
    description: 'Configure fee line items, amounts, and term billing schedules',
  },
  [PermissionCode.FINANCE_INVOICE_VIEW]: {
    code: PermissionCode.FINANCE_INVOICE_VIEW,
    name: 'View Invoices',
    module: 'finance',
    description: 'View student tuition and general fee invoices',
  },
  [PermissionCode.FINANCE_INVOICE_MANAGE]: {
    code: PermissionCode.FINANCE_INVOICE_MANAGE,
    name: 'Manage Invoices',
    module: 'finance',
    description: 'Generate, issue, adjust, or cancel invoices',
  },
  [PermissionCode.FINANCE_PAYMENT_VIEW]: {
    code: PermissionCode.FINANCE_PAYMENT_VIEW,
    name: 'View Payments',
    module: 'finance',
    description: 'View transaction logs, Paystack payments, and offline deposits',
  },
  [PermissionCode.FINANCE_PAYMENT_RECONCILE]: {
    code: PermissionCode.FINANCE_PAYMENT_RECONCILE,
    name: 'Reconcile Payments',
    module: 'finance',
    description: 'Record bank transfers, reconcile payments, and issue official receipts',
  },
  [PermissionCode.FINANCE_EXPENSE_MANAGE]: {
    code: PermissionCode.FINANCE_EXPENSE_MANAGE,
    name: 'Manage Expenses',
    module: 'finance',
    description: 'Record, verify, and categorize operational school expenses',
  },
  [PermissionCode.FINANCE_REPORT_VIEW]: {
    code: PermissionCode.FINANCE_REPORT_VIEW,
    name: 'View Financial Reports',
    module: 'finance',
    description: 'Generate income statements, fee collection reports, and balance summaries',
  },

  // Attendance
  [PermissionCode.ATTENDANCE_VIEW]: {
    code: PermissionCode.ATTENDANCE_VIEW,
    name: 'View Attendance',
    module: 'attendance',
    description: 'View daily student attendance records (subject to scope)',
  },
  [PermissionCode.ATTENDANCE_RECORD]: {
    code: PermissionCode.ATTENDANCE_RECORD,
    name: 'Record Attendance',
    module: 'attendance',
    description: 'Take and submit daily attendance registers (subject to scope)',
  },

  // Assessment
  [PermissionCode.ASSESSMENT_ENTER]: {
    code: PermissionCode.ASSESSMENT_ENTER,
    name: 'Enter Assessments',
    module: 'assessment',
    description: 'Enter continuous assessment (CA) scores and exam marks (subject to scope)',
  },
  [PermissionCode.ASSESSMENT_VIEW]: {
    code: PermissionCode.ASSESSMENT_VIEW,
    name: 'View Assessments',
    module: 'assessment',
    description: 'Inspect class gradebooks and computed academic marks (subject to scope)',
  },
  [PermissionCode.RESULT_PUBLISH]: {
    code: PermissionCode.RESULT_PUBLISH,
    name: 'Publish Results',
    module: 'assessment',
    description: 'Approve and release term result cards to parents',
  },
  [PermissionCode.REPORT_GENERATE]: {
    code: PermissionCode.REPORT_GENERATE,
    name: 'Generate Reports',
    module: 'assessment',
    description: 'Compile academic performance transcripts and broadsheets',
  },

  // Communication
  [PermissionCode.COMMUNICATION_ANNOUNCE]: {
    code: PermissionCode.COMMUNICATION_ANNOUNCE,
    name: 'Broadcast Announcements',
    module: 'communication',
    description: 'Publish announcements to school, programme, or class channels',
  },
  [PermissionCode.NOTIFICATION_VIEW]: {
    code: PermissionCode.NOTIFICATION_VIEW,
    name: 'View Notifications',
    module: 'communication',
    description: 'Monitor communication delivery logs and outbox queue',
  },
  [PermissionCode.NOTIFICATION_RETRY]: {
    code: PermissionCode.NOTIFICATION_RETRY,
    name: 'Retry Notifications',
    module: 'communication',
    description: 'Manually re-queue failed or retryable outbox notifications',
  },

  // Parent
  [PermissionCode.PARENT_CHILD_VIEW]: {
    code: PermissionCode.PARENT_CHILD_VIEW,
    name: 'View Own Child Profiles',
    module: 'parent',
    description: 'View profiles of children linked via active GuardianStudentRelationship',
  },
  [PermissionCode.PARENT_ATTENDANCE_VIEW]: {
    code: PermissionCode.PARENT_ATTENDANCE_VIEW,
    name: 'View Own Child Attendance',
    module: 'parent',
    description: 'View attendance registers of own linked children only',
  },
  [PermissionCode.PARENT_RESULT_VIEW]: {
    code: PermissionCode.PARENT_RESULT_VIEW,
    name: 'View Own Child Results',
    module: 'parent',
    description: 'View published report cards of own linked children only',
  },
  [PermissionCode.PARENT_INVOICE_VIEW]: {
    code: PermissionCode.PARENT_INVOICE_VIEW,
    name: 'View Own Child Invoices',
    module: 'parent',
    description: 'View and pay fee invoices belonging to own linked children only',
  },
};

/**
 * System-Controlled Role Permission Matrix
 * Immutable in Stage 4: prevents arbitrary permission editing or privilege escalation.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<RoleCode, PermissionCodeType[]> = {
  [RoleCode.SUPER_ADMIN]: Object.values(PermissionCode),

  [RoleCode.ADMIN]: [
    // System & Audit
    PermissionCode.AUDIT_LOG_VIEW,
    // People (All operations except security roles)
    PermissionCode.STUDENT_VIEW,
    PermissionCode.STUDENT_CREATE,
    PermissionCode.STUDENT_EDIT,
    PermissionCode.STUDENT_MEDICAL_VIEW,
    PermissionCode.STUDENT_MEDICAL_EDIT,
    PermissionCode.STUDENT_ARCHIVE,
    PermissionCode.GUARDIAN_VIEW,
    PermissionCode.GUARDIAN_EDIT,
    PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE,
    PermissionCode.TEACHER_MANAGE,
    // Academic (Full management)
    PermissionCode.ACADEMIC_SESSION_MANAGE,
    PermissionCode.PROGRAMME_MANAGE,
    PermissionCode.CLASS_MANAGE,
    PermissionCode.SUBJECT_MANAGE,
    PermissionCode.ENROLLMENT_MANAGE,
    // Admissions (Full management)
    PermissionCode.ADMISSION_CYCLE_MANAGE,
    PermissionCode.ADMISSION_APPLICATION_VIEW,
    PermissionCode.ADMISSION_APPLICATION_REVIEW,
    PermissionCode.ADMISSION_APPLICATION_APPROVE,
    // Finance (View-only for coordination, no ledger alteration)
    PermissionCode.FINANCE_INVOICE_VIEW,
    PermissionCode.FINANCE_PAYMENT_VIEW,
    PermissionCode.FINANCE_REPORT_VIEW,
    // Attendance (Broad oversight)
    PermissionCode.ATTENDANCE_VIEW,
    PermissionCode.ATTENDANCE_RECORD,
    // Assessment (Broad oversight & publishing)
    PermissionCode.ASSESSMENT_VIEW,
    PermissionCode.ASSESSMENT_ENTER,
    PermissionCode.RESULT_PUBLISH,
    PermissionCode.REPORT_GENERATE,
    // Communication
    PermissionCode.COMMUNICATION_ANNOUNCE,
    PermissionCode.NOTIFICATION_VIEW,
    PermissionCode.NOTIFICATION_RETRY,
  ],

  [RoleCode.ACCOUNTANT]: [
    // People (Read-only for billing / invoice assignment)
    PermissionCode.STUDENT_VIEW,
    PermissionCode.GUARDIAN_VIEW,
    // Admissions (Fee clearance check)
    PermissionCode.ADMISSION_APPLICATION_VIEW,
    // Finance (Full operational ledger control)
    PermissionCode.FEE_STRUCTURE_MANAGE,
    PermissionCode.FINANCE_INVOICE_VIEW,
    PermissionCode.FINANCE_INVOICE_MANAGE,
    PermissionCode.FINANCE_PAYMENT_VIEW,
    PermissionCode.FINANCE_PAYMENT_RECONCILE,
    PermissionCode.FINANCE_EXPENSE_MANAGE,
    PermissionCode.FINANCE_REPORT_VIEW,
    // Communication (Billing notifications)
    PermissionCode.NOTIFICATION_VIEW,
  ],

  [RoleCode.TEACHER]: [
    // Teacher permissions are ALWAYS scoped by TeacherScope:
    // Programme -> Class -> Subject -> Academic Session
    PermissionCode.STUDENT_VIEW,
    PermissionCode.ATTENDANCE_VIEW,
    PermissionCode.ATTENDANCE_RECORD,
    PermissionCode.ASSESSMENT_VIEW,
    PermissionCode.ASSESSMENT_ENTER,
    PermissionCode.REPORT_GENERATE,
    PermissionCode.COMMUNICATION_ANNOUNCE,
  ],

  [RoleCode.PARENT]: [
    // Parent permissions are ALWAYS subordinate to active GuardianStudentRelationship
    PermissionCode.PARENT_CHILD_VIEW,
    PermissionCode.PARENT_ATTENDANCE_VIEW,
    PermissionCode.PARENT_RESULT_VIEW,
    PermissionCode.PARENT_INVOICE_VIEW,
  ],
};
