import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { IncomingMessage, ServerResponse } from 'http';


// Interface for standard Vercel request/response (compatible with Node http)
interface ApiRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
  body?: any;
  method?: string;
  url?: string;
}

interface ApiResponse extends ServerResponse {
  status?: (statusCode: number) => ApiResponse;
  json?: (data: any) => void;
  send?: (data: any) => void;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
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

  return payload;
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
  payload.Partner_BDM = hasPartnerBdm;
  payload.Partner_BDM_Name = partnerBdmName;
  payload.partner_bdm_name = partnerBdmName;
  payload.Partner_BDM_Names = partnerBdmName;
  payload.Partner_BDM_Amount = partnerBdmAmount;
  payload.partner_bdm_amount = partnerBdmAmount;
  if (partnerBdmId) {
    payload.Partner_BDM_ID = String(partnerBdmId);
    payload.partner_bdm_id = String(partnerBdmId);
  }

  return payload;
}

function buildEmployeeZohoPayload(employee: any): Record<string, any> {
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

  const monthlyTarget = fd.monthlyTarget || fd.target || employee.monthlyTarget || employee.target;
  if (monthlyTarget !== undefined && monthlyTarget !== null && monthlyTarget !== '') {
    const cleanNum = typeof monthlyTarget === 'string' ? monthlyTarget.replace(/[^0-9.]/g, '') : monthlyTarget;
    payload.Monthly_Target = cleanNum;
    payload.Target = cleanNum;
    payload.Sales_Target = cleanNum;
  }

  // Password (API Name: Password, Single Line)
  const empPassword = employee.password || fd.password || employee.newPassword;
  if (empPassword) {
    payload.Password = String(empPassword);
  }

  return payload;
}

