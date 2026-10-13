/**
 * Utility functions for Partner BDM (50/50 Pre-GST Split) calculations,
 * identification, and user-scoped metric resolution.
 */

export interface DealSplitBreakdown {
  hasPartnerBdm: boolean;
  isUserPartner: boolean;
  isUserPrimary: boolean;
  isUserSplitParticipant: boolean;
  isPaymentVerified: boolean;
  partnerName: string;
  partnerId: string;
  primaryName: string;
  primaryId: string;
  fullAmount: number;
  fullReceived: number;
  fullPending: number;
  preGstReceived: number;
  partnerAmount: number;
  primaryAmount: number;
  displayAmount: number;
  displayReceived: number;
  displayPending: number;
  splitBadgeText: string | null;
  // Accounts Payment Verification metrics
  verifiedReceived: number;
  verifiedDisplayReceived: number;
  verifiedPartnerAmount: number;
  verifiedPrimaryAmount: number;
}

const parseNum = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const findFirstPositive = (...vals: any[]): number => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const num = parseNum(v);
    if (num > 0) return num;
  }
  return 0;
};

export const isDealPartnerBdm = (d: any): boolean => {
  if (!d) return false;
  return Boolean(
    d.hasPartnerBdm ||
    d.has_partner_bdm ||
    d.partnerBdmId ||
    d.partner_bdm_id ||
    d.partnerBdmName ||
    d.partner_bdm_name ||
    d.Partner_BDM ||
    d.Partner_BDM_ID ||
    d.Partner_BDM_Name ||
    d.rawZohoDeal?.Has_Partner_BDM ||
    d.rawZohoDeal?.Partner_BDM ||
    d.rawZohoDeal?.Partner_BDM_Name ||
    d.formData?.hasPartnerBdm ||
    d.formData?.has_partner_bdm ||
    d.formData?.partnerBdmId ||
    d.formData?.partnerBdmName
  );
};

export const isDealPaymentVerified = (d: any): boolean => {
  if (!d) return false;

  // 1. Explicitly verified flag on the deal object, form data, or Zoho CRM raw deal
  const isExplicitlyVerified = Boolean(
    d.paymentVerified === true ||
    d.paymentVerified === 'true' ||
    d.paymentVerified === 'Verified' ||
    d.paymentVerified === 'Yes' ||
    d.Payment_verifications === true ||
    d.Payment_verifications === 'true' ||
    d.Payment_verifications === 'Verified' ||
    d.Payment_verifications === 'Yes' ||
    d.rawZohoDeal?.Payment_verifications === true ||
    d.rawZohoDeal?.Payment_verifications === 'true' ||
    d.rawZohoDeal?.Payment_verifications === 'Verified' ||
    d.rawZohoDeal?.Payment_verifications === 'Yes'
  );

  if (isExplicitlyVerified) {
    return true;
  }

  // 2. Evaluate stage progression
  const rawStage = String(d.stage || d.Stage || d.status || d.rawZohoDeal?.Stage || '').toLowerCase().trim();

  // If deal is in Account(s) stage and payment verification is unchecked, it is strictly pending verification
  if (rawStage.includes('account')) {
    return false;
  }

  // Deals that have progressed beyond Account (Legal, Operations allocator, Operations executors, Quality, Won, Closed Won)
  // have already passed the Accounts verification step in the workflow pipeline
  if (
    rawStage.includes('legal') ||
    rawStage.includes('allocat') ||
    rawStage.includes('execut') ||
    rawStage.includes('qualit') ||
    rawStage.includes('won')
  ) {
    return true;
  }

  // Sales / Draft / New deals that haven't been verified yet
  return false;
};

export const getDealVerifiedReceivedAmount = (d: any): number => {
  if (!isDealPaymentVerified(d)) return 0;
  return getDealReceivedAmount(d);
};

