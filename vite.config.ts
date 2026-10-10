import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import nodemailer from 'nodemailer'
import dealsHandler from './api/deals.ts'

function zohoApiPlugin(): Plugin {

  function logZohoApiCall(actionName: string, method: string, endpoint: string, payload: any, statusCode: number, responseData: any) {
    console.log('\n==================== [ZOHO CRM API CALL] ====================');
    console.log('📌 Action:      ' + actionName);
    console.log('🌐 HTTP Method: ' + method);
    console.log('🔗 Endpoint:    ' + endpoint);
    if (payload !== undefined && payload !== null) {
      console.log('📦 Request Payload Sent to Zoho CRM:\n' + JSON.stringify(payload, null, 2));
    }
    console.log('📊 Zoho Response Status: ' + statusCode);
    console.log('📥 Zoho API Response Data:\n' + JSON.stringify(responseData, null, 2));
    console.log('=============================================================\n');
  }

  let cachedToken: string | null = null;
  let tokenExpiry = 0;

  async function getAccessToken(env: Record<string, string>): Promise<string> {
    const clientId = env.VITE_ZOHO_CLIENT_ID || '1000.ENHQL8XIKM7Q7AO7PGPY1EUICG80QF';
    const clientSecret = env.VITE_ZOHO_CLIENT_SECRET || 'c5659d87156496be12bea1489a7a2f4500c7241131';
    const refreshToken = env.VITE_ZOHO_REFRESH_TOKEN || '1000.bdf58bb9452babb83e6f001ec50ea44f.7c72197a07b2fb22502ce57112cbae91';

    const now = Date.now();
    if (cachedToken && tokenExpiry > now + 60000) {
      return cachedToken;
    }

    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });

    const accountsUrl = env.VITE_ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
    const tokenUrl = `${accountsUrl}/oauth/v2/token?${params.toString()}`;
    const res = await fetch(tokenUrl, { method: 'POST' });
    const data: any = await res.json();

    if (!data.access_token) {
      throw new Error(data.error_description || data.error || data.message || 'Failed to obtain access token from Zoho');
    }

    const token: string = data.access_token;
    cachedToken = token;
    tokenExpiry = now + (Number(data.expires_in) || 3600) * 1000;
    return token;
  }

  const employeeLookupCache = new Map<string, string>();

  async function resolveZohoEmployeeId(empInfo: any, token: string, apiBase: string): Promise<string | null> {
    if (!empInfo) return null;

    const directId = typeof empInfo === 'object' ? empInfo.id || empInfo.zohoId : empInfo;
    const name = (typeof empInfo === 'object' ? (empInfo.name || empInfo.employeeName || empInfo.salesEmployee) : (typeof empInfo === 'string' && !/^\d+$/.test(empInfo) ? empInfo : '')) || '';
    const email = (typeof empInfo === 'object' ? (empInfo.email || empInfo.employeeEmail || empInfo.workEmail || empInfo.personalEmail || empInfo.userEmail) : '') || '';
    const empCode = (typeof empInfo === 'object' ? (empInfo.empId || empInfo.employeeId || empInfo.Employment_ID) : '') || '';

    const cleanDirectId = String(directId || '').trim();
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(empCode || '').trim().toLowerCase();

    if (!cleanDirectId && !cleanName && !cleanEmail && !cleanCode) {
      return null;
    }

    const cacheKey = `${cleanDirectId}|${cleanName}|${cleanEmail}|${cleanCode}`;
    if (employeeLookupCache.has(cacheKey)) {
      return employeeLookupCache.get(cacheKey)!;
    }

    // Query Zoho CRM Employee module to find the verified record in the custom Employee module
    try {
      const moduleName = process.env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
      const empRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Name,Email,Personal_Email_Address,Employment_ID,Middle_Name,Last_Name`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      if (empRes.status === 200) {
        const empData: any = await empRes.json();
        const list: any[] = empData.data || [];

        // 1. Check if directId matches an existing Employee record id
        if (cleanDirectId && /^\d{15,}$/.test(cleanDirectId)) {
          const directMatch = list.find((e: any) => String(e.id) === cleanDirectId);
          if (directMatch?.id) {
            const foundId = String(directMatch.id);
            employeeLookupCache.set(cacheKey, foundId);
            return foundId;
          }
        }

        // 2. Match by email, employment code, or full name
        const match = list.find((e: any) => {
          const eEmail = (e.Email || e.Personal_Email_Address || '').trim().toLowerCase();
          const eCode = (e.Employment_ID || '').trim().toLowerCase();
          const eFullName = [e.Name, e.Middle_Name, e.Last_Name].filter(Boolean).join(' ').trim().toLowerCase();
          const eName = (e.Name || '').trim().toLowerCase();
          return (
            (cleanEmail && eEmail === cleanEmail) ||
            (cleanCode && eCode === cleanCode) ||
            (cleanName && (
              eName === cleanName.toLowerCase() ||
              eFullName === cleanName.toLowerCase() ||
              eFullName.includes(cleanName.toLowerCase()) ||
              cleanName.toLowerCase().includes(eFullName) ||
              cleanName.toLowerCase().includes(eName)
            ))
          );
        });

        if (match?.id) {
          const foundId = String(match.id);
          employeeLookupCache.set(cacheKey, foundId);
          return foundId;
        }
      }
    } catch (err) {
      console.warn('[Zoho CRM] Employee search query failed:', err);
    }

    return null;
  }

  const companyLookupCache = new Map<string, string>();

  async function resolveZohoCompanyId(compInfo: any, token: string, apiBase: string): Promise<string | null> {
    if (!compInfo) return null;

    const directId = typeof compInfo === 'object' ? compInfo.id || compInfo.zohoId || compInfo.companyZohoId : compInfo;
    const name = (typeof compInfo === 'object' ? (compInfo.name || compInfo.companyName || compInfo.company || compInfo.Company_Name) : (typeof compInfo === 'string' && !/^\d+$/.test(compInfo) ? compInfo : '')) || '';
    const gst = (typeof compInfo === 'object' ? (compInfo.gstNumber || compInfo.Gst_number || compInfo.GST_Number) : '') || '';
    const pan = (typeof compInfo === 'object' ? (compInfo.panNumber || compInfo.companyPan || compInfo.Pan_number || compInfo.PAN_Number || compInfo.Company_PAN_Number) : '') || '';

    const cleanDirectId = String(directId || '').trim();
    const cleanName = String(name || '').trim();
    const cleanGst = String(gst || '').trim().toUpperCase();
    const cleanPan = String(pan || '').trim().toUpperCase();

    if (!cleanDirectId && !cleanName && !cleanGst && !cleanPan) {
      return null;
    }

    if (cleanDirectId && /^\d{15,}$/.test(cleanDirectId)) {
      return cleanDirectId;
    }

    const cacheKey = `${cleanDirectId}|${cleanName}|${cleanGst}|${cleanPan}`;
    if (companyLookupCache.has(cacheKey)) {
      return companyLookupCache.get(cacheKey)!;
    }

    try {
      const moduleName = process.env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
      const compRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Name,Company_Name,GST_Number,Gst_number,Pan_number,PAN_Number,Company_PAN_Number`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      if (compRes.status === 200) {
        const compData: any = await compRes.json();
        const list: any[] = compData.data || [];

        if (cleanDirectId && /^\d{15,}$/.test(cleanDirectId)) {
          const directMatch = list.find((c: any) => String(c.id) === cleanDirectId);
          if (directMatch?.id) {
            const foundId = String(directMatch.id);
            companyLookupCache.set(cacheKey, foundId);
            return foundId;
          }
        }

        const match = list.find((c: any) => {
          const cGst = String(c.GST_Number || c.Gst_number || '').trim().toUpperCase();
          const cPan = String(c.PAN_Number || c.Pan_number || c.Company_PAN_Number || '').trim().toUpperCase();
          const cName = String(c.Name || c.Company_Name || '').trim().toLowerCase();
          const targetName = cleanName.toLowerCase();

          return (
            (cleanGst && cGst && cGst === cleanGst) ||
            (cleanPan && cPan && cPan === cleanPan) ||
            (cleanName && (
              cName === targetName ||
              cName.includes(targetName) ||
              targetName.includes(cName)
            ))
          );
        });

        if (match?.id) {
          const foundId = String(match.id);
          companyLookupCache.set(cacheKey, foundId);
          return foundId;
        }
      }
    } catch (err) {
      console.warn('[Zoho CRM] Company search query failed:', err);
    }

    return null;
  }

  const clientLookupCache = new Map<string, string>();

  async function resolveZohoClientId(clientInfo: any, token: string, apiBase: string): Promise<string | null> {
    if (!clientInfo) return null;

    const directId = typeof clientInfo === 'object' ? clientInfo.id || clientInfo.zohoId || clientInfo.clientZohoId : clientInfo;
    const name = (typeof clientInfo === 'object' ? (clientInfo.name || clientInfo.clientName || clientInfo.client || clientInfo.Contact_Name) : (typeof clientInfo === 'string' && !/^\d+$/.test(clientInfo) ? clientInfo : '')) || '';
    const phone = (typeof clientInfo === 'object' ? (clientInfo.phone || clientInfo.mobile || clientInfo.Client_contact_detail) : '') || '';
    const email = (typeof clientInfo === 'object' ? (clientInfo.email || clientInfo.Client_Email_address) : '') || '';

    const cleanDirectId = String(directId || '').trim();
    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanDirectId && !cleanName && !cleanPhone && !cleanEmail) {
      return null;
    }

    if (cleanDirectId && /^\d{15,}$/.test(cleanDirectId)) {
      return cleanDirectId;
    }

    const cacheKey = `${cleanDirectId}|${cleanName}|${cleanPhone}|${cleanEmail}`;
    if (clientLookupCache.has(cacheKey)) {
      return clientLookupCache.get(cacheKey)!;
    }

    try {
      const moduleName = process.env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
      const clRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Name,Contact_Name,Client_contact_detail,Mobile,Phone,Email,Client_Email_address`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      if (clRes.status === 200) {
        const clData: any = await clRes.json();
        const list: any[] = clData.data || [];

        if (cleanDirectId && /^\d{15,}$/.test(cleanDirectId)) {
          const directMatch = list.find((c: any) => String(c.id) === cleanDirectId);
          if (directMatch?.id) {
            const foundId = String(directMatch.id);
            clientLookupCache.set(cacheKey, foundId);
            return foundId;
          }
        }

        const match = list.find((c: any) => {
          const cPhone = String(c.Mobile || c.Phone || c.Client_contact_detail || '').replace(/[^0-9]/g, '');
          const cEmail = String(c.Email || c.Client_Email_address || '').trim().toLowerCase();
          const cName = String(c.Name || c.Contact_Name || '').trim().toLowerCase();
          const targetName = cleanName.toLowerCase();

          return (
            (cleanPhone && cPhone && (cPhone === cleanPhone || cPhone.endsWith(cleanPhone) || cleanPhone.endsWith(cPhone))) ||
            (cleanEmail && cEmail && cEmail === cleanEmail) ||
            (cleanName && (cName === targetName || cName.includes(targetName) || targetName.includes(cName)))
          );
        });

        if (match?.id) {
          const foundId = String(match.id);
          clientLookupCache.set(cacheKey, foundId);
          return foundId;
        }
      }
    } catch (err) {
      console.warn('[Zoho CRM] Client search query failed:', err);
    }

    return null;
  }

  const ZOHO_DEAL_TRANSITION_MAP: Record<string, string> = {
    'accounts': '1078476000000489153',
    'account': '1078476000000489153',
    'sales to account': '1078476000000489153',
    'sales_to_account': '1078476000000489153',
    'sales to accounts': '1078476000000489153',
    'sales_to_accounts': '1078476000000489153',

    'legal': '1078476000000492001',
    'account to legal': '1078476000000492001',
    'account_to_legal': '1078476000000492001',
    'accounts to legal': '1078476000000492001',
    'accounts_to_legal': '1078476000000492001',

    'operations allocator': '1078476000000492099',
    'operations_allocator': '1078476000000492099',
    'allocator': '1078476000000492099',
    'legal to operations allocator': '1078476000000492099',
    'legal_to_operations_allocator': '1078476000000492099',

    'operations executors': '1078476000001938757',
    'operations_executors': '1078476000001938757',
    'executors': '1078476000001938757',
    'operations allocator to operations executors': '1078476000001938757',
    'operations_allocator_to_operations_executors': '1078476000001938757',
  };

  async function executeZohoDealBlueprintTransition(
    recordId: string,
    transitionId: string,
    remarks: string = 'Updated via API from Frontend Portal',
    token: string,
    apiBase: string,
    additionalData: Record<string, any> = {}
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const endpoint = `${apiBase}/crm/v8/Deals/${recordId}/actions/blueprint`;
      console.log(`[Vite Zoho Plugin] Executing Blueprint Transition for Deal #${recordId} (Transition ID: ${transitionId})`);
      
      const bodyPayload = {
        blueprint: [
          {
            transition_id: transitionId,
            data: {
              Remarks: remarks || 'Updated via API from Frontend Portal',
              ...additionalData,
            },
          },
        ],
      };

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      const data: any = await res.json();
      console.log(`[Vite Zoho Plugin] Blueprint Transition Response (Status ${res.status}):`, JSON.stringify(data));

      const result = Array.isArray(data?.blueprint) ? data.blueprint[0] : (data?.data?.[0] || data);
      if (res.ok && (result?.code === 'SUCCESS' || result?.status === 'success' || data?.code === 'SUCCESS')) {
        return {
          success: true,
          message: result?.message || 'Deal stage transitioned successfully via Zoho Blueprint',
          data,
        };
      } else {
        const errMsg = result?.message || data?.message || 'Failed to execute blueprint transition in Zoho CRM';
        return {
          success: false,
          message: errMsg,
          data,
        };
      }
    } catch (e: any) {
      console.error('[Vite Zoho Plugin] Exception during Blueprint transition:', e);
      return {
        success: false,
        message: e?.message || 'Network exception executing Blueprint transition',
      };
    }
  }

  
  function buildZohoPaginationQuery(urlObj: URL): string {
    const queryParts: string[] = [];
    const page = urlObj.searchParams.get('page') || '';
    const perPage = urlObj.searchParams.get('per_page') || '200';
    const pageToken = urlObj.searchParams.get('page_token') || '';
    const criteria = urlObj.searchParams.get('criteria') || '';

    if (pageToken) {
      queryParts.push(`page_token=${encodeURIComponent(pageToken)}`);
    } else if (page) {
      queryParts.push(`page=${encodeURIComponent(page)}`);
    }
    
    if (perPage) {
      const parsedPerPage = Math.min(Math.max(1, parseInt(perPage, 10) || 200), 200);
      queryParts.push(`per_page=${parsedPerPage}`);
    } else {
      queryParts.push(`per_page=200`);
    }

    if (criteria) {
      queryParts.push(`criteria=${encodeURIComponent(criteria)}`);
    }

    return queryParts.join('&');
  }

  function formatDateForZoho(dateStr?: string | null): string | null {
    if (!dateStr || !dateStr.trim()) return null;
    const s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const ddmmyyyy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      return `${ddmmyyyy[3]}-${month}-${day}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    return null;
  }

  function buildQuotationZohoPayload(quotation: any): Record<string, any> {
    const fd = quotation.formData || {};
    const servicesData = quotation.servicesData || [];
    const totals = quotation.totals || {};

    const clientName = fd.clientName || quotation.client || '';
    const companyName = fd.companyName || quotation.company || '';
    const quotationId = quotation.id || '';

    let quotationName = clientName;
    if (companyName && clientName) {
      quotationName = `${companyName} - ${clientName}`;
    } else if (companyName) {
      quotationName = companyName;
    }
    if (quotationId) {
      quotationName = `${quotationName} (${quotationId})`;
    }
    if (!quotationName.trim()) {
      quotationName = `Quotation ${quotationId || Date.now()}`;
    }

    const subtotalNum = Number(totals.subtotal) || servicesData.reduce((sum: number, s: any) => sum + (Number(s.baseAmount) || 0), 0);
    const totalGstNum = Number(totals.totalGst) || (subtotalNum * 0.18);
    const grandTotalNum = Number(totals.grandTotal) || (subtotalNum + totalGstNum);

    const payload: Record<string, any> = {
      Name: quotationName,
    };

    if (quotation.zohoId) {
      payload.id = String(quotation.zohoId);
    }

    if (fd.email) payload.Email = fd.email;
    if (fd.mobile) payload.Mobile_Number = String(fd.mobile).replace(/[^0-9]/g, '');
    if (fd.gender) payload.Gender = fd.gender;
    if (fd.city) payload.City = fd.city;
    if (fd.state) payload.State = fd.state;
    if (fd.panCard) payload.PAN_Card = String(fd.panCard).toUpperCase();
    if (fd.aadhaarCard) payload.Aadhaar_Card = String(fd.aadhaarCard).replace(/[^0-9]/g, '');
    if (fd.companyName) payload.Company_Name = fd.companyName;
    if (fd.businessType) payload.Company_Type = fd.businessType;

    const formattedDoi = formatDateForZoho(fd.doi);
    if (formattedDoi) payload.Date_of_Incorporation = formattedDoi;

    if (fd.gstNumber) payload.GST_Number = String(fd.gstNumber).toUpperCase();
    if (fd.companyPan) payload.Company_PAN_Number = String(fd.companyPan).toUpperCase();
    if (fd.sector) payload.Sector = fd.sector;
    if (fd.industry) payload.Industry = fd.industry;

    payload.Subtotal = `₹${subtotalNum.toLocaleString('en-IN')}`;
    payload.Total_GST = `₹${totalGstNum.toLocaleString('en-IN')}`;
    payload.Grand_Total = `₹${grandTotalNum.toLocaleString('en-IN')}`;

    if (servicesData.length > 0) {
      payload.Services_And_Pricing = servicesData.map((s: any) => {
        const base = Number(s.baseAmount) || 0;
        const gst = base * 0.18;
        const total = base + gst;
        return {
          Service: s.name || 'Service',
          Base: `₹${base.toLocaleString('en-IN')}`,
          GST: `₹${gst.toLocaleString('en-IN')}`,
          Total: `₹${total.toLocaleString('en-IN')}`,
        };
      });
    }

    // Associate Employee Lookup field with the logged-in employee record
    const empLookupId = quotation.employeeZohoId || fd.employeeZohoId || quotation.empZohoId || fd.empZohoId || (typeof quotation.Employee === 'object' ? quotation.Employee?.id : (typeof quotation.Employee === 'string' && /^\d+$/.test(quotation.Employee) ? quotation.Employee : null));
    if (empLookupId && String(empLookupId).trim() !== '') {
      payload.Employee = { id: String(empLookupId).trim() };
    }
    const empCode = quotation.empId || fd.empId || quotation.employeeId || fd.employeeId;
    if (empCode) {
      payload.Employment_ID = String(empCode);
      payload.Employee_Code = String(empCode);
    }

    return payload;
  }

  async function reconcileDealSubformsWithZoho(
    dealZohoId: string,
    payload: Record<string, any>,
    accessToken: string,
    apiBase: string,
    moduleName: string = 'Deals'
  ): Promise<void> {
    const cleanId = String(dealZohoId || '').trim();
    if (!cleanId || !/^\d{15,}$/.test(cleanId)) return;

    try {
      const fetchUrl = `${apiBase}/crm/v8/${moduleName}/${cleanId}?fields=Subform_1,Legal`;
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
        },
      });
      if (!res.ok) return;
      const json: any = await res.json();
      const existing = json?.data?.[0];
      if (!existing) return;

      // 1. Reconcile Subform_1 (Choose services)
      if (Array.isArray(payload.Subform_1) && payload.Subform_1.length > 0) {
        const existingSubform = Array.isArray(existing.Subform_1) ? existing.Subform_1 : [];
        const usedIds = new Set<string>();

        payload.Subform_1 = payload.Subform_1.map((item: any, idx: number) => {
          if (item.id && /^\d{15,}$/.test(String(item.id))) {
            usedIds.add(String(item.id));
            return item;
          }

          const itemSchema = (item.Schemas || item.Schema || item.name || '').trim().toLowerCase();
          let matched = existingSubform.find(
            (ex: any) => ex.id && !usedIds.has(String(ex.id)) && (ex.Schemas || ex.Schema || '').trim().toLowerCase() === itemSchema
          );
          if (!matched && existingSubform[idx] && !usedIds.has(String(existingSubform[idx].id))) {
            matched = existingSubform[idx];
          }

          if (matched && matched.id && /^\d{15,}$/.test(String(matched.id))) {
            usedIds.add(String(matched.id));
            return { ...item, id: String(matched.id) };
          }

          const cleanItem = { ...item };
          delete cleanItem.id;
          return cleanItem;
        });

        // Mark all duplicate/unused rows in Zoho CRM for deletion
        for (const ex of existingSubform) {
          if (ex.id && /^\d{15,}$/.test(String(ex.id)) && !usedIds.has(String(ex.id))) {
            payload.Subform_1.push({
              id: String(ex.id),
              _delete: null,
            });
          }
        }
      }

      // 2. Reconcile Legal Subform
      if (Array.isArray(payload.Legal) && payload.Legal.length > 0) {
        const existingLegal = Array.isArray(existing.Legal) ? existing.Legal : [];
        const usedLegalIds = new Set<string>();

        payload.Legal = payload.Legal.map((item: any, idx: number) => {
          if (item.id && /^\d{15,}$/.test(String(item.id))) {
            usedLegalIds.add(String(item.id));
            return item;
          }

          const itemSchema = (item.Legal_Schemas || item.schema || item.Schemas || '').trim().toLowerCase();
          let matched = existingLegal.find(
            (ex: any) => ex.id && !usedLegalIds.has(String(ex.id)) && (ex.Legal_Schemas || ex.Schemas || '').trim().toLowerCase() === itemSchema
          );
          if (!matched && existingLegal[idx] && !usedLegalIds.has(String(existingLegal[idx].id))) {
            matched = existingLegal[idx];
          }

          if (matched && matched.id && /^\d{15,}$/.test(String(matched.id))) {
            usedLegalIds.add(String(matched.id));
            return { ...item, id: String(matched.id) };
          }

          const cleanItem = { ...item };
          delete cleanItem.id;
          return cleanItem;
        });

        // Mark all duplicate/unused rows in Zoho CRM for deletion
        for (const ex of existingLegal) {
          if (ex.id && /^\d{15,}$/.test(String(ex.id)) && !usedLegalIds.has(String(ex.id))) {
            payload.Legal.push({
              id: String(ex.id),
              _delete: null,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Vite Zoho Plugin] Error reconciling subform row IDs with Zoho CRM:', err);
    }
  }

  function buildDealZohoPayload(deal: any): Record<string, any> {
    const fd = deal.formData || {};
    const clientName = fd.clientName || deal.client || '';
    const companyName = fd.companyName || deal.company || '';
    const dealId = deal.id || '';
    let dealName = clientName;
    if (companyName && clientName) {
      dealName = `${companyName} - ${clientName}`;
    } else if (companyName) {
      dealName = companyName;
    }
    if (dealId) {
      dealName = `${dealName} (${dealId})`;
    }
    if (!dealName.trim()) {
      dealName = `Deal ${dealId || Date.now()}`;
    }

    const to2Dec = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
    const totals = deal.totals || {};
    const servicesData = deal.servicesData || [];
    const subtotalNum = to2Dec(Number(totals.subtotal) || servicesData.reduce((sum: number, s: any) => sum + (Number(s.baseAmount) || 0), 0));
    const totalGstNum = to2Dec(Number(totals.totalGst) || (subtotalNum * 0.18));
    const grandTotalNum = to2Dec(Number(totals.grandTotal) || (subtotalNum + totalGstNum));
    const amountReceivedNum = to2Dec(Number(totals.amountReceived) || Number(deal.received ? String(deal.received).replace(/[^0-9.]/g, '') : 0) || 0);
    const pendingAmountNum = to2Dec(Math.max(0, grandTotalNum - amountReceivedNum));

    const todayDate = new Date().toISOString().split('T')[0];
    const closingDate = formatDateForZoho(deal.date || deal.closingDate) || todayDate;
    const bookingDate = formatDateForZoho(deal.date || deal.bookingDate) || todayDate;

    // Build payload matching standard Zoho CRM Deals and custom layout API names
    const payload: Record<string, any> = {
      Deal_Name: dealName,
      Name1: dealName,
      Amount: grandTotalNum,
      Deal_Amount: grandTotalNum,
      Total_deal_amount_inclusive_of_gst: grandTotalNum,
      Amount_Without_GST: subtotalNum,
      Deal_Amount_Without_GST: subtotalNum,
      GST_Amount: totalGstNum,
      Deal_GST_Amount: totalGstNum,
      Deal_Received_Amount: amountReceivedNum,
      Total_Received_Amount: amountReceivedNum,
      Received_amount: amountReceivedNum,
      Amount_After_disbursement: amountReceivedNum,
      Deal_Pending_Amount: pendingAmountNum,
      Total_Pending_Amount: pendingAmountNum,
      Pending_amount: pendingAmountNum,
      amount_if_you_have_kindly_put_0: 0,
      Closing_Date: closingDate,
      Booking_Date: bookingDate,
      Sales_date: bookingDate,
      Account_date: bookingDate,
      CRM_date: bookingDate,
      CRM_filled: true,
      CRM_filled_date: bookingDate,
      Payment_received_date: bookingDate,
      Payment_Type: 'Online',
    };

    if (deal.zohoId) {
      payload.id = String(deal.zohoId);
      // Payment_verifications is ONLY updated when explicitly verified by Accounts
      if (deal.Payment_verifications === true || deal.paymentVerified === true) {
        payload.Payment_verifications = true;
      }
    }

    // Company & Account Details (Standard: Account_Name, Custom: Company_name, Company_Name, Lookup: Company, Companies)
    const compZohoId = deal.companyZohoId || fd.companyZohoId || (typeof deal.Company === 'object' ? deal.Company?.id : null) || (typeof deal.Companies === 'object' ? deal.Companies?.id : null);
    if (compZohoId && /^\d{15,}$/.test(String(compZohoId).trim())) {
      payload.Company = { id: String(compZohoId).trim() };
      payload.Companies = { id: String(compZohoId).trim() };
    }
    if (companyName) {
      payload.Account_Name = companyName;
      payload.Company_Name = companyName;
      payload.Company_name = companyName;
    }

    // Client & Contact Details (Standard: Contact_Name, Custom: Client_Name, Client_contact_detail, Mobile, Email, Lookup: Clients, Client)
    const clZohoId = deal.clientZohoId || fd.clientZohoId || (typeof deal.Clients === 'object' ? deal.Clients?.id : null) || (typeof deal.Client === 'object' ? deal.Client?.id : null);
    if (clZohoId && /^\d{15,}$/.test(String(clZohoId).trim())) {
      payload.Clients = { id: String(clZohoId).trim() };
      payload.Client = { id: String(clZohoId).trim() };
    }
    if (clientName) {
      payload.Contact_Name = clientName;
      payload.Client_Name = clientName;
    }
    const mobile = String(fd.mobile || deal.mobile || '').replace(/[^0-9]/g, '');
    if (mobile) {
      payload.Mobile = mobile;
      payload.Phone = mobile;
      payload.Client_contact_detail = mobile;
    }
    const email = fd.email || deal.email;
    if (email) {
      payload.Email = email;
      payload.Client_Email_address = email;
    }

    // Legal Identifiers (Gst_number, Pan_number)
    const gst = fd.gstNumber || deal.gstNumber;
    if (gst) {
      payload.Gst_number = String(gst).toUpperCase();
    }
    const pan = fd.companyPan || fd.panCard || deal.panNumber;
    if (pan) {
      payload.Pan_number = String(pan).toUpperCase();
    }

    // Address Details (Billing_address, Company_address, State)
    const fullAddress = [fd.city, fd.state].filter(Boolean).join(', ');
    if (fullAddress) {
      payload.Billing_address = fullAddress;
      payload.Company_address = fullAddress;
    }
    if (fd.state) {
      payload.State = fd.state;
    }

    // Services Overview & Subform_1 (API Name: Subform_1)
    if (Array.isArray(servicesData) && servicesData.length > 0) {
      const seenSvc = new Set<string>();
      const deduplicatedServices = servicesData.filter((s: any) => {
        const nameKey = (s.name || s.Schemas || s.Service_Name || '').trim().toLowerCase();
        if (!nameKey) return true;
        if (seenSvc.has(nameKey)) return false;
        seenSvc.add(nameKey);
        return true;
      });

      payload.Service_Count = deduplicatedServices.length;
      payload.Service_Name = deduplicatedServices.length === 1 ? (deduplicatedServices[0].name || deduplicatedServices[0].Schemas) : `${deduplicatedServices.length} Services`;
      payload.Subform_1 = deduplicatedServices.map((svc: any, idx: number) => {
        const itemTotalFromSvc = Number(svc.totalAmount) || 0;
        const itemBase = itemTotalFromSvc > 0 
          ? to2Dec(itemTotalFromSvc / 1.18) 
          : to2Dec(Number(svc.baseAmount) || 0);
        const itemGst = itemTotalFromSvc > 0 
          ? to2Dec(itemTotalFromSvc - itemBase) 
          : to2Dec(itemBase * 0.18);
        const itemTotal = itemTotalFromSvc > 0 ? to2Dec(itemTotalFromSvc) : to2Dec(itemBase + itemGst);

        let itemReceived = 0;
        if (grandTotalNum > 0) {
          itemReceived = to2Dec((itemTotal / grandTotalNum) * amountReceivedNum);
        } else if (deduplicatedServices.length === 1) {
          itemReceived = amountReceivedNum;
        }
        const itemPending = to2Dec(Math.max(0, itemTotal - itemReceived));

        return {
          ...(svc.id && /^\d{15,}$/.test(String(svc.id)) ? { id: String(svc.id) } : {}),
          Schemas: svc.name || svc.Schemas || 'Website Development',
          Without_GST: itemBase,
          GST_amount: itemGst,
          Agreement_amount: itemTotal,
          Received_amount: itemReceived,
          Pending_amount: itemPending,
          Payment_stages: svc.Payment_stages || '.',
          Payment_type: amountReceivedNum >= grandTotalNum ? 'Full amount paid' : amountReceivedNum > 0 ? 'Partially paid' : 'Online',
          Payment_received_date: bookingDate,
          LinkingModule2_Serial_Number: String(idx + 1),
        };
      });
    } else if (deal.service || fd.service) {
      const svcName = deal.service || fd.service || 'Website Development';
      payload.Service_Name = svcName;
      payload.Service_Count = 1;
      payload.Subform_1 = [
        {
          Schemas: svcName,
          Without_GST: subtotalNum,
          GST_amount: totalGstNum,
          Agreement_amount: grandTotalNum,
          Received_amount: amountReceivedNum,
          Pending_amount: pendingAmountNum,
          Payment_stages: '.',
          Payment_type: amountReceivedNum >= grandTotalNum ? 'Full amount paid' : amountReceivedNum > 0 ? 'Partially paid' : 'Online',
          Payment_received_date: bookingDate,
          LinkingModule2_Serial_Number: '1',
        }
      ];
    }

    // Legal Subform (API Name: Legal)
    const rawLegalData = deal.legalData || deal.rawZohoDeal?.Legal || deal.Legal || fd.legalData || fd.Legal;
    if (Array.isArray(rawLegalData) && rawLegalData.length > 0) {
      const seenLegal = new Set<string>();
      const deduplicatedLegal = rawLegalData.filter((lg: any) => {
        const schemaKey = (lg.Legal_Schemas || lg.schema || lg.Schemas || '').trim().toLowerCase();
        if (!schemaKey) return true;
        if (seenLegal.has(schemaKey)) return false;
        seenLegal.add(schemaKey);
        return true;
      });

      payload.Legal = deduplicatedLegal.map((lg: any, idx: number) => ({
        ...(lg.id && /^\d{15,}$/.test(String(lg.id)) ? { id: String(lg.id) } : {}),
        Legal_Schemas: lg.Legal_Schemas || lg.schema || lg.Schemas || (payload.Subform_1?.[idx]?.Schemas) || 'General Services',
        Internal_team_type: lg.Internal_team_type || lg.internalTeamType || '',
        Internal_legal_status: lg.Internal_legal_status || lg.legalStatus || '',
        Remark: lg.Remark || lg.remark || '',
        Types_of_legal_documents: lg.Types_of_legal_documents || lg.docTypes || '',
        Agreement_Terms_I: lg.terms1 || lg.Agreement_Terms_I || lg.agreementTerms || '',
        Agreement_Terms_II: lg.terms2 || lg.Agreement_Terms_II || '',
        Tenure_of_Service: lg.tenure || lg.Tenure_of_Service || '',
      }));
    }

    // Pipeline & Stage mapping (Default stage: Sales)
    let stage = deal.stage || deal.Stage;
    if (!stage) {
      const st = String(deal.status || '').toLowerCase();
      if (st.includes('won') || st.includes('closed won') || st.includes('execut')) {
        stage = 'Operations executors';
      } else if (st.includes('account')) {
        stage = 'Accounts';
      } else if (st.includes('legal')) {
        stage = 'Legal';
      } else if (st.includes('allocat')) {
        stage = 'Operations allocator';
      } else if (st.includes('qualit')) {
        stage = 'Quality';
      } else {
        stage = 'Sales';
      }
    }
    payload.Stage = stage;
    payload.Pipeline = deal.pipeline || deal.Pipeline || 'Standard pipeline';
    payload.Choose_Wisely = deal.chooseWisely || fd.chooseWisely || 'New Case Booking';
    payload.Branches = deal.branch || fd.branch || 'Ahmedabad';
    payload.Bank_details = deal.bankDetails || fd.bankDetails || 'BSAPL';
    payload.Date = bookingDate;
    payload.Date_checked_date = bookingDate;

    // Link Quotation if deal converted from quotation
    if (deal.quotationZohoId || deal.zohoQuotationId) {
      payload.Quotation = { id: String(deal.quotationZohoId || deal.zohoQuotationId) };
    }

    // Partner BDM Split (50/50 pre-GST share of Received Amount)
    const hasPartnerBdm = Boolean(deal.hasPartnerBdm || deal.has_partner_bdm || fd.hasPartnerBdm || fd.has_partner_bdm);
    const partnerBdmId = hasPartnerBdm ? (deal.partnerBdmId || deal.partner_bdm_id || fd.partnerBdmId || fd.partner_bdm_id || '') : '';
    const partnerBdmName = hasPartnerBdm ? (deal.partnerBdmName || deal.partner_bdm_name || fd.partnerBdmName || fd.partner_bdm_name || '') : '';

    // Server-side validation and calculation: Partner BDM Amount = (Received Amount / 1.18) / 2
    let partnerBdmAmount = 0;
    if (hasPartnerBdm && amountReceivedNum > 0) {
      const preGstReceived = amountReceivedNum / 1.18;
      partnerBdmAmount = to2Dec(preGstReceived / 2);
    }

    payload.Has_Partner_BDM = hasPartnerBdm;
    payload.has_partner_bdm = hasPartnerBdm;
    if (hasPartnerBdm && partnerBdmId && /^\d{15,}$/.test(String(partnerBdmId).trim())) {
      payload.Partner_BDM = { id: String(partnerBdmId).trim() };
    } else {
      delete payload.Partner_BDM;
    }
    if (partnerBdmName) {
      payload.Partner_BDM_Name = partnerBdmName;
      payload.partner_bdm_name = partnerBdmName;
      payload.Partner_BDM_Names = partnerBdmName;
    }
    if (hasPartnerBdm) {
      payload.Partner_BDM_Amount = partnerBdmAmount;
      payload.partner_bdm_amount = partnerBdmAmount;
    }
    if (partnerBdmId) {
      payload.Partner_BDM_ID = String(partnerBdmId);
      payload.partner_bdm_id = String(partnerBdmId);
    }

    // Associate Employee Lookup field with the logged-in employee record
    const empLookupId = deal.employeeZohoId || fd.employeeZohoId || deal.empZohoId || fd.empZohoId || (typeof deal.Employee === 'object' ? deal.Employee?.id : (typeof deal.Employee === 'string' && /^\d+$/.test(deal.Employee) ? deal.Employee : null));
    if (empLookupId && String(empLookupId).trim() !== '') {
      payload.Employee = { id: String(empLookupId).trim() };
    }
    const empCode = deal.empId || fd.empId || deal.employeeId || fd.employeeId;
    // Legal Handover Details & Follow-up Reminders
    const legalSenderName = deal.legalDocsSenderName || deal.Legal_documents_sender_name || fd.legalDocsSenderName || fd.Legal_documents_sender_name || '';
    if (legalSenderName) {
      payload.Legal_documents_sender_name = legalSenderName;
      payload.Employee_name_sent = legalSenderName;
      payload.Employee_name_sent1 = legalSenderName;
    }
    const legalSenderDate = deal.legalDocsSenderDate || deal.Legal_documents_sender_date || deal.Legal_date || fd.legalDocsSenderDate || fd.Legal_documents_sender_date || '';
    if (legalSenderDate) {
      payload.Legal_documents_sender_date = legalSenderDate;
      payload.Legal_date = legalSenderDate;
    }
    const legalReceiverName = deal.legalDocsReceiverName || deal.Legal_documents_receiver_name || fd.legalDocsReceiverName || fd.Legal_documents_receiver_name || '';
    if (legalReceiverName) {
      payload.Legal_documents_receiver_name = legalReceiverName;
      payload.Employee_name_received = legalReceiverName;
      payload.Employee_name_received1 = legalReceiverName;
    }
    const legalReceivedDate = deal.legalDocsReceivedDate || deal.Legal_documents_received_date || fd.legalDocsReceivedDate || fd.Legal_documents_received_date || '';
    if (legalReceivedDate) {
      payload.Legal_documents_received_date = legalReceivedDate;
    }
    const rem1 = deal.reminder1Date || deal.Reminder_1_date || fd.reminder1Date || fd.Reminder_1_date || '';
    if (rem1) {
      payload.Reminder_1_date = rem1;
      payload.Reminder_1 = rem1;
    }
    const rem2 = deal.reminder2Date || deal.Reminder_2_date || fd.reminder2Date || fd.Reminder_2_date || '';
    if (rem2) {
      payload.Reminder_2_date = rem2;
      payload.Reminder_2 = rem2;
    }
    const rem3 = deal.reminder3Date || deal.Reminder_3_date || fd.reminder3Date || fd.Reminder_3_date || '';
    if (rem3) {
      payload.Reminder_3_date = rem3;
      payload.Reminder_3 = rem3;
    }
    const rem4 = deal.reminder4Date || deal.Reminder_4_date || fd.reminder4Date || fd.Reminder_4_date || '';
    if (rem4) {
      payload.Reminder_4_date = rem4;
      payload.Reminder_4 = rem4;
    }
    const rem5 = deal.reminder5Date || deal.Reminder_5_date || fd.reminder5Date || fd.Reminder_5_date || '';
    if (rem5) {
      payload.Reminder_5_date = rem5;
      payload.Reminder_5 = rem5;
    }

    return payload;
  }

  function buildEmployeeZohoPayload(employee: any): Record<string, any> {
    const fd = employee.formData || {};
    const fullName = `${fd.firstName || ''} ${fd.middleName || ''} ${fd.lastName || ''}`.trim() || employee.name || 'New Employee';
    const empId = fd.empId || employee.id || '';

    // Standard primary Name field in Zoho CRM (labelled "First Name" in layout)
    const payload: Record<string, any> = {
      Name: fd.firstName || fullName,
    };

    if (employee.zohoId) {
      payload.id = String(employee.zohoId);
    }

    // Name Fields (Single Line)
    if (fd.middleName) payload.Middle_Name = fd.middleName;
    if (fd.lastName) payload.Last_Name = fd.lastName;

    // Employment ID (API Name: Employment_ID, Single Line)
    if (empId) {
      payload.Employment_ID = empId;
    }

    // Contact & Email Fields
    // Contact Number (API Name: Contact_Number, Single Line)
    const mobile = (fd.mobile || employee.mobile || '').replace(/[^0-9]/g, '');
    if (mobile) payload.Contact_Number = mobile;

    // Personal Email Address (API Name: Personal_Email_Address, Email)
    if (fd.email || employee.email) payload.Personal_Email_Address = fd.email || employee.email;

    // Work Email (API Name: Email, Email)
    if (fd.workEmail || employee.workEmail) payload.Email = fd.workEmail || employee.workEmail;

    // Personal Details
    if (fd.gender) payload.Gender = fd.gender;
    if (fd.maritalStatus) payload.Marital_Status = fd.maritalStatus;
    if (fd.nationality) payload.Nationality = fd.nationality;
    if (fd.bloodGroup) payload.Blood_Group = fd.bloodGroup;

    // Dates (Data Type: Date -> format YYYY-MM-DD)
    const formattedDob = formatDateForZoho(fd.dob);
    if (formattedDob) payload.Date_of_Birth = formattedDob;

    const formattedDoj = formatDateForZoho(fd.doj || employee.joined);
    if (formattedDoj) payload.Date_of_Joining = formattedDoj;

    // Department & Role Details
    const dept = fd.dept || employee.dept;
    if (dept) payload.Department = dept;

    // Designation / Job Title (API Name: Designation_Job_Title, Single Line)
    const role = fd.role || employee.role;
    if (role) payload.Designation_Job_Title = role;

    // System Role (API Name: System_Role, Pick List)
    const systemRole = fd.systemRole || employee.systemRole;
    if (systemRole) payload.System_Role = systemRole;

    // Employment Type (API Name: Employment_Type, Pick List)
    if (fd.employmentType) payload.Employment_Type = fd.employmentType;

    // Addresses (Multi Line)
    if (fd.permanentAddress) payload.Permanent_Address = fd.permanentAddress;
    if (fd.currentAddress) payload.Current_Address = fd.currentAddress;

    // Education & Professional Details
    // Education Qualification (API Name: Education_Qualification, Single Line)
    if (fd.education) payload.Education_Qualification = fd.education;

    // Professional Certifications (API Name: Professional_Certifications, Single Line)
    if (fd.certifications) payload.Professional_Certifications = fd.certifications;

    // Key Skills (API Name: Key_Skills, Single Line)
    if (fd.skills) payload.Key_Skills = fd.skills;

    // Languages Known (API Name: Languages_Known, Multiselect)
    if (fd.languages) {
      if (Array.isArray(fd.languages)) {
        payload.Languages_Known = fd.languages;
      } else if (typeof fd.languages === 'string') {
        payload.Languages_Known = fd.languages.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    // Previous Employer (API Name: Previous_Employer, Single Line)
    if (fd.previousEmployer) payload.Previous_Employer = fd.previousEmployer;

    // Total Experience (API Name: Total_Experience, Single Line)
    if (fd.experience) payload.Total_Experience = fd.experience;

    // Emergency Contact Details
    if (fd.emergencyFirstName) payload.Emergency_Contact_First_Name = fd.emergencyFirstName;
    if (fd.emergencyLastName) payload.Emergency_Contact_Last_Name = fd.emergencyLastName;
    if (fd.emergencyMobile) payload.Emergency_Contact_Number = String(fd.emergencyMobile).replace(/[^0-9]/g, '');
    // Relationship with Contact (API Name: Relationship_with_Contact, Single Line)
    if (fd.emergencyRelation) payload.Relationship_with_Contact = fd.emergencyRelation;

    // Reporting Hierarchy Details
    // Who is the Team Leader (TL)? (API Name: Who_is_the_Team_Leader_TL, Pick List)
    const tlName = fd.teamLeaderName || employee.teamLeaderName;
    if (tlName) payload.Who_is_the_Team_Leader_TL = tlName;

    // Reporting Manager (API Name: Reporting_Manager, Single Line)
    let rmName = fd.reportingManagerName || employee.reportingManagerName;
    if (!rmName && (fd.systemRole === 'HOD' || employee.systemRole === 'HOD' || fd.systemRole === 'HR' || employee.systemRole === 'HR')) {
      rmName = 'Managing Director (Super Admin)';
    }
    if (rmName) payload.Reporting_Manager = rmName;

    // Identity / Legal
    // Pan Number (API Name: Pan_Number, Single Line)
    if (fd.panNumber) payload.Pan_Number = String(fd.panNumber).toUpperCase();

    // Aadhaar Number (API Name: Aadhaar_Number, Single Line)
    if (fd.aadhaarNumber) payload.Aadhaar_Number = String(fd.aadhaarNumber).replace(/[^0-9]/g, '');

    // Passport Number (API Name: Passport_Number, Single Line)
    if (fd.passportNumber) payload.Passport_Number = String(fd.passportNumber).toUpperCase();

    // Driving License Number (API Name: Driving_License_Number, Single Line)
    if (fd.drivingLicense) payload.Driving_License_Number = String(fd.drivingLicense).toUpperCase();

    // Banking & Statutory
    // Bank Account Number (API Name: Bank_Account_Number, Single Line)
    if (fd.bankAccount) payload.Bank_Account_Number = String(fd.bankAccount);

    // Bank Name (API Name: Bank_Name, Single Line)
    if (fd.bankName) payload.Bank_Name = fd.bankName;

    // IFSC Code (API Name: IFSC_Code, Single Line)
    if (fd.ifsc) payload.IFSC_Code = String(fd.ifsc).toUpperCase();

    // PF Applicable (API Name: PF_Applicable, Boolean)
    payload.PF_Applicable = Boolean(fd.hasPf);

    // PF Number (API Name: PF_Number, Single Line)
    if (fd.pfNumber) payload.PF_Number = String(fd.pfNumber);

    // ESIC Number (API Name: ESIC_Number, Single Line)
    if (fd.esicNumber) payload.ESIC_Number = String(fd.esicNumber);

    // UAN Number (API Name: UAN_Number, Single Line)
    if (fd.uanNumber) payload.UAN_Number = String(fd.uanNumber);

    // Medical Insurance Number (API Name: Medical_Insurance_Number, Single Line)
    if (fd.medicalInsurance) payload.Medical_Insurance_Number = String(fd.medicalInsurance);

    // Salary Entity / Company Entity (BSPL / BSAPL)
    const salEntity = fd.salaryEntity || employee.salaryEntity;
    if (salEntity) {
      payload.Salary_Entity = String(salEntity);
      payload.Company_Entity = String(salEntity);
    }

    // Password (API Name: Password, Single Line)
    const empPassword = employee.password || fd.password || employee.newPassword;
    if (empPassword) {
      payload.Password = String(empPassword);
    }

    return payload;
  }

  function buildLeaveZohoPayload(leave: any): Record<string, any> {
    // Reason maps to the primary 'Name' field in Zoho CRM custom module Leave_Management
    const reasonText = leave.reason || leave.Name || `${leave.type || 'Leave'} - ${leave.empName || 'Employee'}`;

    const payload: Record<string, any> = {
      Name: reasonText,
    };

    if (leave.zohoId) {
      payload.id = String(leave.zohoId);
    }

    // Leave Type (API Name: Leave_Type, Pick List)
    if (leave.type || leave.Leave_Type) {
      payload.Leave_Type = leave.type || leave.Leave_Type;
    }

    // Start Date & End Date (API Names: Start_Date, End_Date, Date)
    const startDate = formatDateForZoho(leave.startDate || leave.Start_Date);
    if (startDate) payload.Start_Date = startDate;

    const endDate = formatDateForZoho(leave.endDate || leave.End_Date);
    if (endDate) payload.End_Date = endDate;

    // Status mapping to Approval fields
    // Approved by TL (API Name: Approved_by_TL, Pick List)
    // Approved by HR (API Name: Approved_by_HR, Pick List)
    // Approved by MD (API Name: Approved_by_MD, Pick List)
    const status = leave.status || 'Pending TL';
    if (status === 'Approved') {
      payload.Approved_by_TL = 'Approved';
      payload.Approved_by_HR = 'Approved';
    } else if (status === 'Pending HR') {
      payload.Approved_by_TL = 'Approved';
      payload.Approved_by_HR = 'Pending';
    } else if (status === 'Rejected by TL') {
      payload.Approved_by_TL = 'Rejected';
      payload.Approved_by_HR = 'Pending';
    } else if (status === 'Rejected by HR') {
      payload.Approved_by_TL = 'Approved';
      payload.Approved_by_HR = 'Rejected';
    } else {
      // Pending TL
      payload.Approved_by_TL = 'Pending';
      payload.Approved_by_HR = 'Pending';
    }

    // Email & Secondary Email (API Names: Email, Secondary_Email)
    if (leave.email || leave.workEmail) {
      payload.Email = leave.email || leave.workEmail;
    }
    if (leave.secondaryEmail || leave.personalEmail) {
      payload.Secondary_Email = leave.secondaryEmail || leave.personalEmail;
    }

    // Employee Lookup (API Name: Employee, Lookup)
    if (leave.employeeZohoId || leave.empZohoId) {
      payload.Employee = { id: String(leave.employeeZohoId || leave.empZohoId) };
    }

    return payload;
  }

  function buildCompanyZohoPayload(company: any): Record<string, any> {
    const fd = company.formData || company;
    const companyName = company.name || fd.name || company.companyName || fd.companyName || 'New Company';

    const payload: Record<string, any> = {
      Name: companyName,
    };

    if (company.zohoId || fd.zohoId) {
      payload.id = String(company.zohoId || fd.zohoId);
    }

    // Business Type (API Name: Business_Type, Pick List)
    const bType = company.type || fd.type || company.businessType || fd.businessType || company.Business_Type;
    if (bType) payload.Business_Type = bType;

    // Date of Incorporation (API Name: Date_of_Incorporation, Date)
    const doi = formatDateForZoho(company.doi || fd.doi || company.dateOfIncorporation || fd.dateOfIncorporation || company.Date_of_Incorporation);
    if (doi) payload.Date_of_Incorporation = doi;

    // GST Number (API Name: GST_Number, Single Line)
    const gst = company.gstNumber || fd.gstNumber || company.gst || fd.gst || company.GST_Number;
    if (gst) payload.GST_Number = String(gst).toUpperCase();

    // Email (API Name: Email, Email)
    const email = company.email || fd.email || company.Email;
    if (email) payload.Email = email;

    // Secondary Email (API Name: Secondary_Email, Email)
    const secEmail = company.secondaryEmail || fd.secondaryEmail || company.Secondary_Email;
    if (secEmail) payload.Secondary_Email = secEmail;

    // Status (API Name: Status, Pick List)
    const status = company.status || fd.status || company.Status || 'Active';
    if (status) payload.Status = status;

    // Tag (API Name: Tag, Single Line)
    const tag = company.tag || fd.tag || company.Tag;
    if (tag) payload.Tag = tag;

    return payload;
  }

  function buildClientZohoPayload(client: any): Record<string, any> {
    const fd = client.formData || client;
    const clientName = client.name || fd.name || client.clientName || fd.clientName || 'New Client';

    const payload: Record<string, any> = {
      Name: clientName,
    };

    if (client.zohoId || fd.zohoId) {
      payload.id = String(client.zohoId || fd.zohoId);
    }

    // Company Name (API Name: Company_Name, Single Line)
    const compName = client.company || fd.company || client.companyName || fd.companyName || client.Company_Name;
    if (compName) payload.Company_Name = compName;

    // Email Address (API Name: Email, Email)
    const email = client.email || fd.email || client.emailAddress || fd.emailAddress || client.Email;
    if (email) payload.Email = email;

    // Mobile Number (API Name: Mobile_Number, Single Line)
    const rawMobile = client.phone || fd.phone || client.mobile || fd.mobile || client.mobileNumber || fd.mobileNumber || client.Mobile_Number;
    if (rawMobile) payload.Mobile_Number = String(rawMobile).replace(/[^0-9]/g, '');

    // Secondary Email (API Name: Secondary_Email, Email)
    const secEmail = client.secondaryEmail || fd.secondaryEmail || client.Secondary_Email;
    if (secEmail) payload.Secondary_Email = secEmail;

    // Status (API Name: Status, Pick List)
    const status = client.status || fd.status || client.Status || 'Active';
    if (status) payload.Status = status;

    // Tag (API Name: Tag, Single Line)
    const tag = client.tag || fd.tag || client.Tag;
    if (tag) payload.Tag = tag;

    return payload;
  }

  function buildCompanyPolicyZohoPayload(policy: any): Record<string, any> {
    const fd = policy.formData || policy;
    const policyTitle = policy.title || fd.title || policy.name || fd.name || policy.Name || 'Company Policy';

    const payload: Record<string, any> = {
      Name: String(policyTitle).trim(),
    };

    if (policy.zohoId || fd.zohoId) {
      payload.id = String(policy.zohoId || fd.zohoId);
    }

    // Policy Content (API Name: Policy_Content, Multi Line (Small))
    const content = policy.content || fd.content || policy.policyContent || fd.policyContent || policy.Policy_Content;
    if (content !== undefined && content !== null && String(content).trim() !== '') {
      payload.Policy_Content = String(content).trim();
    }

    // Department (API Name: Department, Pick List)
    const dept = policy.department || fd.department || policy.Department;
    if (dept && String(dept).trim() !== '') {
      payload.Department = String(dept).trim();
    }

    // Email (API Name: Email, Email)
    const email = policy.email || fd.email || policy.Email;
    if (email && String(email).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      payload.Email = String(email).trim();
    }

    // Secondary Email (API Name: Secondary_Email, Email)
    const secEmail = policy.secondaryEmail || fd.secondaryEmail || policy.Secondary_Email;
    if (secEmail && String(secEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(secEmail).trim())) {
      payload.Secondary_Email = String(secEmail).trim();
    }

    // Tag (API Name: Tag, Single Line)
    const tag = policy.tag || fd.tag || policy.Tag;
    if (tag && String(tag).trim() !== '') {
      payload.Tag = String(tag).trim();
    }

    // Email Opt Out (API Name: Email_Opt_Out, Boolean)
    if (policy.emailOptOut !== undefined && policy.emailOptOut !== null) {
      payload.Email_Opt_Out = Boolean(policy.emailOptOut);
    } else if (fd.emailOptOut !== undefined && fd.emailOptOut !== null) {
      payload.Email_Opt_Out = Boolean(fd.emailOptOut);
    }

    return payload;
  }

  function buildCompanyCalendarZohoPayload(event: any): Record<string, any> {
    const fd = event.formData || event;
    const eventTitle = event.title || fd.title || event.name || fd.name || event.Name || 'Company Calendar Event';

    const payload: Record<string, any> = {
      Name: String(eventTitle).trim(),
    };

    if (event.zohoId || fd.zohoId) {
      payload.id = String(event.zohoId || fd.zohoId);
    }

    // Date (API Name: Date, Date format YYYY-MM-DD)
    const formattedDate = formatDateForZoho(event.date || fd.date || event.Date || fd.Date);
    if (formattedDate) {
      payload.Date = formattedDate;
    }

    // Category / Type (API Name: Category_Type, Pick List)
    const catType = event.type || fd.type || event.category || fd.category || event.Category_Type;
    if (catType && String(catType).trim() !== '') {
      payload.Category_Type = String(catType).trim();
    }

    // Description (API Name: Description, Multi Line (Small))
    const desc = event.description || fd.description || event.Description;
    if (desc !== undefined && desc !== null && String(desc).trim() !== '') {
      payload.Description = String(desc).trim();
    }

    // Email (API Name: Email, Email)
    const email = event.email || fd.email || event.Email;
    if (email && String(email).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      payload.Email = String(email).trim();
    }

    // Secondary Email (API Name: Secondary_Email, Email)
    const secEmail = event.secondaryEmail || fd.secondaryEmail || event.Secondary_Email;
    if (secEmail && String(secEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(secEmail).trim())) {
      payload.Secondary_Email = String(secEmail).trim();
    }

    // Tag (API Name: Tag, Single Line)
    const tag = event.tag || fd.tag || event.Tag || catType || 'Calendar';
    if (tag && String(tag).trim() !== '') {
      payload.Tag = String(tag).trim();
    }

    // Email Opt Out (API Name: Email_Opt_Out, Boolean)
    if (event.emailOptOut !== undefined && event.emailOptOut !== null) {
      payload.Email_Opt_Out = Boolean(event.emailOptOut);
    } else if (fd.emailOptOut !== undefined && fd.emailOptOut !== null) {
      payload.Email_Opt_Out = Boolean(fd.emailOptOut);
    }

    return payload;
  }

  function buildDsrZohoPayload(dsr: any): Record<string, any> {
    const fd = dsr.formData || dsr;
    const empName = dsr.empName || fd.empName || dsr.name || fd.name || 'Employee';
    const dateVal = dsr.reportDate || fd.reportDate || dsr.date || fd.date || dsr.Date;
    const formattedDate = formatDateForZoho(dateVal) || new Date().toISOString().split('T')[0];

    const dsrTitle = dsr.Name || dsr.name || dsr.title || fd.title || `${empName} - DSR (${formattedDate})`;

    const payload: Record<string, any> = {
      Name: String(dsrTitle).trim(),
    };

    if (dsr.zohoId || fd.zohoId) {
      payload.id = String(dsr.zohoId || fd.zohoId);
    }

    // Date (API Name: Date, Date format YYYY-MM-DD)
    if (formattedDate) {
      payload.Date = formattedDate;
    }

    // Description (API Name: Description, Multi Line (Small))
    const desc = dsr.description || fd.description || dsr.Description || dsr.content;
    if (desc !== undefined && desc !== null && String(desc).trim() !== '') {
      payload.Description = String(desc).trim();
    }

    // Email (API Name: Email, Email)
    const email = dsr.empEmail || fd.empEmail || dsr.email || fd.email || dsr.Email;
    if (email && String(email).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      payload.Email = String(email).trim();
    }

    // Secondary Email (API Name: Secondary_Email, Email)
    const secEmail = dsr.tlEmail || fd.tlEmail || dsr.secondaryEmail || fd.secondaryEmail || dsr.Secondary_Email;
    if (secEmail && String(secEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(secEmail).trim())) {
      payload.Secondary_Email = String(secEmail).trim();
    }

    // Tag (API Name: Tag, Single Line)
    const tag = dsr.status || fd.status || dsr.tag || fd.tag || dsr.Tag || 'Submitted';
    if (tag && String(tag).trim() !== '') {
      payload.Tag = String(tag).trim();
    }

    // Employee Lookup (API Name: Employee, Lookup)
    const empLookupId = dsr.employeeZohoId || fd.employeeZohoId || dsr.empZohoId || fd.empZohoId || (typeof dsr.Employee === 'object' ? dsr.Employee?.id : null);
    if (empLookupId && String(empLookupId).trim() !== '') {
      payload.Employee = { id: String(empLookupId).trim() };
    }

    // Email Opt Out (API Name: Email_Opt_Out, Boolean)
    if (dsr.emailOptOut !== undefined && dsr.emailOptOut !== null) {
      payload.Email_Opt_Out = Boolean(dsr.emailOptOut);
    } else if (fd.emailOptOut !== undefined && fd.emailOptOut !== null) {
      payload.Email_Opt_Out = Boolean(fd.emailOptOut);
    }

    // Connected To (API Name: Connected_To__s, MultiModuleLookup)
    if (dsr.connectedTo && Array.isArray(dsr.connectedTo) && dsr.connectedTo.length > 0) {
      payload.Connected_To__s = dsr.connectedTo;
    }

    return payload;
  }

  return {
    name: 'zoho-crm-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url || '', 'http://localhost');
        const pathname = urlObj.pathname;
        if (!pathname.startsWith('/api/zoho/') && pathname !== '/api/send-otp' && pathname !== '/api/deals' && !pathname.startsWith('/api/deals')) {
          return next();
        }

        const env = loadEnv('development', process.cwd(), '');

        // Reference Deals API Handler
        if (pathname === '/api/deals' || pathname.startsWith('/api/deals')) {
          (res as any).status = (code: number) => {
            res.statusCode = code;
            return res;
          };
          (res as any).json = (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(data));
          };
          const queryObj = Object.fromEntries(urlObj.searchParams.entries());
          (req as any).query = queryObj;
          return await dealsHandler(req, res);
        }

        // Test connection endpoint
        if (pathname === '/api/zoho/test-connection') {
          try {
            await getAccessToken(env);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, message: 'Zoho CRM Connected (.in domain)' }));
          } catch (e: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: e.message }));
          }
        }

        // Insert or Update quotation endpoint
        if ((pathname === '/api/zoho/insert-quotation' || pathname === '/api/zoho/update-quotation') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const quotation = JSON.parse(body);
              const payload = buildQuotationZohoPayload(quotation);
              const isUpdate = Boolean(quotation.zohoId || pathname === '/api/zoho/update-quotation');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_MODULE_NAME || 'Quotations';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              // Dynamically resolve Employee lookup to valid Zoho numeric record ID
              if (!payload.Employee?.id || !/^\d{15,}$/.test(String(payload.Employee.id))) {
                const empLookupInfo = {
                  id: quotation.employeeZohoId || quotation.formData?.employeeZohoId || quotation.empZohoId || (typeof quotation.Employee === 'object' ? quotation.Employee?.id : quotation.Employee),
                  name: quotation.employeeName || quotation.formData?.employeeName || quotation.salesEmployee || quotation.owner || (typeof quotation.Employee === 'object' ? quotation.Employee?.name : null),
                  email: quotation.employeeEmail || quotation.formData?.employeeEmail || quotation.userEmail,
                  empId: quotation.empId || quotation.formData?.empId || quotation.employeeId,
                };
                const resolvedEmpId = await resolveZohoEmployeeId(empLookupInfo, accessToken, apiBase);
                if (resolvedEmpId) {
                  payload.Employee = { id: resolvedEmpId };
                } else {
                  delete payload.Employee;
                }
              }

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} in Zoho CRM:`, payload.Name, quotation.zohoId ? `(ID: ${quotation.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-quotation' : 'insert-quotation', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || quotation.zohoId;
                console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Quotation updated successfully in Zoho CRM' : 'Quotation inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save record in Zoho CRM';
                console.error('[Vite Zoho Plugin] Zoho CRM error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Quotations endpoint (Module API Name: Quotations)
        if (pathname === '/api/zoho/get-quotations' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_MODULE_NAME || 'Quotations';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const quotationFields = 'id,Name,Email,Mobile_Number,Gender,City,State,PAN_Card,Aadhaar_Card,Company_Name,Company_Type,Date_of_Incorporation,GST_Number,Company_PAN_Number,Sector,Industry,Subtotal,Total_GST,Grand_Total,Services_And_Pricing,Employee,Created_Time,Modified_Time,Owner,Created_By';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria 
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${quotationFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${quotationFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Quotations from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch quotations from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch quotations error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update Deal endpoint (Module API Name: Deals)
        if ((pathname === '/api/zoho/insert-deal' || pathname === '/api/zoho/update-deal') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const deal = JSON.parse(body);
              const payload = buildDealZohoPayload(deal);
              const isUpdate = Boolean(deal.zohoId || pathname === '/api/zoho/update-deal');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              // Dynamically resolve Company lookup to valid Zoho numeric record ID in custom Companies module
              const compLookupInfo = {
                id: deal.companyZohoId || deal.formData?.companyZohoId || (typeof deal.Company === 'object' ? deal.Company?.id : (typeof payload.Company === 'object' ? payload.Company?.id : deal.Company)),
                name: deal.company || deal.formData?.companyName || deal.companyName,
                gst: deal.gstNumber || deal.formData?.gstNumber,
                pan: deal.panNumber || deal.formData?.panNumber || deal.formData?.companyPan,
              };
              const resolvedCompId = await resolveZohoCompanyId(compLookupInfo, accessToken, apiBase);
              if (resolvedCompId) {
                payload.Company = { id: resolvedCompId };
                payload.Companies = { id: resolvedCompId };
              }

              // Dynamically resolve Client lookup to valid Zoho numeric record ID in custom Clients module
              const clientLookupInfo = {
                id: deal.clientZohoId || deal.formData?.clientZohoId || (typeof deal.Clients === 'object' ? deal.Clients?.id : (typeof payload.Clients === 'object' ? payload.Clients?.id : deal.Clients)),
                name: deal.client || deal.formData?.clientName || deal.clientName,
                phone: deal.mobile || deal.formData?.mobile || deal.phone,
                email: deal.email || deal.formData?.email,
              };
              const resolvedClientId = await resolveZohoClientId(clientLookupInfo, accessToken, apiBase);
              if (resolvedClientId) {
                payload.Clients = { id: resolvedClientId };
                payload.Client = { id: resolvedClientId };
              }

              // Dynamically resolve Employee lookup to valid Zoho numeric record ID in custom Employee module
              const empLookupInfo = {
                id: deal.employeeZohoId || deal.formData?.employeeZohoId || deal.empZohoId || deal.formData?.empZohoId || (typeof deal.Employee === 'object' ? deal.Employee?.id : (typeof payload.Employee === 'object' ? payload.Employee?.id : deal.Employee)),
                name: deal.employeeName || deal.formData?.employeeName || deal.empName || deal.salesEmployee || deal.owner || (typeof deal.Employee === 'object' ? deal.Employee?.name : null),
                email: deal.employeeEmail || deal.formData?.employeeEmail || deal.userEmail || deal.formData?.userEmail,
                empId: deal.empId || deal.formData?.empId || deal.employeeId || deal.formData?.employeeId,
              };
              const resolvedEmpId = await resolveZohoEmployeeId(empLookupInfo, accessToken, apiBase);
              if (resolvedEmpId) {
                payload.Employee = { id: resolvedEmpId };
              } else {
                delete payload.Employee;
              }

              // Dynamically resolve Partner_BDM lookup to valid Zoho numeric record ID in custom Employee module
              const hasPartnerBdm = Boolean(deal.hasPartnerBdm || deal.has_partner_bdm || deal.formData?.hasPartnerBdm || deal.formData?.has_partner_bdm);
              if (hasPartnerBdm) {
                const partnerLookupInfo = {
                  id: deal.partnerBdmId || deal.partner_bdm_id || deal.formData?.partnerBdmId || deal.formData?.partner_bdm_id || (typeof deal.Partner_BDM === 'object' ? deal.Partner_BDM?.id : (typeof payload.Partner_BDM === 'object' ? payload.Partner_BDM?.id : null)),
                  name: deal.partnerBdmName || deal.partner_bdm_name || deal.formData?.partnerBdmName || deal.formData?.partner_bdm_name || (typeof deal.Partner_BDM === 'object' ? deal.Partner_BDM?.name : null),
                  email: deal.partnerBdmEmail || deal.formData?.partnerBdmEmail,
                  empId: deal.partnerBdmId || deal.partner_bdm_id,
                };
                const resolvedPartnerId = await resolveZohoEmployeeId(partnerLookupInfo, accessToken, apiBase);
                if (resolvedPartnerId) {
                  payload.Partner_BDM = { id: resolvedPartnerId };
                } else {
                  delete payload.Partner_BDM;
                }
              } else {
                delete payload.Partner_BDM;
              }

              // Automatically trigger Blueprint Transition if target Stage has a registered Transition ID
              const requestedStage = String(deal.stage || deal.Stage || payload.Stage || '').toLowerCase().trim();
              const autoTransitionId = ZOHO_DEAL_TRANSITION_MAP[requestedStage];
              if (isUpdate && deal.zohoId && autoTransitionId) {
                try {
                  const bpRes = await executeZohoDealBlueprintTransition(
                    String(deal.zohoId),
                    autoTransitionId,
                    deal.remarks || 'Updated via API from Frontend Portal',
                    accessToken,
                    apiBase
                  );
                  console.log(`[Vite Zoho Plugin] Auto-Blueprint Transition Result for Deal #${deal.zohoId}:`, bpRes.success ? 'SUCCESS' : bpRes.message);
                } catch (bpErr) {
                  console.warn('[Vite Zoho Plugin] Auto-Blueprint Transition error:', bpErr);
                }
              }

              // Reconcile subform row IDs with existing Zoho CRM deal to prevent duplicate rows & delete old duplicate rows
              if (isUpdate && (deal.zohoId || payload.id)) {
                const targetZohoId = String(deal.zohoId || payload.id);
                await reconcileDealSubformsWithZoho(targetZohoId, payload, accessToken, apiBase, moduleName);
              }

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Deal in Zoho CRM:`, payload.Name || payload.Deal_Name, deal.zohoId ? `(ID: ${deal.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              // Handle Blueprint restriction on Stage: if update failed due to Stage Blueprint, retry without Stage/Pipeline
              let dealResult = crmData.data?.[0];
              if (isUpdate && (dealResult?.code === 'STAGE_CANNOT_BE_UPDATED' || (dealResult?.message && String(dealResult.message).toLowerCase().includes('blueprint')))) {
                console.log('[Vite Zoho Plugin] Deal Stage is governed by Blueprint in Zoho CRM. Retrying deal update without Stage field to sync Company, Lookups & Payment...');
                const retryPayload = { ...payload };
                delete retryPayload.Stage;
                delete retryPayload.Pipeline;

                const retryRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [retryPayload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                const retryData: any = await retryRes.json();
                if (retryData.data?.[0]?.code === 'SUCCESS') {
                  crmData = retryData;
                  dealResult = retryData.data[0];
                  console.log('[Vite Zoho Plugin] Deal updated successfully in Zoho CRM (Company and all fields linked, Stage managed by Blueprint)!');
                }
              }

              logZohoApiCall(isUpdate ? 'update-deal' : 'insert-deal', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || deal.zohoId;
                console.log(`[Vite Zoho Plugin] Deal ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Deal updated successfully in Zoho CRM' : 'Deal inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const detailInfo = crmData.data?.[0]?.details;
                let detailText = '';
                if (detailInfo) {
                  if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
                  else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
                }
                const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save deal record in Zoho CRM';
                const errMsg = rawMsg + detailText;
                console.error('[Vite Zoho Plugin] Zoho CRM deal error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Deal server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Deal Blueprint Stage Transition Endpoint (API Specifications: PUT /crm/v8/Deals/{record_id}/actions/blueprint)
        if ((pathname === '/api/zoho/deal-blueprint-transition' || pathname === '/api/zoho/blueprint-transition') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const reqData = JSON.parse(body);
              let dealZohoId = reqData.dealZohoId || reqData.dealId || reqData.zohoId || reqData.id;
              const targetStage = reqData.targetStage || reqData.stage || reqData.Stage || '';
              let transitionId = reqData.transitionId || reqData.transition_id;
              const remarks = reqData.remarks || reqData.Remarks || 'Updated via API from Frontend Portal';
              const additionalData = reqData.data || reqData.additionalData || {};

              if (!transitionId && targetStage) {
                transitionId = ZOHO_DEAL_TRANSITION_MAP[String(targetStage).toLowerCase().trim()];
              }

              if (!transitionId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: false,
                  message: `Missing or invalid transition_id for stage "${targetStage}". Available stages: Sales to Account ("1078476000000489153"), Account to Legal ("1078476000000492001"), Legal to Operations Allocator ("1078476000000492099"), Operations Allocator to Operations Executors ("1078476000001938757").`,
                }));
              }

              let accessToken = await getAccessToken(env);
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

              // If dealZohoId is not a numeric ID (e.g. DL-1234), search Deal record in Zoho CRM
              if (!dealZohoId || !/^\d{15,}$/.test(String(dealZohoId).trim())) {
                try {
                  const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
                  const sRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Deal_Name`, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                  });
                  if (sRes.ok) {
                    const sData: any = await sRes.json();
                    const list: any[] = sData.data || [];
                    const matched = list.find((d: any) => String(d.id) === String(dealZohoId) || (dealZohoId && String(d.Deal_Name || '').includes(String(dealZohoId))));
                    if (matched?.id) {
                      dealZohoId = String(matched.id);
                    }
                  }
                } catch (sErr) {
                  console.warn('[Vite Zoho Plugin] Deal search for blueprint transition failed:', sErr);
                }
              }

              if (!dealZohoId || !/^\d{15,}$/.test(String(dealZohoId).trim())) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: false,
                  message: `Invalid Zoho Deal Record ID (${dealZohoId}). Deal must be synchronized to Zoho CRM before executing blueprint transition.`,
                }));
              }

              let bpResult = await executeZohoDealBlueprintTransition(
                String(dealZohoId).trim(),
                String(transitionId).trim(),
                remarks,
                accessToken,
                apiBase,
                additionalData
              );

              // If token expired, refresh and retry once
              if (!bpResult.success && bpResult.data?.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                bpResult = await executeZohoDealBlueprintTransition(
                  String(dealZohoId).trim(),
                  String(transitionId).trim(),
                  remarks,
                  accessToken,
                  apiBase,
                  additionalData
                );
              }

              res.setHeader('Content-Type', 'application/json');
              if (bpResult.success) {
                return res.end(JSON.stringify({
                  success: true,
                  dealZohoId,
                  transitionId,
                  message: bpResult.message || 'Deal stage transitioned successfully via Zoho CRM Blueprint',
                  data: bpResult.data,
                }));
              } else {
                res.statusCode = 400;
                return res.end(JSON.stringify({
                  success: false,
                  dealZohoId,
                  transitionId,
                  message: bpResult.message,
                  errorDetails: bpResult.data,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Deal blueprint endpoint error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch Single Deal by ID (Module API Name: Deals)
        if ((pathname === '/api/zoho/get-deal' || (pathname === '/api/zoho/get-deals' && (urlObj.searchParams.get('id') || urlObj.searchParams.get('deal_id')))) && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const dealId = urlObj.searchParams.get('id') || urlObj.searchParams.get('deal_id');
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${dealId}`;

            console.log(`[Vite Zoho Plugin] Fetching single deal #${dealId} from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = await crmRes.json();

            if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData.message || 'Failed to fetch deal from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch single deal error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Fetch / Get Deals endpoint (Module API Name: Deals)
        if (pathname === '/api/zoho/get-deals' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const dealFields = 'id,Deal_Name,Account_Name,Contact_Name,Company,Companies,Company_Name,Company_name,Client_Name,Clients,Client,Owner,Employee,Stage,Pipeline,Closing_Date,Booking_Date,Created_Time,Modified_Time,Amount,Total_deal_amount_inclusive_of_gst,Deal_Amount,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Deal_Received_Amount,Total_Pending_Amount,Pending_amount,Deal_Pending_Amount,amount_if_you_have_kindly_put_0,Choose_Wisely,Service_Name,Service_Count,Subform_1,Legal,Client_contact_detail,Mobile,Client_Email_address,Email,Gst_number,Pan_number,Aadhaar_Card,Billing_address,City,State,Branches,Bank_details,Has_Partner_BDM,Partner_BDM_Name,Partner_BDM_Amount,Partner_BDM_ID,Quotation,Payment_verifications';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${dealFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${dealFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Deals from Zoho CRM (${moduleName}) [criteria: ${criteria || 'none'}]`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch deals from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch deals error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update employee endpoint (Module API Name: Employee)
        if ((pathname === '/api/zoho/insert-employee' || pathname === '/api/zoho/update-employee') && (req.method === 'POST' || req.method === 'PUT')) {

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const employee = JSON.parse(body);
              const payload = buildEmployeeZohoPayload(employee);
              const isUpdate = Boolean(employee.zohoId || pathname === '/api/zoho/update-employee');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Employee in Zoho CRM:`, payload.Name, employee.zohoId ? `(ID: ${employee.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-employee' : 'insert-employee', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || employee.zohoId;
                console.log(`[Vite Zoho Plugin] Employee ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Employee updated successfully in Zoho CRM' : 'Employee inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save employee record in Zoho CRM';
                console.error('[Vite Zoho Plugin] Zoho CRM error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Helper functions for mapping Zoho CRM Users
        function mapZohoUserToRole(u: any): 'Super Admin' | 'HR' | 'HOD' | 'TL' | 'TM' {
          const roleName = (u.role?.name || '').toLowerCase();
          const profileName = (u.profile?.name || '').toLowerCase();
          const email = (u.email || '').toLowerCase();

          if (email === 'superadmin@be.com' || email === 'md@bharat-edge.com' || profileName.includes('administrator') || profileName.includes('super admin') || profileName.includes('managing director') || profileName.includes('ceo')) {
            return 'Super Admin';
          }
          if (email === 'hrmshr@be.com' || roleName.includes('hr') || profileName.includes('hr')) {
            return 'HR';
          }
          if (roleName.includes('team member') || roleName.includes('op team member') || roleName.includes('bdm')) {
            return 'TM';
          }
          if (roleName.includes('team leader') || roleName.includes('tl') || profileName.includes('team leader') || profileName.includes('tl')) {
            return 'TL';
          }
          if (roleName.includes('head') || roleName.includes('hod') || roleName.includes('manager') || profileName.includes('head') || profileName.includes('manager')) {
            return 'HOD';
          }
          return 'TM';
        }

        function mapZohoUserToDept(u: any): string {
          const roleName = (u.role?.name || '').toLowerCase();
          const profileName = (u.profile?.name || '').toLowerCase();
          if (roleName.includes('sales') || roleName.includes('bdm') || roleName.includes('cdm') || roleName.includes('vsh') || roleName.includes('bm') || profileName.includes('sales')) {
            return 'Sales';
          }
          if (roleName.includes('op') || roleName.includes('operation') || profileName.includes('operation')) {
            return 'Operations';
          }
          if (roleName.includes('quality') || profileName.includes('quality')) {
            return 'Quality';
          }
          if (roleName.includes('hr') || profileName.includes('hr')) {
            return 'Human Resources';
          }
          if (roleName.includes('account') || roleName.includes('finance') || profileName.includes('finance')) {
            return 'Accounts';
          }
          if (roleName.includes('legal') || profileName.includes('legal')) {
            return 'Legal';
          }
          return 'Operations';
        }

        // Update employee password endpoint (Module API Name: Employee)
        if (pathname === '/api/zoho/update-employee-password' && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const email = (parsed.email || '').trim();
              const password = (parsed.password || parsed.newPassword || '').trim();
              let zohoId = parsed.zohoId ? String(parsed.zohoId).trim() : '';

              if (!password) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Password is required' }));
              }

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

              // 1. If zohoId is not provided, search by email in Employee module
              let isCustomEmployeeRecord = false;
              if (email) {
                try {
                  const criteria = `(((Personal_Email_Address:equals:${email})or(Email:equals:${email}))or(Employment_ID:equals:${email}))`;
                  const searchUrl = `${apiBase}/crm/v8/${moduleName}/search?criteria=${encodeURIComponent(criteria)}`;
                  
                  let searchRes = await fetch(searchUrl, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                  });
                  
                  if (searchRes.status === 401) {
                    cachedToken = null;
                    accessToken = await getAccessToken(env);
                    searchRes = await fetch(searchUrl, {
                      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                    });
                  }

                  if (searchRes.status === 200) {
                    const searchData: any = await searchRes.json();
                    if (searchData?.data?.[0]?.id) {
                      zohoId = String(searchData.data[0].id);
                      isCustomEmployeeRecord = true;
                    }
                  }

                  // Fallback: search?email=...
                  if (!isCustomEmployeeRecord && email.includes('@')) {
                    const emailSearchUrl = `${apiBase}/crm/v8/${moduleName}/search?email=${encodeURIComponent(email)}`;
                    let emailRes = await fetch(emailSearchUrl, {
                      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                    });
                    if (emailRes.status === 200) {
                      const emailData: any = await emailRes.json();
                      if (emailData?.data?.[0]?.id) {
                        zohoId = String(emailData.data[0].id);
                        isCustomEmployeeRecord = true;
                      }
                    }
                  }
                } catch (searchErr) {
                  console.warn('[Vite Zoho Plugin] Error searching employee by email:', searchErr);
                }
              }

              // 2. If it's an existing record in Employee module, update Password via PUT
              if (isCustomEmployeeRecord && zohoId) {
                const updatePayload = {
                  id: zohoId,
                  Password: password,
                };

                const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;
                let crmRes = await fetch(crmEndpoint, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [updatePayload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });

                let crmData: any = await crmRes.json();
                if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                  cachedToken = null;
                  accessToken = await getAccessToken(env);
                  crmRes = await fetch(crmEndpoint, {
                    method: 'PUT',
                    headers: {
                      'Authorization': `Zoho-oauthtoken ${accessToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      data: [updatePayload],
                      trigger: ['approval', 'workflow', 'blueprint'],
                    }),
                  });
                  crmData = await crmRes.json();
                }

                logZohoApiCall('update-employee-password', 'PUT', crmEndpoint, updatePayload, crmRes.status, crmData);

                res.setHeader('Content-Type', 'application/json');
                if (crmData.data?.[0]?.code === 'SUCCESS') {
                  return res.end(JSON.stringify({
                    success: true,
                    zohoId,
                    message: `Password updated successfully in Zoho CRM for employee (${email})`,
                    data: crmData.data[0],
                  }));
                }
              }

              // 3. If not in Employee module yet, fetch user from Zoho Users and insert as Employee record
              let userMatch: any = null;
              try {
                let usersRes = await fetch(`${apiBase}/crm/v8/users?type=AllUsers`, {
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                });
                if (usersRes.status === 200) {
                  const uData: any = await usersRes.json();
                  userMatch = uData.users?.find((u: any) =>
                    (u.email && u.email.toLowerCase() === email.toLowerCase()) ||
                    (zohoId && String(u.id) === zohoId)
                  );
                }
              } catch (uErr) {
                console.warn('[Vite Zoho Plugin] Error fetching user for password insert:', uErr);
              }

              const empFirstName = userMatch?.first_name || userMatch?.full_name?.split(' ')[0] || email.split('@')[0];
              const empLastName = userMatch?.last_name || userMatch?.full_name?.split(' ').slice(1).join(' ') || '';
              const empRole = userMatch ? mapZohoUserToRole(userMatch) : 'TM';
              const empDept = userMatch ? mapZohoUserToDept(userMatch) : 'Operations';
              const empDesignation = userMatch?.profile?.name || userMatch?.role?.name || 'Operations Team Member';

              const insertPayload: Record<string, any> = {
                Name: empFirstName,
                Last_Name: empLastName,
                Email: email || userMatch?.email,
                Personal_Email_Address: email || userMatch?.email,
                Department: empDept,
                Designation_Job_Title: empDesignation,
                System_Role: empRole,
                Password: password,
                Employment_ID: `EMP-${(userMatch?.id || Date.now()).toString().slice(-4)}`
              };

              const insertEndpoint = `${apiBase}/crm/v8/${moduleName}`;
              let insertRes = await fetch(insertEndpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [insertPayload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let insertData: any = await insertRes.json();
              if (insertRes.status === 401 || insertData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                insertRes = await fetch(insertEndpoint, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [insertPayload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                insertData = await insertRes.json();
              }

              logZohoApiCall('update-employee-password', 'POST', insertEndpoint, insertPayload, insertRes.status, insertData);

              res.setHeader('Content-Type', 'application/json');
              const newZohoId = insertData.data?.[0]?.details?.id || zohoId;
              return res.end(JSON.stringify({
                success: true,
                zohoId: newZohoId,
                message: `Password set and employee record created in Zoho CRM for (${email})`,
                data: insertData.data?.[0] || { id: newZohoId },
              }));
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Error updating employee password:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Search employee by email endpoint (Module API Name: Employee + Zoho Users Fallback)
        if ((pathname === '/api/zoho/search-employee' || pathname === '/api/zoho/check-employee') && (req.method === 'GET' || req.method === 'POST')) {
          let email = urlObj.searchParams.get('email') || '';
          
          const processSearch = async (emailToSearch: string) => {
            try {
              const cleanEmail = emailToSearch.trim().toLowerCase();
              if (!cleanEmail) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Email parameter is required' }));
              }

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

              let matchedRecord: any = null;

              // Step 1: Search Employee custom module by criteria
              try {
                const criteria = `(((Personal_Email_Address:equals:${cleanEmail})or(Email:equals:${cleanEmail}))or(Employment_ID:equals:${cleanEmail}))`;
                const searchUrl = `${apiBase}/crm/v8/${moduleName}/search?criteria=${encodeURIComponent(criteria)}`;

                let searchRes = await fetch(searchUrl, {
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                });

                if (searchRes.status === 401) {
                  cachedToken = null;
                  accessToken = await getAccessToken(env);
                  searchRes = await fetch(searchUrl, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                  });
                }

                if (searchRes.status === 200) {
                  const searchData: any = await searchRes.json();
                  if (searchData?.data?.length > 0) {
                    matchedRecord = searchData.data[0];
                  }
                }
              } catch (critErr) {
                console.warn('[Vite Zoho Plugin] Employee criteria search failed:', critErr);
              }

              // Step 2: Fallback search?email=...
              if (!matchedRecord && cleanEmail.includes('@')) {
                try {
                  const emailSearchUrl = `${apiBase}/crm/v8/${moduleName}/search?email=${encodeURIComponent(cleanEmail)}`;
                  let emailRes = await fetch(emailSearchUrl, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                  });
                  if (emailRes.status === 200) {
                    const emailData: any = await emailRes.json();
                    if (emailData?.data?.length > 0) {
                      matchedRecord = emailData.data[0];
                    }
                  }
                } catch (emErr) {
                  console.warn('[Vite Zoho Plugin] Employee email search failed:', emErr);
                }
              }

              // Step 3: Fallback list scan on Employee custom module
              if (!matchedRecord) {
                try {
                  const employeeFields = 'id,Name,Middle_Name,Last_Name,Employment_ID,Personal_Email_Address,Email,Password,System_Role,Department,Designation_Job_Title,Who_is_the_Team_Leader_TL,Reporting_Manager,Contact_Number';
                  const listUrl = `${apiBase}/crm/v8/${moduleName}?fields=${employeeFields}&per_page=200`;
                  let listRes = await fetch(listUrl, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                  });
                  if (listRes.status === 200) {
                    const listData: any = await listRes.json();
                    if (listData?.data) {
                      matchedRecord = listData.data.find((x: any) =>
                        (x.Personal_Email_Address && x.Personal_Email_Address.toLowerCase() === cleanEmail) ||
                        (x.Email && x.Email.toLowerCase() === cleanEmail) ||
                        (x.Employment_ID && String(x.Employment_ID).toLowerCase() === cleanEmail) ||
                        (x.Name && x.Name.toLowerCase() === cleanEmail)
                      );
                    }
                  }
                } catch (listErr) {
                  console.warn('[Vite Zoho Plugin] Employee list scan failed:', listErr);
                }
              }

              // Step 4: Fallback search in Zoho CRM Users (/crm/v8/users?type=AllUsers)
              if (!matchedRecord) {
                try {
                  let usersRes = await fetch(`${apiBase}/crm/v8/users?type=AllUsers`, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                  });
                  if (usersRes.status === 401) {
                    cachedToken = null;
                    accessToken = await getAccessToken(env);
                    usersRes = await fetch(`${apiBase}/crm/v8/users?type=AllUsers`, {
                      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                    });
                  }

                  if (usersRes.status === 200) {
                    const uData: any = await usersRes.json();
                    const rawUsers = uData?.users || [];
                    const foundUser = rawUsers.find((u: any) => {
                      const uEmail = (u.email || '').toLowerCase().trim();
                      const uFirst = (u.first_name || '').toLowerCase().trim();
                      const uFull = (u.full_name || '').toLowerCase().trim();
                      const uId = String(u.id || '').toLowerCase().trim();
                      return uEmail === cleanEmail ||
                             uFirst === cleanEmail ||
                             uFull === cleanEmail ||
                             uId === cleanEmail ||
                             (cleanEmail.includes('@') && uEmail && (uEmail.split('@')[0] === cleanEmail.split('@')[0]));
                    });

                    if (foundUser) {
                      const fullName = foundUser.full_name || [foundUser.first_name, foundUser.last_name].filter(Boolean).join(' ') || foundUser.name || 'Team Member';
                      const role = mapZohoUserToRole(foundUser);
                      const dept = mapZohoUserToDept(foundUser);
                      const designation = foundUser.profile?.name || foundUser.role?.name || (role === 'TM' ? 'Operations Team Member' : `${role} Officer`);
                      
                      matchedRecord = {
                        id: String(foundUser.id),
                        zohoId: String(foundUser.id),
                        Name: foundUser.first_name || fullName.split(' ')[0],
                        Last_Name: foundUser.last_name || fullName.split(' ').slice(1).join(' '),
                        Employment_ID: `EMP-${String(foundUser.id).slice(-4)}`,
                        Email: foundUser.email || cleanEmail,
                        Personal_Email_Address: foundUser.email || cleanEmail,
                        Contact_Number: foundUser.phone || foundUser.mobile || '',
                        Department: dept,
                        Designation_Job_Title: designation,
                        System_Role: role,
                        Password: '',
                        Who_is_the_Team_Leader_TL: '',
                        Reporting_Manager: role === 'TL' || role === 'HOD' ? 'Super Admin / Managing Director' : '',
                      };
                    }
                  }
                } catch (userSearchErr) {
                  console.warn('[Vite Zoho Plugin] Zoho CRM Users search failed:', userSearchErr);
                }
              }

              res.setHeader('Content-Type', 'application/json');
              if (matchedRecord) {
                const rawPassword = matchedRecord.Password;
                const hasPassword = Boolean(rawPassword && String(rawPassword).trim().length > 0);
                return res.end(JSON.stringify({
                  success: true,
                  exists: true,
                  hasPassword,
                  employee: {
                    id: matchedRecord.Employment_ID || matchedRecord.id,
                    zohoId: String(matchedRecord.id || matchedRecord.zohoId || ''),
                    name: [matchedRecord.Name, matchedRecord.Middle_Name, matchedRecord.Last_Name].filter(Boolean).join(' ') || matchedRecord.Name,
                    email: matchedRecord.Email || matchedRecord.Personal_Email_Address || cleanEmail,
                    personalEmail: matchedRecord.Personal_Email_Address || matchedRecord.Email,
                    workEmail: matchedRecord.Email || matchedRecord.Personal_Email_Address,
                    mobile: matchedRecord.Contact_Number || matchedRecord.mobile || '',
                    password: rawPassword || '',
                    hasPassword,
                    role: matchedRecord.System_Role || 'TM',
                    department: matchedRecord.Department || 'Operations',
                    designation: matchedRecord.Designation_Job_Title || 'Employee',
                    teamLeaderName: matchedRecord.Who_is_the_Team_Leader_TL || '',
                    reportingManagerName: matchedRecord.Reporting_Manager || '',
                  }
                }));
              } else {
                return res.end(JSON.stringify({
                  success: true,
                  exists: false,
                  message: 'Email Does Not Exist'
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Error searching employee by email:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          };

          if (req.method === 'GET') {
            processSearch(email);
          } else {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                processSearch(parsed.email || email);
              } catch {
                processSearch(email);
              }
            });
          }
          return;
        }

        // Fetch / Get Employees endpoint (Module API Name: Employee + Zoho Users Merged)
        if (pathname === '/api/zoho/get-employees' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const employeeFields = 'id,Name,Middle_Name,Last_Name,Employment_ID,Contact_Number,Personal_Email_Address,Email,Gender,Marital_Status,Nationality,Blood_Group,Date_of_Birth,Date_of_Joining,Department,Designation_Job_Title,System_Role,Employment_Type,Permanent_Address,Current_Address,Education_Qualification,Professional_Certifications,Key_Skills,Languages_Known,Previous_Employer,Total_Experience,Emergency_Contact_First_Name,Emergency_Contact_Last_Name,Emergency_Contact_Number,Relationship_with_Contact,Who_is_the_Team_Leader_TL,Reporting_Manager,Pan_Number,Aadhaar_Number,Passport_Number,Driving_License_Number,Bank_Account_Number,Bank_Name,IFSC_Code,PF_Applicable,PF_Number,ESIC_Number,UAN_Number,Medical_Insurance_Number,Salary_Entity,Company_Entity,Password,Created_Time,Modified_Time';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${employeeFields}&${buildZohoPaginationQuery(urlObj)}`;

            console.log(`[Vite Zoho Plugin] Fetching live Employees from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            const customEmps: any[] = crmData?.data || [];

            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: true,
              data: customEmps,
              info: crmData?.info,
            }));
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch employees error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Fetch Sales Employees & BDMs endpoint
        if (pathname === '/api/zoho/get-sales-employees' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';

            // 1. Fetch from Employee module
            let empRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200`, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            let empData: any = empRes.status === 204 ? { code: 'NO_CONTENT' } : await empRes.json();
            if (empRes.status === 401 || empData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              empRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
              });
              empData = empRes.status === 204 ? { code: 'NO_CONTENT' } : await empRes.json();
            }

            // 2. Fetch Active Users from Zoho CRM
            let usersRes = await fetch(`${apiBase}/crm/v8/users?type=ActiveUsers`, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            let usersData: any = usersRes.status === 204 ? { code: 'NO_CONTENT' } : await usersRes.json();

            const rawEmps = empData?.data || [];
            const rawUsers = usersData?.users || [];
            const salesList: any[] = [];
            const seenKeys = new Set<string>();

            const salesKeywords = [
              'sales',
              'bdm',
              'bde',
              'business dev',
              'business development',
              'cluster',
              'cluster dev',
              'cluster development',
              'national sales',
              'sales head',
              'sales manager',
              'sales executive',
              'commercial',
              'growth',
              'revenue',
              'nsm',
              'cdm',
              'account executive',
              'client relationship',
              'bde'
            ];

            // Process Employee module records (Department === 'Sales' or BDM/sales designation)
            for (const z of rawEmps) {
              const dept = (z.Department || '').toLowerCase();
              const designation = (z.Designation_Job_Title || '').toLowerCase();
              const role = (z.System_Role || '').toLowerCase();
              const hasSalesDept = salesKeywords.some(kw => dept.includes(kw));
              const hasSalesRole = salesKeywords.some(kw => designation.includes(kw) || role.includes(kw));
              const isSales = hasSalesDept || hasSalesRole || dept === 'sales' || dept === '' || !dept;

              if (isSales) {
                const fullName = [z.Name, z.Middle_Name, z.Last_Name].filter(Boolean).join(' ') || z.Name || 'Sales Employee';
                const email = (z.Email || z.Personal_Email_Address || '').toLowerCase().trim();
                const nameKey = fullName.toLowerCase().trim();
                const uniqueKey = email || nameKey;

                if (!seenKeys.has(uniqueKey)) {
                  seenKeys.add(uniqueKey);
                  if (nameKey) seenKeys.add(nameKey);
                  salesList.push({
                    id: String(z.id || z.Employment_ID),
                    zohoId: String(z.id),
                    name: fullName,
                    email: z.Email || z.Personal_Email_Address || '',
                    dept: z.Department || 'Sales',
                    role: z.Designation_Job_Title || z.System_Role || 'Sales',
                    empId: z.Employment_ID || String(z.id),
                    status: 'Active',
                    source: 'Employee Module'
                  });
                }
              }
            }

            // Process Zoho CRM Active Users (BDMs, Sales team, NSMs, CDMs, Cluster Managers)
            for (const u of rawUsers) {
              const profileName = (u.profile?.name || '').toLowerCase();
              const roleName = (u.role?.name || '').toLowerCase();
              const isExcluded = profileName.includes('developer') || roleName.includes('developer') || profileName.includes('human resources') || roleName.includes('human resources');
              const isSales = !isExcluded || salesKeywords.some(kw => profileName.includes(kw) || roleName.includes(kw));

              if (isSales) {
                const fullName = (u.full_name || u.name || '').trim();
                const email = (u.email || '').toLowerCase().trim();
                const nameKey = fullName.toLowerCase().trim();
                const uniqueKey = email || nameKey;

                if (!seenKeys.has(uniqueKey) && !seenKeys.has(nameKey)) {
                  seenKeys.add(uniqueKey);
                  seenKeys.add(nameKey);

                  const matchedEmp = rawEmps.find((e: any) => {
                    const eEmail = (e.Email || e.Personal_Email_Address || '').trim().toLowerCase();
                    const eFullName = [e.Name, e.Middle_Name, e.Last_Name].filter(Boolean).join(' ').trim().toLowerCase();
                    return (email && eEmail === email) || (nameKey && (eFullName === nameKey || eFullName.includes(nameKey) || nameKey.includes(eFullName)));
                  });

                  const resolvedZohoId = matchedEmp?.id ? String(matchedEmp.id) : String(u.id);

                  salesList.push({
                    id: resolvedZohoId,
                    zohoId: resolvedZohoId,
                    name: fullName,
                    email: u.email || '',
                    dept: 'Sales',
                    role: u.profile?.name || u.role?.name || 'Business Development Manager',
                    empId: matchedEmp?.Employment_ID || String(u.id),
                    status: 'Active',
                    source: matchedEmp ? 'Employee Module' : 'Zoho CRM User'
                  });
                }
              }
            }

            // Sort alphabetically by name
            salesList.sort((a, b) => a.name.localeCompare(b.name));

            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: true,
              data: salesList,
              total: salesList.length
            }));
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch sales employees error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message, data: [] }));
          }
        }

        // Insert or Update Leave endpoint (Module API Name: Leave_Management)
        if ((pathname === '/api/zoho/insert-leave' || pathname === '/api/zoho/update-leave') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const leave = JSON.parse(body);
              const payload = buildLeaveZohoPayload(leave);
              const isUpdate = Boolean(leave.zohoId || pathname === '/api/zoho/update-leave');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_LEAVE_MODULE_NAME || 'Leave_Management';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Leave in Zoho CRM (${moduleName}):`, payload.Name, leave.zohoId ? `(ID: ${leave.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-leave' : 'insert-leave', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || leave.zohoId;
                console.log(`[Vite Zoho Plugin] Leave ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Leave request updated successfully in Zoho CRM' : 'Leave request inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save leave record in Zoho CRM';
                console.error('[Vite Zoho Plugin] Zoho CRM error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Leaves endpoint (Module API Name: Leave_Management)
        if (pathname === '/api/zoho/get-leaves' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_LEAVE_MODULE_NAME || 'Leave_Management';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const leaveFields = 'id,Name,Leave_Type,Start_Date,End_Date,Approved_by_TL,Approved_by_HR,Approved_by_MD,Email,Secondary_Email,Employee,Created_Time,Modified_Time';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${leaveFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${leaveFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Leaves from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch leaves from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch leaves error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update Company endpoint (Module API Name: Companies)
        if ((pathname === '/api/zoho/insert-company' || pathname === '/api/zoho/update-company') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const company = JSON.parse(body);
              const payload = buildCompanyZohoPayload(company);
              const isUpdate = Boolean(company.zohoId || pathname === '/api/zoho/update-company');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              // Dynamically resolve Employee lookup to valid Zoho numeric record ID
              if (!payload.Employee?.id || !/^\d{15,}$/.test(String(payload.Employee.id))) {
                const empLookupInfo = {
                  id: company.employeeZohoId || company.formData?.employeeZohoId || company.empZohoId || company.formData?.empZohoId || (typeof company.Employee === 'object' ? company.Employee?.id : company.Employee),
                  name: company.employeeName || company.formData?.employeeName || company.empName || company.salesEmployee || company.owner || (typeof company.Employee === 'object' ? company.Employee?.name : null),
                  email: company.employeeEmail || company.formData?.employeeEmail || company.userEmail || company.formData?.userEmail || company.email,
                  empId: company.empId || company.formData?.empId || company.employeeId || company.formData?.employeeId,
                };
                const resolvedEmpId = await resolveZohoEmployeeId(empLookupInfo, accessToken, apiBase);
                if (resolvedEmpId) {
                  payload.Employee = { id: resolvedEmpId };
                } else {
                  delete payload.Employee;
                }
              }

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Company in Zoho CRM (${moduleName}):`, payload.Name, company.zohoId ? `(ID: ${company.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-company' : 'insert-company', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || company.zohoId;
                console.log(`[Vite Zoho Plugin] Company ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Company updated successfully in Zoho CRM' : 'Company inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save company record in Zoho CRM';
                console.error('[Vite Zoho Plugin] Zoho CRM company error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Company server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Companies endpoint (Module API Name: Companies)
        if (pathname === '/api/zoho/get-companies' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const companyFields = 'id,Name,Business_Type,Date_of_Incorporation,GST_Number,Email,Secondary_Email,Employee,Status,Tag,Created_Time,Modified_Time';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${companyFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${companyFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Companies from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch companies from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch companies error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update Client endpoint (Module API Name: Clients)
        if ((pathname === '/api/zoho/insert-client' || pathname === '/api/zoho/update-client') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const client = JSON.parse(body);
              const payload = buildClientZohoPayload(client);
              const isUpdate = Boolean(client.zohoId || pathname === '/api/zoho/update-client');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              // Dynamically resolve Employee lookup to valid Zoho numeric record ID
              if (!payload.Employee?.id || !/^\d{15,}$/.test(String(payload.Employee.id))) {
                const empLookupInfo = {
                  id: client.employeeZohoId || client.formData?.employeeZohoId || client.empZohoId || client.formData?.empZohoId || (typeof client.Employee === 'object' ? client.Employee?.id : client.Employee),
                  name: client.employeeName || client.formData?.employeeName || client.empName || client.salesEmployee || client.owner || (typeof client.Employee === 'object' ? client.Employee?.name : null),
                  email: client.employeeEmail || client.formData?.employeeEmail || client.userEmail || client.formData?.userEmail || client.email,
                  empId: client.empId || client.formData?.empId || client.employeeId || client.formData?.employeeId,
                };
                const resolvedEmpId = await resolveZohoEmployeeId(empLookupInfo, accessToken, apiBase);
                if (resolvedEmpId) {
                  payload.Employee = { id: resolvedEmpId };
                } else {
                  delete payload.Employee;
                }
              }

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Client in Zoho CRM (${moduleName}):`, payload.Name, client.zohoId ? `(ID: ${client.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-client' : 'insert-client', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || client.zohoId;
                console.log(`[Vite Zoho Plugin] Client ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Client updated successfully in Zoho CRM' : 'Client inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save client record in Zoho CRM';
                console.error('[Vite Zoho Plugin] Zoho CRM client error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Client server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Clients endpoint (Module API Name: Clients)
        if (pathname === '/api/zoho/get-clients' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const clientFields = 'id,Name,Company_Name,Email,Mobile_Number,Secondary_Email,Employee,Status,Tag,Created_Time,Modified_Time';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${clientFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${clientFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Clients from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch clients from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch clients error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update Company Policy endpoint (Module API Name: Company_Policies)
        if ((pathname === '/api/zoho/insert-policy' || pathname === '/api/zoho/update-policy') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const policy = JSON.parse(body);
              const payload = buildCompanyPolicyZohoPayload(policy);
              const isUpdate = Boolean(policy.zohoId || pathname === '/api/zoho/update-policy');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_COMPANY_POLICIES_MODULE_NAME || 'Company_Policies';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Policy in Zoho CRM (${moduleName}):`, payload.Name, policy.zohoId ? `(ID: ${policy.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-policy' : 'insert-policy', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || policy.zohoId;
                console.log(`[Vite Zoho Plugin] Policy ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Company Policy updated successfully in Zoho CRM' : 'Company Policy inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const detailInfo = crmData.data?.[0]?.details;
                let detailText = '';
                if (detailInfo) {
                  if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
                  else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
                }
                const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save company policy record in Zoho CRM';
                const errMsg = rawMsg + detailText;
                console.error('[Vite Zoho Plugin] Zoho CRM policy error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Policy server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Company Policies endpoint (Module API Name: Company_Policies)
        if (pathname === '/api/zoho/get-policies' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_COMPANY_POLICIES_MODULE_NAME || 'Company_Policies';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const policyFields = 'id,Name,Policy_Content,Department,Email,Secondary_Email,Tag,Email_Opt_Out,Created_By,Modified_By,Created_Time,Modified_Time';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${policyFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${policyFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Company Policies from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch company policies from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch policies error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update Company Calendar endpoint (Module API Name: Company_Calendar)
        if ((pathname === '/api/zoho/insert-calendar' || pathname === '/api/zoho/update-calendar') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const event = JSON.parse(body);
              const payload = buildCompanyCalendarZohoPayload(event);
              const isUpdate = Boolean(event.zohoId || pathname === '/api/zoho/update-calendar');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_CALENDAR_MODULE_NAME || 'Company_Calendar';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} Event in Zoho CRM (${moduleName}):`, payload.Name, event.zohoId ? `(ID: ${event.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-calendar' : 'insert-calendar', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || event.zohoId;
                console.log(`[Vite Zoho Plugin] Calendar Event ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Calendar event updated successfully in Zoho CRM' : 'Calendar event inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const detailInfo = crmData.data?.[0]?.details;
                let detailText = '';
                if (detailInfo) {
                  if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
                  else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
                }
                const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save calendar event record in Zoho CRM';
                const errMsg = rawMsg + detailText;
                console.error('[Vite Zoho Plugin] Zoho CRM calendar event error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Calendar server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Company Calendar records endpoint (Module API Name: Company_Calendar)
        if (pathname === '/api/zoho/get-calendar' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_CALENDAR_MODULE_NAME || 'Company_Calendar';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const calFields = 'id,Name,Date,Category_Type,Description,Email,Secondary_Email,Tag,Email_Opt_Out,Created_Time,Modified_Time';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${calFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${calFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Calendar Events from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch calendar events from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch calendar error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update DSR endpoint (Module API Name: DSR)
        if ((pathname === '/api/zoho/insert-dsr' || pathname === '/api/zoho/update-dsr') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const dsr = JSON.parse(body);
              const payload = buildDsrZohoPayload(dsr);
              const isUpdate = Boolean(dsr.zohoId || pathname === '/api/zoho/update-dsr');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_DSR_MODULE_NAME || 'DSR';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Inserting'} DSR in Zoho CRM (${moduleName}):`, payload.Name, dsr.zohoId ? `(ID: ${dsr.zohoId})` : '');

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  data: [payload],
                  trigger: ['approval', 'workflow', 'blueprint'],
                }),
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    data: [payload],
                    trigger: ['approval', 'workflow', 'blueprint'],
                  }),
                });
                crmData = await crmRes.json();
              }

              logZohoApiCall(isUpdate ? 'update-dsr' : 'insert-dsr', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || dsr.zohoId;
                console.log(`[Vite Zoho Plugin] DSR ${isUpdate ? 'Updated' : 'Inserted'} successfully! Zoho ID:`, zohoId);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'DSR updated successfully in Zoho CRM' : 'DSR inserted successfully into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const detailInfo = crmData.data?.[0]?.details;
                let detailText = '';
                if (detailInfo) {
                  if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
                  else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
                }
                const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save DSR record in Zoho CRM';
                const errMsg = rawMsg + detailText;
                console.error('[Vite Zoho Plugin] Zoho CRM DSR error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] DSR server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get DSR records endpoint (Module API Name: DSR)
        if (pathname === '/api/zoho/get-dsr' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_DSR_MODULE_NAME || 'DSR';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const dsrFields = 'id,Name,Date,Description,Email,Secondary_Email,Tag,Employee,Email_Opt_Out,Created_Time,Modified_Time';
            const criteria = urlObj.searchParams.get('criteria') || '';
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = criteria
              ? `${apiBase}/crm/v8/${moduleName}/search?fields=${dsrFields}&${paginationQuery}`
              : `${apiBase}/crm/v8/${moduleName}?fields=${dsrFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live DSRs from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch DSR records from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch DSR error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Fetch / Get Daily Attendance records endpoint (Module API Name: Daily_Attendance)
        if (pathname === '/api/zoho/get-attendance' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_ATTENDANCE_MODULE_NAME || 'Daily_Attendance';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const attFields = 'id,Name,Attendance_Date,Employee,Employee_Code,First_In,Last_Out,Mark_Attendance,Punch_Status,Punch_Count,Punches,Late_Minutes,Early_Out_Minutes,Total_Minutes,Owner,Email,Record_Image,Secondary_Email,Created_Time,Modified_Time';
            
            const dateParam = urlObj.searchParams.get('date') || urlObj.searchParams.get('attendance_date') || '';
            const startDateParam = urlObj.searchParams.get('start_date') || urlObj.searchParams.get('startDate') || '';
            const endDateParam = urlObj.searchParams.get('end_date') || urlObj.searchParams.get('endDate') || '';
            const empCodeParam = urlObj.searchParams.get('employee_code') || urlObj.searchParams.get('emp_code') || '';
            const modifiedSince = urlObj.searchParams.get('modified_since') || urlObj.searchParams.get('modified_time') || '';
            const fetchAll = urlObj.searchParams.get('fetch_all') === 'true' || (!urlObj.searchParams.get('page') && !urlObj.searchParams.get('page_token'));

            const criteriaParts: string[] = [];
            if (startDateParam && endDateParam) {
              criteriaParts.push(`(Attendance_Date:greater_equal:${startDateParam})`);
              criteriaParts.push(`(Attendance_Date:less_equal:${endDateParam})`);
            } else if (dateParam) {
              criteriaParts.push(`(Attendance_Date:equals:${dateParam})`);
            }
            if (empCodeParam) {
              criteriaParts.push(`(Employee_Code:equals:${empCodeParam})`);
            }
            if (modifiedSince) {
              criteriaParts.push(`(Modified_Time:greater_equal:${modifiedSince})`);
            }

            let baseEndpoint: string;
            if (criteriaParts.length > 1) {
              const combined = criteriaParts.reduce((acc, curr) => `(${acc}and${curr})`);
              baseEndpoint = `${apiBase}/crm/v8/${moduleName}/search?criteria=${encodeURIComponent(combined)}&fields=${attFields}`;
            } else if (criteriaParts.length === 1) {
              baseEndpoint = `${apiBase}/crm/v8/${moduleName}/search?criteria=${encodeURIComponent(criteriaParts[0])}&fields=${attFields}`;
            } else {
              baseEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${attFields}`;
            }

            console.log(`[Vite Zoho Plugin] Fetching live Attendance from Zoho CRM (${moduleName}) [fetchAll: ${fetchAll}]`);

            if (fetchAll) {
              let allRecords: any[] = [];
              let pageToken: string | null = null;
              let page = 1;
              let hasMore = true;
              let lastInfo: any = null;

              while (hasMore && page <= 30) {
                const sep = baseEndpoint.includes('?') ? '&' : '?';
                let pageUrl = `${baseEndpoint}${sep}per_page=200`;
                if (pageToken) {
                  pageUrl += `&page_token=${encodeURIComponent(pageToken)}`;
                } else if (page > 1) {
                  pageUrl += `&page=${page}`;
                }

                let crmRes = await fetch(pageUrl, {
                  method: 'GET',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                });
                let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

                if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
                  cachedToken = null;
                  accessToken = await getAccessToken(env);
                  crmRes = await fetch(pageUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                  });
                  crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
                }

                if (crmData?.data && Array.isArray(crmData.data)) {
                  allRecords = allRecords.concat(crmData.data);
                  lastInfo = crmData.info;
                  if (crmData.info?.next_page_token) {
                    pageToken = crmData.info.next_page_token;
                    page++;
                  } else if (crmData.info?.more_records) {
                    page++;
                  } else {
                    hasMore = false;
                  }
                } else {
                  hasMore = false;
                }
              }

              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                data: allRecords,
                info: { ...lastInfo, count: allRecords.length }
              }));
            }

            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const sep = baseEndpoint.includes('?') ? '&' : '?';
            const crmEndpoint = `${baseEndpoint}${sep}${paginationQuery}`;

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
            });
            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({ success: true, data: [] }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch attendance from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch Attendance error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert / Upsert Attendance record endpoint (Module API Name: Daily_Attendance)
        if (pathname === '/api/zoho/save-attendance' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const record = JSON.parse(body || '{}');
              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_ATTENDANCE_MODULE_NAME || 'Daily_Attendance';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

              const empCode = record.employeeCode || record.empCode || record.Employee_Code || 'EMP';
              const attDate = record.attendanceDate || record.date || record.Attendance_Date || new Date().toISOString().split('T')[0];
              const keyName = record.name || record.Name || `${empCode} - ${attDate}`;

              const zohoPayload: Record<string, any> = {
                Name: keyName,
                Attendance_Date: attDate,
                Employee_Code: empCode,
                Mark_Attendance: record.markAttendance || record.status || record.Mark_Attendance || 'Present',
                Punch_Status: record.punchStatus || record.Punch_Status || (record.lastOut ? 'Complete' : 'Single Punch'),
                Punch_Count: record.punchCount !== undefined ? Number(record.punchCount) : (record.lastOut ? 2 : 1),
                Punches: record.punches || record.punchesLog || record.Punches || '',
                Late_Minutes: Number(record.lateMinutes ?? record.Late_Minutes ?? 0),
                Early_Out_Minutes: Number(record.earlyOutMinutes ?? record.Early_Out_Minutes ?? 0),
                Total_Minutes: Number(record.totalMinutes ?? record.Total_Minutes ?? 0),
              };

              if (record.firstIn || record.First_In) {
                zohoPayload.First_In = record.firstIn || record.First_In;
              }
              if (record.lastOut || record.Last_Out) {
                zohoPayload.Last_Out = record.lastOut || record.Last_Out;
              }
              if (record.employeeZohoId || (record.Employee && typeof record.Employee === 'object' && record.Employee.id)) {
                zohoPayload.Employee = { id: record.employeeZohoId || record.Employee.id };
              }

              const isUpdate = Boolean(record.zohoId || (record.id && /^\d+$/.test(String(record.id))));
              const targetZohoId = record.zohoId || record.id;
              const crmEndpoint = isUpdate 
                ? `${apiBase}/crm/v8/${moduleName}/${targetZohoId}`
                : `${apiBase}/crm/v8/${moduleName}/upsert`;

              console.log(`[Vite Zoho Plugin] ${isUpdate ? 'Updating' : 'Upserting'} Attendance record in Zoho CRM (${moduleName})`);

              const requestBody: any = isUpdate
                ? { data: [zohoPayload] }
                : { data: [zohoPayload], duplicate_check_fields: ['Name'] };

              let crmRes = await fetch(crmEndpoint, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
              });

              let crmData: any = await crmRes.json();

              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: isUpdate ? 'PUT' : 'POST',
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(requestBody),
                });
                crmData = await crmRes.json();
              }

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id;
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Attendance updated in Zoho CRM' : 'Attendance saved in Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save attendance in Zoho CRM';
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Save Attendance error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Delete Attendance record endpoint
        if (pathname === '/api/zoho/delete-attendance' && (req.method === 'DELETE' || req.method === 'POST')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const record = JSON.parse(body || '{}');
              const zohoId = urlObj.searchParams.get('id') || record.id || record.zohoId;
              if (!zohoId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Missing record ID to delete' }));
              }

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_ATTENDANCE_MODULE_NAME || 'Daily_Attendance';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${zohoId}`;

              let crmRes = await fetch(crmEndpoint, {
                method: 'DELETE',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
              let crmData: any = await crmRes.json();

              if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                });
                crmData = await crmRes.json();
              }

              res.setHeader('Content-Type', 'application/json');
              if (crmData?.data?.[0]?.code === 'SUCCESS') {
                return res.end(JSON.stringify({ success: true, message: 'Attendance record deleted from Zoho CRM' }));
              } else {
                res.statusCode = 400;
                return res.end(JSON.stringify({
                  success: false,
                  message: crmData?.data?.[0]?.message || crmData?.message || 'Failed to delete attendance record from Zoho CRM',
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Delete Attendance error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Fetch / Get Raised Queries / Cases endpoint (Module API Name: Cases)
        if (pathname === '/api/zoho/get-queries' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = 'Cases';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const caseFields = 'id,Case_Number,Subject,Description,Status,Priority,Created_Time,Modified_Time';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${caseFields}&${buildZohoPaginationQuery(urlObj)}`;

            console.log(`[Vite Zoho Plugin] Fetching live Queries from Zoho CRM (${moduleName})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
            });
            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData?.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({ success: true, data: [] }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData?.message || 'Failed to fetch queries from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch Queries error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Insert or Update Query endpoint (Module API Name: Cases)
        if ((pathname === '/api/zoho/insert-query' || pathname === '/api/zoho/update-query') && (req.method === 'POST' || req.method === 'PUT')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const q = JSON.parse(body);
              const isUpdate = Boolean(q.zohoId || pathname === '/api/zoho/update-query');
              const httpMethod = isUpdate ? 'PUT' : 'POST';

              const payload: any = {
                Subject: q.query || q.subject || 'Quality Query',
                Description: q.description || '',
                Status: q.status || 'Open',
                Priority: q.priority || 'Medium',
              };
              if (q.zohoId) payload.id = String(q.zohoId);

              let accessToken = await getAccessToken(env);
              const moduleName = 'Cases';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              let crmRes = await fetch(crmEndpoint, {
                method: httpMethod,
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: [payload] }),
              });
              let crmData: any = await crmRes.json();

              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: httpMethod,
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ data: [payload] }),
                });
                crmData = await crmRes.json();
              }

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS') {
                const zohoId = crmData.data[0].details?.id || q.zohoId;
                return res.end(JSON.stringify({
                  success: true,
                  zohoId,
                  message: isUpdate ? 'Query updated in Zoho CRM' : 'Query inserted into Zoho CRM',
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save query in Zoho CRM';
                return res.end(JSON.stringify({ success: false, message: errMsg, errorDetails: crmData }));
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Delete leave, employee, company, client, deal, quotation, policy, calendar, dsr, query or generic record endpoint (Module API Name: Leave_Management, Employee, Companies, Clients, Deals, Quotations, Company_Policies, Company_Calendar, DSR, Cases, etc.)
        if ((pathname === '/api/zoho/delete-leave' || pathname === '/api/zoho/delete-employee' || pathname === '/api/zoho/delete-company' || pathname === '/api/zoho/delete-client' || pathname === '/api/zoho/delete-deal' || pathname === '/api/zoho/delete-quotation' || pathname === '/api/zoho/delete-policy' || pathname === '/api/zoho/delete-calendar' || pathname === '/api/zoho/delete-dsr' || pathname === '/api/zoho/delete-query' || pathname === '/api/zoho/delete-record') && req.method === 'DELETE') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              let recordId = '';
              let moduleName = 'Quotations';
              if (pathname === '/api/zoho/delete-leave') moduleName = env.VITE_ZOHO_LEAVE_MODULE_NAME || 'Leave_Management';
              else if (pathname === '/api/zoho/delete-employee') moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
              else if (pathname === '/api/zoho/delete-company') moduleName = env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
              else if (pathname === '/api/zoho/delete-client') moduleName = env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
              else if (pathname === '/api/zoho/delete-deal') moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
              else if (pathname === '/api/zoho/delete-quotation') moduleName = env.VITE_ZOHO_MODULE_NAME || 'Quotations';
              else if (pathname === '/api/zoho/delete-policy') moduleName = env.VITE_ZOHO_COMPANY_POLICIES_MODULE_NAME || 'Company_Policies';
              else if (pathname === '/api/zoho/delete-calendar') moduleName = env.VITE_ZOHO_CALENDAR_MODULE_NAME || 'Company_Calendar';
              else if (pathname === '/api/zoho/delete-dsr') moduleName = env.VITE_ZOHO_DSR_MODULE_NAME || 'DSR';

              if (body) {
                try {
                  const parsed = JSON.parse(body);
                  recordId = parsed.id || parsed.zohoId || '';
                  if (parsed.module) moduleName = parsed.module;
                } catch (e) { }
              }
              if (!recordId && req.url) {
                const urlObj = new URL(req.url, 'http://localhost');
                recordId = urlObj.searchParams.get('id') || urlObj.searchParams.get('zohoId') || '';
                if (urlObj.searchParams.get('module')) moduleName = urlObj.searchParams.get('module')!;
              }


              if (!recordId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Record ID is required for deletion.' }));
              }

              let accessToken = await getAccessToken(env);
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?ids=${recordId}`;

              console.log(`[Vite Zoho Plugin] Deleting record in Zoho CRM (${moduleName}): ID #${recordId}`);

              let crmRes = await fetch(crmEndpoint, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              });

              let crmData: any = await crmRes.json();

              // If token expired, force refresh once
              if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                crmRes = await fetch(crmEndpoint, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                });
                crmData = await crmRes.json();
              }

              res.setHeader('Content-Type', 'application/json');
              if (crmData.data?.[0]?.code === 'SUCCESS' || crmData.data?.[0]?.status === 'success') {
                console.log(`[Vite Zoho Plugin] Record #${recordId} deleted successfully from Zoho CRM (${moduleName})!`);
                return res.end(JSON.stringify({
                  success: true,
                  zohoId: recordId,
                  message: `${moduleName} record deleted successfully from Zoho CRM`,
                  data: crmData.data[0],
                }));
              } else {
                res.statusCode = 400;
                const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to delete record in Zoho CRM';
                console.error('[Vite Zoho Plugin] Zoho CRM delete error:', errMsg, crmData);
                return res.end(JSON.stringify({
                  success: false,
                  message: errMsg,
                  errorDetails: crmData,
                }));
              }
            } catch (err: any) {
              console.error('[Vite Zoho Plugin] Delete server error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        // Get / List Attachments endpoint (v8 Attachments API)
        // e.g. GET /api/zoho/get-attachments?module=Deals&recordId=1078476000025109014
        if (pathname === '/api/zoho/get-attachments' && req.method === 'GET') {
          try {
            const recordId = urlObj.searchParams.get('recordId') || urlObj.searchParams.get('id') || urlObj.searchParams.get('deal_id') || '';
            const moduleName = urlObj.searchParams.get('module') || 'Deals';

            if (!recordId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: 'recordId is required to fetch attachments' }));
            }

            let accessToken = await getAccessToken(env);
            const domain = env.VITE_ZOHO_DOMAIN || 'in';
            const apiBase = env.VITE_ZOHO_API_URL || (domain === 'com' ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');
            const fieldsParam = urlObj.searchParams.get('fields') || 'id,File_Name,Size,Created_Time,Created_By,Modified_Time,$file_id,$type';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/Attachments?fields=${fieldsParam}`;

            console.log(`[Vite Zoho Plugin] Fetching attachments for ${moduleName} ID: ${recordId}`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            if (crmRes.status === 204) {
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, data: [] }));
            }

            let crmData: any = await crmRes.json();

            if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
              if (crmRes.status === 204) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, data: [] }));
              }
              crmData = await crmRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (crmData.data) {
              return res.end(JSON.stringify({
                success: true,
                data: crmData.data,
                info: crmData.info,
              }));
            } else if (crmData.code === 'NO_CONTENT' || crmData.code === 'RECORD_NOT_FOUND') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData.message || 'Failed to fetch attachments from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Get attachments server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Download / Stream Attachment endpoint (v8 Attachments API)
        // e.g. GET /api/zoho/download-attachment?module=Deals&recordId=1078476000025109014&attachmentId=1078476000025121469
        if (pathname === '/api/zoho/download-attachment' && req.method === 'GET') {
          try {
            const recordId = urlObj.searchParams.get('recordId') || urlObj.searchParams.get('id') || '';
            const attachmentId = urlObj.searchParams.get('attachmentId') || urlObj.searchParams.get('attId') || '';
            const moduleName = urlObj.searchParams.get('module') || 'Deals';
            const isPreview = urlObj.searchParams.get('preview') === 'true';

            if (!recordId || !attachmentId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: 'Both "recordId" and "attachmentId" are required' }));
            }

            let accessToken = await getAccessToken(env);
            const domain = env.VITE_ZOHO_DOMAIN || 'in';
            const apiBase = env.VITE_ZOHO_API_URL || (domain === 'com' ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/Attachments/${attachmentId}`;

            console.log(`[Vite Zoho Plugin] Downloading attachment ${attachmentId} from ${moduleName} ${recordId}`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            if (crmRes.status === 401) {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
              });
            }

            if (!crmRes.ok) {
              const errText = await crmRes.text();
              res.statusCode = crmRes.status;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: 'Failed to download attachment from Zoho CRM', details: errText }));
            }

            const contentType = crmRes.headers.get('content-type') || 'application/octet-stream';
            const contentDisp = crmRes.headers.get('content-disposition') || (isPreview ? 'inline' : `attachment; filename="attachment-${attachmentId}"`);
            const contentLength = crmRes.headers.get('content-length');

            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', isPreview ? 'inline' : contentDisp);
            if (contentLength) res.setHeader('Content-Length', contentLength);
            res.setHeader('Cache-Control', 'public, max-age=3600');

            const arrayBuf = await crmRes.arrayBuffer();
            return res.end(Buffer.from(arrayBuf));
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Download attachment server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Upload attachment endpoint (v8 Attachments API)
        // e.g. POST https://www.zohoapis.com/crm/v8/Leads/{recordId}/Attachments or Quotations/{recordId}/Attachments
        if (pathname === '/api/zoho/upload-attachment' && req.method === 'POST') {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const buffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';

            const webReq = new Request('http://localhost' + req.url, {
              method: 'POST',
              headers: {
                'content-type': contentType,
              },
              body: buffer,
            });

            const formData = await webReq.formData();
            const file = formData.get('file') as File | null;
            const recordId = (formData.get('recordId') as string) || '';
            const moduleName = (formData.get('module') as string) || env.VITE_ZOHO_MODULE_NAME || 'Quotations';

            if (!file || !recordId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: false,
                message: 'Both "file" and "recordId" are required to attach a document.',
              }));
            }

            let accessToken = await getAccessToken(env);
            const domain = env.VITE_ZOHO_DOMAIN || 'in';
            const apiBase = env.VITE_ZOHO_API_URL || (domain === 'com' ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');
            const crmAttachmentEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/Attachments`;

            console.log(`[Vite Zoho Plugin] Uploading attachment (${file.name}) to: ${crmAttachmentEndpoint}`);

            const zohoForm = new FormData();
            zohoForm.append('file', file, file.name);

            let attachRes = await fetch(crmAttachmentEndpoint, {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
              body: zohoForm,
            });

            let attachData: any = await attachRes.json();

            // If token expired, force refresh once
            if (attachRes.status === 401 || attachData.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              attachRes = await fetch(crmAttachmentEndpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
                body: zohoForm,
              });
              attachData = await attachRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (attachData.data?.[0]?.code === 'SUCCESS') {
              const attachmentId = attachData.data[0].details?.id;
              console.log('[Vite Zoho Plugin] Attachment uploaded successfully! ID:', attachmentId);
              return res.end(JSON.stringify({
                success: true,
                attachmentId,
                message: 'Attachment uploaded successfully to Zoho CRM',
                data: attachData.data[0],
              }));
            } else {
              res.statusCode = 400;
              const errMsg = attachData.data?.[0]?.message || attachData.message || 'Failed to upload attachment in Zoho CRM';
              console.error('[Vite Zoho Plugin] Attachment upload failed:', errMsg, attachData);
              return res.end(JSON.stringify({
                success: false,
                message: errMsg,
                errorDetails: attachData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Attachment server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // --- DEV ENDPOINT: /api/send-otp ---
        if ((pathname === '/api/send-otp' || req.url?.startsWith('/api/send-otp')) && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const { toEmail, empName, otpCode } = JSON.parse(body || '{}');
              const env = loadEnv('development', process.cwd(), '');
              const host = env.SMTP_HOST || 'smtp.gmail.com';
              const port = parseInt(env.SMTP_PORT || '465', 10);
              const secure = port === 465 || env.SMTP_SECURE === 'true';
              const user = env.SMTP_USER || 'testerbemain@gmail.com';
              const pass = env.SMTP_PASS || 'qyquibvuwwefczsy';
              const from = env.SMTP_FROM || `"BharatEdge Support" <${user}>`;

              const transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: { user, pass }
              });

              const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px;">
                  <div style="background: #ea580c; padding: 20px; text-align: center; border-radius: 12px; color: #fff;">
                    <h2 style="margin: 0;">BharatEdge Portal</h2>
                  </div>
                  <div style="padding: 20px 0;">
                    <p>Hello <strong>${empName || 'Team Member'}</strong>,</p>
                    <p>Your 6-digit verification code to activate your account or set your password is:</p>
                    <div style="background: #fff7ed; border: 2px dashed #ea580c; border-radius: 12px; padding: 15px; text-align: center; margin: 20px 0;">
                      <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #ea580c; font-family: monospace;">${otpCode}</span>
                    </div>
                    <p style="font-size: 12px; color: #64748b;">⏱️ This code is valid for 5 minutes. Do not share it with anyone.</p>
                  </div>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
                    Sent automatically from BharatEdge Support
                  </div>
                </div>
              `;

              const info = await transporter.sendMail({
                from,
                to: toEmail,
                subject: `Your BharatEdge Portal Verification Code: ${otpCode}`,
                text: `Hello ${empName || 'Team Member'},\n\nYour verification code is: ${otpCode}\n\nValid for 5 minutes.`,
                html: htmlContent
              });

              console.log('[Dev Nodemailer] OTP sent to:', toEmail, 'MessageId:', info.messageId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, messageId: info.messageId, recipient: toEmail }));
            } catch (err: any) {
              console.error('[Dev Nodemailer] Error sending OTP:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), zohoApiPlugin()],
})
