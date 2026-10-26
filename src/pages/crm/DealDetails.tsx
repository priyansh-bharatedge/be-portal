import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRight, Edit, Download, MoreHorizontal, FileText, 
  CheckCircle2, Clock, MapPin, Building2, Phone, Mail, 
  IndianRupee, CreditCard, Receipt, Cloud, ShieldCheck, 
  Briefcase, Calendar, Layers, Tag, ExternalLink, User, RefreshCw, Loader2,
  AlertTriangle, Bell, Eye, Upload, Paperclip, X, FileSpreadsheet, Image as ImageIcon,
  Check, Maximize2, Minimize2, FileCode, HardDrive, CheckCircle, Users, Percent, Calculator, Info,
  UserCheck, Scale, FileCheck2, Send, Save, Lock, Trash2
} from 'lucide-react';
import { getDocument, saveDocument, getAllDocuments } from '../../lib/db';
import { 
  fetchZohoDealById, 
  enrichDealFromZohoRecord,
  fetchZohoAttachments, 
  getZohoAttachmentDownloadUrl, 
  downloadZohoAttachment, 
  uploadZohoAttachmentToDeal,
  uploadZohoDealPhoto,
  uploadZohoDealImageField,
  getZohoFieldAttachmentUrl,
  saveOrUpdateZohoDeal,
  verifyZohoMilestonePayment,
  updateZohoMilestoneBank,
  verifyZohoMilestoneLegal,
  transitionZohoDealBlueprint,
  moveDealToAccounts,
  moveDealToLegal,
  moveDealToOperationsAllocator,
  moveDealToOperationsExecutors,
  ZOHO_DEAL_BLUEPRINT_TRANSITIONS,
  fetchSalesEmployees,
  fetchZohoEmployees
} from '../../services/zohoService';
import { useAuth } from '../../context/AuthContext';
import { InternalOperationsAllocationTable } from '../../components/crm/InternalOperationsAllocationTable';
import { generateServiceAllocationsForDeal, getStoredInternalOperations } from '../../services/internalOperationsService';
import { getDealSplitBreakdown, isDealPartnerBdm, isDealPaymentVerified, isUserPrimaryBdm, getDealMilestones, isValidServiceName, type DealMilestoneItem } from '../../utils/dealSplitUtils';
import { ALL_SERVICES } from '../../utils/servicesList';

// Helper to scan IndexedDB for all documents matching this deal
const scanLocalDocuments = async (dealObj: any, currentParamId?: string): Promise<any[]> => {
  try {
    const allDbDocs = await getAllDocuments();
    const dealDlId = (dealObj?.id?.startsWith('DL-') ? dealObj.id : '') ||
      (currentParamId?.startsWith('DL-') ? currentParamId : '') ||
      (dealObj?.rawZohoDeal?.Deal_Name ? (String(dealObj.rawZohoDeal.Deal_Name).match(/\b(DL-\d+)\b/i)?.[1]?.toUpperCase() || '') : '') ||
      '';
    const dealZohoId = dealObj?.zohoId ? String(dealObj.zohoId) : (currentParamId && /^\d+$/.test(currentParamId) ? currentParamId : '');

    const matchedLocal: any[] = [];
    const seenKeys = new Set<string>();

    // 1. Add existing documentsData from deal object
    if (Array.isArray(dealObj?.documentsData)) {
      for (const d of dealObj.documentsData) {
        if (d && d.name) {
          const isPmtScreenshot = (d.id && (d.id.includes('payment_screenshot') || d.id.includes('_payment_'))) ||
            (d.name && d.name.toLowerCase().includes('payment_screenshot'));
          if (isPmtScreenshot) continue;
          matchedLocal.push(d);
          seenKeys.add((d.id || d.name).toLowerCase());
        }
      }
    }

    // 2. Scan IndexedDB for keys starting with dealDlId, dealZohoId, or dealObj.id
    for (const item of allDbDocs) {
      const key = item.id;
      const file = item.file;
      const fileName = file?.name || key.split('_').slice(1).join('_') || key;

      const isPaymentScreenshotKey = key.includes('payment_screenshot') || key.includes('_payment_');
      if (isPaymentScreenshotKey) continue;

      const isMatch = 
        (dealDlId && (key.startsWith(`${dealDlId}_`) || key.toLowerCase().includes(dealDlId.toLowerCase()))) ||
        (dealZohoId && (key.startsWith(`${dealZohoId}_`) || key.includes(dealZohoId))) ||
        (dealObj?.id && key.startsWith(`${dealObj.id}_`));

      if (isMatch && !seenKeys.has(key.toLowerCase()) && !seenKeys.has(fileName.toLowerCase())) {
        matchedLocal.push({
          id: key,
          name: fileName,
          size: file?.size || 0,
          type: file?.type || 'application/octet-stream',
        });
        seenKeys.add(key.toLowerCase());
        seenKeys.add(fileName.toLowerCase());
      }
    }

    return matchedLocal;
  } catch (e) {
    console.warn('Error scanning local documents from IndexedDB:', e);
    return dealObj?.documentsData || [];
  }
};

// Helper to format date strings for HTML5 date inputs (YYYY-MM-DD)
const normalizeDateForInput = (val: any): string => {
  if (!val) return '';
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.split('T')[0];
  const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return trimmed;
};

// Helper to safely format Zoho CRM values (including lookup objects like { id, name }) to strings
const formatZohoValue = (val: any, fallback: string = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') {
    if (val.name && typeof val.name === 'string') return val.name;
    if (val.display_value && typeof val.display_value === 'string') return val.display_value;
    if (val.id && typeof val.id === 'string') return String(val.id);
    return fallback;
  }
  return String(val);
};

// Legal Details Subform Option Lists
export const INTERNAL_TEAM_TYPES = [
  'Team Funding',
  'Team Compliance',
  'Team Certification',
  'Team Incorporation',
  'Team Digital Marketing',
];

export const INTERNAL_LEGAL_STATUSES = [
  'RECEIVED',
  'PENDING',
  'HOLD BY BDM',
  'HOLD BY CLIENT',
  'HOLD',
  'TRANSFER',
  'TRANSFER TO QUALITY (REFUND)',
  'TRANSFER TO QUALITY (UNRESPONSIVE)',
  'MAIL ACKNOWLEDGEMENT',
  'CANCEL',
  'REFUNDED',
  'INELIGIBLE',
];

export const LEGAL_DOC_TYPES = [
  'Agreement',
  'Undertaking',
  'MOU-Payment by client',
  'MOU-Payment by CA/CS/Vendors',
  'NDA',
  'Letter of intent',
];

export const AGREEMENT_TERMS = [
  '2 Months',
  '3 Months',
  '6 Months',
  '9 Months',
  '1 Year',
  'Till Certificate',
  'Till Registration',
];

// 8 Milestone Payment Slots configuration matching Zoho CRM Deals module API names
export const PAYMENT_SLOTS = [
  {
    index: 1,
    label: '1st Payment (R1)',
    tabName: 'R1',
    amountField: 'R1_Received_amount23',
    dateField: 'Closing_Date',
    screenshotField: 'R1_Received_Screenshot',
    bdm1Field: 'R1_Received_by_BDM1',
    bdm2Field: 'R1_Received_by_BDM2',
  },
  {
    index: 2,
    label: '2nd Payment (R2)',
    tabName: 'R2',
    amountField: 'R2_Received_amount12',
    dateField: 'DPR_status_change_date',
    screenshotField: 'R2_Received_Screenshot',
    bdm1Field: 'R2_Received_by_BDM1',
    bdm2Field: 'R2_Received_by_BDM2',
  },
  {
    index: 3,
    label: '3rd Payment (R3)',
    tabName: 'R3',
    amountField: 'R3_Received_amount',
    dateField: 'Date_of_status_change',
    screenshotField: 'R3_Received_Screenshot',
    bdm1Field: 'R3_Received_by_BDM1',
    bdm2Field: 'R3_Received_by_BDM2',
  },
  {
    index: 4,
    label: '4th Payment (R4)',
    tabName: 'R4',
    amountField: 'R4_Received_amount',
    dateField: 'Date_of_status_change_f',
    screenshotField: 'R4_Received_Screenshot',
    bdm1Field: 'R4_Received_by_BDM1',
    bdm2Field: 'R4_Received_by_BDM2',
  },
  {
    index: 5,
    label: '5th Payment (R5)',
    tabName: 'R5',
    amountField: 'R5_Received_amount',
    dateField: 'Document_collection_Pitch_deck_creation_DPR_date',
    screenshotField: 'R5_Received_Screenshot',
    bdm1Field: 'R5_Received_by_BDM1',
    bdm2Field: 'R5_Received_by_BDM2',
  },
  {
    index: 6,
    label: '6th Payment (R6)',
    tabName: 'R6',
    amountField: 'R6_Received_amount',
    dateField: 'Document_sent_date',
    screenshotField: 'R6_Received_Screenshot',
    bdm1Field: 'R6_Received_BDM1',
    bdm2Field: 'R6_Received_BDM2',
  },
  {
    index: 7,
    label: '7th Payment (R7)',
    tabName: 'R7',
    amountField: 'R7_Received_amount',
    dateField: 'Finance_status_change_date',
    screenshotField: 'R7_Received_Screenshot',
    bdm1Field: 'R7_Received_by_BDM1',
    bdm2Field: 'R7_Received_by_BDM2',
  },
  {
    index: 8,
    label: '8th Payment (R8)',
    tabName: 'R8',
    amountField: 'R8_Received_amount',
    dateField: 'Date_of_financedate_change',
    screenshotField: 'R8_Received_Screenshot',
    bdm1Field: 'R8_Received_by_BDM1',
    bdm2Field: 'R8_Received_by_BDM2',
  },
] as const;

export interface PaymentSlotItem {
  amount: string;
  date: string;
  bdm1Id: string;
  bdm1Name: string;
  bdm2Id: string;
  bdm2Name: string;
  screenshotFile: File | null;
  screenshotPreview: string | null;
  existingScreenshotName: string;
  bankType: 'BSPL' | 'BSAPL' | string;
  isVerified: boolean;
}

