export interface InternalOperationRecord {
  id: string; // e.g. "IO-1718291000-1" or Zoho CRM record ID
  zohoId?: string;
  Deal_ID: string; // Parent Deal Record ID (Lookup to Deals)
  Deal_Name?: string;
  Client_Name?: string;
  Company_Name?: string;

  // Zoho CRM Core Fields (Module: Operation_Internal_CRM)
  Parent_Record_Deal?: any; // Lookup field to associate all child records with their parent record (Deal)
  Name?: string; // Service Name field in Zoho CRM (Single Line)
  Team_Type?: string; // Team Type field in Zoho CRM (Pick List)
  Operation_Stage?: string; // Operation Stage field in Zoho CRM (Pick List)

  // Mapped from Legal Details Subform
  Service_Scheme: string; // e.g. "CGSS", "Website Development", "MSME"
  Internal_Team_Type: string; // e.g. "Team Funding", "Team Compliance", etc.
  Types_of_Legal_Documents: string; // e.g. "Agreement", "NDA", etc.
  Agreement_Terms: string; // e.g. "3 Months", "6 Months", etc.
  Remark: string; // Legal remarks
  Internal_Legal_Status: string; // e.g. "RECEIVED", "PENDING", etc.
  Tenure_of_Service?: string;
  Subform_Row_ID?: string;

  // Common Fields & Role Assignment (Phase 2)
  Stage?: OperationStage;
  CA_CS1?: string;
  CA_CS2?: string;
  After_Allocation?: 'Yes' | 'No';
  After_Allocation_Workflow?: 'Yes' | 'No' | string;
  Company_Type?: CompanyType;

  // Assignment controls managed by Operations HOD
  Team_Leader?: {
    id: string;
    name: string;
    email?: string;
    empId?: string;
  } | null;
  Team_Leader_ID?: string;
  Team_Leader_Name?: string;
  Team_Leader_TL?: any; // Zoho CRM Lookup to Employee module for Team Leader (TL)

  Team_Member?: {
    id: string;
    name: string;
    email?: string;
    empId?: string;
  } | null;
  Team_Member_ID?: string;
  Team_Member_Name?: string;
  Team_Member_TM?: any; // Zoho CRM Lookup to Employee module for Team Member (TM)

  // Allocation Tracking & Status
  Allocation_Status: 'Pending Allocation' | 'Allocated' | 'In Progress' | 'Completed';
  Allocated_At?: string;
  Allocated_By?: string;
  Allocated_By_Name?: string;
  Execution_Notes?: string;

  // Dynamic UI Sections Data Store (Phase 3 & 4)
  sectionsData?: Record<string, any>;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Doc collection section)
  Doc_collection_name?: string;
  Doc_collection_Date?: string;
  Doc_collection_status?: string;
  Doc_collection_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Name Application / Accounting section)
  Name_Application_name?: string;
  Name_Application_approved_name?: string;
  Name_Application_date?: string;
  Name_Application_status?: string;
  Name_Application_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - DSC Creation section)
  DSC_Creation_name?: string;
  DSC_Creation_Date?: string;
  DSC_Creation_status?: string;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Final Filing section)
  Final_Filing_name?: string;
  Final_Filing_Final_Approval_Name?: string;
  Final_Filing_Date?: string;
  Final_Filing_DOI_Date?: string;
  Final_Filing_status?: string;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Board Resolution / Audit section)
  Board_Resolution_name?: string;
  Board_Resolution_Date?: string;
  Board_Resolution_status?: string;
  Board_Resolution_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - 2-Share Certificate / MGT-7 / 7A section)
  Share_Certificate_name?: string;
  Share_Certificate_Date?: string;
  Share_Certificate_status?: string;
  Share_Certificate_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - MSME section)
  MSME_Certificate?: string;
  MSME_Certificate_Date?: string;
  MSME_Certificate_status?: string;
  MSME_Certificate_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - ADT-1 section)
  ADT_1_name?: string;
  ADT_1_Auditor_name?: string;
  ADT_1_date?: string;
  ADT_1_status?: string;
  ADT_1_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - INC 20-A / DPT 3 section)
  INC_20_A_name?: string;
  INC_20_A_Date?: string;
  INC_20_A_status?: string;
  INC_20_A_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Form 3 / Finance & Projected Financials section)
  Finance_Projected_Financials_name?: string;
  Finance_Projected_Financials_Date?: string;
  Finance_Projected_Financials_Status?: string;
  Finance_Projected_Financials_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - LLP Agreement / Application Submission section)
  Application_submission_name?: string;
  Application_submission_Submission_Date?: string;
  Application_submission_status?: string;
  Application_submission_File_Upload?: any;
  Application_submission?: string;
  Application_submission_Portal_User_ID?: string;
  Application_submission_Portal_Password?: string;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - Director ITR & Company ITR section)
  Director_ITR_Doc_collection?: string;
  Director_ITR_File_required?: string;
  Director_ITR_Company_ITR_name?: string;
  Director_ITR_Company_ITR_Date?: string;
  Director_ITR_Company_ITR_status?: string;
  Director_ITR_Company_ITR_File_Upload?: any;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - AOC-4 section)
  AOC_4_name?: string;
  AOC_4_Director_Audit_report?: string;

  // Zoho CRM Mapped Fields (Module: Operation_Internal_CRM - DPR / Pitch deck creation / INC section)
  DPR_Pitch_deck_creation_name?: string;
  DPR_Pitch_deck_creation_Date?: string;
  DPR_Pitch_deck_creation_status?: string;
  DPR_Pitch_deck_creation_File_Upload?: any;

  Created_Time: string;
  Modified_Time?: string;
}

