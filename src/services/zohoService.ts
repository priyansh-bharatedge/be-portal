/**
 * System REST API Integration Service (v8)
 * Domain: .in (accounts.zoho.in / zohoapis.in) & .com (accounts.zoho.com / zohoapis.com)
 * Modules: Quotations, Leads, Deals
 * Documentation: 
 * - Insert Records: https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html
 * - Upload Attachments: https://www.zoho.com/crm/developer/docs/api/v8/upload-attachments.html
 *   Example: POST https://www.zohoapis.com/crm/v8/Leads/{record_id}/Attachments
 */


import { fetchZohoWithRbac, injectEmployeeLookup } from './zohoRbacService';
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
      console.log(`[System API] Response from ${response.url} (Status ${response.status}):`, resData);
      return resData;
    }
    const parsed = JSON.parse(text);
    console.log(`[System API] Response from ${response.url} (Status ${response.status}):`, parsed);
    return parsed;
  } catch (e: any) {
    const errData = {
      success: false,
      message: `Invalid server response (${response.status}): ${response.statusText || 'Unable to parse JSON'}`,
    };
    console.error(`[System API] Error parsing response from ${response.url}:`, errData);
    return errData;
  }
}

/**
 * Inserts a new record into the System Quotations module using REST API v8.
 */
