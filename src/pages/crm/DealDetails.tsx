import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Edit, Download, MoreHorizontal, FileText, 
  CheckCircle2, Clock, MapPin, Building2, Phone, Mail, 
  IndianRupee, CreditCard, Receipt, Cloud, ShieldCheck, 
  Briefcase, Calendar, Layers, Tag, ExternalLink, User, RefreshCw, Loader2,
  AlertTriangle, Bell, Eye, Upload, Paperclip, X, FileSpreadsheet, Image as ImageIcon,
  Check, Maximize2, Minimize2, FileCode, HardDrive, CheckCircle, Users, Percent, Calculator, Info
} from 'lucide-react';
import { getDocument, getAllDealsFromIndexedDB, saveDealToIndexedDB, saveDocument } from '../../lib/db';
import { 
  fetchZohoDealById, 
  enrichDealFromZohoRecord,
  fetchZohoAttachments, 
  getZohoAttachmentDownloadUrl, 
  downloadZohoAttachment, 
  uploadZohoAttachmentToDeal 
} from '../../services/zohoService';

export const DealDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);

  // Zoho & Local Attachments State
  const [zohoAttachments, setZohoAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState<boolean>(false);
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

  const loadLiveDeal = useCallback(async (dealIdToFetch: string) => {
    if (!dealIdToFetch) return;
    setIsRefreshing(true);
    try {
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

        const updatedObj = enrichDealFromZohoRecord(rawZoho, deal);
        if (id && id.startsWith('DL-')) {
          updatedObj.id = id;
        }

        setDeal(updatedObj);
        saveDealToIndexedDB(updatedObj).catch(() => {});

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

  useEffect(() => {
    let isMounted = true;
    const initDeal = async () => {
      setLoading(true);
      let foundDeal: any = null;

      // 1. Check IndexedDB first (10,000+ deals storage)
      try {
        const idbDeals = await getAllDealsFromIndexedDB();
        foundDeal = idbDeals.find((d: any) => 
          String(d.id) === String(id) || 
          String(d.zohoId) === String(id) ||
          (d.id && id && String(d.id).toLowerCase() === String(id).toLowerCase())
        );
      } catch (e) {
        console.warn('IndexedDB read error in DealDetails:', e);
      }

      // 2. Check localStorage fallback
      if (!foundDeal) {
        try {
          const saved = localStorage.getItem('be_deals');
          const allDeals = saved ? JSON.parse(saved) : [];
          foundDeal = allDeals.find((d: any) => 
            String(d.id) === String(id) || 
            String(d.zohoId) === String(id) ||
            (d.id && id && String(d.id).toLowerCase() === String(id).toLowerCase())
          );
        } catch (e) {}
      }

      if (foundDeal && isMounted) {
        setDeal(foundDeal);
        setLoading(false);
      }

      // 3. Fetch latest live record & attachments from Zoho CRM
      const targetZohoId = foundDeal?.zohoId || (id && /^\d+$/.test(id) ? id : null);
      if (targetZohoId) {
        loadAttachments(targetZohoId);
        await loadLiveDeal(targetZohoId);
      } else if (!foundDeal && id) {
        await loadLiveDeal(id);
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
        <p className="text-xs text-gray-500">Retrieving deal #{id} from portal storage and Zoho CRM...</p>
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
        <p className="text-sm text-gray-500 mb-6">The deal record "{id}" does not exist in local portal cache or could not be loaded from Zoho CRM.</p>
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

  // Extract all client and company fields with robust Zoho CRM API names matching
  const clientName = 
    raw.Client_Name ||
    (raw.Clients && (typeof raw.Clients === 'object' ? raw.Clients.name : raw.Clients)) ||
    (raw.Contact_Name && (typeof raw.Contact_Name === 'object' ? raw.Contact_Name.name : raw.Contact_Name)) ||
    raw.Name1 ||
    raw.Name ||
    fd.clientName ||
    (deal.client && deal.client !== 'Client' ? deal.client : '') ||
    (raw.Deal_Name ? raw.Deal_Name.split(' - ')[0] : '') ||
    (deal.client || 'Client');

  const companyName = 
    raw.Company_name ||
    raw.Company_name_bp ||
    raw.Company_name_cs ||
    raw.Company_name_st ||
    (raw.Company && (typeof raw.Company === 'object' ? raw.Company.name : raw.Company)) ||
    (raw.Account_Name && (typeof raw.Account_Name === 'object' ? raw.Account_Name.name : raw.Account_Name)) ||
    raw.Company_Name ||
    fd.companyName ||
    (deal.company && deal.company !== 'N/A' ? deal.company : '') ||
    (clientName !== 'Client' ? clientName : 'N/A');

  const employeeName = 
    (raw.Employee && typeof raw.Employee === 'object' ? raw.Employee.name : (typeof raw.Employee === 'string' && !/^\d+$/.test(raw.Employee) ? raw.Employee : '')) ||
    deal.employeeName ||
    raw.employeeName ||
    raw.salesEmployee ||
    deal.salesEmployee ||
    fd.employeeName ||
    '';

  const mobilePhone = 
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
    'N/A';

  const emailAddress = 
    raw.Client_Email_address ||
    raw.Client_Email_address_cs ||
    raw.Client_Email_address_fnf ||
    raw.Client_Email_address_bp ||
    raw.client_email_address_st ||
    raw.Email ||
    fd.email ||
    'N/A';

  const gstin = 
    raw.Gst_number ||
    raw.GST_Number ||
    raw.GSTIN ||
    raw.GST_No ||
    fd.gstNumber ||
    'N/A';

  const pan = 
    raw.Pan_number ||
    raw.PAN_Number ||
    raw.PAN_Card ||
    raw.PAN_No ||
    raw.PAN ||
    fd.panCard ||
    fd.companyPan ||
    'N/A';

  const aadhaar = 
    raw.Aadhaar_Card ||
    raw.Aadhaar_number ||
    raw.Aadhaar_Number ||
    raw.Aadhar_Card ||
    raw.Aadhaar ||
    fd.aadhaarCard ||
    'N/A';

  const fullAddress = 
    raw.Billing_address ||
    raw.Company_address ||
    fd.billingAddress ||
    (raw.City || raw.State ? `${raw.City || ''}, ${raw.State || ''}`.replace(/^, |, $/g, '') : '') ||
    (fd.city || fd.state ? `${fd.city || ''}, ${fd.state || ''}`.replace(/^, |, $/g, '') : '') ||
    'Address not specified';

  const businessType = 
    raw.Company_Type ||
    raw.Choose_Wisely ||
    raw.Compliance_type ||
    fd.businessType ||
    'Business';

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
  let services = deal.servicesData || [];
  let servicesSumTotal = 0;
  let servicesSumBase = 0;
  let servicesSumReceived = 0;
  let servicesSumPending = 0;

  if (Array.isArray(raw.Subform_1) && raw.Subform_1.length > 0) {
    services = raw.Subform_1.map((sf: any, i: number) => {
      const agreementAmount = parseNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount || 0);
      const withoutGst = parseNum(sf.Without_GST || sf.baseAmount || sf.Base || (agreementAmount > 0 ? Number((agreementAmount * 0.82).toFixed(2)) : 0));
      const totalAmt = agreementAmount || (withoutGst > 0 ? Number((withoutGst / 0.82).toFixed(2)) : 0);
      const recAmt = parseNum(sf.Received_amount || sf.Received || 0);
      const pendAmt = parseNum(sf.Pending_amount || sf.Pending || (totalAmt > recAmt ? totalAmt - recAmt : 0));

      servicesSumTotal += totalAmt;
      servicesSumBase += withoutGst;
      servicesSumReceived += recAmt;
      servicesSumPending += pendAmt;

      return {
        id: String(sf.id || i + 1),
        name: sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || 'Service',
        totalAmount: String(totalAmt || ''),
        baseAmount: String(withoutGst || 0),
        receivedAmount: sf.Received_amount || sf.Received || (recAmt > 0 ? String(recAmt) : ''),
        pendingAmount: sf.Pending_amount || sf.Pending || (pendAmt > 0 ? String(pendAmt) : ''),
        paymentStages: sf.Payment_stages || '',
        paymentType: sf.Payment_type || '',
        paymentDate: sf.Payment_received_date || '',
        qualityProvided: sf.Quality_provided || '',
        successFees: sf.Success_fees || '',
      };
    });
  } else if (services.length > 0) {
    services.forEach((s: any) => {
      const t = parseNum(s.totalAmount);
      const b = parseNum(s.baseAmount || (t > 0 ? t * 0.82 : 0));
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
    raw.Amount_Without_GST ? parseNum(raw.Amount_Without_GST) / 0.82 : 0,
    raw.Deal_Amount_Without_GST ? parseNum(raw.Deal_Amount_Without_GST) / 0.82 : 0,
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
    totalAmountNum > 0 ? Number((totalAmountNum * 0.82).toFixed(2)) : 0
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

  const pendingAmountNum = findFirstPos(
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

  // If services array was still empty, create default single row with the resolved totals
  if (services.length === 0 || (services.length === 1 && services[0].name === 'General Services' && totalAmountNum > 0)) {
    const serviceTitle = raw.Choose_Wisely || raw.Service_Name || raw.Business_plan_selected || (raw.Deal_Name && raw.Deal_Name.includes(' - ') ? raw.Deal_Name.split(' - ').slice(1).join(' - ').trim() : '') || deal.service || 'General Services';
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

  // Extract BDM and Partner BDM Details
  const primaryBdmName = 
    deal.bdmName ||
    deal.owner ||
    raw.BDM_names?.name ||
    raw.BDM_names ||
    raw.BDM_name ||
    raw.BDM_name_cs ||
    raw.BDM_name_bp ||
    raw.BDM_name_st ||
    fd.bdmName ||
    'Admin';

  const hasPartnerBdm = Boolean(
    deal.hasPartnerBdm ||
    deal.has_partner_bdm ||
    raw.Has_Partner_BDM === true ||
    raw.Has_Partner_BDM === 'true' ||
    raw.has_partner_bdm === true ||
    raw.has_partner_bdm === 'true' ||
    raw.Partner_BDM_name ||
    raw.Partner_BDM_Names ||
    raw.Partner_BDM ||
    deal.partnerBdmName ||
    deal.partner_bdm_name ||
    fd.partnerBdmName
  );

  const partnerBdmName = 
    deal.partnerBdmName ||
    deal.partner_bdm_name ||
    raw.Partner_BDM_name ||
    raw.Partner_BDM_Names ||
    raw.Partner_BDM_Names_bp ||
    raw.Partner_BDM_Names_st ||
    raw.Partner_BDM ||
    fd.partnerBdmName ||
    '';

  const preGstReceivedNum = receivedAmountNum > 0 ? Number((receivedAmountNum / 1.18).toFixed(2)) : 0;

  const partnerBdmAmount = Number(
    deal.partnerBdmAmount !== undefined && deal.partnerBdmAmount !== null && Number(deal.partnerBdmAmount) > 0 ? deal.partnerBdmAmount :
    deal.partner_bdm_amount !== undefined && deal.partner_bdm_amount !== null && Number(deal.partner_bdm_amount) > 0 ? deal.partner_bdm_amount :
    raw.Partner_BDM_Amount !== undefined && raw.Partner_BDM_Amount !== null && Number(raw.Partner_BDM_Amount) > 0 ? raw.Partner_BDM_Amount :
    raw.Partner_BDM_amount !== undefined && raw.Partner_BDM_amount !== null && Number(raw.Partner_BDM_amount) > 0 ? raw.Partner_BDM_amount :
    raw.partner_bdm_amount !== undefined && raw.partner_bdm_amount !== null && Number(raw.partner_bdm_amount) > 0 ? raw.partner_bdm_amount :
    (hasPartnerBdm && receivedAmountNum > 0 ? Number(((receivedAmountNum / 1.18) / 2).toFixed(2)) : 0)
  );

  // Extract Legal Subform
  const legalSubform = deal.legalData || (Array.isArray(raw.Legal) && raw.Legal.length > 0
    ? raw.Legal.map((lg: any, i: number) => ({
        id: String(lg.id || i + 1),
        schema: lg.Legal_Schemas || lg.Schemas || '',
        tenure: lg.Tenure_of_Service || '',
        docTypes: lg.Types_of_legal_documents || '',
        terms1: lg.Agreement_Terms_I || '',
        terms2: lg.Agreement_Terms_II || '',
        dataChecker: lg.Data_checker_name_subform?.name || lg.Data_checker_name_subform || '',
        dateCheckedDate: lg.Date_checked_date || '',
        dateCheckerStatus: lg.Date_checker_status || '',
        dprStatus: lg.DPR_status || '',
        dateOfDprStatusChange: lg.Date_of_DPR_status_change || '',
        dprTl: lg.Operation_team_leader?.name || lg.Operation_team_leader || '',
        dprMember: lg.Operation_team_member?.name || lg.Operation_team_member || '',
        financeStatus: lg.Finance_status || '',
        dateOfFinanceStatusChange: lg.Date_of_finance_status_change || '',
        financeTl: lg.Finance_team_leader?.name || lg.Finance_team_leader || '',
        financeMember: lg.Finance_team_member?.name || lg.Finance_team_member || '',
        legalStatus: lg.Internal_legal_status || '',
        internalTeamType: lg.Internal_team_type || '',
        qualityProvided: lg.Quality_provided || '',
        distributionPaid: lg.Distribution_of_amount_paid_by_the_S || lg.Distribution_of_amount_paid_by_ || '',
        remark: lg.Remark || ''
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
      if (targetZohoId) {
        const res = await uploadZohoAttachmentToDeal(targetZohoId, file, file.name);
        if (res.success) {
          setUploadToast({ type: 'success', message: `"${file.name}" uploaded to Zoho CRM successfully!` });
          await loadAttachments(targetZohoId);
        } else {
          setUploadToast({ type: 'error', message: res.message || 'Failed to upload document to Zoho CRM.' });
        }
      } else {
        const docId = `${deal?.id || id || 'deal'}_${Date.now()}_${file.name}`;
        await saveDocument(docId, file);
        const newDoc = { id: docId, name: file.name, size: file.size, type: file.type };
        const updatedDocs = [...(deal?.documentsData || []), newDoc];
        const updatedDeal = { ...deal, documentsData: updatedDocs };
        setDeal(updatedDeal);
        await saveDealToIndexedDB(updatedDeal);
        setUploadToast({ type: 'success', message: `"${file.name}" saved locally!` });
      }
    } catch (err: any) {
      console.error('Error uploading document:', err);
      setUploadToast({ type: 'error', message: err?.message || 'Error uploading file.' });
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadToast(null), 4500);
    }
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
              {deal.zohoId && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Cloud size={12} className="mr-1 text-emerald-600" />
                  Zoho #{String(deal.zohoId).slice(-6)}
                </span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                deal.status === 'Won' ? 'bg-emerald-100 text-emerald-800' : 
                deal.status === 'Negotiation' ? 'bg-blue-100 text-blue-800' :
                deal.status === 'Lost' ? 'bg-rose-100 text-rose-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {deal.stage || deal.status || 'Active'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Created on {deal.date || 'Recent'} • Managed by <span className="text-gray-700 font-semibold">{deal.owner || 'Admin'}</span>
              {employeeName && (
                <> • Employee: <span className="text-be-orange font-bold">{employeeName}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2.5">
          <button 
            onClick={() => loadLiveDeal(deal?.zohoId || id || '')}
            disabled={isRefreshing}
            className="flex items-center px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-xs disabled:opacity-60"
            title="Refresh latest live deal fields from Zoho CRM"
          >
            <RefreshCw size={15} className={`mr-1.5 text-be-orange ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Syncing...' : 'Sync from Zoho'}
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
              <span className="text-xs font-normal text-gray-400">Zoho CRM Synchronized</span>
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
                      <span className="text-gray-800 font-semibold">{raw.State}</span>
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
                      const baseNum = Number(s.baseAmount || (totalNum > 0 ? (totalNum * 0.82).toFixed(2) : 0));
                      const gstNum = totalNum > baseNum ? Number((totalNum - baseNum).toFixed(2)) : Number((baseNum * 0.18).toFixed(2));
                      const recNum = s.receivedAmount ? Number(s.receivedAmount) : 0;
                      const pendNum = s.pendingAmount ? Number(s.pendingAmount) : (totalNum > recNum ? totalNum - recNum : 0);

                      return (
                        <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-gray-900">{s.name || 'Website Development'}</div>
                            {s.paymentStages && (
                              <div className="text-[11px] text-gray-400 mt-0.5">Stage: {s.paymentStages} {s.paymentType ? `• ${s.paymentType}` : ''}</div>
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
                          <td className="px-4 py-3.5 text-right font-bold text-emerald-600">
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
                      <td className="px-4 py-3.5 text-right text-emerald-600">₹{receivedAmountNum.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-right text-orange-600">₹{pendingAmountNum.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Legal Subform (if available) */}
          {legalSubform.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <h2 className="text-base font-bold text-gray-900 flex items-center">
                  <ShieldCheck size={18} className="mr-2 text-indigo-600" />
                  Legal Details Subform ({legalSubform.length})
                </h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                  Legal
                </span>
              </div>
              <div className="space-y-3">
                {legalSubform.map((lg: any, idx: number) => (
                  <div key={idx} className="p-4 bg-gray-50/70 rounded-xl border border-gray-100 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">{lg.schema || 'Legal Compliance'}</span>
                      {lg.tenure && <span className="text-gray-500 font-medium">Tenure: {lg.tenure}</span>}
                    </div>
                    {lg.docTypes && <div className="text-gray-600">Document Types: <span className="font-medium text-gray-800">{lg.docTypes}</span></div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600">
                      {lg.terms1 && <div>Terms I: <span className="text-gray-800 font-medium">{lg.terms1}</span></div>}
                      {lg.terms2 && <div>Terms II: <span className="text-gray-800 font-medium">{lg.terms2}</span></div>}
                      {lg.dataChecker && <div>Data Checker: <span className="text-gray-800 font-medium">{lg.dataChecker}</span> {lg.dateCheckedDate ? `(${new Date(lg.dateCheckedDate).toLocaleDateString('en-GB')})` : ''}</div>}
                      {lg.dprTl && <div>DPR Team: <span className="text-gray-800 font-medium">{lg.dprTl} {lg.dprMember ? `/ ${lg.dprMember}` : ''}</span></div>}
                      {lg.financeTl && <div>Finance Team: <span className="text-gray-800 font-medium">{lg.financeTl} {lg.financeMember ? `/ ${lg.financeMember}` : ''}</span></div>}
                      {lg.internalTeamType && <div>Team Type: <span className="text-gray-800 font-medium">{lg.internalTeamType}</span></div>}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {lg.dprStatus && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold">DPR: {lg.dprStatus}</span>}
                      {lg.financeStatus && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-semibold">Finance: {lg.financeStatus}</span>}
                      {lg.legalStatus && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md font-semibold">Legal Status: {lg.legalStatus}</span>}
                      {lg.qualityProvided && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-semibold">Quality: {lg.qualityProvided}</span>}
                    </div>
                    {lg.distributionPaid && <div className="text-gray-500 text-[11px]">Distribution: {lg.distributionPaid}</div>}
                    {lg.remark && <p className="text-gray-500 italic mt-1">Remark: {lg.remark}</p>}
                  </div>
                ))}
              </div>
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
                    {raw.Operation_stages}
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {raw.Operation_team_leader && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Ops Team Leader</span>
                    <span className="font-bold text-gray-900">{raw.Operation_team_leader}</span>
                  </div>
                )}
                {raw.Operation_team_member && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Ops Team Member</span>
                    <span className="font-bold text-gray-900">{raw.Operation_team_member}</span>
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
                    <span className="font-bold text-gray-900">{raw.Quality_team_leader}</span>
                  </div>
                )}
                {(raw.Quality_team_member || raw.Quality_team_mdember) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Quality Member</span>
                    <span className="font-bold text-gray-900">{raw.Quality_team_member || raw.Quality_team_mdember}</span>
                  </div>
                )}
                {raw.Query_by_name && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Query Handled By</span>
                    <span className="font-semibold text-gray-800">{raw.Query_by_name}</span>
                  </div>
                )}
                {(raw.Data_check_employee || raw.Data_checker_name || raw.Data_check_employee1) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Data Checker</span>
                    <span className="font-bold text-gray-900">{raw.Data_check_employee || raw.Data_checker_name || raw.Data_check_employee1}</span>
                    {raw.Date_checker_status && <span className="text-[10px] text-emerald-600 block mt-0.5">Status: {raw.Date_checker_status}</span>}
                  </div>
                )}
                {raw.DPR_creator && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">DPR Creator</span>
                    <span className="font-bold text-gray-900">{raw.DPR_creator}</span>
                    {raw.DPR_status && <span className="text-[10px] text-blue-600 block mt-0.5">DPR: {raw.DPR_status}</span>}
                  </div>
                )}
                {raw.Finance_creator && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block mb-0.5">Finance Creator</span>
                    <span className="font-bold text-gray-900">{raw.Finance_creator}</span>
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
                    {raw.Internal_legal_status}
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
                    <span className="font-semibold text-gray-900">{raw.LLP_stages}</span>
                  </div>
                )}
                {raw.LLP_Finance_stages && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Pvt / LLP Stage:</span>
                    <span className="font-semibold text-gray-900">{raw.LLP_Finance_stages}</span>
                  </div>
                )}
                {raw.LLP_application_stages && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Application Stage:</span>
                    <span className="font-semibold text-gray-900">{raw.LLP_application_stages}</span>
                  </div>
                )}
                {(raw.Legal_documents_sender_name || raw.Employee_name_sent1 || raw.Employee_name_sent) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Docs Sent By:</span>
                    <span className="font-semibold text-gray-900">{raw.Legal_documents_sender_name || raw.Employee_name_sent1 || raw.Employee_name_sent}</span>
                  </div>
                )}
                {(raw.Legal_documents_receiver_name || raw.Employee_name_received1 || raw.Employee_name_received) && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-gray-400">Docs Received By:</span>
                    <span className="font-semibold text-gray-900">{raw.Legal_documents_receiver_name || raw.Employee_name_received1 || raw.Employee_name_received}</span>
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

          {/* Payment Rounds & Installment Cycles (R1 / R2 / R3) */}
          {(raw.R1 || raw.R1_Received_Amount || raw.R1_application_status || raw.R1_Payment_Date || raw.R2 || raw.R2_Received_Amount || raw.R2_application_status || raw.R3 || raw.Remaining_1 || raw.Remaining_2) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center">
                  <Receipt size={18} className="mr-2 text-be-orange" />
                  Installment Rounds & Payment Cycles
                </h2>
                <div className="flex gap-2 text-[11px]">
                  {raw.Remaining_1 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-semibold">Remaining 1</span>}
                  {raw.Remaining_2 && <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-md font-semibold">Remaining 2</span>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* Round 1 */}
                <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-gray-900">Round 1 (R1)</span>
                    {raw.R1_Payment_verifications !== undefined && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${raw.R1_Payment_verifications ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {raw.R1_Payment_verifications ? 'Verified' : 'Unverified'}
                      </span>
                    )}
                  </div>
                  {raw.R1_Received_Amount && (
                    <div className="text-base font-bold text-emerald-600">
                      ₹{Number(raw.R1_Received_Amount).toLocaleString('en-IN')}
                    </div>
                  )}
                  {raw.R1_Payment_Date && (
                    <div className="text-gray-500">Date: <span className="font-medium text-gray-800">{new Date(raw.R1_Payment_Date).toLocaleDateString('en-GB')}</span></div>
                  )}
                  {raw.R1_application_status && (
                    <div className="text-gray-500">App Status: <span className="font-medium text-gray-800">{raw.R1_application_status}</span></div>
                  )}
                  {raw.R1_DPR_status && (
                    <div className="text-gray-500">DPR Status: <span className="font-medium text-gray-800">{raw.R1_DPR_status}</span></div>
                  )}
                  {raw.R1_Bank_details && (
                    <div className="text-gray-500">Bank: <span className="font-medium text-gray-800">{raw.R1_Bank_details}</span></div>
                  )}
                  {raw.R1_Accounts_remark && (
                    <p className="text-gray-600 text-[11px] italic pt-1 border-t border-gray-200/60">{raw.R1_Accounts_remark}</p>
                  )}
                </div>

                {/* Round 2 */}
                {(raw.R2 || raw.R2_Received_Amount || raw.R2_application_status || raw.R2_Payment_Date) && (
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">Round 2 (R2)</span>
                      {raw.R2_Payment_verifications !== undefined && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${raw.R2_Payment_verifications ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {raw.R2_Payment_verifications ? 'Verified' : 'Unverified'}
                        </span>
                      )}
                    </div>
                    {raw.R2_Received_Amount && (
                      <div className="text-base font-bold text-emerald-600">
                        ₹{Number(raw.R2_Received_Amount).toLocaleString('en-IN')}
                      </div>
                    )}
                    {raw.R2_Payment_Date && (
                      <div className="text-gray-500">Date: <span className="font-medium text-gray-800">{new Date(raw.R2_Payment_Date).toLocaleDateString('en-GB')}</span></div>
                    )}
                    {raw.R2_application_status && (
                      <div className="text-gray-500">App Status: <span className="font-medium text-gray-800">{raw.R2_application_status}</span></div>
                    )}
                    {raw.R2_DPR_status && (
                      <div className="text-gray-500">DPR Status: <span className="font-medium text-gray-800">{raw.R2_DPR_status}</span></div>
                    )}
                    {raw.R2_Bank_details && (
                      <div className="text-gray-500">Bank: <span className="font-medium text-gray-800">{raw.R2_Bank_details}</span></div>
                    )}
                    {raw.R2_Accounts_remark && (
                      <p className="text-gray-600 text-[11px] italic pt-1 border-t border-gray-200/60">{raw.R2_Accounts_remark}</p>
                    )}
                  </div>
                )}

                {/* Round 3 */}
                {(raw.R3 || raw.R3_application_status || raw.R3_DPR_status || raw.R3_finance_status) && (
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">Round 3 (R3)</span>
                    </div>
                    {raw.R3_application_status && (
                      <div className="text-gray-500">App Status: <span className="font-medium text-gray-800">{raw.R3_application_status}</span></div>
                    )}
                    {raw.R3_DPR_status && (
                      <div className="text-gray-500">DPR Status: <span className="font-medium text-gray-800">{raw.R3_DPR_status}</span></div>
                    )}
                    {raw.R3_finance_status && (
                      <div className="text-gray-500">Finance Status: <span className="font-medium text-gray-800">{raw.R3_finance_status}</span></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

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
                    <p className="text-gray-700">{raw.Reassignment_Reason}</p>
                  </div>
                )}
                {raw.Reason_for_complimentary && (
                  <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100 space-y-1">
                    <span className="font-bold text-purple-900 block">Complimentary Reason:</span>
                    <p className="text-gray-700">{raw.Reason_for_complimentary}</p>
                  </div>
                )}
                {raw.Reason_For_Loss__s && (
                  <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-100 space-y-1">
                    <span className="font-bold text-rose-600 block">Reason for Loss:</span>
                    <p className="text-gray-800 font-semibold">{raw.Reason_For_Loss__s}</p>
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
                    {raw.Status_qd && <div className="font-semibold text-gray-900">Status: {raw.Status_qd}</div>}
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
          {(raw.Accounts_remark || raw.Customer_update || raw.Google_remark || raw.Google_review || raw.Google_reviews || raw.Description || raw.Remark) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center">
                <FileText size={18} className="mr-2 text-be-orange" />
                Remarks & Activity Updates
              </h2>
              <div className="space-y-3 text-xs">
                {raw.Accounts_remark && (
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 text-amber-900">
                    <span className="font-bold block mb-1">Accounts Remark:</span>
                    <p className="text-gray-700 leading-relaxed">{raw.Accounts_remark}</p>
                  </div>
                )}
                {raw.Customer_update && (
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-blue-900">
                    <span className="font-bold block mb-1">Customer Update:</span>
                    <p className="text-gray-700 leading-relaxed">{raw.Customer_update}</p>
                  </div>
                )}
                {(raw.Google_remark || raw.Google_review || raw.Google_reviews) && (
                  <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-emerald-900">
                    <span className="font-bold block mb-1">Google Review / Feedback:</span>
                    <p className="text-gray-700 leading-relaxed">{raw.Google_review || raw.Google_reviews || raw.Google_remark}</p>
                  </div>
                )}
                {raw.Remark && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 text-gray-800">
                    <span className="font-bold block mb-1 text-gray-900">General Remark:</span>
                    <p className="text-gray-600 leading-relaxed">{raw.Remark}</p>
                  </div>
                )}
                {raw.Description && (
                  <div className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 text-gray-800">
                    <span className="font-bold block mb-1 text-gray-900">Description:</span>
                    <p className="text-gray-600 leading-relaxed">{raw.Description}</p>
                  </div>
                )}
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
                  <p className="text-[11px] text-gray-400">Live synchronized with Zoho CRM Deals Attachments</p>
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
                  title="Refresh attachments from Zoho CRM"
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
                            <Cloud size={10} className="mr-1" /> Zoho CRM
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
                  <p className="text-[11px] text-gray-400 mt-0.5">Upload invoices, payment proofs, agreements, or PAN/GST certificates to sync with Zoho CRM.</p>
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
        </div>

        {/* Right Column - Financials & Tracking (1 Col) */}
        <div className="space-y-6">
          {/* Financial Summary Card */}
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
                <span className="text-emerald-600">{percentReceived}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${percentReceived}%` }}
                />
              </div>
            </div>

            {/* Received & Pending Widgets */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-100 text-emerald-800 space-y-1">
                <div className="flex items-center text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={13} className="mr-1.5" />
                  Received
                </div>
                <div className="text-base font-bold">
                  ₹{receivedAmountNum.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="p-3.5 bg-orange-50/80 rounded-xl border border-orange-100 text-orange-800 space-y-1">
                <div className="flex items-center text-xs font-semibold text-orange-700">
                  <Clock size={13} className="mr-1.5" />
                  Pending
                </div>
                <div className="text-base font-bold">
                  ₹{pendingAmountNum.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Payment Details (Method, Date, Verification) */}
            <div className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-100 space-y-2 text-xs">
              {(raw.Payment_Type || raw.Payment_status || raw.Payment_stages) && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Payment Status:</span>
                  <span className="font-semibold text-gray-800">{raw.Payment_status || raw.Payment_stages || raw.Payment_Type}</span>
                </div>
              )}
              {raw.Payment_verifications !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Verified:</span>
                  <span className={`font-semibold ${raw.Payment_verifications ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {raw.Payment_verifications ? 'Yes (Verified)' : 'Pending'}
                  </span>
                </div>
              )}
              {(raw.Payment_received_date || raw.Payment_Date) && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Payment Date:</span>
                  <span className="font-medium text-gray-800">
                    {new Date(raw.Payment_received_date || raw.Payment_Date).toLocaleDateString('en-GB')}
                  </span>
                </div>
              )}
              {raw.If_partially_paid && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Partially Paid:</span>
                  <span className="font-semibold text-orange-600">{raw.If_partially_paid}</span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <button 
                onClick={() => navigate('/crm/deals')} 
                className="w-full flex items-center justify-center px-4 py-2.5 bg-be-orange text-white rounded-xl text-xs font-bold hover:bg-be-orangeHover transition-all shadow-sm"
              >
                <CreditCard size={14} className="mr-2" /> Record / Update Payment
              </button>
            </div>
          </div>

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
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-500 font-medium">Primary BDM:</span>
                  <div className="text-right">
                    <span className="font-bold text-gray-900">{primaryBdmName}</span>
                    <span className="block text-[10px] text-gray-400 font-normal">Deal Owner / Primary</span>
                  </div>
                </div>

                {/* Partner BDM Section */}
                {hasPartnerBdm && (
                  <>
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                      <span className="text-purple-700 font-semibold flex items-center">
                        <Users size={12} className="mr-1 text-purple-600" />
                        Partner BDM:
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                          {partnerBdmName || 'Unassigned Partner'}
                        </span>
                        <span className="block text-[10px] text-purple-600 font-medium mt-0.5">50% Shareholder</span>
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
                <span className="font-bold text-gray-900">{deal.stage || deal.status || 'Operations'}</span>
              </div>
              {raw.Pipeline && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Pipeline:</span>
                  <span className="font-medium text-gray-800">{raw.Pipeline}</span>
                </div>
              )}
              {raw.ID_of_application && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Application ID:</span>
                  <span className="font-mono font-bold text-gray-900">{raw.ID_of_application}</span>
                </div>
              )}
              {raw.Lead_Source && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Lead Source:</span>
                  <span className="font-medium text-gray-800">{raw.Lead_Source}</span>
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
                  <span className="font-semibold text-be-orange">{raw.Choose_Wisely}</span>
                </div>
              )}
              {employeeName && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-400">Employee (Lookup):</span>
                  <span className="font-bold text-be-orange bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{employeeName}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-400">Deal Owner:</span>
                <span className="font-bold text-gray-900">{deal.owner || 'Admin'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-400">Sync Source:</span>
                <span className="font-medium text-gray-800">{deal.source || 'Zoho CRM'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