export type OperationStage =
  | 'Doc collection'
  | 'Name Application'
  | 'DSC Creation'
  | 'Final Filing'
  | 'Board Resolution'
  | 'Hold'
  | 'Refund'
  | 'Ineligible'
  | 'Inelligible'
  | 'Incorporation pending'
  | 'Transfer'
  // Certification specific operation stages
  | 'Document pending from client'
  | 'Incorporation pending from client'
  | 'DSC work in progress'
  | 'Draft work in progress'
  | 'Draft in review to client'
  | 'Draft approved from client'
  | 'Payment pending from client'
  | 'Application submitted'
  | 'Application resubmitted'
  | 'Selected'
  | 'Cancel'
  // Incorporation specific operation stages
  | 'Name application filing'
  | 'DSC creation'
  | 'Board resolution preparation'
  | 'Z-share certificate'
  | 'MSME'
  | 'ADT-1 Filing'
  | 'INC 20-A filing'
  | 'Process Completed'
  // Compliance specific operation stages
  | 'Document work in progress'
  | 'Document in review to client'
  | 'Document approved from client'
  | 'Payment pending from client end'
  | 'Application Resubmission'
  | 'Application Selected'
  | 'Mapping issue'
  | 'Hold - Annual Compliance'
  | 'Hold - Audit not filled'
  | string;

export const INCORPORATION_OPERATION_STAGES: OperationStage[] = [
  'Document pending from client',
  'Incorporation pending from client',
  'Name application filing',
  'DSC creation',
  'Final Filing',
  'Board resolution preparation',
  'Z-share certificate',
  'MSME',
  'ADT-1 Filing',
  'INC 20-A filing',
  'Process Completed',
  'Inelligible',
  'Hold',
  'Transfer',
  'Refund',
  'Cancel'
];

export const DEFAULT_OPERATION_STAGES: OperationStage[] = INCORPORATION_OPERATION_STAGES;

export const COMPLIANCE_OPERATION_STAGES: OperationStage[] = [
  'Document pending from client',
  'Incorporation pending from client',
  'Document work in progress',
  'Document in review to client',
  'Document approved from client',
  'Payment pending from client end',
  'Application submitted',
  'Application Resubmission',
  'Application Selected',
  'Mapping issue',
  'Inelligible',
  'Hold',
  'Hold - Annual Compliance',
  'Hold - Audit not filled',
  'Transfer',
  'Refund'
];

export const CERTIFICATION_OPERATION_STAGES: OperationStage[] = [
  'Document pending from client',
  'Incorporation pending from client',
  'DSC work in progress',
  'Draft work in progress',
  'Draft in review to client',
  'Draft approved from client',
  'Payment pending from client',
  'Application submitted',
  'Application resubmitted',
  'Selected',
  'Inelligible',
  'Hold',
  'Transfer',
  'Refund',
  'Cancel'
];

export const FUNDING_OPERATION_STAGES: OperationStage[] = [
  'Document pending from client',
  'Incorporation pending from client',
  'DSC work in progress',
  'Draft work in progress',
  'Draft in review to client',
  'Draft approved from client',
  'Payment pending from client',
  'Application submitted',
  'Application resubmitted',
  'Inelligible',
  'Hold',
  'Transfer',
  'Refund',
  'Cancel'
];