const deduplicateSubforms = (list: any[]): any[] => {
  if (!Array.isArray(list) || list.length === 0) return [];
  const seen = new Set<string>();
  return list.filter((item: any) => {
    const key = (item.Schemas || item.Schema || item.Service_Name || item.Service || item.Business_plan_selected || item.name || 'service').trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getDealReceivedAmount = (d: any): number => {
  if (!d) return 0;
  if (d.rawReceived && d.rawReceived > 0) return d.rawReceived;
  if (d.totals?.receivedAmount && Number(d.totals.receivedAmount) > 0) return Number(d.totals.receivedAmount);
  if (d.received && d.received !== '₹0') {
    const parsed = parseNum(d.received);
    if (parsed > 0) return parsed;
  }
  if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
    const unique = deduplicateSubforms(d.servicesData);
    const sRec = unique.reduce((sum: number, sf: any) => sum + parseNum(sf.receivedAmount || sf.Received_amount || sf.Received), 0);
    if (sRec > 0) return sRec;
  }
  if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
    const unique = deduplicateSubforms(d.rawZohoDeal.Subform_1);
    const sRec = unique.reduce((sum: number, sf: any) => sum + parseNum(sf.Received_amount || sf.Received), 0);
    if (sRec > 0) return sRec;
  }
  if (d.rawZohoDeal) {
    const zRec = findFirstPositive(
      d.rawZohoDeal.Total_Received_Amount,
      d.rawZohoDeal.Deal_Received_Amount,
      d.rawZohoDeal.Received_amount,
      d.rawZohoDeal.Received_Amount,
      d.rawZohoDeal.Received,
      d.rawZohoDeal.Amount_After_disbursement
    );
    if (zRec > 0) return zRec;
  }
  return 0;
};

export const getDealPendingAmount = (d: any): number => {
  if (!d) return 0;
  if (d.rawPending && d.rawPending > 0) return d.rawPending;
  if (d.totals?.pendingAmount && Number(d.totals.pendingAmount) > 0) return Number(d.totals.pendingAmount);
  if (d.pending && d.pending !== '₹0') {
    const parsed = parseNum(d.pending);
    if (parsed > 0) return parsed;
  }
  if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
    const unique = deduplicateSubforms(d.servicesData);
    const sPend = unique.reduce((sum: number, sf: any) => sum + parseNum(sf.pendingAmount || sf.Pending_amount || sf.Pending), 0);
    if (sPend > 0) return sPend;
  }
  if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
    const unique = deduplicateSubforms(d.rawZohoDeal.Subform_1);
    const sPend = unique.reduce((sum: number, sf: any) => sum + parseNum(sf.Pending_amount || sf.Pending), 0);
    if (sPend > 0) return sPend;
  }
  if (d.rawZohoDeal) {
    const zPend = findFirstPositive(
      d.rawZohoDeal.Total_Pending_Amount,
      d.rawZohoDeal.Deal_Pending_Amount,
      d.rawZohoDeal.Pending_amount,
      d.rawZohoDeal.Pending_Amount,
      d.rawZohoDeal.Pending
    );
    if (zPend > 0) return zPend;
  }
  const amt = getDealTotalAmount(d);
  const rec = getDealReceivedAmount(d);
  if (amt > rec && rec > 0) return Number((amt - rec).toFixed(2));
  return 0;
};