function buildLeaveZohoPayload(leave: any): Record<string, any> {
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

function buildCompanyZohoPayload(company: any): Record<string, any> {
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

function buildClientZohoPayload(client: any): Record<string, any> {
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

function buildCompanyPolicyZohoPayload(policy: any): Record<string, any> {
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

function buildCompanyCalendarZohoPayload(event: any): Record<string, any> {
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

// Helper to send JSON response safely in Vercel Serverless and Node http
function sendJson(res: any, statusCode: number, data: any) {
  if (res.headersSent) {
    return;
  }
  if (typeof res.status === 'function') {
    res.status(statusCode);
    if (typeof res.json === 'function') {
      return res.json(data);
    }
    if (typeof res.send === 'function') {
      return res.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }
  res.statusCode = statusCode;
  if (!res.getHeader || !res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'application/json');
  }
  return res.end(JSON.stringify(data));
}

// Helper to read request body safely
async function getRequestBody(req: any): Promise<any> {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }

  if (req.readableEnded || req.complete) {
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
    }, 1000);

    req.on('data', (chunk: any) => {
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
  const criteria = urlObj.searchParams.get('criteria') || (typeof req.query?.criteria === 'string' ? req.query.criteria : '') || (Array.isArray(req.query?.criteria) ? req.query.criteria[0] : '');

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
async function handleZohoRequest(req: ApiRequest, res: ApiResponse) {
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

    // 4. Get Single Deal or Deals List
    if ((action === 'get-deal' || (action === 'get-deals' && (urlObj.searchParams.get('id') || urlObj.searchParams.get('deal_id')))) && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
      const dealId = urlObj.searchParams.get('id') || urlObj.searchParams.get('deal_id');
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${dealId}`;

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
        return sendJson(res, 200, { success: true, data: crmData.data });
      } else {
        return sendJson(res, 400, { success: false, message: crmData.message || 'Failed to fetch deal from Zoho CRM', errorDetails: crmData });
      }
    }

    if (action === 'get-deals' && method === 'GET') {
      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
      const dealFields = 'id,Deal_Name,Account_Name,Contact_Name,Company_name,Client_Name,Owner,Stage,Pipeline,Closing_Date,Booking_Date,Created_Time,Modified_Time,Amount,Total_deal_amount_inclusive_of_gst,Deal_Amount,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Deal_Received_Amount,Total_Pending_Amount,Pending_amount,Deal_Pending_Amount,amount_if_you_have_kindly_put_0,Choose_Wisely,Service_Name,Service_Count,Subform_1,Client_contact_detail,Mobile,Client_Email_address,Email,Gst_number,Pan_number,Aadhaar_Card,Billing_address,City,State,Branches,Bank_details,Has_Partner_BDM,Partner_BDM_Name,Partner_BDM_Amount,Partner_BDM_ID,Quotation';
      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${dealFields}&${paginationQuery}`;

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
        return sendJson(res, 400, { success: false, message: crmData?.message || 'Failed to fetch deals from Zoho CRM', errorDetails: crmData });
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

    // 5.1. Update Employee Password by finding via Email in Zoho CRM
    if (action === 'update-employee-password' && (method === 'POST' || method === 'PUT')) {
      const body = await getRequestBody(req);
      const email = (body.email || '').trim();
      const password = (body.password || body.newPassword || '').trim();
      let zohoId = body.zohoId ? String(body.zohoId).trim() : '';

      if (!password) {
        return sendJson(res, 400, { success: false, message: 'Password is required' });
      }

      let accessToken = await getAccessToken();
      const moduleName = process.env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';

      // 1. If zohoId is not provided, search by email in Employee module
      if (!zohoId && email) {
        try {
          const criteria = `(((Personal_Email_Address:equals:${email})or(Email:equals:${email}))or(Employment_ID:equals:${email}))`;
          const searchUrl = `${apiBase}/crm/v8/${moduleName}/search?criteria=${encodeURIComponent(criteria)}`;
          
          let searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
          });
          
          if (searchRes.status === 401) {
            cachedToken = null;
            accessToken = await getAccessToken();
            searchRes = await fetch(searchUrl, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
          }

          if (searchRes.status === 200) {
            const searchData: any = await searchRes.json();
            if (searchData?.data?.[0]?.id) {
              zohoId = String(searchData.data[0].id);
            }
          }

          // Fallback: search?email=...
          if (!zohoId && email.includes('@')) {
            const emailSearchUrl = `${apiBase}/crm/v8/${moduleName}/search?email=${encodeURIComponent(email)}`;
            let emailRes = await fetch(emailSearchUrl, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            if (emailRes.status === 200) {
              const emailData: any = await emailRes.json();
              if (emailData?.data?.[0]?.id) {
                zohoId = String(emailData.data[0].id);
              }
            }
          }

          // Fallback 2: list scan if search did not catch
          if (!zohoId) {
            const listUrl = `${apiBase}/crm/v8/${moduleName}?fields=id,Personal_Email_Address,Email,Employment_ID,Name&per_page=200`;
            let listRes = await fetch(listUrl, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            if (listRes.status === 200) {
              const listData: any = await listRes.json();
              const matched = listData?.data?.find((x: any) => 
                (x.Personal_Email_Address && x.Personal_Email_Address.toLowerCase() === email.toLowerCase()) ||
                (x.Email && x.Email.toLowerCase() === email.toLowerCase()) ||
                (x.Employment_ID && String(x.Employment_ID).toLowerCase() === email.toLowerCase()) ||
                (x.Name && x.Name.toLowerCase() === email.toLowerCase())
              );
              if (matched?.id) {
                zohoId = String(matched.id);
              }
            }
          }
        } catch (searchErr) {
          console.warn('[Zoho API Handler] Error searching employee by email:', searchErr);
        }
      }

      if (!zohoId) {
        return sendJson(res, 404, {
          success: false,
          message: `Employee record with email "${email}" not found in Zoho CRM Employee module.`,
        });
      }

      // 2. Perform partial PUT update in Zoho CRM Employee module (only updating Password field)
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
        accessToken = await getAccessToken();
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

      if (crmData.data?.[0]?.code === 'SUCCESS') {
        return sendJson(res, 200, {
          success: true,
          zohoId,
          message: `Password updated successfully in Zoho CRM for employee (${email})`,
          data: crmData.data[0],
        });
      } else {
        const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to update employee password in Zoho CRM';
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

    // 6b. Get Sales Employees & BDMs
    if (action === 'get-sales-employees' && method === 'GET') {
      try {
        let accessToken = await getAccessToken();
        const moduleName = process.env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';

        // 1. Fetch from Employee module
        let empRes = await fetch(`${apiBase}/crm/v8/${moduleName}?per_page=200`, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        let empData: any = empRes.status === 204 ? { code: 'NO_CONTENT' } : await empRes.json();
        if (empRes.status === 401 || empData?.code === 'INVALID_TOKEN') {
          cachedToken = null;
          accessToken = await getAccessToken();
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

        // Process Employee module records (Department === 'Sales' or BDM/sales designation)
        for (const z of rawEmps) {
          const dept = (z.Department || '').toLowerCase();
          const designation = (z.Designation_Job_Title || '').toLowerCase();
          const role = (z.System_Role || '').toLowerCase();
          const isSales = dept.includes('sales') || dept.includes('bdm') || designation.includes('sales') || designation.includes('bdm') || role.includes('sales');

          if (isSales || dept === 'sales') {
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

        // Process Zoho CRM Active Users (BDMs, Sales team, NSMs, CDMs)
        for (const u of rawUsers) {
          const profileName = (u.profile?.name || '').toLowerCase();
          const roleName = (u.role?.name || '').toLowerCase();
          const isSales = profileName.includes('business development') || 
                          profileName.includes('bdm') || 
                          profileName.includes('sales') || 
                          profileName.includes('nsm') || 
                          profileName.includes('cdm') || 
                          roleName.includes('bdm') || 
                          roleName.includes('sales') || 
                          roleName.includes('business development');

          if (isSales) {
            const fullName = (u.full_name || u.name || '').trim();
            const email = (u.email || '').toLowerCase().trim();
            const nameKey = fullName.toLowerCase().trim();
            const uniqueKey = email || nameKey;

            if (!seenKeys.has(uniqueKey) && !seenKeys.has(nameKey)) {
              seenKeys.add(uniqueKey);
              seenKeys.add(nameKey);
              salesList.push({
                id: String(u.id),
                zohoId: String(u.id),
                name: fullName,
                email: u.email || '',
                dept: 'Sales',
                role: u.profile?.name || u.role?.name || 'Business Development Manager',
                empId: String(u.id),
                status: 'Active',
                source: 'Zoho CRM User'
              });
            }
          }
        }

        // Sort alphabetically by name
        salesList.sort((a, b) => a.name.localeCompare(b.name));

        return sendJson(res, 200, {
          success: true,
          data: salesList,
          total: salesList.length
        });
      } catch (err: any) {
        console.error('[API Zoho] Fetch sales employees error:', err);
        return sendJson(res, 500, { success: false, message: err.message, data: [] });
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

      if (fetchAll) {
        const startTime = Date.now();
        let allRecords: any[] = [];
        let pageToken: string | null = null;
        let page = 1;
        let hasMore = true;
        let lastInfo: any = null;

        while (hasMore && page <= 10) {
          // Timeout safeguard for Vercel Serverless Function (max 7.5 seconds)
          if (Date.now() - startTime > 7500) {
            console.warn('[get-attendance] Approaching Serverless timeout, returning fetched records');
            break;
          }
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
            accessToken = await getAccessToken();
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

        return sendJson(res, 200, {
          success: true,
          data: allRecords,
          info: { ...lastInfo, count: allRecords.length }
        });
      }

      const paginationQuery = buildZohoPaginationQuery(req, urlObj);
      const sep = baseEndpoint.includes('?') ? '&' : '?';
      const crmEndpoint = `${baseEndpoint}${sep}${paginationQuery}`;

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

    // 19b. Insert / Upsert Attendance record
    if (action === 'save-attendance' && method === 'POST') {
      try {
        const record = await getRequestBody(req);
        let accessToken = await getAccessToken();
        const moduleName = process.env.VITE_ZOHO_ATTENDANCE_MODULE_NAME || 'Daily_Attendance';

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
          accessToken = await getAccessToken();
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

        if (crmData.data?.[0]?.code === 'SUCCESS') {
          const zohoId = crmData.data[0].details?.id;
          return sendJson(res, 200, {
            success: true,
            zohoId,
            message: isUpdate ? 'Attendance updated in Zoho CRM' : 'Attendance saved in Zoho CRM',
            data: crmData.data[0],
          });
        } else {
          const errMsg = crmData.data?.[0]?.message || crmData.message || 'Failed to save attendance in Zoho CRM';
          return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
        }
      } catch (err: any) {
        return sendJson(res, 500, { success: false, message: err.message });
      }
    }

    // 19c. Delete Attendance record
    if (action === 'delete-attendance' && (method === 'DELETE' || method === 'POST')) {
      try {
        const record = await getRequestBody(req);
        const zohoId = urlObj.searchParams.get('id') || record.id || record.zohoId;
        if (!zohoId) {
          return sendJson(res, 400, { success: false, message: 'Missing record ID to delete' });
        }
        let accessToken = await getAccessToken();
        const moduleName = process.env.VITE_ZOHO_ATTENDANCE_MODULE_NAME || 'Daily_Attendance';
        const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${zohoId}`;

        let crmRes = await fetch(crmEndpoint, {
          method: 'DELETE',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });
        let crmData: any = await crmRes.json();

        if (crmRes.status === 401 || crmData?.code === 'INVALID_TOKEN') {
          cachedToken = null;
          accessToken = await getAccessToken();
          crmRes = await fetch(crmEndpoint, {
            method: 'DELETE',
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
          });
          crmData = await crmRes.json();
        }

        if (crmData?.data?.[0]?.code === 'SUCCESS') {
          return sendJson(res, 200, { success: true, message: 'Attendance record deleted from Zoho CRM' });
        } else {
          const errMsg = crmData?.data?.[0]?.message || crmData?.message || 'Failed to delete attendance record from Zoho CRM';
          return sendJson(res, 400, { success: false, message: errMsg, errorDetails: crmData });
        }
      } catch (err: any) {
        return sendJson(res, 500, { success: false, message: err.message });
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

    // 19b. Get Attachments
    if (action === 'get-attachments' && method === 'GET') {
      try {
        const recordId = urlObj.searchParams.get('recordId') || urlObj.searchParams.get('id') || urlObj.searchParams.get('deal_id') || '';
        const moduleName = urlObj.searchParams.get('module') || 'Deals';

        if (!recordId) {
          return sendJson(res, 400, { success: false, message: 'recordId is required to fetch attachments' });
        }

        let accessToken = await getAccessToken();
        const attFields = 'id,File_Name,Size,Created_Time,Modified_Time,Created_By,$type,$attachment_type,$file_id,$link_url,Parent_Id';
        const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/Attachments?fields=${attFields}`;

        let crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });

        if (crmRes.status === 204) {
          return sendJson(res, 200, { success: true, data: [] });
        }

        let crmData: any = await crmRes.json();

        if (crmRes.status === 401 || crmData.code === 'INVALID_TOKEN') {
          cachedToken = null;
          accessToken = await getAccessToken();
          crmRes = await fetch(crmEndpoint, {
            method: 'GET',
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
          });
          if (crmRes.status === 204) {
            return sendJson(res, 200, { success: true, data: [] });
          }
          crmData = await crmRes.json();
        }

        if (crmData.data) {
          return sendJson(res, 200, {
            success: true,
            data: crmData.data,
            info: crmData.info,
          });
        } else if (crmData.code === 'NO_CONTENT' || crmData.code === 'RECORD_NOT_FOUND') {
          return sendJson(res, 200, { success: true, data: [] });
        } else {
          return sendJson(res, 400, {
            success: false,
            message: crmData.message || 'Failed to fetch attachments from Zoho CRM',
            errorDetails: crmData,
          });
        }
      } catch (err: any) {
        return sendJson(res, 500, { success: false, message: err.message });
      }
    }

    // 19c. Download Attachment
    if (action === 'download-attachment' && method === 'GET') {
      try {
        const recordId = urlObj.searchParams.get('recordId') || urlObj.searchParams.get('id') || '';
        const attachmentId = urlObj.searchParams.get('attachmentId') || urlObj.searchParams.get('attId') || '';
        const moduleName = urlObj.searchParams.get('module') || 'Deals';
        const isPreview = urlObj.searchParams.get('preview') === 'true';

        if (!recordId || !attachmentId) {
          return sendJson(res, 400, { success: false, message: 'Both "recordId" and "attachmentId" are required' });
        }

        let accessToken = await getAccessToken();
        const crmEndpoint = `${apiBase}/crm/v8/${moduleName}/${recordId}/Attachments/${attachmentId}`;

        let crmRes = await fetch(crmEndpoint, {
          method: 'GET',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
        });

        if (crmRes.status === 401) {
          cachedToken = null;
          accessToken = await getAccessToken();
          crmRes = await fetch(crmEndpoint, {
            method: 'GET',
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
          });
        }

        if (!crmRes.ok) {
          const errText = await crmRes.text();
          return sendJson(res, crmRes.status, { success: false, message: 'Failed to download attachment from Zoho CRM', details: errText });
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
        return sendJson(res, 500, { success: false, message: err.message });
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.statusCode = 200;
    return res.end();
  }

  try {
    return await handleZohoRequest(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler] Top-level uncaught error:', err);
    return sendJson(res, 500, {
      success: false,
      message: err?.message || 'Internal server error',
    });
  }
}
