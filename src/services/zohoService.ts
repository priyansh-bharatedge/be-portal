/**
 * Zoho CRM REST API Integration Service (v8)
 * Domain: .in (accounts.zoho.in / zohoapis.in) & .com (accounts.zoho.com / zohoapis.com)
 * Modules: Quotations, Leads, Deals
 * Documentation: 
 * - Insert Records: https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html
 * - Upload Attachments: https://www.zoho.com/crm/developer/docs/api/v8/upload-attachments.html
 *   Example: POST https://www.zohoapis.com/crm/v8/Leads/{record_id}/Attachments
 */

export interface ZohoApiResponse {
  success: boolean;
  zohoId?: string;
  attachmentId?: string;
  message: string;
  data?: any;
  errorDetails?: any;
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
 * Fetches all live employee records from Zoho CRM Employee module.
 */
export async function fetchZohoEmployees(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-employees');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Employees fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch employees from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching employees:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-employees endpoint'
    };
  }
}

/**
 * Fetches all live leave records from Zoho CRM Leave_Management module.
 */
export async function fetchZohoLeaves(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-leaves');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Leaves fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch leaves from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching leaves:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-leaves endpoint'
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
export async function fetchZohoCompanies(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-companies');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Companies fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch companies from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching companies:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-companies endpoint'
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
export async function fetchZohoClients(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-clients');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Clients fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch clients from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching clients:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-clients endpoint'
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

    const data = await response.json();
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

    const data = await response.json();
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
export async function fetchZohoDeals(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-deals');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Deals fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch deals from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching deals:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-deals endpoint'
    };
  }
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
export async function fetchZohoPolicies(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-policies');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Company Policies fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch company policies from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching company policies:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-policies endpoint'
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
export async function fetchZohoCalendarEvents(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-calendar');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'Calendar events fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch calendar events from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching calendar events:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-calendar endpoint'
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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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
export async function fetchZohoDsr(): Promise<{ success: boolean; data: any[]; message?: string }> {
  try {
    const response = await fetch('/api/zoho/get-dsr');
    const result = await response.json();
    if (response.ok && result.success && Array.isArray(result.data)) {
      return {
        success: true,
        data: result.data,
        message: 'DSR records fetched successfully from Zoho CRM'
      };
    }
    return {
      success: false,
      data: [],
      message: result.message || 'Failed to fetch DSR records from Zoho CRM'
    };
  } catch (error: any) {
    console.error('[Zoho CRM] Client exception while fetching DSR records:', error);
    return {
      success: false,
      data: [],
      message: error?.message || 'Network error communicating with Zoho CRM get-dsr endpoint'
    };
  }
}