export const getDealTotalAmount = (d: any): number => {
  if (!d) return 0;
  if (d.rawAmount && d.rawAmount > 0) return d.rawAmount;
  if (d.totals?.grandTotal && Number(d.totals.grandTotal) > 0) return Number(d.totals.grandTotal);
  if (d.amount && d.amount !== '₹0') {
    const parsed = parseNum(d.amount);
    if (parsed > 0) return parsed;
  }
  if (Array.isArray(d.servicesData) && d.servicesData.length > 0) {
    const unique = deduplicateSubforms(d.servicesData);
    const sTotal = unique.reduce((sum: number, sf: any) => {
      const a = parseNum(sf.totalAmount || sf.Agreement_amount || sf.Total_amount || sf.Total || sf.Amount);
      const b = parseNum(sf.baseAmount || sf.Without_GST || sf.Base);
      const itemTotal = a || (b > 0 ? Number((b * 1.18).toFixed(2)) : 0);
      return sum + itemTotal;
    }, 0);
    if (sTotal > 0) return sTotal;
  }
  if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
    const unique = deduplicateSubforms(d.rawZohoDeal.Subform_1);
    const sTotal = unique.reduce((sum: number, sf: any) => {
      const a = parseNum(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount);
      const b = parseNum(sf.Without_GST || sf.baseAmount || sf.Base);
      const itemTotal = a || (b > 0 ? Number((b * 1.18).toFixed(2)) : 0);
      return sum + itemTotal;
    }, 0);
    if (sTotal > 0) return sTotal;
  }
  if (d.rawZohoDeal) {
    const zAmt = findFirstPositive(
      d.rawZohoDeal.Total_deal_amount_inclusive_of_gst,
      d.rawZohoDeal.Amount,
      d.rawZohoDeal.Deal_Amount,
      d.rawZohoDeal.Grand_Total,
      d.rawZohoDeal.Grand_total,
      d.rawZohoDeal.GrandTotal,
      d.rawZohoDeal.Total_amount,
      d.rawZohoDeal.Total_Amount,
      d.rawZohoDeal.total_amount,
      d.rawZohoDeal.Agreement_amount,
      d.rawZohoDeal.Agreement_Amount,
      d.rawZohoDeal.Amount_Without_GST ? parseNum(d.rawZohoDeal.Amount_Without_GST) * 1.18 : 0,
      d.rawZohoDeal.Deal_Amount_Without_GST ? parseNum(d.rawZohoDeal.Deal_Amount_Without_GST) * 1.18 : 0,
      d.rawZohoDeal.Subtotal ? parseNum(d.rawZohoDeal.Subtotal) * 1.18 : 0,
      d.rawZohoDeal.Amount_After_disbursement,
      d.rawZohoDeal.amount_if_you_have_kindly_put_0
    );
    if (zAmt > 0) return zAmt;
  }
  if (d.totals?.baseAmount && Number(d.totals.baseAmount) > 0) {
    return Number((Number(d.totals.baseAmount) * 1.18).toFixed(2));
  }
  if (d.rawPending && d.rawReceived) {
    const sum = Number(d.rawPending) + Number(d.rawReceived);
    if (sum > 0) return sum;
  }
  const rec = getDealReceivedAmount(d);
  if (rec > 0) return rec;
  return 0;
};

export const getDealPartnerBdmName = (d: any): string => {
  if (!d) return '';
  return (
    d.partnerBdmName ||
    d.partner_bdm_name ||
    d.Partner_BDM_Name ||
    d.rawZohoDeal?.Partner_BDM_Name ||
    d.rawZohoDeal?.Partner_BDM_name ||
    d.rawZohoDeal?.Partner_BDM_Names ||
    d.rawZohoDeal?.Partner_BDM_Names_bp ||
    d.rawZohoDeal?.Partner_BDM_Names_st ||
    (typeof d.Partner_BDM === 'object' && d.Partner_BDM !== null ? d.Partner_BDM.name : '') ||
    (typeof d.rawZohoDeal?.Partner_BDM === 'object' && d.rawZohoDeal.Partner_BDM !== null ? d.rawZohoDeal.Partner_BDM.name : '') ||
    d.formData?.partnerBdmName ||
    ''
  );
};

export const getDealPartnerBdmId = (d: any): string => {
  if (!d) return '';
  return (
    d.partnerBdmId ||
    d.partner_bdm_id ||
    d.Partner_BDM_ID ||
    d.rawZohoDeal?.Partner_BDM_ID ||
    d.rawZohoDeal?.partner_bdm_id ||
    (typeof d.Partner_BDM === 'object' && d.Partner_BDM !== null ? String(d.Partner_BDM.id || '') : '') ||
    (typeof d.rawZohoDeal?.Partner_BDM === 'object' && d.rawZohoDeal.Partner_BDM !== null ? String(d.rawZohoDeal.Partner_BDM.id || '') : '') ||
    d.formData?.partnerBdmId ||
    ''
  );
};