export const DealDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isHOD, isAccounts, isLegal, isSales, availableUsers } = useAuth();
  const isSalesDeptUser = !isSuperAdmin && Boolean(
    isSales || 
    (currentUser?.department && (
      currentUser.department.toLowerCase().includes('sale') || 
      currentUser.department.toLowerCase().includes('bdm') || 
      currentUser.department.toLowerCase().includes('business dev')
    ))
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [workflowToast, setWorkflowToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Record / Update Payment Modal State (8 Milestones)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(null);
  const [salesEmployees, setSalesEmployees] = useState<any[]>([]);
  const [activePaymentTab, setActivePaymentTab] = useState<number>(1);
  const [paymentSlotsData, setPaymentSlotsData] = useState<Record<number, PaymentSlotItem>>({
    1: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    2: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    3: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    4: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    5: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    6: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    7: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
    8: { amount: '', date: '', bdm1Id: '', bdm1Name: '', bdm2Id: '', bdm2Name: '', screenshotFile: null, screenshotPreview: null, existingScreenshotName: '', bankType: 'BSPL', isVerified: false },
  });
  const paymentScreenshotInputRef = useRef<HTMLInputElement>(null);

  // Accounts & Legal Remaining Payment Verification state
  const [detailsBankSelections, setDetailsBankSelections] = useState<Record<number, 'BSPL' | 'BSAPL' | string>>({});
  const [verifyingDetailsMilestone, setVerifyingDetailsMilestone] = useState<number | null>(null);
  const [verifyingDetailsLegal, setVerifyingDetailsLegal] = useState<number | null>(null);

  // Accounts Department Specific Fields: Bank Details & Account Remarks
  const [bankDetails, setBankDetails] = useState<string>('');
  const [accountsRemark, setAccountsRemark] = useState<string>('');
  const [isSavingAccountsDetails, setIsSavingAccountsDetails] = useState<boolean>(false);

  // Zoho Attachments State
  const [zohoAttachments, setZohoAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState<boolean>(false);

  // Payment Screenshots (Deal_payment_screenshot) State
  const [dealPaymentScreenshots, setDealPaymentScreenshots] = useState<{
    id: string;
    name: string;
    url: string;
    size?: string;
  }[]>([]);

  useEffect(() => {
    let isMounted = true;
    const extractScreenshots = async () => {
      if (!deal) {
        setDealPaymentScreenshots([]);
        return;
      }
      const raw = deal.rawZohoDeal || {};
      const rawFieldScreenshots = raw.Deal_payment_screenshot ?? deal.Deal_payment_screenshot ?? deal.paymentScreenshots ?? raw.paymentScreenshots;
      const zohoFieldScreenshots = Array.isArray(rawFieldScreenshots)
        ? rawFieldScreenshots
        : (rawFieldScreenshots && typeof rawFieldScreenshots === 'object' ? [rawFieldScreenshots] : []);

      const list: { id: string; name: string; url: string; size?: string }[] = [];
      const seenNames = new Set<string>();
      const targetZohoId = String(deal.zohoId || (id && /^\d+$/.test(id) ? id : '') || '');

      // 1. From Zoho CRM Deal_payment_screenshot
      for (const item of zohoFieldScreenshots) {
        if (!item) continue;
        const attId = item.id || item.fields_attachment_id || '';
        const fileId = item.File_Id__s || '';
        const fileName = item.File_Name__s || 'payment_screenshot.png';
        const url = getZohoFieldAttachmentUrl(targetZohoId, attId, fileId, 'Deals');
        const sizeNum = Number(item.Size__s) || 0;
        const sizeText = sizeNum > 0 ? (sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(2)} MB`) : '';

        list.push({
          id: String(attId || fileId || Math.random()),
          name: fileName,
          url,
          size: sizeText,
        });
        seenNames.add(fileName.toLowerCase());
      }

      // 2. Scan milestone screenshots (R1 to R8)
      for (const slot of PAYMENT_SLOTS) {
        const rawSs = deal[slot.screenshotField] ?? raw[slot.screenshotField];
        if (!rawSs) continue;
        let ssItem: any = null;
        if (Array.isArray(rawSs) && rawSs.length > 0) {
          ssItem = rawSs[0];
        } else if (typeof rawSs === 'object') {
          ssItem = rawSs;
        }

        let attId = '';
        let fileId = '';
        let fileName = '';
        if (ssItem && typeof ssItem === 'object') {
          attId = ssItem.id || ssItem.fields_attachment_id || '';
          fileId = ssItem.File_Id__s || ssItem.file_id || '';
          fileName = ssItem.File_Name__s || ssItem.name || ssItem.file_name || `${slot.label}_screenshot.png`;
        } else if (typeof rawSs === 'string' && rawSs.trim()) {
          fileName = rawSs.trim();
        }

        if (fileName && !seenNames.has(fileName.toLowerCase())) {
          let url = '';
          if (fileName.startsWith('http') || fileName.startsWith('blob:') || fileName.startsWith('/api/')) {
            url = fileName;
          } else if (fileId || (targetZohoId && attId)) {
            url = getZohoFieldAttachmentUrl(targetZohoId, attId, fileId, 'Deals');
          }
          if (url) {
            list.push({
              id: String(attId || fileId || `slot_${slot.index}`),
              name: fileName,
              url,
              size: `${slot.tabName} Payment`,
            });
            seenNames.add(fileName.toLowerCase());
          }
        }
      }

      // 3. Scan attachments from Zoho CRM (zohoAttachments) for image receipts
      if (Array.isArray(zohoAttachments) && zohoAttachments.length > 0) {
        for (const att of zohoAttachments) {
          const fn = att.File_Name || att.name || att.file_name || '';
          const isImg = att.isImage || /\.(png|jpe?g|webp|gif)$/i.test(fn);
          if (isImg && fn && !seenNames.has(fn.toLowerCase())) {
            const attId = att.id || att.attachmentId || '';
            const url = att.downloadUrl || getZohoAttachmentDownloadUrl('Deals', targetZohoId, attId, true);
            list.push({
              id: String(attId || Math.random()),
              name: fn,
              url,
              size: att.sizeText || '',
            });
            seenNames.add(fn.toLowerCase());
          }
        }
      }

      // 4. Scan IndexedDB for locally saved payment screenshots for this deal
      try {
        const allDbDocs = await getAllDocuments();
        const dealDlId = (deal?.id?.startsWith('DL-') ? deal.id : '') ||
          (id?.startsWith('DL-') ? id : '') ||
          (raw.Deal_Name ? (String(raw.Deal_Name).match(/\b(DL-\d+)\b/i)?.[1]?.toUpperCase() || '') : '') ||
          '';

        for (const doc of allDbDocs) {
          const key = doc.id;
          const isMatch =
            (dealDlId && key.includes(dealDlId) && key.includes('payment_screenshot')) ||
            (targetZohoId && key.includes(targetZohoId) && key.includes('payment_screenshot')) ||
            (deal?.id && key.includes(deal.id) && key.includes('payment_screenshot'));

          if (isMatch && doc.file) {
            const fileName = doc.file.name || 'payment_screenshot.png';
            if (!seenNames.has(fileName.toLowerCase())) {
              const blobUrl = URL.createObjectURL(doc.file);
              const sizeNum = doc.file.size || 0;
              const sizeText = sizeNum > 0 ? (sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(2)} MB`) : '';
              list.push({
                id: key,
                name: fileName,
                url: blobUrl,
                size: sizeText,
              });
              seenNames.add(fileName.toLowerCase());
            }
          }
        }
      } catch (e) {
        console.warn('Error reading local payment screenshots:', e);
      }

      // 5. Fallback: single payment screenshot from deal if not already captured
      if (list.length === 0 && deal.paymentScreenshotUrl) {
        list.push({
          id: 'deal_screenshot_url',
          name: deal.paymentScreenshotName || 'Payment Screenshot',
          url: deal.paymentScreenshotUrl,
        });
      }

      if (isMounted) {
        setDealPaymentScreenshots(list);
      }
    };

    extractScreenshots();
    return () => { isMounted = false; };
  }, [deal, id, zohoAttachments]);

  // Load Sales Employees Directory for BDM 1 & BDM 2 Selectors
  useEffect(() => {
    let isMounted = true;
    const loadEmps = async () => {
      const mergedMap = new Map<string, any>();
      const addEmp = (emp: any) => {
        if (!emp) return;
        const name = (emp.name || emp.Name || '').trim();
        const id = String(emp.id || emp.zohoId || emp.empId || emp.Employment_ID || name).trim();
        if (!name || name.length < 2) return;
        const key = name.toLowerCase();
        if (!mergedMap.has(key)) {
          mergedMap.set(key, {
            id,
            zohoId: String(emp.zohoId || emp.id || ''),
            name,
            email: emp.email || emp.Email || '',
            dept: emp.department || emp.Department || 'Sales',
            role: emp.role || emp.Designation_Job_Title || 'BDM',
          });
        }
      };

      // 1. Local HRMS employees
      try {
        const local = localStorage.getItem('be_employees');
        if (local) JSON.parse(local).forEach(addEmp);
      } catch (_) {}

      // 2. Auth context users
      if (Array.isArray(availableUsers)) availableUsers.forEach(addEmp);

      // 3. Cached sales employees
      try {
        const cached = localStorage.getItem('be_sales_employees');
        if (cached) JSON.parse(cached).forEach(addEmp);
      } catch (_) {}

      if (isMounted) {
        const list = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length > 0) setSalesEmployees(list);
      }

      // 4. Live fetch from Zoho API
      try {
        const res = await fetchSalesEmployees();
        if (res.success && Array.isArray(res.data)) res.data.forEach(addEmp);
      } catch (_) {}

      try {
        const empRes = await fetchZohoEmployees();
        if (empRes.success && Array.isArray(empRes.data)) {
          empRes.data.forEach((z: any) => {
            const fullName = [z.Name, z.Middle_Name, z.Last_Name].filter(Boolean).join(' ') || z.Name || '';
            addEmp({ ...z, name: fullName });
          });
        }
      } catch (_) {}

      if (isMounted) {
        const list = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        setSalesEmployees(list);
        try { localStorage.setItem('be_sales_employees', JSON.stringify(list)); } catch (_) {}
      }
    };

    loadEmps();
    return () => { isMounted = false; };
  }, []);

  // Legal Handover Details & Reminders State (For Legal Department users & Stage)
  const [legalHandoverData, setLegalHandoverData] = useState({
    legalDocsSenderName: '',
    legalDocsSenderDate: '',
    legalDocsReceiverName: '',
    legalDocsReceivedDate: '',
    reminder1Date: '',
    reminder2Date: '',
    reminder3Date: '',
    reminder4Date: '',
    reminder5Date: '',
  });
  const [isSavingLegalHandover, setIsSavingLegalHandover] = useState(false);

  // Legal Details Subform Items State
  const [legalSubformItems, setLegalSubformItems] = useState<any[]>([]);
  const [isSavingLegalSubform, setIsSavingLegalSubform] = useState(false);

  // Sync legal handover data & subform items when deal is loaded or updated
  useEffect(() => {
    if (deal) {
      const raw = deal.rawZohoDeal || {};
      const fd = deal.formData || {};
      setLegalHandoverData({
        legalDocsSenderName: deal.legalDocsSenderName || deal.Legal_documents_sender_name || raw.Legal_documents_sender_name || raw.Employee_name_sent1 || raw.Employee_name_sent || fd.legalDocsSenderName || '',
        legalDocsSenderDate: normalizeDateForInput(deal.legalDocsSenderDate || deal.Date || deal.Legal_documents_sender_date || raw.Date || raw.Legal_documents_sender_date || deal.Legal_date || raw.Legal_date || fd.Date || fd.legalDocsSenderDate || ''),
        legalDocsReceiverName: deal.legalDocsReceiverName || deal.Legal_documents_receiver_name || raw.Legal_documents_receiver_name || raw.Employee_name_received1 || raw.Employee_name_received || fd.legalDocsReceiverName || '',
        legalDocsReceivedDate: normalizeDateForInput(deal.legalDocsReceivedDate || deal.Legal_documents_received_date || raw.Legal_documents_received_date || fd.legalDocsReceivedDate || ''),
        reminder1Date: normalizeDateForInput(deal.reminder1Date || deal.Reminder_1_date || raw.Reminder_1_date || raw.Reminder_1 || fd.reminder1Date || ''),
        reminder2Date: normalizeDateForInput(deal.reminder2Date || deal.Reminder_2_date || raw.Reminder_2_date || raw.Reminder_2 || fd.reminder2Date || ''),
        reminder3Date: normalizeDateForInput(deal.reminder3Date || deal.Reminder_3_date || raw.Reminder_3_date || raw.Reminder_3 || fd.reminder3Date || ''),
        reminder4Date: normalizeDateForInput(deal.reminder4Date || deal.Reminder_4_date || raw.Reminder_4_date || raw.Reminder_4 || fd.reminder4Date || ''),
        reminder5Date: normalizeDateForInput(deal.reminder5Date || deal.Reminder_5_date || raw.Reminder_5_date || raw.Reminder_5 || fd.reminder5Date || ''),
      });

      // Synchronize Accounts Details (Bank Details & Account Remarks)
      const rawBank = deal.Bank_details ?? deal.bankDetails ?? raw.Bank_details ?? fd.Bank_details ?? fd.bankDetails ?? '';
      const formattedBank = formatZohoValue(rawBank);
      setBankDetails(formattedBank === 'None' || formattedBank === '-None-' ? '' : formattedBank);
      const rawRemark = deal.Accounts_remark ?? deal.accountsRemark ?? raw.Accounts_remark ?? fd.Accounts_remark ?? fd.accountsRemark ?? '';
      setAccountsRemark(formatZohoValue(rawRemark));

      // Synchronize Legal Subform Items
      const rawLegal = Array.isArray(raw.Legal) && raw.Legal.length > 0 ? raw.Legal : null;
      const dealLegal = Array.isArray(deal.legalData) && deal.legalData.length > 0 ? deal.legalData : null;
      const rawServicesList = Array.isArray(raw.Subform_1) && raw.Subform_1.length > 0
        ? raw.Subform_1
        : (Array.isArray(deal.servicesData) && deal.servicesData.length > 0 ? deal.servicesData : []);

      const seenSvc = new Set<string>();
      const servicesList = rawServicesList.filter((s: any) => {
        const key = (s.Schemas || s.Schema || s.name || s.Service_Name || deal.service || 'Website Development').trim().toLowerCase();
        if (seenSvc.has(key)) return false;
        seenSvc.add(key);
        return true;
      });

      if (dealLegal && dealLegal.length > 0) {
        setLegalSubformItems(dealLegal.map((lg: any, i: number) => {
          const schemaName = formatZohoValue(lg.schema || lg.Legal_Schemas || lg.Schemas || servicesList[i]?.Schemas || servicesList[i]?.name || 'Service');
          let realId = (lg.id && /^\d{15,}$/.test(String(lg.id))) ? String(lg.id) : '';
          if (!realId && rawLegal) {
            const matchedRaw = rawLegal.find((rl: any) => 
              formatZohoValue(rl.Legal_Schemas || rl.Schemas || '').trim().toLowerCase() === schemaName.trim().toLowerCase()
            ) || rawLegal[i];
            if (matchedRaw?.id && /^\d{15,}$/.test(String(matchedRaw.id))) {
              realId = String(matchedRaw.id);
            }
          }
          return {
            id: realId || String(lg.id || `temp_${i + 1}`),
            schema: schemaName,
            internalTeamType: formatZohoValue(lg.internalTeamType || lg.Internal_team_type || ''),
            legalStatus: formatZohoValue(lg.legalStatus || lg.Internal_legal_status || ''),
            remark: formatZohoValue(lg.remark || lg.Remark || ''),
            docTypes: formatZohoValue(lg.docTypes || lg.Types_of_legal_documents || ''),
            terms1: formatZohoValue(lg.terms1 || lg.Agreement_Terms_I || lg.Agreement_Terms || lg.agreementTerms || ''),
            terms2: formatZohoValue(lg.terms2 || lg.Agreement_Terms_II || ''),
            tenure: formatZohoValue(lg.tenure || lg.Tenure_of_Service || ''),
          };
        }));
      } else if (rawLegal && rawLegal.length > 0) {
        setLegalSubformItems(rawLegal.map((lg: any, i: number) => ({
          id: String(lg.id || `temp_${i + 1}`),
          schema: formatZohoValue(lg.Legal_Schemas || lg.Schemas || lg.schema || servicesList[i]?.Schemas || servicesList[i]?.name || 'Service'),
          internalTeamType: formatZohoValue(lg.Internal_team_type || lg.internalTeamType || ''),
          legalStatus: formatZohoValue(lg.Internal_legal_status || lg.legalStatus || ''),
          remark: formatZohoValue(lg.Remark || lg.remark || ''),
          docTypes: formatZohoValue(lg.Types_of_legal_documents || lg.docTypes || ''),
          terms1: formatZohoValue(lg.Agreement_Terms_I || lg.Agreement_Terms || lg.terms1 || lg.agreementTerms || ''),
          terms2: formatZohoValue(lg.Agreement_Terms_II || lg.terms2 || ''),
          tenure: formatZohoValue(lg.Tenure_of_Service || lg.tenure || ''),
        })));
      } else if (servicesList.length > 0) {
        setLegalSubformItems(servicesList.map((svc: any, i: number) => ({
          id: (svc.id && /^\d{15,}$/.test(String(svc.id))) ? String(svc.id) : `temp_${i + 1}`,
          schema: formatZohoValue(svc.Schemas || svc.name || svc.Service_Name || 'Service'),
          internalTeamType: '',
          legalStatus: '',
          remark: '',
          docTypes: '',
          terms1: '',
          terms2: '',
          tenure: '',
        })));
      } else {
        setLegalSubformItems([{
          id: 'temp_1',
          schema: formatZohoValue(deal.service || 'General Services'),
          internalTeamType: '',
          legalStatus: '',
          remark: '',
          docTypes: '',
          terms1: '',
          terms2: '',
          tenure: '',
        }]);
      }
    }
  }, [deal]);

  // Zoho & Local Attachments State
  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    name: string;
    sizeText?: string;
    isPdf: boolean;
    isImage: boolean;
    downloadUrl?: string;
    isZoho?: boolean;
  } | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async (zohoRecordId: string) => {
    if (!zohoRecordId) return;
    setLoadingAttachments(true);
    try {
      const res = await fetchZohoAttachments('Deals', zohoRecordId);
      if (res.success && Array.isArray(res.data)) {
        setZohoAttachments(res.data);
      } else {
        setZohoAttachments([]);
      }
    } catch (e) {
      console.warn('Failed to load Zoho attachments:', e);
      setZohoAttachments([]);
    } finally {
      setLoadingAttachments(false);
    }
  }, []);

  const loadLiveDeal = useCallback(async (dealIdToFetch: string, baseDeal?: any) => {
    if (!dealIdToFetch) return;
    setIsRefreshing(true);
    try {
      // Find current existing deal from arguments, state, or localStorage
      let existingDeal = baseDeal || deal;
      if (!existingDeal) {
        try {
          const saved = localStorage.getItem('be_deals');
          const allDeals = saved ? JSON.parse(saved) : [];
          existingDeal = allDeals.find((d: any) => 
            String(d.id) === String(dealIdToFetch) || 
            String(d.zohoId) === String(dealIdToFetch) ||
            String(d.id) === String(id) || 
            String(d.zohoId) === String(id)
          );
        } catch (e) {}
      }

      const res = await fetchZohoDealById(dealIdToFetch);
      if (res.success && res.data) {
        const rawZoho = Array.isArray(res.data) ? res.data[0] : (res.data || {});
        
        // Resolve field mappings from Zoho CRM API
        let resolvedClient = 
          rawZoho.Client_Name ||
          (rawZoho.Clients && (typeof rawZoho.Clients === 'object' ? rawZoho.Clients.name : rawZoho.Clients)) ||
          (rawZoho.Contact_Name && (typeof rawZoho.Contact_Name === 'object' ? rawZoho.Contact_Name.name : rawZoho.Contact_Name)) ||
          rawZoho.Name1 ||
          rawZoho.Name ||
          '';

        if (!resolvedClient || /^\(\d+\)$/.test(resolvedClient.trim())) {
          if (rawZoho.Deal_Name && rawZoho.Deal_Name.includes(' - ')) {
            resolvedClient = rawZoho.Deal_Name.split(' - ')[0].trim();
          } else if (rawZoho.Deal_Name) {
            resolvedClient = rawZoho.Deal_Name.trim();
          } else {
            resolvedClient = 'Client';
          }
        }

        const updatedObj = enrichDealFromZohoRecord(rawZoho, existingDeal);
        if (id && id.startsWith('DL-')) {
          updatedObj.id = id;
        }

        // Scan and match local IndexedDB documents for this deal
        const localDocs = await scanLocalDocuments(updatedObj, id);
        if (localDocs.length > 0) {
          updatedObj.documentsData = localDocs;
        }

        setDeal(updatedObj);

        // Dispatch window event so Deals list & Dashboard update in real-time
        try {
          window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedObj }));
        } catch (e) {}

        // Load Zoho CRM Attachments for this deal
        if (updatedObj.zohoId) {
          loadAttachments(String(updatedObj.zohoId));
        }

        // Update in localStorage
        try {
          const saved = localStorage.getItem('be_deals');
          const allDeals = saved ? JSON.parse(saved) : [];
          const idx = allDeals.findIndex((d: any) => d.id === updatedObj.id || d.zohoId === updatedObj.zohoId || (d.id && String(d.id).includes(String(id))));
          if (idx >= 0) {
            allDeals[idx] = { ...allDeals[idx], ...updatedObj };
          } else {
            allDeals.unshift(updatedObj);
          }
          localStorage.setItem('be_deals', JSON.stringify(allDeals.slice(0, 2000)));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to fetch live deal details from Zoho CRM:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [id, deal, loadAttachments]);

  // Listen for real-time deal updates (e.g. when Team Type is updated in Internal Operations)
  useEffect(() => {
    const handleGlobalDealUpdate = (e: any) => {
      const updated = e.detail;
      if (!updated) return;
      const currentDealId = String(deal?.id || id || '').toLowerCase();
      const currentZohoId = String(deal?.zohoId || '').toLowerCase();
      const updatedId = String(updated.id || '').toLowerCase();
      const updatedZohoId = String(updated.zohoId || '').toLowerCase();

      const isCurrentDeal = (currentDealId && (currentDealId === updatedId || currentDealId === updatedZohoId)) ||
                            (currentZohoId && (currentZohoId === updatedId || currentZohoId === updatedZohoId));

      if (isCurrentDeal) {
        setDeal((prev: any) => prev ? { ...prev, ...updated } : updated);
        const subform = updated.legalData || updated.Legal || updated.rawZohoDeal?.Legal;
        if (Array.isArray(subform)) {
          setLegalSubformItems(subform);
        }
      }
    };

    window.addEventListener('be_deals_updated', handleGlobalDealUpdate);
    return () => window.removeEventListener('be_deals_updated', handleGlobalDealUpdate);
  }, [id, deal?.id, deal?.zohoId]);

  const handleSendToAccounts = async () => {
    if (!deal) return;
    setIsActionInProgress(true);
    try {
      const updatedDeal = {
        ...deal,
        stage: 'Accounts',
        Stage: 'Accounts',
        status: 'Accounts',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Accounts'
        }
      };
      setDeal(updatedDeal);

      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      // Execute Zoho CRM Blueprint Transition: Sales to Account ("1078476000000489153")
      const zohoRes = await moveDealToAccounts(deal.zohoId || deal.id || id || '');
      if (zohoRes.success) {
        setWorkflowToast({ type: 'success', message: 'Deal stage successfully transitioned to Accounts via Zoho Blueprint.' });
      } else {
        setWorkflowToast({ type: 'error', message: zohoRes.message || 'Updated locally, but failed to execute Blueprint transition in Zoho CRM' });
      }
    } catch (e: any) {
      setWorkflowToast({ type: 'error', message: e?.message || 'Failed to update deal stage' });
    } finally {
      setIsActionInProgress(false);
    }
  };

  const saveAccountsDetailsToZoho = async (bankVal: string, remarkVal: string) => {
    if (!deal) return;
    setIsSavingAccountsDetails(true);
    try {
      const targetZohoId = String(deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : '') || deal.id || '').trim();
      const finalBank = (bankVal && bankVal !== 'None' && bankVal !== '-None-') ? bankVal : '';
      const finalRemark = remarkVal ?? '';

      const updatedDeal = {
        ...deal,
        Bank_details: finalBank,
        bankDetails: finalBank,
        Accounts_remark: finalRemark,
        accountsRemark: finalRemark,
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Bank_details: finalBank,
          Accounts_remark: finalRemark,
        },
        formData: {
          ...(deal.formData || {}),
          Bank_details: finalBank,
          bankDetails: finalBank,
          Accounts_remark: finalRemark,
          accountsRemark: finalRemark,
        }
      };
      setDeal(updatedDeal);

      // Save to localStorage immediately so a page reload never loses the selection
      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const isMatch = (d: any) =>
            (deal.id && String(d.id) === String(deal.id)) ||
            (deal.zohoId && String(d.zohoId) === String(deal.zohoId)) ||
            (targetZohoId && (String(d.id) === String(targetZohoId) || String(d.zohoId) === String(targetZohoId)));
          const idx = allDeals.findIndex(isMatch);
          if (idx >= 0) {
            allDeals[idx] = { ...allDeals[idx], ...updatedDeal };
          } else {
            allDeals.unshift(updatedDeal);
          }
          localStorage.setItem('be_deals', JSON.stringify(allDeals));
        }
      } catch (e) {}

      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      // Clean, minimal partial payload directly to /api/zoho/update-deal
      const cleanPayload = {
        id: targetZohoId,
        zohoId: targetZohoId,
        Bank_details: finalBank ? finalBank : null,
        Accounts_remark: finalRemark,
        isPartial: true,
      };

      const response = await fetch('/api/zoho/update-deal', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanPayload),
      });

      const zohoRes = await response.json().catch(() => ({ success: response.ok }));

      if (response.ok && zohoRes.success) {
        setWorkflowToast({ type: 'success', message: finalBank ? `Bank Details (${finalBank}) & Remarks updated in Zoho CRM deal record successfully!` : 'Account Details updated in Zoho CRM deal record successfully!' });
      } else {
        setWorkflowToast({ type: 'error', message: zohoRes.message || 'Updated locally, but failed to update Zoho CRM' });
      }
    } catch (e: any) {
      setWorkflowToast({ type: 'error', message: e?.message || 'Failed to update account details in Zoho CRM' });
    } finally {
      setIsSavingAccountsDetails(false);
    }
  };

  const handleSaveAccountsDetails = async () => {
    await saveAccountsDetailsToZoho(bankDetails, accountsRemark);
  };

  const handleVerifyPayment = async () => {
    if (!deal) return;
    setIsActionInProgress(true);
    try {
      const finalBank = (bankDetails && bankDetails !== 'None' && bankDetails !== '-None-') ? bankDetails : ((deal.Bank_details && deal.Bank_details !== 'None') ? deal.Bank_details : (deal.bankDetails && deal.bankDetails !== 'None' ? deal.bankDetails : ''));
      const finalRemark = accountsRemark !== undefined ? accountsRemark : (deal.Accounts_remark || '');

      const updatedDeal = {
        ...deal,
        Payment_verifications: true,
        paymentVerified: true,
        stage: 'Legal',
        Stage: 'Legal',
        status: 'Legal',
        Bank_details: finalBank,
        bankDetails: finalBank,
        Accounts_remark: finalRemark,
        accountsRemark: finalRemark,
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Payment_verifications: true,
          Stage: 'Legal',
          stage: 'Legal',
          status: 'Legal',
          Bank_details: finalBank,
          Accounts_remark: finalRemark,
        },
        formData: {
          ...(deal.formData || {}),
          Bank_details: finalBank,
          bankDetails: finalBank,
          Accounts_remark: finalRemark,
          accountsRemark: finalRemark,
        }
      };
      setDeal(updatedDeal);

      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      // 1. Direct targeted update of payment verification, bank details & accounts remark to Zoho CRM
      const targetZohoId = String(deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : '') || deal.id || '').trim();
      await fetch('/api/zoho/update-deal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetZohoId,
          zohoId: targetZohoId,
          Bank_details: finalBank,
          Accounts_remark: finalRemark,
          Payment_verifications: true,
          isPartial: true
        })
      });

      // 2. Automatically execute Zoho CRM Blueprint Transition: Account to Legal ("1078476000000492001")
      const blueprintRes = await moveDealToLegal(targetZohoId);

      if (blueprintRes.success) {
        setWorkflowToast({ type: 'success', message: 'Payment successfully verified, account details saved, and deal automatically moved to Legal Department.' });
      } else {
        setWorkflowToast({ type: 'success', message: 'Payment verified and deal moved to Legal stage locally.' });
      }
    } catch (e: any) {
      setWorkflowToast({ type: 'error', message: e?.message || 'Failed to verify payment and transition to Legal' });
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleSendToLegal = async () => {
    if (!deal) return;
    setIsActionInProgress(true);
    try {
      const finalBank = (bankDetails && bankDetails !== 'None' && bankDetails !== '-None-') ? bankDetails : ((deal.Bank_details && deal.Bank_details !== 'None') ? deal.Bank_details : (deal.bankDetails && deal.bankDetails !== 'None' ? deal.bankDetails : ''));
      const finalRemark = accountsRemark !== undefined ? accountsRemark : (deal.Accounts_remark || '');

      const updatedDeal = {
        ...deal,
        stage: 'Legal',
        Stage: 'Legal',
        status: 'Legal',
        Bank_details: finalBank,
        bankDetails: finalBank,
        Accounts_remark: finalRemark,
        accountsRemark: finalRemark,
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Legal',
          Bank_details: finalBank,
          Accounts_remark: finalRemark,
        },
        formData: {
          ...(deal.formData || {}),
          Bank_details: finalBank,
          bankDetails: finalBank,
          Accounts_remark: finalRemark,
          accountsRemark: finalRemark,
        }
      };
      setDeal(updatedDeal);

      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      // 1. Direct targeted update of bank details & accounts remark to Zoho CRM Deal record
      const targetZohoId = String(deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : '') || deal.id || '').trim();
      await fetch('/api/zoho/update-deal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetZohoId,
          zohoId: targetZohoId,
          Bank_details: finalBank,
          Accounts_remark: finalRemark,
          isPartial: true
        })
      });

      // 2. Execute Zoho CRM Blueprint Transition: Account to Legal ("1078476000000492001")
      const zohoRes = await moveDealToLegal(targetZohoId);
      if (zohoRes.success) {
        setWorkflowToast({ type: 'success', message: 'Deal stage successfully transitioned to Legal department via Zoho Blueprint.' });
      } else {
        setWorkflowToast({ type: 'error', message: zohoRes.message || 'Updated locally, but failed to execute Blueprint transition in Zoho CRM' });
      }
    } catch (e: any) {
      setWorkflowToast({ type: 'error', message: e?.message || 'Failed to update deal stage' });
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleSaveLegalSubform = async (silent = false) => {
    if (!deal) return;
    setIsSavingLegalSubform(true);
    try {
      const existingRawLegal = deal.rawZohoDeal?.Legal || (deal as any).Legal || [];
      const formattedLegal = legalSubformItems.map((lg: any, idx: number) => {
        let validId = lg.id && /^\d{15,}$/.test(String(lg.id)) ? String(lg.id) : '';
        if (!validId && Array.isArray(existingRawLegal) && existingRawLegal.length > 0) {
          const matched = existingRawLegal.find((rl: any) => 
            rl.id && /^\d{15,}$/.test(String(rl.id)) &&
            (rl.Legal_Schemas || rl.Schemas || '').trim().toLowerCase() === (lg.schema || lg.Legal_Schemas || '').trim().toLowerCase()
          ) || existingRawLegal[idx];
          if (matched?.id && /^\d{15,}$/.test(String(matched.id))) {
            validId = String(matched.id);
          }
        }
        return {
          id: validId || String(lg.id || `temp_${idx + 1}`),
          schema: lg.schema || lg.Legal_Schemas || lg.Schemas || 'Service',
          Legal_Schemas: lg.schema || lg.Legal_Schemas || lg.Schemas || 'Service',
          internalTeamType: lg.internalTeamType || lg.Internal_team_type || '',
          Internal_team_type: lg.internalTeamType || lg.Internal_team_type || '',
          legalStatus: lg.legalStatus || lg.Internal_legal_status || '',
          Internal_legal_status: lg.legalStatus || lg.Internal_legal_status || '',
          remark: lg.remark || lg.Remark || '',
          Remark: lg.remark || lg.Remark || '',
          docTypes: lg.docTypes || lg.Types_of_legal_documents || '',
          Types_of_legal_documents: lg.docTypes || lg.Types_of_legal_documents || '',
          terms1: lg.terms1 || lg.Agreement_Terms_I || lg.Agreement_Terms || lg.agreementTerms || '',
          Agreement_Terms_I: lg.terms1 || lg.Agreement_Terms_I || lg.Agreement_Terms || lg.agreementTerms || '',
          terms2: lg.terms2 || lg.Agreement_Terms_II || '',
          Agreement_Terms_II: lg.terms2 || lg.Agreement_Terms_II || '',
          tenure: lg.tenure || lg.Tenure_of_Service || '',
          Tenure_of_Service: lg.tenure || lg.Tenure_of_Service || '',
        };
      });

      const updatedDeal = {
        ...deal,
        legalData: formattedLegal,
        Legal: formattedLegal.map((lg: any) => ({
          ...(lg.id && /^\d{15,}$/.test(String(lg.id)) ? { id: lg.id } : {}),
          Legal_Schemas: lg.schema || lg.Legal_Schemas || 'Service',
          Internal_team_type: lg.internalTeamType || lg.Internal_team_type || '',
          Internal_legal_status: lg.legalStatus || lg.Internal_legal_status || '',
          Remark: lg.remark || lg.Remark || '',
          Types_of_legal_documents: lg.docTypes || lg.Types_of_legal_documents || '',
          Agreement_Terms_I: lg.terms1 || lg.Agreement_Terms_I || '',
          Agreement_Terms_II: lg.terms2 || lg.Agreement_Terms_II || '',
          Tenure_of_Service: lg.tenure || lg.Tenure_of_Service || '',
        })),
        formData: {
          ...(deal.formData || {}),
          legalData: formattedLegal,
          Legal: formattedLegal,
        },
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Legal: formattedLegal.map((lg: any) => ({
            ...(lg.id && /^\d{15,}$/.test(String(lg.id)) ? { id: lg.id } : {}),
            Legal_Schemas: lg.schema || lg.Legal_Schemas || 'Service',
            Internal_team_type: lg.internalTeamType || lg.Internal_team_type || '',
            Internal_legal_status: lg.legalStatus || lg.Internal_legal_status || '',
            Remark: lg.remark || lg.Remark || '',
            Types_of_legal_documents: lg.docTypes || lg.Types_of_legal_documents || '',
            Agreement_Terms_I: lg.terms1 || lg.Agreement_Terms_I || '',
            Agreement_Terms_II: lg.terms2 || lg.Agreement_Terms_II || '',
            Tenure_of_Service: lg.tenure || lg.Tenure_of_Service || '',
          }))
        }
      };

      setDeal(updatedDeal);
      setLegalSubformItems(formattedLegal);

      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      // Dispatch real-time global deal update event
      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      const zohoRes = await saveOrUpdateZohoDeal(updatedDeal);
      if (!silent) {
        if (zohoRes.success) {
          setWorkflowToast({ type: 'success', message: 'Legal subform details submitted & synchronized with Zoho CRM successfully.' });
        } else {
          setWorkflowToast({ type: 'success', message: 'Legal subform details saved locally and queued for database synchronization.' });
        }
      }
      return updatedDeal;
    } catch (e: any) {
      if (!silent) {
        setWorkflowToast({ type: 'error', message: e?.message || 'Failed to submit legal subform details' });
      }
    } finally {
      setIsSavingLegalSubform(false);
    }
  };

  const handleRemoveLegalSubformRow = (idxToRemove: number) => {
    const itemToRemove = legalSubformItems[idxToRemove];
    const newItems = legalSubformItems.filter((_, idx) => idx !== idxToRemove);
    setLegalSubformItems(newItems);
    setWorkflowToast({
      type: 'success',
      message: `Removed "${itemToRemove?.schema || 'Service'}" from Legal Details. Click Submit Legal Details to save changes.`
    });
  };

  const handleSaveLegalHandover = async (silent = false) => {
    if (!deal) return;
    setIsSavingLegalHandover(true);
    try {
      const updatedDeal = {
        ...deal,
        ...legalHandoverData,
        legalData: legalSubformItems,
        Legal_documents_sender_name: legalHandoverData.legalDocsSenderName,
        Date: legalHandoverData.legalDocsSenderDate,
        Legal_documents_sender_date: legalHandoverData.legalDocsSenderDate,
        Legal_date: legalHandoverData.legalDocsSenderDate,
        Legal_documents_receiver_name: legalHandoverData.legalDocsReceiverName,
        Legal_documents_received_date: legalHandoverData.legalDocsReceivedDate,
        Reminder_1_date: legalHandoverData.reminder1Date,
        Reminder_1: legalHandoverData.reminder1Date,
        Reminder_2_date: legalHandoverData.reminder2Date,
        Reminder_2: legalHandoverData.reminder2Date,
        Reminder_3_date: legalHandoverData.reminder3Date,
        Reminder_3: legalHandoverData.reminder3Date,
        Reminder_4_date: legalHandoverData.reminder4Date,
        Reminder_4: legalHandoverData.reminder4Date,
        Reminder_5_date: legalHandoverData.reminder5Date,
        Reminder_5: legalHandoverData.reminder5Date,
        formData: {
          ...(deal.formData || {}),
          ...legalHandoverData,
          legalData: legalSubformItems,
          Legal_documents_sender_name: legalHandoverData.legalDocsSenderName,
          Date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_sender_date: legalHandoverData.legalDocsSenderDate,
          Legal_date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_receiver_name: legalHandoverData.legalDocsReceiverName,
          Legal_documents_received_date: legalHandoverData.legalDocsReceivedDate,
          Reminder_1_date: legalHandoverData.reminder1Date,
          Reminder_1: legalHandoverData.reminder1Date,
          Reminder_2_date: legalHandoverData.reminder2Date,
          Reminder_2: legalHandoverData.reminder2Date,
          Reminder_3_date: legalHandoverData.reminder3Date,
          Reminder_3: legalHandoverData.reminder3Date,
          Reminder_4_date: legalHandoverData.reminder4Date,
          Reminder_4: legalHandoverData.reminder4Date,
          Reminder_5_date: legalHandoverData.reminder5Date,
          Reminder_5: legalHandoverData.reminder5Date,
        },
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Legal_documents_sender_name: legalHandoverData.legalDocsSenderName,
          Date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_sender_date: legalHandoverData.legalDocsSenderDate,
          Legal_date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_receiver_name: legalHandoverData.legalDocsReceiverName,
          Legal_documents_received_date: legalHandoverData.legalDocsReceivedDate,
          Reminder_1_date: legalHandoverData.reminder1Date,
          Reminder_1: legalHandoverData.reminder1Date,
          Reminder_2_date: legalHandoverData.reminder2Date,
          Reminder_2: legalHandoverData.reminder2Date,
          Reminder_3_date: legalHandoverData.reminder3Date,
          Reminder_3: legalHandoverData.reminder3Date,
          Reminder_4_date: legalHandoverData.reminder4Date,
          Reminder_4: legalHandoverData.reminder4Date,
          Reminder_5_date: legalHandoverData.reminder5Date,
          Reminder_5: legalHandoverData.reminder5Date,
          Legal: legalSubformItems.map((lg: any) => ({
            ...(lg.id && /^\d{15,}$/.test(String(lg.id)) ? { id: lg.id } : {}),
            Legal_Schemas: lg.schema,
            Internal_team_type: lg.internalTeamType,
            Internal_legal_status: lg.legalStatus,
            Remark: lg.remark,
            Types_of_legal_documents: lg.docTypes,
            Agreement_Terms_I: lg.terms1,
            Agreement_Terms_II: lg.terms2,
            Tenure_of_Service: lg.tenure,
          }))
        }
      };

      setDeal(updatedDeal);
      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      // Dispatch real-time global deal update event
      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      const zohoRes = await saveOrUpdateZohoDeal(updatedDeal);
      if (!silent) {
        if (zohoRes.success) {
          setWorkflowToast({ type: 'success', message: 'Legal document handover details and follow-up reminders saved & updated in Zoho CRM successfully.' });
        } else {
          setWorkflowToast({ type: 'success', message: 'Saved locally, syncing with Zoho CRM database.' });
        }
      }
      return updatedDeal;
    } catch (e: any) {
      if (!silent) {
        setWorkflowToast({ type: 'error', message: e?.message || 'Failed to save legal details' });
      }
    } finally {
      setIsSavingLegalHandover(false);
    }
  };

  const handleSendToOperationsAllocator = async () => {
    if (!deal) return;

    setIsActionInProgress(true);
    try {
      const updatedDeal = {
        ...deal,
        ...legalHandoverData,
        legalData: legalSubformItems,
        Legal_documents_sender_name: legalHandoverData.legalDocsSenderName,
        Date: legalHandoverData.legalDocsSenderDate,
        Legal_documents_sender_date: legalHandoverData.legalDocsSenderDate,
        Legal_date: legalHandoverData.legalDocsSenderDate,
        Legal_documents_receiver_name: legalHandoverData.legalDocsReceiverName,
        Legal_documents_received_date: legalHandoverData.legalDocsReceivedDate,
        Reminder_1_date: legalHandoverData.reminder1Date,
        Reminder_1: legalHandoverData.reminder1Date,
        Reminder_2_date: legalHandoverData.reminder2Date,
        Reminder_2: legalHandoverData.reminder2Date,
        Reminder_3_date: legalHandoverData.reminder3Date,
        Reminder_3: legalHandoverData.reminder3Date,
        Reminder_4_date: legalHandoverData.reminder4Date,
        Reminder_4: legalHandoverData.reminder4Date,
        Reminder_5_date: legalHandoverData.reminder5Date,
        Reminder_5: legalHandoverData.reminder5Date,
        formData: {
          ...(deal.formData || {}),
          ...legalHandoverData,
          legalData: legalSubformItems,
          Legal_documents_sender_name: legalHandoverData.legalDocsSenderName,
          Date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_sender_date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_receiver_name: legalHandoverData.legalDocsReceiverName,
          Legal_documents_received_date: legalHandoverData.legalDocsReceivedDate,
          Reminder_1_date: legalHandoverData.reminder1Date,
          Reminder_1: legalHandoverData.reminder1Date,
          Reminder_2_date: legalHandoverData.reminder2Date,
          Reminder_2: legalHandoverData.reminder2Date,
          Reminder_3_date: legalHandoverData.reminder3Date,
          Reminder_3: legalHandoverData.reminder3Date,
          Reminder_4_date: legalHandoverData.reminder4Date,
          Reminder_4: legalHandoverData.reminder4Date,
          Reminder_5_date: legalHandoverData.reminder5Date,
          Reminder_5: legalHandoverData.reminder5Date,
        },
        stage: 'Operations Allocator',
        Stage: 'Operations Allocator',
        status: 'Operations Allocator',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Legal_documents_sender_name: legalHandoverData.legalDocsSenderName,
          Date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_sender_date: legalHandoverData.legalDocsSenderDate,
          Legal_date: legalHandoverData.legalDocsSenderDate,
          Legal_documents_receiver_name: legalHandoverData.legalDocsReceiverName,
          Legal_documents_received_date: legalHandoverData.legalDocsReceivedDate,
          Reminder_1_date: legalHandoverData.reminder1Date,
          Reminder_1: legalHandoverData.reminder1Date,
          Reminder_2_date: legalHandoverData.reminder2Date,
          Reminder_2: legalHandoverData.reminder2Date,
          Reminder_3_date: legalHandoverData.reminder3Date,
          Reminder_3: legalHandoverData.reminder3Date,
          Reminder_4_date: legalHandoverData.reminder4Date,
          Reminder_4: legalHandoverData.reminder4Date,
          Reminder_5_date: legalHandoverData.reminder5Date,
          Reminder_5: legalHandoverData.reminder5Date,
          Legal: legalSubformItems.map((lg: any) => ({
            ...(lg.id && /^\d{15,}$/.test(String(lg.id)) ? { id: lg.id } : {}),
            Legal_Schemas: lg.schema,
            Internal_team_type: lg.internalTeamType,
            Internal_legal_status: lg.legalStatus,
            Remark: lg.remark,
            Types_of_legal_documents: lg.docTypes,
            Agreement_Terms_I: lg.terms1,
            Agreement_Terms_II: lg.terms2,
            Tenure_of_Service: lg.tenure,
          })),
          Stage: 'Operations Allocator'
        }
      };
      setDeal(updatedDeal);

      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      // Dispatch real-time global deal update event
      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      // 1. Sync updated deal data & legal fields to Zoho CRM (preserving current stage and skipping auto-blueprint)
      let currentZohoId = deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : '');
      try {
        const dealZohoRes = await saveOrUpdateZohoDeal({
          ...updatedDeal,
          skipBlueprint: true,
          stage: deal.stage || 'Legal',
          Stage: deal.stage || 'Legal',
        });
        if (dealZohoRes?.success && dealZohoRes?.zohoId) {
          currentZohoId = dealZohoRes.zohoId;
          updatedDeal.zohoId = currentZohoId;
        }
      } catch (saveErr) {
        console.warn('[DealDetails] saveOrUpdateZohoDeal warning:', saveErr);
      }

      // 2. Automatically generate sub-child service allocation records in Internal Operations module
      let dealAllocations: any[] = [];
      try {
        const genRes = generateServiceAllocationsForDeal(updatedDeal);
        const targetDealId = String(updatedDeal.id || id || '').toLowerCase();
        const targetZohoId = String(currentZohoId || updatedDeal.zohoId || '').toLowerCase();
        dealAllocations = genRes.all.filter(r => {
          const dId = String(r.Deal_ID || (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) || '').toLowerCase();
          const zId = String((r as any).zohoDealId || '').toLowerCase();
          return (targetDealId && (dId === targetDealId || zId === targetDealId)) ||
                 (targetZohoId && (dId === targetZohoId || zId === targetZohoId));
        });
      } catch (genErr) {
        console.warn('[DealDetails] Service allocation creation warning:', genErr);
      }

      // 3. Execute Zoho CRM Blueprint Transition: Legal to Operations Allocator ("1078476000000492099")
      const zohoRes = await moveDealToOperationsAllocator(
        currentZohoId || deal.zohoId || deal.id || id || '',
        'Sent to Operations Allocator from Legal Handover',
        { allocations: dealAllocations }
      );
      if (zohoRes.success) {
        setWorkflowToast({ type: 'success', message: 'Legal handover verified and deal successfully forwarded to Operations Allocator Department.' });
      } else {
        setWorkflowToast({ type: 'success', message: 'Legal handover saved and deal moved to Operations Allocator locally.' });
      }
    } catch (e: any) {
      setWorkflowToast({ type: 'error', message: e?.message || 'Failed to update deal stage' });
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleSendToOperationsExecutors = async () => {
    if (!deal) return;
    setIsActionInProgress(true);
    try {
      const updatedDeal = {
        ...deal,
        stage: 'Operations Executors',
        Stage: 'Operations Executors',
        status: 'Operations Executors',
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          Stage: 'Operations Executors'
        }
      };
      setDeal(updatedDeal);

      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) => (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d);
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      // 1. Gather child service allocations for this deal from storage or generate them from Legal details
      const allOps = getStoredInternalOperations();
      const targetDealId = String(deal.id || id || '').toLowerCase();
      const targetZohoId = String(deal.zohoId || '').toLowerCase();
      let dealOps = allOps.filter(r => {
        const dId = String(r.Deal_ID || (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) || '').toLowerCase();
        const zId = String((r as any).zohoDealId || '').toLowerCase();
        return (targetDealId && (dId === targetDealId || zId === targetDealId)) ||
               (targetZohoId && (dId === targetZohoId || zId === targetZohoId));
      });

      if (dealOps.length === 0) {
        const genRes = generateServiceAllocationsForDeal(deal);
        dealOps = genRes.all.filter(r => {
          const dId = String(r.Deal_ID || (r.Parent_Record_Deal?.id || r.Parent_Record_Deal) || '').toLowerCase();
          const zId = String((r as any).zohoDealId || '').toLowerCase();
          return (targetDealId && (dId === targetDealId || zId === targetDealId)) ||
                 (targetZohoId && (dId === targetZohoId || zId === targetZohoId));
        });
      }

      // Ensure each allocation has the deal's zohoId attached
      if (deal.zohoId && /^\d{15,}$/.test(String(deal.zohoId))) {
        dealOps = dealOps.map(op => ({
          ...op,
          zohoDealId: String(deal.zohoId),
          Parent_Record_Deal: { id: String(deal.zohoId), name: deal.name || deal.Deal_Name }
        }));
      }

      // 2. Execute Zoho CRM Blueprint Transition: Operations Allocator to Operations Executors ("1078476000001938757")
      const zohoRes = await moveDealToOperationsExecutors(
        deal.zohoId || deal.id || id || '',
        'Sent to Operations Executors via Portal',
        {
          allocations: dealOps,
          dealName: deal.name || deal.Deal_Name,
          Deal_Name: deal.name || deal.Deal_Name,
          dealZohoId: deal.zohoId || deal.id
        }
      );

      // 3. Proactively sync the child service records to Zoho CRM Operation_Internal_CRM module
      if (dealOps.length > 0) {
        try {
          await fetch('/api/zoho/internal-operations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              allocations: dealOps,
              dealZohoId: deal.zohoId || (/^\d{15,}$/.test(String(deal.id)) ? String(deal.id) : undefined),
              dealName: deal.name || deal.Deal_Name
            })
          });
        } catch (syncErr) {
          console.warn('[DealDetails] Internal operations sync warning:', syncErr);
        }
      }

      if (zohoRes.success) {
        setWorkflowToast({
          type: 'success',
          message: `Deal stage transitioned to Operations Executors and ${dealOps.length} service allocation(s) synchronized to Zoho CRM.`
        });
      } else {
        setWorkflowToast({
          type: 'error',
          message: zohoRes.message || 'Updated locally, but failed to execute Blueprint transition in Zoho CRM'
        });
      }
    } catch (e: any) {
      setWorkflowToast({ type: 'error', message: e?.message || 'Failed to update deal stage' });
    } finally {
      setIsActionInProgress(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initDeal = async () => {
      setLoading(true);
      let foundDeal: any = null;

      // 1. Check localStorage first
      try {
        const saved = localStorage.getItem('be_deals');
        const allDeals = saved ? JSON.parse(saved) : [];
        foundDeal = allDeals.find((d: any) => 
          String(d.id) === String(id) || 
          String(d.zohoId) === String(id) ||
          (d.id && id && String(d.id).toLowerCase() === String(id).toLowerCase())
        );
      } catch (e) {}

      if (foundDeal) {
        const localDocs = await scanLocalDocuments(foundDeal, id);
        if (localDocs.length > 0) {
          foundDeal.documentsData = localDocs;
        }
        if (isMounted) {
          setDeal(foundDeal);
          setLoading(false);
        }
      }

      // 3. Fetch latest live record & attachments from Zoho CRM
      const targetZohoId = foundDeal?.zohoId || (id && /^\d+$/.test(id) ? id : null);
      if (targetZohoId) {
        loadAttachments(targetZohoId);
        await loadLiveDeal(targetZohoId, foundDeal);
      } else if (id) {
        await loadLiveDeal(id, foundDeal);
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    initDeal();
    return () => { isMounted = false; };
  }, [id, loadAttachments]);

  if (loading || (!deal && isRefreshing)) {
    return (
      <div className="p-16 text-center text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-sm max-w-lg mx-auto my-12">
        <Loader2 className="w-10 h-10 text-be-orange animate-spin mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-1">Loading Deal Details</h2>
        <p className="text-xs text-gray-500">Retrieving deal #{id} from storage and cloud database...</p>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-sm max-w-lg mx-auto my-12">
        <div className="w-16 h-16 bg-orange-50 text-be-orange rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
          !
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Deal Not Found</h2>
        <p className="text-sm text-gray-500 mb-6">The deal record "{id}" does not exist in local portal cache or could not be loaded from cloud database.</p>
        <div className="flex justify-center gap-3">
          <button 
            onClick={() => loadLiveDeal(id || '')} 
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold shadow-xs hover:bg-gray-50 transition-all flex items-center text-sm"
          >
            <RefreshCw size={15} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Try Refreshing
          </button>
          <button 
            onClick={() => navigate('/crm/deals')} 
            className="px-5 py-2.5 bg-gradient-to-r from-be-orange to-rose-500 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all text-sm"
          >
            Back to Deals
          </button>
        </div>
      </div>
    );
  }

  const raw = deal.rawZohoDeal || {};
  const fd = deal.formData || {};

  const rawStage = (deal.stage || raw.Stage || deal.status || 'Sales').toLowerCase().trim();
  const isAccountsStage = rawStage.includes('account');
  const isLegalStage = rawStage.includes('legal');
  const isAllocatorStage = rawStage.includes('allocat') && !rawStage.includes('execut');
  const isExecutorsStage = rawStage.includes('execut');
  const shouldShowLegalSection = isLegal || isLegalStage || isSuperAdmin;

  // Extract all client and company fields with robust Zoho CRM API names matching
  const clientName = formatZohoValue(
    raw.Client_Name ||
    raw.Clients ||
    raw.Contact_Name ||
    raw.Name1 ||
    raw.Name ||
    fd.clientName ||
    (deal.client && deal.client !== 'Client' ? deal.client : '') ||
    (raw.Deal_Name ? raw.Deal_Name.split(' - ')[0] : '') ||
    deal.client || 'Client'
  );

  const companyName = formatZohoValue(
    raw.Company_name ||
    raw.Company_name_bp ||
    raw.Company_name_cs ||
    raw.Company_name_st ||
    raw.Company ||
    raw.Account_Name ||
    raw.Company_Name ||
    fd.companyName ||
    (deal.company && deal.company !== 'N/A' ? deal.company : '') ||
    (clientName !== 'Client' ? clientName : 'N/A')
  );

  const employeeName = formatZohoValue(
    (raw.Employee && typeof raw.Employee === 'object' ? raw.Employee.name : (typeof raw.Employee === 'string' && !/^\d+$/.test(raw.Employee) ? raw.Employee : '')) ||
    deal.employeeName ||
    raw.employeeName ||
    raw.salesEmployee ||
    deal.salesEmployee ||
    fd.employeeName ||
    ''
  );

  const mobilePhone = formatZohoValue(
    raw.Client_contact_detail ||
    raw.Client_contact_detail_cs ||
    raw.Client_contact_detail_bp ||
    raw.Client_contact_detail_fnf ||
    raw.client_contact_detail_st ||
    raw.Client_s_alternate_contact_detail ||
    raw.Client_s_alternate_contact_detail_bp ||
    raw.Mobile ||
    raw.Phone ||
    fd.mobile ||
    'N/A'
  );

  const emailAddress = formatZohoValue(
    raw.Client_Email_address ||
    raw.Client_Email_address_cs ||
    raw.Client_Email_address_fnf ||
    raw.Client_Email_address_bp ||
    raw.client_email_address_st ||
    raw.Email ||
    fd.email ||
    'N/A'
  );

  const gstin = formatZohoValue(
    raw.Gst_number ||
    raw.GST_Number ||
    raw.GSTIN ||
    raw.GST_No ||
    fd.gstNumber ||
    'N/A'
  );

  const pan = formatZohoValue(
    raw.Pan_number ||
    raw.PAN_Number ||
    raw.PAN_Card ||
    raw.PAN_No ||
    raw.PAN ||
    fd.panCard ||
    fd.companyPan ||
    'N/A'
  );

  const aadhaar = formatZohoValue(
    raw.Aadhaar_Card ||
    raw.Aadhaar_number ||
    raw.Aadhaar_Number ||
    raw.Aadhar_Card ||
    raw.Aadhaar ||
    fd.aadhaarCard ||
    'N/A'
  );

  const fullAddress = formatZohoValue(
    raw.Billing_address ||
    raw.Company_address ||
    fd.billingAddress ||
    (raw.City || raw.State ? `${formatZohoValue(raw.City) || ''}, ${formatZohoValue(raw.State) || ''}`.replace(/^, |, $/g, '') : '') ||
    (fd.city || fd.state ? `${formatZohoValue(fd.city) || ''}, ${formatZohoValue(fd.state) || ''}`.replace(/^, |, $/g, '') : '') ||
    'Address not specified'
  );

  const businessType = formatZohoValue(
    raw.Company_Type ||
    raw.Choose_Wisely ||
    raw.Compliance_type ||
    fd.businessType ||
    'Business'
  );

  // Helper for numbers in render
  const parseNum = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const findFirstPos = (...vals: any[]): number => {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const num = parseNum(v);
      if (num > 0) return num;
    }
    return 0;
  };

  // 1. Extract Services first so we can aggregate subform amounts
  let rawServices = deal.servicesData || [];
  let services: any[] = [];
  let servicesSumTotal = 0;
  let servicesSumBase = 0;
  let servicesSumReceived = 0;
  let servicesSumPending = 0;

  if (Array.isArray(raw.Subform_1) && raw.Subform_1.length > 0) {
    const seenSubforms = new Set<string>();
    const uniqueSubforms = raw.Subform_1.filter((sf: any) => {
      const rawKey = formatZohoValue(sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || sf.Item_Name || sf.Product_Name || sf.Service_Scheme || sf.Service_scheme || sf.Services || sf.Name || sf.name || sf.Legal_Schemas || '');
      const nameKey = rawKey.trim().toLowerCase();
      if (!nameKey) return true;
      if (seenSubforms.has(nameKey)) return false;
      seenSubforms.add(nameKey);
      return true;
    });

    services = uniqueSubforms.map((sf: any, i: number) => {
      const agreementAmount = parseNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount || 0);
      const withoutGst = parseNum(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? Number((agreementAmount / 1.18).toFixed(2)) : 0));
      const totalAmt = agreementAmount || (withoutGst > 0 ? Number((withoutGst * 1.18).toFixed(2)) : 0);
      const stageStr = formatZohoValue(sf.Payment_stages || sf.Payment_type || '').toLowerCase();
      const isSfFullPaid = stageStr.includes('full amount paid') || stageStr.includes('fully paid');
      const recAmt = isSfFullPaid && totalAmt > 0 ? totalAmt : parseNum(sf.Received_amount || sf.Received || 0);
      const pendAmt = isSfFullPaid ? 0 : parseNum(sf.Pending_amount || sf.Pending || (totalAmt > recAmt ? totalAmt - recAmt : 0));

      servicesSumTotal += totalAmt;
      servicesSumBase += withoutGst;
      servicesSumReceived += recAmt;
      servicesSumPending += pendAmt;

      return {
        id: String(sf.id || i + 1),
        name: formatZohoValue(sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || sf.Item_Name || sf.Product_Name || sf.Service_Scheme || sf.Service_scheme || sf.Services || sf.Name || sf.name || sf.Legal_Schemas || 'Service'),
        totalAmount: String(totalAmt || ''),
        baseAmount: String(withoutGst || 0),
        receivedAmount: sf.Received_amount || sf.Received || (recAmt > 0 ? String(recAmt) : ''),
        pendingAmount: sf.Pending_amount || sf.Pending || (pendAmt > 0 ? String(pendAmt) : ''),
        paymentStages: formatZohoValue(sf.Payment_stages || ''),
        paymentType: formatZohoValue(sf.Payment_type || ''),
        paymentDate: formatZohoValue(sf.Payment_received_date || ''),
        qualityProvided: formatZohoValue(sf.Quality_provided || ''),
        successFees: sf.Success_fees || sf.successFees || '',
        amountAfterDisbursement: sf.amount_if_you_have_kindly_put_0 !== undefined && sf.amount_if_you_have_kindly_put_0 !== null
          ? String(sf.amount_if_you_have_kindly_put_0)
          : (sf.Amount_After_disbursement !== undefined && sf.Amount_After_disbursement !== null
            ? String(sf.Amount_After_disbursement)
            : (sf.amountAfterDisbursement || '')),
      };
    });
  } else if (rawServices.length > 0 && rawServices.some((s: any) => isValidServiceName(s.name || s.Schemas || s.Service_Name, clientName, companyName, deal.id))) {
    const seenSvc = new Set<string>();
    const uniqueServices = rawServices.filter((s: any) => {
      const sName = s.name || s.Schemas || s.Service_Name || '';
      if (!isValidServiceName(sName, clientName, companyName, deal.id)) return false;
      const nameKey = sName.trim().toLowerCase();
      if (seenSvc.has(nameKey)) return false;
      seenSvc.add(nameKey);
      return true;
    });

    services = uniqueServices;
    services.forEach((s: any) => {
      const t = parseNum(s.totalAmount);
      const b = parseNum(s.baseAmount || (t > 0 ? t / 1.18 : 0));
      const r = parseNum(s.receivedAmount);
      const p = parseNum(s.pendingAmount || (t > r ? t - r : 0));
      servicesSumTotal += t;
      servicesSumBase += b;
      servicesSumReceived += r;
      servicesSumPending += p;
    });
  }

  // 2. Extract Financials with fallback to subform sums
  const totalAmountNum = findFirstPos(
    raw.Total_deal_amount_inclusive_of_gst,
    raw.Amount,
    raw.Deal_Amount,
    raw.Grand_Total,
    raw.Grand_total,
    raw.GrandTotal,
    raw.Total_amount,
    raw.Total_Amount,
    raw.total_amount,
    raw.Agreement_amount,
    raw.Agreement_Amount,
    raw.Amount_Without_GST ? parseNum(raw.Amount_Without_GST) * 1.18 : 0,
    raw.Deal_Amount_Without_GST ? parseNum(raw.Deal_Amount_Without_GST) * 1.18 : 0,
    raw.Subtotal ? parseNum(raw.Subtotal) * 1.18 : 0,
    raw.Amount_After_disbursement,
    servicesSumTotal,
    raw.Total_Received_Amount,
    raw.Deal_Received_Amount,
    raw.Received_amount,
    raw.Received,
    raw.amount_if_you_have_kindly_put_0,
    deal.totals?.grandTotal,
    deal.amount ? parseNum(deal.amount) : 0
  );

  const baseAmountNum = findFirstPos(
    raw.Amount_Without_GST,
    raw.Deal_Amount_Without_GST,
    servicesSumBase,
    deal.totals?.baseAmount,
    totalAmountNum > 0 ? Number((totalAmountNum / 1.18).toFixed(2)) : 0
  );

  const gstAmountNum = findFirstPos(
    raw.GST_Amount,
    raw.Deal_GST_Amount,
    deal.totals?.totalGst,
    totalAmountNum > baseAmountNum ? Number((totalAmountNum - baseAmountNum).toFixed(2)) : Number((baseAmountNum * 0.18).toFixed(2))
  );

  const receivedAmountNum = findFirstPos(
    raw.Total_Received_Amount,
    raw.Deal_Received_Amount,
    raw.Received_amount,
    raw.Received_Amount,
    raw.Received,
    raw.Amount_After_disbursement,
    servicesSumReceived,
    deal.totals?.receivedAmount,
    deal.received ? parseNum(deal.received) : 0
  );

  const pendingAmountNum = (totalAmountNum > 0 && receivedAmountNum >= totalAmountNum)
    ? 0
    : (totalAmountNum > 0 && receivedAmountNum > 0)
    ? Math.max(0, Number((totalAmountNum - receivedAmountNum).toFixed(2)))
    : findFirstPos(
        raw.Total_Pending_Amount,
        raw.Deal_Pending_Amount,
        raw.Pending_amount,
        raw.Pending_Amount,
        raw.Pending,
        servicesSumPending,
        totalAmountNum > receivedAmountNum ? Number((totalAmountNum - receivedAmountNum).toFixed(2)) : 0,
        deal.totals?.pendingAmount,
        deal.pending ? parseNum(deal.pending) : 0
      );

  // Initial booking advance payment received at deal creation (distinct from R1-R8 remaining payments)
  const resolvedBookingAmount = (() => {
    if (deal.bookingAmount !== undefined && deal.bookingAmount !== null) {
      return parseNum(deal.bookingAmount);
    }
    if (deal.formData?.bookingAmount !== undefined && deal.formData?.bookingAmount !== null) {
      return parseNum(deal.formData.bookingAmount);
    }
    if (deal.totals?.bookingAmount !== undefined && deal.totals?.bookingAmount !== null) {
      return parseNum(deal.totals.bookingAmount);
    }
    const overallRec = receivedAmountNum;
    const existingRSum = PAYMENT_SLOTS.reduce((sum, s) => {
      const v = deal[s.amountField] ?? raw[s.amountField] ?? deal.formData?.[s.amountField];
      return sum + (v ? parseNum(v) : 0);
    }, 0);
    return Math.max(0, overallRec - existingRSum);
  })();

  // Milestone payments calculation across 8 slots
  const totalReceivedAllSlots = PAYMENT_SLOTS.reduce((sum, slot) => {
    const item = paymentSlotsData[slot.index];
    const val = item?.amount ? parseNum(item.amount) : 0;
    return sum + val;
  }, 0);

  const totalOverallReceived = resolvedBookingAmount + totalReceivedAllSlots;

  const totalPendingAllSlots = Math.max(
    0,
    Number((totalAmountNum - totalOverallReceived).toFixed(2))
  );

  // If services array was still empty or contains invalid name, resolve serviceTitle with validation
  if (services.length === 0 || (services.length === 1 && !isValidServiceName(services[0].name, clientName, companyName, deal.id) && totalAmountNum > 0)) {
    let serviceTitle = '';
    const candList = [
      deal.service,
      raw.Service_Name,
      raw.Services,
      raw.Service,
      raw.Service_scheme,
      raw.Service_Scheme,
      raw.Legal_Schemas,
      raw.Schemas,
      raw.Product_Name,
      raw.Choose_Wisely !== 'New Case Booking' ? raw.Choose_Wisely : null,
      raw.Business_plan_selected,
      raw.Item_Name,
    ];
    for (const cand of candList) {
      if (!cand) continue;
      const formatted = formatZohoValue(cand).trim();
      if (formatted && formatted.toLowerCase() !== 'service' && formatted.toLowerCase() !== 'services' && isValidServiceName(formatted, clientName, companyName, deal.id)) {
        serviceTitle = formatted;
        break;
      }
    }
    if (!serviceTitle) {
      const dealNameStr = String(deal.Deal_Name || raw.Deal_Name || '');
      if (dealNameStr) {
        const match = ALL_SERVICES.find(s => s && s.length > 2 && dealNameStr.toLowerCase().includes(s.toLowerCase()));
        if (match && isValidServiceName(match, clientName, companyName, deal.id)) {
          serviceTitle = match;
        }
      }
    }
    if (!serviceTitle) {
      serviceTitle = (deal.service && deal.service !== 'General Services') ? deal.service : 'General Services';
    }

    services = [{
      id: '1',
      name: serviceTitle,
      totalAmount: String(totalAmountNum || ''),
      baseAmount: String(baseAmountNum || ''),
      receivedAmount: String(receivedAmountNum || ''),
      pendingAmount: String(pendingAmountNum || ''),
    }];
  }

  const initials = clientName && clientName !== 'Client' ? clientName.substring(0, 2).toUpperCase() : (companyName !== 'N/A' ? companyName.substring(0, 2).toUpperCase() : 'DL');

  // Extract BDM and Partner BDM Details using standardized split utility
  const splitBreakdown = getDealSplitBreakdown(deal, currentUser, isSuperAdmin || isHOD);
  const primaryBdmName = formatZohoValue(splitBreakdown.primaryName || deal.bdmName || deal.owner || 'Admin');
  const hasPartnerBdm = splitBreakdown.hasPartnerBdm;
  const partnerBdmName = formatZohoValue(splitBreakdown.partnerName);
  const preGstReceivedNum = splitBreakdown.preGstReceived;
  const partnerBdmAmount = splitBreakdown.partnerAmount;

  // Permission: Strictly only BDM 1 (Primary BDM) and Super Admin can record/edit remaining milestone payment entries (R1-R8)
  const isBdm1 = Boolean(
    splitBreakdown.isUserPrimary ||
    isUserPrimaryBdm(deal, currentUser) ||
    (currentUser?.name && primaryBdmName && (
      currentUser.name.toLowerCase().trim() === primaryBdmName.toLowerCase().trim() ||
      (currentUser.name.trim().length >= 3 && primaryBdmName.toLowerCase().includes(currentUser.name.toLowerCase().trim())) ||
      (primaryBdmName.trim().length >= 3 && currentUser.name.toLowerCase().includes(primaryBdmName.toLowerCase().trim()))
    )) ||
    (currentUser?.id && splitBreakdown.primaryId && String(currentUser.id) === String(splitBreakdown.primaryId)) ||
    (currentUser?.zohoId && splitBreakdown.primaryId && String(currentUser.zohoId) === String(splitBreakdown.primaryId))
  );
  const canEditRemainingPayment = Boolean(isBdm1 || isSuperAdmin);

  // Extract Legal Subform
  const legalSubform = deal.legalData || (Array.isArray(raw.Legal) && raw.Legal.length > 0
    ? raw.Legal.map((lg: any, i: number) => ({
        id: String(lg.id || i + 1),
        schema: formatZohoValue(lg.Legal_Schemas || lg.Schemas || ''),
        tenure: formatZohoValue(lg.Tenure_of_Service || ''),
        docTypes: formatZohoValue(lg.Types_of_legal_documents || ''),
        terms1: formatZohoValue(lg.Agreement_Terms_I || ''),
        terms2: formatZohoValue(lg.Agreement_Terms_II || ''),
        dataChecker: formatZohoValue(lg.Data_checker_name_subform?.name || lg.Data_checker_name_subform || ''),
        dateCheckedDate: formatZohoValue(lg.Date_checked_date || ''),
        dateCheckerStatus: formatZohoValue(lg.Date_checker_status || ''),
        dprStatus: formatZohoValue(lg.DPR_status || ''),
        dateOfDprStatusChange: formatZohoValue(lg.Date_of_DPR_status_change || ''),
        dprTl: formatZohoValue(lg.Operation_team_leader?.name || lg.Operation_team_leader || ''),
        dprMember: formatZohoValue(lg.Operation_team_member?.name || lg.Operation_team_member || ''),
        financeStatus: formatZohoValue(lg.Finance_status || ''),
        dateOfFinanceStatusChange: formatZohoValue(lg.Date_of_finance_status_change || ''),
        financeTl: formatZohoValue(lg.Finance_team_leader?.name || lg.Finance_team_leader || ''),
        financeMember: formatZohoValue(lg.Finance_team_member?.name || lg.Finance_team_member || ''),
        legalStatus: formatZohoValue(lg.Internal_legal_status || ''),
        internalTeamType: formatZohoValue(lg.Internal_team_type || ''),
        qualityProvided: formatZohoValue(lg.Quality_provided || ''),
        distributionPaid: formatZohoValue(lg.Distribution_of_amount_paid_by_the_S || lg.Distribution_of_amount_paid_by_ || ''),
        remark: formatZohoValue(lg.Remark || '')
      }))
    : []);

  const handleDownload = async (doc: any) => {
    try {
      const file = await getDocument(doc.id);
      if (file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn('Failed to get real document from DB, falling back to mockup', err);
    }
    
    // Fallback to mockup if file wasn't found in IndexedDB
    const ext = (doc.name ?? '').split('.').pop()?.toLowerCase() || '';
    let blob: Blob;
    
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' });
    } else if (ext === 'pdf') {
      const b64 = 'JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCj4+Cj4+CiAgL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iagoKNCAwIG9iago8PAogIC9UeXBlIC9Gb250CiAgL1N1YnR5cGUgL1R5cGUxCiAgL0Jhc2VGb250IC9UaW1lcy1Sb21hbgo+PgplbmRvYmoKCjUgMCBvYmoKPDwKICAvTGVuZ3RoIDQzCj4+CnN0cmVhbQpCVAovRjEgMTggVGYKMCAwIDAgcmcKNTAgMTAwIFRkCihEZW1vIFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDE1OCAwMDAwMCBuIAowMDAwMDAwMjYwIDAwMDAwIG4gCjAwMDAwMDAzNDkgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDQxCiUlRU9GCg==';
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    } else {
      const content = `This is a document download for ${doc.name}.`;
      blob = new Blob([content], { type: 'text/plain' });
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreviewZohoAttachment = (att: any) => {
    const targetZohoId = deal?.zohoId || (id && /^\d+$/.test(id) ? id : null);
    if (!targetZohoId) return;

    const fileName = att.File_Name || 'document';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const isPdf = ext === 'pdf';
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
    const sizeNum = Number(att.Size) || 0;
    const sizeText = sizeNum > 0 ? (sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(2)} MB`) : '';
    const downloadUrl = getZohoAttachmentDownloadUrl('Deals', targetZohoId, att.id, false);
    const previewUrl = getZohoAttachmentDownloadUrl('Deals', targetZohoId, att.id, true);

    if (isPdf || isImage) {
      setPreviewDoc({
        url: previewUrl,
        name: fileName,
        sizeText,
        isPdf,
        isImage,
        downloadUrl,
        isZoho: true,
      });
    } else {
      downloadZohoAttachment('Deals', targetZohoId, att.id, fileName);
    }
  };

  const handlePreviewLocalDoc = async (doc: any) => {
    try {
      const file = await getDocument(doc.id);
      const ext = (doc.name || '').split('.').pop()?.toLowerCase() || '';
      const isPdf = ext === 'pdf';
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
      const sizeNum = doc.size || 0;
      const sizeText = sizeNum > 0 ? (sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(2)} MB`) : '';

      if (file) {
        const url = URL.createObjectURL(file);
        setPreviewDoc({
          url,
          name: doc.name,
          sizeText,
          isPdf,
          isImage,
          downloadUrl: url,
          isZoho: false,
        });
        return;
      }
    } catch (e) {
      console.warn('Could not read local document:', e);
    }
    handleDownload(doc);
  };

  const handleDownloadZoho = (att: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetZohoId = deal?.zohoId || (id && /^\d+$/.test(id) ? id : null);
    if (!targetZohoId) return;
    downloadZohoAttachment('Deals', targetZohoId, att.id, att.File_Name || 'document');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetZohoId = deal?.zohoId || (id && /^\d+$/.test(id) ? id : null);
    setIsUploadingAttachment(true);
    setUploadToast(null);

    try {
      // 1. Always save to local IndexedDB
      const docId = `${deal?.id || id || 'deal'}_${file.name}`;
      await saveDocument(docId, file);

      // 2. Upload to Zoho CRM if zohoId is available
      if (targetZohoId) {
        const res = await uploadZohoAttachmentToDeal(targetZohoId, file, file.name);
        if (res.success) {
          setUploadToast({ type: 'success', message: `"${file.name}" uploaded to Zoho CRM successfully!` });
          await loadAttachments(targetZohoId);
        } else {
          setUploadToast({ type: 'error', message: res.message || 'Saved locally, but Zoho upload failed.' });
        }
      } else {
        setUploadToast({ type: 'success', message: `"${file.name}" saved locally!` });
      }

      // 3. Update deal documents in state
      const localDocs = await scanLocalDocuments(deal, id);
      const updatedDeal = { ...deal, documentsData: localDocs };
      setDeal(updatedDeal);
    } catch (err: any) {
      console.error('Error uploading document:', err);
      setUploadToast({ type: 'error', message: err?.message || 'Error uploading file.' });
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadToast(null), 4500);
    }
  };

  const openPaymentModal = () => {
    setPaymentModalError(null);
    const today = new Date().toISOString().split('T')[0];
    const initialSlots: Record<number, PaymentSlotItem> = {} as any;

    let firstUnfilledTab = 1;
    let foundFirstUnfilled = false;

    PAYMENT_SLOTS.forEach((slot) => {
      // Amount from deal, raw, or formData strictly for this milestone slot
      const rawVal = deal[slot.amountField] ?? raw[slot.amountField] ?? deal.formData?.[slot.amountField] ??
        deal[`R${slot.index}_Received_Amount`] ?? raw[`R${slot.index}_Received_Amount`] ??
        deal[`R${slot.index}_Received_amount`] ?? raw[`R${slot.index}_Received_amount`];
      const amtStr = (rawVal !== undefined && rawVal !== null && rawVal !== '') ? String(rawVal).replace(/[^0-9.]/g, '') : '';

      if (!foundFirstUnfilled && (!amtStr || parseNum(amtStr) === 0)) {
        firstUnfilledTab = slot.index;
        foundFirstUnfilled = true;
      }

      // Date from deal, raw, or formData
      const rawDate = deal[slot.dateField] ?? raw[slot.dateField] ?? deal.formData?.[slot.dateField];
      const dateStr = rawDate ? String(rawDate).split('T')[0] : today;

      // BDM 1
      const rawBdm1 = deal[slot.bdm1Field] ?? raw[slot.bdm1Field] ?? deal.formData?.[slot.bdm1Field] ?? (primaryBdmName || 'Admin');
      const bdm1Name = typeof rawBdm1 === 'object' ? (rawBdm1?.name || '') : String(rawBdm1 || primaryBdmName || 'Admin');
      const matchedBdm1 = salesEmployees.find(e => e.name.toLowerCase() === bdm1Name.toLowerCase());
      const bdm1Id = matchedBdm1?.id || matchedBdm1?.zohoId || '';

      // BDM 2
      const rawBdm2 = deal[slot.bdm2Field] ?? raw[slot.bdm2Field] ?? deal.formData?.[slot.bdm2Field] ?? '';
      const bdm2Name = typeof rawBdm2 === 'object' ? (rawBdm2?.name || '') : String(rawBdm2 || '');
      const matchedBdm2 = salesEmployees.find(e => e.name.toLowerCase() === bdm2Name.toLowerCase());
      const bdm2Id = matchedBdm2?.id || matchedBdm2?.zohoId || '';

      // Screenshot strictly for this milestone
      const rawScreenshot = deal[slot.screenshotField] ?? raw[slot.screenshotField];
      let existingName = '';
      let ssAttId = '';
      let ssFileId = '';
      let existingUrl = '';

      if (rawScreenshot && typeof rawScreenshot === 'object') {
        const item = Array.isArray(rawScreenshot) ? rawScreenshot[0] : rawScreenshot;
        if (item && typeof item === 'object') {
          existingName = item.File_Name__s || item.name || item.file_name || '';
          ssAttId = item.id || item.fields_attachment_id || '';
          ssFileId = item.File_Id__s || item.file_id || '';
        }
      } else if (typeof rawScreenshot === 'string' && rawScreenshot.trim()) {
        existingName = rawScreenshot.trim();
        if (existingName.startsWith('http') || existingName.startsWith('blob:') || existingName.startsWith('/api/')) {
          existingUrl = existingName;
        }
      }

      // Slot 1 fallback to Deal_payment_screenshot
      if (slot.index === 1) {
        const pss = deal.Deal_payment_screenshot ?? raw.Deal_payment_screenshot ?? deal.paymentScreenshots ?? raw.paymentScreenshots;
        const pssItem = Array.isArray(pss) ? pss[0] : (pss && typeof pss === 'object' ? pss : null);
        if (pssItem && typeof pssItem === 'object') {
          if (!existingName) existingName = pssItem.File_Name__s || pssItem.name || pssItem.file_name || 'payment_screenshot.png';
          if (!ssAttId) ssAttId = pssItem.id || pssItem.fields_attachment_id || '';
          if (!ssFileId) ssFileId = pssItem.File_Id__s || pssItem.file_id || '';
        } else if (typeof pss === 'string' && pss.trim() && !existingName) {
          existingName = pss.trim();
        }
        if (!existingName) {
          existingName = deal.paymentScreenshotName || raw.Payment_Screenshot_Name || '';
        }
        if (!existingUrl && (deal.paymentScreenshotUrl || raw.Payment_Screenshot_URL)) {
          existingUrl = deal.paymentScreenshotUrl || raw.Payment_Screenshot_URL;
        }
      }

      const targetZohoId = String(deal.zohoId || (id && /^\d+$/.test(id) ? id : '') || '');
      if (!existingUrl && (ssFileId || (targetZohoId && ssAttId))) {
        existingUrl = getZohoFieldAttachmentUrl(targetZohoId, ssAttId, ssFileId, 'Deals');
      }

      // Bank type from R{i}_Bank_type
      const rawBank = deal[`R${slot.index}_Bank_type`] ?? raw[`R${slot.index}_Bank_type`] ?? deal.formData?.[`R${slot.index}_Bank_type`] ?? 
        (slot.index <= 2 ? (deal[`R${slot.index}_Bank_details`] ?? raw[`R${slot.index}_Bank_details`]) : '') ?? 
        deal.Bank_details ?? raw.Bank_details ?? '';
      const slotBankType = (rawBank === 'None' || rawBank === '-None-') ? '' : String(rawBank || '').trim();

      const slotIsVerif = Boolean(
        deal[`R${slot.index}_Payment_Verification`] ?? raw[`R${slot.index}_Payment_Verification`] ??
        (slot.index === 1 ? (deal.R1_Payment_verifications ?? raw.R1_Payment_verifications) :
         slot.index === 2 ? (deal.R2_Payment_verifications ?? raw.R2_Payment_verifications) : false)
      );

      initialSlots[slot.index] = {
        amount: amtStr,
        date: dateStr,
        bdm1Id,
        bdm1Name: bdm1Name || primaryBdmName || 'Admin',
        bdm2Id,
        bdm2Name,
        screenshotFile: null,
        screenshotPreview: existingUrl || null,
        existingScreenshotName: existingName,
        bankType: slotBankType,
        isVerified: slotIsVerif,
      };
    });

    setPaymentSlotsData(initialSlots);
    setActivePaymentTab(firstUnfilledTab);
    setIsPaymentModalOpen(true);
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deal) return;

    if (!canEditRemainingPayment && !isAccounts && !isSuperAdmin) {
      setPaymentModalError(`Only Primary BDM (BDM 1: ${primaryBdmName}) or Accounts department can edit payment entries.`);
      return;
    }

    const activeSlot = paymentSlotsData[activePaymentTab];
    if (activeSlot && parseNum(activeSlot.amount) < 0) {
      setPaymentModalError('Received amount cannot be negative');
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentModalError(null);

    try {
      const targetZohoId = deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : null);

      // 1. Process Screenshots for any slots with new files
      const slotScreenshots: Record<number, string> = {};
      for (const slot of PAYMENT_SLOTS) {
        const item = paymentSlotsData[slot.index];
        if (item.screenshotFile) {
          const file = item.screenshotFile;
          slotScreenshots[slot.index] = file.name;
          try {
            const docId = `${deal.id || id || 'deal'}_${slot.tabName}_${Date.now()}_${file.name}`;
            await saveDocument(docId, file);
          } catch (dbErr) {
            console.warn(`IndexedDB save error for ${slot.tabName}:`, dbErr);
          }
          if (targetZohoId) {
            try {
              const imgRes = await uploadZohoDealImageField(targetZohoId, file, slot.screenshotField, file.name);
              if (!imgRes.success) {
                console.warn(`Zoho deal image field upload failed for ${slot.tabName} (${slot.screenshotField}):`, imgRes.message);
              }
            } catch (fErr) {
              console.warn(`Zoho deal image field error for ${slot.tabName}:`, fErr);
            }
          }
        }
      }

      // 2. Financial totals across all 8 slots + booking advance
      const sumRemainingPayments = totalReceivedAllSlots;
      const totalRec = resolvedBookingAmount + sumRemainingPayments;
      const totalPend = totalPendingAllSlots;
      const preGstTotal = Number((totalRec / 1.18).toFixed(2));

      // 3. Check if any slot has a secondary BDM (Partner BDM deal)
      const hasAnyPartnerBdm = PAYMENT_SLOTS.some(s => {
        const item = paymentSlotsData[s.index];
        return Boolean(item.bdm2Name && item.bdm2Name.trim() !== '' && item.bdm2Name.toLowerCase() !== 'none');
      });
      const primaryBdm = activeSlot?.bdm1Name || primaryBdmName || 'Admin';
      const partnerSlotItem = hasAnyPartnerBdm ? Object.values(paymentSlotsData).find(it => it.bdm2Name && it.bdm2Name.trim() !== '' && it.bdm2Name.toLowerCase() !== 'none') : null;
      const partnerBdm = partnerSlotItem?.bdm2Name || '';
      const partnerShare = hasAnyPartnerBdm ? Number((preGstTotal / 2).toFixed(2)) : 0;

      // 4. Update Subform_1 service line items
      const existingSubforms = Array.isArray(raw.Subform_1) && raw.Subform_1.length > 0
        ? raw.Subform_1
        : (deal.servicesData || []);

      const updatedServicesData = (deal.servicesData || []).map((s: any) => {
        let itemRec = totalRec;
        if ((deal.servicesData || []).length > 1 && totalAmountNum > 0) {
          const itemTotal = Number(s.totalAmount) || 0;
          itemRec = Number(((itemTotal / totalAmountNum) * totalRec).toFixed(2));
        }
        const itemPend = Math.max(0, Number(((Number(s.totalAmount) || 0) - itemRec).toFixed(2)));
        return {
          ...s,
          receivedAmount: String(itemRec),
          pendingAmount: String(itemPend),
          paymentStages: totalRec >= totalAmountNum ? 'Full amount paid' : 'Partially paid',
          paymentDate: activeSlot?.date,
        };
      });

      const updatedSubform1 = existingSubforms.map((sf: any) => {
        let itemRec = totalRec;
        if (existingSubforms.length > 1 && totalAmountNum > 0) {
          const itemTotal = Number(sf.Agreement_amount || sf.totalAmount || 0);
          itemRec = Number(((itemTotal / totalAmountNum) * totalRec).toFixed(2));
        }
        const itemPend = Math.max(0, Number(((Number(sf.Agreement_amount || sf.totalAmount || 0)) - itemRec).toFixed(2)));
        return {
          ...sf,
          Received_amount: itemRec,
          Pending_amount: itemPend,
          Payment_type: totalRec >= totalAmountNum ? 'Full amount paid' : 'Partially paid',
          Payment_stages: '.',
          Payment_received_date: activeSlot?.date,
        };
      });

      // 5. Construct mapped fields for R1 through R8
      const rFieldsMap: Record<string, any> = {};
      PAYMENT_SLOTS.forEach((slot) => {
        const item = paymentSlotsData[slot.index];
        const amtClean = item.amount ? String(item.amount).trim() : '';
        const hasAmt = amtClean !== '' && parseNum(amtClean) > 0;
        if (hasAmt) {
          rFieldsMap[slot.amountField] = amtClean;
          if (slot.index === 1) rFieldsMap.R1_Received_Amount = amtClean;
          if (slot.index === 2) rFieldsMap.R2_Received_Amount = amtClean;

          rFieldsMap[slot.dateField] = item.date || new Date().toISOString().split('T')[0];
          if (slot.index === 1) rFieldsMap.R1_Payment_Date = rFieldsMap[slot.dateField];
          if (slot.index === 2) rFieldsMap.R2_Payment_Date = rFieldsMap[slot.dateField];

          rFieldsMap[slot.bdm1Field] = item.bdm1Name || primaryBdm || 'Admin';
          rFieldsMap[slot.bdm2Field] = (item.bdm2Name && item.bdm2Name.toLowerCase() !== 'none') ? item.bdm2Name : '';
          if (slotScreenshots[slot.index] || item.existingScreenshotName) {
            rFieldsMap[slot.screenshotField] = slotScreenshots[slot.index] || item.existingScreenshotName;
          }
          if (item.bankType) {
            rFieldsMap[`R${slot.index}_Bank_type`] = item.bankType;
            if (slot.index === 1) rFieldsMap.R1_Bank_details = item.bankType;
            if (slot.index === 2) rFieldsMap.R2_Bank_details = item.bankType;
          }
        } else {
          // Unfilled slot - clear remaining payment fields so dummy dates/BDMs are never sent to Zoho
          rFieldsMap[slot.amountField] = '';
          if (slot.index === 1) rFieldsMap.R1_Received_Amount = '';
          if (slot.index === 2) rFieldsMap.R2_Received_Amount = '';
          rFieldsMap[slot.dateField] = '';
          if (slot.index === 1) rFieldsMap.R1_Payment_Date = '';
          if (slot.index === 2) rFieldsMap.R2_Payment_Date = '';
          rFieldsMap[slot.bdm1Field] = '';
          rFieldsMap[slot.bdm2Field] = '';
          rFieldsMap[slot.screenshotField] = '';
        }
      });

      // 5. Build updated deal object with synchronized BDM 1 and BDM 2 fields and 8-milestones
      const bdm1Name = activeSlot?.bdm1Name || primaryBdm || 'Admin';
      const matchedBdm1 = salesEmployees.find(e => e.name.toLowerCase() === bdm1Name.toLowerCase());
      const bdm1Id = activeSlot?.bdm1Id || matchedBdm1?.id || matchedBdm1?.zohoId || deal.employeeZohoId || '';

      const bdm2Name = (activeSlot?.bdm2Name && activeSlot.bdm2Name.toLowerCase() !== 'none') ? activeSlot.bdm2Name : (hasAnyPartnerBdm ? partnerBdm : '');
      const matchedBdm2 = bdm2Name ? salesEmployees.find(e => e.name.toLowerCase() === bdm2Name.toLowerCase()) : null;
      const bdm2Id = activeSlot?.bdm2Id || matchedBdm2?.id || matchedBdm2?.zohoId || '';
      const hasPartner = Boolean(bdm2Name && bdm2Name.trim() !== '' && bdm2Name.toLowerCase() !== 'none');

      const screenshotName = slotScreenshots[activePaymentTab] || activeSlot?.existingScreenshotName || deal.paymentScreenshotName || '';
      const activeDate = activeSlot?.date || new Date().toISOString().split('T')[0];
      const isFullPaid = totalRec >= totalAmountNum;

      const updatedDeal: any = {
        ...deal,
        ...rFieldsMap,
        bookingAmount: resolvedBookingAmount,
        rPaymentSlots: paymentSlotsData,
        received: `₹${totalRec.toLocaleString('en-IN')}`,
        rawReceived: totalRec,
        pending: `₹${totalPend.toLocaleString('en-IN')}`,
        rawPending: totalPend,
        paymentScreenshotName: screenshotName,
        paymentScreenshotUrl: deal.paymentScreenshotUrl,
        employeeName: bdm1Name,
        salesEmployee: bdm1Name,
        employeeZohoId: bdm1Id || deal.employeeZohoId,
        Employee: bdm1Id ? { id: bdm1Id, name: bdm1Name } : (deal.Employee || { name: bdm1Name }),
        hasPartnerBdm: hasPartner,
        has_partner_bdm: hasPartner,
        partnerBdmName: bdm2Name,
        partner_bdm_name: bdm2Name,
        partnerBdmId: bdm2Id,
        partner_bdm_id: bdm2Id,
        partnerBdmAmount: partnerShare,
        partner_bdm_amount: partnerShare,
        Partner_BDM: hasPartner && bdm2Id ? { id: bdm2Id, name: bdm2Name } : (hasPartner ? { name: bdm2Name } : null),
        Partner_BDM_Name: bdm2Name,
        Partner_BDM_Amount: partnerShare,
        Partner_BDM_ID: bdm2Id,
        Has_Partner_BDM: hasPartner,
        servicesData: updatedServicesData.length > 0 ? updatedServicesData : deal.servicesData,
        totals: {
          ...(deal.totals || {}),
          grandTotal: totalAmountNum,
          baseAmount: baseAmountNum,
          totalGst: gstAmountNum,
          bookingAmount: resolvedBookingAmount,
          receivedAmount: totalRec,
          pendingAmount: totalPend,
          partnerBdmAmount: partnerShare,
        },
        formData: {
          ...(deal.formData || {}),
          ...rFieldsMap,
          bookingAmount: resolvedBookingAmount,
          received: String(totalRec),
          pending: String(totalPend),
          employeeName: bdm1Name,
          salesEmployee: bdm1Name,
          employeeZohoId: bdm1Id || deal.formData?.employeeZohoId,
          hasPartnerBdm: hasPartner,
          has_partner_bdm: hasPartner,
          partnerBdmName: bdm2Name,
          partner_bdm_name: bdm2Name,
          partnerBdmId: bdm2Id,
          partner_bdm_id: bdm2Id,
          partnerBdmAmount: partnerShare,
          partner_bdm_amount: partnerShare,
          paymentScreenshotName: screenshotName,
        },
        rawZohoDeal: {
          ...(deal.rawZohoDeal || {}),
          ...rFieldsMap,
          Total_Received_Amount: totalRec,
          Received_amount: totalRec,
          Deal_Received_Amount: totalRec,
          Amount_After_disbursement: totalRec,
          Total_Pending_Amount: totalPend,
          Pending_amount: totalPend,
          Deal_Pending_Amount: totalPend,
          Payment_received_date: activeDate,
          Payment_Date: activeDate,
          Payment_Type: 'Online',
          Payment_status: isFullPaid ? 'Full amount paid' : 'Partially paid',
          Employee: bdm1Id && /^\d{15,}$/.test(String(bdm1Id)) ? { id: String(bdm1Id), name: bdm1Name } : (typeof raw.Employee === 'object' && raw.Employee?.id ? raw.Employee : { name: bdm1Name }),
          BDM_names: bdm1Id && /^\d{15,}$/.test(String(bdm1Id)) ? { id: String(bdm1Id), name: bdm1Name } : (typeof raw.BDM_names === 'object' && raw.BDM_names?.id && /^\d{15,}$/.test(String(raw.BDM_names.id)) ? raw.BDM_names : null),
          Has_Partner_BDM: hasPartner,
          Partner_BDM: hasPartner && bdm2Id ? { id: bdm2Id, name: bdm2Name } : (hasPartner ? { name: bdm2Name } : null),
          Partner_BDM_Name: bdm2Name,
          Partner_BDM_Amount: partnerShare,
          Partner_BDM_ID: bdm2Id,
          Subform_1: updatedSubform1.length > 0 ? updatedSubform1 : raw.Subform_1,
        }
      };

      // 6. Update local deal state immediately
      setDeal(updatedDeal);

      // 7. Update localStorage be_deals cache
      try {
        const saved = localStorage.getItem('be_deals');
        if (saved) {
          const allDeals = JSON.parse(saved);
          const updatedAll = allDeals.map((d: any) =>
            (d.id === deal.id || (d.zohoId && d.zohoId === deal.zohoId)) ? updatedDeal : d
          );
          localStorage.setItem('be_deals', JSON.stringify(updatedAll));
        }
      } catch (e) {}

      // 8. Dispatch real-time global event so Dashboard & Deals lists reflect the update
      try {
        window.dispatchEvent(new CustomEvent('be_deals_updated', { detail: updatedDeal }));
      } catch (e) {}

      // 9. Synchronize to Zoho CRM
      const zohoRes = await saveOrUpdateZohoDeal(updatedDeal);
      if (zohoRes.success) {
        setWorkflowToast({ type: 'success', message: 'Payment recorded and both BDM records synchronized with Zoho CRM successfully!' });
      } else {
        setWorkflowToast({ type: 'error', message: zohoRes.message || 'Payment recorded locally, but failed to sync to Zoho CRM.' });
      }

      setIsPaymentModalOpen(false);
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      setPaymentModalError(err?.message || 'Failed to update payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleVerifyDetailsMilestone = async (slotIndex: number, forcedBankType?: string) => {
    if (!deal) return;
    const targetZohoId = deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : null);
    if (!targetZohoId) {
      setWorkflowToast({ type: 'error', message: 'Cannot verify: Deal is not synced with Zoho CRM.' });
      return;
    }

    const currentBank = forcedBankType || detailsBankSelections[slotIndex] || deal[`R${slotIndex}_Bank_type`] || deal.rawZohoDeal?.[`R${slotIndex}_Bank_type`] || '';

    setVerifyingDetailsMilestone(slotIndex);
    try {
      const res = await verifyZohoMilestonePayment(targetZohoId, slotIndex, currentBank, true);
      if (res.success) {
        setWorkflowToast({ type: 'success', message: `R${slotIndex} payment verified (${currentBank})` });
        setDeal((prev: any) => {
          if (!prev) return prev;
          const patch: any = {};
          if (slotIndex === 1) {
            patch.R1_Payment_Verification = true;
            patch.R1_Payment_verifications = true;
            patch.R1_Bank_type = currentBank;
            patch.R1_Bank_details = currentBank;
          } else if (slotIndex === 2) {
            patch.R2_Payment_Verification = true;
            patch.R2_Payment_verifications = true;
            patch.R2_Bank_type = currentBank;
            patch.R2_Bank_details = currentBank;
          } else {
            patch[`R${slotIndex}_Payment_Verification`] = true;
            patch[`R${slotIndex}_Bank_type`] = currentBank;
          }
          return {
            ...prev,
            ...patch,
            rawZohoDeal: {
              ...(prev.rawZohoDeal || {}),
              ...patch
            }
          };
        });
      } else {
        setWorkflowToast({ type: 'error', message: res.message || 'Verification failed in Zoho CRM' });
      }
    } catch (err: any) {
      setWorkflowToast({ type: 'error', message: err?.message || 'Failed to communicate with Zoho CRM' });
    } finally {
      setVerifyingDetailsMilestone(null);
    }
  };

  const handleSaveDetailsMilestoneBank = async (slotIndex: number, bankVal: string) => {
    if (!deal) return;
    const targetZohoId = deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : null);
    if (!targetZohoId) {
      setWorkflowToast({ type: 'error', message: 'Cannot save: Deal is not synced with Zoho CRM.' });
      return;
    }

    setVerifyingDetailsMilestone(slotIndex);
    try {
      const res = await updateZohoMilestoneBank(targetZohoId, slotIndex, bankVal);
      if (res.success) {
        setWorkflowToast({ type: 'success', message: `R${slotIndex} Bank Details saved as ${bankVal} (Zoho field: R${slotIndex}_Bank_type)` });
        setDeal((prev: any) => {
          if (!prev) return prev;
          const patch: any = {};
          patch[`R${slotIndex}_Bank_type`] = bankVal;
          if (slotIndex === 1) patch.R1_Bank_details = bankVal;
          if (slotIndex === 2) patch.R2_Bank_details = bankVal;

          return {
            ...prev,
            ...patch,
            rawZohoDeal: {
              ...(prev.rawZohoDeal || {}),
              ...patch
            }
          };
        });
      } else {
        setWorkflowToast({ type: 'error', message: res.message || 'Failed to update Bank Details' });
      }
    } catch (err: any) {
      setWorkflowToast({ type: 'error', message: err?.message || 'Error updating Bank Details' });
    } finally {
      setVerifyingDetailsMilestone(null);
    }
  };

  const handleVerifyDetailsLegal = async (slotIndex: number, isVerified: boolean = true) => {
    if (!deal) return;
    const targetZohoId = deal.zohoId || (id && /^\d{15,}$/.test(id) ? id : null);
    if (!targetZohoId) {
      setWorkflowToast({ type: 'error', message: 'Cannot verify: Deal is not synced with Zoho CRM.' });
      return;
    }

    setVerifyingDetailsLegal(slotIndex);
    try {
      const res = await verifyZohoMilestoneLegal(targetZohoId, slotIndex, isVerified);
      if (res.success) {
        setWorkflowToast({
          type: 'success',
          message: `R${slotIndex} Legal verification ${isVerified ? 'verified' : 'marked pending'}`
        });
        setDeal((prev: any) => {
          if (!prev) return prev;
          const patch: any = {};
          patch[`R${slotIndex}_Legal_verification`] = isVerified;
          return {
            ...prev,
            ...patch,
            rawZohoDeal: {
              ...(prev.rawZohoDeal || {}),
              ...patch
            }
          };
        });
      } else {
        setWorkflowToast({ type: 'error', message: res.message || 'Legal verification failed in Zoho CRM' });
      }
    } catch (err: any) {
      setWorkflowToast({ type: 'error', message: err?.message || 'Failed to communicate with Zoho CRM' });
    } finally {
      setVerifyingDetailsLegal(null);
    }
  };

  const handleViewMilestoneScreenshot = async (milestone: DealMilestoneItem) => {
    // 1. Try local IndexedDB
    try {
      const allDbDocs = await getAllDocuments();
      const found = allDbDocs.find((d: any) => 
        (d.id && String(d.id).includes(String(deal?.id || id)) && String(d.id).includes(milestone.tabName)) ||
        (d.name && d.name === milestone.screenshot)
      );
      if (found && found.file) {
        const url = URL.createObjectURL(found.file);
        setPreviewDoc({
          url,
          name: milestone.screenshot || `R${milestone.index}_Screenshot`,
          isPdf: (milestone.screenshot || '').toLowerCase().endsWith('.pdf'),
          isImage: true,
          downloadUrl: url,
          isZoho: false
        });
        return;
      }
    } catch (_) {}

    // 2. Direct url or zoho attachments
    if (milestone.screenshot) {
      const att = zohoAttachments.find((a: any) => 
        (a.File_Name && a.File_Name.toLowerCase() === milestone.screenshot.toLowerCase()) || 
        (a.name && a.name.toLowerCase() === milestone.screenshot.toLowerCase())
      );
      if (att) {
        handlePreviewZohoAttachment(att);
        return;
      }
      if (milestone.screenshot.startsWith('http') || milestone.screenshot.startsWith('blob:')) {
        setPreviewDoc({
          url: milestone.screenshot,
          name: milestone.screenshot,
          isPdf: milestone.screenshot.toLowerCase().includes('.pdf'),
          isImage: true,
          downloadUrl: milestone.screenshot,
          isZoho: false
        });
        return;
      }
    }

    setWorkflowToast({ type: 'error', message: 'Screenshot file is not available in local cache or attachments.' });
  };

  const percentReceived = totalAmountNum > 0 ? Math.min(100, Math.round((receivedAmountNum / totalAmountNum) * 100)) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-5 rounded-2xl border border-gray-100 shadow-sm gap-4">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-900 border border-gray-100"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{deal.id}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                deal.status === 'Won' ? 'bg-emerald-100 text-emerald-800' : 
                deal.status === 'Negotiation' ? 'bg-blue-100 text-blue-800' :
                deal.status === 'Lost' ? 'bg-rose-100 text-rose-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {formatZohoValue(deal.stage || deal.status || 'Active')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Created on {deal.date || 'Recent'} • Managed by <span className="text-gray-700 font-semibold">{formatZohoValue(deal.owner || 'Admin')}</span>
              {employeeName && (
                <> • Employee: <span className="text-be-orange font-bold">{formatZohoValue(employeeName)}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Action Workflow Buttons in Header */}
          {(() => {
            const rawStage = (deal.stage || raw.Stage || deal.status || 'Sales').toLowerCase().trim();
            const isAccountsStage = rawStage.includes('account');
            const isLegalStage = rawStage.includes('legal');
            const isAllocatorStage = rawStage.includes('allocat') && !rawStage.includes('execut');
            const isExecutorsStage = rawStage.includes('execut');
            const isQualityStage = rawStage.includes('qualit');
            const isWonStage = rawStage.includes('won');
            const isLostStage = rawStage.includes('lost');
            const isSalesOrDraft = !isAccountsStage && !isLegalStage && !isAllocatorStage && !isExecutorsStage && !isQualityStage && !isWonStage && !isLostStage;

            return (
              <>
                {/* 1. Send to Accounts (Sales to Account: 1078476000000489153) */}
                {isSalesOrDraft && !splitBreakdown.isPaymentVerified && (isSales || isSuperAdmin || (!isAccounts && !isLegal)) && (
                  <button
                    onClick={handleSendToAccounts}
                    disabled={isActionInProgress}
                    className="flex items-center px-3.5 py-2 text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-all shadow-xs disabled:opacity-50"
                    title="Send Deal to Accounts department for payment verification (Zoho Blueprint)"
                  >
                    {isActionInProgress ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Building2 size={15} className="mr-1.5" />}
                    Send to Accounts
                  </button>
                )}

                {/* 2. Verify Payment (Accounts action - Automatically moves to Legal) */}
                {!splitBreakdown.isPaymentVerified && isAccountsStage && (isAccounts || isSuperAdmin) && (
                  <button
                    onClick={handleVerifyPayment}
                    disabled={isActionInProgress}
                    className="flex items-center px-3.5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                    title="Verify Payment and automatically forward deal to Legal Department"
                  >
                    {isActionInProgress ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <CheckCircle2 size={15} className="mr-1.5" />}
                    Verify & Send to Legal
                  </button>
                )}

                {/* 3. Send to Legal (Account to Legal: 1078476000000492001) */}
                {splitBreakdown.isPaymentVerified && isAccountsStage && (isAccounts || isSuperAdmin) && (
                  <button
                    onClick={handleSendToLegal}
                    disabled={isActionInProgress}
                    className="flex items-center px-3.5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                    title="Send Verified Deal to Legal Department (Zoho Blueprint)"
                  >
                    {isActionInProgress ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <ShieldCheck size={15} className="mr-1.5" />}
                    Send to Legal
                  </button>
                )}

                {/* 4. Send to Operations Allocator (Legal to Operations Allocator: 1078476000000492099) */}
                {isLegalStage && (isLegal || isSuperAdmin) && (
                  <button
                    onClick={handleSendToOperationsAllocator}
                    disabled={isActionInProgress}
                    className="flex items-center px-3.5 py-2 text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                    title="Send deal from Legal to Operations Allocator (Zoho Blueprint)"
                  >
                    {isActionInProgress ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Users size={15} className="mr-1.5" />}
                    To Allocator
                  </button>
                )}

                {/* 5. Send to Operations Executors (Operations Allocator to Operations Executors: 1078476000001938757) */}
                {isAllocatorStage && (isSuperAdmin || (!isSales && !isAccounts && !isLegal)) && (
                  <button
                    onClick={handleSendToOperationsExecutors}
                    disabled={isActionInProgress}
                    className="flex items-center px-3.5 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                    title="Send deal from Allocator to Operations Executors (Zoho Blueprint)"
                  >
                    {isActionInProgress ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <ArrowRight size={15} className="mr-1.5" />}
                    To Executors
                  </button>
                )}
              </>
            );
          })()}

          <button
            onClick={openPaymentModal}
            className={`flex items-center px-3.5 py-2 text-sm font-bold rounded-xl transition-all shadow-xs cursor-pointer ${
              canEditRemainingPayment
                ? 'text-white bg-be-orange hover:bg-be-orangeHover'
                : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
            }`}
            title={canEditRemainingPayment ? "Record or update received payment, proof screenshot, and BDM allocation" : "View milestone payments (Read-Only)"}
          >
            {canEditRemainingPayment ? (
              <>
                <CreditCard size={15} className="mr-1.5" />
                Record Payment
              </>
            ) : (
              <>
                <Eye size={15} className="mr-1.5 text-gray-500" />
                View Payments
              </>
            )}
          </button>

          <button 
            onClick={() => loadLiveDeal(deal?.zohoId || id || '')}
            disabled={isRefreshing}
            className="flex items-center px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-xs disabled:opacity-60"
            title="Refresh latest live deal fields"
          >
            <RefreshCw size={15} className={`mr-1.5 text-be-orange ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button 
            onClick={() => navigate('/crm/deals')} 
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-xs"
          >
            All Deals
          </button>
          <button 
            onClick={() => window.print()}
            className="p-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors" 
            title="Print Deal Summary"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Workflow Notification Toast */}
      {workflowToast && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-sm font-medium ${workflowToast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          <div className="flex items-center">
            {workflowToast.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 mr-2 text-rose-600" />}
            <span>{workflowToast.message}</span>
          </div>
          <button onClick={() => setWorkflowToast(null)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 50/50 Partner BDM Split Banner */}
      {hasPartnerBdm && (
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-purple-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-purple-500/20 rounded-xl text-purple-300 border border-purple-400/30 shrink-0">
              <Users size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">50/50 Partner BDM Split Active</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30">Pre-GST 50% Share</span>
              </div>
              <p className="text-xs text-purple-200 mt-1">
                {splitBreakdown.isUserPartner
                  ? `You are the Partner BDM for this deal. Your credited revenue share is ₹${partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (50% Pre-GST Share of ₹${receivedAmountNum.toLocaleString('en-IN')} received).`
                  : splitBreakdown.isUserPrimary
                  ? `You shared this deal 50/50 with Partner BDM (${partnerBdmName}). Your credited revenue share is ₹${partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                  : `Deal split 50/50 between Primary BDM (${primaryBdmName}) and Partner BDM (${partnerBdmName}). Each credited ₹${partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-right">
              <span className="text-[10px] text-purple-200 block font-medium">Credited Share Per BDM</span>
              <span className="text-base font-black text-amber-300">₹{partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details & Subforms (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client & Company Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-5 border-b border-gray-100 pb-3 flex items-center justify-between">
              <span className="flex items-center">
                <Building2 size={18} className="mr-2 text-be-orange" />
                Client & Company Details
              </span>
              <span className="text-xs font-normal text-gray-400">Synchronized</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Client Info */}
              <div className="space-y-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-100 to-amber-50 text-be-orange border border-orange-200 flex items-center justify-center font-extrabold text-sm shrink-0 shadow-xs">
                    {initials}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-base">{clientName}</p>
                    <p className="text-xs text-gray-500 font-medium">Primary Contact Person</p>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm text-gray-700 bg-gray-50/70 p-3.5 rounded-xl border border-gray-100">
                  <p className="flex items-center">
                    <Phone size={15} className="mr-2.5 text-gray-400 shrink-0" />
                    {mobilePhone !== 'N/A' ? (
                      <a href={`tel:${mobilePhone}`} className="text-be-orange hover:underline font-mono font-medium">
                        {mobilePhone}
                      </a>
                    ) : (
                      <span className="text-gray-400 italic">No phone provided</span>
                    )}
                  </p>
                  <p className="flex items-center">
                    <Mail size={15} className="mr-2.5 text-gray-400 shrink-0" />
                    {emailAddress !== 'N/A' ? (
                      <a href={`mailto:${emailAddress}`} className="text-be-orange hover:underline font-medium break-all">
                        {emailAddress}
                      </a>
                    ) : (
                      <span className="text-gray-400 italic">No email provided</span>
                    )}
                  </p>
                  <p className="flex items-start">
                    <MapPin size={15} className="mr-2.5 text-gray-400 shrink-0 mt-0.5" />
                    <span className="text-gray-600 text-xs leading-relaxed">
                      {fullAddress !== 'N/A' ? fullAddress : 'Address not specified'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Company Info */}
              <div className="space-y-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-100 to-indigo-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold shrink-0 shadow-xs">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-base">{companyName}</p>
                    <p className="text-xs text-gray-500 font-medium">{businessType}</p>
                  </div>
                </div>
                <div className="space-y-2.5 text-xs text-gray-700 bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 font-medium">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">GSTIN:</span>
                    <span className="font-mono text-gray-900 font-bold uppercase">{gstin}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">PAN Card:</span>
                    <span className="font-mono text-gray-900 font-bold uppercase">{pan}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Aadhaar Card:</span>
                    <span className="font-mono text-gray-900 font-bold">{aadhaar}</span>
                  </div>
                  {raw.State && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">State:</span>
                      <span className="text-gray-800 font-semibold">{formatZohoValue(raw.State)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Services Subform (Choose Services) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3 mb-4 gap-2">
              <h2 className="text-base font-bold text-gray-900 flex items-center">
                <Layers size={18} className="mr-2 text-be-orange" />
                Services & Scheme Breakdown ({services.length})
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 bg-orange-50 text-be-orange rounded-full border border-orange-200">
                Subform_1
              </span>
            </div>
            
            <div className="border border-gray-100 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-gray-50/80 text-gray-600 font-semibold text-xs border-b border-gray-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Service / Scheme</th>
                      <th className="px-4 py-3 text-right">Without GST</th>
                      <th className="px-4 py-3 text-right">GST (18%)</th>
                      <th className="px-4 py-3 text-right">Total Agreement</th>
                      <th className="px-4 py-3 text-right">Received</th>
                      <th className="px-4 py-3 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {services.map((s: any, idx: number) => {
                      const totalNum = Number(s.totalAmount || 0);
                      const baseNum = Number(s.baseAmount || (totalNum > 0 ? (totalNum / 1.18).toFixed(2) : 0));
                      const gstNum = totalNum > baseNum ? Number((totalNum - baseNum).toFixed(2)) : Number((baseNum * 0.18).toFixed(2));
                      const isDealFullyPaid = totalAmountNum > 0 && receivedAmountNum >= totalAmountNum;
                      const stageStr = formatZohoValue(s.paymentStages || s.paymentType || '').toLowerCase();
                      const isServiceFullyPaid = isDealFullyPaid || stageStr.includes('full amount paid') || stageStr.includes('fully paid');
                      const recNum = isServiceFullyPaid ? totalNum : (s.receivedAmount ? Number(s.receivedAmount) : 0);
                      const pendNum = isServiceFullyPaid ? 0 : (s.pendingAmount ? Number(s.pendingAmount) : (totalNum > recNum ? totalNum - recNum : 0));

                      return (
                        <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-gray-900">{formatZohoValue(s.name || 'Website Development')}</div>
                            {Boolean((s.notes || s.remarks || s.remark || '').trim()) && (
                              <div className="text-xs text-gray-500 font-normal mt-0.5 italic">
                                {(s.notes || s.remarks || s.remark).trim()}
                              </div>
                            )}
                            {s.paymentStages && (
                              <div className="text-[11px] text-gray-400 mt-0.5">Stage: {formatZohoValue(s.paymentStages)} {s.paymentType ? `• ${formatZohoValue(s.paymentType)}` : ''}</div>
                            )}
                            {((s.amountAfterDisbursement !== undefined && s.amountAfterDisbursement !== '') || s.successFees) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {s.amountAfterDisbursement !== undefined && s.amountAfterDisbursement !== '' && (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                                    Disbursement: ₹{Number(s.amountAfterDisbursement).toLocaleString('en-IN')}
                                  </span>
                                )}
                                {s.successFees && (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-100">
                                    Success Fee: {s.successFees}%
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-gray-700">
                            ₹{baseNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-500 font-medium">
                            ₹{gstNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                            ₹{totalNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-bold ${splitBreakdown.isPaymentVerified ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {recNum > 0 ? `₹${recNum.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-orange-600">
                            {pendNum > 0 ? `₹${pendNum.toLocaleString('en-IN')}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50/70 font-bold border-t border-gray-200 text-gray-900">
                      <td className="px-4 py-3.5 text-gray-600">Grand Total</td>
                      <td className="px-4 py-3.5 text-right text-gray-700">₹{baseAmountNum.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-right text-gray-500">₹{gstAmountNum.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-right text-base text-gray-900">₹{totalAmountNum.toLocaleString('en-IN')}</td>
                      <td className={`px-4 py-3.5 text-right ${splitBreakdown.isPaymentVerified ? 'text-emerald-600' : 'text-rose-600'}`}>₹{receivedAmountNum.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-right text-orange-600">₹{pendingAmountNum.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Legal Details Subform (Row-wise Table View) */}
          {(legalSubformItems.length > 0 || shouldShowLegalSection) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3 mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900 flex items-center">
                    <ShieldCheck size={18} className="mr-2 text-indigo-600" />
                    Legal Details Subform ({legalSubformItems.length})
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                    Legal
                  </span>
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-gray-50/80 text-gray-600 font-semibold text-xs border-b border-gray-100 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 min-w-[160px]">Service / Scheme</th>
                        <th className="px-4 py-3 min-w-[190px]">Internal Team Type</th>
                        <th className="px-4 py-3 min-w-[210px]">Internal Legal Status</th>
                        <th className="px-4 py-3 min-w-[210px]">Types of Legal Documents</th>
                        <th className="px-4 py-3 min-w-[170px]">Agreement Terms</th>
                        <th className="px-4 py-3 min-w-[220px]">Remark</th>
                        {shouldShowLegalSection && (
                          <th className="px-4 py-3 text-right min-w-[80px]">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-800">
                      {legalSubformItems.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className="hover:bg-indigo-50/20 transition-colors">
                          {/* 1. Service / Scheme Name */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="font-bold text-gray-900 flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span>{formatZohoValue(item.schema || 'Service')}</span>
                            </div>
                            {item.tenure && (
                              <div className="text-[11px] text-gray-400 mt-0.5 ml-7">Tenure: {formatZohoValue(item.tenure)}</div>
                            )}
                          </td>

                          {/* 2. Internal Team Type Dropdown */}
                          <td className="px-4 py-3.5 align-middle">
                            {shouldShowLegalSection ? (
                              <select
                                value={item.internalTeamType || ''}
                                onChange={(e) => {
                                  const newItems = [...legalSubformItems];
                                  newItems[idx] = { ...newItems[idx], internalTeamType: e.target.value };
                                  setLegalSubformItems(newItems);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-indigo-500 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-2xs"
                              >
                                <option value="">Select Team Type...</option>
                                {INTERNAL_TEAM_TYPES.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs font-semibold text-gray-800">{formatZohoValue(item.internalTeamType || '—')}</span>
                            )}
                          </td>

                          {/* 3. Internal Legal Status Dropdown */}
                          <td className="px-4 py-3.5 align-middle">
                            {shouldShowLegalSection ? (
                              <select
                                value={item.legalStatus || ''}
                                onChange={(e) => {
                                  const newItems = [...legalSubformItems];
                                  newItems[idx] = { ...newItems[idx], legalStatus: e.target.value };
                                  setLegalSubformItems(newItems);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-indigo-500 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-2xs"
                              >
                                <option value="">Select Legal Status...</option>
                                {INTERNAL_LEGAL_STATUSES.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs font-semibold text-gray-800">{formatZohoValue(item.legalStatus || '—')}</span>
                            )}
                          </td>

                          {/* 4. Types of Legal Documents Dropdown */}
                          <td className="px-4 py-3.5 align-middle">
                            {shouldShowLegalSection ? (
                              <select
                                value={item.docTypes || ''}
                                onChange={(e) => {
                                  const newItems = [...legalSubformItems];
                                  newItems[idx] = { ...newItems[idx], docTypes: e.target.value };
                                  setLegalSubformItems(newItems);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-indigo-500 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-2xs"
                              >
                                <option value="">Select Document Type...</option>
                                {LEGAL_DOC_TYPES.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs font-semibold text-gray-800">{formatZohoValue(item.docTypes || '—')}</span>
                            )}
                          </td>

                          {/* 5. Agreement Terms Dropdown */}
                          <td className="px-4 py-3.5 align-middle">
                            {shouldShowLegalSection ? (
                              <select
                                value={item.terms1 || item.agreementTerms || ''}
                                onChange={(e) => {
                                  const newItems = [...legalSubformItems];
                                  newItems[idx] = { ...newItems[idx], terms1: e.target.value };
                                  setLegalSubformItems(newItems);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-indigo-500 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer shadow-2xs"
                              >
                                <option value="">Select Terms...</option>
                                {AGREEMENT_TERMS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs font-semibold text-gray-800">{formatZohoValue(item.terms1 || '—')}</span>
                            )}
                          </td>

                          {/* 6. Remark Input */}
                          <td className="px-4 py-3.5 align-middle">
                            {shouldShowLegalSection ? (
                              <input
                                type="text"
                                value={item.remark || ''}
                                onChange={(e) => {
                                  const newItems = [...legalSubformItems];
                                  newItems[idx] = { ...newItems[idx], remark: e.target.value };
                                  setLegalSubformItems(newItems);
                                }}
                                placeholder="Enter remark..."
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 focus:border-indigo-500 rounded-lg text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
                              />
                            ) : (
                              <span className="text-xs text-gray-600 italic">{formatZohoValue(item.remark || '—')}</span>
                            )}
                          </td>

                          {/* 7. Action / Delete Button */}
                          {shouldShowLegalSection && (
                            <td className="px-4 py-3.5 align-middle text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveLegalSubformRow(idx)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Service from Legal Details"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit Action Bar at the bottom of the Legal Subform table */}
              {shouldShowLegalSection && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 p-4 rounded-b-2xl">
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <span>Fill in internal team, legal status, document types & terms, then click <strong>Submit</strong> to update the record.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveLegalSubform(false)}
                    disabled={isSavingLegalSubform || isActionInProgress}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg active:scale-[0.99] transition-all disabled:opacity-50 w-full sm:w-auto cursor-pointer"
                  >
                    {isSavingLegalSubform ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-white" />
                        <span>Submitting Legal Details...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="text-white" />
                        <span>Submit Legal Details</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Internal Operations Sub-Child Module Section */}
          {!isSalesDeptUser && (
            <div className="mt-6">
              <InternalOperationsAllocationTable
                deal={deal}
                mode="deal"
                onProceedToExecutors={handleSendToOperationsExecutors}
                canProceedToExecutors={String(deal?.stage || deal?.Stage || '').toLowerCase().includes('allocat')}
              />
            </div>
          )}

          {/* Operations & Team Allocation Card */}
          {(raw.Operation_stages || raw.Operation_team_leader || raw.Operation_team_member || raw.Quality_team_leader || raw.Quality_team_member || raw.Data_check_employee || raw.DPR_creator || raw.Finance_creator) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3 flex items-center justify-between">
                <span className="flex items-center">
                  <Briefcase size={18} className="mr-2 text-be-orange" />
                  Operations & Team Assignment
                </span>
                {raw.Operation_stages && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                    {formatZohoValue(raw.Operation_stages)}
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {raw.Operation_team_leader && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Ops Team Leader</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.Operation_team_leader)}</span>
                  </div>
                )}
                {raw.Operation_team_member && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Ops Team Member</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.Operation_team_member)}</span>
                  </div>
                )}
                {(raw.Project_assign_Date || raw.Projects_assign_date) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Project Assign Date</span>
                    <span className="font-semibold text-gray-800">{new Date(raw.Project_assign_Date || raw.Projects_assign_date).toLocaleDateString('en-GB')}</span>
                  </div>
                )}
                {raw.Quality_team_leader && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Quality TL</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.Quality_team_leader)}</span>
                  </div>
                )}
                {(raw.Quality_team_member || raw.Quality_team_mdember) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Quality Member</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.Quality_team_member || raw.Quality_team_mdember)}</span>
                  </div>
                )}
                {raw.Query_by_name && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Query Handled By</span>
                    <span className="font-semibold text-gray-800">{formatZohoValue(raw.Query_by_name)}</span>
                  </div>
                )}
                {(raw.Data_check_employee || raw.Data_checker_name || raw.Data_check_employee1) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Data Checker</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.Data_check_employee || raw.Data_checker_name || raw.Data_check_employee1)}</span>
                    {raw.Date_checker_status && <span className="text-[10px] text-emerald-600 block mt-0.5">Status: {formatZohoValue(raw.Date_checker_status)}</span>}
                  </div>
                )}
                {raw.DPR_creator && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">DPR Creator</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.DPR_creator)}</span>
                    {raw.DPR_status && <span className="text-[10px] text-blue-600 block mt-0.5">DPR: {formatZohoValue(raw.DPR_status)}</span>}
                  </div>
                )}
                {raw.Finance_creator && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Finance Creator</span>
                    <span className="font-bold text-gray-900">{formatZohoValue(raw.Finance_creator)}</span>
                    {raw.Finance_date && <span className="text-[10px] text-gray-500 block mt-0.5">{new Date(raw.Finance_date).toLocaleDateString('en-GB')}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legal & Compliance Stages Card */}
          {(raw.Internal_legal_status || raw.LLP_stages || raw.LLP_Finance_stages || raw.LLP_application_stages || raw.LLP_DSC_KYC_stages || raw.Legal_documents_sender_name || raw.Legal_documents_receiver_name || raw.Legal_date) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3 flex items-center justify-between">
                <span className="flex items-center">
                  <ShieldCheck size={18} className="mr-2 text-indigo-600" />
                  Legal & Handover Status
                </span>
                {raw.Internal_legal_status && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                    {formatZohoValue(raw.Internal_legal_status)}
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {raw.Legal_date && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Legal Date:</span>
                    <span className="font-semibold text-gray-900">{new Date(raw.Legal_date).toLocaleDateString('en-GB')}</span>
                  </div>
                )}
                {raw.LLP_stages && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Doc Collection:</span>
                    <span className="font-semibold text-gray-900">{formatZohoValue(raw.LLP_stages)}</span>
                  </div>
                )}
                {raw.LLP_Finance_stages && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Pvt / LLP Stage:</span>
                    <span className="font-semibold text-gray-900">{formatZohoValue(raw.LLP_Finance_stages)}</span>
                  </div>
                )}
                {raw.LLP_application_stages && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Application Stage:</span>
                    <span className="font-semibold text-gray-900">{formatZohoValue(raw.LLP_application_stages)}</span>
                  </div>
                )}
                {(raw.Legal_documents_sender_name || raw.Employee_name_sent1 || raw.Employee_name_sent) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Docs Sent By:</span>
                    <span className="font-semibold text-gray-900">{formatZohoValue(raw.Legal_documents_sender_name || raw.Employee_name_sent1 || raw.Employee_name_sent)}</span>
                  </div>
                )}
                {(raw.Legal_documents_receiver_name || raw.Employee_name_received1 || raw.Employee_name_received) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Docs Received By:</span>
                    <span className="font-semibold text-gray-900">{formatZohoValue(raw.Legal_documents_receiver_name || raw.Employee_name_received1 || raw.Employee_name_received)}</span>
                  </div>
                )}
                {raw.Legal_documents_received_date && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Docs Received Date:</span>
                    <span className="font-semibold text-gray-900">{new Date(raw.Legal_documents_received_date).toLocaleDateString('en-GB')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Rounds & Installment Cycles (R1 to R8) */}
          {(() => {
            const milestones = getDealMilestones(deal);
            const recordedMilestones = milestones.filter(m => m.hasPayment);
            const hasLegacyRounds = Boolean(raw.R1 || raw.R1_Received_Amount || raw.R2 || raw.R2_Received_Amount || raw.Remaining_1 || raw.Remaining_2);

            if (recordedMilestones.length === 0 && !hasLegacyRounds) return null;

            return (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-orange-50 rounded-xl text-be-orange">
                      <Receipt size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">Installment Rounds & Payment Cycles</h2>
                      <p className="text-xs text-gray-400">Recorded milestone payments and verification under BSPL / BSAPL</p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    {Boolean(raw.Remaining_1) && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-semibold">Remaining 1</span>}
                    {Boolean(raw.Remaining_2) && <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-md font-semibold">Remaining 2</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  {recordedMilestones.map((m: DealMilestoneItem) => {
                    const currentBank = detailsBankSelections[m.index] || m.bankType || '';
                    const isVerifying = verifyingDetailsMilestone === m.index;

                    return (
                      <div key={m.index} className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-gray-900">{m.label}</span>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                m.isVerified 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                  : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}>
                                Acc: {m.isVerified ? 'Verified' : 'Pending'}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                m.isLegalVerified 
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                Legal: {m.isLegalVerified ? 'Verified' : 'Pending'}
                              </span>
                            </div>
                          </div>

                          <div className={`text-base font-bold ${m.isVerified && m.isLegalVerified ? 'text-emerald-600' : 'text-gray-900'}`}>
                            ₹{m.amount.toLocaleString('en-IN')}
                          </div>

                          {m.date && (
                            <div className="text-gray-500">
                              Date: <span className="font-medium text-gray-800">{m.date}</span>
                            </div>
                          )}

                          {m.bdm1 && (
                            <div className="text-gray-500">
                              BDM 1: <span className="font-medium text-gray-800">{m.bdm1}</span>
                            </div>
                          )}

                          {m.bdm2 && (
                            <div className="text-gray-500">
                              BDM 2: <span className="font-medium text-purple-700">{m.bdm2}</span>
                            </div>
                          )}

                          {/* Screenshot */}
                          <div className="pt-1">
                            {m.screenshot ? (
                              <button
                                type="button"
                                onClick={() => handleViewMilestoneScreenshot(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold border border-blue-200 transition-colors cursor-pointer"
                                title={`View screenshot: ${m.screenshot}`}
                              >
                                <ImageIcon size={12} />
                                <span className="max-w-[120px] truncate">{m.screenshot}</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic">No screenshot attached</span>
                            )}
                          </div>
                        </div>

                        {/* 1. Accounts Verification Section */}
                        <div className="pt-2.5 mt-2 border-t border-gray-200/80 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                                <Building2 size={12} className="text-be-orange" />
                                Accounts
                              </span>
                              <span className="text-[9px] text-gray-400 font-mono">
                                R{m.index}_Bank_type
                              </span>
                            </div>
                            {(isAccounts || isSuperAdmin) ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={currentBank}
                                  disabled={isVerifying}
                                  onChange={(e) => {
                                    const val = e.target.value as 'BSPL' | 'BSAPL' | '';
                                    setDetailsBankSelections(prev => ({ ...prev, [m.index]: val }));
                                  }}
                                  className="px-2 py-1 bg-white border border-gray-300 rounded-md text-xs font-bold text-gray-800 outline-none focus:border-be-orange focus:ring-1 focus:ring-be-orange transition-all shadow-xs"
                                  title={`Zoho CRM Pick List field: R${m.index}_Bank_type`}
                                >
                                  <option value="">None</option>
                                  <option value="BSPL">BSPL</option>
                                  <option value="BSAPL">BSAPL</option>
                                </select>
                                {currentBank !== (m.bankType || '') && (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveDetailsMilestoneBank(m.index, currentBank)}
                                    disabled={isVerifying}
                                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
                                    title={`Save R${m.index}_Bank_type as ${currentBank || 'None'} in Zoho CRM`}
                                  >
                                    Save Bank
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-white border border-gray-200 rounded text-[11px] font-bold text-gray-700">
                                {m.bankType || 'None'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-0.5">
                            {(isAccounts || isSuperAdmin) ? (
                              m.isVerified ? (
                                <div className="w-full flex items-center justify-between">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                    <CheckCircle2 size={13} className="text-emerald-600" />
                                    Verified ({m.bankType || currentBank})
                                  </span>
                                  {currentBank !== (m.bankType || 'BSPL') && (
                                    <button
                                      type="button"
                                      onClick={() => handleVerifyDetailsMilestone(m.index, currentBank)}
                                      disabled={isVerifying}
                                      className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                      Re-verify
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyDetailsMilestone(m.index, currentBank)}
                                  disabled={isVerifying}
                                  className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  {isVerifying ? (
                                    <>
                                      <Loader2 size={12} className="animate-spin" />
                                      Verifying...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 size={12} />
                                      Verify Accounts Payment
                                    </>
                                  )}
                                </button>
                              )
                            ) : (
                              m.isVerified ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                  <CheckCircle2 size={13} className="text-emerald-600" />
                                  Accounts Verified ({m.bankType || 'BSPL'})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                                  <Clock size={13} className="text-amber-500" />
                                  Accounts Pending
                                </span>
                              )
                            )}
                          </div>
                        </div>

                        {/* 2. Legal Verification Section */}
                        <div className="pt-2 mt-2 border-t border-gray-100 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                              <ShieldCheck size={12} className="text-indigo-600" />
                              Legal Verification
                            </span>
                            <span className="text-[9px] text-gray-400 font-mono">
                              R{m.index}_Legal_verification
                            </span>
                          </div>

                          {(isLegal || isSuperAdmin) ? (
                            m.isLegalVerified ? (
                              <div className="w-full flex items-center justify-between py-1 px-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                                  <CheckCircle2 size={13} className="text-indigo-600" />
                                  Legal Verified
                                </span>
                                {isSuperAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyDetailsLegal(m.index, false)}
                                    disabled={verifyingDetailsLegal === m.index}
                                    className="text-[10px] text-gray-400 hover:text-rose-600 underline font-medium transition-colors cursor-pointer"
                                    title="Reset Legal verification"
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleVerifyDetailsLegal(m.index, true)}
                                disabled={verifyingDetailsLegal === m.index}
                                className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                              >
                                {verifyingDetailsLegal === m.index ? (
                                  <>
                                    <Loader2 size={12} className="animate-spin" />
                                    Verifying Legal...
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck size={12} />
                                    Verify Legal
                                  </>
                                )}
                              </button>
                            )
                          ) : (
                            m.isLegalVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                                <CheckCircle2 size={13} className="text-indigo-600" />
                                Legal Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                <Clock size={13} className="text-slate-400" />
                                Legal Pending
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Refund & Reassignment Card */}
          {(raw.Refund || raw.Refund_amount || raw.Reassignment_Reason || raw.Reason_for_complimentary || raw.Reason_For_Loss__s) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center">
                <AlertTriangle size={18} className="mr-2 text-rose-500" />
                Refunds & Case Exceptions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {(raw.Refund || raw.Refund_amount) && (
                  <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-100 text-rose-900 space-y-1">
                    <span className="font-bold block">Refund Processed:</span>
                    {raw.Refund_amount && <div className="text-base font-bold text-rose-700">₹{Number(raw.Refund_amount).toLocaleString('en-IN')}</div>}
                    {raw.Refund_date && <div className="text-gray-600">Date: {new Date(raw.Refund_date).toLocaleDateString('en-GB')}</div>}
                  </div>
                )}
                {raw.Reassignment_Reason && (
                  <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-100 space-y-1">
                    <span className="font-bold text-gray-900 block">Quality Reassignment:</span>
                    <p className="text-gray-700">{formatZohoValue(raw.Reassignment_Reason)}</p>
                  </div>
                )}
                {raw.Reason_for_complimentary && (
                  <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100 space-y-1">
                    <span className="font-bold text-purple-900 block">Complimentary Reason:</span>
                    <p className="text-gray-700">{formatZohoValue(raw.Reason_for_complimentary)}</p>
                  </div>
                )}
                {raw.Reason_For_Loss__s && (
                  <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-100 space-y-1">
                    <span className="font-bold text-rose-600 block">Reason for Loss:</span>
                    <p className="text-gray-800 font-semibold">{formatZohoValue(raw.Reason_For_Loss__s)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Queries & Reminders Card */}
          {(raw.Status_qd || raw.Date_qd || raw.Reminder_1_date || raw.Reminder_2_date || raw.Reminder_3_date) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center">
                <Bell size={18} className="mr-2 text-be-orange" />
                Queries & Scheduled Reminders
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {(raw.Status_qd || raw.Date_qd) && (
                  <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-1">
                    <span className="text-gray-400 block">Query Info</span>
                    {raw.Status_qd && <div className="font-semibold text-gray-900">Status: {formatZohoValue(raw.Status_qd)}</div>}
                    {raw.Date_qd && <div className="text-gray-500">Date: {new Date(raw.Date_qd).toLocaleDateString('en-GB')}</div>}
                  </div>
                )}
                <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-1">
                  <span className="text-gray-400 block">Follow-up Reminders</span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {raw.Reminder_1_date && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">R1: {new Date(raw.Reminder_1_date).toLocaleDateString('en-GB')}</span>}
                    {raw.Reminder_2_date && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">R2: {new Date(raw.Reminder_2_date).toLocaleDateString('en-GB')}</span>}
                    {raw.Reminder_3_date && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">R3: {new Date(raw.Reminder_3_date).toLocaleDateString('en-GB')}</span>}
                    {raw.Reminder_4_date && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">R4: {new Date(raw.Reminder_4_date).toLocaleDateString('en-GB')}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Remarks & Notes Card */}
          {(raw.Accounts_remark || raw.Customer_update || raw.Google_remark || raw.Google_review || raw.Google_reviews || raw.Description || raw.Remark || raw.remark || raw.Q_Notes || raw.q_notes || raw.Notes || raw.notes || deal?.Q_Notes || deal?.q_notes || deal?.notes || deal?.Notes || deal?.remark || deal?.Remark || fd.Q_Notes || fd.q_notes || fd.notes || fd.Notes || fd.remark || fd.Remark) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center">
                <FileText size={18} className="mr-2 text-be-orange" />
                Remarks & Activity Updates
              </h2>
              <div className="space-y-3 text-xs">
                {Boolean(raw.Q_Notes || raw.q_notes || raw.Notes || raw.notes || deal?.Q_Notes || deal?.q_notes || deal?.notes || deal?.Notes || fd.Q_Notes || fd.q_notes || fd.notes || fd.Notes) && (
                  <div className="p-3 bg-orange-50/70 rounded-xl border border-orange-200 text-orange-950">
                    <span className="font-bold block mb-1 text-orange-900 flex items-center">
                      <FileText size={13} className="mr-1.5 text-orange-600" />
                      Notes / Quotation Instructions:
                    </span>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{formatZohoValue(raw.Q_Notes || raw.q_notes || raw.Notes || raw.notes || deal?.Q_Notes || deal?.q_notes || deal?.notes || deal?.Notes || fd.Q_Notes || fd.q_notes || fd.notes || fd.Notes)}</p>
                  </div>
                )}
                {raw.Accounts_remark && (
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 text-amber-900">
                    <span className="font-bold block mb-1">Accounts Remark:</span>
                    <p className="text-gray-700 leading-relaxed">{formatZohoValue(raw.Accounts_remark)}</p>
                  </div>
                )}
                {raw.Customer_update && (
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-blue-900">
                    <span className="font-bold block mb-1">Customer Update:</span>
                    <p className="text-gray-700 leading-relaxed">{formatZohoValue(raw.Customer_update)}</p>
                  </div>
                )}
                {(raw.Google_remark || raw.Google_review || raw.Google_reviews) && (
                  <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-emerald-900">
                    <span className="font-bold block mb-1">Google Review / Feedback:</span>
                    <p className="text-gray-700 leading-relaxed">{formatZohoValue(raw.Google_review || raw.Google_reviews || raw.Google_remark)}</p>
                  </div>
                )}
                {(() => {
                  const remVal = raw.Remark || raw.remark || deal?.remark || deal?.Remark || fd.remark || fd.Remark;
                  const noteVal = raw.Q_Notes || raw.q_notes || raw.Notes || raw.notes || deal?.Q_Notes || deal?.q_notes || deal?.notes || deal?.Notes || fd.Q_Notes || fd.q_notes || fd.notes || fd.Notes;
                  if (!remVal) return null;
                  if (noteVal && String(remVal).trim() === String(noteVal).trim()) return null;
                  return (
                    <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 text-gray-800">
                      <span className="font-bold block mb-1 text-gray-900">Remark:</span>
                      <p className="text-gray-600 leading-relaxed">{formatZohoValue(remVal)}</p>
                    </div>
                  );
                })()}
                {(() => {
                  const descVal = raw.Description;
                  const noteVal = raw.Q_Notes || raw.q_notes || raw.Notes || raw.notes || deal?.Q_Notes || deal?.q_notes || deal?.notes || deal?.Notes || fd.Q_Notes || fd.q_notes || fd.notes || fd.Notes;
                  const remVal = raw.Remark || raw.remark || deal?.remark || deal?.Remark || fd.remark || fd.Remark;
                  if (!descVal) return null;
                  if (noteVal && String(descVal).trim() === String(noteVal).trim()) return null;
                  if (remVal && String(descVal).trim() === String(remVal).trim()) return null;
                  return (
                    <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 text-gray-800">
                      <span className="font-bold block mb-1 text-gray-900">Description:</span>
                      <p className="text-gray-600 leading-relaxed">{formatZohoValue(descVal)}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Documents & Attachments Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-be-orange">
                  <Paperclip size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    Deal Documents & Attachments
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-be-orange">
                      {zohoAttachments.length + (deal.documentsData?.length || 0)}
                    </span>
                  </h2>
                  <p className="text-[11px] text-gray-400">Live synchronized with deal attachments</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  id="deal-doc-upload"
                />
                <button
                  type="button"
                  disabled={isUploadingAttachment}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-be-orange hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
                  title="Upload new file to this deal"
                >
                  {isUploadingAttachment ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetZohoId = deal?.zohoId || (id && /^\d+$/.test(id) ? id : null);
                    if (targetZohoId) loadAttachments(targetZohoId);
                  }}
                  disabled={loadingAttachments}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                  title="Refresh attachments"
                >
                  <RefreshCw size={14} className={loadingAttachments ? 'animate-spin text-be-orange' : ''} />
                </button>
              </div>
            </div>

            {/* Upload status toast */}
            {uploadToast && (
              <div className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between transition-all ${
                uploadToast.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                <div className="flex items-center gap-2">
                  {uploadToast.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
                  <span>{uploadToast.message}</span>
                </div>
                <button onClick={() => setUploadToast(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Loading Skeleton */}
            {loadingAttachments && zohoAttachments.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
                {[1, 2].map((i) => (
                  <div key={i} className="p-3.5 border border-gray-100 rounded-xl bg-gray-50 animate-pulse flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (zohoAttachments.length > 0 || (deal.documentsData && deal.documentsData.length > 0)) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Zoho CRM Attachments */}
                {zohoAttachments.map((att: any) => {
                  const fileName = att.File_Name || 'Attachment';
                  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
                  const isPdf = ext === 'PDF';
                  const isImg = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'SVG'].includes(ext);
                  const isExcel = ['XLS', 'XLSX', 'CSV'].includes(ext);
                  const isDoc = ['DOC', 'DOCX', 'TXT'].includes(ext);
                  const sizeNum = Number(att.Size) || 0;
                  const sizeText = sizeNum > 0 ? (sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(2)} MB`) : '';
                  const uploadDate = att.Created_Time ? new Date(att.Created_Time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                  const uploader = att.Created_By?.name || 'CRM';
                  const targetZohoId = deal?.zohoId || (id && /^\d+$/.test(id) ? id : '');
                  const directUrl = targetZohoId ? getZohoAttachmentDownloadUrl('Deals', targetZohoId, att.id, false) : '#';

                  return (
                    <div 
                      key={att.id}
                      className="group relative flex items-center p-3.5 border border-gray-200/80 rounded-xl hover:border-orange-200 hover:shadow-md transition-all bg-white hover:bg-orange-50/20"
                    >
                      {/* Icon badge */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mr-3 font-extrabold text-[11px] shrink-0 shadow-xs border ${
                        isPdf ? 'bg-rose-50 text-rose-600 border-rose-100' :
                        isImg ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        isExcel ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        isDoc ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-purple-50 text-purple-600 border-purple-100'
                      }`}>
                        {ext.slice(0, 4)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-bold text-gray-900 truncate group-hover:text-be-orange transition-colors" title={fileName}>
                          {fileName}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                          {sizeText && <span className="font-semibold text-gray-600">{sizeText}</span>}
                          {uploadDate && (
                            <>
                              <span>•</span>
                              <span>{uploadDate}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="truncate max-w-[90px] text-gray-500">{uploader}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
                            <Cloud size={10} className="mr-1" /> Cloud
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handlePreviewZohoAttachment(att)}
                          className="p-1.5 text-gray-400 hover:text-be-orange hover:bg-orange-100/50 rounded-lg transition-colors"
                          title="Preview Document"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDownloadZoho(att, e)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Download File"
                        >
                          <Download size={15} />
                        </button>
                        <a
                          href={directUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>
                  );
                })}

                {/* 2. Local BE Portal Documents (IndexedDB) */}
                {deal.documentsData && deal.documentsData.map((doc: any, idx: number) => {
                  const ext = (doc.name ?? '').split('.').pop()?.toUpperCase() || 'FILE';
                  const isPdf = ext === 'PDF';
                  const isImg = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'SVG'].includes(ext);
                  const isExcel = ['XLS', 'XLSX', 'CSV'].includes(ext);
                  const isDoc = ['DOC', 'DOCX', 'TXT'].includes(ext);
                  const sizeNum = Number(doc.size) || 0;
                  const sizeText = sizeNum > 0 ? (sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(2)} MB`) : '';

                  return (
                    <div 
                      key={`local-${idx}`}
                      className="group relative flex items-center p-3.5 border border-gray-200/80 rounded-xl hover:border-orange-200 hover:shadow-md transition-all bg-white hover:bg-orange-50/20"
                    >
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mr-3 font-extrabold text-[11px] shrink-0 shadow-xs border ${
                        isPdf ? 'bg-rose-50 text-rose-600 border-rose-100' :
                        isImg ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        isExcel ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        isDoc ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-purple-50 text-purple-600 border-purple-100'
                      }`}>
                        {ext.slice(0, 4)}
                      </div>

                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-bold text-gray-900 truncate group-hover:text-be-orange transition-colors" title={doc.name}>
                          {doc.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                          {sizeText && <span className="font-semibold text-gray-600">{sizeText}</span>}
                          <span>•</span>
                          <span className="text-gray-500">Local Upload</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                            <HardDrive size={10} className="mr-1" /> BE Portal
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handlePreviewLocalDoc(doc)}
                          className="p-1.5 text-gray-400 hover:text-be-orange hover:bg-orange-100/50 rounded-lg transition-colors"
                          title="Preview Document"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Download File"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 px-4 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-be-orange mx-auto">
                  <Cloud size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-700">No attachments found for this deal</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Upload invoices, payment proofs, agreements, or PAN/GST certificates.</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-gray-200 hover:border-be-orange text-gray-700 hover:text-be-orange text-xs font-bold rounded-xl transition-all shadow-xs"
                >
                  <Upload size={14} />
                  <span>Upload Deal Document</span>
                </button>
              </div>
            )}
          </div>

          {/* Dedicated Legal Documents Handover & Reminders Section (Visible to Legal Department / Legal Stage) */}
          {shouldShowLegalSection && (
            <div id="legal-handover-section" className="bg-white rounded-2xl border border-blue-100/90 shadow-sm overflow-hidden transition-all">
              {/* Card Header */}
              <div className="p-5 bg-gradient-to-r from-blue-50/90 via-slate-50 to-indigo-50/80 border-b border-blue-100/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                    <Scale size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-gray-900">Legal Documents Handover & Follow-Up Reminders</h2>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        Legal Department
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Record dispatch and receipt details, configure client follow-up reminder milestones, and forward to Allocators.
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-6 space-y-6">
                {/* 1. Legal Document Handover Details */}
                <div>
                  <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-gray-100">
                    <FileCheck2 size={16} className="text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Legal Document Handover Information</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Field 1: Legal documents sender name */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <User size={13} className="text-blue-500" />
                        <span>Legal documents sender name</span>
                      </label>
                      <input
                        type="text"
                        value={legalHandoverData.legalDocsSenderName}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, legalDocsSenderName: e.target.value }))}
                        placeholder="Enter sender's full name"
                        className="w-full px-3.5 py-2.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>

                    {/* Field 2: Legal documents sender date */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <Calendar size={13} className="text-blue-500" />
                        <span>Legal documents sender date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.legalDocsSenderDate}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, legalDocsSenderDate: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>

                    {/* Field 3: Legal documents receiver name */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <UserCheck size={13} className="text-blue-500" />
                        <span>Legal documents receiver name</span>
                      </label>
                      <input
                        type="text"
                        value={legalHandoverData.legalDocsReceiverName}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, legalDocsReceiverName: e.target.value }))}
                        placeholder="Enter receiver's full name"
                        className="w-full px-3.5 py-2.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>

                    {/* Field 4: Legal documents received date */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <Calendar size={13} className="text-blue-500" />
                        <span>Legal documents received date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.legalDocsReceivedDate}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, legalDocsReceivedDate: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Follow-Up Reminders Subsection */}
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-gray-100">
                    <Bell size={16} className="text-amber-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Follow-Up Reminder Dates</h3>
                    <span className="text-[10px] text-gray-400 font-normal ml-auto">5 Reminder Milestones</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Reminder-1 date */}
                    <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/60">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">1</span>
                        <span>Reminder-1 date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.reminder1Date}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, reminder1Date: e.target.value }))}
                        className="w-full px-2.5 py-2 bg-white border border-gray-200 focus:border-amber-500 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                      />
                    </div>

                    {/* Reminder-2 date */}
                    <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/60">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">2</span>
                        <span>Reminder-2 date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.reminder2Date}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, reminder2Date: e.target.value }))}
                        className="w-full px-2.5 py-2 bg-white border border-gray-200 focus:border-amber-500 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                      />
                    </div>

                    {/* Reminder-3 date */}
                    <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/60">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">3</span>
                        <span>Reminder-3 date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.reminder3Date}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, reminder3Date: e.target.value }))}
                        className="w-full px-2.5 py-2 bg-white border border-gray-200 focus:border-amber-500 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                      />
                    </div>

                    {/* Reminder-4 date */}
                    <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/60">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">4</span>
                        <span>Reminder-4 date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.reminder4Date}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, reminder4Date: e.target.value }))}
                        className="w-full px-2.5 py-2 bg-white border border-gray-200 focus:border-amber-500 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                      />
                    </div>

                    {/* Reminder-5 date */}
                    <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/60">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">5</span>
                        <span>Reminder-5 date</span>
                      </label>
                      <input
                        type="date"
                        value={legalHandoverData.reminder5Date}
                        onChange={(e) => setLegalHandoverData(prev => ({ ...prev, reminder5Date: e.target.value }))}
                        className="w-full px-2.5 py-2 bg-white border border-gray-200 focus:border-amber-500 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Banner with Actions */}
              <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                {isLegalStage ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Info size={14} className="text-blue-500 shrink-0" />
                    <span>
                      Saving stores data locally and syncs to Zoho CRM. Forwarding executes Blueprint Transition to <strong>Operations Allocator</strong>.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50/80 border border-emerald-200/80 px-3 py-1.5 rounded-xl font-medium">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>
                      Deal has already been forwarded to <strong>{deal.stage || raw.Stage || 'Operations Allocator'}</strong> stage. You can edit and save legal details anytime.
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleSaveLegalHandover(false)}
                    disabled={isSavingLegalHandover || isActionInProgress}
                    className="px-3.5 py-2 text-gray-700 hover:text-gray-900 font-bold bg-white border border-gray-200 hover:border-gray-300 rounded-xl shadow-xs transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Save size={13} />
                    <span>{isLegalStage ? 'Save Draft' : 'Save Legal Details'}</span>
                  </button>
                  {isLegalStage ? (
                    <button
                      type="button"
                      onClick={handleSendToOperationsAllocator}
                      disabled={isActionInProgress || isSavingLegalHandover}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isActionInProgress ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      <span>Send to Operations Allocator</span>
                    </button>
                  ) : (
                    <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200/80 text-emerald-700 font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-default">
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>Forwarded to Allocator</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Financials & Tracking (1 Col) */}
        <div className="space-y-6">
          {/* Financial Summary Card */}
          {(() => {
            const isSidebarAccountsStage = (deal.stage || raw.Stage || deal.status || '').toLowerCase().includes('account');
            return (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <IndianRupee size={18} className="mr-2 text-be-orange" /> 
              Financial Summary
            </h2>

            {/* Total Value */}
            <div className="p-4 bg-gradient-to-br from-gray-900 to-slate-800 text-white rounded-2xl shadow-md space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-300">
                <span>Total Deal Value</span>
                <span className="font-semibold text-amber-400">Incl. 18% GST</span>
              </div>
              <div className="text-2xl font-black tracking-tight">
                ₹{totalAmountNum.toLocaleString('en-IN')}
              </div>
              <div className="pt-2 border-t border-slate-700/60 flex justify-between text-[11px] text-slate-300">
                <span>Base: ₹{baseAmountNum.toLocaleString('en-IN')}</span>
                <span>GST: ₹{gstAmountNum.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-600">Payment Collection</span>
                <span className={splitBreakdown.isPaymentVerified ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                  {percentReceived}% {splitBreakdown.isPaymentVerified ? '' : isSidebarAccountsStage ? '(Pending Verif.)' : ''}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-500 ${splitBreakdown.isPaymentVerified ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-rose-500 to-amber-500'}`}
                  style={{ width: `${percentReceived}%` }}
                />
              </div>
            </div>

            {/* Received & Pending Widgets */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3.5 rounded-xl border space-y-1 ${splitBreakdown.isPaymentVerified ? 'bg-emerald-50/80 border-emerald-100 text-emerald-800' : 'bg-rose-50/80 border-rose-100 text-rose-800'}`}>
                <div className={`flex items-center text-xs font-semibold ${splitBreakdown.isPaymentVerified ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {splitBreakdown.isPaymentVerified ? <CheckCircle2 size={13} className="mr-1.5 text-emerald-600" /> : <AlertTriangle size={13} className="mr-1.5 text-rose-500" />}
                  Received Payment
                </div>
                <div className={`text-base font-bold ${splitBreakdown.isPaymentVerified ? 'text-emerald-700' : 'text-rose-600'}`}>
                  ₹{receivedAmountNum.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] font-bold">
                  {splitBreakdown.isPaymentVerified ? (
                    <span className="text-emerald-700 flex items-center"><CheckCircle2 size={10} className="mr-0.5" /> Verified by Accounts</span>
                  ) : isSidebarAccountsStage ? (
                    <span className="text-rose-600 flex items-center"><Clock size={10} className="mr-0.5" /> Pending Verification</span>
                  ) : (
                    <span className="text-gray-500 flex items-center">Unverified</span>
                  )}
                </div>
              </div>

              <div className={`p-3.5 rounded-xl border space-y-1 ${pendingAmountNum === 0 ? 'bg-gray-50/80 border-gray-200 text-gray-700' : 'bg-orange-50/80 border-orange-100 text-orange-800'}`}>
                <div className={`flex items-center text-xs font-semibold ${pendingAmountNum === 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                  {pendingAmountNum === 0 ? <CheckCircle2 size={13} className="mr-1.5 text-emerald-600" /> : <Clock size={13} className="mr-1.5" />}
                  Pending
                </div>
                <div className={`text-base font-bold ${pendingAmountNum === 0 ? 'text-emerald-700' : ''}`}>
                  ₹{pendingAmountNum.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Payment Screenshots Card (Zoho CRM Field: Deal_payment_screenshot) */}
            <div className="p-3.5 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 rounded-xl border border-emerald-100 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-emerald-100/70 pb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <ImageIcon size={12} />
                  </div>
                  <span className="text-xs font-bold text-gray-900">Payment Screenshots</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full">
                    {dealPaymentScreenshots.length}
                  </span>
                </div>
                <span className="text-[9px] font-mono font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                  Deal_payment_screenshot
                </span>
              </div>

              {dealPaymentScreenshots.length > 0 ? (
                <div className="space-y-2">
                  <div className={`grid ${dealPaymentScreenshots.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
                    {dealPaymentScreenshots.map((ps, idx) => (
                      <div
                        key={ps.id || idx}
                        onClick={() => {
                          setPreviewDoc({
                            url: ps.url,
                            name: ps.name,
                            sizeText: ps.size,
                            isPdf: ps.name.toLowerCase().endsWith('.pdf'),
                            isImage: true,
                            downloadUrl: ps.url,
                            isZoho: true,
                          });
                        }}
                        className="group relative cursor-pointer rounded-lg overflow-hidden border border-gray-200/80 hover:border-emerald-500 bg-gray-50 aspect-video flex items-center justify-center transition-all shadow-2xs hover:shadow-sm"
                        title={`Click to view: ${ps.name}`}
                      >
                        <img
                          src={ps.url}
                          alt={ps.name}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white">
                          <Eye size={13} className="drop-shadow" />
                          <span className="text-[10px] font-bold drop-shadow">View</span>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent p-1">
                          <p className="text-[9px] font-medium text-white truncate px-0.5">{ps.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 italic text-right">
                    Click thumbnail to open full screenshot
                  </p>
                </div>
              ) : (
                <div className="py-2.5 text-center bg-white/70 rounded-lg border border-dashed border-gray-200">
                  <p className="text-[11px] text-gray-400 italic">No payment screenshots in Deal_payment_screenshot</p>
                </div>
              )}
            </div>

            {/* Accounts Department Specific Card: Bank Details & Account Remarks (Strictly Accounts Department & Super Admin Only) */}
            {(isAccounts || isSuperAdmin || (currentUser?.email || '').toLowerCase().includes('vrunda') || (currentUser?.department || '').toLowerCase().includes('account') || (deal.stage || raw.Stage || deal.status || '').toLowerCase().includes('account')) && (
              <div className="p-3.5 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 rounded-xl border border-amber-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center">
                      <Building2 size={12} />
                    </div>
                    <span className="text-xs font-bold text-gray-900">Accounts Details</span>
                  </div>
                  <span className="text-[9px] font-mono font-medium text-amber-800 bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-200">
                    Accounts Only
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Field 1: Bank Details (Zoho CRM Deal Field: Bank_details) */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <span>Bank Details</span>
                        <span className="text-red-500">*</span>
                        {isSavingAccountsDetails && <Loader2 size={10} className="animate-spin text-amber-500" />}
                      </label>
                      <span className="text-[9px] font-mono text-gray-400">Bank_details</span>
                    </div>
                    <select
                      value={bankDetails}
                      disabled={isSavingAccountsDetails}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setBankDetails(newVal);
                        saveAccountsDetailsToZoho(newVal, accountsRemark);
                      }}
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-be-orange focus:border-be-orange transition-colors"
                    >
                      <option value="">None</option>
                      <option value="BSPL">BSPL</option>
                      <option value="BSAPL">BSAPL</option>
                    </select>
                  </div>

                  {/* Field 2: Account Remarks (Zoho CRM Deal Field: Accounts_remark) */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-semibold text-gray-700">
                        Account Remarks
                      </label>
                      <span className="text-[9px] font-mono text-gray-400">Accounts_remark</span>
                    </div>
                    <input
                      type="text"
                      value={accountsRemark}
                      onChange={(e) => setAccountsRemark(e.target.value)}
                      onBlur={(e) => {
                        saveAccountsDetailsToZoho(bankDetails, e.target.value);
                      }}
                      placeholder="Enter account remarks..."
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-be-orange focus:border-be-orange transition-colors"
                    />
                  </div>

                  {/* Save Button */}
                  <button
                    type="button"
                    onClick={() => saveAccountsDetailsToZoho(bankDetails, accountsRemark)}
                    disabled={isSavingAccountsDetails}
                    className="w-full mt-1 flex items-center justify-center px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs disabled:opacity-50 gap-1.5 cursor-pointer"
                  >
                    {isSavingAccountsDetails ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Updating Zoho CRM...</span>
                      </>
                    ) : (
                      <>
                        <Save size={13} />
                        <span>Update Account Details</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 50/50 Split Breakdown Card if Partner BDM is active */}
            {hasPartnerBdm && (
              <div className="p-3.5 bg-gradient-to-br from-purple-50/80 to-indigo-50/60 rounded-xl border border-purple-100 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-purple-900 border-b border-purple-200/60 pb-1.5">
                  <span className="flex items-center"><Users size={13} className="mr-1 text-purple-600" /> 50/50 Split Breakdown</span>
                  <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">Pre-GST: ₹{preGstReceivedNum.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-gray-700 pt-0.5">
                  <span className="font-medium">Primary BDM ({formatZohoValue(primaryBdmName)}):</span>
                  <span className="font-extrabold text-purple-950">₹{partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (50%)</span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span className="font-medium">Partner BDM ({formatZohoValue(partnerBdmName)}):</span>
                  <span className="font-extrabold text-purple-950">₹{partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (50%)</span>
                </div>
              </div>
            )}

            {/* Milestone Payments Breakdown (R1 - R8) */}
            {(() => {
              const recordedSlots = PAYMENT_SLOTS.map(s => {
                const rawVal = deal[s.amountField] ?? raw[s.amountField] ?? deal.formData?.[s.amountField];
                const amt = parseNum(rawVal);
                const rawDate = deal[s.dateField] ?? raw[s.dateField] ?? deal.formData?.[s.dateField];
                const bdm1 = deal[s.bdm1Field] ?? raw[s.bdm1Field] ?? deal.formData?.[s.bdm1Field];
                const bdm2 = deal[s.bdm2Field] ?? raw[s.bdm2Field] ?? deal.formData?.[s.bdm2Field];
                return { ...s, amt, date: rawDate, bdm1, bdm2 };
              }).filter(s => s.amt > 0);

              if (recordedSlots.length === 0) return null;

              return (
                <div className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-gray-800 border-b border-gray-200/60 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <CreditCard size={13} className="text-be-orange" />
                      Recorded Milestone Payments
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      {recordedSlots.length} Paid
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {recordedSlots.map(s => (
                      <div key={s.tabName} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0 text-[11px]">
                        <div>
                          <span className="font-bold text-gray-900 mr-1.5">{s.tabName}:</span>
                          <span className="text-gray-500">
                            {s.date ? new Date(s.date).toLocaleDateString('en-GB') : '—'}
                          </span>
                          {s.bdm1 && (
                            <span className="text-gray-400 block text-[10px]">
                              BDM: {formatZohoValue(s.bdm1)} {s.bdm2 ? `+ ${formatZohoValue(s.bdm2)}` : ''}
                            </span>
                          )}
                        </div>
                        <span className="font-extrabold text-emerald-700">₹{s.amt.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Payment Details (Method, Date, Verification) */}
            <div className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-100 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Deal Stage:</span>
                <span className="font-bold text-gray-900 px-2 py-0.5 bg-orange-50 text-be-orange rounded-md border border-orange-100">{formatZohoValue(deal.stage || raw.Stage || 'Sales')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Payment Verification:</span>
                <span className={`font-bold px-2 py-0.5 rounded-md ${splitBreakdown.isPaymentVerified ? 'bg-emerald-100 text-emerald-800' : isSidebarAccountsStage ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'}`}>
                  {splitBreakdown.isPaymentVerified ? 'Verified' : isSidebarAccountsStage ? 'Pending Verification' : 'Unverified'}
                </span>
              </div>
              {(raw.Payment_Type || raw.Payment_status || raw.Payment_stages) && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Payment Status:</span>
                  <span className="font-semibold text-gray-800">{formatZohoValue(raw.Payment_status || raw.Payment_stages || raw.Payment_Type)}</span>
                </div>
              )}
              {(raw.Payment_Date || raw.Payment_received_date) && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Payment Date:</span>
                  <span className="font-medium text-gray-800">
                    {new Date(raw.Payment_Date || raw.Payment_received_date).toLocaleDateString('en-GB')}
                  </span>
                </div>
              )}
              {raw.If_partially_paid && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Partially Paid:</span>
                  <span className="font-semibold text-orange-600">{formatZohoValue(raw.If_partially_paid)}</span>
                </div>
              )}
            </div>

            {/* Workflow Actions */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              {(() => {
                const rawStage = (deal.stage || raw.Stage || deal.status || 'Sales').toLowerCase().trim();
                const isAccountsStage = rawStage.includes('account');
                const isLegalStage = rawStage.includes('legal');
                const isAllocatorStage = rawStage.includes('allocat') && !rawStage.includes('execut');
                const isExecutorsStage = rawStage.includes('execut');
                const isQualityStage = rawStage.includes('qualit');
                const isWonStage = rawStage.includes('won');
                const isLostStage = rawStage.includes('lost');
                const isSalesOrDraft = !isAccountsStage && !isLegalStage && !isAllocatorStage && !isExecutorsStage && !isQualityStage && !isWonStage && !isLostStage;

                return (
                  <>
                    {/* 1. Send to Accounts (Sales to Account: 1078476000000489153) */}
                    {isSalesOrDraft && !splitBreakdown.isPaymentVerified && (isSales || isSuperAdmin || (!isAccounts && !isLegal)) && (
                      <button
                        onClick={handleSendToAccounts}
                        disabled={isActionInProgress}
                        className="w-full flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        {isActionInProgress ? <Loader2 size={14} className="animate-spin mr-2" /> : <Building2 size={14} className="mr-2" />}
                        Send to Accounts
                      </button>
                    )}

                    {/* 2. Verify Payment (Accounts action - Automatically moves to Legal) */}
                    {!splitBreakdown.isPaymentVerified && isAccountsStage && (isAccounts || isSuperAdmin) && (
                      <button
                        onClick={handleVerifyPayment}
                        disabled={isActionInProgress}
                        className="w-full flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        {isActionInProgress ? <Loader2 size={14} className="animate-spin mr-2" /> : <CheckCircle2 size={14} className="mr-2" />}
                        Verify & Send to Legal
                      </button>
                    )}

                    {/* 3. Send to Legal (Account to Legal: 1078476000000492001) */}
                    {splitBreakdown.isPaymentVerified && isAccountsStage && (isAccounts || isSuperAdmin) && (
                      <button
                        onClick={handleSendToLegal}
                        disabled={isActionInProgress}
                        className="w-full flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        {isActionInProgress ? <Loader2 size={14} className="animate-spin mr-2" /> : <ShieldCheck size={14} className="mr-2" />}
                        Send to Legal Department
                      </button>
                    )}

                    {/* 4. Send to Operations Allocator (Legal to Operations Allocator: 1078476000000492099) */}
                    {isLegalStage && (isLegal || isSuperAdmin) && (
                      <button
                        onClick={handleSendToOperationsAllocator}
                        disabled={isActionInProgress}
                        className="w-full flex items-center justify-center px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        {isActionInProgress ? <Loader2 size={14} className="animate-spin mr-2" /> : <Users size={14} className="mr-2" />}
                        Send to Operations Allocator
                      </button>
                    )}

                    {/* 5. Send to Operations Executors (Operations Allocator to Operations Executors: 1078476000001938757) */}
                    {isAllocatorStage && (isSuperAdmin || (!isSales && !isAccounts && !isLegal)) && (
                      <button
                        onClick={handleSendToOperationsExecutors}
                        disabled={isActionInProgress}
                        className="w-full flex items-center justify-center px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        {isActionInProgress ? <Loader2 size={14} className="animate-spin mr-2" /> : <ArrowRight size={14} className="mr-2" />}
                        Send to Operations Executors
                      </button>
                    )}
                  </>
                );
              })()}

              <button 
                type="button"
                onClick={openPaymentModal} 
                className={`w-full flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                  canEditRemainingPayment
                    ? 'bg-be-orange text-white hover:bg-be-orangeHover'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
                title={canEditRemainingPayment ? "Record or update received payment, proof screenshot, and BDM allocation" : "View milestone payments (Read-Only)"}
              >
                {canEditRemainingPayment ? (
                  <>
                    <CreditCard size={14} className="mr-2" /> Record / Update Payment
                  </>
                ) : (
                  <>
                    <Eye size={14} className="mr-2 text-gray-500" /> View Milestone Payments
                  </>
                )}
              </button>
            </div>
          </div>
            );
          })()}

          {/* Partner & BDM Card */}
          {(primaryBdmName || hasPartnerBdm || partnerBdmName || partnerBdmAmount > 0) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900 flex items-center">
                  <User size={18} className="mr-2 text-be-orange" />
                  BDM & Partner Info
                </h2>
                {hasPartnerBdm ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    <Users size={11} className="mr-1" />
                    50/50 Split Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-600 border border-gray-200">
                    Single BDM (100%)
                  </span>
                )}
              </div>

              <div className="space-y-3 text-xs">
                {/* Primary BDM */}
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500 font-medium">Primary BDM:</span>
                  <div className="text-right">
                    <span className="font-bold text-gray-900">{primaryBdmName}</span>
                    <span className="block text-[10px] text-gray-400 font-normal">
                      {hasPartnerBdm ? `50% Shareholder (₹${partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : 'Deal Owner / Primary (100%)'}
                    </span>
                  </div>
                </div>

                {/* Partner BDM Section */}
                {hasPartnerBdm && (
                  <>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-purple-700 font-semibold flex items-center">
                        <Users size={12} className="mr-1 text-purple-600" />
                        Partner BDM:
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                          {partnerBdmName || 'Unassigned Partner'}
                        </span>
                        <span className="block text-[10px] text-purple-600 font-medium mt-0.5">50% Shareholder (₹{partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                      </div>
                    </div>

                    <div className="p-3 bg-gradient-to-br from-purple-50/60 to-indigo-50/40 rounded-xl border border-purple-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-purple-800 font-semibold text-xs flex items-center">
                          <IndianRupee size={13} className="mr-0.5 text-purple-600" />
                          Partner BDM Amount:
                        </span>
                        <span className="font-extrabold text-sm text-purple-900">
                          ₹{partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-purple-200/60 text-[10px] text-purple-700 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Received (Incl. GST):</span>
                          <span className="font-semibold text-gray-800">₹{receivedAmountNum.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Pre-GST Received (÷ 1.18):</span>
                          <span className="font-semibold text-gray-800">₹{preGstReceivedNum.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between font-bold text-purple-800 pt-0.5">
                          <span>Partner Share (50%):</span>
                          <span>₹{partnerBdmAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Zoho CRM Tracking & Metadata */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <Tag size={18} className="mr-2 text-be-orange" />
              Deal Tracking & Info
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-400">Deal Stage:</span>
                <span className="font-bold text-gray-900">{formatZohoValue(deal.stage || deal.status) || 'Operations'}</span>
              </div>
              {raw.Pipeline && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Pipeline:</span>
                  <span className="font-medium text-gray-800">{formatZohoValue(raw.Pipeline)}</span>
                </div>
              )}
              {raw.ID_of_application && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Application ID:</span>
                  <span className="font-mono font-bold text-gray-900">{formatZohoValue(raw.ID_of_application)}</span>
                </div>
              )}
              {raw.Lead_Source && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Lead Source:</span>
                  <span className="font-medium text-gray-800">{formatZohoValue(raw.Lead_Source)}</span>
                </div>
              )}
              {raw.Booking_Date && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Booking Date:</span>
                  <span className="font-medium text-gray-800">{new Date(raw.Booking_Date).toLocaleDateString('en-GB')}</span>
                </div>
              )}
              {raw.Sales_date && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Sales Date:</span>
                  <span className="font-medium text-gray-800">{new Date(raw.Sales_date).toLocaleDateString('en-GB')}</span>
                </div>
              )}
              {raw.Closing_Date && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Closing Date:</span>
                  <span className="font-medium text-gray-800">{new Date(raw.Closing_Date).toLocaleDateString('en-GB')}</span>
                </div>
              )}
              {raw.Choose_Wisely && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Category:</span>
                  <span className="font-semibold text-be-orange">{formatZohoValue(raw.Choose_Wisely)}</span>
                </div>
              )}
              {employeeName && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Employee (Lookup):</span>
                  <span className="font-bold text-be-orange bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{formatZohoValue(employeeName)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-400">Deal Owner:</span>
                <span className="font-bold text-gray-900">{formatZohoValue(deal.owner) || 'Admin'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-400">Sync Source:</span>
                <span className="font-medium text-gray-800">{formatZohoValue(deal.source) || 'Cloud'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Record / Update Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-orange-50/80 via-amber-50/40 to-white">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-be-orange flex items-center justify-center font-bold shadow-xs">
                  <CreditCard size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-gray-900">
                      {canEditRemainingPayment ? 'Record / Update Payment' : 'Milestone Payments'}
                    </h3>
                    {!canEditRemainingPayment && (
                      <span className="px-2 py-0.5 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold flex items-center gap-1">
                        <Lock size={10} /> Read-Only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Deal #{deal.id} • <span className="text-gray-700 font-semibold">{formatZohoValue(clientName)}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleRecordPaymentSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {paymentModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0 text-rose-500" />
                  <span>{paymentModalError}</span>
                </div>
              )}

              {!canEditRemainingPayment && (
                <div className="p-3 bg-amber-50/90 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center gap-2.5">
                  <Lock size={16} className="shrink-0 text-amber-600" />
                  <div>
                    <span className="font-bold block text-amber-900">Read-Only View</span>
                    <span className="text-[11px] text-amber-800">
                      Only Primary BDM (BDM 1: <strong>{primaryBdmName}</strong>) can record or edit remaining payment entries.
                    </span>
                  </div>
                </div>
              )}

              {/* 8-Milestone Payment Tabs (R1 through R8) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700">Milestone Payment Slots</span>
                  <span className="text-[11px] text-gray-500 font-medium">Select a tab to record milestone payments</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 bg-gray-100 p-1.5 rounded-xl border border-gray-200/80">
                  {PAYMENT_SLOTS.map((slot) => {
                    const item = paymentSlotsData[slot.index];
                    const hasAmt = item && item.amount && parseNum(item.amount) > 0;
                    const isActive = activePaymentTab === slot.index;
                    return (
                      <button
                        key={`tab-${slot.index}`}
                        type="button"
                        onClick={() => setActivePaymentTab(slot.index)}
                        className={`py-2 px-1.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                          isActive
                            ? 'bg-be-orange text-white shadow-xs scale-[1.02]'
                            : hasAmt
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200/60'
                        }`}
                        title={slot.label}
                      >
                        <div className="flex items-center gap-1">
                          <span>{slot.tabName}</span>
                          {hasAmt && !isActive && <span className="text-[10px] text-emerald-600 font-extrabold">✓</span>}
                        </div>
                        <span className={`text-[9px] mt-0.5 truncate max-w-full font-semibold ${
                          isActive ? 'text-orange-100' : hasAmt ? 'text-emerald-700' : 'text-gray-400'
                        }`}>
                          {hasAmt ? `₹${(parseNum(item.amount) / 1000).toFixed(0)}k` : 'Empty'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Financial Balance Summary Bar */}
              <div className="grid grid-cols-3 gap-2.5 p-3 bg-gradient-to-br from-gray-50 to-orange-50/30 rounded-xl border border-orange-100/80 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium text-gray-500 block">Total Deal Value</span>
                  <span className="font-extrabold text-gray-900 text-xs sm:text-sm">₹{totalAmountNum.toLocaleString('en-IN')}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium text-emerald-600 block">Total Received</span>
                  <span className="font-extrabold text-emerald-700 text-xs sm:text-sm">₹{totalOverallReceived.toLocaleString('en-IN')}</span>
                  {resolvedBookingAmount > 0 && (
                    <span className="text-[9px] text-gray-400 block font-normal truncate">
                      Advance: ₹{resolvedBookingAmount.toLocaleString('en-IN')}{totalReceivedAllSlots > 0 ? ` + R1-R8: ₹${totalReceivedAllSlots.toLocaleString('en-IN')}` : ''}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium text-orange-600 block">Pending Balance</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-extrabold text-xs sm:text-sm ${totalPendingAllSlots === 0 ? 'text-emerald-700' : 'text-orange-600'}`}>
                      ₹{totalPendingAllSlots.toLocaleString('en-IN')}
                    </span>
                    {totalPendingAllSlots === 0 && totalOverallReceived > 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-bold">Paid</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Row-Wise Inputs for the Active Payment Tab */}
              {(() => {
                const activeSlot: PaymentSlotItem = paymentSlotsData[activePaymentTab] || {
                  amount: '',
                  date: '',
                  bdm1Id: '',
                  bdm1Name: '',
                  bdm2Id: '',
                  bdm2Name: '',
                  screenshotFile: null,
                  screenshotPreview: null,
                  existingScreenshotName: '',
                  bankType: 'BSPL',
                  isVerified: false,
                };
                const activeSlotCfg = PAYMENT_SLOTS.find(s => s.index === activePaymentTab) || PAYMENT_SLOTS[0];

                return (
                  <div className="divide-y divide-gray-100 text-xs pt-1">
                    {/* Active Tab Notice Header */}
                    <div className="pb-2.5 flex items-center justify-between text-gray-600">
                      <span className="font-bold text-gray-800 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${canEditRemainingPayment ? 'bg-be-orange' : 'bg-gray-400'}`}></span>
                        {canEditRemainingPayment ? (
                          <>Editing: <span className="text-be-orange">{activeSlotCfg.label}</span></>
                        ) : (
                          <>Viewing: <span className="text-gray-800">{activeSlotCfg.label}</span> <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">(Read-Only)</span></>
                        )}
                      </span>
                      <span className="text-[11px] text-gray-400">Field: {activeSlotCfg.amountField}</span>
                    </div>

                    {/* Row 1: Received Amount */}
                    <div className="flex flex-col sm:flex-row sm:items-start py-3 gap-2 sm:gap-4">
                      <label className="sm:w-44 sm:pt-2 font-bold text-gray-700 shrink-0">
                        Received Amount ({activeSlotCfg.tabName})
                      </label>
                      <div className="flex-1">
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 font-bold text-sm">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            disabled={!canEditRemainingPayment}
                            value={activeSlot.amount}
                            onChange={(e) => {
                              if (!canEditRemainingPayment) return;
                              const val = e.target.value;
                              setPaymentSlotsData(prev => ({
                                ...prev,
                                [activePaymentTab]: { ...prev[activePaymentTab], amount: val }
                              }));
                            }}
                            placeholder="0.00"
                            className={`w-full pl-7 pr-3 py-2 border rounded-lg text-xs font-bold outline-none transition-all ${
                              !canEditRemainingPayment
                                ? 'bg-gray-100 text-gray-600 border-gray-200 cursor-not-allowed select-none'
                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white focus:border-be-orange focus:ring-1 focus:ring-be-orange'
                            }`}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
                          <span>Pre-GST for {activeSlotCfg.tabName}: <strong className="text-gray-700">₹{((parseNum(activeSlot.amount) || 0) / 1.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
                          <span>•</span>
                          <span>Pending After R1-R8: <strong className="text-orange-600">₹{totalPendingAllSlots.toLocaleString('en-IN')}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Payment Received Date */}
                    <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-4">
                      <label className="sm:w-44 font-bold text-gray-700 shrink-0">
                        Payment Received Date
                      </label>
                      <div className="flex-1">
                        <input
                          type="date"
                          disabled={!canEditRemainingPayment}
                          value={activeSlot.date}
                          onChange={(e) => {
                            if (!canEditRemainingPayment) return;
                            const val = e.target.value;
                            setPaymentSlotsData(prev => ({
                              ...prev,
                              [activePaymentTab]: { ...prev[activePaymentTab], date: val }
                            }));
                          }}
                          className={`w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none transition-all ${
                            !canEditRemainingPayment
                              ? 'bg-gray-100 text-gray-600 border-gray-200 cursor-not-allowed select-none'
                              : 'bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-be-orange focus:ring-1 focus:ring-be-orange'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Row 3: Received by BDM 1 */}
                    <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-4">
                      <label className="sm:w-44 font-bold text-gray-700 shrink-0">
                        Received by BDM 1
                      </label>
                      <div className="flex-1">
                        <select
                          disabled={!canEditRemainingPayment}
                          value={activeSlot.bdm1Name}
                          onChange={(e) => {
                            if (!canEditRemainingPayment) return;
                            const selectedName = e.target.value;
                            const matched = salesEmployees.find(emp => emp.name.toLowerCase() === selectedName.toLowerCase());
                            setPaymentSlotsData(prev => ({
                              ...prev,
                              [activePaymentTab]: {
                                ...prev[activePaymentTab],
                                bdm1Name: selectedName,
                                bdm1Id: matched?.id || matched?.zohoId || '',
                              }
                            }));
                          }}
                          className={`w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none transition-all ${
                            !canEditRemainingPayment
                              ? 'bg-gray-100 text-gray-600 border-gray-200 cursor-not-allowed select-none'
                              : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white focus:border-be-orange focus:ring-1 focus:ring-be-orange'
                          }`}
                        >
                          <option value="">-- Select Primary BDM --</option>
                          {salesEmployees.map((emp) => (
                            <option key={`bdm1-${activePaymentTab}-${emp.id}-${emp.name}`} value={emp.name}>
                              {emp.name} {emp.dept ? `(${emp.dept})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 4: Received by BDM 2 */}
                    <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-4">
                      <label className="sm:w-44 font-bold text-gray-700 shrink-0">
                        Received by BDM 2
                      </label>
                      <div className="flex-1">
                        <select
                          disabled={!canEditRemainingPayment}
                          value={activeSlot.bdm2Name}
                          onChange={(e) => {
                            if (!canEditRemainingPayment) return;
                            const selectedName = e.target.value;
                            const matched = salesEmployees.find(emp => emp.name.toLowerCase() === selectedName.toLowerCase());
                            setPaymentSlotsData(prev => ({
                              ...prev,
                              [activePaymentTab]: {
                                ...prev[activePaymentTab],
                                bdm2Name: selectedName,
                                bdm2Id: matched?.id || matched?.zohoId || '',
                              }
                            }));
                          }}
                          className={`w-full px-3 py-2 border rounded-lg text-xs font-semibold outline-none transition-all ${
                            !canEditRemainingPayment
                              ? 'bg-gray-100 text-gray-600 border-purple-200 cursor-not-allowed select-none'
                              : 'bg-gray-50 border-purple-200 text-purple-950 focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-400'
                          }`}
                        >
                          <option value="">-- None / Single BDM Deal (100%) --</option>
                          {salesEmployees.map((emp) => (
                            <option key={`bdm2-${activePaymentTab}-${emp.id}-${emp.name}`} value={emp.name}>
                              {emp.name} {emp.dept ? `(${emp.dept})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 50/50 Split Preview (Shown when BDM 2 is selected) */}
                    {Boolean(activeSlot.bdm2Name && activeSlot.bdm2Name.trim() !== '' && activeSlot.bdm2Name.toLowerCase() !== 'none') && (
                      <div className="flex flex-col sm:flex-row sm:items-center py-2.5 px-3 bg-purple-50/70 rounded-lg border border-purple-100 gap-2 sm:gap-4 my-1">
                        <span className="sm:w-44 font-bold text-purple-900 shrink-0 flex items-center">
                          <Users size={12} className="mr-1 text-purple-600" />
                          50/50 Split (Pre-GST):
                        </span>
                        <div className="flex-1 text-[11px] text-purple-800 flex flex-wrap gap-x-4 gap-y-1">
                          <span><strong>BDM 1 ({activeSlot.bdm1Name || 'Primary'}):</strong> ₹{(((parseNum(activeSlot.amount) || 0) / 1.18) / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span><strong>BDM 2 ({activeSlot.bdm2Name}):</strong> ₹{(((parseNum(activeSlot.amount) || 0) / 1.18) / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    {/* Row 5: Payment Screenshot */}
                    <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-4">
                      <label className="sm:w-44 font-bold text-gray-700 shrink-0">
                        Payment Screenshot ({activeSlotCfg.tabName})
                      </label>
                      <div className="flex-1 flex items-center gap-2.5">
                        {canEditRemainingPayment && (
                          <>
                            <input
                              ref={paymentScreenshotInputRef}
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const isImg = file.type.startsWith('image/');
                                  setPaymentSlotsData(prev => ({
                                    ...prev,
                                    [activePaymentTab]: {
                                      ...prev[activePaymentTab],
                                      screenshotFile: file,
                                      screenshotPreview: isImg ? URL.createObjectURL(file) : null,
                                    }
                                  }));
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => paymentScreenshotInputRef.current?.click()}
                              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border border-gray-200"
                            >
                              <Upload size={13} />
                              {activeSlot.screenshotFile ? 'Change File' : 'Choose File'}
                            </button>
                          </>
                        )}

                        {activeSlot.screenshotFile ? (
                          <span className="text-xs text-gray-800 font-medium truncate flex items-center gap-1.5">
                            <span className="font-semibold text-be-orange truncate max-w-xs">{activeSlot.screenshotFile.name}</span>
                            <span className="text-[10px] text-gray-400">({(activeSlot.screenshotFile.size / 1024).toFixed(0)} KB)</span>
                            {canEditRemainingPayment && (
                              <button
                                type="button"
                                onClick={() => setPaymentSlotsData(prev => ({
                                  ...prev,
                                  [activePaymentTab]: { ...prev[activePaymentTab], screenshotFile: null, screenshotPreview: null }
                                }))}
                                className="text-gray-400 hover:text-rose-500 p-0.5 cursor-pointer"
                                title="Remove"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </span>
                        ) : activeSlot.existingScreenshotName ? (
                          <span className="text-xs text-emerald-700 font-medium flex items-center gap-1 truncate">
                            <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                            Current: {activeSlot.existingScreenshotName}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No file {canEditRemainingPayment ? 'chosen (Optional)' : 'uploaded'}</span>
                        )}
                      </div>
                    </div>

                    {/* Row 6: Bank Details / Bank Type (Accounts Department Only) */}
                    {(isAccounts || isSuperAdmin) && (
                      <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-4 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 my-1">
                        <label className="sm:w-44 font-bold text-gray-800 shrink-0 flex items-center gap-1.5 text-xs">
                          <Building2 size={14} className="text-emerald-600" />
                          Bank Details ({activeSlotCfg.tabName} Bank type)
                        </label>
                        <div className="flex-1 flex items-center gap-3">
                          <select
                            value={activeSlot.bankType || 'BSPL'}
                            onChange={(e) => {
                              const val = e.target.value as 'BSPL' | 'BSAPL';
                              setPaymentSlotsData(prev => ({
                                ...prev,
                                [activePaymentTab]: {
                                  ...prev[activePaymentTab],
                                  bankType: val
                                }
                              }));
                            }}
                            className="px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-gray-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 shadow-xs"
                            title={`Zoho CRM Pick List field: ${activeSlotCfg.tabName}_Bank_type`}
                          >
                            <option value="BSPL">BSPL</option>
                            <option value="BSAPL">BSAPL</option>
                          </select>
                          <span className="text-[11px] text-gray-500">
                            Zoho API: <code className="text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-mono text-[10px]">{activeSlotCfg.tabName}_Bank_type</code>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2.5">
                <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5">
                  {(canEditRemainingPayment || isAccounts || isSuperAdmin) ? (
                    'Saving will synchronize all 8 milestone payment fields with Zoho CRM.'
                  ) : (
                    <>
                      <Lock size={12} className="text-amber-600 shrink-0" />
                      Read-Only: Only Primary BDM (BDM 1: <strong className="text-gray-700">{primaryBdmName}</strong>) or Accounts can modify milestone entries.
                    </>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    disabled={isSubmittingPayment}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {(canEditRemainingPayment || isAccounts || isSuperAdmin) ? 'Cancel' : 'Close'}
                  </button>
                  {(canEditRemainingPayment || isAccounts || isSuperAdmin) && (
                    <button
                      type="submit"
                      disabled={isSubmittingPayment}
                      className="px-5 py-2 bg-be-orange hover:bg-be-orangeHover text-white text-xs font-bold rounded-lg transition-all shadow-sm hover:shadow flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingPayment ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Updating Zoho CRM...
                        </>
                      ) : (
                        <>
                          <Check size={13} />
                          Submit Payment
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox / Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-be-orange flex items-center justify-center font-bold text-xs shrink-0">
                  {previewDoc.isPdf ? 'PDF' : previewDoc.isImage ? 'IMG' : 'DOC'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 truncate max-w-md sm:max-w-xl" title={previewDoc.name}>
                    {previewDoc.name}
                  </h3>
                  {previewDoc.sizeText && (
                    <p className="text-[11px] text-gray-400">{previewDoc.sizeText}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {previewDoc.downloadUrl && (
                  <a
                    href={previewDoc.downloadUrl}
                    download={previewDoc.name}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-emerald-500 text-gray-700 hover:text-emerald-600 text-xs font-bold rounded-xl transition-all shadow-xs"
                    title="Download document"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                )}
                {previewDoc.url && (
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-blue-500 text-gray-700 hover:text-blue-600 text-xs font-bold rounded-xl transition-all shadow-xs"
                    title="Open in new window"
                  >
                    <ExternalLink size={14} />
                    <span className="hidden sm:inline">New Tab</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-700 rounded-xl transition-colors"
                  title="Close preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-900/5 min-h-[450px]">
              {previewDoc.isImage ? (
                <img 
                  src={previewDoc.url} 
                  alt={previewDoc.name} 
                  className="max-h-[78vh] max-w-full object-contain rounded-xl shadow-md bg-white"
                />
              ) : previewDoc.isPdf ? (
                <iframe 
                  src={previewDoc.url} 
                  title={previewDoc.name} 
                  className="w-full h-[78vh] rounded-xl bg-white border border-gray-200 shadow-inner"
                />
              ) : (
                <div className="text-center p-8 space-y-3 bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md">
                  <FileText size={48} className="text-be-orange mx-auto" />
                  <p className="text-sm font-bold text-gray-900">{previewDoc.name}</p>
                  <p className="text-xs text-gray-500">Preview not supported for this file format. Click download to view it locally.</p>
                  {previewDoc.downloadUrl && (
                    <a
                      href={previewDoc.downloadUrl}
                      download={previewDoc.name}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-be-orange text-white text-xs font-bold rounded-xl shadow-sm hover:bg-orange-600 transition-colors"
                    >
                      <Download size={14} />
                      Download File
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
