import type { IncomingMessage, ServerResponse } from 'http';

// Interface for standard Vercel request/response (compatible with Node http)
export interface ApiRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
  body?: any;
  method?: string;
  url?: string;
}

export interface ApiResponse extends ServerResponse {
  status?: (statusCode: number) => ApiResponse;
  json?: (data: any) => void;
  send?: (data: any) => void;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getAccessToken(): Promise<string> {
  const clientId = process.env.VITE_ZOHO_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '1000.ENHQL8XIKM7Q7AO7PGPY1EUICG80QF';
  const clientSecret = process.env.VITE_ZOHO_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || 'c5659d87156496be12bea1489a7a2f4500c7241131';
  const refreshToken = process.env.VITE_ZOHO_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN || '1000.bdf58bb9452babb83e6f001ec50ea44f.7c72197a07b2fb22502ce57112cbae91';

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

  const accountsUrl = process.env.VITE_ZOHO_ACCOUNTS_URL || process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
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

export function formatDateForZoho(dateStr?: string | null): string | null {
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

export function buildQuotationZohoPayload(quotation: any): Record<string, any> {
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

  return payload;
}

export function buildDealZohoPayload(deal: any): Record<string, any> {
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
    Payment_Date: bookingDate,
    Payment_verifications: true,
    Payment_Type: 'Online',
  };

  if (deal.zohoId) {
    payload.id = String(deal.zohoId);
  }

  if (companyName) {
    payload.Account_Name = companyName;
    payload.Company_Name = companyName;
    payload.Company_name = companyName;
  }
  const compZohoId = deal.companyZohoId || fd.companyZohoId;
  if (compZohoId) {
    payload.Company = { id: String(compZohoId) };
  }

  if (clientName) {
    payload.Contact_Name = clientName;
    payload.Client_Name = clientName;
  }
  const clZohoId = deal.clientZohoId || fd.clientZohoId;
  if (clZohoId) {
    payload.Clients = { id: String(clZohoId) };
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

  const gst = fd.gstNumber || deal.gstNumber;
  if (gst) {
    payload.Gst_number = String(gst).toUpperCase();
  }
  const pan = fd.companyPan || fd.panCard || deal.panNumber;
  if (pan) {
    payload.Pan_number = String(pan).toUpperCase();
  }

  const fullAddress = [fd.city, fd.state].filter(Boolean).join(', ');
  if (fullAddress) {
    payload.Billing_address = fullAddress;
    payload.Company_address = fullAddress;
  }
  if (fd.state) {
    payload.State = fd.state;
  }

  if (Array.isArray(servicesData) && servicesData.length > 0) {
    payload.Service_Count = servicesData.length;
    payload.Service_Name = servicesData.length === 1 ? servicesData[0].name : `${servicesData.length} Services`;
    payload.Subform_1 = servicesData.map((svc: any, idx: number) => {
      const itemTotalFromSvc = Number(svc.totalAmount) || 0;
      const itemGst = itemTotalFromSvc > 0 
        ? to2Dec(itemTotalFromSvc * 0.18) 
        : to2Dec((Number(svc.baseAmount) || 0) * 0.18);
      const itemBase = itemTotalFromSvc > 0 
        ? to2Dec(itemTotalFromSvc - itemGst) 
        : to2Dec(Number(svc.baseAmount) || 0);
      const itemTotal = itemTotalFromSvc > 0 ? to2Dec(itemTotalFromSvc) : to2Dec(itemBase + itemGst);

      let itemReceived = 0;
      if (grandTotalNum > 0) {
        itemReceived = to2Dec((itemTotal / grandTotalNum) * amountReceivedNum);
      } else if (servicesData.length === 1) {
        itemReceived = amountReceivedNum;
      }
      const itemPending = to2Dec(Math.max(0, itemTotal - itemReceived));

      return {
        Schemas: svc.name || 'Website Development',
        Without_GST: itemBase,
        GST_amount: itemGst,
        Agreement_amount: itemTotal,
        Received_amount: itemReceived,
        Pending_amount: itemPending,
        Payment_stages: '.',
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

  let stage = deal.stage || deal.Stage;
  if (!stage) {
    const st = String(deal.status || '').toLowerCase();
    if (st.includes('won') || st.includes('closed won') || st.includes('execut')) {
      stage = 'Operations executors';
    } else if (st.includes('account')) {
      stage = 'Account';
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

  if (deal.quotationZohoId || deal.zohoQuotationId) {
    payload.Quotation = { id: String(deal.quotationZohoId || deal.zohoQuotationId) };
  }

  return payload;
}

export function buildEmployeeZohoPayload(employee: any): Record<string, any> {
  const fd = employee.formData || {};
  const fullName = `${fd.firstName || ''} ${fd.middleName || ''} ${fd.lastName || ''}`.trim() || employee.name || 'New Employee';
  const empId = fd.empId || employee.id || '';

  const payload: Record<string, any> = {
    Name: fd.firstName || fullName,
  };

  if (employee.zohoId) {
    payload.id = String(employee.zohoId);
  }

  if (fd.middleName) payload.Middle_Name = fd.middleName;
  if (fd.lastName) payload.Last_Name = fd.lastName;

  if (empId) {
    payload.Employment_ID = empId;
  }

  const mobile = (fd.mobile || employee.mobile || '').replace(/[^0-9]/g, '');
  if (mobile) payload.Contact_Number = mobile;

  if (fd.email || employee.email) payload.Personal_Email_Address = fd.email || employee.email;
  if (fd.workEmail || employee.workEmail) payload.Email = fd.workEmail || employee.workEmail;

  if (fd.gender) payload.Gender = fd.gender;
  if (fd.maritalStatus) payload.Marital_Status = fd.maritalStatus;
  if (fd.nationality) payload.Nationality = fd.nationality;
  if (fd.bloodGroup) payload.Blood_Group = fd.bloodGroup;

  const formattedDob = formatDateForZoho(fd.dob);
  if (formattedDob) payload.Date_of_Birth = formattedDob;

  const formattedDoj = formatDateForZoho(fd.doj || employee.joined);
  if (formattedDoj) payload.Date_of_Joining = formattedDoj;

  const dept = fd.dept || employee.dept;
  if (dept) payload.Department = dept;

  const role = fd.role || employee.role;
  if (role) payload.Designation_Job_Title = role;

  const systemRole = fd.systemRole || employee.systemRole;
  if (systemRole) payload.System_Role = systemRole;

  if (fd.employmentType) payload.Employment_Type = fd.employmentType;

  if (fd.permanentAddress) payload.Permanent_Address = fd.permanentAddress;
  if (fd.currentAddress) payload.Current_Address = fd.currentAddress;

  if (fd.education) payload.Education_Qualification = fd.education;
  if (fd.certifications) payload.Professional_Certifications = fd.certifications;
  if (fd.skills) payload.Key_Skills = fd.skills;

  if (fd.languages) {
    if (Array.isArray(fd.languages)) {
      payload.Languages_Known = fd.languages;
    } else if (typeof fd.languages === 'string') {
      payload.Languages_Known = fd.languages.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  if (fd.previousEmployer) payload.Previous_Employer = fd.previousEmployer;
  if (fd.experience) payload.Total_Experience = fd.experience;

  if (fd.emergencyFirstName) payload.Emergency_Contact_First_Name = fd.emergencyFirstName;
  if (fd.emergencyLastName) payload.Emergency_Contact_Last_Name = fd.emergencyLastName;
  if (fd.emergencyMobile) payload.Emergency_Contact_Number = String(fd.emergencyMobile).replace(/[^0-9]/g, '');
  if (fd.emergencyRelation) payload.Relationship_with_Contact = fd.emergencyRelation;

  const tlName = fd.teamLeaderName || employee.teamLeaderName;
  if (tlName) payload.Who_is_the_Team_Leader_TL = tlName;

  let rmName = fd.reportingManagerName || employee.reportingManagerName;
  if (!rmName && (fd.systemRole === 'HOD' || employee.systemRole === 'HOD' || fd.systemRole === 'HR' || employee.systemRole === 'HR')) {
    rmName = 'Managing Director (Super Admin)';
  }
  if (rmName) payload.Reporting_Manager = rmName;

  if (fd.panNumber) payload.Pan_Number = String(fd.panNumber).toUpperCase();
  if (fd.aadhaarNumber) payload.Aadhaar_Number = String(fd.aadhaarNumber).replace(/[^0-9]/g, '');
  if (fd.passportNumber) payload.Passport_Number = String(fd.passportNumber).toUpperCase();
  if (fd.drivingLicense) payload.Driving_License_Number = String(fd.drivingLicense).toUpperCase();

  if (fd.bankAccount) payload.Bank_Account_Number = String(fd.bankAccount);
  if (fd.bankName) payload.Bank_Name = fd.bankName;
  if (fd.ifsc) payload.IFSC_Code = String(fd.ifsc).toUpperCase();

  payload.PF_Applicable = Boolean(fd.hasPf);
  if (fd.pfNumber) payload.PF_Number = String(fd.pfNumber);
  if (fd.esicNumber) payload.ESIC_Number = String(fd.esicNumber);
  if (fd.uanNumber) payload.UAN_Number = String(fd.uanNumber);
  if (fd.medicalInsurance) payload.Medical_Insurance_Number = String(fd.medicalInsurance);

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

export function buildLeaveZohoPayload(leave: any): Record<string, any> {
  const reasonText = leave.reason || leave.Name || `${leave.type || 'Leave'} - ${leave.empName || 'Employee'}`;
  
  const payload: Record<string, any> = {
    Name: reasonText,
  };

  if (leave.zohoId) {
    payload.id = String(leave.zohoId);
  }

  if (leave.type || leave.Leave_Type) {
    payload.Leave_Type = leave.type || leave.Leave_Type;
  }

  const startDate = formatDateForZoho(leave.startDate || leave.Start_Date);
  if (startDate) payload.Start_Date = startDate;

  const endDate = formatDateForZoho(leave.endDate || leave.End_Date);
  if (endDate) payload.End_Date = endDate;

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
    payload.Approved_by_TL = 'Pending';
    payload.Approved_by_HR = 'Pending';
  }

  if (leave.email || leave.workEmail) {
    payload.Email = leave.email || leave.workEmail;
  }
  if (leave.secondaryEmail || leave.personalEmail) {
    payload.Secondary_Email = leave.secondaryEmail || leave.personalEmail;
  }

  if (leave.employeeZohoId || leave.empZohoId) {
    payload.Employee = { id: String(leave.employeeZohoId || leave.empZohoId) };
  }

  return payload;
}

export function buildCompanyZohoPayload(company: any): Record<string, any> {
  const fd = company.formData || company;
  const companyName = company.name || fd.name || company.companyName || fd.companyName || 'New Company';

  const payload: Record<string, any> = {
    Name: companyName,
  };

  if (company.zohoId || fd.zohoId) {
    payload.id = String(company.zohoId || fd.zohoId);
  }

  const bType = company.type || fd.type || company.businessType || fd.businessType || company.Business_Type;
  if (bType) payload.Business_Type = bType;

  const doi = formatDateForZoho(company.doi || fd.doi || company.dateOfIncorporation || fd.dateOfIncorporation || company.Date_of_Incorporation);
  if (doi) payload.Date_of_Incorporation = doi;

  const gst = company.gstNumber || fd.gstNumber || company.gst || fd.gst || company.GST_Number;
  if (gst) payload.GST_Number = String(gst).toUpperCase();

  const email = company.email || fd.email || company.Email;
  if (email) payload.Email = email;

  const secEmail = company.secondaryEmail || fd.secondaryEmail || company.Secondary_Email;
  if (secEmail) payload.Secondary_Email = secEmail;

  const status = company.status || fd.status || company.Status || 'Active';
  if (status) payload.Status = status;

  const tag = company.tag || fd.tag || company.Tag;
  if (tag) payload.Tag = tag;

  return payload;
}

export function buildClientZohoPayload(client: any): Record<string, any> {
  const fd = client.formData || client;
  const clientName = client.name || fd.name || client.clientName || fd.clientName || 'New Client';

  const payload: Record<string, any> = {
    Name: clientName,
  };

  if (client.zohoId || fd.zohoId) {
    payload.id = String(client.zohoId || fd.zohoId);
  }

  const compName = client.company || fd.company || client.companyName || fd.companyName || client.Company_Name;
  if (compName) payload.Company_Name = compName;

  const email = client.email || fd.email || client.emailAddress || fd.emailAddress || client.Email;
  if (email) payload.Email = email;

  const rawMobile = client.phone || fd.phone || client.mobile || fd.mobile || client.mobileNumber || fd.mobileNumber || client.Mobile_Number;
  if (rawMobile) payload.Mobile_Number = String(rawMobile).replace(/[^0-9]/g, '');

  const secEmail = client.secondaryEmail || fd.secondaryEmail || client.Secondary_Email;
  if (secEmail) payload.Secondary_Email = secEmail;

  const status = client.status || fd.status || client.Status || 'Active';
  if (status) payload.Status = status;

  const tag = client.tag || fd.tag || client.Tag;
  if (tag) payload.Tag = tag;

  return payload;
}

export function buildCompanyPolicyZohoPayload(policy: any): Record<string, any> {
  const fd = policy.formData || policy;
  const policyTitle = policy.title || fd.title || policy.name || fd.name || policy.Name || 'Company Policy';

  const payload: Record<string, any> = {
    Name: String(policyTitle).trim(),
  };

  if (policy.zohoId || fd.zohoId) {
    payload.id = String(policy.zohoId || fd.zohoId);
  }

  const content = policy.content || fd.content || policy.policyContent || fd.policyContent || policy.Policy_Content;
  if (content !== undefined && content !== null && String(content).trim() !== '') {
    payload.Policy_Content = String(content).trim();
  }

  const dept = policy.department || fd.department || policy.Department;
  if (dept && String(dept).trim() !== '') {
    payload.Department = String(dept).trim();
  }

  const email = policy.email || fd.email || policy.Email;
  if (email && String(email).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    payload.Email = String(email).trim();
  }

  const secEmail = policy.secondaryEmail || fd.secondaryEmail || policy.Secondary_Email;
  if (secEmail && String(secEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(secEmail).trim())) {
    payload.Secondary_Email = String(secEmail).trim();
  }

  const tag = policy.tag || fd.tag || policy.Tag;
  if (tag && String(tag).trim() !== '') {
    payload.Tag = String(tag).trim();
  }

  if (policy.emailOptOut !== undefined && policy.emailOptOut !== null) {
    payload.Email_Opt_Out = Boolean(policy.emailOptOut);
  } else if (fd.emailOptOut !== undefined && fd.emailOptOut !== null) {
    payload.Email_Opt_Out = Boolean(fd.emailOptOut);
  }

  return payload;
}

export function buildCompanyCalendarZohoPayload(event: any): Record<string, any> {
  const fd = event.formData || event;
  const eventTitle = event.title || fd.title || event.name || fd.name || event.Name || 'Company Calendar Event';

  const payload: Record<string, any> = {
    Name: String(eventTitle).trim(),
  };

  if (event.zohoId || fd.zohoId) {
    payload.id = String(event.zohoId || fd.zohoId);
  }

  const formattedDate = formatDateForZoho(event.date || fd.date || event.Date || fd.Date);
  if (formattedDate) {
    payload.Date = formattedDate;
  }

  const catType = event.type || fd.type || event.category || fd.category || event.Category_Type;
  if (catType && String(catType).trim() !== '') {
    payload.Category_Type = String(catType).trim();
  }

  const desc = event.description || fd.description || event.Description;
  if (desc !== undefined && desc !== null && String(desc).trim() !== '') {
    payload.Description = String(desc).trim();
  }

  const email = event.email || fd.email || event.Email;
  if (email && String(email).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    payload.Email = String(email).trim();
  }

  const secEmail = event.secondaryEmail || fd.secondaryEmail || event.Secondary_Email;
  if (secEmail && String(secEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(secEmail).trim())) {
    payload.Secondary_Email = String(secEmail).trim();
  }

  const tag = event.tag || fd.tag || event.Tag || catType || 'Calendar';
  if (tag && String(tag).trim() !== '') {
    payload.Tag = String(tag).trim();
  }

  if (event.emailOptOut !== undefined && event.emailOptOut !== null) {
    payload.Email_Opt_Out = Boolean(event.emailOptOut);
  } else if (fd.emailOptOut !== undefined && fd.emailOptOut !== null) {
    payload.Email_Opt_Out = Boolean(fd.emailOptOut);
  }

  return payload;
}

export function buildDsrZohoPayload(dsr: any): Record<string, any> {
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

  if (formattedDate) {
    payload.Date = formattedDate;
  }

  const desc = dsr.description || fd.description || dsr.Description || dsr.content;
  if (desc !== undefined && desc !== null && String(desc).trim() !== '') {
    payload.Description = String(desc).trim();
  }

  const email = dsr.empEmail || fd.empEmail || dsr.email || fd.email || dsr.Email;
  if (email && String(email).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    payload.Email = String(email).trim();
  }

  const secEmail = dsr.tlEmail || fd.tlEmail || dsr.secondaryEmail || fd.secondaryEmail || dsr.Secondary_Email;
  if (secEmail && String(secEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(secEmail).trim())) {
    payload.Secondary_Email = String(secEmail).trim();
  }

  const tag = dsr.status || fd.status || dsr.tag || fd.tag || dsr.Tag || 'Submitted';
  if (tag && String(tag).trim() !== '') {
    payload.Tag = String(tag).trim();
  }

  const empLookupId = dsr.employeeZohoId || fd.employeeZohoId || dsr.empZohoId || fd.empZohoId || (typeof dsr.Employee === 'object' ? dsr.Employee?.id : null);
  if (empLookupId && String(empLookupId).trim() !== '') {
    payload.Employee = { id: String(empLookupId).trim() };
  }

  if (dsr.emailOptOut !== undefined && dsr.emailOptOut !== null) {
    payload.Email_Opt_Out = Boolean(dsr.emailOptOut);
  } else if (fd.emailOptOut !== undefined && fd.emailOptOut !== null) {
    payload.Email_Opt_Out = Boolean(fd.emailOptOut);
  }

  if (dsr.connectedTo && Array.isArray(dsr.connectedTo) && dsr.connectedTo.length > 0) {
    payload.Connected_To__s = dsr.connectedTo;
  }

  return payload;
}

// Helper to send JSON response
function sendJson(res: ApiResponse, statusCode: number, data: any) {
  if (typeof res.status === 'function') {
    res.status(statusCode);
    if (typeof res.json === 'function') {
      return res.json(data);
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
}

// Helper to read request body if not already parsed
async function getRequestBody(req: ApiRequest): Promise<any> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }

  if (req.readableEnded || (req as any).complete) {
    return {};
  }

  return new Promise((resolve) => {
    let body = '';
    const timer = setTimeout(() => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    }, 1500);

    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve(body);
      }
    });
    req.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
  });
}



// Helper to build Zoho pagination query parameters from request
function buildZohoPaginationQuery(req: ApiRequest, urlObj: URL): string {
  const queryParts: string[] = [];
  
  const page = urlObj.searchParams.get('page') || (typeof req.query?.page === 'string' ? req.query.page : '') || (Array.isArray(req.query?.page) ? req.query.page[0] : '');
  const perPage = urlObj.searchParams.get('per_page') || (typeof req.query?.per_page === 'string' ? req.query.per_page : '') || (Array.isArray(req.query?.per_page) ? req.query.per_page[0] : '');
  const pageToken = urlObj.searchParams.get('page_token') || (typeof req.query?.page_token === 'string' ? req.query.page_token : '') || (Array.isArray(req.query?.page_token) ? req.query.page_token[0] : '');

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

  return queryParts.join('&');
}

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

// Main Zoho API Handler
export async function handleZohoRequest(req: ApiRequest, res: ApiResponse) {
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const pathname = urlObj.pathname;
  const rawAction = (Array.isArray(req.query?.action) 
    ? req.query?.action.join('/') 
    : (req.query?.action as string)) || '';
  
  // Determine normalized action path (e.g. 'insert-employee')
  let action = rawAction;
  if (!action) {
    action = pathname.replace(/^\/api\/zoho\/?/, '').replace(/^\/+/, '');
  }
  if (!action && urlObj.searchParams.get('action')) {
    action = urlObj.searchParams.get('action') || '';
  }

  const method = (req.method || 'GET').toUpperCase();
  const apiBase = process.env.VITE_ZOHO_API_URL || process.env.ZOHO_API_URL || 'https://www.zohoapis.in';

  console.log(`[Zoho API Handler] ${method} action: "${action}" (Path: ${pathname})`);

  try {
    // 1. Test Connection
    if (action === 'test-connection') {
      try {
        await getAccessToken();
        return sendJson(res, 200, { success: true, message: 'Zoho CRM Connected (.in domain)' });
      } catch (e: any) {
        return sendJson(res, 400, { success: false, message: e.message });
      }
    }

    // 2. Insert / Update Quotation
    if ((action === 'insert-quotation' || action === 'update-quotation') && (method === 'POST' || method === 'PUT')) {
      const quotation = await getRequestBody(req);
      const payload = buildQuotationZohoPayload(quotation);
      const isUpdate = Boolean(quotation.zohoId || action === 'update-quotation');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_MODULE_NAME || 'Quotations';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || quotation.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Quotation updated successfully in Zoho CRM' : 'Quotation inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save record in Zoho CRM';
        return sendJson(res, 400, {
          success: false,
          message: errMsg,
          errorDetails: crmData,
        });
      }
    }

    // 2.5 Get Quotations
    if (action === 'get-quotations' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_MODULE_NAME || 'Quotations';
      const quotationFields = 'id,Name,Email,Mobile_Number,Gender,City,State,PAN_Card,Aadhaar_Card,Company_Name,Company_Type,Date_of_Incorporation,GST_Number,Company_PAN_Number,Sector,Industry,Subtotal,Total_GST,Grand_Total,Services_And_Pricing,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${quotationFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch quotations from Zoho CRM', errorDetails: crmData });
      }
    }

    // 3. Insert / Update Deal
    if ((action === 'insert-deal' || action === 'update-deal') && (method === 'POST' || method === 'PUT')) {
      const deal = await getRequestBody(req);
      const payload = buildDealZohoPayload(deal);
      const isUpdate = Boolean(deal.zohoId || action === 'update-deal');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      logZohoApiCall(isUpdate ? 'update-deal' : 'insert-deal', httpMethod, crmEndpoint, payload, crmRes.status, crmData);

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || deal.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Deal updated successfully in Zoho CRM' : 'Deal inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const detailInfo = crmData.data?.[0]?.details;
        let detailText = '';
        if (detailInfo) {
          if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
          else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
        }
        const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save deal record in Zoho CRM';
        return sendJson(res, 400, {
          success: false,
          message: rawMsg + detailText,
          errorDetails: crmData,
        });
      }
    }

    // 4. Get Deals
    if (action === 'get-deals' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
      const dealFields = 'id,Deal_Name,Name1,Amount,Amount_Without_GST,GST_Amount,Deal_Received_Amount,Deal_Pending_Amount,Total_deal_amount_inclusive_of_gst,Stage,Pipeline,Closing_Date,Booking_Date,Date,Company_name,Company_Name,Account_Name,Client_Name,Contact_Name,Client_contact_detail,Mobile,Client_Email_address,Email,Gst_number,Pan_number,Billing_address,Created_Time,Modified_Time,Choose_Wisely,Branches,Subform_1';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${dealFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = await crmRes.json();

      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = await crmRes.json();
      }

      if (crmData.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmData.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData.message || 'Failed to fetch deals from Zoho CRM', errorDetails: crmData });
      }
    }

    // 5. Insert / Update Employee (Includes Password field sync)
    if ((action === 'insert-employee' || action === 'update-employee') && (method === 'POST' || method === 'PUT')) {
      const employee = await getRequestBody(req);
      const payload = buildEmployeeZohoPayload(employee);
      const isUpdate = Boolean(employee.zohoId || action === 'update-employee');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

      console.log(`[Zoho API Handler] ${isUpdate ? 'Updating' : 'Inserting'} Employee:`, payload.Name, employee.zohoId ? `(ID: ${employee.zohoId})` : '', 'Has Password:', Boolean(payload.Password));

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || employee.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Employee updated successfully in Zoho CRM' : 'Employee inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save employee record in Zoho CRM';
        return sendJson(res, 400, {
          success: false,
          message: errMsg,
          errorDetails: crmData,
        });
      }
    }