export const getDealPrimaryBdmName = (d: any): string => {
  if (!d) return '';
  const empName = typeof d.Employee === 'object' && d.Employee !== null ? d.Employee.name : (typeof d.Employee === 'string' ? d.Employee : '');
  const rawEmpName = typeof d.rawZohoDeal?.Employee === 'object' && d.rawZohoDeal?.Employee !== null ? d.rawZohoDeal.Employee.name : (typeof d.rawZohoDeal?.Employee === 'string' ? d.rawZohoDeal.Employee : '');
  return (
    d.employeeName ||
    d.salesEmployee ||
    empName ||
    rawEmpName ||
    (typeof d.rawZohoDeal?.Owner === 'object' && d.rawZohoDeal.Owner !== null ? d.rawZohoDeal.Owner.name : '') ||
    d.owner ||
    d.rawZohoDeal?.Owner ||
    d.rawZohoDeal?.salesEmployee ||
    d.formData?.employeeName ||
    d.formData?.salesEmployee ||
    'Admin'
  );
};

export const getDealPrimaryBdmId = (d: any): string => {
  if (!d) return '';
  const empId = typeof d.Employee === 'object' && d.Employee !== null ? String(d.Employee.id || '') : (typeof d.Employee === 'string' && /^\d+$/.test(d.Employee) ? d.Employee : '');
  const rawEmpId = typeof d.rawZohoDeal?.Employee === 'object' && d.rawZohoDeal?.Employee !== null ? String(d.rawZohoDeal.Employee.id || '') : '';
  return (
    d.employeeZohoId ||
    d.empId ||
    empId ||
    rawEmpId ||
    d.rawZohoDeal?.Employment_ID ||
    d.rawZohoDeal?.Employee_Code ||
    d.formData?.employeeZohoId ||
    d.formData?.empId ||
    ''
  );
};

export const isUserPartnerBdm = (d: any, user: any): boolean => {
  if (!d || !user || !isDealPartnerBdm(d)) return false;
  const userName = (user.name || '').trim().toLowerCase();
  const userId = String(user.empId || user.id || user.zohoId || '').trim().toLowerCase();

  const pName = getDealPartnerBdmName(d).trim().toLowerCase();
  const pId = getDealPartnerBdmId(d).trim().toLowerCase();

  if (userId && pId && userId === pId) return true;
  if (userName && pName) {
    if (userName === pName) return true;
    if (userName.length >= 3 && pName.includes(userName)) return true;
    if (pName.length >= 3 && userName.includes(pName)) return true;
  }
  return false;
};