export async function insertZohoQuotation(quotation: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Quotations', quotation);
    const response = await fetch('/api/zoho/insert-quotation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Quotation inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert quotation successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting quotation:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Quotations module using REST API v8.
 */
export async function updateZohoQuotation(quotation: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Quotations', quotation);
    const response = await fetch('/api/zoho/update-quotation', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || quotation.zohoId,
        message: data.message || 'Quotation updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update quotation successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating quotation:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
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
 * Uploads a file attachment to a specific System record using REST API v8.
 * e.g. POST https://www.zohoapis.com/crm/v8/{module}/{recordId}/Attachments
 * 
 * @param recordId - The System Record ID (e.g., '1000000231009' or newly inserted zohoId)
 * @param file - The File or Blob to attach (e.g. PDF quotation, screenshot, documents)
 * @param fileName - Optional custom filename (e.g. 'Quotation_QT-1025.pdf')
 * @param module - The module name (defaults to 'Quotations', can be 'Leads', 'Deals', etc.)
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
        message: data.message || 'File attachment uploaded successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to upload attachment successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while uploading attachment:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with attachment endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all attachments for a System record.
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
        message: data.message || 'Failed to fetch attachments successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Error fetching attachments:', error);
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
 * Triggers a direct file download for a System attachment.
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
    console.error('[System] Direct download failed:', err);
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
    console.warn('[System] Record created successfully but attachment failed:', err);
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
 * Validates connection with System
 */
export async function testZohoConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('/api/zoho/test-connection');
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return { success: true, message: data.message || 'Successfully connected successfully' };
    } else {
      return { success: false, message: data.message || 'Connection test failed' };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection test failed' };
  }
}

/**
 * Inserts a new record into the System Employee module using REST API v8.
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
        message: data.message || 'Employee inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert employee successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting employee:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Employee module using REST API v8.
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
        message: data.message || 'Employee updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update employee successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating employee:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates specifically the Password field in the System Employee module by finding the record via email.
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
        message: data.message || 'Password updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update employee password successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating employee password:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with password update endpoint',
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
 * Searches System "Employee" module by email and returns record existence and password state.
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
    console.error('[System] Client exception searching employee by email:', error);
    return {
      success: false,
      exists: false,
      error: error?.message || 'Network error communicating with search endpoint',
    };
  }
}

/**
 * Automatically inserts or updates an employee record successfully depending on whether employee.zohoId exists.
 */
export async function saveOrUpdateZohoEmployee(employee: any): Promise<ZohoApiResponse> {
  if (employee.zohoId) {
    return updateZohoEmployee(employee);
  }
  return insertZohoEmployee(employee);
}

/**
 * Deletes an employee record successfully using REST API v8.
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
        message: data.message || `Employee #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete employee successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting employee:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Deletes a record from any specified module.
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
        message: data.message || `Record #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete record successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting record:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Inserts a new record into the System Leave_Management module using REST API v8.
 * Module API Name: Leave_Management
 */
export async function insertZohoLeave(leave: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Leaves', leave);
    const response = await fetch('/api/zoho/insert-leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Leave request inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert leave request successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting leave request:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Leave_Management module using REST API v8.
 */
export async function updateZohoLeave(leave: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Leaves', leave);
    const response = await fetch('/api/zoho/update-leave', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || leave.zohoId,
        message: data.message || 'Leave request updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update leave request successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating leave request:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a leave request successfully depending on whether leave.zohoId exists.
 */
export async function saveOrUpdateZohoLeave(leave: any): Promise<ZohoApiResponse> {
  if (leave.zohoId) {
    return updateZohoLeave(leave);
  }
  return insertZohoLeave(leave);
}

/**
 * Deletes a leave request successfully using REST API v8.
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
        message: data.message || `Leave request #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete leave request successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting leave request:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live quotation records successfully Quotations module with RBAC scoping.
 */
export async function fetchZohoQuotations(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Quotations', options);
}

/**
 * Fetches all live employee records successfully Employee module with RBAC scoping.
 */
export async function fetchZohoEmployees(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Employee', options);
}

/**
 * Fetches all live Sales employees & BDMs successfully (combining Employee module and System Active BDM Users).
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
        message: 'Sales employees fetched successfully successfully'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch sales employees successfully'
    };
  } catch (error: any) {
    console.error('[System] Client exception while fetching sales employees:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with server endpoint endpoint'
    };
  }
}

/**
 * Fetches all live leave records successfully Leave_Management module with RBAC scoping.
 */
export async function fetchZohoLeaves(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Leaves', options);
}

/**
 * Inserts a new record into the System Companies module using REST API v8.
 * Module API Name: Companies
 */
export async function insertZohoCompany(company: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Companies', company);
    const response = await fetch('/api/zoho/insert-company', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Company inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert company successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting company:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Companies module using REST API v8.
 */
export async function updateZohoCompany(company: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Companies', company);
    const response = await fetch('/api/zoho/update-company', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || company.zohoId,
        message: data.message || 'Company updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update company successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating company:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a company record successfully depending on whether company.zohoId exists.
 */
export async function saveOrUpdateZohoCompany(company: any): Promise<ZohoApiResponse> {
  if (company.zohoId) {
    return updateZohoCompany(company);
  }
  return insertZohoCompany(company);
}

/**
 * Deletes a company record successfully using REST API v8.
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
        message: data.message || `Company #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete company successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting company:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live company records successfully Companies module with RBAC scoping.
 */
export async function fetchZohoCompanies(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Companies', options);
}

/**
 * Inserts a new record into the System Clients module using REST API v8.
 * Module API Name: Clients
 */
export async function insertZohoClient(client: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Clients', client);
    const response = await fetch('/api/zoho/insert-client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Client inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert client successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting client:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Clients module using REST API v8.
 */
export async function updateZohoClient(client: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Clients', client);
    const response = await fetch('/api/zoho/update-client', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || client.zohoId,
        message: data.message || 'Client updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update client successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating client:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a client record successfully depending on whether client.zohoId exists.
 */
export async function saveOrUpdateZohoClient(client: any): Promise<ZohoApiResponse> {
  if (client.zohoId) {
    return updateZohoClient(client);
  }
  return insertZohoClient(client);
}

/**
 * Deletes a client record successfully using REST API v8.
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
        message: data.message || `Client #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete client successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting client:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live client records successfully Clients module with RBAC scoping.
 */
export async function fetchZohoClients(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Clients', options);
}

/**
 * Inserts a new record into the System Deals module using REST API v8.
 * Module API Name: Deals
 */
export async function insertZohoDeal(deal: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Deals', deal);
    const response = await fetch('/api/zoho/insert-deal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Deal inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert deal successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting deal:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Deals module using REST API v8.
 */
export async function updateZohoDeal(deal: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Deals', deal);
    const response = await fetch('/api/zoho/update-deal', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || deal.zohoId,
        message: data.message || 'Deal updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update deal successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating deal:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a deal record successfully depending on whether deal.zohoId exists.
 */
export async function saveOrUpdateZohoDeal(deal: any): Promise<ZohoApiResponse> {
  if (deal.zohoId) {
    return updateZohoDeal(deal);
  }
  return insertZohoDeal(deal);
}

/**
 * Transition ID Mapping for Zoho CRM Deal Blueprint:
 * - Sales to Account: "1078476000000489153"
 * - Account to Legal: "1078476000000492001"
 * - Legal to Operations Allocator: "1078476000000492099"
 * - Operations Allocator to Operations Executors: "1078476000001938757"
 */
export const ZOHO_DEAL_BLUEPRINT_TRANSITIONS = {
  SALES_TO_ACCOUNT: '1078476000000489153',
  ACCOUNT_TO_LEGAL: '1078476000000492001',
  LEGAL_TO_OPERATIONS_ALLOCATOR: '1078476000000492099',
  OPERATIONS_ALLOCATOR_TO_OPERATIONS_EXECUTORS: '1078476000001938757',
} as const;

/**
 * Triggers a Zoho CRM Blueprint Transition for a Deal record.
 * Endpoint: PUT https://www.zohoapis.in/crm/v8/Deals/{record_id}/actions/blueprint
 *
 * @param dealIdOrZohoId - Numeric Zoho record ID or portal Deal ID (e.g. DL-1001)
 * @param transitionId - Zoho Blueprint Transition ID
 * @param remarks - Optional transition notes (defaults to 'Updated via API from Frontend Portal')
 * @param additionalData - Optional custom field data to include with transition
 */
export async function transitionZohoDealBlueprint(
  dealIdOrZohoId: string,
  transitionId: string,
  remarks: string = 'Updated via API from Frontend Portal',
  additionalData: Record<string, any> = {}
): Promise<ZohoApiResponse> {
  try {
    const response = await fetch('/api/zoho/deal-blueprint-transition', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealZohoId: dealIdOrZohoId,
        transitionId,
        remarks: remarks || 'Updated via API from Frontend Portal',
        data: additionalData,
      }),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.dealZohoId || dealIdOrZohoId,
        message: data.message || 'Deal stage transitioned successfully via Zoho Blueprint',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to execute blueprint transition in Zoho CRM',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[Zoho Service] Client exception executing blueprint transition:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with Blueprint transition endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Workflow transition: Sales -> Accounts
 */
export async function moveDealToAccounts(
  dealIdOrZohoId: string,
  remarks: string = 'Updated via API from Frontend Portal',
  additionalData: Record<string, any> = {}
): Promise<ZohoApiResponse> {
  return transitionZohoDealBlueprint(
    dealIdOrZohoId,
    ZOHO_DEAL_BLUEPRINT_TRANSITIONS.SALES_TO_ACCOUNT,
    remarks,
    additionalData
  );
}

/**
 * Workflow transition: Accounts -> Legal
 */
export async function moveDealToLegal(
  dealIdOrZohoId: string,
  remarks: string = 'Updated via API from Frontend Portal',
  additionalData: Record<string, any> = {}
): Promise<ZohoApiResponse> {
  return transitionZohoDealBlueprint(
    dealIdOrZohoId,
    ZOHO_DEAL_BLUEPRINT_TRANSITIONS.ACCOUNT_TO_LEGAL,
    remarks,
    additionalData
  );
}

/**
 * Workflow transition: Legal -> Operations Allocator
 */
export async function moveDealToOperationsAllocator(
  dealIdOrZohoId: string,
  remarks: string = 'Updated via API from Frontend Portal',
  additionalData: Record<string, any> = {}
): Promise<ZohoApiResponse> {
  return transitionZohoDealBlueprint(
    dealIdOrZohoId,
    ZOHO_DEAL_BLUEPRINT_TRANSITIONS.LEGAL_TO_OPERATIONS_ALLOCATOR,
    remarks,
    additionalData
  );
}

/**
 * Workflow transition: Operations Allocator -> Operations Executors
 */
export async function moveDealToOperationsExecutors(
  dealIdOrZohoId: string,
  remarks: string = 'Updated via API from Frontend Portal',
  additionalData: Record<string, any> = {}
): Promise<ZohoApiResponse> {
  return transitionZohoDealBlueprint(
    dealIdOrZohoId,
    ZOHO_DEAL_BLUEPRINT_TRANSITIONS.OPERATIONS_ALLOCATOR_TO_OPERATIONS_EXECUTORS,
    remarks,
    additionalData
  );
}

/**
 * Deletes a deal record successfully using REST API v8.
 * Module API Name: Deals
 */
export async function deleteZohoDeal(zohoId: string): Promise<ZohoApiResponse> {
  return deleteZohoRecord('Deals', zohoId);
}

/**
 * Deletes a quotation record successfully using REST API v8.
 * Module API Name: Quotations
 */
export async function deleteZohoQuotation(zohoId: string): Promise<ZohoApiResponse> {
  return deleteZohoRecord('Quotations', zohoId);
}

/**
 * Fetches all live deal records successfully Deals module with RBAC scoping.
 */
export async function fetchZohoDeals(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Deals', options);
}

/**
 * Fetches the exact total count of Deal records from Zoho CRM actions/count API.
 */
export async function fetchZohoDealsCount(): Promise<{ success: boolean; count: number }> {
  try {
    const response = await fetch('/api/zoho/actions/count?module=Deals');
    const result = await safeParseResponse(response);
    if (response.ok && result.success) {
      return { success: true, count: Number(result.count) || 0 };
    }
    return { success: false, count: 0 };
  } catch (err) {
    console.warn('[Zoho Deals] Count fetch error:', err);
    return { success: false, count: 0 };
  }
}

/**
 * Fetches a single live deal record by ID successfully Deals module.
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
        message: 'Deal record fetched successfully successfully'
      };
    }
    return {
      success: false,
      message: result.message || 'Failed to fetch deal successfully',
      errorDetails: result
    };
  } catch (error: any) {
    console.error('[System] Client error fetching deal by ID:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with System'
    };
  }
}

/**
 * Transforms a raw System Deal object into a fully calculated and aggregated Deal entity,
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
      const wGst = parseZohoNum(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? Number((agreementAmount / 1.18).toFixed(2)) : 0));
      const tAmt = agreementAmount || (wGst > 0 ? Number((wGst * 1.18).toFixed(2)) : 0);
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
      subformTotal += a || (bg > 0 ? Number((bg * 1.18).toFixed(2)) : 0);
      subformWithoutGst += bg || (a > 0 ? Number((a / 1.18).toFixed(2)) : 0);
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
    rawZoho.Amount_Without_GST ? parseZohoNum(rawZoho.Amount_Without_GST) * 1.18 : 0,
    rawZoho.Deal_Amount_Without_GST ? parseZohoNum(rawZoho.Deal_Amount_Without_GST) * 1.18 : 0,
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
    totalNum > 0 ? Number((totalNum / 1.18).toFixed(2)) : 0
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
  
  const partnerBdmLookup = typeof rawZoho.Partner_BDM === 'object' && rawZoho.Partner_BDM !== null ? rawZoho.Partner_BDM : null;

  const partnerBdmName = 
    partnerBdmLookup?.name ||
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
    partnerBdmLookup?.id ? String(partnerBdmLookup.id) : (
    rawZoho.Partner_BDM_ID || 
    rawZoho.partner_bdm_id || 
    (typeof rawZoho.Partner_BDM === 'string' && /^\d+$/.test(rawZoho.Partner_BDM) ? rawZoho.Partner_BDM : '') ||
    existingDeal?.partnerBdmId ||
    existingDeal?.formData?.partnerBdmId ||
    '');

  const hasPartnerBdm = Boolean(
    partnerBdmLookup?.id ||
    partnerBdmName ||
    partnerBdmId ||
    rawZoho.Has_Partner_BDM || 
    rawZoho.has_partner_bdm || 
    (rawZoho.Partner_BDM && rawZoho.Partner_BDM !== 'false') || 
    rawZoho.Partner_BDM_amount ||
    existingDeal?.hasPartnerBdm ||
    existingDeal?.formData?.hasPartnerBdm
  );

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

  const employeeName = 
    (rawZoho.Employee && typeof rawZoho.Employee === 'object' ? rawZoho.Employee.name : (typeof rawZoho.Employee === 'string' && !/^\d+$/.test(rawZoho.Employee) ? rawZoho.Employee : '')) ||
    rawZoho.employeeName ||
    rawZoho.salesEmployee ||
    rawZoho.Created_By_Employee ||
    existingDeal?.employeeName ||
    existingDeal?.salesEmployee ||
    '';

  const employeeZohoId = 
    (rawZoho.Employee && typeof rawZoho.Employee === 'object' ? rawZoho.Employee.id : (typeof rawZoho.Employee === 'string' && /^\d+$/.test(rawZoho.Employee) ? rawZoho.Employee : null)) ||
    rawZoho.employeeZohoId ||
    existingDeal?.employeeZohoId ||
    '';

  const compZohoId = 
    (rawZoho.Company && typeof rawZoho.Company === 'object' ? rawZoho.Company.id : (typeof rawZoho.Company === 'string' && /^\d+$/.test(rawZoho.Company) ? rawZoho.Company : null)) ||
    (rawZoho.Companies && typeof rawZoho.Companies === 'object' ? rawZoho.Companies.id : (typeof rawZoho.Companies === 'string' && /^\d+$/.test(rawZoho.Companies) ? rawZoho.Companies : null)) ||
    (rawZoho.Account_Name && typeof rawZoho.Account_Name === 'object' ? rawZoho.Account_Name.id : null) ||
    existingDeal?.companyZohoId ||
    existingDeal?.formData?.companyZohoId ||
    null;

  const clientZohoId = 
    (rawZoho.Clients && typeof rawZoho.Clients === 'object' ? rawZoho.Clients.id : (typeof rawZoho.Clients === 'string' && /^\d+$/.test(rawZoho.Clients) ? rawZoho.Clients : null)) ||
    (rawZoho.Client && typeof rawZoho.Client === 'object' ? rawZoho.Client.id : (typeof rawZoho.Client === 'string' && /^\d+$/.test(rawZoho.Client) ? rawZoho.Client : null)) ||
    (rawZoho.Contact_Name && typeof rawZoho.Contact_Name === 'object' ? rawZoho.Contact_Name.id : null) ||
    existingDeal?.clientZohoId ||
    existingDeal?.formData?.clientZohoId ||
    null;

  let embeddedDlId = '';
  if (rawZoho.Deal_Name) {
    const match = String(rawZoho.Deal_Name).match(/\b(DL-\d+)\b/i);
    if (match) embeddedDlId = match[1].toUpperCase();
  }

  const resolvedId = existingDeal?.id || embeddedDlId || (rawZoho.id ? String(rawZoho.id) : `DL-${Math.floor(1000 + Math.random() * 9000)}`);

  return {
    ...existingDeal,
    id: resolvedId,
    zohoId: rawZoho.id || existingDeal?.zohoId,
    client: resolvedClient,
    company: resolvedCompany,
    companyZohoId: compZohoId,
    clientZohoId: clientZohoId,
    Company: rawZoho.Company || (compZohoId ? { id: compZohoId, name: resolvedCompany } : undefined),
    Companies: rawZoho.Companies || (compZohoId ? { id: compZohoId, name: resolvedCompany } : undefined),
    Clients: rawZoho.Clients || (clientZohoId ? { id: clientZohoId, name: resolvedClient } : undefined),
    service: serviceTitle,
    employeeName,
    employeeZohoId,
    salesEmployee: employeeName || existingDeal?.salesEmployee || '',
    Employee: rawZoho.Employee || (employeeZohoId ? { id: employeeZohoId, name: employeeName } : undefined),
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
    source: existingDeal?.source || 'System',
    hasPartnerBdm,
    has_partner_bdm: hasPartnerBdm,
    partnerBdmId,
    partner_bdm_id: partnerBdmId,
    partnerBdmName,
    partner_bdm_name: partnerBdmName,
    partnerBdmAmount,
    zohoStatus: 'synced',
    zohoSyncedAt: new Date().toISOString(),
    Payment_verifications: rawZoho.Payment_verifications === true || rawZoho.Payment_verifications === 'true' || rawZoho.Payment_verifications === 'Verified' || rawZoho.Payment_verifications === 'Yes' ? true : false,
    paymentVerified: rawZoho.Payment_verifications === true || rawZoho.Payment_verifications === 'true' || rawZoho.Payment_verifications === 'Verified' || rawZoho.Payment_verifications === 'Yes' ? true : false,
    documentsData: existingDeal?.documentsData || [],
    paymentScreenshotName: existingDeal?.paymentScreenshotName || rawZoho.Payment_Screenshot_Name || '',
    paymentScreenshotUrl: existingDeal?.paymentScreenshotUrl || '',
    formData: {
      clientName: resolvedClient,
      companyName: resolvedCompany,
      companyZohoId: compZohoId,
      clientZohoId: clientZohoId,
      Company: rawZoho.Company || (compZohoId ? { id: compZohoId, name: resolvedCompany } : undefined),
      Companies: rawZoho.Companies || (compZohoId ? { id: compZohoId, name: resolvedCompany } : undefined),
      Clients: rawZoho.Clients || (clientZohoId ? { id: clientZohoId, name: resolvedClient } : undefined),
      email: email,
      mobile: phone,
      gstNumber: gst,
      panCard: panVal,
      aadhaarCard: aadhVal,
      employeeName,
      employeeZohoId,
      salesEmployee: employeeName || existingDeal?.salesEmployee || '',
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
      legalDocsSenderName: rawZoho.Legal_documents_sender_name || rawZoho.Employee_name_sent1 || rawZoho.Employee_name_sent || existingDeal?.formData?.legalDocsSenderName || existingDeal?.legalDocsSenderName || '',
      Legal_documents_sender_name: rawZoho.Legal_documents_sender_name || rawZoho.Employee_name_sent1 || rawZoho.Employee_name_sent || existingDeal?.formData?.Legal_documents_sender_name || existingDeal?.Legal_documents_sender_name || '',
      legalDocsSenderDate: rawZoho.Date || rawZoho.Legal_documents_sender_date || rawZoho.Legal_date || existingDeal?.formData?.legalDocsSenderDate || existingDeal?.legalDocsSenderDate || '',
      Date: rawZoho.Date || rawZoho.Legal_documents_sender_date || rawZoho.Legal_date || existingDeal?.formData?.Date || existingDeal?.Date || '',
      Legal_documents_sender_date: rawZoho.Legal_documents_sender_date || rawZoho.Date || rawZoho.Legal_date || existingDeal?.formData?.Legal_documents_sender_date || existingDeal?.Legal_documents_sender_date || '',
      legalDocsReceiverName: rawZoho.Legal_documents_receiver_name || rawZoho.Employee_name_received1 || rawZoho.Employee_name_received || existingDeal?.formData?.legalDocsReceiverName || existingDeal?.legalDocsReceiverName || '',
      Legal_documents_receiver_name: rawZoho.Legal_documents_receiver_name || rawZoho.Employee_name_received1 || rawZoho.Employee_name_received || existingDeal?.formData?.Legal_documents_receiver_name || existingDeal?.Legal_documents_receiver_name || '',
      legalDocsReceivedDate: rawZoho.Legal_documents_received_date || existingDeal?.formData?.legalDocsReceivedDate || existingDeal?.legalDocsReceivedDate || '',
      Legal_documents_received_date: rawZoho.Legal_documents_received_date || existingDeal?.formData?.Legal_documents_received_date || existingDeal?.Legal_documents_received_date || '',
      reminder1Date: rawZoho.Reminder_1_date || rawZoho.Reminder_1 || existingDeal?.formData?.reminder1Date || existingDeal?.reminder1Date || '',
      Reminder_1_date: rawZoho.Reminder_1_date || rawZoho.Reminder_1 || existingDeal?.formData?.Reminder_1_date || existingDeal?.Reminder_1_date || '',
      reminder2Date: rawZoho.Reminder_2_date || rawZoho.Reminder_2 || existingDeal?.formData?.reminder2Date || existingDeal?.reminder2Date || '',
      Reminder_2_date: rawZoho.Reminder_2_date || rawZoho.Reminder_2 || existingDeal?.formData?.Reminder_2_date || existingDeal?.Reminder_2_date || '',
      reminder3Date: rawZoho.Reminder_3_date || rawZoho.Reminder_3 || existingDeal?.formData?.reminder3Date || existingDeal?.reminder3Date || '',
      Reminder_3_date: rawZoho.Reminder_3_date || rawZoho.Reminder_3 || existingDeal?.formData?.Reminder_3_date || existingDeal?.Reminder_3_date || '',
      reminder4Date: rawZoho.Reminder_4_date || rawZoho.Reminder_4 || existingDeal?.formData?.reminder4Date || existingDeal?.reminder4Date || '',
      Reminder_4_date: rawZoho.Reminder_4_date || rawZoho.Reminder_4 || existingDeal?.formData?.Reminder_4_date || existingDeal?.Reminder_4_date || '',
      reminder5Date: rawZoho.Reminder_5_date || rawZoho.Reminder_5 || existingDeal?.formData?.reminder5Date || existingDeal?.reminder5Date || '',
      Reminder_5_date: rawZoho.Reminder_5_date || rawZoho.Reminder_5 || existingDeal?.formData?.Reminder_5_date || existingDeal?.Reminder_5_date || '',
      ...(existingDeal?.formData || {})
    },
    legalDocsSenderName: rawZoho.Legal_documents_sender_name || rawZoho.Employee_name_sent1 || rawZoho.Employee_name_sent || existingDeal?.legalDocsSenderName || '',
    Legal_documents_sender_name: rawZoho.Legal_documents_sender_name || rawZoho.Employee_name_sent1 || rawZoho.Employee_name_sent || existingDeal?.Legal_documents_sender_name || '',
    legalDocsSenderDate: rawZoho.Date || rawZoho.Legal_documents_sender_date || rawZoho.Legal_date || existingDeal?.legalDocsSenderDate || '',
    Date: rawZoho.Date || rawZoho.Legal_documents_sender_date || rawZoho.Legal_date || existingDeal?.Date || '',
    Legal_documents_sender_date: rawZoho.Legal_documents_sender_date || rawZoho.Date || rawZoho.Legal_date || existingDeal?.Legal_documents_sender_date || '',
    legalDocsReceiverName: rawZoho.Legal_documents_receiver_name || rawZoho.Employee_name_received1 || rawZoho.Employee_name_received || existingDeal?.legalDocsReceiverName || '',
    Legal_documents_receiver_name: rawZoho.Legal_documents_receiver_name || rawZoho.Employee_name_received1 || rawZoho.Employee_name_received || existingDeal?.Legal_documents_receiver_name || '',
    legalDocsReceivedDate: rawZoho.Legal_documents_received_date || existingDeal?.legalDocsReceivedDate || '',
    Legal_documents_received_date: rawZoho.Legal_documents_received_date || existingDeal?.Legal_documents_received_date || '',
    reminder1Date: rawZoho.Reminder_1_date || rawZoho.Reminder_1 || existingDeal?.reminder1Date || '',
    Reminder_1_date: rawZoho.Reminder_1_date || rawZoho.Reminder_1 || existingDeal?.Reminder_1_date || '',
    reminder2Date: rawZoho.Reminder_2_date || rawZoho.Reminder_2 || existingDeal?.reminder2Date || '',
    Reminder_2_date: rawZoho.Reminder_2_date || rawZoho.Reminder_2 || existingDeal?.Reminder_2_date || '',
    reminder3Date: rawZoho.Reminder_3_date || rawZoho.Reminder_3 || existingDeal?.reminder3Date || '',
    Reminder_3_date: rawZoho.Reminder_3_date || rawZoho.Reminder_3 || existingDeal?.Reminder_3_date || '',
    reminder4Date: rawZoho.Reminder_4_date || rawZoho.Reminder_4 || existingDeal?.reminder4Date || '',
    Reminder_4_date: rawZoho.Reminder_4_date || rawZoho.Reminder_4 || existingDeal?.Reminder_4_date || '',
    reminder5Date: rawZoho.Reminder_5_date || rawZoho.Reminder_5 || existingDeal?.reminder5Date || '',
    Reminder_5_date: rawZoho.Reminder_5_date || rawZoho.Reminder_5 || existingDeal?.Reminder_5_date || '',
    servicesData: servicesSubform,
    legalData: Array.isArray(rawZoho.Legal) && rawZoho.Legal.length > 0
      ? rawZoho.Legal.map((lg: any, i: number) => ({
          id: String(lg.id || `temp_${i + 1}`),
          schema: lg.Legal_Schemas || lg.Schemas || lg.schema || servicesSubform[i]?.name || 'Service',
          Legal_Schemas: lg.Legal_Schemas || lg.Schemas || lg.schema || servicesSubform[i]?.name || 'Service',
          internalTeamType: lg.Internal_team_type || lg.internalTeamType || '',
          Internal_team_type: lg.Internal_team_type || lg.internalTeamType || '',
          legalStatus: lg.Internal_legal_status || lg.legalStatus || '',
          Internal_legal_status: lg.Internal_legal_status || lg.legalStatus || '',
          remark: lg.Remark || lg.remark || '',
          Remark: lg.Remark || lg.remark || '',
          docTypes: lg.Types_of_legal_documents || lg.docTypes || '',
          Types_of_legal_documents: lg.Types_of_legal_documents || lg.docTypes || '',
          terms1: lg.Agreement_Terms_I || lg.Agreement_Terms || lg.terms1 || lg.agreementTerms || '',
          Agreement_Terms_I: lg.Agreement_Terms_I || lg.Agreement_Terms || lg.terms1 || lg.agreementTerms || '',
          terms2: lg.Agreement_Terms_II || lg.terms2 || '',
          Agreement_Terms_II: lg.Agreement_Terms_II || lg.terms2 || '',
          tenure: lg.Tenure_of_Service || lg.tenure || '',
          Tenure_of_Service: lg.Tenure_of_Service || lg.tenure || '',
        }))
      : (existingDeal?.legalData || []),
    Legal: Array.isArray(rawZoho.Legal) && rawZoho.Legal.length > 0
      ? rawZoho.Legal
      : (existingDeal?.Legal || existingDeal?.legalData || []),
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
 * Inserts a new record into the System Company_Policies module using REST API v8.
 * Module API Name: Company_Policies
 */
export async function insertZohoPolicy(policy: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Company_Policies', policy);
    const response = await fetch('/api/zoho/insert-policy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Company Policy inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert company policy successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting company policy:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Company_Policies module using REST API v8.
 */
export async function updateZohoPolicy(policy: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Company_Policies', policy);
    const response = await fetch('/api/zoho/update-policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || policy.zohoId,
        message: data.message || 'Company Policy updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update company policy successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating company policy:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a company policy record successfully depending on whether policy.zohoId exists.
 */
export async function saveOrUpdateZohoPolicy(policy: any): Promise<ZohoApiResponse> {
  if (policy.zohoId) {
    return updateZohoPolicy(policy);
  }
  return insertZohoPolicy(policy);
}

/**
 * Deletes a company policy record successfully using REST API v8.
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
        message: data.message || `Company Policy #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete company policy successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting company policy:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live company policy records successfully Company_Policies module.
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
        message: 'Company Policies fetched successfully successfully'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch company policies successfully'
    };
  } catch (error: any) {
    console.error('[System] Client exception while fetching company policies:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with server endpoint endpoint'
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
      message: `${insertRes.message} & attachment uploaded successfully (ID: #${insertRes.zohoId})`,
      data: {
        record: insertRes.data,
        attachment: attachRes.data,
      },
    };
  } catch (err: any) {
    console.warn('[System] Policy record created successfully but attachment failed:', err);
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
 * Inserts a new record into the System Company_Calendar module using REST API v8.
 * Module API Name: Company_Calendar
 */
export async function insertZohoCalendarEvent(event: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Company_Calendar', event);
    const response = await fetch('/api/zoho/insert-calendar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Calendar event inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert calendar event successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting calendar event:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System Company_Calendar module using REST API v8.
 */
export async function updateZohoCalendarEvent(event: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Company_Calendar', event);
    const response = await fetch('/api/zoho/update-calendar', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || event.zohoId,
        message: data.message || 'Calendar event updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update calendar event successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating calendar event:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a calendar event successfully depending on whether event.zohoId exists.
 */
export async function saveOrUpdateZohoCalendarEvent(event: any): Promise<ZohoApiResponse> {
  if (event.zohoId) {
    return updateZohoCalendarEvent(event);
  }
  return insertZohoCalendarEvent(event);
}

/**
 * Deletes a calendar event record successfully using REST API v8.
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
        message: data.message || `Calendar event #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete calendar event successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting calendar event:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live calendar events successfully Company_Calendar module with RBAC scoping.
 */
export async function fetchZohoCalendarEvents(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Company_Calendar', options);
}

/**
 * Inserts a new record into the System DSR module using REST API v8.
 * Module API Name: DSR
 */
export async function insertZohoDsr(dsr: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('DSR', dsr);
    const response = await fetch('/api/zoho/insert-dsr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'DSR inserted successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to insert DSR successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while inserting DSR:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing record in the System DSR module using REST API v8.
 */
export async function updateZohoDsr(dsr: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('DSR', dsr);
    const response = await fetch('/api/zoho/update-dsr', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || dsr.zohoId,
        message: data.message || 'DSR updated successfully successfully',
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to update DSR successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while updating DSR:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a DSR report successfully depending on whether dsr.zohoId exists.
 */
export async function saveOrUpdateZohoDsr(dsr: any): Promise<ZohoApiResponse> {
  if (dsr.zohoId) {
    return updateZohoDsr(dsr);
  }
  return insertZohoDsr(dsr);
}

/**
 * Deletes a DSR record successfully using REST API v8.
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
        message: data.message || `DSR #${zohoId} deleted successfully`,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to delete DSR successfully',
        errorDetails: data.errorDetails || data,
      };
    }
  } catch (error: any) {
    console.error('[System] Client exception while deleting DSR:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with delete endpoint',
      errorDetails: error,
    };
  }
}

/**
 * Fetches all live DSR records successfully DSR module with RBAC scoping.
 */
export async function fetchZohoDsr(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('DSR', options);
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
 * Fetches all live attendance records successfully Daily_Attendance module.
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
        message: 'Attendance records fetched successfully successfully'
      };
    }
    return {
      success: false,
      data: [],
      info: result.info,
      message: result.message || 'Failed to fetch attendance records successfully'
    };
  } catch (error: any) {
    console.error('[System] Client exception while fetching attendance records:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with server endpoint endpoint'
    };
  }
}

/**
 * Inserts or updates (upserts) attendance record successfully Daily_Attendance module.
 * Uses duplicate check on `Name` (`${Employee_Code} - ${Attendance_Date}`).
 */
export async function saveOrUpdateZohoAttendance(record: ZohoAttendancePayload): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Attendance', record as any);
    const response = await fetch('/api/zoho/save-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || data.data?.details?.id,
        message: data.message || 'Attendance record saved successfully successfully',
        data: data.data,
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to save attendance record successfully',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    console.error('[System] Client exception while saving attendance record:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint endpoint'
    };
  }
}

/**
 * Deletes attendance record successfully Daily_Attendance module.
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
        message: data.message || 'Attendance record deleted successfully',
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to delete attendance record successfully',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    console.error('[System] Client exception while deleting attendance record:', error);
    return {
      success: false,
      message: error?.message || 'Network error communicating with server endpoint endpoint'
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
 * Fetches all live query records successfully Cases module with RBAC scoping.
 */
export async function fetchZohoQueries(options?: ZohoFetchOptions): Promise<ZohoFetchResult> {
  return fetchZohoWithRbac('Raised_Queries', options);
}

/**
 * Inserts a new query successfully Cases module.
 */
export async function insertZohoQuery(query: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Raised_Queries', query);
    const response = await fetch('/api/zoho/insert-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId,
        message: data.message || 'Query inserted successfully successfully',
        data: data.data,
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to insert query successfully',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Network error communicating with System server',
      errorDetails: error,
    };
  }
}

/**
 * Updates an existing query successfully Cases module.
 */
export async function updateZohoQuery(query: any): Promise<ZohoApiResponse> {
  try {
    const payload = injectEmployeeLookup('Raised_Queries', query);
    const response = await fetch('/api/zoho/update-query', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await safeParseResponse(response);
    if (response.ok && data.success) {
      return {
        success: true,
        zohoId: data.zohoId || query.zohoId,
        message: data.message || 'Query updated successfully successfully',
        data: data.data,
      };
    }
    return {
      success: false,
      message: data.message || 'Failed to update query successfully',
      errorDetails: data.errorDetails || data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Network error communicating with System server',
      errorDetails: error,
    };
  }
}

/**
 * Automatically inserts or updates a query successfully.
 */
export async function saveOrUpdateZohoQuery(query: any): Promise<ZohoApiResponse> {
  if (query.zohoId) {
    return updateZohoQuery(query);
  }
  return insertZohoQuery(query);
}

/**
 * Deletes a query record successfully.
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