    // 6. Get Employees
    if (action === 'get-employees' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
      const employeeFields = 'id,Name,Middle_Name,Last_Name,Employment_ID,Contact_Number,Personal_Email_Address,Email,Gender,Marital_Status,Nationality,Blood_Group,Date_of_Birth,Date_of_Joining,Department,Designation_Job_Title,System_Role,Employment_Type,Permanent_Address,Current_Address,Education_Qualification,Professional_Certifications,Key_Skills,Languages_Known,Previous_Employer,Total_Experience,Emergency_Contact_First_Name,Emergency_Contact_Last_Name,Emergency_Contact_Number,Relationship_with_Contact,Who_is_the_Team_Leader_TL,Reporting_Manager,Pan_Number,Aadhaar_Number,Passport_Number,Driving_License_Number,Bank_Account_Number,Bank_Name,IFSC_Code,PF_Applicable,PF_Number,ESIC_Number,UAN_Number,Medical_Insurance_Number,Salary_Entity,Company_Entity,Password,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${employeeFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch employees from Zoho CRM', errorDetails: crmData });
      }
    }

    // 7. Insert / Update Leave
    if ((action === 'insert-leave' || action === 'update-leave') && (method === 'POST' || method === 'PUT')) {
      const leave = await getRequestBody(req);
      const payload = buildLeaveZohoPayload(leave);
      const isUpdate = Boolean(leave.zohoId || action === 'update-leave');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_LEAVE_MODULE_NAME || 'Leave_Management';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || leave.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Leave request updated successfully in Zoho CRM' : 'Leave request inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save leave record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
      }
    }

    // 8. Get Leaves
    if (action === 'get-leaves' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_LEAVE_MODULE_NAME || 'Leave_Management';
      const leaveFields = 'id,Name,Leave_Type,Start_Date,End_Date,Approved_by_TL,Approved_by_HR,Approved_by_MD,Email,Secondary_Email,Employee,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${leaveFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch leaves from Zoho CRM', errorDetails: crmData });
      }
    }

    // 9. Insert / Update Company
    if ((action === 'insert-company' || action === 'update-company') && (method === 'POST' || method === 'PUT')) {
      const company = await getRequestBody(req);
      const payload = buildCompanyZohoPayload(company);
      const isUpdate = Boolean(company.zohoId || action === 'update-company');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || company.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Company updated successfully in Zoho CRM' : 'Company inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save company record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
      }
    }

    // 10. Get Companies
    if (action === 'get-companies' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
      const companyFields = 'id,Name,Business_Type,Date_of_Incorporation,GST_Number,Email,Secondary_Email,Status,Tag,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${companyFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch companies from Zoho CRM', errorDetails: crmData });
      }
    }

    // 11. Insert / Update Client
    if ((action === 'insert-client' || action === 'update-client') && (method === 'POST' || method === 'PUT')) {
      const client = await getRequestBody(req);
      const payload = buildClientZohoPayload(client);
      const isUpdate = Boolean(client.zohoId || action === 'update-client');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || client.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Client updated successfully in Zoho CRM' : 'Client inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save client record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
      }
    }

    // 12. Get Clients
    if (action === 'get-clients' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
      const clientFields = 'id,Name,Company_Name,Email,Mobile_Number,Secondary_Email,Status,Tag,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${clientFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch clients from Zoho CRM', errorDetails: crmData });
      }
    }

    // 13. Insert / Update Policy
    if ((action === 'insert-policy' || action === 'update-policy') && (method === 'POST' || method === 'PUT')) {
      const policy = await getRequestBody(req);
      const payload = buildCompanyPolicyZohoPayload(policy);
      const isUpdate = Boolean(policy.zohoId || action === 'update-policy');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_COMPANY_POLICIES_MODULE_NAME || 'Company_Policies';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || policy.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Company Policy updated successfully in Zoho CRM' : 'Company Policy inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const detailInfo = crmData.data?.[0]?.details;
        let detailText = '';
        if (detailInfo) {
          if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
          else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
        }
        const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save company policy record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: rawMsg + detailText, errorDetails: crmData });
      }
    }

    // 14. Get Policies
    if (action === 'get-policies' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_COMPANY_POLICIES_MODULE_NAME || 'Company_Policies';
      const policyFields = 'id,Name,Policy_Content,Department,Email,Secondary_Email,Tag,Email_Opt_Out,Created_By,Modified_By,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${policyFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch company policies from Zoho CRM', errorDetails: crmData });
      }
    }

    // 15. Insert / Update Calendar
    if ((action === 'insert-calendar' || action === 'update-calendar') && (method === 'POST' || method === 'PUT')) {
      const event = await getRequestBody(req);
      const payload = buildCompanyCalendarZohoPayload(event);
      const isUpdate = Boolean(event.zohoId || action === 'update-calendar');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_CALENDAR_MODULE_NAME || 'Company_Calendar';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || event.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Calendar event updated successfully in Zoho CRM' : 'Calendar event inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const detailInfo = crmData.data?.[0]?.details;
        let detailText = '';
        if (detailInfo) {
          if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
          else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
        }
        const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save calendar event record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: rawMsg + detailText, errorDetails: crmData });
      }
    }

    // 16. Get Calendar
    if (action === 'get-calendar' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_CALENDAR_MODULE_NAME || 'Company_Calendar';
      const calFields = 'id,Name,Date,Category_Type,Description,Email,Secondary_Email,Tag,Email_Opt_Out,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${calFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch calendar events from Zoho CRM', errorDetails: crmData });
      }
    }

    // 17. Insert / Update DSR
    if ((action === 'insert-dsr' || action === 'update-dsr') && (method === 'POST' || method === 'PUT')) {
      const dsr = await getRequestBody(req);
      const payload = buildDsrZohoPayload(dsr);
      const isUpdate = Boolean(dsr.zohoId || action === 'update-dsr');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_DSR_MODULE_NAME || 'DSR';
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}`;

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
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || dsr.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'DSR updated successfully in Zoho CRM' : 'DSR inserted successfully into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const detailInfo = crmData.data?.[0]?.details;
        let detailText = '';
        if (detailInfo) {
          if (detailInfo.api_name) detailText = ` (${detailInfo.api_name})`;
          else if (detailInfo.field) detailText = ` (${detailInfo.field})`;
        }
        const rawMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save DSR record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: rawMsg + detailText, errorDetails: crmData });
      }
    }

    // 18. Get DSR
    if (action === 'get-dsr' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_DSR_MODULE_NAME || 'DSR';
      const dsrFields = 'id,Name,Date,Description,Email,Secondary_Email,Tag,Employee,Email_Opt_Out,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${dsrFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch DSR records from Zoho CRM', errorDetails: crmData });
      }
    }

    // 19. Get Daily Attendance
    if (action === 'get-attendance' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_ATTENDANCE_MODULE_NAME || 'Daily_Attendance';
      const attFields = 'id,Name,Attendance_Date,Employee_Code,First_In,Last_Out,Punch_Status,Punches,Total_Minutes,Late_Minutes,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${attFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch attendance from Zoho CRM', errorDetails: crmData });
      }
    }

    // 20. Get Raised Queries / Cases
    if (action === 'get-queries' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = 'Cases';
      const caseFields = 'id,Case_Number,Subject,Description,Status,Priority,Created_Time,Modified_Time';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${caseFields}&${paginationQuery}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      let crmData: any = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();

      if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = crmRes.status === 204 ? { code: 'NO_CONTENT' } : await crmRes.json();
      }

      if (crmData?.data) {
        return sendJson(res, 200, { success: true, data: crmData.data, info: crmData.info });
      } else if (crmRes.status === 204 || crmData?.code === 'NO_CONTENT') {
        return sendJson(res, 200, { success: true, data: [] });
      } else {
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch queries from Zoho CRM', errorDetails: crmData });
      }
    }

    // 21. Insert / Update Query
    if ((action === 'insert-query' || action === 'update-query') && (method === 'POST' || method === 'PUT')) {
      const q = await getRequestBody(req);
      const isUpdate = Boolean(q.zohoId || action === 'update-query');
      const httpMethod = isUpdate ? 'PUT' : 'POST';

      const payload: any = {
        Subject: q.query || q.subject || 'Quality Query',
        Description: q.description || '',
        Status: q.status || 'Open',
        Priority: q.priority || 'Medium',
      };
      if (q.zohoId) payload.id = String(q.zohoId);

      let accessToken = await getAccessToken();
      const moduleName = 'Cases';
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
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        const zohoId = crmData.data[0].details?.id || q.zohoId;
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: isUpdate ? 'Query updated in Zoho CRM' : 'Query inserted into Zoho CRM',
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save query in Zoho CRM';
        return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
      }
    }

    // 22. Delete Record (Generic or module-specific)
    if ((action.startsWith('delete-') || method === 'DELETE')) {
      const parsedBody = await getRequestBody(req);
      let recordId = parsedBody.id || parsedBody.zohoId || urlObj.searchParams.get('id') || urlObj.searchParams.get('zohoId') || '';
      
      let moduleName = 'Quotations';
      if (action === 'delete-leave') moduleName = process.env.VITE_ZOHO_LEAVE_MODULE_NAME || 'Leave_Management';
      else if (action === 'delete-employee') moduleName = process.env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
      else if (action === 'delete-company') moduleName = process.env.VITE_ZOHO_COMPANIES_MODULE_NAME || 'Companies';
      else if (action === 'delete-client') moduleName = process.env.VITE_ZOHO_CLIENTS_MODULE_NAME || 'Clients';
      else if (action === 'delete-deal') moduleName = process.env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
      else if (action === 'delete-quotation') moduleName = process.env.VITE_ZOHO_MODULE_NAME || 'Quotations';
      else if (action === 'delete-policy') moduleName = process.env.VITE_ZOHO_COMPANY_POLICIES_MODULE_NAME || 'Company_Policies';
      else if (action === 'delete-calendar') moduleName = process.env.VITE_ZOHO_CALENDAR_MODULE_NAME || 'Company_Calendar';
      else if (action === 'delete-dsr') moduleName = process.env.VITE_ZOHO_DSR_MODULE_NAME || 'DSR';
      else if (parsedBody.module || urlObj.searchParams.get('module')) {
        moduleName = parsedBody.module || urlObj.searchParams.get('module')!;
      }

      if (!recordId) {
        return sendJson(res, 400, { success: false, message: 'Record ID is required for deletion.' });
      }

      let accessToken = await getAccessToken();
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?ids=${recordId}`;

      let crmRes = await fetch(crmEndpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });

      let crmData: any = await crmRes.json();
      if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
        cachedToken = null;
        accessToken = await getAccessToken();
        crmRes = await fetch(crmEndpoint, {
          method: 'DELETE',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        crmData = await crmRes.json();
      }

      if (crmData.data?.[0]?.code === 'SUCCESS' || crmData.data?.[0]?.status === 'success') {
        return sendJson(res, 200, {
          success: true,
          zohoId: recordId,
          message: `${moduleName} record deleted successfully from Zoho CRM`,
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to delete record in Zoho CRM';
        return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
      }
    }

    // 20. Upload Attachment
    if (action === 'upload-attachment' && method === 'POST') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const contentType = (req.headers && req.headers['content-type']) || '';

        const webReq = new Request('http://localhost' + (req.url || '/'), {
          method: 'POST',
          headers: { 'content-type': contentType },
          body: buffer,
        });

        const formData = await webReq.formData();
        const file = formData.get('file') as File | null;
        const recordId = (formData.get('recordId') as string) || '';
        const moduleName = (formData.get('module') as string) || process.env.VITE_ZOHO_MODULE_NAME || 'Quotations';

        if (!file || !recordId) {
          return sendJson(res, 400, {
            success: false,
            message: 'Both "file" and "recordId" are required to attach a document.',
          });
        }

        let accessToken = await getAccessToken();
        const crmAttachmentEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/Attachments`;

        const zohoForm = new FormData();
        zohoForm.append('file', file, file.name);

        let attachRes = await fetch(crmAttachmentEndpoint, {
          method: 'POST',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
          body: zohoForm,
        });

        let attachData: any = await attachRes.json();
        if (attachRes.status === 401 || attachData.code === 'INVALID_TOKEN') {
          cachedToken = null;
          accessToken = await getAccessToken();
          attachRes = await fetch(crmAttachmentEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
            body: zohoForm,
          });
          attachData = await attachRes.json();
        }

        if (attachData.data?.[0]?.code === 'SUCCESS') {
          return sendJson(res, 200, {
            success: true,
            attachmentId: attachData.data[0].details?.id,
            message: 'Attachment uploaded successfully to Zoho CRM',
            data: attachData.data[0],
          });
        } else {
          const errMsg = attachData.data?.[0]?.message || attachData.message || 'Failed to upload attachment in Zoho CRM';
          return sendJson(res, 400, { success: false, message: errMsg, errorDetails: attachData });
        }
      } catch (err: any) {
        return sendJson(res, 500, { success: false, message: err.message });
      }
    }

    // Default: Route not recognized
    return sendJson(res, 404, {
      success: false,
      message: `Zoho CRM API action "${action}" not found or unsupported HTTP method "${method}".`,
    });
  } catch (error: any) {
    console.error('[Zoho API Handler] Top-level error:', error);
    return sendJson(res, 500, {
      success: false,
      message: error?.message || 'Internal server error processing Zoho request',
    });
  }
}
