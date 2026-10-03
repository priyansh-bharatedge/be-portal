/**
 * Zoho CRM REST API Integration Service (v8)
 * Domain: .in (accounts.zoho.in / zohoapis.in) & .com (accounts.zoho.com / zohoapis.com)
 * Modules: Quotations, Leads, Deals
 * Documentation: 
 * - Insert Records: https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html
 * - Upload Attachments: https://www.zoho.com/crm/developer/docs/api/v8/upload-attachments.html
 *   Example: POST https://www.zohoapis.com/crm/v8/Leads/{record_id}/Attachments
 */


export * from './zohoRbacService';

export interface ZohoFetchOptions {
  page?: number;
  per_page?: number;
  page_token?: string;
  fetch_all?: boolean;
  criteria?: string;
}

export interface ZohoFetchResult<T = any> {
  success: boolean;
  data: T[];
  info?: {
    per_page?: number;
    count?: number;
    page?: number;
    more_records?: boolean;
    next_page_token?: string | null;
    previous_page_token?: string | null;
  };
  message?: string;
}

export interface ZohoAttendanceFetchOptions extends ZohoFetchOptions {
  date?: string;
  attendance_date?: string;
  start_date?: string;
  end_date?: string;
  employee_code?: string;
  emp_code?: string;
  modified_since?: string;
}

