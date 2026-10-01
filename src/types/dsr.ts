export type DsrStatus = 'Draft' | 'Submitted' | 'Reviewed' | 'Needs Revision';

export interface DsrReport {
  id: string;
  empId: string;
  empName: string;
  empEmail: string;
  dept: string;
  designation: string;
  reportDate: string; // YYYY-MM-DD
  submittedAt: string;
  submittedDateFormatted: string;
  
  // Recipient Team Leader
  tlId: string;
  tlName: string;
  tlEmail?: string;
  
  // DSR content
  description: string; // The Daily Status Report content
  
  // Workflow / Review status
  status: DsrStatus;
  tlFeedback?: string;
  reviewedAt?: string;
  reviewedByName?: string;

  // Zoho CRM Integration
  zohoId?: string;
  employeeZohoId?: string;
}
