import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'
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

  async function getAccessToken(env?: Record<string, string>): Promise<string> {
    const e = env || loadEnv('development', process.cwd(), '');
    const clientId = e.VITE_ZOHO_CLIENT_ID || '1000.ENHQL8XIKM7Q7AO7PGPY1EUICG80QF';
    const clientSecret = e.VITE_ZOHO_CLIENT_SECRET || 'c5659d87156496be12bea1489a7a2f4500c7241131';
    let refreshToken = e.VITE_ZOHO_REFRESH_TOKEN || '';
    if (!refreshToken || refreshToken.includes('bdf58bb945')) {
      refreshToken = '1000.b141fe7e5414313d6b2ba2744c90c4fe.dc33224ff49bf2843512fbe58dce982c';
    }

    const now = Date.now();
    if (cachedToken && tokenExpiry > now + 60000) {
      return cachedToken;
    }

    try {
      const tokenPath = path.resolve(process.cwd(), 'data', '.zoho_token.json');
      if (fs.existsSync(tokenPath)) {
        const diskToken = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        if (diskToken?.token && diskToken.expiry > now + 60000) {
          cachedToken = diskToken.token;
          tokenExpiry = diskToken.expiry;
          return String(diskToken.token);
        }
      }
    } catch (_) {}

    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });

    const accountsUrl = e.VITE_ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
    const tokenUrl = `${accountsUrl}/oauth/v2/token?${params.toString()}`;
    const res = await fetch(tokenUrl, { method: 'POST' });
    const data: any = await res.json();

    if (!data.access_token) {
      throw new Error(data.error_description || data.error || data.message || 'Failed to obtain access token from Zoho');
    }

    const token: string = data.access_token;
    cachedToken = token;
    tokenExpiry = now + (Number(data.expires_in) || 3600) * 1000;
    try {
      const tokenPath = path.resolve(process.cwd(), 'data', '.zoho_token.json');
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, JSON.stringify({ token: cachedToken, expiry: tokenExpiry }));
    } catch (_) {}
    return token;
  }

  interface CachedEmployeeRecord {
    id: string;
    Name?: string;
    Middle_Name?: string;
    Last_Name?: string;
    Employment_ID?: string;
    Personal_Email_Address?: string;
    Email?: string;
    Password?: string | null;
    System_Role?: string;
    Department?: string;
    Designation_Job_Title?: string;
    Who_is_the_Team_Leader_TL?: string;
    Reporting_Manager?: string;
    Contact_Number?: string;
    [key: string]: any;
  }

  let cachedEmployeeList: CachedEmployeeRecord[] | null = null;
  let cachedEmployeeListExpiry = 0;

  function matchesEmployeeQuery(emp: any, query: string): boolean {
    if (!emp || !query) return false;
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ) return false;
    const qWithoutEmp = cleanQ.replace(/^emp[-_\s]*/i, '');
    const qNum = parseInt(qWithoutEmp, 10);

    const empEmail = (emp.Email || '').trim().toLowerCase();
    const empPersonal = (emp.Personal_Email_Address || '').trim().toLowerCase();
    const empIdStr = String(emp.Employment_ID || '').trim().toLowerCase();
    const empIdWithoutEmp = empIdStr.replace(/^emp[-_\s]*/i, '');
    const zohoRecordId = String(emp.id || emp.zohoId || '').trim();

    // 1. Direct email or personal email exact match
    if (empEmail === cleanQ || empPersonal === cleanQ) return true;

    // 2. Email domain-agnostic prefix match (e.g. sirjan@bharat-edge.com vs sirjan@bharatedgedigital.com vs sirjan@bharatedge.in)
    if (cleanQ.includes('@') && (empEmail.includes('@') || empPersonal.includes('@'))) {
      const qPrefix = cleanQ.split('@')[0];
      const empEmailPrefix = empEmail.split('@')[0];
      const empPersonalPrefix = empPersonal.split('@')[0];
      if (qPrefix === empEmailPrefix || qPrefix === empPersonalPrefix) return true;
    }

    // 3. Username prefix match if query doesn't have @ (e.g. user typed "sirjan")
    if (!cleanQ.includes('@')) {
      if (empEmail && empEmail.split('@')[0] === cleanQ) return true;
      if (empPersonal && empPersonal.split('@')[0] === cleanQ) return true;
    }

    // 4. Employment ID match (flexible: with or without EMP-, numeric)
    if (cleanQ === empIdStr || qWithoutEmp === empIdWithoutEmp) return true;
    if (!isNaN(qNum) && parseInt(empIdWithoutEmp, 10) === qNum) return true;
    if (cleanQ === zohoRecordId) return true;

    // 5. Name matching
    const firstName = (emp.Name || '').trim().toLowerCase();
    const middleName = (emp.Middle_Name || '').trim().toLowerCase();
    const lastName = (emp.Last_Name || '').trim().toLowerCase();
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const firstLast = [firstName, lastName].filter(Boolean).join(' ');

    if (cleanQ === firstName || cleanQ === fullName || cleanQ === firstLast) return true;
    if (cleanQ.length >= 3 && (fullName.includes(cleanQ) || cleanQ.includes(fullName))) return true;

    return false;
  }

  async function getCachedEmployeeRecords(envRecord?: Record<string, string>, forceRefresh = false): Promise<CachedEmployeeRecord[]> {
    const now = Date.now();
    if (!forceRefresh && cachedEmployeeList && cachedEmployeeListExpiry > now && cachedEmployeeList.length > 0) {
      return cachedEmployeeList;
    }

    try {
      const e = envRecord || loadEnv('development', process.cwd(), '');
      const accessToken = await getAccessToken(e);
      const moduleName = e.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
      const apiBase = e.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
      const employeeFields = 'id,Name,Middle_Name,Last_Name,Employment_ID,Personal_Email_Address,Email,Password,System_Role,Department,Designation_Job_Title,Who_is_the_Team_Leader_TL,Reporting_Manager,Contact_Number';

      const listUrl = `${apiBase}/crm/v8/${moduleName}?fields=${employeeFields}&per_page=200`;
      let res = await fetch(listUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
      });

      if (res.status === 401) {
        cachedToken = null;
        const newToken = await getAccessToken(e);
        res = await fetch(listUrl, {
          headers: { Authorization: `Zoho-oauthtoken ${newToken}` }
        });
      }

      if (res.status === 200) {
        const data: any = await res.json();
        if (Array.isArray(data?.data)) {
          cachedEmployeeList = data.data;
          cachedEmployeeListExpiry = now + 2 * 60 * 1000; // 2 minutes cache
          return cachedEmployeeList!;
        }
      }
    } catch (err) {
      console.warn('[Vite Zoho Plugin] getCachedEmployeeRecords error:', err);
    }

    return cachedEmployeeList || [];
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

  function isDealStageAtOrPastTransition(transitionId: string, currentStageLower: string): boolean {
    if (!currentStageLower) return false;
    const s = currentStageLower.trim().toLowerCase();
    // 1. Sales to Account ("1078476000000489153")
    if (transitionId === '1078476000000489153') {
      return (
        s.includes('account') ||
        s.includes('legal') ||
        s.includes('allocat') ||
        s.includes('execut') ||
        s.includes('quality') ||
        s.includes('won') ||
        s.includes('completed')
      );
    }
    // 2. Account to Legal ("1078476000000492001")
    if (transitionId === '1078476000000492001') {
      return (
        s.includes('legal') ||
        s.includes('allocat') ||
        s.includes('execut') ||
        s.includes('quality') ||
        s.includes('won') ||
        s.includes('completed')
      );
    }
    // 3. Legal to Operations Allocator ("1078476000000492099")
    if (transitionId === '1078476000000492099') {
      return (
        s.includes('allocat') ||
        s.includes('execut') ||
        s.includes('quality') ||
        s.includes('won') ||
        s.includes('completed')
      );
    }
    // 4. Operations Allocator to Operations Executors ("1078476000001938757")
    if (transitionId === '1078476000001938757') {
      return (
        s.includes('execut') ||
        s.includes('quality') ||
        s.includes('won') ||
        s.includes('completed')
      );
    }
    // 5. Send to Quality ("1078476000000492289")
    if (transitionId === '1078476000000492289') {
      return (
        s.includes('quality') ||
        s.includes('won') ||
        s.includes('completed')
      );
    }
    return false;
  }

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

      const resText = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = resText ? JSON.parse(resText) : {};
      } catch {
        data = { message: resText };
      }
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

  // October 2026 Filter Constants for CRM REST API
  // Note: Zoho CRM standard Deals module does NOT support criteria search on Created_Time.
  // Deals uses Booking_Date. Other custom CRM modules (Quotations, Companies, Clients, Operation_Internal_CRM) use Created_Time.
  const OCTOBER_2026_CRITERIA = '(Created_Time:greater_equal:2026-10-01T00:00:00+05:30)';
  const OCTOBER_2026_DEALS_CRITERIA = '(Booking_Date:greater_equal:2026-10-01)';
  const OCTOBER_2026_START_MS = new Date('2026-10-01T00:00:00+05:30').getTime();

  function combineWithOctoberFilter(existingCriteria?: string | null, moduleName?: string): string {
    const isDeals = String(moduleName || '').toLowerCase().includes('deal');
    const targetCrit = isDeals ? OCTOBER_2026_DEALS_CRITERIA : OCTOBER_2026_CRITERIA;
    if (!existingCriteria || !existingCriteria.trim()) {
      return targetCrit;
    }
    const trimmed = existingCriteria.trim();
    if (isDeals && (trimmed.includes('Booking_Date:greater_equal:2026-10-01') || trimmed.includes('Booking_Date:greater_equal:'))) {
      return trimmed;
    }
    if (!isDeals && trimmed.includes('Created_Time:greater_equal:2026-10-01')) {
      return trimmed;
    }
    const wrapped = trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed : `(${trimmed})`;
    return `((${targetCrit})and${wrapped})`;
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

    const billingAddress = fd.Billing_address || fd.billingAddress || quotation.Billing_address || quotation.billingAddress;
    if (billingAddress) {
      payload.Billing_address = billingAddress;
    }
    const companyAddress = fd.Company_address || fd.companyAddress || quotation.Company_address || quotation.companyAddress;
    if (companyAddress) {
      payload.Company_address = companyAddress;
    }

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

    const quotationNotes = quotation.Q_Notes || quotation.q_notes || fd.Q_Notes || fd.q_notes || quotation.notes || quotation.Notes || fd.notes || fd.Notes || quotation.remark || fd.remark || quotation.Remark || fd.Remark || quotation.Description || '';
    if (quotationNotes) {
      payload.Q_Notes = quotationNotes;
      payload.Notes = quotationNotes;
      payload.Remark = quotationNotes;
      payload.Remarks = quotationNotes;
      payload.Description = quotationNotes;
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
    let cleanId = String(dealZohoId || '').trim();
    if (!cleanId) return;

    // If cleanId is not a numeric record ID (e.g. DL-2906), search Zoho CRM for the deal
    if (!/^\d{15,}$/.test(cleanId)) {
      try {
        const sRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Deal_Name`, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        if (sRes.ok) {
          const sData: any = await sRes.json();
          const list: any[] = sData.data || [];
          const matched = list.find((d: any) => 
            String(d.id) === cleanId || 
            (cleanId && String(d.Deal_Name || '').toUpperCase().includes(cleanId.toUpperCase()))
          );
          if (matched?.id) {
            cleanId = String(matched.id);
            payload.id = cleanId;
          }
        }
      } catch (sErr) {
        console.warn('[Vite Zoho Plugin] Deal search for reconciliation failed:', sErr);
      }
    }

    if (!cleanId || !/^\d{15,}$/.test(cleanId)) return;

    try {
      const fetchUrl = `${apiBase}/crm/v8/${moduleName}/${cleanId}?fields=Subform_1,Legal`;
      let res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
        },
      });
      if (res.status === 401) {
        accessToken = await getAccessToken();
        res = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
        });
      }
      if (!res.ok) {
        console.warn(`[Vite Zoho Plugin] Failed to fetch existing deal #${cleanId} for subform reconciliation: status ${res.status}`);
        return;
      }
      const json: any = await res.json();
      const existing = json?.data?.[0];
      if (!existing) return;

      // 1. Reconcile Subform_1 (Choose services)
      if (Array.isArray(payload.Subform_1) && payload.Subform_1.length > 0) {
        const existingSubform = Array.isArray(existing.Subform_1) ? existing.Subform_1 : [];
        const usedIds = new Set<string>();

        // Ensure payload.Subform_1 contains strictly at most 1 item per unique service schema
        const seenPayloadSchemas = new Set<string>();
        payload.Subform_1 = payload.Subform_1.filter((item: any) => {
          const sKey = (item.Schemas || item.Schema || item.name || 'Website Development').trim().toLowerCase();
          if (seenPayloadSchemas.has(sKey)) return false;
          seenPayloadSchemas.add(sKey);
          return true;
        });

        payload.Subform_1 = payload.Subform_1.map((item: any, idx: number) => {
          const itemSchema = (item.Schemas || item.Schema || item.name || '').trim().toLowerCase();

          // If item already has a valid ID that belongs to this existing deal, use it
          if (item.id && /^\d{15,}$/.test(String(item.id)) && existingSubform.some((ex: any) => String(ex.id) === String(item.id))) {
            usedIds.add(String(item.id));
            return item;
          }

          // Otherwise match by schema name against an unused row in existingSubform
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

        // Mark ALL remaining existing rows in Zoho CRM (duplicates or old rows) for deletion
        for (const ex of existingSubform) {
          if (ex.id && /^\d{15,}$/.test(String(ex.id)) && !usedIds.has(String(ex.id))) {
            payload.Subform_1.push({
              id: String(ex.id),
              _delete: null,
            });
          }
        }
      } else if (!payload.Subform_1 && Array.isArray(existing.Subform_1) && existing.Subform_1.length > 1) {
        // If payload did not specify Subform_1, but existingSubform in Zoho CRM has duplicate rows, clean duplicates
        const seenSf = new Set<string>();
        const toDelete: any[] = [];
        for (const ex of existing.Subform_1) {
          const sKey = (ex.Schemas || ex.Schema || '').trim().toLowerCase();
          if (sKey && seenSf.has(sKey) && ex.id) {
            toDelete.push({ id: String(ex.id), _delete: null });
          } else if (sKey) {
            seenSf.add(sKey);
          }
        }
        if (toDelete.length > 0) {
          payload.Subform_1 = toDelete;
        }
      }

      // 2. Reconcile Legal Subform
      if (Array.isArray(payload.Legal) && payload.Legal.length > 0) {
        const existingLegal = Array.isArray(existing.Legal) ? existing.Legal : [];
        const usedLegalIds = new Set<string>();

        // Ensure payload.Legal contains strictly at most 1 item per unique legal schema
        const seenPayloadLegal = new Set<string>();
        payload.Legal = payload.Legal.filter((item: any) => {
          const lKey = (item.Legal_Schemas || item.schema || item.Schemas || 'General Services').trim().toLowerCase();
          if (seenPayloadLegal.has(lKey)) return false;
          seenPayloadLegal.add(lKey);
          return true;
        });

        payload.Legal = payload.Legal.map((item: any, idx: number) => {
          const itemSchema = (item.Legal_Schemas || item.schema || item.Schemas || '').trim().toLowerCase();

          // If item already has a valid ID that belongs to this existing deal, use it
          if (item.id && /^\d{15,}$/.test(String(item.id)) && existingLegal.some((ex: any) => String(ex.id) === String(item.id))) {
            usedLegalIds.add(String(item.id));
            return item;
          }

          // Otherwise match by schema name against an unused row in existingLegal
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

        // Mark ALL remaining existing rows in Zoho CRM (duplicates or old rows) for deletion
        for (const ex of existingLegal) {
          if (ex.id && /^\d{15,}$/.test(String(ex.id)) && !usedLegalIds.has(String(ex.id))) {
            payload.Legal.push({
              id: String(ex.id),
              _delete: null,
            });
          }
        }
      } else if (!payload.Legal && Array.isArray(existing.Legal) && existing.Legal.length > 1) {
        // If payload did not specify Legal, but existingLegal in Zoho CRM has duplicate rows, clean duplicates
        const seenLg = new Set<string>();
        const toDelete: any[] = [];
        for (const ex of existing.Legal) {
          const lKey = (ex.Legal_Schemas || ex.Schemas || '').trim().toLowerCase();
          if (lKey && seenLg.has(lKey) && ex.id) {
            toDelete.push({ id: String(ex.id), _delete: null });
          } else if (lKey) {
            seenLg.add(lKey);
          }
        }
        if (toDelete.length > 0) {
          payload.Legal = toDelete;
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

    const servicesDisbursementSum = servicesData.reduce((sum: number, s: any) => {
      const v = s.amountAfterDisbursement !== undefined && s.amountAfterDisbursement !== ''
        ? Number(s.amountAfterDisbursement)
        : (s.amount_if_you_have_kindly_put_0 !== undefined ? Number(s.amount_if_you_have_kindly_put_0) : 0);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    const hasExplicitDisbursement = servicesData.some((s: any) => s.amountAfterDisbursement !== undefined && s.amountAfterDisbursement !== '');
    const disbursementNum = hasExplicitDisbursement
      ? servicesDisbursementSum
      : (deal.amount_if_you_have_kindly_put_0 !== undefined ? Number(deal.amount_if_you_have_kindly_put_0) : 0);

    const todayDate = new Date().toISOString().split('T')[0];
    const bookingDate = formatDateForZoho(deal.date || deal.bookingDate) || todayDate;
    const paymentDate = formatDateForZoho(deal.Payment_Date || deal.paymentDate || deal.payment_date || deal.date || deal.bookingDate) || bookingDate;

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
      Amount_After_disbursement: disbursementNum,
      Deal_Pending_Amount: pendingAmountNum,
      Total_Pending_Amount: pendingAmountNum,
      Pending_amount: pendingAmountNum,
      amount_if_you_have_kindly_put_0: disbursementNum,
      Payment_Date: paymentDate,
      Booking_Date: bookingDate,
      Sales_date: bookingDate,
      Account_date: bookingDate,
      CRM_date: bookingDate,
      CRM_filled: true,
      CRM_filled_date: bookingDate,
      Payment_received_date: paymentDate,
      Payment_Type: 'Online',
    };

    // Only set Closing_Date if explicitly provided (e.g. for R1 milestone payment update), never on fresh deal creation
    if (deal.Closing_Date || deal.closingDate) {
      const explicitClosing = formatDateForZoho(deal.Closing_Date || deal.closingDate);
      if (explicitClosing) {
        payload.Closing_Date = explicitClosing;
      }
    }

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
    const billAddr = fd.Billing_address || fd.billingAddress || deal.Billing_address || deal.billingAddress || fullAddress;
    if (billAddr) {
      payload.Billing_address = billAddr;
    }
    const compAddr = fd.Company_address || fd.companyAddress || deal.Company_address || deal.companyAddress || fullAddress;
    if (compAddr) {
      payload.Company_address = compAddr;
    }
    if (fd.state) {
      payload.State = fd.state;
    }

    // Services Overview & Subform_1 (API Name: Subform_1)
    if (Array.isArray(servicesData) && servicesData.length > 0) {
      const seenSvc = new Set<string>();
      const deduplicatedServices = servicesData.filter((s: any) => {
        const nameKey = (s.name || s.Schemas || s.Service_Name || deal.service || fd.service || 'Website Development').trim().toLowerCase();
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

        const svcDisbursement = svc.amountAfterDisbursement !== undefined && svc.amountAfterDisbursement !== ''
          ? Number(svc.amountAfterDisbursement)
          : (svc.amount_if_you_have_kindly_put_0 !== undefined && svc.amount_if_you_have_kindly_put_0 !== ''
            ? Number(svc.amount_if_you_have_kindly_put_0)
            : (svc.Amount_After_disbursement !== undefined && svc.Amount_After_disbursement !== '' ? Number(svc.Amount_After_disbursement) : undefined));

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
          Success_fees: svc.successFees || svc.Success_fees || '',
          ...(svcDisbursement !== undefined ? {
            amount_if_you_have_kindly_put_0: svcDisbursement,
            Amount_After_disbursement: svcDisbursement,
          } : {}),
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
      const deduplicatedLegal = rawLegalData.filter((lg: any, idx: number) => {
        const schemaKey = (lg.Legal_Schemas || lg.schema || lg.Schemas || payload.Subform_1?.[idx]?.Schemas || 'General Services').trim().toLowerCase();
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
    const isUpdate = Boolean(deal.zohoId || deal.isUpdate || deal.isPartial);
    const bankDetailsVal = deal.Bank_details ?? deal.bankDetails ?? fd.bankDetails ?? fd.Bank_details ?? null;
    if (bankDetailsVal === 'None' || bankDetailsVal === '-None-' || bankDetailsVal === '' || bankDetailsVal === null) {
      if (isUpdate) {
        payload.Bank_details = null;
      }
    } else {
      payload.Bank_details = String(bankDetailsVal).trim();
    }
    if (deal.Accounts_remark !== undefined || deal.accountsRemark !== undefined || fd.accountsRemark !== undefined || fd.Accounts_remark !== undefined) {
      payload.Accounts_remark = deal.Accounts_remark ?? deal.accountsRemark ?? fd.accountsRemark ?? fd.Accounts_remark ?? '';
    }
    const dealRemark = deal.Q_Notes || deal.q_notes || fd.Q_Notes || fd.q_notes || deal.notes || deal.Notes || deal.remark || deal.Remark || deal.remarks || deal.Remarks || fd.notes || fd.Notes || fd.remark || fd.Remark || fd.remarks || fd.Remarks || '';
    if (dealRemark) {
      payload.Q_Notes = dealRemark;
      payload.Remark = dealRemark;
      payload.Remarks = dealRemark;
      payload.Description = dealRemark;
      payload.remark = dealRemark;
      payload.Notes = dealRemark;
    }
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

  // 8-Milestone Payment Slots (R1 to R8) mapping to Zoho CRM API names
  const rPaymentSlots = [
    { amt: 'R1_Received_amount23', date: 'Closing_Date', bdm1: 'R1_Received_by_BDM1', bdm2: 'R1_Received_by_BDM2' },
    { amt: 'R2_Received_amount12', date: 'DPR_status_change_date', bdm1: 'R2_Received_by_BDM1', bdm2: 'R2_Received_by_BDM2' },
    { amt: 'R3_Received_amount', date: 'Date_of_status_change', bdm1: 'R3_Received_by_BDM1', bdm2: 'R3_Received_by_BDM2' },
    { amt: 'R4_Received_amount', date: 'Date_of_status_change_f', bdm1: 'R4_Received_by_BDM1', bdm2: 'R4_Received_by_BDM2' },
    { amt: 'R5_Received_amount', date: 'Document_collection_Pitch_deck_creation_DPR_date', bdm1: 'R5_Received_by_BDM1', bdm2: 'R5_Received_by_BDM2' },
    { amt: 'R6_Received_amount', date: 'Document_sent_date', bdm1: 'R6_Received_BDM1', bdm2: 'R6_Received_BDM2' },
    { amt: 'R7_Received_amount', date: 'Finance_status_change_date', bdm1: 'R7_Received_by_BDM1', bdm2: 'R7_Received_by_BDM2' },
    { amt: 'R8_Received_amount', date: 'Date_of_financedate_change', bdm1: 'R8_Received_by_BDM1', bdm2: 'R8_Received_by_BDM2' },
  ];

  for (let idx = 0; idx < rPaymentSlots.length; idx++) {
    const s = rPaymentSlots[idx];
    const slotNum = idx + 1;
    const rawAmt = deal[s.amt] ?? fd[s.amt] ?? deal.rawZohoDeal?.[s.amt] ??
                   deal[`R${slotNum}_Received_Amount`] ?? deal[`R${slotNum}_Received_amount`] ??
                   deal.rPaymentSlots?.[slotNum]?.amount;
    const hasAmt = rawAmt !== undefined && rawAmt !== null && String(rawAmt).trim() !== '' && Number(String(rawAmt).replace(/[^0-9.]/g, '')) > 0;
    if (hasAmt) {
      const cleanAmt = String(rawAmt).trim();
      payload[s.amt] = cleanAmt;
      if (slotNum === 1) payload.R1_Received_Amount = cleanAmt;
      if (slotNum === 2) payload.R2_Received_Amount = cleanAmt;

      const rawDate = deal[s.date] ?? fd[s.date] ?? deal.rawZohoDeal?.[s.date] ??
                      deal[`R${slotNum}_Payment_Date`] ?? deal.rPaymentSlots?.[slotNum]?.date;
      if (rawDate) {
        const fDate = formatDateForZoho(rawDate);
        if (fDate) {
          payload[s.date] = fDate;
          if (slotNum === 1) payload.R1_Payment_Date = fDate;
          if (slotNum === 2) payload.R2_Payment_Date = fDate;
        }
      }

      const rawBdm1 = deal[s.bdm1] ?? fd[s.bdm1] ?? deal.rawZohoDeal?.[s.bdm1] ??
                      deal[`R${slotNum}_Received_by_BDM1`] ?? deal[`R${slotNum}_Received_BDM1`] ??
                      deal.rPaymentSlots?.[slotNum]?.bdm1Name;
      if (rawBdm1 && String(rawBdm1).trim() !== '') {
        const cleanBdm1 = String(rawBdm1).trim();
        payload[s.bdm1] = cleanBdm1;
        if (slotNum === 6) {
          payload.R6_Received_BDM1 = cleanBdm1;
          payload.R6_Received_by_BDM1 = cleanBdm1;
        }
      }

      const rawBdm2 = deal[s.bdm2] ?? fd[s.bdm2] ?? deal.rawZohoDeal?.[s.bdm2] ??
                      deal[`R${slotNum}_Received_by_BDM2`] ?? deal[`R${slotNum}_Received_BDM2`] ??
                      deal.rPaymentSlots?.[slotNum]?.bdm2Name;
      if (rawBdm2 && String(rawBdm2).trim() !== '' && String(rawBdm2).toLowerCase() !== 'none') {
        const cleanBdm2 = String(rawBdm2).trim();
        payload[s.bdm2] = cleanBdm2;
        if (slotNum === 6) {
          payload.R6_Received_BDM2 = cleanBdm2;
          payload.R6_Received_by_BDM2 = cleanBdm2;
        }
      }
    } else if (deal[s.amt] === '' || deal[s.amt] === null || fd[s.amt] === '' || fd[s.amt] === null) {
      // Explicitly cleared slot
      payload[s.amt] = null;
      if (slotNum === 1) payload.R1_Received_Amount = null;
      if (slotNum === 2) payload.R2_Received_Amount = null;
      if (s.date !== 'Closing_Date') {
        payload[s.date] = null;
        if (slotNum === 2) payload.R2_Payment_Date = null;
      }
      payload[s.bdm1] = null;
      payload[s.bdm2] = null;
    }
  }

  // Milestone Payment Verifications & Bank Types (R1 to R8)
  for (let i = 1; i <= 8; i++) {
    const verifVal = deal[`R${i}_Payment_Verification`] ?? fd[`R${i}_Payment_Verification`] ?? deal.rawZohoDeal?.[`R${i}_Payment_Verification`] ?? deal.rPaymentSlots?.[i]?.isVerified;
    if (verifVal !== undefined && verifVal !== null) {
      payload[`R${i}_Payment_Verification`] = Boolean(verifVal === true || verifVal === 'true');
      if (i === 1) payload.R1_Payment_verifications = Boolean(verifVal === true || verifVal === 'true');
      if (i === 2) payload.R2_Payment_verifications = Boolean(verifVal === true || verifVal === 'true');
    }
    const bankVal = deal[`R${i}_Bank_type`] ?? fd[`R${i}_Bank_type`] ?? deal.rawZohoDeal?.[`R${i}_Bank_type`] ?? deal.rPaymentSlots?.[i]?.bankType;
    if (bankVal !== undefined && bankVal !== null && String(bankVal).trim() !== '') {
      payload[`R${i}_Bank_type`] = String(bankVal).trim();
      if (i === 1) payload.R1_Bank_details = String(bankVal).trim();
      if (i === 2) payload.R2_Bank_details = String(bankVal).trim();
    }
    const legalVal = deal[`R${i}_Legal_verification`] ?? fd[`R${i}_Legal_verification`] ?? deal.rawZohoDeal?.[`R${i}_Legal_verification`] ?? deal.rPaymentSlots?.[i]?.isLegalVerified;
    if (legalVal !== undefined && legalVal !== null) {
      payload[`R${i}_Legal_verification`] = Boolean(legalVal === true || legalVal === 'true');
    }
  }

  if (payload.BDM_names) {
    if (typeof payload.BDM_names === 'string' || !payload.BDM_names.id || !/^\d{15,}$/.test(String(payload.BDM_names.id))) {
      delete payload.BDM_names;
    }
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

        // Fetch / Get Single Quotation endpoint (returns full record with Services_And_Pricing subform)
        if ((pathname === '/api/zoho/get-quotation' || (pathname === '/api/zoho/get-quotations' && (urlObj.searchParams.get('id') || urlObj.searchParams.get('quotation_id')))) && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_MODULE_NAME || 'Quotations';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const rawQId = urlObj.searchParams.get('id') || urlObj.searchParams.get('quotation_id') || '';
            let targetId = String(rawQId).trim();
            const isNumeric = /^\d{15,}$/.test(targetId);
            if (!isNumeric && targetId) {
              try {
                const sRes = await fetch(`${apiBase}/crm/v8/${moduleName}/search?criteria=(Name:contains:${encodeURIComponent(targetId)})`, {
                  method: 'GET',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                });
                const sData: any = await sRes.json();
                if (sData.data && sData.data.length > 0 && sData.data[0].id) {
                  targetId = String(sData.data[0].id);
                }
              } catch (_) {}
            }
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${targetId}`;

            console.log(`[Vite Zoho Plugin] Fetching single Quotation from Zoho CRM (${moduleName}/${targetId})`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            let crmData: any = await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
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
              return res.end(JSON.stringify({ success: true, data: crmData.data }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, message: crmData.message || 'Failed to fetch quotation from Zoho CRM', errorDetails: crmData }));
            }
          } catch (e: any) {
            console.error('[Vite Zoho Plugin] Exception while fetching single quotation:', e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: e.message }));
          }
        }

        // Fetch / Get Quotations endpoint (Module API Name: Quotations)
        if (pathname === '/api/zoho/get-quotations' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_MODULE_NAME || 'Quotations';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const quotationFields = 'id,Name,Email,Mobile_Number,Gender,City,State,Billing_address,Company_address,PAN_Card,Aadhaar_Card,Company_Name,Company_Type,Date_of_Incorporation,GST_Number,Company_PAN_Number,Sector,Industry,Subtotal,Total_GST,Grand_Total,Services_And_Pricing,Employee,Created_Time,Modified_Time,Owner,Created_By';
            const rawCriteria = urlObj.searchParams.get('criteria') || '';
            const criteria = combineWithOctoberFilter(rawCriteria);
            urlObj.searchParams.set('criteria', criteria);
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/search?fields=${quotationFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Quotations from Zoho CRM (${moduleName}) [criteria: ${criteria}]`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            // Fallback if search criteria returns 400 or 404
            if (!crmRes.ok && (crmRes.status === 400 || crmRes.status === 404)) {
              const fallbackUrl = new URL(urlObj.toString());
              fallbackUrl.searchParams.delete('criteria');
              const fallbackQuery = buildZohoPaginationQuery(fallbackUrl);
              crmRes = await fetch(`${apiBase}/crm/v8/${moduleName}?fields=${quotationFields}&${fallbackQuery}`, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
            }

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

            // Dual-layer defense: strictly filter quotations by October 2026 Created_Time
            if (crmData?.data && Array.isArray(crmData.data)) {
              crmData.data = crmData.data.filter((q: any) => {
                if (!q) return false;
                const ct = q.Created_Time || q.created_time || q.CreatedTime;
                if (!ct) return true;
                const ms = new Date(ct).getTime();
                return !isNaN(ms) ? ms >= OCTOBER_2026_START_MS : true;
              });
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
              let dealZohoId = (deal.zohoId && /^\d{15,}$/.test(String(deal.zohoId).trim()))
                ? String(deal.zohoId).trim()
                : (deal.id && /^\d{15,}$/.test(String(deal.id).trim()))
                ? String(deal.id).trim()
                : null;

              const isPartial = Boolean(
                deal.isPartial ||
                (dealZohoId && pathname === '/api/zoho/update-deal' && !deal.formData && !deal.servicesData && !deal.client && !deal.company && !deal.totals && !deal.service)
              );

              let payload: Record<string, any>;
              if (isPartial) {
                payload = { id: dealZohoId };
                for (const [k, v] of Object.entries(deal)) {
                  if (
                    k !== 'zohoId' &&
                    k !== 'isPartial' &&
                    k !== 'id' &&
                    k !== 'BDM_names' &&
                    k !== 'Department_Name' &&
                    k !== 'Employee_Name' &&
                    k !== 'Employee_ID'
                  ) {
                    payload[k] = v;
                  }
                }
              } else {
                payload = buildDealZohoPayload(deal);
                if (payload.id && !dealZohoId && /^\d{15,}$/.test(String(payload.id).trim())) {
                  dealZohoId = String(payload.id).trim();
                }
                if (dealZohoId) {
                  payload.id = dealZohoId;
                } else {
                  delete payload.id;
                }
              }
              if (payload.BDM_names && typeof payload.BDM_names === 'string') {
                delete payload.BDM_names;
              }
              let isUpdate = Boolean(dealZohoId || (pathname === '/api/zoho/update-deal' && payload.id));

              let accessToken = await getAccessToken(env);
              const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

              // If dealZohoId is missing, check if this deal already exists in Zoho CRM by DL ID
              const dlMatch = String(deal.id || '').match(/\b(DL-\d+)\b/i) || String(payload.Deal_Name || payload.Name || '').match(/\b(DL-\d+)\b/i);
              if (!dealZohoId && dlMatch) {
                try {
                  const sRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Deal_Name`, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                  });
                  if (sRes.ok) {
                    const sData: any = await sRes.json();
                    const list: any[] = sData.data || [];
                    const matched = list.find((d: any) => String(d.Deal_Name || '').toUpperCase().includes(dlMatch[1].toUpperCase()));
                    if (matched?.id) {
                      dealZohoId = String(matched.id);
                      payload.id = dealZohoId;
                      isUpdate = true;
                    }
                  }
                } catch (sErr) {
                  console.warn('[Vite Zoho Plugin] DL search failed:', sErr);
                }
              }

              const httpMethod = isUpdate ? 'PUT' : 'POST';
              const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

              if (!isPartial) {
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

              // Automatically trigger Blueprint Transition if target Stage has a registered Transition ID and not skipped
              const requestedStage = String(deal.stage || deal.Stage || payload.Stage || '').toLowerCase().trim();
              const autoTransitionId = ZOHO_DEAL_TRANSITION_MAP[requestedStage];
              const skipBp = Boolean(deal.skipBlueprint || deal.isPartial);
              if (!skipBp && isUpdate && deal.zohoId && autoTransitionId) {
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
              if (isUpdate && (dealZohoId || deal.zohoId || payload.id)) {
                const targetZohoId = String(dealZohoId || deal.zohoId || payload.id);
                await reconcileDealSubformsWithZoho(targetZohoId, payload, accessToken, apiBase, moduleName);
              }
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
                    const sData: any = await sRes.json().catch(() => ({}));
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

              // If transition failed with "invalid transition" or INVALID_DATA, check if Deal is already at or past target stage in Zoho CRM
              if (!bpResult.success) {
                try {
                  const checkRes = await fetch(`${apiBase}/crm/v8/Deals/${dealZohoId}?fields=Stage,Deal_Name`, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                  });
                  if (checkRes.ok) {
                    const checkData: any = await checkRes.json().catch(() => ({}));
                    const liveStage = String(checkData?.data?.[0]?.Stage || '').toLowerCase().trim();
                    const isAlreadyReached = isDealStageAtOrPastTransition(String(transitionId).trim(), liveStage);
                    if (isAlreadyReached) {
                      console.log(`[Vite Zoho Plugin] Deal #${dealZohoId} is already at or past target stage (current stage: "${checkData?.data?.[0]?.Stage}"). Marking transition as successful.`);
                      bpResult = {
                        success: true,
                        message: `Deal is already in "${checkData?.data?.[0]?.Stage}" stage in Zoho CRM`,
                        data: { alreadyTransitioned: true, currentStage: checkData?.data?.[0]?.Stage }
                      };
                    }
                  }
                } catch (checkErr) {
                  console.warn('[Vite Zoho Plugin] Check live stage error:', checkErr);
                }
              }

              res.setHeader('Content-Type', 'application/json');
              if (bpResult.success) {
                // Trigger backend service allocation sync for Allocator or Executor transitions
                const isAllocatorTransition = transitionId === '1078476000000492099' || String(targetStage).toLowerCase().includes('allocat');
                const isExecutorTransition = transitionId === '1078476000001938757' || String(targetStage).toLowerCase().includes('execut');

                if (isAllocatorTransition || isExecutorTransition) {
                  try {
                    const opsModuleName = env.VITE_ZOHO_INTERNAL_OPERATIONS_MODULE_NAME || 'Operation_Internal_CRM';

                    // 1. Gather allocations either from additionalData, reqData, or directly from Zoho Deal
                    let allocPayloads: any[] = [];
                    const frontendAllocations = Array.isArray(additionalData.allocations) && additionalData.allocations.length > 0
                      ? additionalData.allocations
                      : (Array.isArray(reqData.allocations) && reqData.allocations.length > 0 ? reqData.allocations : null);

                    let dealName = reqData.dealName || reqData.Deal_Name || '';

                    // Fetch Deal from Zoho CRM to ensure we have the deal details and subform services
                    let dealSubItems: any[] = [];
                    try {
                      const dealRes = await fetch(`${apiBase}/crm/v8/Deals/${dealZohoId}`, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                      });
                      if (dealRes.ok) {
                        const dealJson: any = await dealRes.json().catch(() => ({}));
                        const d = dealJson?.data?.[0];
                        if (d) {
                          dealName = d.Deal_Name || dealName;
                          dealSubItems = Array.isArray(d.Legal) && d.Legal.length > 0
                            ? d.Legal
                            : (Array.isArray(d.Subform_1) ? d.Subform_1 : []);
                        }
                      }
                    } catch (dErr) {
                      console.warn('[Vite Zoho Plugin] Deal fetch warning during transition:', dErr);
                    }

                    if (frontendAllocations && frontendAllocations.length > 0) {
                      // Map allocations passed from the frontend (which have assigned TL/TM and stages)
                      allocPayloads = frontendAllocations.map((alloc: any, idx: number) => {
                        const sName = alloc.Name || alloc.Service_Scheme || `Service ${idx + 1}`;
                        const tType = alloc.Team_Type || alloc.Internal_Team_Type || 'Team Funding';
                        const opStage = alloc.Operation_Stage || alloc.Stage || 'Document pending from client';
                        const tlId = alloc.Team_Leader?.id || alloc.Team_Leader_ID || alloc.Team_Leader_TL?.id || (typeof alloc.Team_Leader_TL === 'string' ? alloc.Team_Leader_TL : '');
                        const tmId = alloc.Team_Member?.id || alloc.Team_Member_ID || alloc.Team_Member_TM?.id || (typeof alloc.Team_Member_TM === 'string' ? alloc.Team_Member_TM : '');

                        return {
                          Name: sName,
                          Parent_Record_Deal: { id: String(dealZohoId) },
                          Team_Type: tType,
                          Operation_Stage: opStage,
                          ...(/^\d{15,}$/.test(String(tlId).trim()) ? { Team_Leader_TL: { id: String(tlId).trim() } } : {}),
                          ...(/^\d{15,}$/.test(String(tmId).trim()) ? { Team_Member_TM: { id: String(tmId).trim() } } : {}),
                          ...(alloc.CA_CS1 || alloc.CA_CS_1 ? { CA_CS_1: alloc.CA_CS_1 || alloc.CA_CS1 } : {}),
                          ...(alloc.CA_CS2 || alloc.CA_CS_2 ? { CA_CS_2: alloc.CA_CS_2 || alloc.CA_CS2 } : {}),
                          ...(alloc.Company_Type ? { Company_Type: alloc.Company_Type } : {}),
                          ...(alloc.After_Allocation_Workflow || alloc.After_Allocation ? { After_Allocation_Workflow: alloc.After_Allocation_Workflow || alloc.After_Allocation } : {}),
                        };
                      });
                    } else if (dealSubItems.length > 0) {
                      // Extract from Zoho Deal's Legal subform
                      allocPayloads = dealSubItems.map((sub: any, idx: number) => {
                        const serviceName = sub.Legal_Schemas || sub.Schemas || sub.Service_Name || `Service ${idx + 1}`;
                        const teamType = sub.Internal_team_type || 'Team Funding';
                        return {
                          Name: serviceName,
                          Parent_Record_Deal: { id: String(dealZohoId) },
                          Team_Type: teamType,
                          Operation_Stage: 'Document pending from client',
                        };
                      });
                    }

                    if (allocPayloads.length > 0) {
                      const normServiceName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]/g, '');

                      // 1. Deduplicate incoming alloc payloads
                      const seenAlloc = new Set<string>();
                      allocPayloads = allocPayloads.filter((al: any) => {
                        const norm = normServiceName(al.Name);
                        if (!norm) return true;
                        if (seenAlloc.has(norm)) return false;
                        seenAlloc.add(norm);
                        return true;
                      });

                      // 2. Fetch existing records for this deal in Operation_Internal_CRM
                      let existingList: any[] = [];
                      try {
                        const existingRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}?fields=id,Name,Parent_Record_Deal,Team_Type,Operation_Stage,Modified_Time&per_page=200`, {
                          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                        });
                        if (existingRes.status === 200) {
                          const existingData: any = await existingRes.json();
                          existingList = (existingData?.data || []).filter((ex: any) =>
                            String(ex.Parent_Record_Deal?.id || '').trim() === String(dealZohoId).trim()
                          );
                        }
                      } catch (_) {}

                      const toInsert: any[] = [];
                      const toUpdate: any[] = [];
                      const extraDuplicatesToDelete: string[] = [];

                      allocPayloads.forEach((alloc: any) => {
                        const normAlloc = normServiceName(alloc.Name);
                        const matches = existingList.filter((ex: any) => normServiceName(ex.Name || ex.Service_Scheme) === normAlloc);

                        if (matches.length > 0) {
                          const primary = matches[0];
                          toUpdate.push({ ...alloc, id: String(primary.id) });
                          // Any extra matching records in Zoho CRM are duplicates, mark for deletion
                          for (let i = 1; i < matches.length; i++) {
                            if (matches[i].id) extraDuplicatesToDelete.push(String(matches[i].id));
                          }
                        } else {
                          toInsert.push(alloc);
                        }
                      });

                      // Delete any extra duplicate records found in Zoho CRM for this deal
                      if (extraDuplicatesToDelete.length > 0) {
                        try {
                          await fetch(`${apiBase}/crm/v8/${opsModuleName}?ids=${extraDuplicatesToDelete.join(',')}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                          });
                          console.log('[Vite Zoho Plugin] Auto-deleted duplicate internal operations on transition:', extraDuplicatesToDelete);
                        } catch (delErr) {
                          console.warn('[Vite Zoho Plugin] Duplicate cleanup warning:', delErr);
                        }
                      }

                      if (toInsert.length > 0) {
                        const insRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}`, {
                          method: 'POST',
                          headers: {
                            Authorization: `Zoho-oauthtoken ${accessToken}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ data: toInsert })
                        });
                        const insData = await insRes.json().catch(() => ({}));
                        console.log('[Vite Zoho Plugin] Auto-inserted internal operations on transition:', insData);
                      }
                      if (toUpdate.length > 0) {
                        const upRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}`, {
                          method: 'PUT',
                          headers: {
                            Authorization: `Zoho-oauthtoken ${accessToken}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ data: toUpdate })
                        });
                        const upData = await upRes.json().catch(() => ({}));
                        console.log('[Vite Zoho Plugin] Auto-updated internal operations on transition:', upData);
                      }
                    }
                  } catch (autoErr) {
                    console.warn('[Vite Zoho Plugin] Auto-allocation generation warning:', autoErr);
                  }
                }

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

        const ALLOCATIONS_FILE = path.resolve(process.cwd(), 'data', 'internal_operations_allocations.json');

        const getStoredAllocations = (): Record<string, any> => {
          try {
            if (fs.existsSync(ALLOCATIONS_FILE)) {
              const content = fs.readFileSync(ALLOCATIONS_FILE, 'utf-8');
              return JSON.parse(content || '{}');
            }
          } catch (e) {
            console.warn('[Allocations Store] Error reading file:', e);
          }
          return {};
        };

        const saveStoredAllocations = (data: Record<string, any>) => {
          try {
            const dir = path.dirname(ALLOCATIONS_FILE);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(ALLOCATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
          } catch (e) {
            console.warn('[Allocations Store] Error writing file:', e);
          }
        };

        const normalizeFileList = (rawFiles: any) => {
          if (!rawFiles) return [];
          const arr = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
          return arr.map((f: any, idx: number) => {
            if (typeof f === 'string') {
              return { id: `file_${idx}`, name: f, size: 0, type: 'application/octet-stream', uploadedAt: new Date().toISOString() };
            }
            return {
              id: f.id || f.File_Id__s || `file_${idx}`,
              name: f.name || f.File_Name__s || 'Document',
              size: f.size || f.Size__s || 0,
              type: f.type || 'application/octet-stream',
              fileId: f.fileId || f.File_Id__s || f.id,
              dataUrl: f.dataUrl,
              url: f.url,
              uploadedAt: f.uploadedAt || f.Created_Time__s || new Date().toISOString()
            };
          });
        };

        const processRecordFilesAndUpload = async (
          record: any,
          accessToken: string,
          apiBase: string,
          opsModuleName: string,
          existingZohoRecord?: any
        ) => {
          const fileFieldKeys = [
            { key: 'Doc_collection_File_Upload', tag: 'Doc Collection', sectionPath: ['compDocCollection', 'docCollection', 'certDocCollection'] },
            { key: 'Name_Application_File_Upload', tag: 'Name Application', sectionPath: ['nameApp', 'accounting'] },
            { key: 'Board_Resolution_File_Upload', tag: 'Board Resolution', sectionPath: ['boardResolution', 'audit'] },
            { key: 'Share_Certificate_File_Upload', tag: 'Share Certificate', sectionPath: ['shareCertificate', 'mgt7'] },
            { key: 'Application_submission_File_Upload', tag: 'Application Submission', sectionPath: ['appSubmission', 'llpAgreement', 'certFinalApp'] },
            { key: 'Director_ITR_Company_ITR_File_Upload', tag: 'Director / Company ITR', sectionPath: ['directorItr', 'companyItr'] },
            { key: 'DPR_Pitch_deck_creation_File_Upload', tag: 'DPR', sectionPath: ['dprCreation', 'compInc', 'inc'] },
            { key: 'ADT_1_File_Upload', tag: 'ADT-1', sectionPath: ['adt1', 'compAdt1'] },
            { key: 'INC_20_A_File_Upload', tag: 'INC-20A', sectionPath: ['inc20A', 'dpt3'] },
            { key: 'Finance_Projected_Financials_File_Upload', tag: 'Finance', sectionPath: ['form3', 'compForm3', 'fundingFinance'] }
          ];

          const recordId = (record.id && /^\d{15,}$/.test(String(record.id)))
            ? String(record.id)
            : ((record.zohoId && /^\d{15,}$/.test(String(record.zohoId))) ? String(record.zohoId) : null);

          for (const item of fileFieldKeys) {
            let files = record[item.key];
            if (!Array.isArray(files) || files.length === 0) {
              if (record.sectionsData) {
                for (const sp of item.sectionPath) {
                  if (Array.isArray(record.sectionsData[sp]?.files) && record.sectionsData[sp].files.length > 0) {
                    files = record.sectionsData[sp].files;
                    break;
                  }
                }
              }
            }

            if (!Array.isArray(files) || files.length === 0) continue;

            for (const f of files) {
              if (!f) continue;
              const fName = typeof f === 'string' ? f : (f.name || 'document');
              const dataUrl = typeof f === 'object' ? f.dataUrl : null;
              const cleanName = fName.replace(/^\[[^\]]+\]\s*/, '');
              const taggedFileName = fName.startsWith('[') ? fName : `[${item.tag}] ${cleanName}`;

              if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:') && recordId) {
                try {
                  const parts = dataUrl.split(';base64,');
                  if (parts.length === 2) {
                    const mimeType = parts[0].replace('data:', '') || 'application/octet-stream';
                    const buffer = Buffer.from(parts[1], 'base64');

                    const attBlob = new Blob([buffer], { type: mimeType });
                    const attForm = new FormData();
                    attForm.append('file', attBlob, taggedFileName);
                    const attRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}/${recordId}/Attachments`, {
                      method: 'POST',
                      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                      body: attForm
                    });
                    const attData: any = await attRes.json().catch(() => ({}));
                    if (attData?.data?.[0]?.details?.id) {
                      const uploadedAttId = String(attData.data[0].details.id);
                      if (typeof f === 'object') {
                        f.fileId = uploadedAttId;
                        f.attachmentId = uploadedAttId;
                        f.id = uploadedAttId;
                        delete f.dataUrl;
                      }
                    }
                  }
                } catch (uploadErr) {
                  console.error(`[Zoho Attachment Upload Error for ${fName}]`, uploadErr);
                }
              }
            }
          }
        };

        // File Download Proxy Endpoint (/api/zoho/internal-operations/download)
        if (pathname === '/api/zoho/internal-operations/download' && req.method === 'GET') {
          try {
            const fileId = urlObj.searchParams.get('file_id') || urlObj.searchParams.get('id');
            const fileName = urlObj.searchParams.get('name') || 'download';
            const recordId = urlObj.searchParams.get('record_id');
            const attachmentId = urlObj.searchParams.get('attachment_id');
            const accessToken = await getAccessToken(env);
            const opsModuleName = env.VITE_ZOHO_INTERNAL_OPERATIONS_MODULE_NAME || 'Operation_Internal_CRM';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

            if (attachmentId && recordId) {
              const attRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}/${recordId}/Attachments/${attachmentId}`, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
              });
              if (attRes.ok) {
                const contentType = attRes.headers.get('content-type') || 'application/octet-stream';
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                const buffer = Buffer.from(await attRes.arrayBuffer());
                return res.end(buffer);
              }
            }

            const store = getStoredAllocations();
            for (const k of Object.keys(store)) {
              const rec = store[k];
              const allFiles = [
                ...(rec.Doc_collection_File_Upload || []),
                ...(rec.Name_Application_File_Upload || []),
                ...(rec.Board_Resolution_File_Upload || []),
                ...(rec.Share_Certificate_File_Upload || []),
                ...(rec.Application_submission_File_Upload || []),
                ...(rec.Director_ITR_Company_ITR_File_Upload || []),
                ...(rec.DPR_Pitch_deck_creation_File_Upload || []),
                ...(rec.ADT_1_File_Upload || []),
                ...(rec.INC_20_A_File_Upload || []),
                ...(rec.Finance_Projected_Financials_File_Upload || [])
              ];
              const matched = allFiles.find((f: any) => (f.fileId === fileId || f.id === fileId || f.name === fileName));
              if (matched?.dataUrl && matched.dataUrl.startsWith('data:')) {
                const parts = matched.dataUrl.split(';base64,');
                const mimeType = parts[0].replace('data:', '') || 'application/octet-stream';
                const buf = Buffer.from(parts[1], 'base64');
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${matched.name || fileName}"`);
                return res.end(buf);
              }
            }

            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, message: 'File not found' }));
          } catch (err: any) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Internal Operations Module Endpoints (/api/zoho/internal-operations)
        if (pathname === '/api/zoho/internal-operations') {
          try {
            const opsModuleName = env.VITE_ZOHO_INTERNAL_OPERATIONS_MODULE_NAME || 'Operation_Internal_CRM';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

            // Helper to map and format operation records for Zoho CRM (Module: Operation_Internal_CRM)
            const formatRecordForZohoOperation = (r: any) => {
              const isCompliance = (r.Internal_Team_Type || '').toLowerCase().includes('compliance');
              const isCertification = (r.Internal_Team_Type || '').toLowerCase().includes('certification');
              const docColl = isCertification
                ? (r.sectionsData?.certDocCollection || r.sectionsData?.docCollection)
                : isCompliance
                  ? (r.sectionsData?.compDocCollection || r.sectionsData?.docCollection)
                  : (r.sectionsData?.docCollection || r.sectionsData?.compDocCollection);

              const docName = r.Doc_collection_name !== undefined && r.Doc_collection_name !== ''
                ? r.Doc_collection_name
                : (docColl?.name || '');
              const docDate = r.Doc_collection_Date !== undefined && r.Doc_collection_Date !== ''
                ? r.Doc_collection_Date
                : (docColl?.date || '');
              const docStatus = r.Doc_collection_status !== undefined && r.Doc_collection_status !== ''
                ? r.Doc_collection_status
                : (docColl?.status || '');

              const nameColl = isCompliance
                ? (r.sectionsData?.accounting || r.sectionsData?.nameApp)
                : (r.sectionsData?.nameApp || r.sectionsData?.accounting);

              const nameAppName = r.Name_Application_name !== undefined && r.Name_Application_name !== ''
                ? r.Name_Application_name
                : (nameColl?.name || '');
              const nameAppApprovedName = r.Name_Application_approved_name !== undefined && r.Name_Application_approved_name !== ''
                ? r.Name_Application_approved_name
                : (r.sectionsData?.nameApp?.approvedName || '');
              const nameAppDate = r.Name_Application_date !== undefined && r.Name_Application_date !== ''
                ? r.Name_Application_date
                : (nameColl?.date || '');
              const nameAppStatus = r.Name_Application_status !== undefined && r.Name_Application_status !== ''
                ? r.Name_Application_status
                : (nameColl?.status || '');

              const dscName = r.DSC_Creation_name !== undefined && r.DSC_Creation_name !== ''
                ? r.DSC_Creation_name
                : (r.sectionsData?.dscCreation?.name || '');
              const dscDate = r.DSC_Creation_Date !== undefined && r.DSC_Creation_Date !== ''
                ? r.DSC_Creation_Date
                : (r.sectionsData?.dscCreation?.date || '');
              const dscStatus = r.DSC_Creation_status !== undefined && r.DSC_Creation_status !== ''
                ? r.DSC_Creation_status
                : (r.sectionsData?.dscCreation?.status || '');

              const finalFilingName = r.Final_Filing_name !== undefined && r.Final_Filing_name !== ''
                ? r.Final_Filing_name
                : (r.sectionsData?.finalFiling?.name || '');
              const finalFilingApprovalName = r.Final_Filing_Final_Approval_Name !== undefined && r.Final_Filing_Final_Approval_Name !== ''
                ? r.Final_Filing_Final_Approval_Name
                : (r.sectionsData?.finalFiling?.finalApprovalName || '');
              const finalFilingDate = r.Final_Filing_Date !== undefined && r.Final_Filing_Date !== ''
                ? r.Final_Filing_Date
                : (r.sectionsData?.finalFiling?.date || '');
              const finalFilingDoiDate = r.Final_Filing_DOI_Date !== undefined && r.Final_Filing_DOI_Date !== ''
                ? r.Final_Filing_DOI_Date
                : (r.sectionsData?.finalFiling?.doiDate || '');
              const finalFilingStatus = r.Final_Filing_status !== undefined && r.Final_Filing_status !== ''
                ? r.Final_Filing_status
                : (r.sectionsData?.finalFiling?.status || '');

              const brName = r.Board_Resolution_name !== undefined && r.Board_Resolution_name !== ''
                ? r.Board_Resolution_name
                : (r.sectionsData?.boardResolution?.name || r.sectionsData?.audit?.name || '');
              const brDate = r.Board_Resolution_Date !== undefined && r.Board_Resolution_Date !== ''
                ? r.Board_Resolution_Date
                : (r.sectionsData?.boardResolution?.date || r.sectionsData?.audit?.date || '');
              const brStatus = r.Board_Resolution_status !== undefined && r.Board_Resolution_status !== ''
                ? r.Board_Resolution_status
                : (r.sectionsData?.boardResolution?.status || r.sectionsData?.audit?.status || '');

              const scName = r.Share_Certificate_name !== undefined && r.Share_Certificate_name !== ''
                ? r.Share_Certificate_name
                : (r.sectionsData?.shareCertificate?.name || r.sectionsData?.mgt7?.name || '');
              const scDate = r.Share_Certificate_Date !== undefined && r.Share_Certificate_Date !== ''
                ? r.Share_Certificate_Date
                : (r.sectionsData?.shareCertificate?.date || r.sectionsData?.mgt7?.date || '');
              const scStatus = r.Share_Certificate_status !== undefined && r.Share_Certificate_status !== ''
                ? r.Share_Certificate_status
                : (r.sectionsData?.shareCertificate?.status || r.sectionsData?.mgt7?.status || '');

              const activeMsmeAoc4 = isCompliance ? r.sectionsData?.aoc4 : (r.sectionsData?.msmeCertificate || r.sectionsData?.msmeCertificateLlp);
              const fallbackMsmeAoc4 = isCompliance ? (r.sectionsData?.msmeCertificate || r.sectionsData?.msmeCertificateLlp) : r.sectionsData?.aoc4;

              const msmeDate = r.MSME_Certificate_Date !== undefined && r.MSME_Certificate_Date !== ''
                ? r.MSME_Certificate_Date
                : (activeMsmeAoc4?.date || fallbackMsmeAoc4?.date || '');
              const msmeStatus = r.MSME_Certificate_status !== undefined && r.MSME_Certificate_status !== ''
                ? r.MSME_Certificate_status
                : (activeMsmeAoc4?.status || fallbackMsmeAoc4?.status || '');
              const msmeFiles = r.MSME_Certificate_File_Upload || activeMsmeAoc4?.files || fallbackMsmeAoc4?.files || [];
              const msmeFileVal = r.MSME_Certificate !== undefined && r.MSME_Certificate !== ''
                ? r.MSME_Certificate
                : (msmeFiles.length > 0 ? (typeof msmeFiles[0] === 'string' ? msmeFiles[0] : (msmeFiles[0]?.url || msmeFiles[0]?.name || '')) : '');

              const aoc4Name = r.AOC_4_name !== undefined && r.AOC_4_name !== ''
                ? r.AOC_4_name
                : (r.sectionsData?.aoc4?.name || '');
              const aoc4DirectorAudit = r.AOC_4_Director_Audit_report !== undefined && r.AOC_4_Director_Audit_report !== ''
                ? r.AOC_4_Director_Audit_report
                : (r.sectionsData?.aoc4?.directorAuditReport || '');

              const adt1Name = r.ADT_1_name !== undefined && r.ADT_1_name !== ''
                ? r.ADT_1_name
                : (r.sectionsData?.adt1?.name || r.sectionsData?.compAdt1?.name || '');
              const adt1Auditor = r.ADT_1_Auditor_name !== undefined && r.ADT_1_Auditor_name !== ''
                ? r.ADT_1_Auditor_name
                : (r.sectionsData?.adt1?.auditorName || '');
              const adt1Date = r.ADT_1_date !== undefined && r.ADT_1_date !== ''
                ? r.ADT_1_date
                : (r.sectionsData?.adt1?.date || r.sectionsData?.compAdt1?.date || '');
              const adt1Status = r.ADT_1_status !== undefined && r.ADT_1_status !== ''
                ? r.ADT_1_status
                : (r.sectionsData?.adt1?.status || r.sectionsData?.compAdt1?.status || '');

              const inc20AName = r.INC_20_A_name !== undefined && r.INC_20_A_name !== ''
                ? r.INC_20_A_name
                : (r.sectionsData?.inc20A?.name || r.sectionsData?.dpt3?.name || '');
              const inc20ADate = r.INC_20_A_Date !== undefined && r.INC_20_A_Date !== ''
                ? r.INC_20_A_Date
                : (r.sectionsData?.inc20A?.date || r.sectionsData?.dpt3?.date || '');
              const inc20AStatus = r.INC_20_A_status !== undefined && r.INC_20_A_status !== ''
                ? r.INC_20_A_status
                : (r.sectionsData?.inc20A?.status || r.sectionsData?.dpt3?.status || '');

              const isFunding = (r.Internal_Team_Type || '').toLowerCase().includes('funding');
              const activeForm3 = isFunding
                ? r.sectionsData?.fundingFinance
                : isCompliance
                  ? (r.sectionsData?.compForm3 || r.sectionsData?.form3)
                  : r.sectionsData?.form3;
              const fallbackForm3 = isFunding
                ? (r.sectionsData?.compForm3 || r.sectionsData?.form3)
                : (r.sectionsData?.fundingFinance || r.sectionsData?.form3);

              const form3Name = r.Finance_Projected_Financials_name !== undefined && r.Finance_Projected_Financials_name !== ''
                ? r.Finance_Projected_Financials_name
                : (activeForm3?.name || fallbackForm3?.name || '');
              const form3Date = r.Finance_Projected_Financials_Date !== undefined && r.Finance_Projected_Financials_Date !== ''
                ? r.Finance_Projected_Financials_Date
                : (activeForm3?.date || fallbackForm3?.date || '');
              const form3Status = r.Finance_Projected_Financials_Status !== undefined && r.Finance_Projected_Financials_Status !== ''
                ? r.Finance_Projected_Financials_Status
                : (activeForm3?.status || fallbackForm3?.status || '');

              const isFundingLlp = (r.Internal_Team_Type || '').toLowerCase().includes('funding');
              const isCertificationLlp = (r.Internal_Team_Type || '').toLowerCase().includes('certification');
              const activeLlp = isCertificationLlp
                ? r.sectionsData?.certFinalApp
                : isFundingLlp
                  ? r.sectionsData?.appSubmission
                  : r.sectionsData?.llpAgreement;
              const fallbackLlp = isCertificationLlp
                ? (r.sectionsData?.appSubmission || r.sectionsData?.llpAgreement)
                : isFundingLlp
                  ? r.sectionsData?.llpAgreement
                  : r.sectionsData?.appSubmission;

              const llpName = r.Application_submission_name !== undefined && r.Application_submission_name !== ''
                ? r.Application_submission_name
                : (activeLlp?.name || fallbackLlp?.name || '');
              const llpDate = r.Application_submission_Submission_Date !== undefined && r.Application_submission_Submission_Date !== ''
                ? r.Application_submission_Submission_Date
                : (activeLlp?.date || fallbackLlp?.date || '');
              const llpStatus = r.Application_submission_status !== undefined && r.Application_submission_status !== ''
                ? r.Application_submission_status
                : (activeLlp?.status || fallbackLlp?.status || '');
              const appSubVal = (r.Application_registration_number !== undefined && r.Application_registration_number !== '')
                ? r.Application_registration_number
                : (r.Application_submission !== undefined && r.Application_submission !== '')
                  ? r.Application_submission
                  : (isCertificationLlp
                    ? (r.sectionsData?.certFinalApp?.registrationNumber || '')
                    : (r.sectionsData?.appSubmission?.registrationNumber || r.sectionsData?.appSubmission?.applicationSubmission || ''));
              const appPortalId = r.Application_submission_Portal_User_ID !== undefined && r.Application_submission_Portal_User_ID !== ''
                ? r.Application_submission_Portal_User_ID
                : (isCertificationLlp
                  ? (r.sectionsData?.certFinalApp?.id || r.sectionsData?.certFinalApp?.portalId || '')
                  : (r.sectionsData?.appSubmission?.portalId || ''));
              const appPortalPwd = r.Application_submission_Portal_Password !== undefined && r.Application_submission_Portal_Password !== ''
                ? r.Application_submission_Portal_Password
                : (isCertificationLlp
                  ? (r.sectionsData?.certFinalApp?.password || r.sectionsData?.certFinalApp?.portalPassword || '')
                  : (r.sectionsData?.appSubmission?.portalPassword || ''));

              const isCompanyItrService = (r.Service_Scheme || '').toLowerCase().includes('company itr');
              const primaryItr = isCompanyItrService ? r.sectionsData?.companyItr : r.sectionsData?.directorItr;
              const secondaryItr = isCompanyItrService ? r.sectionsData?.directorItr : r.sectionsData?.companyItr;

              const itrName = r.Director_ITR_Company_ITR_name !== undefined && r.Director_ITR_Company_ITR_name !== ''
                ? r.Director_ITR_Company_ITR_name
                : (primaryItr?.name || secondaryItr?.name || '');
              const itrDate = r.Director_ITR_Company_ITR_Date !== undefined && r.Director_ITR_Company_ITR_Date !== ''
                ? r.Director_ITR_Company_ITR_Date
                : (primaryItr?.date || secondaryItr?.date || '');
              const itrStatus = r.Director_ITR_Company_ITR_status !== undefined && r.Director_ITR_Company_ITR_status !== ''
                ? r.Director_ITR_Company_ITR_status
                : (primaryItr?.status || secondaryItr?.status || '');
              const itrDocCollection = r.Director_ITR_Doc_collection !== undefined && r.Director_ITR_Doc_collection !== ''
                ? r.Director_ITR_Doc_collection
                : (r.sectionsData?.directorItr?.docCollection || '');
              const itrFileRequired = r.Director_ITR_File_required !== undefined && r.Director_ITR_File_required !== ''
                ? r.Director_ITR_File_required
                : (r.sectionsData?.directorItr?.fileRequired || '');

              const activeDprInc = isCompliance ? (r.sectionsData?.compInc || r.sectionsData?.inc) : r.sectionsData?.dprCreation;
              const fallbackDprInc = isCompliance ? r.sectionsData?.dprCreation : (r.sectionsData?.compInc || r.sectionsData?.inc);

              const dprName = r.DPR_Pitch_deck_creation_name !== undefined && r.DPR_Pitch_deck_creation_name !== ''
                ? r.DPR_Pitch_deck_creation_name
                : (activeDprInc?.name || fallbackDprInc?.name || '');
              const dprDate = r.DPR_Pitch_deck_creation_Date !== undefined && r.DPR_Pitch_deck_creation_Date !== ''
                ? r.DPR_Pitch_deck_creation_Date
                : (activeDprInc?.date || fallbackDprInc?.date || '');
              const dprStatus = r.DPR_Pitch_deck_creation_status !== undefined && r.DPR_Pitch_deck_creation_status !== ''
                ? r.DPR_Pitch_deck_creation_status
                : (activeDprInc?.status || fallbackDprInc?.status || '');

              const rawDealId = (r.zohoDealId && /^\d{15,}$/.test(String(r.zohoDealId)))
                ? String(r.zohoDealId)
                : (r.Parent_Record_Deal?.id || (typeof r.Parent_Record_Deal === 'string' && /^\d{15,}$/.test(r.Parent_Record_Deal) ? r.Parent_Record_Deal : ''))
                || (r.Deal_ID?.id || (typeof r.Deal_ID === 'string' && /^\d{15,}$/.test(r.Deal_ID) ? r.Deal_ID : ''))
                || (r.dealId?.id || (typeof r.dealId === 'string' && /^\d{15,}$/.test(r.dealId) ? r.dealId : ''))
                || r.zohoDealId || (r.Deal_ID?.id || (typeof r.Deal_ID === 'string' ? r.Deal_ID : '')) || (r.Parent_Record_Deal?.id || (typeof r.Parent_Record_Deal === 'string' ? r.Parent_Record_Deal : '')) || '';
              const dealId = String(rawDealId).trim();
              const serviceName = r.Name || r.Service_Scheme || '';
              const teamType = r.Team_Type || r.Internal_Team_Type || '';
              const opStage = r.Operation_Stage || r.Stage || '';
              const tlId = r.Team_Leader?.id || r.Team_Leader_ID || r.Team_Leader_TL?.id || (typeof r.Team_Leader_TL === 'string' ? r.Team_Leader_TL : '') || (r.Team_Leader as any)?.zohoId;
              const tmId = r.Team_Member?.id || r.Team_Member_ID || r.Team_Member_TM?.id || (typeof r.Team_Member_TM === 'string' ? r.Team_Member_TM : '') || (r.Team_Member as any)?.zohoId;
              const tmName = r.Team_Member?.name || r.Team_Member_Name || (typeof r.Team_Member_TM === 'object' ? r.Team_Member_TM?.name : '') || '';

              const effectiveTlId = (/^\d{15,}$/.test(String(tlId || '').trim())) ? String(tlId).trim() : (/^\d{15,}$/.test(String((r.Team_Leader as any)?.zohoId || '').trim()) ? String((r.Team_Leader as any)?.zohoId).trim() : '');
              const effectiveTmId = (/^\d{15,}$/.test(String(tmId || '').trim())) ? String(tmId).trim() : (/^\d{15,}$/.test(String((r.Team_Member as any)?.zohoId || '').trim()) ? String((r.Team_Member as any)?.zohoId).trim() : '');

              const isDealNumeric = /^\d{15,}$/.test(String(dealId || '').trim());
              const isTlNumeric = Boolean(effectiveTlId);
              const isTmNumeric = Boolean(effectiveTmId);

              const payload: any = {
                ...(r.zohoId && /^\d{15,}$/.test(String(r.zohoId)) ? { id: String(r.zohoId) } : {}),
                ...(r.id && /^\d{15,}$/.test(String(r.id)) ? { id: String(r.id) } : {}),
                // Core Zoho CRM Fields (Module: Operation_Internal_CRM)
                ...(isDealNumeric ? {
                  Parent_Record_Deal: { id: String(dealId).trim() }
                } : {}),
                ...(r.Deal_Name ? { Deal_Name: r.Deal_Name } : {}),
                ...(r.Client_Name ? { Client_Name: r.Client_Name } : {}),
                ...(r.Company_Name ? { Company_Name: r.Company_Name } : {}),
                Name: serviceName || 'Service Allocation',
                Team_Type: teamType || 'Team Funding',
                Operation_Stage: opStage || 'Document pending from client',
                ...(isTlNumeric ? {
                  Team_Leader_TL: { id: effectiveTlId }
                } : {}),
                // Tag TM in Zoho CRM so it is visible in Zoho CRM without throwing 400 INVALID_DATA
                ...(tmName ? { Tag: [{ name: `TM: ${tmName}` }] } : {}),
                // Only send Team_Member_TM if it points to a Deal (Zoho CRM module schema constraint)
                ...(isTmNumeric && /^\d{15,}$/.test(String(dealId || '')) && effectiveTmId === String(dealId) ? {
                  Team_Member_TM: { id: effectiveTmId }
                } : {}),
                ...(r.CA_CS1 || r.CA_CS_1 ? { CA_CS_1: r.CA_CS_1 || r.CA_CS1 } : {}),
                ...(r.CA_CS2 || r.CA_CS_2 ? { CA_CS_2: r.CA_CS_2 || r.CA_CS2 } : {}),
                ...(r.After_Allocation_Workflow ? { After_Allocation_Workflow: r.After_Allocation_Workflow } : (r.After_Allocation ? { After_Allocation_Workflow: r.After_Allocation } : (r.sectionsData?.afterAllocation ? { After_Allocation_Workflow: r.sectionsData.afterAllocation } : {}))),
                ...(r.Company_Type ? { Company_Type: r.Company_Type } : {}),
                ...(r.Allocation_Status ? { Allocation_Status: r.Allocation_Status } : {}),
                // Mapped Doc collection fields for Zoho CRM (API Names: Doc_collection_name, Doc_collection_Date, Doc_collection_status)
                Doc_collection_name: docName || '',
                ...(docDate ? { Doc_collection_Date: docDate } : {}),
                ...(docStatus ? { Doc_collection_status: docStatus } : {}),
                // Mapped Name Application / Accounting fields for Zoho CRM (API Names: Name_Application_name, Name_Application_approved_name, Name_Application_date, Name_Application_status)
                Name_Application_name: nameAppName || '',
                Name_Application_approved_name: nameAppApprovedName || '',
                ...(nameAppDate ? { Name_Application_date: nameAppDate } : {}),
                ...(nameAppStatus ? { Name_Application_status: nameAppStatus } : {}),
                // Mapped DSC Creation fields for Zoho CRM (API Names: DSC_Creation_name, DSC_Creation_Date, DSC_Creation_status)
                DSC_Creation_name: dscName || '',
                ...(dscDate ? { DSC_Creation_Date: dscDate } : {}),
                ...(dscStatus ? { DSC_Creation_status: dscStatus } : {}),
                // Mapped Final Filing fields for Zoho CRM (API Names: Final_Filing_name, Final_Filing_Final_Approval_Name, Final_Filing_Date, Final_Filing_DOI_Date, Final_Filing_status)
                Final_Filing_name: finalFilingName || '',
                Final_Filing_Final_Approval_Name: finalFilingApprovalName || '',
                ...(finalFilingDate ? { Final_Filing_Date: finalFilingDate } : {}),
                ...(finalFilingDoiDate ? { Final_Filing_DOI_Date: finalFilingDoiDate } : {}),
                ...(finalFilingStatus ? { Final_Filing_status: finalFilingStatus } : {}),
                // Mapped Board Resolution / Audit fields for Zoho CRM (API Names: Board_Resolution_name, Board_Resolution_Date, Board_Resolution_status)
                Board_Resolution_name: brName || '',
                ...(brDate ? { Board_Resolution_Date: brDate } : {}),
                ...(brStatus ? { Board_Resolution_status: brStatus } : {}),
                // Mapped 2-Share Certificate / MGT-7 / 7A fields for Zoho CRM (API Names: Share_Certificate_name, Share_Certificate_Date, Share_Certificate_status)
                Share_Certificate_name: scName || '',
                ...(scDate ? { Share_Certificate_Date: scDate } : {}),
                ...(scStatus ? { Share_Certificate_status: scStatus } : {}),
                // Mapped MSME Certificate / AOC-4 fields for Zoho CRM (API Names: MSME_Certificate_Date, MSME_Certificate, MSME_Certificate_status)
                MSME_Certificate: msmeFileVal || '',
                ...(msmeDate ? { MSME_Certificate_Date: msmeDate } : {}),
                ...(msmeStatus ? { MSME_Certificate_status: msmeStatus } : {}),
                // Mapped AOC-4 fields for Zoho CRM (API Names: AOC_4_name, AOC_4_Director_Audit_report)
                AOC_4_name: aoc4Name || '',
                ...(aoc4DirectorAudit ? { AOC_4_Director_Audit_report: aoc4DirectorAudit } : {}),
                // Mapped ADT-1 fields for Zoho CRM (API Names: ADT_1_name, ADT_1_Auditor_name, ADT_1_date, ADT_1_status)
                ADT_1_name: adt1Name || '',
                ...(adt1Auditor ? { ADT_1_Auditor_name: adt1Auditor } : {}),
                ...(adt1Date ? { ADT_1_date: adt1Date } : {}),
                ...(adt1Status ? { ADT_1_status: adt1Status } : {}),
                // Mapped INC 20-A / DPT 3 fields for Zoho CRM (API Names: INC_20_A_name, INC_20_A_Date, INC_20_A_status)
                INC_20_A_name: inc20AName || '',
                ...(inc20ADate ? { INC_20_A_Date: inc20ADate } : {}),
                ...(inc20AStatus ? { INC_20_A_status: inc20AStatus } : {}),
                // Mapped Form 3 (Finance / Projected Financials) fields for Zoho CRM (API Names: Finance_Projected_Financials_name, Finance_Projected_Financials_Date, Finance_Projected_Financials_Status)
                Finance_Projected_Financials_name: form3Name || '',
                ...(form3Date ? { Finance_Projected_Financials_Date: form3Date } : {}),
                ...(form3Status ? { Finance_Projected_Financials_Status: form3Status } : {}),
                // Mapped LLP Agreement / Application Submission fields for Zoho CRM (API Names: Application_submission_name, Application_submission_Submission_Date, Application_submission_status, Application_registration_number, Application_submission, Application_submission_Portal_User_ID, Application_submission_Portal_Password)
                Application_submission_name: llpName || '',
                ...(llpDate ? { Application_submission_Submission_Date: llpDate } : {}),
                ...(llpStatus ? { Application_submission_status: llpStatus } : {}),
                ...(appSubVal ? { Application_submission: appSubVal, Application_registration_number: appSubVal } : {}),
                ...(appPortalId ? { Application_submission_Portal_User_ID: appPortalId } : {}),
                ...(appPortalPwd ? { Application_submission_Portal_Password: appPortalPwd } : {}),
                // Mapped Director ITR & Company ITR fields for Zoho CRM (API Names: Director_ITR_Company_ITR_name, Director_ITR_Company_ITR_Date, Director_ITR_Company_ITR_status, Director_ITR_Doc_collection, Director_ITR_File_required)
                Director_ITR_Company_ITR_name: itrName || '',
                ...(itrDate ? { Director_ITR_Company_ITR_Date: itrDate } : {}),
                ...(itrStatus ? { Director_ITR_Company_ITR_status: itrStatus } : {}),
                ...(itrDocCollection ? { Director_ITR_Doc_collection: itrDocCollection } : {}),
                ...(itrFileRequired ? { Director_ITR_File_required: itrFileRequired } : {}),
                // Mapped DPR / Pitch deck creation / INC fields for Zoho CRM (API Names: DPR_Pitch_deck_creation_name, DPR_Pitch_deck_creation_Date, DPR_Pitch_deck_creation_status)
                DPR_Pitch_deck_creation_name: dprName || '',
                ...(dprDate ? { DPR_Pitch_deck_creation_Date: dprDate } : {}),
                ...(dprStatus ? { DPR_Pitch_deck_creation_status: dprStatus } : {})
              };
              return payload;
            };

            // Helper to normalize Zoho CRM records into internal operation representation
            const normalizeZohoOperationRecord = (r: any) => {
              const sectionsData = r.sectionsData ? (typeof r.sectionsData === 'string' ? JSON.parse(r.sectionsData) : { ...r.sectionsData }) : {};

              const store = getStoredAllocations();
              const normServiceName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]/g, '');
              const dealId = r.Parent_Record_Deal?.id || (typeof r.Parent_Record_Deal === 'string' ? r.Parent_Record_Deal : '') || (r.Deal_ID?.id || (typeof r.Deal_ID === 'string' ? r.Deal_ID : '')) || '';
              const serviceName = r.Name || r.Service_Scheme || '';
              const normService = normServiceName(serviceName);

              const storeKey = r.id ? String(r.id) : (dealId ? `${dealId}__${normService}` : '');
              const storedEntry = (r.id && store[String(r.id)]) || (dealId && normService && store[`${dealId}__${normService}`]) || null;

              const mergeFiles = (recFiles: any, secFiles: any, storedFiles: any) => {
                const list = [
                  ...(Array.isArray(recFiles) ? recFiles : (recFiles ? [recFiles] : [])),
                  ...(Array.isArray(secFiles) ? secFiles : (secFiles ? [secFiles] : [])),
                  ...(Array.isArray(storedFiles) ? storedFiles : (storedFiles ? [storedFiles] : []))
                ];
                const seen = new Set();
                const deduped: any[] = [];
                for (const f of list) {
                  if (!f) continue;
                  const key = typeof f === 'string' ? f : (f.fileId || f.id || f.name);
                  if (key && !seen.has(key)) {
                    seen.add(key);
                    deduped.push(f);
                  }
                }
                return normalizeFileList(deduped);
              };

              const docName = r.Doc_collection_name || sectionsData.docCollection?.name || sectionsData.compDocCollection?.name || sectionsData.certDocCollection?.name || storedEntry?.Doc_collection_name || '';
              const docDate = r.Doc_collection_Date || sectionsData.docCollection?.date || sectionsData.compDocCollection?.date || sectionsData.certDocCollection?.date || storedEntry?.Doc_collection_Date || '';
              const docStatus = r.Doc_collection_status || sectionsData.docCollection?.status || sectionsData.compDocCollection?.status || sectionsData.certDocCollection?.status || storedEntry?.Doc_collection_status || '';
              const docFiles = mergeFiles(r.Doc_collection_File_Upload, sectionsData.docCollection?.files || sectionsData.compDocCollection?.files || sectionsData.certDocCollection?.files, storedEntry?.Doc_collection_File_Upload);

              if (!sectionsData.docCollection) sectionsData.docCollection = {};
              if (docName && !sectionsData.docCollection.name) sectionsData.docCollection.name = docName;
              if (docDate && !sectionsData.docCollection.date) sectionsData.docCollection.date = docDate;
              if (docStatus && !sectionsData.docCollection.status) sectionsData.docCollection.status = docStatus;
              sectionsData.docCollection.files = docFiles;

              if (!sectionsData.compDocCollection) sectionsData.compDocCollection = {};
              if (docName && !sectionsData.compDocCollection.name) sectionsData.compDocCollection.name = docName;
              if (docDate && !sectionsData.compDocCollection.date) sectionsData.compDocCollection.date = docDate;
              if (docStatus && !sectionsData.compDocCollection.status) sectionsData.compDocCollection.status = docStatus;
              sectionsData.compDocCollection.files = docFiles;

              if (!sectionsData.certDocCollection) sectionsData.certDocCollection = {};
              if (docName && !sectionsData.certDocCollection.name) sectionsData.certDocCollection.name = docName;
              if (docDate && !sectionsData.certDocCollection.date) sectionsData.certDocCollection.date = docDate;
              if (docStatus && !sectionsData.certDocCollection.status) sectionsData.certDocCollection.status = docStatus;
              sectionsData.certDocCollection.files = docFiles;

              // Map Name Application / Accounting fields
              const nameAppName = r.Name_Application_name || sectionsData.nameApp?.name || sectionsData.accounting?.name || storedEntry?.Name_Application_name || '';
              const nameAppApprovedName = r.Name_Application_approved_name || sectionsData.nameApp?.approvedName || storedEntry?.Name_Application_approved_name || '';
              const nameAppDate = r.Name_Application_date || sectionsData.nameApp?.date || sectionsData.accounting?.date || storedEntry?.Name_Application_date || '';
              const nameAppStatus = r.Name_Application_status || sectionsData.nameApp?.status || sectionsData.accounting?.status || storedEntry?.Name_Application_status || '';
              const nameAppFiles = mergeFiles(r.Name_Application_File_Upload, sectionsData.nameApp?.files || sectionsData.accounting?.files, storedEntry?.Name_Application_File_Upload);

              if (!sectionsData.nameApp) sectionsData.nameApp = {};
              if (nameAppName && !sectionsData.nameApp.name) sectionsData.nameApp.name = nameAppName;
              if (nameAppApprovedName && !sectionsData.nameApp.approvedName) sectionsData.nameApp.approvedName = nameAppApprovedName;
              if (nameAppDate && !sectionsData.nameApp.date) sectionsData.nameApp.date = nameAppDate;
              if (nameAppStatus && !sectionsData.nameApp.status) sectionsData.nameApp.status = nameAppStatus;
              sectionsData.nameApp.files = nameAppFiles;

              if (!sectionsData.accounting) sectionsData.accounting = {};
              if (nameAppName && !sectionsData.accounting.name) sectionsData.accounting.name = nameAppName;
              if (nameAppDate && !sectionsData.accounting.date) sectionsData.accounting.date = nameAppDate;
              if (nameAppStatus && !sectionsData.accounting.status) sectionsData.accounting.status = nameAppStatus;
              sectionsData.accounting.files = nameAppFiles;

              // Map DSC Creation fields
              const dscName = r.DSC_Creation_name || sectionsData.dscCreation?.name || storedEntry?.DSC_Creation_name || '';
              const dscDate = r.DSC_Creation_Date || sectionsData.dscCreation?.date || storedEntry?.DSC_Creation_Date || '';
              const dscStatus = r.DSC_Creation_status || sectionsData.dscCreation?.status || storedEntry?.DSC_Creation_status || '';

              if (!sectionsData.dscCreation) sectionsData.dscCreation = {};
              if (dscName && !sectionsData.dscCreation.name) sectionsData.dscCreation.name = dscName;
              if (dscDate && !sectionsData.dscCreation.date) sectionsData.dscCreation.date = dscDate;
              if (dscStatus && !sectionsData.dscCreation.status) sectionsData.dscCreation.status = dscStatus;

              // Map Final Filing fields
              const finalFilingName = r.Final_Filing_name || sectionsData.finalFiling?.name || storedEntry?.Final_Filing_name || '';
              const finalFilingApprovalName = r.Final_Filing_Final_Approval_Name || sectionsData.finalFiling?.finalApprovalName || storedEntry?.Final_Filing_Final_Approval_Name || '';
              const finalFilingDate = r.Final_Filing_Date || sectionsData.finalFiling?.date || storedEntry?.Final_Filing_Date || '';
              const finalFilingDoiDate = r.Final_Filing_DOI_Date || sectionsData.finalFiling?.doiDate || storedEntry?.Final_Filing_DOI_Date || '';
              const finalFilingStatus = r.Final_Filing_status || sectionsData.finalFiling?.status || storedEntry?.Final_Filing_status || '';

              if (!sectionsData.finalFiling) sectionsData.finalFiling = {};
              if (finalFilingName && !sectionsData.finalFiling.name) sectionsData.finalFiling.name = finalFilingName;
              if (finalFilingApprovalName && !sectionsData.finalFiling.finalApprovalName) sectionsData.finalFiling.finalApprovalName = finalFilingApprovalName;
              if (finalFilingDate && !sectionsData.finalFiling.date) sectionsData.finalFiling.date = finalFilingDate;
              if (finalFilingDoiDate && !sectionsData.finalFiling.doiDate) sectionsData.finalFiling.doiDate = finalFilingDoiDate;
              if (finalFilingStatus && !sectionsData.finalFiling.status) sectionsData.finalFiling.status = finalFilingStatus;

              // Map Board Resolution / Audit fields
              const brName = r.Board_Resolution_name || sectionsData.boardResolution?.name || sectionsData.audit?.name || storedEntry?.Board_Resolution_name || '';
              const brDate = r.Board_Resolution_Date || sectionsData.boardResolution?.date || sectionsData.audit?.date || storedEntry?.Board_Resolution_Date || '';
              const brStatus = r.Board_Resolution_status || sectionsData.boardResolution?.status || sectionsData.audit?.status || storedEntry?.Board_Resolution_status || '';
              const brFiles = mergeFiles(r.Board_Resolution_File_Upload, sectionsData.boardResolution?.files || sectionsData.audit?.files, storedEntry?.Board_Resolution_File_Upload);

              if (!sectionsData.boardResolution) sectionsData.boardResolution = {};
              if (brName && !sectionsData.boardResolution.name) sectionsData.boardResolution.name = brName;
              if (brDate && !sectionsData.boardResolution.date) sectionsData.boardResolution.date = brDate;
              if (brStatus && !sectionsData.boardResolution.status) sectionsData.boardResolution.status = brStatus;
              sectionsData.boardResolution.files = brFiles;

              if (!sectionsData.audit) sectionsData.audit = {};
              if (brName && !sectionsData.audit.name) sectionsData.audit.name = brName;
              if (brDate && !sectionsData.audit.date) sectionsData.audit.date = brDate;
              if (brStatus && !sectionsData.audit.status) sectionsData.audit.status = brStatus;
              sectionsData.audit.files = brFiles;

              // Map 2-Share Certificate / MGT-7 / 7A fields
              const scName = r.Share_Certificate_name || sectionsData.shareCertificate?.name || sectionsData.mgt7?.name || storedEntry?.Share_Certificate_name || '';
              const scDate = r.Share_Certificate_Date || sectionsData.shareCertificate?.date || sectionsData.mgt7?.date || storedEntry?.Share_Certificate_Date || '';
              const scStatus = r.Share_Certificate_status || sectionsData.shareCertificate?.status || sectionsData.mgt7?.status || storedEntry?.Share_Certificate_status || '';
              const scFiles = mergeFiles(r.Share_Certificate_File_Upload, sectionsData.shareCertificate?.files || sectionsData.mgt7?.files, storedEntry?.Share_Certificate_File_Upload);

              if (!sectionsData.shareCertificate) sectionsData.shareCertificate = {};
              if (scName && !sectionsData.shareCertificate.name) sectionsData.shareCertificate.name = scName;
              if (scDate && !sectionsData.shareCertificate.date) sectionsData.shareCertificate.date = scDate;
              if (scStatus && !sectionsData.shareCertificate.status) sectionsData.shareCertificate.status = scStatus;
              sectionsData.shareCertificate.files = scFiles;

              if (!sectionsData.mgt7) sectionsData.mgt7 = {};
              if (scName && !sectionsData.mgt7.name) sectionsData.mgt7.name = scName;
              if (scDate && !sectionsData.mgt7.date) sectionsData.mgt7.date = scDate;
              if (scStatus && !sectionsData.mgt7.status) sectionsData.mgt7.status = scStatus;
              sectionsData.mgt7.files = scFiles;

              // Map MSME Certificate fields
              const msmeDate = r.MSME_Certificate_Date || sectionsData.msmeCertificate?.date || sectionsData.msmeCertificateLlp?.date || storedEntry?.MSME_Certificate_Date || '';
              const msmeStatus = r.MSME_Certificate_status || sectionsData.msmeCertificate?.status || sectionsData.msmeCertificateLlp?.status || storedEntry?.MSME_Certificate_status || '';
              const msmeFileVal = r.MSME_Certificate || sectionsData.msmeCertificate?.fileUpload || sectionsData.msmeCertificateLlp?.fileUpload || storedEntry?.MSME_Certificate || '';
              const msmeFiles = mergeFiles(r.MSME_Certificate_File_Upload, sectionsData.msmeCertificate?.files || sectionsData.msmeCertificateLlp?.files, storedEntry?.MSME_Certificate_File_Upload);

              if (!sectionsData.msmeCertificate) sectionsData.msmeCertificate = {};
              if (msmeDate && !sectionsData.msmeCertificate.date) sectionsData.msmeCertificate.date = msmeDate;
              if (msmeStatus && !sectionsData.msmeCertificate.status) sectionsData.msmeCertificate.status = msmeStatus;
              sectionsData.msmeCertificate.files = msmeFiles;

              if (!sectionsData.msmeCertificateLlp) sectionsData.msmeCertificateLlp = {};
              if (msmeDate && !sectionsData.msmeCertificateLlp.date) sectionsData.msmeCertificateLlp.date = msmeDate;
              if (msmeStatus && !sectionsData.msmeCertificateLlp.status) sectionsData.msmeCertificateLlp.status = msmeStatus;
              sectionsData.msmeCertificateLlp.files = msmeFiles;

              // Map AOC-4 fields
              const aoc4Name = r.AOC_4_name || sectionsData.aoc4?.name || storedEntry?.AOC_4_name || '';
              const aoc4DirectorAudit = r.AOC_4_Director_Audit_report || sectionsData.aoc4?.directorAuditReport || storedEntry?.AOC_4_Director_Audit_report || '';

              if (!sectionsData.aoc4) sectionsData.aoc4 = {};
              if (aoc4Name && !sectionsData.aoc4.name) sectionsData.aoc4.name = aoc4Name;
              if (aoc4DirectorAudit && !sectionsData.aoc4.directorAuditReport) sectionsData.aoc4.directorAuditReport = aoc4DirectorAudit;
              if (msmeDate && !sectionsData.aoc4.date) sectionsData.aoc4.date = msmeDate;
              if (msmeStatus && !sectionsData.aoc4.status) sectionsData.aoc4.status = msmeStatus;
              sectionsData.aoc4.files = msmeFiles;

              // Map DPR / Pitch deck creation / INC fields
              const dprName = r.DPR_Pitch_deck_creation_name || sectionsData.dprCreation?.name || sectionsData.compInc?.name || sectionsData.inc?.name || storedEntry?.DPR_Pitch_deck_creation_name || '';
              const dprDate = r.DPR_Pitch_deck_creation_Date || sectionsData.dprCreation?.date || sectionsData.compInc?.date || sectionsData.inc?.date || storedEntry?.DPR_Pitch_deck_creation_Date || '';
              const dprStatus = r.DPR_Pitch_deck_creation_status || sectionsData.dprCreation?.status || sectionsData.compInc?.status || sectionsData.inc?.status || storedEntry?.DPR_Pitch_deck_creation_status || '';
              const dprFiles = mergeFiles(r.DPR_Pitch_deck_creation_File_Upload || r.DPR_Pitch_deck_creation_File_U, sectionsData.dprCreation?.files || sectionsData.compInc?.files || sectionsData.inc?.files, storedEntry?.DPR_Pitch_deck_creation_File_Upload);

              if (!sectionsData.dprCreation) sectionsData.dprCreation = {};
              if (dprName && !sectionsData.dprCreation.name) sectionsData.dprCreation.name = dprName;
              if (dprDate && !sectionsData.dprCreation.date) sectionsData.dprCreation.date = dprDate;
              if (dprStatus && !sectionsData.dprCreation.status) sectionsData.dprCreation.status = dprStatus;
              sectionsData.dprCreation.files = dprFiles;

              if (!sectionsData.compInc) sectionsData.compInc = {};
              if (dprName && !sectionsData.compInc.name) sectionsData.compInc.name = dprName;
              if (dprDate && !sectionsData.compInc.date) sectionsData.compInc.date = dprDate;
              if (dprStatus && !sectionsData.compInc.status) sectionsData.compInc.status = dprStatus;
              sectionsData.compInc.files = dprFiles;

              if (!sectionsData.inc) sectionsData.inc = {};
              if (dprName && !sectionsData.inc.name) sectionsData.inc.name = dprName;
              if (dprDate && !sectionsData.inc.date) sectionsData.inc.date = dprDate;
              if (dprStatus && !sectionsData.inc.status) sectionsData.inc.status = dprStatus;
              sectionsData.inc.files = dprFiles;

              // Map ADT-1 fields
              const adt1Name = r.ADT_1_name || sectionsData.adt1?.name || sectionsData.compAdt1?.name || storedEntry?.ADT_1_name || '';
              const adt1Auditor = r.ADT_1_Auditor_name || sectionsData.adt1?.auditorName || storedEntry?.ADT_1_Auditor_name || '';
              const adt1Date = r.ADT_1_date || sectionsData.adt1?.date || sectionsData.compAdt1?.date || storedEntry?.ADT_1_date || '';
              const adt1Status = r.ADT_1_status || sectionsData.adt1?.status || sectionsData.compAdt1?.status || storedEntry?.ADT_1_status || '';
              const adt1Files = mergeFiles(r.ADT_1_File_Upload, sectionsData.adt1?.files || sectionsData.compAdt1?.files, storedEntry?.ADT_1_File_Upload);

              if (!sectionsData.adt1) sectionsData.adt1 = {};
              if (adt1Name && !sectionsData.adt1.name) sectionsData.adt1.name = adt1Name;
              if (adt1Auditor && !sectionsData.adt1.auditorName) sectionsData.adt1.auditorName = adt1Auditor;
              if (adt1Date && !sectionsData.adt1.date) sectionsData.adt1.date = adt1Date;
              if (adt1Status && !sectionsData.adt1.status) sectionsData.adt1.status = adt1Status;
              sectionsData.adt1.files = adt1Files;

              if (!sectionsData.compAdt1) sectionsData.compAdt1 = {};
              if (adt1Name && !sectionsData.compAdt1.name) sectionsData.compAdt1.name = adt1Name;
              if (adt1Date && !sectionsData.compAdt1.date) sectionsData.compAdt1.date = adt1Date;
              if (adt1Status && !sectionsData.compAdt1.status) sectionsData.compAdt1.status = adt1Status;
              sectionsData.compAdt1.files = adt1Files;

              // Map INC 20-A / DPT 3 fields
              const inc20AName = r.INC_20_A_name || sectionsData.inc20A?.name || sectionsData.dpt3?.name || storedEntry?.INC_20_A_name || '';
              const inc20ADate = r.INC_20_A_Date || sectionsData.inc20A?.date || sectionsData.dpt3?.date || storedEntry?.INC_20_A_Date || '';
              const inc20AStatus = r.INC_20_A_status || sectionsData.inc20A?.status || sectionsData.dpt3?.status || storedEntry?.INC_20_A_status || '';
              const inc20AFiles = mergeFiles(r.INC_20_A_File_Upload, sectionsData.inc20A?.files || sectionsData.dpt3?.files, storedEntry?.INC_20_A_File_Upload);

              if (!sectionsData.inc20A) sectionsData.inc20A = {};
              if (inc20AName && !sectionsData.inc20A.name) sectionsData.inc20A.name = inc20AName;
              if (inc20ADate && !sectionsData.inc20A.date) sectionsData.inc20A.date = inc20ADate;
              if (inc20AStatus && !sectionsData.inc20A.status) sectionsData.inc20A.status = inc20AStatus;
              sectionsData.inc20A.files = inc20AFiles;

              if (!sectionsData.dpt3) sectionsData.dpt3 = {};
              if (inc20AName && !sectionsData.dpt3.name) sectionsData.dpt3.name = inc20AName;
              if (inc20ADate && !sectionsData.dpt3.date) sectionsData.dpt3.date = inc20ADate;
              if (inc20AStatus && !sectionsData.dpt3.status) sectionsData.dpt3.status = inc20AStatus;
              sectionsData.dpt3.files = inc20AFiles;

              // Map Form 3 (Finance / Projected Financials) fields
              const form3Name = r.Finance_Projected_Financials_name || sectionsData.form3?.name || sectionsData.compForm3?.name || sectionsData.fundingFinance?.name || storedEntry?.Finance_Projected_Financials_name || '';
              const form3Date = r.Finance_Projected_Financials_Date || sectionsData.form3?.date || sectionsData.compForm3?.date || sectionsData.fundingFinance?.date || storedEntry?.Finance_Projected_Financials_Date || '';
              const form3Status = r.Finance_Projected_Financials_Status || sectionsData.form3?.status || sectionsData.compForm3?.status || sectionsData.fundingFinance?.status || storedEntry?.Finance_Projected_Financials_Status || '';
              const form3Files = mergeFiles(r.Finance_Projected_Financials_File_Upload, sectionsData.form3?.files || sectionsData.compForm3?.files || sectionsData.fundingFinance?.files, storedEntry?.Finance_Projected_Financials_File_Upload);

              if (!sectionsData.form3) sectionsData.form3 = {};
              if (form3Name && !sectionsData.form3.name) sectionsData.form3.name = form3Name;
              if (form3Date && !sectionsData.form3.date) sectionsData.form3.date = form3Date;
              if (form3Status && !sectionsData.form3.status) sectionsData.form3.status = form3Status;
              sectionsData.form3.files = form3Files;

              if (!sectionsData.compForm3) sectionsData.compForm3 = {};
              if (form3Name && !sectionsData.compForm3.name) sectionsData.compForm3.name = form3Name;
              if (form3Date && !sectionsData.compForm3.date) sectionsData.compForm3.date = form3Date;
              if (form3Status && !sectionsData.compForm3.status) sectionsData.compForm3.status = form3Status;
              sectionsData.compForm3.files = form3Files;

              if (!sectionsData.fundingFinance) sectionsData.fundingFinance = {};
              if (form3Name && !sectionsData.fundingFinance.name) sectionsData.fundingFinance.name = form3Name;
              if (form3Date && !sectionsData.fundingFinance.date) sectionsData.fundingFinance.date = form3Date;
              if (form3Status && !sectionsData.fundingFinance.status) sectionsData.fundingFinance.status = form3Status;
              sectionsData.fundingFinance.files = form3Files;

              // Map LLP Agreement / Application Submission fields
              const isFundingRec = (r.Internal_Team_Type || '').toLowerCase().includes('funding');
              const isCertificationRec = (r.Internal_Team_Type || '').toLowerCase().includes('certification');
              const certAppObj = sectionsData.certFinalApp || {};
              const appSubObj = sectionsData.appSubmission || {};
              const llpObj = sectionsData.llpAgreement || {};

              const llpName = r.Application_submission_name || (isCertificationRec ? certAppObj.name : isFundingRec ? appSubObj.name : llpObj.name) || certAppObj.name || appSubObj.name || llpObj.name || storedEntry?.Application_submission_name || '';
              const llpDate = r.Application_submission_Submission_Date || (isCertificationRec ? certAppObj.date : isFundingRec ? appSubObj.date : llpObj.date) || certAppObj.date || appSubObj.date || llpObj.date || storedEntry?.Application_submission_Submission_Date || '';
              const llpStatus = r.Application_submission_status || (isCertificationRec ? certAppObj.status : isFundingRec ? appSubObj.status : llpObj.status) || certAppObj.status || appSubObj.status || llpObj.status || storedEntry?.Application_submission_status || '';
              const llpFiles = mergeFiles(r.Application_submission_File_Upload, (isCertificationRec ? certAppObj.files : isFundingRec ? appSubObj.files : llpObj.files) || certAppObj.files || appSubObj.files || llpObj.files, storedEntry?.Application_submission_File_Upload);
              const appSubVal = r.Application_registration_number || r.Application_submission || (isCertificationRec ? certAppObj.registrationNumber : appSubObj.registrationNumber) || appSubObj.registrationNumber || certAppObj.registrationNumber || appSubObj.applicationSubmission || storedEntry?.Application_registration_number || storedEntry?.Application_submission || '';
              const appPortalId = r.Application_submission_Portal_User_ID || (isCertificationRec ? (certAppObj.portalId || certAppObj.id) : appSubObj.portalId) || appSubObj.portalId || certAppObj.portalId || certAppObj.id || storedEntry?.Application_submission_Portal_User_ID || '';
              const appPortalPwd = r.Application_submission_Portal_Password || (isCertificationRec ? (certAppObj.portalPassword || certAppObj.password) : appSubObj.portalPassword) || appSubObj.portalPassword || certAppObj.portalPassword || certAppObj.password || storedEntry?.Application_submission_Portal_Password || '';

              if (!sectionsData.llpAgreement) sectionsData.llpAgreement = {};
              if (llpName && !sectionsData.llpAgreement.name) sectionsData.llpAgreement.name = llpName;
              if (llpDate && !sectionsData.llpAgreement.date) sectionsData.llpAgreement.date = llpDate;
              if (llpStatus && !sectionsData.llpAgreement.status) sectionsData.llpAgreement.status = llpStatus;
              sectionsData.llpAgreement.files = llpFiles;

              if (!sectionsData.appSubmission) sectionsData.appSubmission = {};
              if (llpName && !sectionsData.appSubmission.name) sectionsData.appSubmission.name = llpName;
              if (llpDate && !sectionsData.appSubmission.date) sectionsData.appSubmission.date = llpDate;
              if (llpStatus && !sectionsData.appSubmission.status) sectionsData.appSubmission.status = llpStatus;
              sectionsData.appSubmission.files = llpFiles;
              if (appSubVal && !sectionsData.appSubmission.registrationNumber) sectionsData.appSubmission.registrationNumber = appSubVal;
              if (appPortalId && !sectionsData.appSubmission.portalId) sectionsData.appSubmission.portalId = appPortalId;
              if (appPortalPwd && !sectionsData.appSubmission.portalPassword) sectionsData.appSubmission.portalPassword = appPortalPwd;

              if (!sectionsData.certFinalApp) sectionsData.certFinalApp = {};
              if (llpName && !sectionsData.certFinalApp.name) sectionsData.certFinalApp.name = llpName;
              if (llpDate && !sectionsData.certFinalApp.date) sectionsData.certFinalApp.date = llpDate;
              if (llpStatus && !sectionsData.certFinalApp.status) sectionsData.certFinalApp.status = llpStatus;
              sectionsData.certFinalApp.files = llpFiles;
              if (appSubVal && !sectionsData.certFinalApp.registrationNumber) sectionsData.certFinalApp.registrationNumber = appSubVal;
              if (appPortalId && !sectionsData.certFinalApp.portalId && !sectionsData.certFinalApp.id) {
                sectionsData.certFinalApp.portalId = appPortalId;
                sectionsData.certFinalApp.id = appPortalId;
              }
              if (appPortalPwd && !sectionsData.certFinalApp.portalPassword && !sectionsData.certFinalApp.password) {
                sectionsData.certFinalApp.portalPassword = appPortalPwd;
                sectionsData.certFinalApp.password = appPortalPwd;
              }

              // Map Director ITR & Company ITR fields
              const isCompanyItrService = (r.Service_Scheme || '').toLowerCase().includes('company itr');
              const itrName = r.Director_ITR_Company_ITR_name || (isCompanyItrService ? sectionsData.companyItr?.name : sectionsData.directorItr?.name) || sectionsData.directorItr?.name || sectionsData.companyItr?.name || storedEntry?.Director_ITR_Company_ITR_name || '';
              const itrDate = r.Director_ITR_Company_ITR_Date || (isCompanyItrService ? sectionsData.companyItr?.date : sectionsData.directorItr?.date) || sectionsData.directorItr?.date || sectionsData.companyItr?.date || storedEntry?.Director_ITR_Company_ITR_Date || '';
              const itrStatus = r.Director_ITR_Company_ITR_status || (isCompanyItrService ? sectionsData.companyItr?.status : sectionsData.directorItr?.status) || sectionsData.directorItr?.status || sectionsData.companyItr?.status || storedEntry?.Director_ITR_Company_ITR_status || '';
              const itrFiles = mergeFiles(r.Director_ITR_Company_ITR_File_Upload, (isCompanyItrService ? sectionsData.companyItr?.files : sectionsData.directorItr?.files) || sectionsData.directorItr?.files || sectionsData.companyItr?.files, storedEntry?.Director_ITR_Company_ITR_File_Upload);
              const itrDocCollection = r.Director_ITR_Doc_collection || sectionsData.directorItr?.docCollection || storedEntry?.Director_ITR_Doc_collection || '';
              const itrFileRequired = r.Director_ITR_File_required || sectionsData.directorItr?.fileRequired || storedEntry?.Director_ITR_File_required || '';

              if (!sectionsData.directorItr) sectionsData.directorItr = {};
              if (itrName && !sectionsData.directorItr.name) sectionsData.directorItr.name = itrName;
              if (itrDate && !sectionsData.directorItr.date) sectionsData.directorItr.date = itrDate;
              if (itrStatus && !sectionsData.directorItr.status) sectionsData.directorItr.status = itrStatus;
              sectionsData.directorItr.files = itrFiles;
              if (itrDocCollection && !sectionsData.directorItr.docCollection) sectionsData.directorItr.docCollection = itrDocCollection;
              if (itrFileRequired && !sectionsData.directorItr.fileRequired) sectionsData.directorItr.fileRequired = itrFileRequired;

              if (!sectionsData.companyItr) sectionsData.companyItr = {};
              if (itrName && !sectionsData.companyItr.name) sectionsData.companyItr.name = itrName;
              if (itrDate && !sectionsData.companyItr.date) sectionsData.companyItr.date = itrDate;
              if (itrStatus && !sectionsData.companyItr.status) sectionsData.companyItr.status = itrStatus;
              sectionsData.companyItr.files = itrFiles;

              // Map After Allocation Workflow
              const afterAllocation = r.After_Allocation_Workflow || r.After_Allocation || sectionsData.afterAllocation || storedEntry?.After_Allocation_Workflow || storedEntry?.After_Allocation || 'No';
              sectionsData.afterAllocation = afterAllocation;

              // Map Core Zoho CRM Fields (Module: Operation_Internal_CRM)
              const dealName = r.Parent_Record_Deal?.name || (typeof r.Parent_Record_Deal === 'object' && r.Parent_Record_Deal?.lookup_label ? r.Parent_Record_Deal.lookup_label : '') || r.Deal_Name || storedEntry?.Deal_Name || '';
              const teamType = r.Team_Type || r.Internal_Team_Type || storedEntry?.Team_Type || storedEntry?.Internal_Team_Type || '';
              const opStage = r.Operation_Stage || r.Stage || storedEntry?.Operation_Stage || storedEntry?.Stage || 'Document pending from client';

              // Extract TL (Lookup to Employees module: Team_Leader_TL)
              const rawTl = r.Team_Leader_TL || r.Team_Leader || storedEntry?.Team_Leader || storedEntry?.Team_Leader_TL;
              const tlId = rawTl?.id || (typeof rawTl === 'string' ? rawTl : '') || r.Team_Leader_ID || storedEntry?.Team_Leader_ID || '';
              const tlName = rawTl?.name || (typeof rawTl === 'object' && rawTl?.lookup_label ? rawTl.lookup_label : '') || r.Team_Leader_Name || storedEntry?.Team_Leader_Name || '';
              const tlUser = (tlId || tlName) ? { id: tlId, name: tlName, email: rawTl?.email || storedEntry?.Team_Leader?.email, empId: tlId } : null;

              // Extract TM - check tag and stored allocations first since Team_Member_TM in Zoho is a lookup to Deals
              let tmTag = '';
              if (Array.isArray(r.Tag)) {
                const tagObj = r.Tag.find((t: any) => t?.name && String(t.name).startsWith('TM: '));
                if (tagObj) {
                  tmTag = tagObj.name.replace(/^TM:\s*/, '').trim();
                }
              }

              const rawTm = r.Team_Member_TM || r.Team_Member;
              const rawTmName = rawTm?.name || (typeof rawTm === 'object' && rawTm?.lookup_label ? rawTm.lookup_label : '') || r.Team_Member_Name || '';
              const rawTmId = rawTm?.id || (typeof rawTm === 'string' ? rawTm : '') || r.Team_Member_ID || '';
              const isDealRef = Boolean(rawTmName && (rawTmName === dealName || rawTmName === r.Deal_Name || /DL-\d+/i.test(rawTmName) || rawTmId === dealId));

              const validTmFromRec = !isDealRef && (rawTmId || rawTmName) ? { id: rawTmId, name: rawTmName, email: rawTm?.email, empId: rawTmId } : null;
              const tmStored = storedEntry?.Team_Member || (storedEntry?.Team_Member_Name ? { id: storedEntry.Team_Member_ID || '', name: storedEntry.Team_Member_Name, email: storedEntry.Team_Member?.email, empId: storedEntry.Team_Member_ID || '' } : null);
              const tmFromTag = tmTag ? { id: '', name: tmTag, empId: '' } : null;

              const tmUser = tmStored || validTmFromRec || tmFromTag || null;
              const tmId = tmUser?.id || '';
              const tmName = tmUser?.name || '';

              return {
                ...r,
                Deal_ID: dealId || r.Deal_ID,
                Deal_Name: dealName || r.Deal_Name,
                Parent_Record_Deal: r.Parent_Record_Deal || (dealId ? { id: dealId, name: dealName } : undefined),
                Service_Scheme: serviceName || r.Service_Scheme,
                Name: serviceName || r.Name,
                Internal_Team_Type: teamType || r.Internal_Team_Type,
                Team_Type: teamType || r.Team_Type,
                Stage: opStage || r.Stage,
                Operation_Stage: opStage || r.Operation_Stage,
                Team_Leader: tlUser || r.Team_Leader || null,
                Team_Leader_ID: tlId || r.Team_Leader_ID || '',
                Team_Leader_Name: tlName || r.Team_Leader_Name || '',
                Team_Leader_TL: r.Team_Leader_TL || (tlId ? { id: tlId, name: tlName } : (tlName ? { id: '', name: tlName } : null)),
                Team_Member: tmUser || r.Team_Member || null,
                Team_Member_ID: tmId || r.Team_Member_ID || '',
                Team_Member_Name: tmName || r.Team_Member_Name || '',
                Team_Member_TM: r.Team_Member_TM || (tmId ? { id: tmId, name: tmName } : (tmName ? { id: '', name: tmName } : null)),
                After_Allocation: afterAllocation,
                After_Allocation_Workflow: afterAllocation,
                Doc_collection_name: docName,
                Doc_collection_Date: docDate,
                Doc_collection_status: docStatus,
                Doc_collection_File_Upload: docFiles,
                Name_Application_name: nameAppName,
                Name_Application_approved_name: nameAppApprovedName,
                Name_Application_date: nameAppDate,
                Name_Application_status: nameAppStatus,
                Name_Application_File_Upload: nameAppFiles,
                DSC_Creation_name: dscName,
                DSC_Creation_Date: dscDate,
                DSC_Creation_status: dscStatus,
                Final_Filing_name: finalFilingName,
                Final_Filing_Final_Approval_Name: finalFilingApprovalName,
                Final_Filing_Date: finalFilingDate,
                Final_Filing_DOI_Date: finalFilingDoiDate,
                Final_Filing_status: finalFilingStatus,
                Board_Resolution_name: brName,
                Board_Resolution_Date: brDate,
                Board_Resolution_status: brStatus,
                Board_Resolution_File_Upload: brFiles,
                Share_Certificate_name: scName,
                Share_Certificate_Date: scDate,
                Share_Certificate_status: scStatus,
                Share_Certificate_File_Upload: scFiles,
                MSME_Certificate: msmeFileVal,
                MSME_Certificate_Date: msmeDate,
                MSME_Certificate_status: msmeStatus,
                MSME_Certificate_File_Upload: msmeFiles,
                AOC_4_name: aoc4Name,
                AOC_4_Director_Audit_report: aoc4DirectorAudit,
                ADT_1_name: adt1Name,
                ADT_1_Auditor_name: adt1Auditor,
                ADT_1_date: adt1Date,
                ADT_1_status: adt1Status,
                ADT_1_File_Upload: adt1Files,
                INC_20_A_name: inc20AName,
                INC_20_A_Date: inc20ADate,
                INC_20_A_status: inc20AStatus,
                INC_20_A_File_Upload: inc20AFiles,
                Finance_Projected_Financials_name: form3Name,
                Finance_Projected_Financials_Date: form3Date,
                Finance_Projected_Financials_Status: form3Status,
                Finance_Projected_Financials_File_Upload: form3Files,
                Application_submission_name: llpName,
                Application_submission_Submission_Date: llpDate,
                Application_submission_status: llpStatus,
                Application_submission_File_Upload: llpFiles,
                Application_submission: appSubVal,
                Application_registration_number: appSubVal,
                Application_submission_Portal_User_ID: appPortalId,
                Application_submission_Portal_Password: appPortalPwd,
                Director_ITR_Doc_collection: itrDocCollection,
                Director_ITR_File_required: itrFileRequired,
                Director_ITR_Company_ITR_name: itrName,
                Director_ITR_Company_ITR_Date: itrDate,
                Director_ITR_Company_ITR_status: itrStatus,
                Director_ITR_Company_ITR_File_Upload: itrFiles,
                DPR_Pitch_deck_creation_name: dprName,
                DPR_Pitch_deck_creation_Date: dprDate,
                DPR_Pitch_deck_creation_status: dprStatus,
                DPR_Pitch_deck_creation_File_Upload: dprFiles,
                sectionsData
              };
            };

            const internalOpsFieldsParam = [
              'id', 'Name', 'Parent_Record_Deal', 'Team_Type', 'Operation_Stage', 'Team_Leader_TL', 'Team_Member_TM', 'Created_Time', 'Modified_Time',
              'Doc_collection_name', 'Doc_collection_Date', 'Doc_collection_status', 'Doc_collection_File_Upload',
              'Name_Application_name', 'Name_Application_approved_name', 'Name_Application_date', 'Name_Application_status', 'Name_Application_File_Upload',
              'DSC_Creation_name', 'DSC_Creation_Date', 'DSC_Creation_status',
              'Final_Filing_name', 'Final_Filing_Final_Approval_Name', 'Final_Filing_Date', 'Final_Filing_DOI_Date', 'Final_Filing_status',
              'Board_Resolution_name', 'Board_Resolution_Date', 'Board_Resolution_status', 'Board_Resolution_File_Upload',
              'Share_Certificate_name', 'Share_Certificate_Date', 'Share_Certificate_status', 'Share_Certificate_File_Upload',
              'Application_submission_name', 'Application_submission_Submission_Date', 'Application_submission_status', 'Application_submission_File_Upload',
              'Application_registration_number', 'Application_submission', 'Application_submission_Portal_User_ID', 'Application_submission_Portal_Password',
              'Director_ITR_Company_ITR_name', 'Director_ITR_Company_ITR_status', 'Director_ITR_Company_ITR_File_Upload',
              'DPR_Pitch_deck_creation_name', 'DPR_Pitch_deck_creation_File_Upload',
              'ADT_1_File_Upload', 'INC_20_A_File_Upload',
              'After_Allocation_Workflow', 'CA_CS_1', 'CA_CS_2', 'Company_Type', 'Tag'
            ].join(',');

            if (req.method === 'GET') {
              const dealId = urlObj.searchParams.get('deal_id') || urlObj.searchParams.get('dealId');
              res.setHeader('Content-Type', 'application/json');
              try {
                let accessToken = await getAccessToken(env);
                let numericDealId = dealId;
                if (dealId && !/^\d{15,}$/.test(String(numericDealId).trim())) {
                  try {
                    const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
                    const dlMatch = String(dealId).match(/\b(DL-\d+)\b/i);
                    const targetDl = dlMatch ? dlMatch[1].toUpperCase() : '';
                    const sRes = await fetch(`${apiBase}/crm/v8/${moduleName}/search?word=${encodeURIComponent(targetDl || dealId)}&fields=id,Deal_Name`, {
                      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                    });
                    if (sRes.ok) {
                      const sData: any = await sRes.json();
                      const matched = (sData.data || [])[0];
                      if (matched?.id) numericDealId = String(matched.id);
                    }
                  } catch (_) {}
                }
                let crmRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}/search?criteria=${encodeURIComponent(OCTOBER_2026_CRITERIA)}&fields=${internalOpsFieldsParam}&per_page=200`, {
                  headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                });
                if (!crmRes.ok && (crmRes.status === 400 || crmRes.status === 404)) {
                  crmRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}?fields=${internalOpsFieldsParam}&per_page=200`, {
                    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                  });
                }
                if (crmRes && crmRes.status === 200) {
                  const crmData: any = await crmRes.json();
                  let rawList = crmData.data || [];
                  if (dealId) {
                    const targetDId = String(numericDealId || dealId).trim().toLowerCase();
                    rawList = rawList.filter((r: any) => {
                      const parentId = String(r.Parent_Record_Deal?.id || '').trim().toLowerCase();
                      return parentId === targetDId;
                    });
                  }
                  // Dual-layer defense: strictly filter internal operations for October 2026 or later
                  rawList = rawList.filter((r: any) => {
                    if (!r) return false;
                    const ct = r.Created_Time || r.created_time || r.CreatedTime;
                    if (!ct) return true;
                    const createdMs = new Date(ct).getTime();
                    return !isNaN(createdMs) ? createdMs >= OCTOBER_2026_START_MS : true;
                  });
                  const normalized = rawList.map(normalizeZohoOperationRecord);
                  return res.end(JSON.stringify({ success: true, data: normalized }));
                } else if (crmRes && crmRes.status === 204) {
                  return res.end(JSON.stringify({ success: true, data: [] }));
                }
              } catch (_) {}
              return res.end(JSON.stringify({ success: true, data: [] }));
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                res.setHeader('Content-Type', 'application/json');
                let parsed: any = {};
                try { parsed = JSON.parse(body); } catch (_) {}
                const rawRecords = Array.isArray(parsed.allocations) ? parsed.allocations : (Array.isArray(parsed.data) ? parsed.data : [parsed]);

                let accessToken = await getAccessToken(env);

                // Helper to resolve deal ID if needed
                for (const r of rawRecords) {
                  const directDealId = r.Deal_ID?.id || (typeof r.Deal_ID === 'string' ? r.Deal_ID : '') || (r.Parent_Record_Deal?.id || (typeof r.Parent_Record_Deal === 'string' ? r.Parent_Record_Deal : '')) || (r as any).zohoDealId;
                  if (directDealId && !/^\d{15,}$/.test(String(directDealId).trim())) {
                    try {
                      const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
                      const dlMatch = String(directDealId).match(/\b(DL-\d+)\b/i) || String(r.Deal_Name || '').match(/\b(DL-\d+)\b/i);
                      const targetDl = dlMatch ? dlMatch[1].toUpperCase() : '';
                      const sRes = await fetch(`${apiBase}/crm/v8/${moduleName}/search?word=${encodeURIComponent(targetDl || directDealId)}&fields=id,Deal_Name`, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                      });
                      if (sRes.ok) {
                        const sData: any = await sRes.json();
                        const matched = (sData.data || []).find((d: any) => {
                          const dName = String(d.Deal_Name || '').toUpperCase();
                          return (targetDl && dName.includes(targetDl)) || (r.Deal_Name && dName.includes(String(r.Deal_Name).toUpperCase()));
                        }) || (sData.data || [])[0];
                        if (matched?.id) {
                          r.Parent_Record_Deal = { id: String(matched.id), name: r.Deal_Name };
                          r.Deal_ID = String(matched.id);
                        }
                      }
                    } catch (_) {}
                  }
                }

                // Save in local persistent allocations store
                try {
                  const store = getStoredAllocations();
                  const normServiceName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]/g, '');
                  for (const r of rawRecords) {
                    const recId = r.id || r.zohoId;
                    const dId = r.Parent_Record_Deal?.id || (typeof r.Parent_Record_Deal === 'string' ? r.Parent_Record_Deal : '') || (r.Deal_ID?.id || (typeof r.Deal_ID === 'string' ? r.Deal_ID : ''));
                    const sName = normServiceName(r.Name || r.Service_Scheme);
                    if (recId) store[String(recId)] = { ...(store[String(recId)] || {}), ...r };
                    if (dId && sName) store[`${dId}__${sName}`] = { ...(store[`${dId}__${sName}`] || {}), ...r };
                  }
                  saveStoredAllocations(store);
                } catch (stErr) {
                  console.warn('[Vite Plugin] Warning saving stored allocations:', stErr);
                }

                const zohoRecords = rawRecords.map(formatRecordForZohoOperation);
                try {
                  // Fetch existing records in Zoho CRM to match by normalized service name
                  let existingCrmList: any[] = [];
                  try {
                    const exRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}?fields=id,Name,Parent_Record_Deal,Team_Type,Operation_Stage&per_page=200`, {
                      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                    });
                    if (exRes.status === 200) {
                      const exData: any = await exRes.json();
                      existingCrmList = exData?.data || [];
                    }
                  } catch (_) {}

                  const normServiceName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]/g, '');

                  const toInsert: any[] = [];
                  const toUpdate: any[] = [];
                  const seenIncoming = new Set<string>();

                  for (let i = 0; i < zohoRecords.length; i++) {
                    const zr = zohoRecords[i];
                    const rawRec = rawRecords[i];
                    const dealIdNum = zr.Parent_Record_Deal?.id || (typeof zr.Parent_Record_Deal === 'string' && /^\d{15,}$/.test(zr.Parent_Record_Deal) ? zr.Parent_Record_Deal : null);
                    const normService = normServiceName(zr.Name);

                    if (dealIdNum && normService) {
                      const inKey = `${dealIdNum}__${normService}`;
                      if (seenIncoming.has(inKey)) continue;
                      seenIncoming.add(inKey);
                    }

                    let existingMatch = null;
                    if (zr.id && /^\d{15,}$/.test(String(zr.id))) {
                      existingMatch = existingCrmList.find((rec: any) => String(rec.id) === String(zr.id));
                    } else if (dealIdNum && normService) {
                      existingMatch = existingCrmList.find((rec: any) =>
                        String(rec.Parent_Record_Deal?.id || '').trim() === String(dealIdNum).trim() &&
                        normServiceName(rec.Name || rec.Service_Scheme) === normService
                      );
                      if (existingMatch?.id) zr.id = String(existingMatch.id);
                    }

                    // Process and upload attached files to Zoho Files & Attachments API
                    try {
                      await processRecordFilesAndUpload(zr, accessToken, apiBase, opsModuleName, existingMatch);
                    } catch (fErr) {
                      console.warn('[Vite Plugin] Warning processing files for upload:', fErr);
                    }

                    if (zr.id && /^\d{15,}$/.test(String(zr.id))) {
                      toUpdate.push(zr);
                    } else {
                      toInsert.push(zr);
                    }
                  }

                  let createdData: any[] = [];
                  let updatedData: any[] = [];

                  if (toInsert.length > 0) {
                    const cleanToInsert = toInsert.map((rec: any) => {
                      const { id, ...rest } = rec;
                      return (id && /^\d{15,}$/.test(String(id))) ? { id: String(id), ...rest } : rest;
                    });
                    const insRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ data: cleanToInsert })
                    });
                    const insData: any = await insRes.json();
                    if (insRes.ok) createdData = insData.data || [];
                  }

                  if (toUpdate.length > 0) {
                    const upRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}`, {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ data: toUpdate })
                    });
                    const upData: any = await upRes.json();
                    if (upRes.ok) updatedData = upData.data || [];
                  }

                  return res.end(JSON.stringify({
                    success: true,
                    message: 'Internal operations saved successfully in Zoho CRM',
                    data: [...createdData, ...updatedData]
                  }));
                } catch (postErr) {
                  console.error('[Vite Plugin] Error syncing internal operations:', postErr);
                }
                return res.end(JSON.stringify({ success: true, message: 'Saved successfully', data: rawRecords }));
              });
              return;
            }

            if (req.method === 'PUT') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                res.setHeader('Content-Type', 'application/json');
                let parsed: any = {};
                try { parsed = JSON.parse(body); } catch (_) {}

                let accessToken = await getAccessToken(env);

                const directDealId = parsed.Deal_ID?.id || (typeof parsed.Deal_ID === 'string' ? parsed.Deal_ID : '') || (parsed.Parent_Record_Deal?.id || (typeof parsed.Parent_Record_Deal === 'string' ? parsed.Parent_Record_Deal : ''));
                if (directDealId && !/^\d{15,}$/.test(String(directDealId).trim())) {
                  try {
                    const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
                    const dlMatch = String(directDealId).match(/\b(DL-\d+)\b/i) || String(parsed.Deal_Name || '').match(/\b(DL-\d+)\b/i);
                    const targetDl = dlMatch ? dlMatch[1].toUpperCase() : '';
                    const dRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200&fields=id,Deal_Name`, {
                      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                    });
                    if (dRes.ok) {
                      const dData: any = await dRes.json();
                      const matched = (dData.data || []).find((d: any) => {
                        const dName = String(d.Deal_Name || '').toUpperCase();
                        return (targetDl && dName.includes(targetDl)) || (parsed.Deal_Name && dName.includes(String(parsed.Deal_Name).toUpperCase()));
                      });
                      if (matched?.id) {
                        parsed.Parent_Record_Deal = { id: String(matched.id), name: parsed.Deal_Name };
                        parsed.Deal_ID = { id: String(matched.id), name: parsed.Deal_Name };
                      }
                    }
                  } catch (_) {}
                }

                let zohoRecord = formatRecordForZohoOperation(parsed);
                const hasZohoId = Boolean(zohoRecord.id && /^\d{15,}$/.test(String(zohoRecord.id)));

                // Persist immediately to local allocations store
                try {
                  const store = getStoredAllocations();
                  const normServiceName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]/g, '');
                  const recId = zohoRecord.id || parsed.id || parsed.zohoId;
                  const dId = zohoRecord.Parent_Record_Deal?.id || (typeof zohoRecord.Parent_Record_Deal === 'string' ? zohoRecord.Parent_Record_Deal : '') || parsed.Parent_Record_Deal?.id || (typeof parsed.Parent_Record_Deal === 'string' ? parsed.Parent_Record_Deal : '');
                  const sName = normServiceName(zohoRecord.Name || parsed.Name || parsed.Service_Scheme);
                  if (recId) store[String(recId)] = { ...(store[String(recId)] || {}), ...parsed, ...zohoRecord };
                  if (dId && sName) store[`${dId}__${sName}`] = { ...(store[`${dId}__${sName}`] || {}), ...parsed, ...zohoRecord };
                  saveStoredAllocations(store);
                } catch (stErr) {
                  console.warn('[Vite Plugin] Warning saving allocation store in PUT:', stErr);
                }

                try {
                  let existingZohoRecord: any = null;

                  if (!hasZohoId) {
                    const dealIdNum = zohoRecord.Parent_Record_Deal?.id || (typeof zohoRecord.Parent_Record_Deal === 'string' && /^\d{15,}$/.test(zohoRecord.Parent_Record_Deal) ? zohoRecord.Parent_Record_Deal : null);
                    if (dealIdNum && zohoRecord.Name) {
                      try {
                        const searchRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}?fields=${internalOpsFieldsParam}&per_page=200`, {
                          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                        });
                        if (searchRes.ok) {
                          const sData: any = await searchRes.json();
                          const normTarget = String(zohoRecord.Name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          const found = (sData.data || []).find((rec: any) => {
                            const pId = String(rec.Parent_Record_Deal?.id || '').trim();
                            const rName = String(rec.Name || rec.Service_Scheme || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                            return pId === String(dealIdNum).trim() && (rName === normTarget || rName.includes(normTarget) || normTarget.includes(rName));
                          });
                          if (found?.id) {
                            zohoRecord.id = String(found.id);
                            existingZohoRecord = found;
                          }
                        }
                      } catch (_) {}
                    }
                  } else {
                    try {
                      const getRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}/${zohoRecord.id}?fields=${internalOpsFieldsParam}`, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                      });
                      if (getRes.ok) {
                        const gData: any = await getRes.json();
                        existingZohoRecord = (gData.data || [])[0];
                      }
                    } catch (_) {}
                  }

                  // Process and upload attached files to Zoho CRM Files & Attachments APIs
                  try {
                    await processRecordFilesAndUpload(zohoRecord, accessToken, apiBase, opsModuleName, existingZohoRecord);
                  } catch (fErr) {
                    console.warn('[Vite Plugin] Warning processing files in PUT:', fErr);
                  }

                  if (zohoRecord.id && /^\d{15,}$/.test(String(zohoRecord.id))) {
                    const crmRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}`, {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ data: [zohoRecord] })
                    });
                    if (crmRes.ok) {
                      const crmData: any = await crmRes.json();
                      return res.end(JSON.stringify({ success: true, message: 'Updated successfully in Zoho CRM', data: crmData.data }));
                    }
                  } else {
                    delete zohoRecord.id;
                    const crmRes = await fetch(`${apiBase}/crm/v8/${opsModuleName}`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ data: [zohoRecord] })
                    });
                    if (crmRes.ok) {
                      const crmData: any = await crmRes.json();
                      return res.end(JSON.stringify({ success: true, message: 'Created successfully in Zoho CRM', data: crmData.data }));
                    }
                  }
                } catch (putErr) {
                  console.error('[Vite Plugin] Exception in PUT internal-operations:', putErr);
                }
                return res.end(JSON.stringify({ success: true, message: 'Updated successfully', data: parsed }));
              });
              return;
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
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
        if ((pathname === '/api/zoho/get-deals' || pathname === '/api/deals') && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const dealFields = 'id,Deal_Name,Account_Name,Contact_Name,Company,Company_Name,Client_Name,Clients,Owner,Employee,Stage,Pipeline,Closing_Date,Booking_Date,Payment_Date,Created_Time,Modified_Time,Amount,Total_deal_amount_inclusive_of_gst,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Total_Pending_Amount,Pending_amount,amount_if_you_have_kindly_put_0,Choose_Wisely,Service_Name,Service_Count,Subform_1,Legal,Client_contact_detail,Client_Email_address,Gst_number,Pan_number,Aadhaar_Card,Billing_address,Company_address,City,State,Bank_details,Accounts_remark,Remark,Remarks,Description,Partner_BDM,Has_Partner_BDM,Partner_BDM_Amount,Partner_BDM_ID,Quotation,Payment_verifications,Deal_payment_screenshot';
            const milestoneFields = 'id,R1_Received_amount23,R1_Received_Screenshot,R1_Received_by_BDM1,R1_Received_by_BDM2,R1_Payment_Verification,R1_Bank_type,R1_Legal_verification,R2_Received_amount12,R2_Received_Screenshot,R2_Received_by_BDM1,R2_Received_by_BDM2,R2_Payment_Verification,R2_Bank_type,R2_Legal_verification,DPR_status_change_date,R3_Received_amount,R3_Received_Screenshot,R3_Received_by_BDM1,R3_Received_by_BDM2,R3_Payment_Verification,R3_Bank_type,R3_Legal_verification,Date_of_status_change,R4_Received_amount,R4_Received_Screenshot,R4_Payment_Verification,R4_Bank_type,R4_Legal_verification,Date_of_status_change_f,R5_Received_amount,R5_Payment_Verification,R5_Bank_type,R5_Legal_verification,Document_collection_Pitch_deck_creation_DPR_date,R6_Received_amount,R6_Payment_Verification,R6_Bank_type,R6_Legal_verification,Document_sent_date,R7_Received_amount,R7_Payment_Verification,R7_Bank_type,R7_Legal_verification,Finance_status_change_date,R8_Received_amount,R8_Payment_Verification,R8_Bank_type,R8_Legal_verification,Date_of_financedate_change';
            const rawCriteria = urlObj.searchParams.get('criteria') || '';
            const criteria = combineWithOctoberFilter(rawCriteria, 'Deals');
            urlObj.searchParams.set('criteria', criteria);
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/search?fields=${dealFields}&${paginationQuery}`;
            const milestoneEndpoint = `${apiBase}/crm/v8/${moduleName}/search?fields=${milestoneFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Deals from Zoho CRM (${moduleName}) [criteria: ${criteria || 'none'}]`);

            let [crmRes, milestoneRes] = await Promise.all([
              fetch(crmEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              }),
              fetch(milestoneEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              }).catch(() => null)
            ]);

            // Fallback if search criteria returns 400 or 404
            if (!crmRes.ok && (crmRes.status === 400 || crmRes.status === 404)) {
              const fallbackUrl = new URL(urlObj.toString());
              fallbackUrl.searchParams.delete('criteria');
              const fallbackQuery = buildZohoPaginationQuery(fallbackUrl);
              const fallbackResults = await Promise.all([
                fetch(`${apiBase}/crm/v8/${moduleName}?fields=${dealFields}&${fallbackQuery}`, {
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                }),
                fetch(`${apiBase}/crm/v8/${moduleName}?fields=${milestoneFields}&${fallbackQuery}`, {
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                }).catch(() => null)
              ]);
              if (fallbackResults[0].ok || fallbackResults[0].status === 204) {
                crmRes = fallbackResults[0];
                if (fallbackResults[1]) milestoneRes = fallbackResults[1];
              }
            }

            let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

            if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              const retryResults = await Promise.all([
                fetch(crmEndpoint, {
                  method: 'GET',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                }),
                fetch(milestoneEndpoint, {
                  method: 'GET',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                }).catch(() => null)
              ]);
              crmRes = retryResults[0];
              milestoneRes = retryResults[1];
              crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
            }

            // Merge milestone fields into deals
            if (crmData?.data && Array.isArray(crmData.data) && milestoneRes && milestoneRes.ok && milestoneRes.status === 200) {
              try {
                const milestoneData: any = await milestoneRes.json();
                if (Array.isArray(milestoneData?.data)) {
                  const milestoneMap = new Map<string, any>();
                  milestoneData.data.forEach((m: any) => {
                    if (m && m.id) milestoneMap.set(String(m.id), m);
                  });
                  crmData.data.forEach((deal: any) => {
                    if (deal && deal.id) {
                      const m = milestoneMap.get(String(deal.id));
                      if (m) Object.assign(deal, m);
                    }
                  });
                }
              } catch (_) {}
            }

            // Dual-layer defense: strictly filter deals by October 2026 date
            if (crmData?.data && Array.isArray(crmData.data)) {
              crmData.data = crmData.data.filter((deal: any) => {
                if (!deal) return false;
                const rawDate = deal.Booking_Date || deal.Payment_Date || deal.Closing_Date || deal.Created_Time || deal.date;
                if (!rawDate) return false;
                const ms = new Date(rawDate).getTime();
                return !isNaN(ms) ? ms >= OCTOBER_2026_START_MS : false;
              });
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

              // 1. Locate the employee record in Employee module using smart matcher
              let employeeList = await getCachedEmployeeRecords(env);
              let matched = employeeList.find(e => 
                (zohoId && String(e.id) === zohoId) ||
                (email && matchesEmployeeQuery(e, email))
              );

              if (!matched) {
                employeeList = await getCachedEmployeeRecords(env, true);
                matched = employeeList.find(e => 
                  (zohoId && String(e.id) === zohoId) ||
                  (email && matchesEmployeeQuery(e, email))
                );
              }

              // If matched in Employee module, update Password via PUT
              if (matched && matched.id) {
                const updatePayload = {
                  id: matched.id,
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

                // Update in-memory cache immediately
                matched.Password = password;

                res.setHeader('Content-Type', 'application/json');
                if (crmData.data?.[0]?.code === 'SUCCESS') {
                  return res.end(JSON.stringify({
                    success: true,
                    zohoId: matched.id,
                    message: `Password updated successfully in Zoho CRM for employee (${email})`,
                    data: crmData.data[0],
                  }));
                }
              }

              // 2. If record does not exist in Employee custom module, fetch from Zoho Users and insert
              let userMatch: any = null;
              try {
                let usersRes = await fetch(`${apiBase}/crm/v8/users?type=AllUsers`, {
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                });
                if (usersRes.status === 200) {
                  const uData: any = await usersRes.json();
                  userMatch = uData.users?.find((u: any) =>
                    (u.email && u.email.toLowerCase() === email.toLowerCase()) ||
                    (zohoId && String(u.id) === zohoId) ||
                    (email && (u.first_name?.toLowerCase() === email.toLowerCase() || u.full_name?.toLowerCase() === email.toLowerCase()))
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

              // Refresh employee cache with new record
              await getCachedEmployeeRecords(env, true);

              const newZohoId = insertData.data?.[0]?.details?.id || zohoId;
              res.setHeader('Content-Type', 'application/json');
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
              const cleanEmail = emailToSearch.trim();
              if (!cleanEmail) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, message: 'Email parameter is required' }));
              }

              const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';

              // Step 1: Look in cached Employee module records first
              let employeeList = await getCachedEmployeeRecords(env);
              let matchedRecord: any = employeeList.find(e => matchesEmployeeQuery(e, cleanEmail));

              // If not found in cache, force refresh from Zoho CRM and check again
              if (!matchedRecord) {
                employeeList = await getCachedEmployeeRecords(env, true);
                matchedRecord = employeeList.find(e => matchesEmployeeQuery(e, cleanEmail));
              }

              // Step 2: Fallback search in Zoho CRM Users (/crm/v8/users?type=AllUsers)
              if (!matchedRecord) {
                try {
                  let accessToken = await getAccessToken(env);
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
                    const cleanQ = cleanEmail.toLowerCase();
                    const foundUser = rawUsers.find((u: any) => {
                      const uEmail = (u.email || '').toLowerCase().trim();
                      const uFirst = (u.first_name || '').toLowerCase().trim();
                      const uFull = (u.full_name || '').toLowerCase().trim();
                      const uId = String(u.id || '').toLowerCase().trim();
                      return uEmail === cleanQ ||
                             uFirst === cleanQ ||
                             uFull === cleanQ ||
                             uId === cleanQ ||
                             (cleanQ.includes('@') && uEmail && (uEmail.split('@')[0] === cleanQ.split('@')[0])) ||
                             (!cleanQ.includes('@') && uEmail && (uEmail.split('@')[0] === cleanQ));
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
            const employeeFields = 'id,Name,Middle_Name,Last_Name,Employment_ID,Contact_Number,Personal_Email_Address,Email,Gender,Marital_Status,Nationality,Blood_Group,Date_of_Birth,Date_of_Joining,Department,Designation_Job_Title,System_Role,Employment_Type,Permanent_Address,Current_Address,Education_Qualification,Professional_Certifications,Key_Skills,Languages_Known,Previous_Employer,Total_Experience,Emergency_Contact_First_Name,Emergency_Contact_Last_Name,Emergency_Contact_Number,Relationship_with_Contact,Who_is_the_Team_Leader_TL,Reporting_Manager,Pan_Number,Aadhaar_Number,Passport_Number,Driving_License_Number,Bank_Account_Number,Bank_Name,IFSC_Code,PF_Applicable,PF_Number,ESIC_Number,UAN_Number,Medical_Insurance_Number,Salary_Entity,Company_Entity,Password';
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
            const rawCriteria = urlObj.searchParams.get('criteria') || '';
            const criteria = combineWithOctoberFilter(rawCriteria);
            urlObj.searchParams.set('criteria', criteria);
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/search?fields=${companyFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Companies from Zoho CRM (${moduleName}) [criteria: ${criteria}]`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            // Fallback if search criteria returns 400 or 404
            if (!crmRes.ok && (crmRes.status === 400 || crmRes.status === 404)) {
              const fallbackUrl = new URL(urlObj.toString());
              fallbackUrl.searchParams.delete('criteria');
              const fallbackQuery = buildZohoPaginationQuery(fallbackUrl);
              crmRes = await fetch(`${apiBase}/crm/v8/${moduleName}?fields=${companyFields}&${fallbackQuery}`, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
            }

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

            // Dual-layer defense: strictly filter companies by October 2026 Created_Time
            if (crmData?.data && Array.isArray(crmData.data)) {
              crmData.data = crmData.data.filter((c: any) => {
                if (!c) return false;
                const ct = c.Created_Time || c.created_time || c.CreatedTime;
                if (!ct) return true;
                const ms = new Date(ct).getTime();
                return !isNaN(ms) ? ms >= OCTOBER_2026_START_MS : true;
              });
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
            const rawCriteria = urlObj.searchParams.get('criteria') || '';
            const criteria = combineWithOctoberFilter(rawCriteria);
            urlObj.searchParams.set('criteria', criteria);
            const paginationQuery = buildZohoPaginationQuery(urlObj);
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/search?fields=${clientFields}&${paginationQuery}`;

            console.log(`[Vite Zoho Plugin] Fetching live Clients from Zoho CRM (${moduleName}) [criteria: ${criteria}]`);

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
            });

            // Fallback if search criteria returns 400 or 404
            if (!crmRes.ok && (crmRes.status === 400 || crmRes.status === 404)) {
              const fallbackUrl = new URL(urlObj.toString());
              fallbackUrl.searchParams.delete('criteria');
              const fallbackQuery = buildZohoPaginationQuery(fallbackUrl);
              crmRes = await fetch(`${apiBase}/crm/v8/${moduleName}?fields=${clientFields}&${fallbackQuery}`, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
            }

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

            // Dual-layer defense: strictly filter clients by October 2026 Created_Time
            if (crmData?.data && Array.isArray(crmData.data)) {
              crmData.data = crmData.data.filter((client: any) => {
                if (!client) return false;
                const ct = client.Created_Time || client.created_time || client.CreatedTime;
                if (!ct) return true;
                const ms = new Date(ct).getTime();
                return !isNaN(ms) ? ms >= OCTOBER_2026_START_MS : true;
              });
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

        // Delete leave, employee, company, client, deal, quotation, policy, calendar, dsr, query, internal-operation or generic record endpoint (Module API Name: Leave_Management, Employee, Companies, Clients, Deals, Quotations, Company_Policies, Company_Calendar, DSR, Cases, Operation_Internal_CRM, etc.)
        if ((pathname === '/api/zoho/delete-leave' || pathname === '/api/zoho/delete-employee' || pathname === '/api/zoho/delete-company' || pathname === '/api/zoho/delete-client' || pathname === '/api/zoho/delete-deal' || pathname === '/api/zoho/delete-quotation' || pathname === '/api/zoho/delete-policy' || pathname === '/api/zoho/delete-calendar' || pathname === '/api/zoho/delete-dsr' || pathname === '/api/zoho/delete-query' || pathname === '/api/zoho/delete-internal-operation' || pathname === '/api/zoho/delete-record') && req.method === 'DELETE') {
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
              else if (pathname === '/api/zoho/delete-internal-operation') moduleName = env.VITE_ZOHO_INTERNAL_OPERATIONS_MODULE_NAME || 'Operation_Internal_CRM';

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

            // If Attachments endpoint returned 404 or 400, fallback to field attachments or files API
            if (!crmRes.ok && (crmRes.status === 404 || crmRes.status === 400)) {
              const fieldEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/actions/download_fields_attachment?fields_attachment_id=${attachmentId}`;
              const fieldRes = await fetch(fieldEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
              if (fieldRes.ok) {
                crmRes = fieldRes;
              } else {
                const fileEndpoint = `${apiBase}/crm/v8/files?id=${attachmentId}`;
                const fileRes = await fetch(fileEndpoint, {
                  method: 'GET',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                });
                if (fileRes.ok) {
                  crmRes = fileRes;
                }
              }
            }

            if (!crmRes.ok) {
              const errText = await crmRes.text();
              res.statusCode = crmRes.status;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: 'Failed to download attachment from Zoho CRM', details: errText }));
            }

            const arrayBuf = await crmRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            const contentType = crmRes.headers.get('content-type') || 'application/octet-stream';
            const customName = urlObj.searchParams.get('name') || '';
            const safeName = (customName || `attachment-${attachmentId}`).replace(/[^\w\s.-]/gi, '_');
            const contentDisp = isPreview ? 'inline' : (customName ? `attachment; filename="${safeName}"` : (crmRes.headers.get('content-disposition') || `attachment; filename="${safeName}"`));

            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', contentDisp);
            res.setHeader('Content-Length', buffer.length.toString());
            res.setHeader('Cache-Control', 'public, max-age=3600');

            return res.end(buffer);
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Download attachment server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Download Custom Field Attachment (e.g. Deal_payment_screenshot)
        if ((pathname === '/api/zoho/download-field-attachment' || pathname === '/api/zoho/download-fields-attachment') && req.method === 'GET') {
          try {
            const recordId = urlObj.searchParams.get('recordId') || urlObj.searchParams.get('id') || '';
            const attachmentId = urlObj.searchParams.get('attachmentId') || urlObj.searchParams.get('fields_attachment_id') || '';
            const fileId = urlObj.searchParams.get('fileId') || urlObj.searchParams.get('File_Id__s') || '';
            const moduleName = urlObj.searchParams.get('module') || 'Deals';
            const isPreview = urlObj.searchParams.get('preview') !== 'false';

            if (!fileId && (!recordId || !attachmentId)) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: 'Either "fileId" or both "recordId" and "attachmentId" are required' }));
            }

            let accessToken = await getAccessToken(env);
            const domain = env.VITE_ZOHO_DOMAIN || 'in';
            const apiBase = env.VITE_ZOHO_API_URL || (domain === 'com' ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');

            let crmEndpoint = '';
            if (recordId && attachmentId) {
              crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/actions/download_fields_attachment?fields_attachment_id=${attachmentId}`;
            } else {
              crmEndpoint = `${apiBase}/crm/v8/files?id=${fileId}`;
            }

            let crmRes = await fetch(crmEndpoint, {
              method: 'GET',
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
            });

            if (crmRes.status === 401) {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              crmRes = await fetch(crmEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
              });
            }

            if (!crmRes.ok) {
              const errText = await crmRes.text();
              res.statusCode = crmRes.status;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, message: 'Failed to download field attachment from Zoho CRM', details: errText }));
            }

            const contentType = crmRes.headers.get('content-type') || 'image/png';
            const contentDisp = crmRes.headers.get('content-disposition') || (isPreview ? 'inline' : `attachment; filename="screenshot-${attachmentId || fileId}.png"`);
            const contentLength = crmRes.headers.get('content-length');

            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', isPreview ? 'inline' : contentDisp);
            if (contentLength) res.setHeader('Content-Length', contentLength);
            res.setHeader('Cache-Control', 'public, max-age=86400');

            const arrayBuf = await crmRes.arrayBuffer();
            return res.end(Buffer.from(arrayBuf));
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Download field attachment error:', err);
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

        // Upload Record Photo / Image endpoint (v8 Upload Record Image API)
        // Documentation: https://www.zoho.com/crm/developer/docs/api/v8/upload-image.html
        // e.g. POST https://www.zohoapis.com/crm/v8/Deals/{recordId}/photo
        if ((pathname === '/api/zoho/upload-deal-photo' || pathname === '/api/zoho/upload-photo') && req.method === 'POST') {
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
            const moduleName = (formData.get('module') as string) || 'Deals';
            const fieldApiName = (formData.get('field_api_name') as string) || '';

            if (!file || !recordId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: false,
                message: 'Both "file" and "recordId" are required to upload record photo/image.',
              }));
            }

            let accessToken = await getAccessToken(env);
            const domain = env.VITE_ZOHO_DOMAIN || 'in';
            const apiBase = env.VITE_ZOHO_API_URL || (domain === 'com' ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');
            let crmPhotoEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/photo`;
            if (fieldApiName) {
              crmPhotoEndpoint += `?field_api_name=${encodeURIComponent(fieldApiName)}`;
            }

            console.log(`[Vite Zoho Plugin] Uploading record photo (${file.name}) to: ${crmPhotoEndpoint}`);

            const zohoForm = new FormData();
            zohoForm.append('file', file, file.name);

            let photoRes = await fetch(crmPhotoEndpoint, {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
              },
              body: zohoForm,
            });

            let photoData: any = await photoRes.json();

            if (photoRes.status === 401 || photoData.code === 'INVALID_TOKEN') {
              cachedToken = null;
              accessToken = await getAccessToken(env);
              photoRes = await fetch(crmPhotoEndpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Zoho-oauthtoken ${accessToken}`,
                },
                body: zohoForm,
              });
              photoData = await photoRes.json();
            }

            res.setHeader('Content-Type', 'application/json');
            if (photoData.code === 'SUCCESS' || photoData.status === 'success') {
              console.log('[Vite Zoho Plugin] Photo uploaded successfully to Zoho record!');
              return res.end(JSON.stringify({
                success: true,
                message: photoData.message || 'Photo uploaded successfully to Zoho CRM record',
                data: photoData,
              }));
            } else {
              res.statusCode = 400;
              const errMsg = photoData.message || 'Failed to upload photo in Zoho CRM';
              console.error('[Vite Zoho Plugin] Photo upload failed:', errMsg, photoData);
              return res.end(JSON.stringify({
                success: false,
                message: errMsg,
                errorDetails: photoData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Photo server error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
          }
        }

        // Upload Custom Image Field (v8 Files API -> Record Update)
        // Uploads file to /crm/v8/files then sets { [fieldApiName]: [{ File_Id__s: fileId }] } on Deals/{recordId}
        if ((pathname === '/api/zoho/upload-deal-image-field' || pathname === '/api/zoho/upload-image-field') && req.method === 'POST') {
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
            const rawFiles = (formData.getAll('files') as any[]).concat(formData.getAll('file') as any[]);
            const files: File[] = rawFiles.filter((f): f is File => f && typeof f === 'object' && typeof (f as any).name === 'string');
            const recordId = (formData.get('recordId') as string) || '';
            const fieldApiName = (formData.get('field_api_name') as string) || 'R1_Received_Screenshot';
            const moduleName = (formData.get('module') as string) || 'Deals';

            if (files.length === 0 || !recordId || !fieldApiName) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: false,
                message: '"file" (or "files"), "recordId", and "field_api_name" are required to upload into an image field.',
              }));
            }

            let accessToken = await getAccessToken(env);
            const domain = env.VITE_ZOHO_DOMAIN || 'in';
            const apiBase = env.VITE_ZOHO_API_URL || (domain === 'com' ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');

            console.log(`[Vite Zoho Plugin] Uploading ${files.length} image(s) to ZFS for field ${fieldApiName} on ${recordId}`);

            // Step 1: Upload all files to /crm/v8/files
            const fileIds: string[] = [];
            for (const file of files) {
              const filesForm = new FormData();
              filesForm.append('file', file, file.name);

              let filesRes = await fetch(`${apiBase}/crm/v8/files`, {
                method: 'POST',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                body: filesForm,
              });
              let filesData: any = await filesRes.json().catch(() => null);

              if (filesRes.status === 401 || filesData?.code === 'INVALID_TOKEN' || filesData?.code === 'OAUTH_SCOPE_MISMATCH') {
                cachedToken = null;
                accessToken = await getAccessToken(env);
                filesRes = await fetch(`${apiBase}/crm/v8/files`, {
                  method: 'POST',
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                  body: filesForm,
                });
                filesData = await filesRes.json().catch(() => null);
              }

              const fileId = filesData?.data?.[0]?.details?.id;
              if (fileId) {
                fileIds.push(fileId);
              } else {
                console.warn('[Vite Zoho Plugin] Single file upload warning:', file.name, filesData);
              }
            }

            if (fileIds.length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: false,
                message: 'Failed to upload image file(s) to Zoho File System',
              }));
            }

            // Step 2: Update Deal record
            const updatePayload = {
              data: [
                {
                  id: recordId,
                  [fieldApiName]: fileIds.map(fid => ({
                    File_Id__s: fid,
                  })),
                },
              ],
            };

            let updateRes = await fetch(`${apiBase}/crm/v8/${moduleName}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updatePayload),
            });
            let updateData: any = await updateRes.json().catch(() => null);

            res.setHeader('Content-Type', 'application/json');
            if (updateRes.ok && updateData?.data?.[0]?.code === 'SUCCESS') {
              console.log(`[Vite Zoho Plugin] Image linked to ${fieldApiName} successfully!`);
              return res.end(JSON.stringify({
                success: true,
                fileId: fileIds[0],
                fileIds,
                message: `Image successfully uploaded into ${fieldApiName} field on Zoho deal`,
                data: updateData.data[0],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: updateData?.data?.[0]?.message || updateData?.message || `Failed to link image to ${fieldApiName} in Zoho CRM`,
                errorDetails: updateData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Image field error:', err);
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
