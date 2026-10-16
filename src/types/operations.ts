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

  Created_Time: string;
  Modified_Time?: string;
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