export const OPERATION_STAGES: OperationStage[] = INCORPORATION_OPERATION_STAGES;

export const ALL_OPERATION_STAGES: OperationStage[] = Array.from(
  new Set([
    ...INCORPORATION_OPERATION_STAGES,
    ...COMPLIANCE_OPERATION_STAGES,
    ...CERTIFICATION_OPERATION_STAGES,
    ...FUNDING_OPERATION_STAGES,
    'Doc collection',
    'Name Application',
    'DSC Creation',
    'Board Resolution'
  ])
);

/**
 * Returns the relevant Operation Stages based on the record's Team Type.
 * - Incorporation: 16 stages
 * - Compliance: 16 stages
 * - Certification: 15 stages (includes Selected)
 * - Funding: 14 stages (without Selected)
 * - Default: Incorporation stages
 */
export function getOperationStagesForTeamType(teamType?: string): OperationStage[] {
  if (!teamType) return INCORPORATION_OPERATION_STAGES;
  const lower = String(teamType).toLowerCase().trim();
  if (lower.includes('incorporation')) {
    return INCORPORATION_OPERATION_STAGES;
  }
  if (lower.includes('compliance')) {
    return COMPLIANCE_OPERATION_STAGES;
  }
  if (lower.includes('certification')) {
    return CERTIFICATION_OPERATION_STAGES;
  }
  if (lower.includes('funding')) {
    return FUNDING_OPERATION_STAGES;
  }
  return INCORPORATION_OPERATION_STAGES;
}

export type StandardExecutionStatus =
  | 'In-process'
  | 'In-review'
  | 'Pending'
  | 'Filled'
  | 'Approved'
  | 'Hold'
  | 'Refund'
  | 'Ineligible'
  | 'Transfer'
  | 'Rejected';

export const STANDARD_EXECUTION_STATUSES: StandardExecutionStatus[] = [
  'In-process',
  'In-review',
  'Pending',
  'Filled',
  'Approved',
  'Hold',
  'Refund',
  'Ineligible',
  'Transfer'
];

export const STATUSES_WITH_REJECTED: StandardExecutionStatus[] = [
  'In-process',
  'In-review',
  'Pending',
  'Filled',
  'Approved',
  'Hold',
  'Refund',
  'Ineligible',
  'Transfer',
  'Rejected'
];

export const DSC_CREATION_STATUSES = [
  'In process',
  'Pending',
  'Completed'
];

export const FINAL_FILING_STATUSES = [
  'In process',
  'Pending',
  'Approved',
  'Rejected (resubmission)'
];

export const BOARD_RESOLUTION_STATUSES = [
  'In process',
  'Completed',
  'Pending'
];

export const SHARE_CERTIFICATE_STATUSES = [
  'In process',
  'Completed',
  'Pending'
];

export const POST_INCORPORATION_STATUSES = [
  'In process',
  'Pending',
  'Completed'
];

export const CERT_DOC_COLLECTION_STATUSES = [
  'In process',
  'In Review',
  'Pending',
  'Approved'
];

export const CERT_FINAL_APP_STATUSES = [
  'Pending',
  'Approved'
];

export const FUNDING_DPR_STATUSES = [
  'In process',
  'In Review',
  'Pending',
  'Approved'
];

export const FUNDING_FINANCE_STATUSES = [
  'In process',
  'In Review',
  'Pending',
  'Approved'
];

export const FUNDING_APP_SUBMISSION_STATUSES = [
  'Pending',
  'Submitted'
];

export const DIRECTOR_ITR_STATUSES = [
  'In Process',
  'Pending',
  'Completed'
];

export type CompanyType = 'LLP' | 'PVT LTD' | 'Section 8';

export const COMPANY_TYPES: CompanyType[] = ['LLP', 'PVT LTD', 'Section 8'];

export interface UploadedFileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  dataUrl?: string;
}

export interface ServiceAllocationPayload {
  dealId: string;
  dealName?: string;
  clientName?: string;
  services: Array<{
    subformRowId?: string;
    serviceScheme: string;
    internalTeamType?: string;
    legalStatus?: string;
    docTypes?: string;
    agreementTerms?: string;
    remark?: string;
    tenure?: string;
  }>;
}