export const isUserPrimaryBdm = (d: any, user: any): boolean => {
  if (!d || !user) return false;
  const userName = (user.name || '').trim().toLowerCase();
  const userId = String(user.empId || user.id || user.zohoId || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();

  const oName = getDealPrimaryBdmName(d).trim().toLowerCase();
  const oId = getDealPrimaryBdmId(d).trim().toLowerCase();
  const oEmail = String(d.employeeEmail || d.formData?.employeeEmail || d.userEmail || d.formData?.userEmail || '').trim().toLowerCase();

  if (userId && oId && userId === oId) return true;
  if (userEmail && oEmail && userEmail === oEmail) return true;
  if (userName && oName) {
    if (userName === oName) return true;
    if (userName.length >= 3 && oName.includes(userName)) return true;
    if (oName.length >= 3 && userName.includes(oName)) return true;
  }
  const altNames = [
    d.salesEmployee,
    d.employeeName,
    d.formData?.salesEmployee,
    d.formData?.employeeName,
    typeof d.Employee === 'object' ? d.Employee?.name : d.Employee,
    typeof d.rawZohoDeal?.Employee === 'object' ? d.rawZohoDeal.Employee?.name : d.rawZohoDeal?.Employee
  ].filter(Boolean);
  for (const alt of altNames) {
    const a = String(alt).trim().toLowerCase();
    if (a && userName && (userName === a || userName.includes(a) || a.includes(userName))) {
      return true;
    }
  }
  return false;
};

/**
 * Calculates complete split breakdown for a deal.
 * If user is specified and is either Partner BDM or Primary BDM, display amounts will be their 50% split share.
 * For Super Admin / HOD (isSuperAdminOrHOD: true), display amounts represent the whole deal.
 */
export const getDealSplitBreakdown = (
  d: any,
  user?: any,
  isSuperAdminOrHOD: boolean = false
): DealSplitBreakdown => {
  const hasPartner = isDealPartnerBdm(d);
  const partnerName = getDealPartnerBdmName(d);
  const partnerId = getDealPartnerBdmId(d);
  const primaryName = getDealPrimaryBdmName(d);
  const primaryId = getDealPrimaryBdmId(d);

  const fullAmount = getDealTotalAmount(d);
  const fullReceived = getDealReceivedAmount(d);
  const fullPending = getDealPendingAmount(d);

  const preGstReceived = fullReceived > 0 ? Number((fullReceived / 1.18).toFixed(2)) : 0;

  // Stored or computed 50% Pre-GST amount
  let partnerAmount = Number(
    d.partnerBdmAmount ||
    d.partner_bdm_amount ||
    d.totals?.partnerBdmAmount ||
    d.rawZohoDeal?.Partner_BDM_Amount ||
    d.rawZohoDeal?.Partner_BDM_amount ||
    d.rawZohoDeal?.partner_bdm_amount ||
    d.formData?.partnerBdmAmount ||
    0
  );

  if (hasPartner && (!partnerAmount || partnerAmount === 0) && fullReceived > 0) {
    partnerAmount = Number(((fullReceived / 1.18) / 2).toFixed(2));
  }

  const primaryAmount = hasPartner ? partnerAmount : fullReceived;

  const isUserPartner = Boolean(user && isUserPartnerBdm(d, user));
  const isUserPrimary = Boolean(user && isUserPrimaryBdm(d, user));
  const isUserSplitParticipant = hasPartner && (isUserPartner || isUserPrimary);

  let displayAmount = fullAmount;
  let displayReceived = fullReceived;
  let displayPending = fullPending;
  let splitBadgeText: string | null = null;

  if (hasPartner) {
    if (!isSuperAdminOrHOD && (isUserPartner || isUserPrimary)) {
      // Both BDMs see half-half
      displayReceived = partnerAmount;
      displayAmount = Number((fullAmount / 2).toFixed(2));
      displayPending = Number((fullPending / 2).toFixed(2));
      splitBadgeText = isUserPartner ? 'Partner BDM (50% Split)' : 'Primary BDM (50% Split)';
    } else if (isSuperAdminOrHOD) {
      splitBadgeText = `50/50 Split (₹${partnerAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} each)`;
    } else {
      splitBadgeText = '50/50 Split Active';
    }
  }

  const isPaymentVerified = isDealPaymentVerified(d);
  const verifiedReceived = isPaymentVerified ? fullReceived : 0;
  const verifiedPartnerAmount = isPaymentVerified ? partnerAmount : 0;
  const verifiedPrimaryAmount = isPaymentVerified ? primaryAmount : 0;
  const verifiedDisplayReceived = isPaymentVerified ? displayReceived : 0;

  return {
    hasPartnerBdm: hasPartner,
    isUserPartner,
    isUserPrimary,
    isUserSplitParticipant,
    isPaymentVerified,
    partnerName,
    partnerId,
    primaryName,
    primaryId,
    fullAmount,
    fullReceived,
    fullPending,
    preGstReceived,
    partnerAmount,
    primaryAmount,
    displayAmount,
    displayReceived,
    displayPending,
    splitBadgeText,
    verifiedReceived,
    verifiedDisplayReceived,
    verifiedPartnerAmount,
    verifiedPrimaryAmount
  };
};

/**
 * Milestone payment configuration for 8 milestone slots (R1 to R8).
 * Matches Zoho CRM Deals module field API names for Amount, Date, Screenshots, Verification, and Bank Type.
 */
export interface DealMilestoneItem {
  index: number;
  label: string;
  tabName: string;
  amount: number;
  date: string;
  bdm1: string;
  bdm2: string;
  screenshot: string;
  isVerified: boolean;
  bankType: 'BSPL' | 'BSAPL' | string;
  hasPayment: boolean;
  isLegalVerified: boolean;
}

export const MILESTONE_CONFIG = [
  { index: 1, tabName: 'R1', label: '1st Payment (R1)', amtField: 'R1_Received_amount23', dateField: 'Closing_Date', ssField: 'R1_Received_Screenshot', bdm1Field: 'R1_Received_by_BDM1', bdm2Field: 'R1_Received_by_BDM2', verifField: 'R1_Payment_Verification', bankField: 'R1_Bank_type', legalVerifField: 'R1_Legal_verification' },
  { index: 2, tabName: 'R2', label: '2nd Payment (R2)', amtField: 'R2_Received_amount12', dateField: 'DPR_status_change_date', ssField: 'R2_Received_Screenshot', bdm1Field: 'R2_Received_by_BDM1', bdm2Field: 'R2_Received_by_BDM2', verifField: 'R2_Payment_Verification', bankField: 'R2_Bank_type', legalVerifField: 'R2_Legal_verification' },
  { index: 3, tabName: 'R3', label: '3rd Payment (R3)', amtField: 'R3_Received_amount', dateField: 'Date_of_status_change', ssField: 'R3_Received_Screenshot', bdm1Field: 'R3_Received_by_BDM1', bdm2Field: 'R3_Received_by_BDM2', verifField: 'R3_Payment_Verification', bankField: 'R3_Bank_type', legalVerifField: 'R3_Legal_verification' },
  { index: 4, tabName: 'R4', label: '4th Payment (R4)', amtField: 'R4_Received_amount', dateField: 'Date_of_status_change_f', ssField: 'R4_Received_Screenshot', bdm1Field: 'R4_Received_by_BDM1', bdm2Field: 'R4_Received_by_BDM2', verifField: 'R4_Payment_Verification', bankField: 'R4_Bank_type', legalVerifField: 'R4_Legal_verification' },
  { index: 5, tabName: 'R5', label: '5th Payment (R5)', amtField: 'R5_Received_amount', dateField: 'Document_collection_Pitch_deck_creation_DPR_date', ssField: 'R5_Received_Screenshot', bdm1Field: 'R5_Received_by_BDM1', bdm2Field: 'R5_Received_by_BDM2', verifField: 'R5_Payment_Verification', bankField: 'R5_Bank_type', legalVerifField: 'R5_Legal_verification' },
  { index: 6, tabName: 'R6', label: '6th Payment (R6)', amtField: 'R6_Received_amount', dateField: 'Document_sent_date', ssField: 'R6_Received_Screenshot', bdm1Field: 'R6_Received_BDM1', bdm2Field: 'R6_Received_BDM2', verifField: 'R6_Payment_Verification', bankField: 'R6_Bank_type', legalVerifField: 'R6_Legal_verification' },
  { index: 7, tabName: 'R7', label: '7th Payment (R7)', amtField: 'R7_Received_amount', dateField: 'Finance_status_change_date', ssField: 'R7_Received_Screenshot', bdm1Field: 'R7_Received_by_BDM1', bdm2Field: 'R7_Received_by_BDM2', verifField: 'R7_Payment_Verification', bankField: 'R7_Bank_type', legalVerifField: 'R7_Legal_verification' },
] as const;

export const getDealMilestones = (d: any): DealMilestoneItem[] => {
  if (!d) return [];
  const raw = d.rawZohoDeal || {};
  return MILESTONE_CONFIG.map(s => {
    const rawAmt = d[s.amtField] ?? raw[s.amtField] ?? d.formData?.[s.amtField] ??
      d[`R${s.index}_Received_amount`] ?? raw[`R${s.index}_Received_amount`] ??
      d[`R${s.index}_Received_Amount`] ?? raw[`R${s.index}_Received_Amount`] ??
      (s.index === 1 ? (d.R1_Received_amount ?? raw.R1_Received_amount ?? d.R1_Received_Amount ?? raw.R1_Received_Amount) : undefined) ??
      (s.index === 2 ? (d.R2_Received_amount ?? raw.R2_Received_amount ?? d.R2_Received_Amount ?? raw.R2_Received_Amount) : undefined);

    const amtStr = rawAmt !== undefined && rawAmt !== null && rawAmt !== '' ? String(rawAmt).replace(/[^0-9.]/g, '') : '';
    const amt = parseFloat(amtStr) || 0;

    const date = d[s.dateField] ?? raw[s.dateField] ?? d.formData?.[s.dateField] ??
      (s.index === 1 ? (d.Closing_Date ?? raw.Closing_Date ?? d.R1_Payment_Date ?? raw.R1_Payment_Date) : undefined) ??
      (s.index === 2 ? (d.DPR_status_change_date ?? raw.DPR_status_change_date ?? d.R2_Payment_Date ?? raw.R2_Payment_Date) : undefined) ?? '';

    const ss = d[s.ssField] ?? raw[s.ssField] ?? d.formData?.[s.ssField];
    const ssName = Array.isArray(ss) && ss.length > 0 
      ? (ss[0]?.File_Name__s || ss[0]?.name || '') 
      : (typeof ss === 'string' ? ss : '');

    const bdm1Val = d[s.bdm1Field] ?? raw[s.bdm1Field] ?? d.formData?.[s.bdm1Field];
    const bdm1 = typeof bdm1Val === 'object' ? (bdm1Val?.name || '') : String(bdm1Val || '');
    const bdm2Val = d[s.bdm2Field] ?? raw[s.bdm2Field] ?? d.formData?.[s.bdm2Field];
    const bdm2 = typeof bdm2Val === 'object' ? (bdm2Val?.name || '') : String(bdm2Val || '');
    
    // Accounts payment verification boolean check
    const isVerif = Boolean(
      d[s.verifField] === true || d[s.verifField] === 'true' || d[s.verifField] === 'Verified' || d[s.verifField] === 'Yes' ||
      raw[s.verifField] === true || raw[s.verifField] === 'true' || raw[s.verifField] === 'Verified' || raw[s.verifField] === 'Yes' ||
      (s.index === 1 && (d.R1_Payment_verifications === true || d.R1_Payment_verifications === 'true' || raw.R1_Payment_verifications === true || raw.R1_Payment_verifications === 'true')) ||
      (s.index === 2 && (d.R2_Payment_verifications === true || d.R2_Payment_verifications === 'true' || raw.R2_Payment_verifications === true || raw.R2_Payment_verifications === 'true'))
    );

    // Legal verification boolean check (Zoho field: R{i}_Legal_verification)
    const rawLegalVal = d[s.legalVerifField] ?? raw[s.legalVerifField] ?? d.formData?.[s.legalVerifField] ??
      d[`R${s.index}_Legal_verification`] ?? raw[`R${s.index}_Legal_verification`];
    const isLegalVerif = Boolean(
      rawLegalVal === true ||
      rawLegalVal === 'true' ||
      rawLegalVal === 'Verified' ||
      rawLegalVal === 'Yes'
    );

    // Bank type: BSPL or BSAPL
    const bankVal = d[s.bankField] ?? raw[s.bankField] ?? d.formData?.[s.bankField] ??
      (s.index === 1 ? (d.R1_Bank_details ?? raw.R1_Bank_details) : undefined) ??
      (s.index === 2 ? (d.R2_Bank_details ?? raw.R2_Bank_details) : undefined) ??
      d.Bank_details ?? raw.Bank_details ?? '';
    const bankType = String(bankVal || '').trim();

    return {
      index: s.index,
      label: s.label,
      tabName: s.tabName,
      amount: amt,
      date: typeof date === 'string' ? date.split('T')[0] : '',
      bdm1,
      bdm2,
      screenshot: ssName,
      isVerified: isVerif,
      isLegalVerified: isLegalVerif,
      bankType,
      hasPayment: amt > 0,
    };
  });
};

export const hasDealRemainingPayments = (d: any): boolean => {
  if (!d) return false;
  const milestones = getDealMilestones(d);
  return milestones.some(m => m.hasPayment);
};

export const getDealUnverifiedMilestonesCount = (d: any): number => {
  if (!d) return 0;
  const milestones = getDealMilestones(d);
  return milestones.filter(m => m.hasPayment && !m.isVerified).length;
};

export const getDealVerifiedMilestonesCount = (d: any): number => {
  if (!d) return 0;
  const milestones = getDealMilestones(d);
  return milestones.filter(m => m.hasPayment && m.isVerified).length;
};

export const getDealUnverifiedLegalMilestonesCount = (d: any): number => {
  if (!d) return 0;
  const milestones = getDealMilestones(d);
  return milestones.filter(m => m.hasPayment && !m.isLegalVerified).length;
};

export const getDealVerifiedLegalMilestonesCount = (d: any): number => {
  if (!d) return 0;
  const milestones = getDealMilestones(d);
  return milestones.filter(m => m.hasPayment && m.isLegalVerified).length;
};