function buildQueryString(options?: Record<string, any>): string {
  if (!options) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface ZohoApiResponse {
  success: boolean;
  zohoId?: string;
  attachmentId?: string;
  message?: string;
  data?: any;
  info?: any;
  errorDetails?: any;
}

async function safeParseResponse(response: Response): Promise<any> {
  try {
    const text = await response.text();
    if (!text || !text.trim()) {
      const resData = { success: response.ok, message: response.statusText || 'Empty response' };
      console.log(`[Zoho CRM API] Response from ${response.url} (Status ${response.status}):`, resData);
      return resData;
    }
    const parsed = JSON.parse(text);
    console.log(`[Zoho CRM API] Response from ${response.url} (Status ${response.status}):`, parsed);
    return parsed;
  } catch (e: any) {
    const errData = {
      success: false,
      message: `Invalid server response (${response.status}): ${response.statusText || 'Unable to parse JSON'}`,
    };
    console.error(`[Zoho CRM API] Error parsing response from ${response.url}:`, errData);
    return errData;
  }
}

/**
 * Inserts a new record into the Zoho CRM Quotations module using REST API v8.
 */
export async function insertZohoQuotation(quotation: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-quotation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quotation),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Quotation inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert quotation into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting quotation:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Quotations module using REST API v8.
 */
export async function updateZohoQuotation(quotation: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-quotation', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quotation),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || quotation.zohoId,
        message: data.message || 'Quotation updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update quotation in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating quotation:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a record depending on whether quotation.zohoId exists.
 */
export async function saveOrUpdateZohoQuotation(quotation: any): Promise<ZohoApiResponse> {
  if (quotation.zohoId) {
    return updateZohoQuotation(quotation);
  }
  return insertZohoQuotation(quotation);
}

/**
 * Uploads a file attachment to a specific Zoho CRM record using REST API v8.
 * e.g. POST https://www.zohoapis.com/crm/v8/{module}/{recordId}/Attachments
 * 
 * @param recordId - The Zoho CRM Record ID (e.g., '1000000231009' or newly inserted zohoId)
 * @param file - The File or Blob to attach (e.g. PDF quotation, screenshot, documents)
 * @param fileName - Optional custom filename (e.g. 'Quotation_QT-1025.pdf')
 * @param module - The Zoho CRM module name (defaults to 'Quotations', can be 'Leads', 'Deals', etc.)
 */
export async function uploadZohoAttachment(
  recordId: string,
  file: File | Blob,
  fileName?: string,
  module: string = 'Quotations'
): Promise<ZohoApiResponse> {
  try {
    const formData = new FormData();
    const resolvedName = fileName || (file instanceof File ? file.name : 'document.pdf');
    formData.append('file', file, resolvedName);
    formData.append('recordId', recordId);
    formData.append('module', module);

    const response = await fetch('/api/zoho/upload-attachment', {
      method: 'POST',
      body: formData,
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: recordId,
        attachmentId: data.attachmentId,
        message: data.message || 'File attachment uploaded successfully to Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to upload attachment to Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while uploading attachment:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM attachment endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all attachments for a Zoho CRM record.
 * Endpoint: GET /api/zoho/get-attachments?module={module}&recordId={recordId}
 */
export async function fetchZohoAttachments(
  module: string = 'Deals',
  recordId: string
): Promise<ZohoApiResponse> {
  if (!recordId) {
    return { success: false, message: 'recordId is required to fetch attachments' };
  }
  try {
    const qs = new URLSearchParams({ module, recordId }).toString();
    const response = await fetch(`/api/zoho/get-attachments?${qs}`, {
      method: 'GET',
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        data: data.data || [],
        info: data.info,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to fetch attachments from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Error fetching attachments:', error);
    return {
      success: false,
      message: error?.message || 'Network error fetching attachments',
      errorDetails: error,
    };
  }
}

/**
 * Constructs a direct proxy URL to download or stream an attachment.
 */
export function getZohoAttachmentDownloadUrl(
  module: string = 'Deals',
  recordId: string,
  attachmentId: string,
  preview: boolean = false
): string {
  const qs = new URLSearchParams({
    module,
    recordId,
    attachmentId,
    preview: preview ? 'true' : 'false',
  }).toString();
  return `/api/zoho/download-attachment?${qs}`;
}

/**
 * Triggers a direct file download for a Zoho CRM attachment.
 */
export async function downloadZohoAttachment(
  module: string = 'Deals',
  recordId: string,
  attachmentId: string,
  fileName: string = 'document'
): Promise<void> {
  try {
    const url = getZohoAttachmentDownloadUrl(module, recordId, attachmentId, false);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('[Zoho CRM] Direct download failed:', err);
    // Fallback direct navigation
    const url = getZohoAttachmentDownloadUrl(module, recordId, attachmentId, false);
    window.open(url, '_blank');
  }
}

/**
 * Convenience helper to upload a file attachment to a Deal record.
 * Endpoint: POST https://www.zohoapis.com/crm/v8/Deals/{dealId}/Attachments
 */
export async function uploadZohoAttachmentToDeal(
  dealId: string,
  file: File | Blob,
  fileName?: string
): Promise<ZohoApiResponse> {
  return uploadZohoAttachment(dealId, file, fileName, 'Deals');
}

/**
 * Convenience helper to upload a file attachment to a Lead record.
 * Endpoint: POST https://www.zohoapis.com/crm/v8/Leads/{leadId}/Attachments
 */
export async function uploadZohoAttachmentToLead(
  leadId: string,
  file: File | Blob,
  fileName?: string
): Promise<ZohoApiResponse> {
  return uploadZohoAttachment(leadId, file, fileName, 'Leads');
}

/**
 * Composite helper: Inserts a record and immediately uploads an attachment if provided.
 */
export async function insertZohoQuotationWithAttachment(
  quotation: any,
  file?: File | Blob,
  fileName?: string
): Promise<ZohoApiResponse> {
  // Step 1: Insert record
  const insertRes = await insertZohoQuotation(quotation);
  if (!insertRes.success || !insertRes.zohoId || !file) {
    return insertRes;
  }

  // Step 2: Attach file to the newly created record ID
  try {
    const attachRes = await uploadZohoAttachment(insertRes.zohoId, file, fileName, 'Quotations');
    return {
      success: true,
      zohoId: insertRes.zohoId,
      attachmentId: attachRes.attachmentId,
      message: `${insertRes.message} & attachment uploaded successfully to record #${insertRes.zohoId}`,
      data: {
        record: insertRes.data,
        attachment: attachRes.data,
      },
    };
  } catch (err: any) {
    console.warn('[Zoho CRM] Record created successfully but attachment failed:', err);
    return {
      success: true,
      zohoId: insertRes.zohoId,
      message: `${insertRes.message} (Attachment failed: ${err.message})`,
      data: insertRes.data,
      errorDetails: err,
    };
  }
}

/**
 * Validates connection with Zoho CRM
 */
export async function testZohoConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('/api/zoho/test-connection');
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return { success: true, message: data.message || 'Successfully connected to Zoho CRM' };
    } else {
      return { success: false, message: data.message || 'Connection test failed' };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection test failed' };
  }
}

/**
 * Inserts a new record into the Zoho CRM Employee module using REST API v8.
 * Module API Name: Employee
 */
export async function insertZohoEmployee(employee: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-employee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(employee),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Employee inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert employee into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting employee:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Employee module using REST API v8.
 */
export async function updateZohoEmployee(employee: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-employee', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(employee),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || employee.zohoId,
        message: data.message || 'Employee updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update employee in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating employee:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates specifically the Password field in the Zoho CRM Employee module by finding the record via email.
 */
export async function updateZohoEmployeePassword(email: string, password: string, zohoId?: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-employee-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || 'Password updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update employee password in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating employee password:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM password update endpoint',
      errorDetails: error,
    };
  }
}

export interface ZohoEmployeeSearchResult {
  success: boolean;
  exists: boolean;
  hasPassword?: boolean;
  employee?: any;
  message?: string;
  error?: string;
}

/**
 * Searches Zoho CRM "Employee" module by email and returns record existence and password state.
 */
export async function searchZohoEmployeeByEmail(email: string): Promise<ZohoEmployeeSearchResult> {
  try {
    const response = await fetch(`/api/zoho/search-employee?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await safeParseResponse(response);
    return data;
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception searching employee by email:', error);
    return {
      success: false,
      exists: false,
      error: error?.message || 'Network error communicating with Zoho CRM search endpoint',
    };
  }
}

/**
 * Automatically inserts or updates an employee record in Zoho CRM depending on whether employee.zohoId exists.
 */
export async function saveOrUpdateZohoEmployee(employee: any): Promise<ZohoApiResponse> {
  if (employee.zohoId) {
    return updateZohoEmployee(employee);
  }
  return insertZohoEmployee(employee);
}

/**
 * Deletes an employee record from Zoho CRM using REST API v8.
 * Module API Name: Employee
 */
export async function deleteZohoEmployee(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-employee', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Employee #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete employee from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting employee:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Deletes a record from any specified Zoho CRM module.
 */
export async function deleteZohoRecord(module: string, zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-record', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId, module }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Record #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete record from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting record:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Inserts a new record into the Zoho CRM Leave_Management module using REST API v8.
 * Module API Name: Leave_Management
 */
export async function insertZohoLeave(leave: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(leave),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Leave request inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert leave request into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting leave request:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Leave_Management module using REST API v8.
 */
export async function updateZohoLeave(leave: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-leave', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(leave),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || leave.zohoId,
        message: data.message || 'Leave request updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update leave request in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating leave request:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a leave request in Zoho CRM depending on whether leave.zohoId exists.
 */
export async function saveOrUpdateZohoLeave(leave: any): Promise<ZohoApiResponse> {
  if (leave.zohoId) {
    return updateZohoLeave(leave);
  }
  return insertZohoLeave(leave);
}

/**
 * Deletes a leave request from Zoho CRM using REST API v8.
 * Module API Name: Leave_Management
 */
export async function deleteZohoLeave(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-leave', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Leave request #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete leave request from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting leave request:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live quotation records from Zoho CRM Quotations module.
 */
export async function fetchZohoQuotations(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-quotations' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Quotations fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch quotations from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching quotations:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-quotations endpoint'
    };
  }
}

/**
 * Fetches all live employee records from Zoho CRM Employee module.
 */
export async function fetchZohoEmployees(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-employees' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Employees fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch employees from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching employees:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-employees endpoint'
    };
  }
}

/**
 * Fetches all live Sales employees & BDMs from Zoho CRM (combining Employee module and Zoho CRM Active BDM Users).
 */
export async function fetchSalesEmployees(): Promise<ZohoFetchResult> {
  try {
    const response = await fetch('/api/zoho/get-sales-employees');
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Sales employees fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch sales employees from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching sales employees:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-sales-employees endpoint'
    };
  }
}

/**
 * Fetches all live leave records from Zoho CRM Leave_Management module.
 */
export async function fetchZohoLeaves(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-leaves' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Leaves fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch leaves from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching leaves:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-leaves endpoint'
    };
  }
}

/**
 * Inserts a new record into the Zoho CRM Companies module using REST API v8.
 * Module API Name: Companies
 */
export async function insertZohoCompany(company: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-company', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(company),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Company inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert company into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting company:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Companies module using REST API v8.
 */
export async function updateZohoCompany(company: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-company', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(company),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || company.zohoId,
        message: data.message || 'Company updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update company in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating company:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a company record in Zoho CRM depending on whether company.zohoId exists.
 */
export async function saveOrUpdateZohoCompany(company: any): Promise<ZohoApiResponse> {
  if (company.zohoId) {
    return updateZohoCompany(company);
  }
  return insertZohoCompany(company);
}

/**
 * Deletes a company record from Zoho CRM using REST API v8.
 * Module API Name: Companies
 */
export async function deleteZohoCompany(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-company', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Company #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete company from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting company:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live company records from Zoho CRM Companies module.
 */
export async function fetchZohoCompanies(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-companies' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Companies fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch companies from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching companies:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-companies endpoint'
    };
  }
}

/**
 * Inserts a new record into the Zoho CRM Clients module using REST API v8.
 * Module API Name: Clients
 */
export async function insertZohoClient(client: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(client),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Client inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert client into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting client:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Clients module using REST API v8.
 */
export async function updateZohoClient(client: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-client', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(client),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || client.zohoId,
        message: data.message || 'Client updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update client in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating client:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a client record in Zoho CRM depending on whether client.zohoId exists.
 */
export async function saveOrUpdateZohoClient(client: any): Promise<ZohoApiResponse> {
  if (client.zohoId) {
    return updateZohoClient(client);
  }
  return insertZohoClient(client);
}

/**
 * Deletes a client record from Zoho CRM using REST API v8.
 * Module API Name: Clients
 */
export async function deleteZohoClient(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-client', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Client #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete client from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting client:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live client records from Zoho CRM Clients module.
 */
export async function fetchZohoClients(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-clients' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Clients fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch clients from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching clients:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-clients endpoint'
    };
  }
}

/**
 * Inserts a new record into the Zoho CRM Deals module using REST API v8.
 * Module API Name: Deals
 */
export async function insertZohoDeal(deal: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-deal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deal),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Deal inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert deal into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting deal:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Deals module using REST API v8.
 */
export async function updateZohoDeal(deal: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-deal', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deal),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || deal.zohoId,
        message: data.message || 'Deal updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update deal in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating deal:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a deal record in Zoho CRM depending on whether deal.zohoId exists.
 */
export async function saveOrUpdateZohoDeal(deal: any): Promise<ZohoApiResponse> {
  if (deal.zohoId) {
    return updateZohoDeal(deal);
  }
  return insertZohoDeal(deal);
}

/**
 * Deletes a deal record from Zoho CRM using REST API v8.
 * Module API Name: Deals
 */
export async function deleteZohoDeal(zohoId: string): Promise<ZohoApiResponse> {
  return deleteZohoRecord('Deals', zohoId);
}

/**
 * Deletes a quotation record from Zoho CRM using REST API v8.
 * Module API Name: Quotations
 */
export async function deleteZohoQuotation(zohoId: string): Promise<ZohoApiResponse> {
  return deleteZohoRecord('Quotations', zohoId);
}

/**
 * Fetches all live deal records from Zoho CRM Deals module.
 */
export async function fetchZohoDeals(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-deals' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Deals fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch deals from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching deals:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-deals endpoint'
    };
  }
}

/**
 * Fetches a single live deal record by ID from Zoho CRM Deals module.
 */
export async function fetchZohoDealById(dealId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch(`/api/zoho/get-deal?id=${encodeURIComponent(dealId)}`);
    const result = await safeParseResponse(response);
    if (response.ok && result.success) {
      const dataObj = Array.isArray(result.data) ? result.data[0] : result.data;
      return {
        success: true,
        data: dataObj,
        message: 'Deal record fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      message: result.message || 'Failed to fetch deal from Zoho CRM',
      errorDetails: result
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client error fetching deal by ID:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM'
    };
  }
}

/**
 * Transforms a raw Zoho CRM Deal object into a fully calculated and aggregated Deal entity,
 * parsing all Subform_1 service line items, financial totals, GST, Received, and Pending amounts.
 */
export function enrichDealFromZohoRecord(rawZoho: any, existingDeal?: any): any {
  if (!rawZoho) return existingDeal || null;

  const parseZohoNum = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatRupee = (val: number): string => {
    if (!val || isNaN(val) || val <= 0) return '₹0';
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const findFirstPositive = (...vals: any[]): number => {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const num = parseZohoNum(v);
      if (num > 0) return num;
    }
    return 0;
  };

  // 1. Resolve Client & Company Names
  let resolvedClient = '';
  if (rawZoho.Client_Name && typeof rawZoho.Client_Name === 'string' && !/^\(\d+\)$/.test(rawZoho.Client_Name.trim())) {
    resolvedClient = rawZoho.Client_Name.trim();
  } else if (rawZoho.Clients && typeof rawZoho.Clients === 'object' && rawZoho.Clients.name && !/^\(\d+\)$/.test(rawZoho.Clients.name.trim())) {
    resolvedClient = rawZoho.Clients.name.trim();
  } else if (rawZoho.Contact_Name && typeof rawZoho.Contact_Name === 'object' && rawZoho.Contact_Name.name) {
    resolvedClient = rawZoho.Contact_Name.name.trim();
  } else if (rawZoho.Company_name && !/^\(\d+\)$/.test(rawZoho.Company_name.trim())) {
    resolvedClient = rawZoho.Company_name.trim();
  } else if (rawZoho.Company_name_bp && !/^\(\d+\)$/.test(rawZoho.Company_name_bp.trim())) {
    resolvedClient = rawZoho.Company_name_bp.trim();
  } else if (rawZoho.Company_name_cs && !/^\(\d+\)$/.test(rawZoho.Company_name_cs.trim())) {
    resolvedClient = rawZoho.Company_name_cs.trim();
  } else if (rawZoho.Deal_Name) {
    const parts = rawZoho.Deal_Name.split(' - ');
    const candidate = parts[0]?.replace(/^\(|\)$/g, '').trim();
    resolvedClient = candidate && !/^\d+$/.test(candidate) ? candidate : (existingDeal?.client || 'Client');
  } else {
    resolvedClient = existingDeal?.client || 'Client';
  }

  const resolvedCompany = 
    (rawZoho.Company_name && !/^\(\d+\)$/.test(rawZoho.Company_name.trim()) ? rawZoho.Company_name.trim() : '') ||
    (rawZoho.Company_name_bp && !/^\(\d+\)$/.test(rawZoho.Company_name_bp.trim()) ? rawZoho.Company_name_bp.trim() : '') ||
    (rawZoho.Company_name_cs && !/^\(\d+\)$/.test(rawZoho.Company_name_cs.trim()) ? rawZoho.Company_name_cs.trim() : '') ||
    (rawZoho.Company_name_st && !/^\(\d+\)$/.test(rawZoho.Company_name_st.trim()) ? rawZoho.Company_name_st.trim() : '') ||
    (rawZoho.Company && typeof rawZoho.Company === 'object' && rawZoho.Company.name && !/^\(\d+\)$/.test(rawZoho.Company.name.trim()) ? rawZoho.Company.name.trim() : '') ||
    (rawZoho.Account_Name && typeof rawZoho.Account_Name === 'object' && rawZoho.Account_Name.name && !/^\(\d+\)$/.test(rawZoho.Account_Name.name.trim()) ? rawZoho.Account_Name.name.trim() : '') ||
    (rawZoho.Company_Name && !/^\(\d+\)$/.test(rawZoho.Company_Name.trim()) ? rawZoho.Company_Name.trim() : '') ||
    (resolvedClient && resolvedClient !== 'Client' ? resolvedClient : (existingDeal?.company || 'Company'));

  // 2. Extract & Aggregate Services from Subform_1
  let servicesSubform: any[] = [];
  let subformTotal = 0;
  let subformWithoutGst = 0;
  let subformReceived = 0;
  let subformPending = 0;

  if (Array.isArray(rawZoho.Subform_1) && rawZoho.Subform_1.length > 0) {
    servicesSubform = rawZoho.Subform_1.map((sf: any, i: number) => {
      const agreementAmount = parseZohoNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount || 0);
      const wGst = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? Number((agreementAmount * 0.82).toFixed(2)) : 0));
      const tAmt = agreementAmount || (wGst > 0 ? Number((wGst / 0.82).toFixed(2)) : 0);
      const recAmt = parseZohoNum(sf.Received_amount || sf.Received || 0);
      const pendAmt = parseZohoNum(sf.Pending_amount || sf.Pending || (tAmt > recAmt ? tAmt - recAmt : 0));

      subformTotal += tAmt;
      subformWithoutGst += wGst;
      subformReceived += recAmt;
      subformPending += pendAmt;

      return {
        id: String(sf.id || i + 1),
        name: sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || 'Service',
        totalAmount: String(tAmt || ''),
        baseAmount: String(wGst || 0),
        receivedAmount: sf.Received_amount || sf.Received || (recAmt > 0 ? String(recAmt) : ''),
        pendingAmount: sf.Pending_amount || sf.Pending || (pendAmt > 0 ? String(pendAmt) : ''),
        paymentStages: sf.Payment_stages || '',
        paymentType: sf.Payment_type || '',
        paymentDate: sf.Payment_received_date || '',
        qualityProvided: sf.Quality_provided || '',
        successFees: sf.Success_fees || '',
      };
    });
  } else if (Array.isArray(existingDeal?.servicesData) && existingDeal.servicesData.length > 0) {
    servicesSubform = existingDeal.servicesData;
    servicesSubform.forEach((sf: any) => {
      const a = parseZohoNum(sf.totalAmount || sf.Agreement_amount || sf.Total_amount || sf.Total || sf.Amount);
      const bg = parseZohoNum(sf.baseAmount || sf.Without_GST || sf.Base);
      const r = parseZohoNum(sf.receivedAmount || sf.Received_amount || sf.Received);
      const p = parseZohoNum(sf.pendingAmount || sf.Pending_amount || sf.Pending);
      subformTotal += a || (bg > 0 ? Number((bg / 0.82).toFixed(2)) : 0);
      subformWithoutGst += bg || (a > 0 ? Number((a * 0.82).toFixed(2)) : 0);
      subformReceived += r;
      subformPending += p;
    });
  }

  // 3. Financial Calculation
  const totalNum = findFirstPositive(
    rawZoho.Total_deal_amount_inclusive_of_gst,
    rawZoho.Amount,
    rawZoho.Deal_Amount,
    rawZoho.Grand_Total,
    rawZoho.Grand_total,
    rawZoho.GrandTotal,
    rawZoho.Total_amount,
    rawZoho.Total_Amount,
    rawZoho.total_amount,
    rawZoho.Agreement_amount,
    rawZoho.Agreement_Amount,
    rawZoho.Amount_Without_GST ? parseZohoNum(rawZoho.Amount_Without_GST) / 0.82 : 0,
    rawZoho.Deal_Amount_Without_GST ? parseZohoNum(rawZoho.Deal_Amount_Without_GST) / 0.82 : 0,
    rawZoho.Subtotal ? parseZohoNum(rawZoho.Subtotal) * 1.18 : 0,
    rawZoho.Amount_After_disbursement,
    subformTotal,
    rawZoho.Total_Received_Amount,
    rawZoho.Deal_Received_Amount,
    rawZoho.Received_amount,
    rawZoho.Received,
    rawZoho.amount_if_you_have_kindly_put_0,
    existingDeal?.rawAmount,
    existingDeal?.totals?.grandTotal,
    existingDeal?.amount ? parseZohoNum(existingDeal.amount) : 0
  );

  const withoutGst = findFirstPositive(
    rawZoho.Amount_Without_GST,
    rawZoho.Deal_Amount_Without_GST,
    subformWithoutGst,
    existingDeal?.totals?.baseAmount,
    totalNum > 0 ? Number((totalNum * 0.82).toFixed(2)) : 0
  );

  const gstNum = findFirstPositive(
    rawZoho.GST_Amount,
    rawZoho.Deal_GST_Amount,
    existingDeal?.totals?.totalGst,
    totalNum > withoutGst ? Number((totalNum - withoutGst).toFixed(2)) : Number((withoutGst * 0.18).toFixed(2))
  );

  const recNum = findFirstPositive(
    rawZoho.Total_Received_Amount,
    rawZoho.Deal_Received_Amount,
    rawZoho.Received_amount,
    rawZoho.Received_Amount,
    rawZoho.Received,
    rawZoho.Amount_After_disbursement,
    subformReceived,
    existingDeal?.rawReceived,
    existingDeal?.totals?.receivedAmount,
    existingDeal?.received ? parseZohoNum(existingDeal.received) : 0
  );

  const pendNum = findFirstPositive(
    rawZoho.Total_Pending_Amount,
    rawZoho.Deal_Pending_Amount,
    rawZoho.Pending_amount,
    rawZoho.Pending_Amount,
    rawZoho.Pending,
    subformPending,
    totalNum > recNum ? Number((totalNum - recNum).toFixed(2)) : 0,
    existingDeal?.rawPending,
    existingDeal?.totals?.pendingAmount,
    existingDeal?.pending ? parseZohoNum(existingDeal.pending) : 0
  );

  const phone = rawZoho.Client_contact_detail || rawZoho.Client_contact_detail_cs || rawZoho.Client_contact_detail_bp || rawZoho.Client_contact_detail_fnf || rawZoho.client_contact_detail_st || rawZoho.Client_s_alternate_contact_detail || rawZoho.Client_s_alternate_contact_detail_bp || rawZoho.Mobile || rawZoho.Phone || existingDeal?.formData?.mobile || '';
  const email = rawZoho.Client_Email_address || rawZoho.Client_Email_address_cs || rawZoho.Client_Email_address_fnf || rawZoho.Client_Email_address_bp || rawZoho.client_email_address_st || rawZoho.Email || existingDeal?.formData?.email || '';
  const gst = rawZoho.Gst_number || rawZoho.GST_Number || rawZoho.GSTIN || existingDeal?.formData?.gstNumber || '';
  const panVal = rawZoho.Pan_number || rawZoho.PAN_Number || rawZoho.PAN_Card || rawZoho.PAN || existingDeal?.formData?.panCard || '';
  const aadhVal = rawZoho.Aadhaar_Card || rawZoho.Aadhaar_number || rawZoho.Aadhaar_Number || rawZoho.Aadhar_Card || rawZoho.Aadhaar || existingDeal?.formData?.aadhaarCard || '';
  
  const hasPartnerBdm = Boolean(
    rawZoho.Has_Partner_BDM || 
    rawZoho.has_partner_bdm || 
    rawZoho.Partner_BDM || 
    rawZoho.Partner_BDM_Name || 
    rawZoho.Partner_BDM_name || 
    rawZoho.Partner_BDM_Names || 
    rawZoho.Partner_BDM_amount ||
    existingDeal?.hasPartnerBdm ||
    existingDeal?.formData?.hasPartnerBdm
  );

  const partnerBdmName = 
    rawZoho.Partner_BDM_Name || 
    rawZoho.Partner_BDM_name || 
    rawZoho.Partner_BDM_Names || 
    rawZoho.Partner_BDM_Names_bp || 
    rawZoho.Partner_BDM_Names_st || 
    rawZoho.partner_bdm_name ||
    existingDeal?.partnerBdmName ||
    existingDeal?.formData?.partnerBdmName ||
    '';

  const partnerBdmId = 
    rawZoho.Partner_BDM_ID || 
    rawZoho.partner_bdm_id || 
    existingDeal?.partnerBdmId ||
    existingDeal?.formData?.partnerBdmId ||
    '';

  let partnerBdmAmount = Number(rawZoho.Partner_BDM_Amount || rawZoho.Partner_BDM_amount || rawZoho.partner_bdm_amount || existingDeal?.partnerBdmAmount || existingDeal?.formData?.partnerBdmAmount || 0);
  if (hasPartnerBdm && (!partnerBdmAmount || partnerBdmAmount === 0) && recNum > 0) {
    partnerBdmAmount = Number(((recNum / 1.18) / 2).toFixed(2));
  }

  const stage = rawZoho.Stage || rawZoho.Status || existingDeal?.stage || 'Operations';
  let status = 'New';
  if (stage === 'Closed Won' || stage === 'Won' || stage.includes('Won') || stage === 'Operations executors') {
    status = 'Won';
  } else if (stage === 'Closed Lost' || stage === 'Lost' || stage.includes('Lost')) {
    status = 'Lost';
  } else if (stage.includes('Negotiat')) {
    status = 'Negotiation';
  } else if (stage.includes('Propos')) {
    status = 'Proposal';
  } else if (stage.includes('Qualif')) {
    status = 'Qualified';
  } else {
    status = stage;
  }

  const serviceTitle = servicesSubform.length > 0 
    ? (servicesSubform.length === 1 ? servicesSubform[0].name : `${servicesSubform.length} Services`) 
    : (rawZoho.Choose_Wisely || rawZoho.Service_Name || (rawZoho.Deal_Name && rawZoho.Deal_Name.includes(' - ') ? rawZoho.Deal_Name.split(' - ').slice(1).join(' - ').trim() : (existingDeal?.service || 'Services')));

  const resolvedId = existingDeal?.id || (rawZoho.id ? String(rawZoho.id) : `DL-${Math.floor(1000 + Math.random() * 9000)}`);

  return {
    ...existingDeal,
    id: resolvedId,
    zohoId: rawZoho.id || existingDeal?.zohoId,
    client: resolvedClient,
    company: resolvedCompany,
    service: serviceTitle,
    amount: formatRupee(totalNum),
    received: formatRupee(recNum),
    pending: formatRupee(pendNum),
    rawAmount: totalNum,
    rawReceived: recNum,
    rawPending: pendNum,
    status,
    stage,
    owner: rawZoho.Owner?.name || rawZoho.Owner || rawZoho.BDM_names?.name || rawZoho.BDM_name || existingDeal?.owner || 'Admin',
    date: rawZoho.Closing_Date ? new Date(rawZoho.Closing_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (rawZoho.Booking_Date ? new Date(rawZoho.Booking_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (existingDeal?.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))),
    source: existingDeal?.source || 'Zoho CRM',
    hasPartnerBdm,
    has_partner_bdm: hasPartnerBdm,
    partnerBdmId,
    partner_bdm_id: partnerBdmId,
    partnerBdmName,
    partner_bdm_name: partnerBdmName,
    partnerBdmAmount,
    partner_bdm_amount: partnerBdmAmount,
    zohoStatus: 'synced',
    zohoSyncedAt: new Date().toISOString(),
    formData: {
      clientName: resolvedClient,
      companyName: resolvedCompany,
      email: email,
      mobile: phone,
      gstNumber: gst,
      panCard: panVal,
      aadhaarCard: aadhVal,
      billingAddress: rawZoho.Billing_address || rawZoho.Company_address || existingDeal?.formData?.billingAddress || '',
      city: rawZoho.City || existingDeal?.formData?.city || '',
      state: rawZoho.State || existingDeal?.formData?.state || '',
      businessType: rawZoho.Company_Type || rawZoho.Choose_Wisely || rawZoho.Compliance_type || existingDeal?.formData?.businessType || 'Private Limited',
      hasPartnerBdm,
      has_partner_bdm: hasPartnerBdm,
      partnerBdmId,
      partner_bdm_id: partnerBdmId,
      partnerBdmName,
      partner_bdm_name: partnerBdmName,
      partnerBdmAmount,
      partner_bdm_amount: partnerBdmAmount,
      ...(existingDeal?.formData || {})
    },
    servicesData: servicesSubform,
    totals: {
      grandTotal: totalNum,
      baseAmount: withoutGst,
      totalGst: gstNum,
      receivedAmount: recNum,
      pendingAmount: pendNum,
      partnerBdmAmount,
    },
    rawZohoDeal: rawZoho
  };
}

/**
 * Inserts a new record into the Zoho CRM Company_Policies module using REST API v8.
 * Module API Name: Company_Policies
 */
export async function insertZohoPolicy(policy: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-policy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policy),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Company Policy inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert company policy into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting company policy:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Company_Policies module using REST API v8.
 */
export async function updateZohoPolicy(policy: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policy),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || policy.zohoId,
        message: data.message || 'Company Policy updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update company policy in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating company policy:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a company policy record in Zoho CRM depending on whether policy.zohoId exists.
 */
export async function saveOrUpdateZohoPolicy(policy: any): Promise<ZohoApiResponse> {
  if (policy.zohoId) {
    return updateZohoPolicy(policy);
  }
  return insertZohoPolicy(policy);
}

/**
 * Deletes a company policy record from Zoho CRM using REST API v8.
 * Module API Name: Company_Policies
 */
export async function deleteZohoPolicy(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-policy', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Company Policy #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete company policy from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting company policy:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live company policy records from Zoho CRM Company_Policies module.
 */
export async function fetchZohoPolicies(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-policies' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Company Policies fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch company policies from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching company policies:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-policies endpoint'
    };
  }
}

/**
 * Convenience helper to upload a file attachment to a Company Policy record.
 * Endpoint: POST https://www.zohoapis.com/crm/v8/Company_Policies/{policyZohoId}/Attachments
 */
export async function uploadZohoAttachmentToPolicy(
  policyZohoId: string,
  file: File | Blob,
  fileName?: string
): Promise<ZohoApiResponse> {
  return uploadZohoAttachment(policyZohoId, file, fileName, 'Company_Policies');
}

/**
 * Composite helper: Inserts a Company Policy record and immediately uploads an attachment if provided.
 */
export async function insertZohoPolicyWithAttachment(
  policy: any,
  file?: File | Blob,
  fileName?: string
): Promise<ZohoApiResponse> {
  // Step 1: Insert policy record
  const insertRes = await insertZohoPolicy(policy);
  if (!insertRes.success || !insertRes.zohoId || !file) {
    return insertRes;
  }

  // Step 2: Attach file to the newly created record ID
  try {
    const attachRes = await uploadZohoAttachmentToPolicy(insertRes.zohoId, file, fileName);
    return {
      success: true,
      zohoId: insertRes.zohoId,
      attachmentId: attachRes.attachmentId,
      message: `${insertRes.message} & attachment uploaded successfully to Zoho CRM (ID: #${insertRes.zohoId})`,
      data: {
        record: insertRes.data,
        attachment: attachRes.data,
      },
    };
  } catch (err: any) {
    console.warn('[Zoho CRM] Policy record created successfully but attachment failed:', err);
    return {
      success: true,
      zohoId: insertRes.zohoId,
      message: `${insertRes.message} (Attachment sync warning: ${err.message})`,
      data: insertRes.data,
      errorDetails: err,
    };
  }
}

/**
 * Inserts a new record into the Zoho CRM Company_Calendar module using REST API v8.
 * Module API Name: Company_Calendar
 */
export async function insertZohoCalendarEvent(event: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-calendar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Calendar event inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert calendar event into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting calendar event:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM Company_Calendar module using REST API v8.
 */
export async function updateZohoCalendarEvent(event: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-calendar', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || event.zohoId,
        message: data.message || 'Calendar event updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update calendar event in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating calendar event:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a calendar event in Zoho CRM depending on whether event.zohoId exists.
 */
export async function saveOrUpdateZohoCalendarEvent(event: any): Promise<ZohoApiResponse> {
  if (event.zohoId) {
    return updateZohoCalendarEvent(event);
  }
  return insertZohoCalendarEvent(event);
}

/**
 * Deletes a calendar event record from Zoho CRM using REST API v8.
 * Module API Name: Company_Calendar
 */
export async function deleteZohoCalendarEvent(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-calendar', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `Calendar event #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete calendar event from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting calendar event:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live calendar events from Zoho CRM Company_Calendar module.
 */
export async function fetchZohoCalendarEvents(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-calendar' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Calendar events fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch calendar events from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching calendar events:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-calendar endpoint'
    };
  }
}

/**
 * Inserts a new record into the Zoho CRM DSR module using REST API v8.
 * Module API Name: DSR
 */
export async function insertZohoDsr(dsr: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-dsr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dsr),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'DSR inserted successfully into Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert DSR into Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while inserting DSR:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the Zoho CRM DSR module using REST API v8.
 */
export async function updateZohoDsr(dsr: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-dsr', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dsr),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || dsr.zohoId,
        message: data.message || 'DSR updated successfully in Zoho CRM',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update DSR in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while updating DSR:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a DSR report in Zoho CRM depending on whether dsr.zohoId exists.
 */
export async function saveOrUpdateZohoDsr(dsr: any): Promise<ZohoApiResponse> {
  if (dsr.zohoId) {
    return updateZohoDsr(dsr);
  }
  return insertZohoDsr(dsr);
}

/**
 * Deletes a DSR record from Zoho CRM using REST API v8.
 * Module API Name: DSR
 */
export async function deleteZohoDsr(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/delete-dsr', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: zohoId }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || zohoId,
        message: data.message || `DSR #${zohoId} deleted successfully from Zoho CRM`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete DSR from Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting DSR:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live DSR records from Zoho CRM DSR module.
 */
export async function fetchZohoDsr(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-dsr' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'DSR records fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch dsr records from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching dsr records:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-dsr endpoint'
    };
  }
}

export interface ZohoAttendanceRecord {
  id: string;
  Name?: string;
  Attendance_Date?: string;
  Employee?: { id: string; name: string };
  Employee_Code?: string;
  First_In?: string;
  Last_Out?: string;
  Mark_Attendance?: 'Present' | 'Absent' | 'Half Day' | 'On Duty' | 'Leave' | 'Late' | string;
  Punch_Status?: 'Complete' | 'Single Punch' | 'Incomplete' | 'Absent' | string;
  Punch_Count?: number;
  Punches?: string;
  Late_Minutes?: number;
  Early_Out_Minutes?: number;
  Total_Minutes?: number;
  Owner?: { id: string; name: string; email?: string };
  Email?: string;
  Secondary_Email?: string;
  Record_Image?: string;
  Tag?: string[] | string;
  Created_Time?: string;
  Modified_Time?: string;
}

export interface ZohoAttendancePayload {
  id?: string;
  zohoId?: string;
  name?: string;
  Name?: string;
  attendanceDate?: string;
  date?: string;
  Attendance_Date?: string;
  employeeCode?: string;
  empCode?: string;
  Employee_Code?: string;
  employeeName?: string;
  employeeZohoId?: string;
  Employee?: { id: string; name?: string };
  firstIn?: string;
  First_In?: string;
  lastOut?: string;
  Last_Out?: string;
  markAttendance?: string;
  Mark_Attendance?: string;
  punchStatus?: string;
  Punch_Status?: string;
  punchCount?: number;
  Punch_Count?: number;
  punches?: string;
  punchesLog?: string;
  Punches?: string;
  lateMinutes?: number;
  Late_Minutes?: number;
  earlyOutMinutes?: number;
  Early_Out_Minutes?: number;
  totalMinutes?: number;
  Total_Minutes?: number;
}

/**
 * Fetches all live attendance records from Zoho CRM Daily_Attendance module.
 */
export async function fetchZohoAttendance(options?: ZohoAttendanceFetchOptions): Promise<ZohoFetchResult<ZohoAttendanceRecord>> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-attendance' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Attendance records fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch attendance records from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching attendance records:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-attendance endpoint'
    };
  }
}

/**
 * Inserts or updates (upserts) attendance record into Zoho CRM Daily_Attendance module.
 * Uses duplicate check on `Name` (`${Employee_Code} - ${Attendance_Date}`).
 */
export async function saveOrUpdateZohoAttendance(record: ZohoAttendancePayload): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/save-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || data.data?.details?.id,
        message: data.message || 'Attendance record saved successfully in Zoho CRM',
        data: data.data,
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to save attendance record in Zoho CRM',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while saving attendance record:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/save-attendance endpoint'
    };
  }
}

/**
 * Deletes attendance record from Zoho CRM Daily_Attendance module.
 */
export async function deleteZohoAttendance(zohoId: string): Promise<ZohoApiResponse> {
  try {
    const response = await fetch(`/api/zoho/delete-attendance?id=${encodeURIComponent(zohoId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: zohoId }),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        message: data.message || 'Attendance record deleted successfully from Zoho CRM',
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to delete attendance record from Zoho CRM',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while deleting attendance record:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/delete-attendance endpoint'
    };
  }
}

/**
 * Formats ISO DateTime string (e.g. 2026-09-30T09:35:42+05:30) to human-readable 12-hour time (e.g. 09:35 AM).
 */
export function formatAttendanceTime(isoStr?: string | null): string {
  if (!isoStr || !isoStr.trim()) return '--';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) {
      if (/^\d{1,2}:\d{2}/.test(isoStr)) return isoStr;
      return '--';
    }
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return isoStr;
  }
}

/**
 * Formats total working minutes into readable duration string (e.g. "8h 45m").
 */
export function formatAttendanceDuration(totalMinutes?: number | null): string {
  if (totalMinutes === undefined || totalMinutes === null || isNaN(totalMinutes) || totalMinutes <= 0) {
    return '--';
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Parses comma/newline separated punches log into clean timestamp array.
 */
export function parsePunchesTimeline(punchesStr?: string | null): string[] {
  if (!punchesStr || !punchesStr.trim()) return [];
  return punchesStr
    .split(/[,\n]/)
    .map(p => p.trim())
    .filter(Boolean);
}

/**
 * Fetches all live query records from Zoho CRM Cases module.
 */
export async function fetchZohoQueries(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  try {
    const qs = buildQueryString(options);
    const response = await fetch('/api/zoho/get-queries' + qs);
    const result = await safeParseResponse(response);
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        info: result.info,
        message: 'Queries fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch queries from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching queries:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM /api/zoho/get-queries endpoint'
    };
  }
}

/**
 * Inserts a new query into Zoho CRM Cases module.
 */
export async function insertZohoQuery(query: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/insert-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Query inserted successfully into Zoho CRM',
        data: data.data,
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to insert query into Zoho CRM',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing query in Zoho CRM Cases module.
 */
export async function updateZohoQuery(query: any): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/update-query', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || query.zohoId,
        message: data.message || 'Query updated successfully in Zoho CRM',
        data: data.data,
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to update query in Zoho CRM',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Network error communicating with Zoho CRM server',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a query in Zoho CRM.
 */
export async function saveOrUpdateZohoQuery(query: any): Promise<ZohoApiResponse> {
  if (query.zohoId) {
    return updateZohoQuery(query);
  }
  return insertZohoQuery(query);
}

/**
 * Deletes a query record from Zoho CRM.
 */
export async function deleteZohoQuery(zohoId: string): Promise<ZohoApiResponse> {
  return deleteZohoRecord('Cases', zohoId);
}



/**
 * Iteratively fetches multiple batches of Zoho records (e.g. 10,000+ Deals) with live progress tracking
 * to prevent server execution timeouts while retrieving all historical records.
 */
export async function fetchAllZohoRecordsInBatches(
  fetchFn: (options?: ZohoFetchOptions) => Promise<ZohoFetchResult>,
  maxRecords: number = 10000,
  onProgress?: (loadedCount: number, moreRecords: boolean, batchCount: number) => void
): Promise<{ success: boolean; data: any[]; totalFetched: number }> {
  let allData: any[] = [];
  let pageToken: string | undefined = undefined;
  let pageNumber = 1;
  let hasMore = true;
  let batchCount = 0;

  while (hasMore && allData.length < maxRecords) {
    batchCount++;
    const res = await fetchFn({ per_page: 200, page_token: pageToken, page: pageToken ? undefined : pageNumber });
    if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
      break;
    }

    allData = [...allData, ...res.data];
    hasMore = Boolean(res.info?.more_records && res.info?.next_page_token);
    pageToken = res.info?.next_page_token || undefined;
    pageNumber++;

    if (onProgress) {
      onProgress(allData.length, hasMore, batchCount);
    }

    if (!hasMore) break;
  }

  return {
    success: true,
    data: allData,
    totalFetched: allData.length
  };
}
