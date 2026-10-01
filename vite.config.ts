import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import nodemailer from 'nodemailer'

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
      Payment_Date: bookingDate,
      Payment_verifications: true,
      Payment_Type: 'Online',
    };

    if (deal.zohoId) {
      payload.id = String(deal.zohoId);
    }

    // Company & Account Details (Standard: Account_Name, Custom: Company_name, Company_Name, Lookup: Company)
    if (companyName) {
      payload.Account_Name = companyName;
      payload.Company_Name = companyName;
      payload.Company_name = companyName;
    }
    const compZohoId = deal.companyZohoId || fd.companyZohoId;
    if (compZohoId) {
      payload.Company = { id: String(compZohoId) };
    }

    // Client & Contact Details (Standard: Contact_Name, Custom: Client_Name, Client_contact_detail, Mobile, Email, Lookup: Clients)
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

    // Pipeline & Stage mapping (Default stage: Sales)
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

    // Link Quotation if deal converted from quotation
    if (deal.quotationZohoId || deal.zohoQuotationId) {
      payload.Quotation = { id: String(deal.quotationZohoId || deal.zohoQuotationId) };
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
        const pathname = req.url ? req.url.split('?')[0] : '';
        if (!pathname.startsWith('/api/zoho/') && pathname !== '/api/send-otp') {
          return next();
        }

        const env = loadEnv('development', process.cwd(), '');

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
            const quotationFields = 'id,Name,Email,Mobile_Number,Gender,City,State,PAN_Card,Aadhaar_Card,Company_Name,Company_Type,Date_of_Incorporation,GST_Number,Company_PAN_Number,Sector,Industry,Subtotal,Total_GST,Grand_Total,Services_And_Pricing,Created_Time,Modified_Time';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${quotationFields}&per_page=200`;

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

        // Fetch / Get Deals endpoint (Module API Name: Deals)
        if (pathname === '/api/zoho/get-deals' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_DEALS_MODULE_NAME || 'Deals';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const dealFields = 'id,Deal_Name,Name1,Amount,Amount_Without_GST,GST_Amount,Deal_Received_Amount,Deal_Pending_Amount,Total_deal_amount_inclusive_of_gst,Stage,Pipeline,Closing_Date,Booking_Date,Date,Company_name,Company_Name,Account_Name,Client_Name,Contact_Name,Client_contact_detail,Mobile,Client_Email_address,Email,Gst_number,Pan_number,Billing_address,Created_Time,Modified_Time,Choose_Wisely,Branches,Subform_1';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${dealFields}&per_page=200`;

            console.log(`[Vite Zoho Plugin] Fetching live Deals from Zoho CRM (${moduleName})`);

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
                info: crmData.info,
              }));
            } else if (crmData.code === 'NO_CONTENT') {
              return res.end(JSON.stringify({
                success: true,
                data: [],
              }));
            } else {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                message: crmData.message || 'Failed to fetch deals from Zoho CRM',
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

        // Fetch / Get Employees endpoint (Module API Name: Employee)
        if (pathname === '/api/zoho/get-employees' && req.method === 'GET') {
          try {
            let accessToken = await getAccessToken(env);
            const moduleName = env.VITE_ZOHO_EMPLOYEE_MODULE_NAME || 'Employee';
            const apiBase = env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
            const employeeFields = 'id,Name,Middle_Name,Last_Name,Employment_ID,Contact_Number,Personal_Email_Address,Email,Gender,Marital_Status,Nationality,Blood_Group,Date_of_Birth,Date_of_Joining,Department,Designation_Job_Title,System_Role,Employment_Type,Permanent_Address,Current_Address,Education_Qualification,Professional_Certifications,Key_Skills,Languages_Known,Previous_Employer,Total_Experience,Emergency_Contact_First_Name,Emergency_Contact_Last_Name,Emergency_Contact_Number,Relationship_with_Contact,Who_is_the_Team_Leader_TL,Reporting_Manager,Pan_Number,Aadhaar_Number,Passport_Number,Driving_License_Number,Bank_Account_Number,Bank_Name,IFSC_Code,PF_Applicable,PF_Number,ESIC_Number,UAN_Number,Medical_Insurance_Number,Salary_Entity,Company_Entity,Password,Created_Time,Modified_Time';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${employeeFields}&per_page=200`;

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
                message: crmData?.message || 'Failed to fetch employees from Zoho CRM',
                errorDetails: crmData,
              }));
            }
          } catch (err: any) {
            console.error('[Vite Zoho Plugin] Fetch employees error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, message: err.message }));
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
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${leaveFields}&per_page=200`;

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
            const companyFields = 'id,Name,Business_Type,Date_of_Incorporation,GST_Number,Email,Secondary_Email,Status,Tag,Created_Time,Modified_Time';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${companyFields}&per_page=200`;

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
            const clientFields = 'id,Name,Company_Name,Email,Mobile_Number,Secondary_Email,Status,Tag,Created_Time,Modified_Time';
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${clientFields}&per_page=200`;

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
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${policyFields}&per_page=200`;

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
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${calFields}&per_page=200`;

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
            const crmEndpoint = `${apiBase}/crm/v8/${moduleName}?fields=${dsrFields}&per_page=200`;

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

        // Delete leave, employee, company, client, deal, quotation, policy, calendar, dsr or generic record endpoint (Module API Name: Leave_Management, Employee, Companies, Clients, Deals, Quotations, Company_Policies, Company_Calendar, DSR, etc.)
        if ((pathname === '/api/zoho/delete-leave' || pathname === '/api/zoho/delete-employee' || pathname === '/api/zoho/delete-company' || pathname === '/api/zoho/delete-client' || pathname === '/api/zoho/delete-deal' || pathname === '/api/zoho/delete-quotation' || pathname === '/api/zoho/delete-policy' || pathname === '/api/zoho/delete-calendar' || pathname === '/api/zoho/delete-dsr' || pathname === '/api/zoho/delete-record') && req.method === 'DELETE') {
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
                } catch (e) {}
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
