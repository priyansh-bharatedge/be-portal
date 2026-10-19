export interface InternalOperationRecord {
  id: string; // e.g. "IO-1718291000-1" or Zoho CRM record ID
  zohoId?: string;
  Deal_ID: string; // Parent Deal Record ID (Lookup to Deals)
  Deal_Name?: string;
  Client_Name?: string;
  Company_Name?: string;

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

  Team_Member?: {
    id: string;
    name: string;
    email?: string;
    empId?: string;
  } | null;
  Team_Member_ID?: string;
  Team_Member_Name?: string;

  // Allocation Tracking & Status
  Allocation_Status: 'Pending Allocation' | 'Allocated' | 'In Progress' | 'Completed';
  Allocated_At?: string;
  Allocated_By?: string;
  Allocated_By_Name?: string;
  Execution_Notes?: string;

  // Dynamic UI Sections Data Store (Phase 3 & 4)
  sectionsData?: Record<string, any>;

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
  | string;

export const DEFAULT_OPERATION_STAGES: OperationStage[] = [
  'Doc collection',
  'Name Application',
  'DSC Creation',
  'Final Filing',
  'Board Resolution',
  'Hold',
  'Refund',
  'Ineligible',
  'Incorporation pending',
  'Transfer'
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

export const OPERATION_STAGES: OperationStage[] = DEFAULT_OPERATION_STAGES;

export const ALL_OPERATION_STAGES: OperationStage[] = Array.from(
  new Set([...DEFAULT_OPERATION_STAGES, ...CERTIFICATION_OPERATION_STAGES, ...FUNDING_OPERATION_STAGES])
);

/**
 * Returns the relevant Operation Stages based on the record's Team Type.
 * - Certification: 15 stages (includes Selected)
 * - Funding: 14 stages (without Selected)
 * - Default: standard 10 stages
 */
export function getOperationStagesForTeamType(teamType?: string): OperationStage[] {
  if (!teamType) return DEFAULT_OPERATION_STAGES;
  const lower = String(teamType).toLowerCase().trim();
  if (lower.includes('certification')) {
    return CERTIFICATION_OPERATION_STAGES;
  }
  if (lower.includes('funding')) {
    return FUNDING_OPERATION_STAGES;
  }
  return DEFAULT_OPERATION_STAGES;
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
