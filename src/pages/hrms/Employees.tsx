import React, { useState, useEffect } from 'react';
import { Search, Filter, X, UserPlus, Edit, Trash2, ChevronRight, Check, UploadCloud, Eye, Shield, Users, Crown, Briefcase, User, Info, ArrowRight, UserCheck, CheckCircle2, AlertCircle, Loader2, Cloud, FileText, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { saveDocument } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import { ROLE_DEFINITIONS } from '../../types/roles';
import type { SystemRole } from '../../types/roles';
import { INITIAL_EMPLOYEES } from '../../utils/initialData';
import type { EmployeeData } from '../../utils/initialData';
import { saveOrUpdateZohoEmployee, uploadZohoAttachment, deleteZohoEmployee, fetchZohoEmployees } from '../../services/zohoService';

export const OPTIONAL_DOCUMENT_FIELDS = [
  {
    id: 'proof_sec_higher_sec',
    num: '1',
    label: 'Proof of Secondary & Higher Secondary Qualifications (Certificates & Mark Sheets / Affidavit if lost)',
    description: '10th & 12th passing certificates, mark sheets or affidavit if lost',
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx'
  },
  {
    id: 'mark_sheets_grad_postgrad',
    num: '2',
    label: 'Mark Sheets of all Graduate and Postgraduate Qualifications',
    description: 'All semester mark sheets and degree / diploma certificates',
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx'
  },
  {
    id: 'prev_employer_letters',
    num: '3',
    label: 'Offer Letter/Appointment Letter & Resignation/Relieving Letter from Previous Employer',
    description: 'Appointment letter, relieving letter, or experience certificates',
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx'
  },
  {
    id: 'pan_card_copy',
    num: '4',
    label: 'PAN Card Copy / Copy of Application (if PAN Card is not yet available)',
    description: 'PAN card scan or official application acknowledgment receipt',
    accept: '.pdf,.png,.jpg,.jpeg'
  },
  {
    id: 'address_age_proof',
    num: '5',
    label: 'Address & Age Proof (Ration Card / Driving License / Passport / Voter’s ID / Passing Certificate)',
    description: 'Ration card, driving license, passport, voter ID, or passing certificate',
    accept: '.pdf,.png,.jpg,.jpeg'
  },
  {
    id: 'bank_statement_3m',
    num: '6',
    label: "Last 3 Months' Bank Statement",
    description: 'Official bank statement for the last 3 consecutive months',
    accept: '.pdf,.png,.jpg,.jpeg'
  },
  {
    id: 'salary_slips_3m',
    num: '7',
    label: "Last 3 Months' Salary Slips",
    description: 'Pay slips for the last 3 months from previous employer',
    accept: '.pdf,.png,.jpg,.jpeg'
  },
  {
    id: 'passport_photos',
    num: '8',
    label: '4 Passport Size Photos',
    description: 'Recent 4 color passport-size photographs',
    accept: '.pdf,.png,.jpg,.jpeg,.zip'
  }
];

export const Employees = () => {
  const navigate = useNavigate();
  const { currentUser, can, isSuperAdmin, isHR, isHOD, isTL, isTM } = useAuth();
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingZoho, setIsFetchingZoho] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; submessage?: string } | null>(null);

  // Quick Target Assign Modal State for HOD & Super Admin
  const [targetModalEmployee, setTargetModalEmployee] = useState<EmployeeData | null>(null);
  const [targetInputVal, setTargetInputVal] = useState<string>('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  const initialFormData = {
    empId: '', firstName: '', middleName: '', lastName: '', dob: '', gender: 'Male', nationality: 'Indian',
    maritalStatus: 'Single', mobile: '', email: '', permanentAddress: '', currentAddress: '', bloodGroup: 'O+',
    salaryEntity: 'BSPL' as string,
    education: '', certifications: '', skills: '', languages: [] as string[],
    emergencyFirstName: '', emergencyLastName: '', emergencyMobile: '', emergencyRelation: '',
    doj: new Date().toISOString().split('T')[0], dept: 'Sales', role: '', workEmail: '', previousEmployer: '', experience: '',
    employmentType: 'Full Time', hasPf: false,
    systemRole: 'TM' as SystemRole,
    teamLeaderId: '',
    teamLeaderName: '',
    reportingManagerId: '',
    reportingManagerName: '',
    monthlyTarget: '',
    target: '',
    bankAccount: '', bankName: '', ifsc: '', panNumber: '', aadhaarNumber: '',
    passportNumber: '', drivingLicense: '', pfNumber: '', esicNumber: '', uanNumber: '', medicalInsurance: ''
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [salaryDocumentName, setSalaryDocumentName] = useState('');
  const [salaryDocumentFile, setSalaryDocumentFile] = useState<File | null>(null);
  const [additionalDocs, setAdditionalDocs] = useState<Record<string, { file: File, name: string }>>({});

  const mapZohoRecordToEmployee = (z: any): EmployeeData => {
    const firstName = z.Name || '';
    const middleName = z.Middle_Name || '';
    const lastName = z.Last_Name || '';
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || z.Name || 'Employee';
    const empId = z.Employment_ID || (z.id ? `EMP-${String(z.id).slice(-4)}` : `EMP-${Math.floor(1000 + Math.random() * 9000)}`);
    const systemRole: SystemRole = (z.System_Role as SystemRole) || 'TM';

    const fd = {
      empId,
      salaryEntity: z.Salary_Entity || z.Company_Entity || 'BSPL',
      firstName,
      middleName,
      lastName,
      dob: z.Date_of_Birth || '',
      gender: z.Gender || 'Male',
      nationality: z.Nationality || 'Indian',
      maritalStatus: z.Marital_Status || 'Single',
      mobile: z.Contact_Number || '',
      email: z.Personal_Email_Address || z.Email || '',
      permanentAddress: z.Permanent_Address || '',
      currentAddress: z.Current_Address || '',
      bloodGroup: z.Blood_Group || 'O+',
      education: z.Education_Qualification || '',
      certifications: z.Professional_Certifications || '',
      skills: z.Key_Skills || '',
      languages: Array.isArray(z.Languages_Known) ? z.Languages_Known : (typeof z.Languages_Known === 'string' ? z.Languages_Known.split(',').map((s: string) => s.trim()).filter(Boolean) : ['English']),
      emergencyFirstName: z.Emergency_Contact_First_Name || '',
      emergencyLastName: z.Emergency_Contact_Last_Name || '',
      emergencyMobile: z.Emergency_Contact_Number || '',
      emergencyRelation: z.Relationship_with_Contact || '',
      doj: z.Date_of_Joining || new Date().toISOString().split('T')[0],
      dept: z.Department || 'Sales',
      role: z.Designation_Job_Title || '',
      systemRole,
      workEmail: z.Email || z.Personal_Email_Address || '',
      previousEmployer: z.Previous_Employer || '',
      experience: z.Total_Experience || '',
      employmentType: z.Employment_Type || 'Full Time',
      hasPf: Boolean(z.PF_Applicable),
      teamLeaderId: '',
      teamLeaderName: z.Who_is_the_Team_Leader_TL || '',
      reportingManagerId: '',
      reportingManagerName: z.Reporting_Manager || '',
      bankAccount: z.Bank_Account_Number || '',
      bankName: z.Bank_Name || '',
      ifsc: z.IFSC_Code || '',
      panNumber: z.Pan_Number || '',
      aadhaarNumber: z.Aadhaar_Number || '',
      passportNumber: z.Passport_Number || '',
      drivingLicense: z.Driving_License_Number || '',
      pfNumber: z.PF_Number || '',
      esicNumber: z.ESIC_Number || '',
      uanNumber: z.UAN_Number || '',
      medicalInsurance: z.Medical_Insurance_Number || '',
      monthlyTarget: z.Monthly_Target || z.Target || z.Sales_Target || '',
      target: z.Monthly_Target || z.Target || z.Sales_Target || '',
    };

    const monthlyTarget = z.Monthly_Target || z.Target || z.Sales_Target || '';

    return {
      id: empId,
      name: fullName || 'Employee',
      email: z.Email || z.Personal_Email_Address || '',
      mobile: z.Contact_Number || '',
      dept: z.Department || 'General',
      role: z.Designation_Job_Title || z.System_Role || 'Team Member',
      systemRole,
      salaryEntity: z.Salary_Entity || z.Company_Entity || 'BSPL',
      teamLeaderName: z.Who_is_the_Team_Leader_TL || '',
      reportingManagerName: z.Reporting_Manager || '',
      joined: z.Date_of_Joining || z.Created_Time?.split('T')[0] || new Date().toISOString().split('T')[0],
      status: 'Active',
      formData: fd,
      monthlyTarget,
      target: monthlyTarget,
      zohoId: String(z.id),
      zohoStatus: 'synced',
      zohoSyncedAt: z.Modified_Time || z.Created_Time || new Date().toISOString(),
    };
  };

  const syncEmployeesFromZoho = async (showNotification = false) => {
    setIsFetchingZoho(true);
    try {
      const res = await fetchZohoEmployees();
      if (res.success && Array.isArray(res.data)) {
        const zohoEmployees = res.data.map(mapZohoRecordToEmployee);
        
        // Merge with existing local employees to keep any local documents / un-synced items
        const saved = localStorage.getItem('be_employees');
        const localList: EmployeeData[] = saved ? JSON.parse(saved) : [];

        const seenZohoIds = new Set<string>();
        const seenIds = new Set<string>();
        const mergedList: EmployeeData[] = [];

        // Add Zoho employees
        for (const zEmp of zohoEmployees) {
          if (zEmp.zohoId) seenZohoIds.add(zEmp.zohoId);
          if (zEmp.id) seenIds.add(zEmp.id.toLowerCase());
          mergedList.push(zEmp);
        }

        // Preserve any local non-synced employees
        for (const lEmp of localList) {
          const lId = lEmp.id ? (lEmp.id ?? '').toLowerCase() : '';
          const lZoho = lEmp.zohoId ? String(lEmp.zohoId) : '';
          if (lZoho && seenZohoIds.has(lZoho)) continue;
          if (lId && seenIds.has(lId)) continue;
          if (lId) seenIds.add(lId);
          if (lZoho) seenZohoIds.add(lZoho);
          mergedList.push(lEmp);
        }

        setEmployees(mergedList);
        localStorage.setItem('be_employees', JSON.stringify(mergedList));
        window.dispatchEvent(new Event('be_employees_updated'));

        if (showNotification) {
          setToast({
            type: 'success',
            message: `Synced ${zohoEmployees.length} Employee(s) from Zoho CRM`,
            submessage: 'Employee directory is up to date with live Zoho database'
          });
        }
      } else if (showNotification) {
        setToast({
          type: 'info',
          message: 'No employees returned from Zoho CRM',
          submessage: res.message || 'Check connection or Zoho CRM module records'
        });
      }
    } catch (err: any) {
      console.warn('[Zoho CRM] Employee fetch error:', err);
      if (showNotification) {
        setToast({
          type: 'error',
          message: 'Failed to fetch employees from Zoho CRM',
          submessage: err?.message || 'Network error communicating with server'
        });
      }
    } finally {
      setIsFetchingZoho(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('be_employees');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setEmployees(parsed);
        } else {
          setEmployees([]);
        }
      } catch (e) {
        setEmployees([]);
      }
    } else {
      setEmployees([]);
      localStorage.setItem('be_employees', JSON.stringify([]));
    }

    // Automatically sync live records from Zoho CRM on mount
    syncEmployeesFromZoho(false);
  }, []);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const saveToStorage = (newEmployees: EmployeeData[]) => {
    // Robust de-duplication by ID and zohoId so duplicates never appear
    const seenIds = new Set<string>();
    const seenZohoIds = new Set<string>();
    const uniqueEmployees: EmployeeData[] = [];

    for (const emp of newEmployees) {
      const idKey = emp.id ? String(emp.id).trim().toLowerCase() : '';
      const zohoKey = emp.zohoId ? String(emp.zohoId).trim() : '';

      if (idKey && seenIds.has(idKey)) {
        continue;
      }
      if (zohoKey && seenZohoIds.has(zohoKey)) {
        continue;
      }

      if (idKey) seenIds.add(idKey);
      if (zohoKey) seenZohoIds.add(zohoKey);
      uniqueEmployees.push(emp);
    }

    setEmployees(uniqueEmployees);
    localStorage.setItem('be_employees', JSON.stringify(uniqueEmployees));
    window.dispatchEvent(new Event('be_employees_updated'));
  };

  // Helper lists for dropdowns
  const availableTeamLeaders = employees.filter(e => {
    if (e.systemRole === 'HOD' || e.systemRole === 'HR' || e.systemRole === 'Super Admin') return false;
    return e.systemRole === 'TL';
  });
  const availableManagersAndHODs = employees.filter(e => e.systemRole === 'HOD' || e.systemRole === 'Super Admin' || e.systemRole === 'HR');
  const availableSuperAdmins = employees.filter(e => e.systemRole === 'Super Admin');

  const handleAdditionalDocChange = (key: string, file: File | null) => {
    if (file) {
      setAdditionalDocs(prev => ({ ...prev, [key]: { file, name: file.name } }));
    } else {
      const next = { ...additionalDocs };
      delete next[key];
      setAdditionalDocs(next);
    }
  };

  const toggleLanguage = (lang: string) => {
    if (formData.languages.includes(lang)) {
      setFormData({ ...formData, languages: formData.languages.filter(l => l !== lang) });
    } else {
      setFormData({ ...formData, languages: [...formData.languages, lang] });
    }
  };

  const handleRoleSelection = (role: SystemRole) => {
    let autoReportingManagerId = '';
    let autoReportingManagerName = '';
    let autoTeamLeaderId = '';
    let autoTeamLeaderName = '';

    if (role === 'TM') {
      // Find a default TL in same department if available
      const sameDeptTL = availableTeamLeaders.find(tl => tl.dept === formData.dept) || availableTeamLeaders[0];
      if (sameDeptTL) {
        autoTeamLeaderId = sameDeptTL.id;
        autoTeamLeaderName = `${sameDeptTL.name} (TL)`;
        autoReportingManagerId = sameDeptTL.reportingManagerId || '';
        autoReportingManagerName = sameDeptTL.reportingManagerName || '';
      }
    } else if (role === 'TL') {
      // Find a default HOD in same department if available
      const sameDeptHOD = availableManagersAndHODs.find(m => m.dept === formData.dept && m.systemRole === 'HOD') || availableManagersAndHODs[0];
      if (sameDeptHOD) {
        autoReportingManagerId = sameDeptHOD.id;
        autoReportingManagerName = `${sameDeptHOD.name} (${sameDeptHOD.systemRole})`;
      }
    } else if (role === 'HOD' || role === 'HR') {
      const superAdmin = availableSuperAdmins[0] || employees.find(e => e.systemRole === 'Super Admin') || {
        id: 'EMP-001',
        name: 'Managing Director',
        systemRole: 'Super Admin'
      };
      autoReportingManagerId = superAdmin.id || 'EMP-001';
      autoReportingManagerName = superAdmin.name ? `${superAdmin.name} (Super Admin)` : 'Managing Director (Super Admin)';
    }

    setFormData({
      ...formData,
      systemRole: role,
      teamLeaderId: autoTeamLeaderId,
      teamLeaderName: autoTeamLeaderName,
      reportingManagerId: autoReportingManagerId,
      reportingManagerName: autoReportingManagerName
    });
  };

  const handleTLChange = (tlId: string) => {
    const selectedTL = employees.find(e => e.id === tlId);
    if (selectedTL) {
      const isTL = selectedTL.systemRole === 'TL';
      setFormData({
        ...formData,
        teamLeaderId: selectedTL.id,
        teamLeaderName: `${selectedTL.name} (${selectedTL.systemRole || 'TL'})`,
        reportingManagerId: selectedTL.reportingManagerId || (selectedTL.systemRole === 'HOD' ? selectedTL.id : 'EMP-001'),
        reportingManagerName: selectedTL.reportingManagerName || (selectedTL.systemRole === 'HOD' ? `${selectedTL.name} (HOD)` : 'Managing Director (Super Admin)')
      });
    } else {
      setFormData({
        ...formData,
        teamLeaderId: '',
        teamLeaderName: '',
        reportingManagerId: '',
        reportingManagerName: ''
      });
    }
  };

  const handleManagerChange = (mgrId: string) => {
    const selectedMgr = employees.find(e => e.id === mgrId);
    if (selectedMgr) {
      setFormData({
        ...formData,
        reportingManagerId: selectedMgr.id,
        reportingManagerName: `${selectedMgr.name} (${selectedMgr.systemRole || 'Manager'})`
      });
    } else {
      setFormData({
        ...formData,
        reportingManagerId: '',
        reportingManagerName: ''
      });
    }
  };

  const validateStep = (_step: number) => {
    // No mandatory fields required
    setFormErrors({});
    return true;
  };

  const handleNextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 5));
  };

  const handleSaveEmployee = async () => {
    const targetOriginalId = editingEmployee ? editingEmployee.id : null;
    const targetOriginalZohoId = editingEmployee?.zohoId || null;
    const finalEmpId = formData.empId || targetOriginalId || `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    const fullName = `${formData.firstName || ''} ${formData.middleName || ''} ${formData.lastName || ''}`.trim() || editingEmployee?.name || 'Employee';
    const newDocsToAdd: any[] = [];

    // Save each optional/additional document to local IndexedDB & prepare metadata
    for (const key of Object.keys(additionalDocs)) {
      const doc = additionalDocs[key];
      if (doc && doc.file) {
        const docId = `${finalEmpId}_${key}_${doc.name}`;
        try {
          await saveDocument(docId, doc.file);
          const fieldDef = OPTIONAL_DOCUMENT_FIELDS.find(f => f.id === key);
          const docTitle = fieldDef ? fieldDef.label : key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          newDocsToAdd.push({
            id: `DOC-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            empId: finalEmpId,
            empName: fullName,
            title: docTitle,
            date: new Date().toLocaleDateString('en-GB'),
            fileId: docId,
            fileName: doc.name
          });
        } catch (e) { console.error('Failed to save document', e); }
      }
    }

    // Save passbook / cancelled cheque document
    if (salaryDocumentFile) {
      const docId = `${finalEmpId}_${salaryDocumentFile.name}`;
      try {
        await saveDocument(docId, salaryDocumentFile);
        newDocsToAdd.push({
          id: `DOC-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          empId: finalEmpId,
          empName: fullName,
          title: 'Screenshot of Passbook / Cancelled Cheque',
          date: new Date().toLocaleDateString('en-GB'),
          fileId: docId,
          fileName: salaryDocumentFile.name
        });
      } catch (e) { console.error('Failed to save document', e); }
    }

    if (newDocsToAdd.length > 0) {
      try {
        const existingDocs = JSON.parse(localStorage.getItem('be_emp_docs') || '[]');
        localStorage.setItem('be_emp_docs', JSON.stringify([...newDocsToAdd, ...existingDocs]));
      } catch (e) {
        console.error('Failed to update emp docs', e);
      }
    }

    const finalReportingManagerId = (formData.systemRole === 'HOD' || formData.systemRole === 'HR')
      ? (formData.reportingManagerId || availableSuperAdmins[0]?.id || 'EMP-001')
      : formData.reportingManagerId;
    const finalReportingManagerName = (formData.systemRole === 'HOD' || formData.systemRole === 'HR')
      ? (formData.reportingManagerName || (availableSuperAdmins[0]?.name ? `${availableSuperAdmins[0].name} (Super Admin)` : 'Managing Director (Super Admin)'))
      : formData.reportingManagerName;

    const newEmp: EmployeeData = {
      id: finalEmpId,
      name: fullName,
      email: formData.email,
      mobile: formData.mobile,
      dept: formData.dept,
      role: formData.role,
      systemRole: formData.systemRole,
      salaryEntity: formData.salaryEntity || 'BSPL',
      teamLeaderId: formData.teamLeaderId,
      teamLeaderName: formData.teamLeaderName,
      reportingManagerId: finalReportingManagerId,
      reportingManagerName: finalReportingManagerName,
      joined: formData.doj,
      status: editingEmployee ? editingEmployee.status : 'Active',
      monthlyTarget: formData.monthlyTarget || formData.target || '',
      target: formData.target || formData.monthlyTarget || '',
      formData: {
        ...formData,
        salaryEntity: formData.salaryEntity || 'BSPL',
        empId: finalEmpId,
        reportingManagerId: finalReportingManagerId,
        reportingManagerName: finalReportingManagerName,
        monthlyTarget: formData.monthlyTarget || formData.target || '',
        target: formData.target || formData.monthlyTarget || '',
      },
      salaryDocumentName: salaryDocumentName || (editingEmployee ? editingEmployee.salaryDocumentName : ''),
      zohoId: editingEmployee?.zohoId,
      zohoStatus: editingEmployee?.zohoStatus || 'pending',
    };

    setIsSubmitting(true);
    // Sync with Zoho CRM Employee Module
    try {
      const zohoRes = await saveOrUpdateZohoEmployee(newEmp);
      const finalZohoId = zohoRes.zohoId || newEmp.zohoId;

      if (zohoRes.success && finalZohoId) {
        newEmp.zohoId = finalZohoId;
        newEmp.zohoStatus = 'synced';
        newEmp.zohoSyncedAt = new Date().toISOString();

        let docUploadCount = 0;
        // Upload each attached document (1-8 supporting docs) to Zoho CRM Employee record
        for (const key of Object.keys(additionalDocs)) {
          const doc = additionalDocs[key];
          if (doc && doc.file) {
            try {
              const fieldDef = OPTIONAL_DOCUMENT_FIELDS.find(f => f.id === key);
              const customFileName = fieldDef ? `[${fieldDef.num}] ${doc.name}` : doc.name;
              await uploadZohoAttachment(finalZohoId, doc.file, customFileName, 'Employee');
              docUploadCount++;
            } catch (docErr) {
              console.warn(`[Zoho CRM] Document ${doc.name} upload failed:`, docErr);
            }
          }
        }

        // Upload salary document (Passbook/Cancelled Cheque) to Zoho CRM Employee record
        if (salaryDocumentFile) {
          try {
            await uploadZohoAttachment(finalZohoId, salaryDocumentFile, `[Passbook_Cheque] ${salaryDocumentFile.name}`, 'Employee');
            docUploadCount++;
          } catch (docErr) {
            console.warn(`[Zoho CRM] Salary document ${salaryDocumentFile.name} upload failed:`, docErr);
          }
        }

        setToast({
          type: 'success',
          message: editingEmployee ? 'Employee Updated & Synced to Zoho CRM!' : 'Employee Created & Synced to Zoho CRM!',
          submessage: `${editingEmployee ? 'Updated' : 'Created'} in Zoho Employee module (ID: #${finalZohoId}) with ${docUploadCount} document(s) attached`
        });
      } else {
        newEmp.zohoStatus = 'failed';
        newEmp.zohoError = zohoRes.message;
        setToast({
          type: 'error',
          message: `Employee Saved Locally (Zoho ${editingEmployee ? 'Update' : 'Sync'} Failed)`,
          submessage: zohoRes.message || 'Check Zoho CRM credentials or field requirements'
        });
      }
    } catch (zErr: any) {
      console.error('[Zoho CRM] Employee sync exception:', zErr);
      newEmp.zohoStatus = 'failed';
      newEmp.zohoError = zErr?.message || 'Sync failed';
      setToast({
        type: 'error',
        message: `Employee Saved Locally (Zoho ${editingEmployee ? 'Update' : 'Sync'} Error)`,
        submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
      });
    } finally {
      setIsSubmitting(false);
    }

    let updatedEmployees: EmployeeData[];
    if (editingEmployee) {
      // Find the existing employee by matching original ID, original Zoho ID, or target finalEmpId
      const matchIndex = employees.findIndex(emp =>
        (targetOriginalId && emp.id === targetOriginalId) ||
        (targetOriginalZohoId && emp.zohoId && emp.zohoId === targetOriginalZohoId) ||
        (emp.id === finalEmpId)
      );

      if (matchIndex !== -1) {
        // Update the employee in-place
        const listCopy = [...employees];
        listCopy[matchIndex] = {
          ...newEmp,
          id: finalEmpId,
          status: editingEmployee.status || listCopy[matchIndex].status || 'Active'
        };
        // Filter out any other accidental duplicate occurrences of the same employee
        updatedEmployees = listCopy.filter((emp, idx) => {
          if (idx === matchIndex) return true;
          if (finalEmpId && emp.id === finalEmpId) return false;
          if (targetOriginalId && emp.id === targetOriginalId) return false;
          if (targetOriginalZohoId && emp.zohoId && emp.zohoId === targetOriginalZohoId) return false;
          return true;
        });
      } else {
        // If not found by index, prepend cleanly and deduplicate
        updatedEmployees = [newEmp, ...employees.filter(e => e.id !== finalEmpId && (!targetOriginalId || e.id !== targetOriginalId))];
      }
    } else {
      // Adding new employee (prevent duplicate ID)
      updatedEmployees = [newEmp, ...employees.filter(e => e.id !== finalEmpId)];
    }

    saveToStorage(updatedEmployees);
    closeModal();
  };

  const openEditModal = (employee: EmployeeData) => {
    const sRole = employee.systemRole || (employee.formData?.systemRole) || 'TM';
    const isHodOrHr = sRole === 'HOD' || sRole === 'HR';
    const defaultRmId = isHodOrHr ? (availableSuperAdmins[0]?.id || 'EMP-001') : '';
    const defaultRmName = isHodOrHr ? (availableSuperAdmins[0]?.name ? `${availableSuperAdmins[0].name} (Super Admin)` : 'Managing Director (Super Admin)') : '';

    const nameParts = (employee.name || '').trim().split(/\s+/);
    const fallbackFirst = nameParts[0] || '';
    const fallbackLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const fallbackMiddle = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

    setEditingEmployee(employee);
    setFormData({
      ...initialFormData,
      ...(employee.formData || {}),
      firstName: employee.formData?.firstName || fallbackFirst,
      middleName: employee.formData?.middleName || fallbackMiddle,
      lastName: employee.formData?.lastName || fallbackLast,
      email: employee.formData?.email || employee.email || '',
      mobile: employee.formData?.mobile || employee.mobile || '',
      empId: employee.formData?.empId || employee.id || '',
      dept: employee.dept || employee.formData?.dept || 'Sales',
      role: employee.role || employee.formData?.role || '',
      systemRole: sRole,
      salaryEntity: (employee.salaryEntity || employee.formData?.salaryEntity || 'BSPL') as string,
      teamLeaderId: employee.teamLeaderId || (employee.formData?.teamLeaderId) || '',
      teamLeaderName: employee.teamLeaderName || (employee.formData?.teamLeaderName) || '',
      reportingManagerId: employee.reportingManagerId || (employee.formData?.reportingManagerId) || defaultRmId,
      reportingManagerName: employee.reportingManagerName || (employee.formData?.reportingManagerName) || defaultRmName,
      monthlyTarget: employee.monthlyTarget || employee.formData?.monthlyTarget || employee.target || employee.formData?.target || '',
      target: employee.target || employee.formData?.target || employee.monthlyTarget || employee.formData?.monthlyTarget || '',
      doj: employee.joined || employee.formData?.doj || new Date().toISOString().split('T')[0],
    });
    setSalaryDocumentName(employee.salaryDocumentName || '');
    setSalaryDocumentFile(null);
    setAdditionalDocs({});
    setCurrentStep(1);
    setIsModalOpen(true);
  };

  const openTargetModal = (employee: EmployeeData) => {
    setTargetModalEmployee(employee);
    setTargetInputVal(String(employee.monthlyTarget || employee.formData?.monthlyTarget || employee.target || employee.formData?.target || '').replace(/[^0-9]/g, ''));
  };

  const closeTargetModal = () => {
    setTargetModalEmployee(null);
    setTargetInputVal('');
  };

  const handleSaveTarget = async () => {
    if (!targetModalEmployee) return;
    setIsSavingTarget(true);

    const cleanTarget = targetInputVal.trim();
    const updatedEmp: EmployeeData = {
      ...targetModalEmployee,
      monthlyTarget: cleanTarget,
      target: cleanTarget,
      formData: {
        ...(targetModalEmployee.formData || {}),
        monthlyTarget: cleanTarget,
        target: cleanTarget
      }
    };

    const updatedList = employees.map(e => e.id === targetModalEmployee.id ? updatedEmp : e);
    saveToStorage(updatedList);

    // Sync in background to Zoho Employee module
    if (updatedEmp.zohoId) {
      saveOrUpdateZohoEmployee(updatedEmp).catch(err => console.warn('[Zoho CRM] Target sync error:', err));
    }

    setToast({
      type: 'success',
      message: `Monthly Target Updated for ${targetModalEmployee.name}`,
      submessage: cleanTarget ? `New Target: ₹${Number(cleanTarget).toLocaleString('en-IN')}` : 'Target cleared'
    });

    setIsSavingTarget(false);
    closeTargetModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEmployee(null);
    setFormData(initialFormData);
    setSalaryDocumentName('');
    setSalaryDocumentFile(null);
    setAdditionalDocs({});
    setCurrentStep(1);
    setFormErrors({});
  };

  const handleDelete = async (id: string) => {
    if (!can('delete_employee')) {
      alert('Permission Denied: Only Super Admin can delete employee records.');
      return;
    }
    const targetEmp = employees.find(e => e.id === id);
    if (!targetEmp) return;

    if (confirm(`Are you sure you want to delete employee "${targetEmp.name}"? `)) {
      saveToStorage(employees.filter(e => e.id !== id));

      if (targetEmp.zohoId) {
        try {
          const zohoRes = await deleteZohoEmployee(targetEmp.zohoId);
          if (zohoRes.success) {
            setToast({
              type: 'success',
              message: `Employee "${targetEmp.name}" Deleted`,
              submessage: `Record has been deleted successfully (ID: #${targetEmp.zohoId})`
            });
          } else {
            setToast({
              type: 'error',
              message: `Employee Deleted Locally (Zoho Delete Failed)`,
              submessage: zohoRes.message || 'Check Zoho CRM permissions or record status'
            });
          }
        } catch (zErr: any) {
          console.error('[Zoho CRM] Employee delete exception:', zErr);
          setToast({
            type: 'error',
            message: `Employee Deleted Locally (Zoho Delete Error)`,
            submessage: zErr?.message || 'Failed to communicate with Zoho CRM API'
          });
        }
      } else {
        setToast({
          type: 'success',
          message: `Employee "${targetEmp.name}" Deleted`,
          submessage: 'Record has been deleted successfully'
        });
      }
    }
  };

  const isFullAdmin = isSuperAdmin || isHR;
  const isHodUser = isHOD || (currentUser.role as string) === 'HOD';
  const isTeamLead = !isFullAdmin && !isHodUser && (isTL || currentUser.role === 'TL');

  const matchedEmployees = (isFullAdmin || isHodUser)
    ? employees
    : employees.filter(e =>
      e.id === currentUser.id ||
      e.id === currentUser.empId ||
      (currentUser.id && e.id && String(e.id).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
      (currentUser.empId && e.id && String(e.id).trim().toLowerCase() === String(currentUser.empId).trim().toLowerCase()) ||
      (e.email && currentUser.email && (e.email ?? '').trim().toLowerCase() === (currentUser.email ?? '').trim().toLowerCase()) ||
      (e.formData?.email && currentUser.email && e.formData.email.trim().toLowerCase() === (currentUser.email ?? '').trim().toLowerCase()) ||
      (e.formData?.workEmail && currentUser.email && e.formData.workEmail.trim().toLowerCase() === (currentUser.email ?? '').trim().toLowerCase()) ||
      (e.name && currentUser.name && (e.name ?? '').trim().toLowerCase() === (currentUser.name ?? '').trim().toLowerCase())
    );

  const visibleEmployees: EmployeeData[] = (!isFullAdmin && !isHodUser && matchedEmployees.length === 0)
    ? [{
      id: currentUser.empId || currentUser.id || (isTeamLead ? 'EMP-TL' : 'EMP-TM'),
      name: currentUser.name || (isTeamLead ? 'Team Leader' : 'Team Member'),
      email: currentUser.email || '',
      mobile: '',
      dept: currentUser.department || 'General',
      role: currentUser.designation || (isTeamLead ? 'Team Leader' : 'Team Member'),
      systemRole: (isTeamLead ? 'TL' : 'TM') as SystemRole,
      teamLeaderId: currentUser.teamLeaderId,
      teamLeaderName: currentUser.teamLeaderName,
      reportingManagerId: currentUser.reportingManagerId,
      reportingManagerName: currentUser.reportingManagerName,
      status: 'Active' as const,
      joined: new Date().toISOString().split('T')[0],
      formData: {}
    }]
    : matchedEmployees;

  const filteredEmployees = visibleEmployees.filter(e => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (e.name ?? '').toLowerCase().includes(q) ||
      (e.id ?? '').toLowerCase().includes(q) ||
      (e.dept ?? '').toLowerCase().includes(q) ||
      (e.role ?? '').toLowerCase().includes(q) ||
      (e.systemRole ? e.systemRole.toLowerCase().includes(q) : false);

    const matchesRole = selectedRoleFilter === 'All' || e.systemRole === selectedRoleFilter;
    const matchesDept = selectedDeptFilter === 'All' || e.dept === selectedDeptFilter;

    return matchesSearch && matchesRole && matchesDept;
  });


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-emerald-100 text-emerald-700';
      case 'On Leave': return 'bg-orange-100 text-orange-700';
      case 'Inactive': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getRoleBadge = (role?: SystemRole) => {
    const r = role || 'TM';
    const info = ROLE_DEFINITIONS[r] || ROLE_DEFINITIONS['TM'];
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${info.badgeClass}`}>
        {r === 'Super Admin' && <Crown className="w-3 h-3 mr-1" />}
        {r === 'HR' && <UserCheck className="w-3 h-3 mr-1" />}
        {r === 'HOD' && <Shield className="w-3 h-3 mr-1" />}
        {r === 'TL' && <Briefcase className="w-3 h-3 mr-1" />}
        {r === 'TM' && <User className="w-3 h-3 mr-1" />}
        {info.shortLabel}
      </span>
    );
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[999] max-w-md p-4 rounded-xl shadow-2xl border flex items-start space-x-3 backdrop-blur-md ${toast.type === 'success'
              ? 'bg-emerald-950/90 text-white border-emerald-500/30'
              : toast.type === 'error'
                ? 'bg-rose-950/90 text-white border-rose-500/30'
                : 'bg-slate-900/90 text-white border-slate-700'
              }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <Cloud className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <p className="font-semibold text-white">{toast.message}</p>
              {toast.submessage && (
                <p className="text-xs text-gray-300 mt-1 font-mono break-all">{toast.submessage}</p>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {isFullAdmin
                ? 'Employee Directory & Hierarchy'
                : isHodUser
                  ? 'Employee Target Management & Directory'
                  : 'My Employment Profile & Details'}
            </h1>
            <span className="px-2.5 py-1 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
              {visibleEmployees.length} {visibleEmployees.length === 1 ? 'Record' : 'Total'}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {isFullAdmin
              ? 'Manage organization members, system roles, and employee records.'
              : isHodUser
                ? 'Review department team members and assign monthly performance & sales targets.'
                : `Personal employment profile and reporting hierarchy for ${currentUser.name}.`}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => syncEmployeesFromZoho(true)}
            disabled={isFetchingZoho}
            title="Sync live records from Zoho CRM"
            className="bg-white hover:bg-orange-50 text-gray-700 hover:text-be-orange border border-gray-200 hover:border-orange-300 px-4 py-2.5 rounded-xl font-bold flex items-center transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50"
          >
            {isFetchingZoho ? (
              <Loader2 size={16} className="mr-2 animate-spin text-be-orange" />
            ) : (
              <Cloud size={16} className="mr-2 text-be-orange" />
            )}
            {isFetchingZoho ? 'Syncing...' : 'Sync Zoho CRM'}
          </button>

          {can('create_employee') ? (
            <button
              onClick={() => {
                setFormData(initialFormData);
                setSalaryDocumentName('');
                setSalaryDocumentFile(null);
                setCurrentStep(1);
                setEditingEmployee(null);
                setIsModalOpen(true);
              }}
              className="bg-be-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center transition-all shadow-md shadow-orange-500/20 hover:shadow-lg hover:-translate-y-0.5"
            >
              <UserPlus size={18} className="mr-2" />
              Add Employee
            </button>
          ) : isHodUser ? (
            <div className="flex items-center gap-2">
              <span className="px-3.5 py-2 bg-blue-50 text-blue-800 rounded-xl font-bold text-xs border border-blue-200 flex items-center shadow-sm">
                <Shield size={14} className="mr-1.5 text-blue-600" /> HOD: Target Assignment Authority
              </span>
              <button
                onClick={() => navigate('/hrms/my-team')}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold text-xs border border-amber-200 transition-colors flex items-center shadow-sm"
              >
                <Users size={14} className="mr-1.5 text-amber-600" /> My Team Hub
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isTeamLead && (
                <button
                  onClick={() => navigate('/hrms/my-team')}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold text-xs border border-amber-200 transition-colors flex items-center"
                >
                  <Users size={14} className="mr-1.5" /> Go to My Team Hub
                </button>
              )}
              <div className="text-xs text-gray-500 bg-gray-50 px-3.5 py-2 rounded-xl font-medium border border-gray-200 flex items-center">
                <Info size={14} className="mr-1.5 text-gray-400" />
                {`Personal Profile View (${currentUser.role})`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HOD Target Assignment Quick Banner */}
      {isHodUser && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50/40 to-amber-50/60 p-4 rounded-2xl border border-blue-100/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/20">
              <Target size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 flex items-center">
                HOD Target Assignment & Performance Hub
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-extrabold rounded-full">
                  Target Authority
                </span>
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                You have exclusive authority to assign and adjust monthly sales & performance targets for your team. Employee creation & payroll remain managed by HR.
              </p>
            </div>
          </div>
          <div className="text-xs font-bold text-blue-900 bg-white/90 px-3.5 py-1.5 rounded-xl border border-blue-200/60 shrink-0 self-start sm:self-center shadow-sm">
            {employees.filter(e => e.monthlyTarget || e.target).length} / {employees.length} Targets Configured
          </div>
        </div>
      )}

      {/* Role Stats Filter Cards (Shown for Super Admin / HR Admin / HOD) */}
      {(isFullAdmin || isHodUser) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { role: 'All', label: 'All Roles', count: employees.length, color: 'border-gray-200 bg-white text-gray-800' },
            { role: 'Super Admin', label: 'Super Admins', count: employees.filter(e => e.systemRole === 'Super Admin').length, color: 'border-purple-200 bg-purple-50/50 text-purple-900' },
            { role: 'HR', label: 'HR Admins', count: employees.filter(e => e.systemRole === 'HR').length, color: 'border-rose-200 bg-rose-50/50 text-rose-900' },
            { role: 'HOD', label: 'Admin (HOD)', count: employees.filter(e => e.systemRole === 'HOD').length, color: 'border-blue-200 bg-blue-50/50 text-blue-900' },
            { role: 'TL', label: 'Team Leaders (TL)', count: employees.filter(e => e.systemRole === 'TL').length, color: 'border-amber-200 bg-amber-50/50 text-amber-900' },
            { role: 'TM', label: 'Team Members (TM)', count: employees.filter(e => e.systemRole === 'TM' || !e.systemRole).length, color: 'border-emerald-200 bg-emerald-50/50 text-emerald-900' },
          ].map((tab) => (
            <button
              key={tab.role}
              onClick={() => setSelectedRoleFilter(tab.role)}
              className={`p-3.5 rounded-xl border text-left transition-all ${tab.color} ${selectedRoleFilter === tab.role ? 'ring-2 ring-be-orange shadow-sm font-bold' : 'hover:border-gray-300 opacity-90'
                }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold">{tab.label}</span>
                <span className="text-sm font-extrabold px-2 py-0.5 rounded-full bg-white shadow-sm border border-gray-100">
                  {tab.count}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name, ID, role, TL, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-be-orange/20 focus:border-be-orange transition-all text-sm bg-white"
            />
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium outline-none focus:border-be-orange"
            >
              <option value="All">All Departments</option>
              <option value="Sales">Sales</option>
              <option value="IT">IT</option>
              <option value="HR">HR</option>
              <option value="Finance">Finance</option>
              <option value="Operations">Operations</option>
              <option value="Marketing">Marketing</option>
              <option value="Management">Management</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-transparent overflow-hidden">
        <div className="overflow-x-auto pb-6">
          <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-y-3">
            <thead className="bg-transparent text-gray-500 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">System Role</th>
                <th className="px-6 py-3">Hierarchy / Reporting To</th>
                <th className="px-6 py-3">Department & Designation</th>
                <th className="px-6 py-3">Monthly Target</th>
                <th className="px-6 py-3">Contact Info</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-semibold text-gray-700">No employees found</p>
                    <p className="text-xs text-gray-400 mt-1">Try changing your search or role filter criteria.</p>
                  </td>
                </tr>
              )}
              {filteredEmployees.map((emp) => {
                const sRole = emp.systemRole || 'TM';
                return (
                  <tr key={emp.id} className="bg-white hover:bg-orange-50/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group shadow-sm">
                    {/* Employee Profile */}
                    <td className="px-6 py-4 rounded-l-2xl border-t border-b border-l border-gray-100 group-hover:border-orange-100">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center mr-3 font-bold text-sm shrink-0 border border-orange-200 shadow-sm">
                          {(emp.name || 'EMP').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 group-hover:text-be-orange transition-colors">
                            {emp.name}
                          </div>
                          <div className="text-gray-400 text-xs font-mono font-medium">{emp.id}</div>
                        </div>
                      </div>
                    </td>

                    {/* System Role Badge */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      {getRoleBadge(sRole)}
                    </td>

                    {/* Reporting Hierarchy */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      {sRole === 'TM' && (
                        <div>
                          {emp.teamLeaderName ? (
                            <span className="text-xs font-semibold text-amber-700 flex items-center">
                              <ArrowRight size={12} className="mr-1 text-amber-500" />
                              {emp.teamLeaderName.includes('(HOD)') || emp.teamLeaderName.includes('HOD') ? 'Admin (HOD): ' : 'TL: '}
                              {emp.teamLeaderName}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400 flex items-center">
                              <ArrowRight size={12} className="mr-1 text-gray-400" />
                              TL: Not Assigned
                            </span>
                          )}
                          {emp.reportingManagerName && !emp.teamLeaderName?.includes(emp.reportingManagerName) && (
                            <span className="text-[11px] text-gray-400 block ml-4">
                              {emp.reportingManagerName.includes('Super Admin') ? 'Super Admin: ' : 'Admin (HOD): '}
                              {emp.reportingManagerName}
                            </span>
                          )}
                        </div>
                      )}
                      {sRole === 'TL' && (
                        <div>
                          {emp.reportingManagerName && emp.reportingManagerName.includes('Super Admin') ? (
                            <div>
                              <span className="text-xs font-semibold text-purple-700 flex items-center">
                                <ArrowRight size={12} className="mr-1 text-purple-500" />
                                Super Admin: {emp.reportingManagerName}
                              </span>
                              <span className="text-[11px] text-gray-400 block ml-4">
                                Direct report to Super Admin
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-xs font-semibold text-blue-700 flex items-center">
                                <ArrowRight size={12} className="mr-1 text-blue-500" />
                                Admin (HOD): {emp.reportingManagerName || 'Mishal (HOD)'}
                              </span>
                              <span className="text-[11px] text-gray-400 block ml-4">
                                Reports to: Super Admin
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {sRole === 'HOD' && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 flex items-center">
                            <ArrowRight size={12} className="mr-1 text-purple-500" />
                            Super Admin: {emp.reportingManagerName || 'Managing Director (Super Admin)'}
                          </span>
                          <span className="text-[11px] text-gray-400 block ml-4">
                            Reports directly to Super Admin
                          </span>
                        </div>
                      )}
                      {sRole === 'HR' && (
                        <div>
                          <span className="text-xs font-semibold text-rose-700 flex items-center">
                            <ArrowRight size={12} className="mr-1 text-rose-500" />
                            Super Admin: {emp.reportingManagerName || 'Managing Director (Super Admin)'}
                          </span>
                          <span className="text-[11px] text-gray-400 block ml-4">
                            Reports directly to Super Admin
                          </span>
                        </div>
                      )}
                      {sRole === 'Super Admin' && (
                        <span className="text-xs font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                          Root Administrator
                        </span>
                      )}
                    </td>

                    {/* Department & Role */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <div className="font-bold text-gray-800">{emp.dept}</div>
                      <div className="text-gray-500 text-xs font-medium">{emp.role}</div>
                    </td>

                    {/* Monthly Target */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      {emp.monthlyTarget || emp.target ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-extrabold shadow-sm">
                            <Target size={12} className="mr-1.5 text-amber-600 shrink-0" />
                            ₹{Number(String(emp.monthlyTarget || emp.target).replace(/[^0-9.]/g, '')).toLocaleString('en-IN')}
                          </span>
                          {(isSuperAdmin || isHOD) && (
                            <button
                              onClick={() => openTargetModal(emp)}
                              className="text-[11px] font-bold text-be-orange hover:text-orange-700 block transition-colors"
                            >
                              Edit Target
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-xs text-gray-400 font-medium italic">
                            Not Set
                          </span>
                          {(isSuperAdmin || isHOD) && (
                            <button
                              onClick={() => openTargetModal(emp)}
                              className="text-[11px] font-bold text-be-orange hover:text-orange-700 block transition-colors"
                            >
                              + Assign Target
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Contact Info */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <div className="text-gray-700 font-medium text-xs">{emp.email}</div>
                      <div className="text-gray-400 text-xs">{emp.mobile}</div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 border-t border-b border-gray-100 group-hover:border-orange-100">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold w-max shadow-sm ${getStatusColor(emp.status)}`}>
                        {emp.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right rounded-r-2xl border-t border-b border-r border-gray-100 group-hover:border-orange-100">
                      <div className="flex items-center justify-end space-x-1.5">
                        {(isSuperAdmin || isHOD) && (
                          <button
                            onClick={() => openTargetModal(emp)}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                            title="Assign / Edit Monthly Target"
                          >
                            <Target size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/hrms/employees/${emp.id}`)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="View Profile & Hierarchy"
                        >
                          <Eye size={16} />
                        </button>
                        {can('create_employee') && (
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Edit Employee & Roles"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {can('delete_employee') && (
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Delete Employee"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Employee Multi-Step Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingEmployee ? `Edit Employee: ${editingEmployee.name}` : 'Add New Employee'}
                  </h2>
                  <p className="text-xs text-gray-500 font-medium">Configure personal details, department, and role hierarchy</p>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Wizard Content */}
              <div className="p-6 sm:p-8 overflow-y-auto flex-1 custom-scrollbar">

                {/* Steps Indicator */}
                <div className="flex items-center justify-between mb-8 relative px-4">
                  <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-gray-200 -z-10" />
                  <div
                    className="absolute left-4 top-1/2 h-0.5 bg-be-orange -z-10 transition-all duration-500"
                    style={{ width: `${((currentStep - 1) / 4) * 100}%` }}
                  />

                  {['Personal Info', 'Educational Info', 'Family Details', 'Department & Role Hierarchy', 'Document Details'].map((stepName, idx) => {
                    const stepNum = idx + 1;
                    const isActive = currentStep === stepNum;
                    const isCompleted = currentStep > stepNum;

                    return (
                      <div key={stepNum} className="flex flex-col items-center">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 shadow-sm
                            ${isActive ? 'bg-be-orange text-white ring-4 ring-orange-100' :
                              isCompleted ? 'bg-emerald-500 text-white' :
                                'bg-white text-gray-400 border-2 border-gray-200'}
                          `}
                        >
                          {isCompleted ? <Check size={18} /> : stepNum}
                        </div>
                        <span className={`text-[11px] font-bold mt-2 text-center hidden sm:block ${isActive ? 'text-be-orange' : isCompleted ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {stepName}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Step 1: Personal Info */}
                {currentStep === 1 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <User size={20} className="mr-2 text-be-orange" /> Personal Information
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">First Name</label>
                        <input type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" placeholder="e.g. Rahul" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Middle Name</label>
                        <input type="text" value={formData.middleName} onChange={e => setFormData({ ...formData, middleName: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" placeholder="Optional" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Last Name</label>
                        <input type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" placeholder="e.g. Verma" />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Date of Birth</label>
                        <input type="date" value={formData.dob} onChange={e => setFormData({ ...formData, dob: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Gender</label>
                        <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-1 focus:ring-be-orange">
                          <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Nationality</label>
                        <input type="text" value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-1 focus:ring-be-orange focus:border-be-orange" />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Marital Status</label>
                        <select value={formData.maritalStatus} onChange={e => setFormData({ ...formData, maritalStatus: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-1 focus:ring-be-orange">
                          <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Contact Number</label>
                        <input type="text" value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" placeholder="10-digit mobile" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Personal Email Address</label>
                        <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" placeholder="email@example.com" />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Permanent Address</label>
                        <textarea value={formData.permanentAddress} onChange={e => setFormData({ ...formData, permanentAddress: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" rows={2} placeholder="Full permanent address"></textarea>
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Current Address</label>
                        <textarea value={formData.currentAddress} onChange={e => setFormData({ ...formData, currentAddress: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" rows={2} placeholder="Current residential address"></textarea>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Blood Group</label>
                        <input type="text" value={formData.bloodGroup} onChange={e => setFormData({ ...formData, bloodGroup: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange focus:border-be-orange" placeholder="e.g. O+, B+" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Educational Info */}
                {currentStep === 2 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Educational Info</h3>
                    <div className="grid grid-cols-1 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Education Qualification</label>
                        <input type="text" value={formData.education} onChange={e => setFormData({ ...formData, education: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" placeholder="e.g. B.Tech / MBA / BBA" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Professional Certifications</label>
                        <input type="text" value={formData.certifications} onChange={e => setFormData({ ...formData, certifications: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" placeholder="e.g. PMP, AWS, HubSpot Certified" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Key Skills</label>
                        <input type="text" value={formData.skills} onChange={e => setFormData({ ...formData, skills: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-1 focus:ring-be-orange" placeholder="e.g. Sales, Negotiations, React, TypeScript" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Languages Known</label>
                        <div className="flex gap-4">
                          {['Hindi', 'English', 'Gujarati'].map(lang => (
                            <label key={lang} className="flex items-center space-x-2 cursor-pointer">
                              <input type="checkbox" checked={formData.languages.includes(lang)} onChange={() => toggleLanguage(lang)} className="rounded text-be-orange focus:ring-be-orange w-4 h-4" />
                              <span className="text-sm font-medium text-gray-700">{lang}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Family Details */}
                {currentStep === 3 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Emergency & Family Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Emergency Contact First Name</label>
                        <input type="text" value={formData.emergencyFirstName} onChange={e => setFormData({ ...formData, emergencyFirstName: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Emergency Contact Last Name</label>
                        <input type="text" value={formData.emergencyLastName} onChange={e => setFormData({ ...formData, emergencyLastName: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Emergency Contact Number</label>
                        <input type="text" value={formData.emergencyMobile} onChange={e => setFormData({ ...formData, emergencyMobile: e.target.value.replace(/\D/g, '') })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Relationship with Contact</label>
                        <input type="text" value={formData.emergencyRelation} onChange={e => setFormData({ ...formData, emergencyRelation: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" placeholder="e.g. Father, Mother, Spouse" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 4: Department & Role Hierarchy */}
                {currentStep === 4 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="border-b border-gray-100 pb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center">
                        <Briefcase size={20} className="mr-2 text-be-orange" /> Department & Role-Based Access Hierarchy
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 font-medium">
                        Assign the employee's system role (Super Admin / HOD / TL / TM) and define their direct reporting line.
                      </p>
                    </div>

                    {/* Basic Dept Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Employee ID</label>
                        <input
                          type="text"
                          value={formData.empId}
                          onChange={e => setFormData({ ...formData, empId: e.target.value })}
                          className="w-full px-3 py-2 border rounded-xl outline-none font-mono font-bold border-gray-300 focus:ring-1 focus:ring-be-orange"
                          placeholder="e.g. EMP-1010"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Date of Joining</label>
                        <input type="date" value={formData.doj} onChange={e => setFormData({ ...formData, doj: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Department</label>
                        <select
                          value={formData.dept}
                          onChange={e => setFormData({ ...formData, dept: e.target.value })}
                          className="w-full px-3 py-2 border rounded-xl outline-none bg-white font-medium border-gray-300 focus:ring-1 focus:ring-be-orange"
                        >
                          <option value="Sales">Sales</option>
                          <option value="IT">IT</option>
                          <option value="HR">HR</option>
                          <option value="Finance">Finance</option>
                          <option value="Operations">Operations</option>
                          <option value="Marketing">Marketing</option>
                          <option value="Management">Management</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Designation / Job Title</label>
                        <input
                          type="text"
                          value={formData.role}
                          onChange={e => setFormData({ ...formData, role: e.target.value })}
                          className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange"
                          placeholder="e.g. Senior Sales Executive, Lead Developer"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Work Email</label>
                        <input type="email" value={formData.workEmail} onChange={e => setFormData({ ...formData, workEmail: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" placeholder="name@bharatedge.com" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Employment Type</label>
                        <select value={formData.employmentType} onChange={e => setFormData({ ...formData, employmentType: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange">
                          <option value="Full Time">Full Time</option>
                          <option value="Part Time">Part Time</option>
                          <option value="Intern">Intern</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Previous Employer</label>
                        <input type="text" value={formData.previousEmployer} onChange={e => setFormData({ ...formData, previousEmployer: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" placeholder="e.g. TCS / Infosys / Fresh" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Total Experience</label>
                        <input type="text" value={formData.experience} onChange={e => setFormData({ ...formData, experience: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none border-gray-300 focus:ring-1 focus:ring-be-orange" placeholder="e.g. 3 Years" />
                      </div>
                    </div>

                    {/* ROLE & HIERARCHY DEFINITION BOX */}
                    <div className="mt-8 p-6 bg-gradient-to-br from-orange-50/60 via-amber-50/40 to-blue-50/40 rounded-2xl border-2 border-orange-200/80 shadow-sm space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-extrabold text-gray-900 uppercase tracking-wider flex items-center">
                            <Crown className="w-4 h-4 mr-2 text-be-orange" />
                            System Role (Role-Based Access Control)
                          </label>
                          <span className="text-xs font-semibold text-gray-500">
                            Super Admin ➔ HR ➔ Admin (HOD) ➔ TL ➔ TM
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 font-medium mb-4">
                          Select the hierarchy position for this employee to configure permissions and workflow reporting.
                        </p>

                        {/* 5 Role Selector Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          {(['TM', 'TL', 'HOD', 'HR', 'Super Admin'] as SystemRole[]).map((r) => {
                            const isSelected = formData.systemRole === r;
                            const rDef = ROLE_DEFINITIONS[r];
                            return (
                              <div
                                key={r}
                                onClick={() => handleRoleSelection(r)}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${isSelected
                                  ? `${rDef.borderClass} ${rDef.bgClass} shadow-md ring-2 ring-orange-400/30`
                                  : 'border-white bg-white/90 hover:border-orange-200 hover:bg-white'
                                  }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rDef.badgeClass}`}>
                                      {rDef.shortLabel}
                                    </span>
                                    {isSelected && (
                                      <div className="w-4 h-4 rounded-full bg-be-orange text-white flex items-center justify-center">
                                        <Check size={10} strokeWidth={3} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900 mb-1">{rDef.label}</div>
                                  <div className="text-[11px] text-gray-500 leading-snug">{rDef.description}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* DYNAMIC HIERARCHY FIELDS */}
                      {/* Case 1: Team Member (TM) selected -> choose Team Leader (TL) */}
                      {formData.systemRole === 'TM' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-white rounded-xl border border-orange-200 shadow-sm space-y-4"
                        >
                          <div className="flex items-center space-x-2 text-amber-800 font-bold text-sm">
                            <Briefcase size={16} className="text-amber-600" />
                            <span>Team Member Hierarchy: Assign Team Leader (TL)</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Who is the Team Leader (TL)?
                              </label>
                              <select
                                value={formData.teamLeaderId}
                                onChange={(e) => handleTLChange(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-be-orange"
                              >
                                <option value="">-- Select Team Leader (TL) --</option>
                                {availableTeamLeaders.length > 0 ? (
                                  availableTeamLeaders.map((tl) => (
                                    <option key={tl.id} value={tl.id}>
                                      {tl.name} ({tl.id}) - {tl.dept} (TL)
                                    </option>
                                  ))
                                ) : (
                                  <optgroup label="Available Supervisors / HODs">
                                    {availableManagersAndHODs.map((mgr) => (
                                      <option key={mgr.id} value={mgr.id}>
                                        {mgr.name} ({mgr.id}) - {mgr.dept} ({mgr.systemRole})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>

                            {/* Shows who the TL reports to */}
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                {formData.reportingManagerName?.includes('Super Admin') ? 'Reporting Manager (Super Admin)' : 'Reporting Manager / HOD'} (Auto-linked via TL)
                              </label>
                              <input
                                type="text"
                                readOnly
                                value={formData.reportingManagerName || 'Auto-resolved from Team Leader'}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none cursor-not-allowed"
                              />
                            </div>
                          </div>

                          {/* Hierarchy Breadcrumb Preview */}
                          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/70 text-xs flex items-center flex-wrap gap-2">
                            <span className="font-bold text-gray-600">Reporting Chain:</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                              {formData.firstName || 'Employee'} (TM)
                            </span>
                            <span className="text-gray-400">➔</span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">
                              TL: {formData.teamLeaderName || 'Selected TL'}
                            </span>
                            <span className="text-gray-400">➔</span>
                            {formData.reportingManagerName?.includes('Super Admin') ? (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">
                                Super Admin: {formData.reportingManagerName}
                              </span>
                            ) : (
                              <>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                                  Admin (HOD): {formData.reportingManagerName || 'HOD'}
                                </span>
                                <span className="text-gray-400">➔</span>
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">
                                  Super Admin
                                </span>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* Case 2: Team Leader (TL) selected -> choose Reporting Manager */}
                      {formData.systemRole === 'TL' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm space-y-4"
                        >
                          <div className="flex items-center space-x-2 text-blue-800 font-bold text-sm">
                            <Shield size={16} className="text-blue-600" />
                            <span>Team Leader Hierarchy: Assign Reporting Manager (Admin / Super Admin)</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Who is the Reporting Manager?
                              </label>
                              <select
                                value={formData.reportingManagerId}
                                onChange={(e) => handleManagerChange(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">-- Select Reporting Manager --</option>
                                <optgroup label="Super Admin">
                                  {availableSuperAdmins.map((sa) => (
                                    <option key={sa.id} value={sa.id}>
                                      {sa.name} ({sa.id}) - Super Admin
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Department Admins / HODs">
                                  {employees.filter(e => e.systemRole === 'HOD').map((mgr) => (
                                    <option key={mgr.id} value={mgr.id}>
                                      {mgr.name} ({mgr.id}) - {mgr.dept} (Admin/HOD)
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Reporting Level
                              </label>
                              <input
                                type="text"
                                readOnly
                                value={
                                  formData.reportingManagerName?.includes('Super Admin')
                                    ? 'Direct Report to Super Admin'
                                    : 'Reports to Admin (HOD) ➔ Super Admin'
                                }
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none cursor-not-allowed"
                              />
                            </div>
                          </div>

                          {/* Hierarchy Breadcrumb Preview */}
                          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/70 text-xs flex items-center flex-wrap gap-2">
                            <span className="font-bold text-gray-600">Reporting Chain:</span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">
                              {formData.firstName || 'Employee'} (TL)
                            </span>
                            <span className="text-gray-400">➔</span>
                            {formData.reportingManagerName?.includes('Super Admin') ? (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">
                                Super Admin: {formData.reportingManagerName}
                              </span>
                            ) : (
                              <>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                                  Admin (HOD): {formData.reportingManagerName || 'Selected HOD'}
                                </span>
                                <span className="text-gray-400">➔</span>
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">
                                  Super Admin
                                </span>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* Case 3: HOD selected */}
                      {formData.systemRole === 'HOD' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm space-y-4"
                        >
                          <div className="flex items-center space-x-2 text-blue-800 font-bold text-sm">
                            <Shield size={16} className="text-blue-600" />
                            <span>Admin (HOD) Hierarchy: Reports directly to Managing Director (Super Admin)</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Reporting Manager (Default Assigned)
                              </label>
                              <div className="flex items-center px-3.5 py-2.5 bg-purple-50/80 border border-purple-200 rounded-xl text-sm font-bold text-purple-900 shadow-inner">
                                <Crown size={15} className="mr-2 text-purple-600 shrink-0" />
                                <span>{formData.reportingManagerName || 'Managing Director (Super Admin)'}</span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Reporting Level
                              </label>
                              <input
                                type="text"
                                readOnly
                                value="Direct Report to MD Sir (Super Admin)"
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none cursor-not-allowed"
                              />
                            </div>
                          </div>

                          {/* Hierarchy Breadcrumb Preview */}
                          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/70 text-xs flex items-center flex-wrap gap-2">
                            <span className="font-bold text-gray-600">Reporting Chain:</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                              {formData.firstName || 'Employee'} (Admin/HOD)
                            </span>
                            <span className="text-gray-400">➔</span>
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold flex items-center">
                              <Crown size={12} className="mr-1 text-purple-600" />
                              MD Sir: {formData.reportingManagerName || 'Managing Director (Super Admin)'}
                            </span>
                          </div>

                          <p className="text-xs text-gray-600 font-medium">
                            As an Admin (HOD), this employee reports directly to Managing Director (Super Admin) and will oversee Team Leaders and Team Members in the <strong className="text-gray-900">{formData.dept}</strong> department, approve departmental leaves, and manage departmental records.
                          </p>
                        </motion.div>
                      )}

                      {/* Case 4: HR selected */}
                      {formData.systemRole === 'HR' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-white rounded-xl border border-rose-200 shadow-sm space-y-4"
                        >
                          <div className="flex items-center space-x-2 text-rose-800 font-bold text-sm">
                            <UserCheck size={16} className="text-rose-600" />
                            <span>HR / HR Admin Hierarchy: Reports directly to Managing Director (Super Admin)</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Reporting Manager (Default Assigned)
                              </label>
                              <div className="flex items-center px-3.5 py-2.5 bg-purple-50/80 border border-purple-200 rounded-xl text-sm font-bold text-purple-900 shadow-inner">
                                <Crown size={15} className="mr-2 text-purple-600 shrink-0" />
                                <span>{formData.reportingManagerName || 'Managing Director (Super Admin)'}</span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Reporting Level
                              </label>
                              <input
                                type="text"
                                readOnly
                                value="Direct Report to MD Sir (Super Admin)"
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none cursor-not-allowed"
                              />
                            </div>
                          </div>

                          {/* Hierarchy Breadcrumb Preview */}
                          <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200/70 text-xs flex items-center flex-wrap gap-2">
                            <span className="font-bold text-gray-600">Reporting Chain:</span>
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold">
                              {formData.firstName || 'Employee'} (HR Admin)
                            </span>
                            <span className="text-gray-400">➔</span>
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold flex items-center">
                              <Crown size={12} className="mr-1 text-purple-600" />
                              MD Sir: {formData.reportingManagerName || 'Managing Director (Super Admin)'}
                            </span>
                          </div>

                          <p className="text-xs text-gray-600 font-medium">
                            As an HR Administrator, this employee reports directly to Managing Director (Super Admin) and can create and manage all employees in the organization, manage policies, leaves, and salary structures.
                          </p>
                        </motion.div>
                      )}

                      {/* Case 5: Super Admin selected */}
                      {formData.systemRole === 'Super Admin' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-white rounded-xl border border-purple-200 shadow-sm"
                        >
                          <div className="flex items-center space-x-2 text-purple-800 font-bold text-sm mb-2">
                            <Crown size={16} className="text-purple-600" />
                            <span>Super Administrator - Complete System Access</span>
                          </div>
                          <p className="text-xs text-gray-600 font-medium">
                            Full privileges across all CRM, HRMS, Quality modules, employee salary generation, policy authorization, and user access control.
                          </p>
                        </motion.div>
                      )}

                    </div>

                    {/* OPTIONAL MONTHLY TARGET CONFIGURATION (Can be assigned by HOD & Super Admin) */}
                    <div className="p-5 bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/40 rounded-2xl border-2 border-amber-200/80 shadow-sm space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center">
                          <Target size={16} className="mr-2 text-be-orange" />
                          Monthly Target (₹)
                        </label>
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 w-max">
                          Optional • Assigned by HOD / Super Admin
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 font-medium">
                        Set the monthly sales or revenue target for this employee in ₹. This field is non-mandatory. Super Admin and HOD can assign or adjust targets anytime.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-1">
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-extrabold text-sm">₹</span>
                          <input
                            type="text"
                            value={formData.monthlyTarget}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              setFormData({ ...formData, monthlyTarget: val, target: val });
                            }}
                            placeholder="e.g. 500000 (5 Lakhs)"
                            className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-be-orange focus:border-be-orange shadow-sm font-mono"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: '₹1 L', val: '100000' },
                            { label: '₹2.5 L', val: '250000' },
                            { label: '₹5 L', val: '500000' },
                            { label: '₹10 L', val: '1000000' },
                            { label: '₹20 L', val: '2000000' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() => setFormData({ ...formData, monthlyTarget: preset.val, target: preset.val })}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                                formData.monthlyTarget === preset.val
                                  ? 'bg-be-orange text-white border-be-orange shadow-sm scale-105'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400 hover:bg-amber-50'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                          {formData.monthlyTarget && (
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, monthlyTarget: '', target: '' })}
                              className="px-2 py-1 text-xs text-red-600 hover:text-red-800 font-bold underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      {formData.monthlyTarget && !isNaN(Number(formData.monthlyTarget)) && Number(formData.monthlyTarget) > 0 && (
                        <div className="text-xs text-amber-900 font-bold bg-amber-100/60 p-2 rounded-lg border border-amber-200/60 flex items-center">
                          <CheckCircle2 size={13} className="text-amber-600 mr-1.5 shrink-0" />
                          <span>Target configured: ₹{Number(formData.monthlyTarget).toLocaleString('en-IN')} / month</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Step 5: Document Details */}
                {currentStep === 5 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">Document Details & Bank Info</h3>
                      <p className="text-xs text-gray-500">Provide bank and statutory details along with supporting employee verification documents.</p>
                    </div>

                    {/* Section 1: Bank & Statutory Information */}
                    <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-200/80 space-y-4">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700 flex items-center">
                        <Briefcase size={14} className="mr-1.5 text-be-orange" />
                        Bank & Statutory Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Bank Account Number</label>
                          <input type="text" value={formData.bankAccount} onChange={e => setFormData({ ...formData, bankAccount: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Bank Name</label>
                          <input type="text" value={formData.bankName} onChange={e => setFormData({ ...formData, bankName: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">IFSC Code</label>
                          <input type="text" value={formData.ifsc} onChange={e => setFormData({ ...formData, ifsc: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white uppercase border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Pan Number</label>
                          <input type="text" value={formData.panNumber} onChange={e => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white uppercase border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Aadhaar Number</label>
                          <input type="text" value={formData.aadhaarNumber} onChange={e => setFormData({ ...formData, aadhaarNumber: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Passport Number</label>
                          <input type="text" value={formData.passportNumber} onChange={e => setFormData({ ...formData, passportNumber: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Driving License Number</label>
                          <input type="text" value={formData.drivingLicense} onChange={e => setFormData({ ...formData, drivingLicense: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Salary Entity</label>
                          <div className="flex items-center gap-6 h-[42px]">
                            <label className="flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={formData.salaryEntity === 'BSPL'}
                                onChange={(e) => setFormData({ ...formData, salaryEntity: e.target.checked ? 'BSPL' : '' })}
                                className="w-5 h-5 text-be-orange rounded focus:ring-be-orange"
                              />
                              <span className="ml-2 text-sm font-semibold text-gray-700">BSPL</span>
                            </label>
                            <label className="flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={formData.salaryEntity === 'BSAPL'}
                                onChange={(e) => setFormData({ ...formData, salaryEntity: e.target.checked ? 'BSAPL' : '' })}
                                className="w-5 h-5 text-be-orange rounded focus:ring-be-orange"
                              />
                              <span className="ml-2 text-sm font-semibold text-gray-700">BSAPL</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">PF Applicable</label>
                          <div className="flex items-center h-[42px]">
                            <input type="checkbox" checked={formData.hasPf} onChange={e => setFormData({ ...formData, hasPf: e.target.checked })} className="w-5 h-5 text-be-orange rounded focus:ring-be-orange" />
                            <span className="ml-2 text-sm font-semibold text-gray-700">Yes, PF is applicable</span>
                          </div>
                        </div>
                        {formData.hasPf && (
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">PF Number</label>
                            <input type="text" value={formData.pfNumber} onChange={e => setFormData({ ...formData, pfNumber: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">ESIC Number</label>
                          <input type="text" value={formData.esicNumber} onChange={e => setFormData({ ...formData, esicNumber: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">UAN Number</label>
                          <input type="text" value={formData.uanNumber} onChange={e => setFormData({ ...formData, uanNumber: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Medical Insurance Number</label>
                          <input type="text" value={formData.medicalInsurance} onChange={e => setFormData({ ...formData, medicalInsurance: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none bg-white border-gray-300 focus:ring-1 focus:ring-be-orange" />
                        </div>

                        {/* Passbook / Cancelled Cheque upload */}
                        <div className="md:col-span-2 pt-2 border-t border-gray-200">
                          <label className="block text-sm font-bold text-gray-700 mb-1">Screenshot of Passbook / Cancelled Cheque</label>
                          <div className="flex items-center gap-4 flex-wrap">
                            <input
                              type="file"
                              id="salaryDoc"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setSalaryDocumentFile(e.target.files[0]);
                                  setSalaryDocumentName(e.target.files[0].name);
                                }
                              }}
                            />
                            <label htmlFor="salaryDoc" className="cursor-pointer inline-flex items-center px-4 py-2 border rounded-xl text-sm font-bold transition-all shadow-sm border-gray-300 bg-white hover:bg-orange-50 hover:border-be-orange text-gray-700">
                              <UploadCloud size={16} className="mr-2 text-be-orange" />
                              {salaryDocumentName ? 'Change File' : 'Choose File'}
                            </label>
                            {salaryDocumentName ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span className="truncate max-w-xs">{salaryDocumentName}</span>
                                <button
                                  type="button"
                                  onClick={() => { setSalaryDocumentFile(null); setSalaryDocumentName(''); }}
                                  className="text-emerald-600 hover:text-red-500 ml-1 transition-colors"
                                  title="Remove file"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 font-medium">No file chosen</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Additional Document Fields */}
                    <div className="bg-white p-5 rounded-2xl border-2 border-orange-100 shadow-sm space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <h4 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                          <FileText size={16} className="text-be-orange" />
                          Additional Supporting Documents
                        </h4>
                      </div>

                      <div className="space-y-3">
                        {OPTIONAL_DOCUMENT_FIELDS.map((docField) => {
                          const attached = additionalDocs[docField.id];
                          const inputId = `doc_input_${docField.id}`;

                          return (
                            <div
                              key={docField.id}
                              className={`p-3.5 rounded-xl border transition-all ${attached
                                ? 'bg-orange-50/40 border-orange-200 ring-1 ring-orange-200'
                                : 'bg-gray-50/50 border-gray-200/80 hover:bg-gray-50 hover:border-gray-300'
                                }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${attached ? 'bg-be-orange text-white' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                    {docField.num}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <label htmlFor={inputId} className="text-xs font-bold text-gray-800 cursor-pointer hover:text-be-orange transition-colors">
                                        {docField.label}
                                      </label>
                                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                        Optional
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      {docField.description}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 sm:self-center">
                                  <input
                                    type="file"
                                    id={inputId}
                                    className="hidden"
                                    accept={docField.accept}
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        handleAdditionalDocChange(docField.id, e.target.files[0]);
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={inputId}
                                    className={`cursor-pointer inline-flex items-center px-3 py-1.5 border rounded-lg text-xs font-bold transition-all shadow-sm ${attached
                                      ? 'border-orange-300 bg-white text-orange-700 hover:bg-orange-50'
                                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                      }`}
                                  >
                                    <UploadCloud size={13} className="mr-1.5 text-be-orange" />
                                    {attached ? 'Change File' : 'Choose File'}
                                  </label>

                                  {attached ? (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 max-w-[200px]">
                                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                      <span className="truncate text-[11px]">{attached.name}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleAdditionalDocChange(docField.id, null)}
                                        className="text-emerald-700 hover:text-red-500 p-0.5 rounded transition-colors shrink-0"
                                        title="Remove file"
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-gray-400 font-medium hidden md:inline">No file chosen</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

              </div>

              {/* Modal Footer Controls */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors bg-white"
                >
                  Cancel
                </button>

                <div className="flex gap-3">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep(prev => prev - 1)}
                      className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors bg-white"
                    >
                      Back
                    </button>
                  )}
                  {currentStep < 5 ? (
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-colors flex items-center shadow-md"
                    >
                      Continue <ChevronRight size={16} className="ml-1" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleSaveEmployee}
                      className="px-7 py-2.5 bg-be-orange text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-md shadow-orange-500/30 hover:shadow-lg flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin mr-2" />
                          <span>Syncing with Zoho CRM...</span>
                        </>
                      ) : (
                        editingEmployee ? 'Save Changes' : 'Create Employee'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QUICK TARGET ASSIGN MODAL (FOR SUPER ADMIN & HOD) */}
      <AnimatePresence>
        {targetModalEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-200"
            >
              <div className="flex items-center justify-between p-6 border-b border-amber-100 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-white">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold border border-amber-200 shadow-sm">
                    <Target size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Assign Monthly Target</h3>
                    <p className="text-xs text-gray-500 font-medium">Configure sales target for {targetModalEmployee.name}</p>
                  </div>
                </div>
                <button
                  onClick={closeTargetModal}
                  className="text-gray-400 hover:text-gray-700 p-2 hover:bg-white rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Employee Quick Info Badge */}
                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 text-be-orange flex items-center justify-center font-bold text-xs border border-orange-200">
                      {(targetModalEmployee.name || 'EMP').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">{targetModalEmployee.name}</div>
                      <div className="text-xs text-gray-500">{targetModalEmployee.id} • {targetModalEmployee.dept} ({targetModalEmployee.role})</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-50 text-amber-800 border-amber-200">
                    {targetModalEmployee.systemRole || 'TM'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Monthly Target Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-extrabold text-base">₹</span>
                    <input
                      type="text"
                      value={targetInputVal}
                      onChange={(e) => setTargetInputVal(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g. 500000"
                      className="w-full pl-9 pr-4 py-3 bg-white border border-gray-300 rounded-2xl text-base font-extrabold text-gray-900 outline-none focus:ring-2 focus:ring-be-orange focus:border-be-orange shadow-sm font-mono"
                      autoFocus
                    />
                  </div>
                  {targetInputVal && !isNaN(Number(targetInputVal)) && Number(targetInputVal) > 0 && (
                    <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center">
                      <CheckCircle2 size={13} className="mr-1" />
                      Target: ₹{Number(targetInputVal).toLocaleString('en-IN')} per month
                    </p>
                  )}
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Quick Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '₹1 Lakh', val: '100000' },
                      { label: '₹2.5 Lakh', val: '250000' },
                      { label: '₹5 Lakh', val: '500000' },
                      { label: '₹10 Lakh', val: '1000000' },
                      { label: '₹20 Lakh', val: '2000000' },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setTargetInputVal(preset.val)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          targetInputVal === preset.val
                            ? 'bg-be-orange text-white border-be-orange shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400 hover:bg-amber-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    {targetInputVal && (
                      <button
                        type="button"
                        onClick={() => setTargetInputVal('')}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        Clear Target
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
                  <strong>Authority Note:</strong> Only Super Admin and Department HODs can assign and modify employee targets. This target will reflect in CRM sales tracking and HRMS dashboards.
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <button
                  type="button"
                  onClick={closeTargetModal}
                  className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingTarget}
                  onClick={handleSaveTarget}
                  className="px-6 py-2.5 bg-gradient-to-r from-be-orange to-amber-600 text-white rounded-xl text-sm font-bold hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/30 flex items-center disabled:opacity-60"
                >
                  {isSavingTarget ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} className="mr-1.5" />
                      <span>Save Target</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
