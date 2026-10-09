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
  // If explicitly false or unverified in any flag, return false
  if (d.paymentVerified === false || d.Payment_verifications === false) return false;
  if (d.rawZohoDeal?.Payment_verifications === false || d.rawZohoDeal?.Payment_verifications === 'false' || d.rawZohoDeal?.Payment_verifications === 'No' || d.rawZohoDeal?.Payment_verifications === 'Unverified') return false;

  return Boolean(
    d.paymentVerified === true ||
    d.paymentVerified === 'true' ||
    d.paymentVerified === 'Verified' ||
    d.Payment_verifications === true ||
    d.Payment_verifications === 'true' ||
    d.Payment_verifications === 'Verified' ||
    d.Payment_verifications === 'Yes' ||
    d.rawZohoDeal?.Payment_verifications === true ||
    d.rawZohoDeal?.Payment_verifications === 'true' ||
    d.rawZohoDeal?.Payment_verifications === 'Verified' ||
    d.rawZohoDeal?.Payment_verifications === 'Yes'
  );
};

export const getDealVerifiedReceivedAmount = (d: any): number => {
  if (!isDealPaymentVerified(d)) return 0;
  return getDealReceivedAmount(d);
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
    const sRec = d.servicesData.reduce((sum: number, sf: any) => sum + parseNum(sf.receivedAmount || sf.Received_amount || sf.Received), 0);
    if (sRec > 0) return sRec;
  }
  if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
    const sRec = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => sum + parseNum(sf.Received_amount || sf.Received), 0);
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
    const sPend = d.servicesData.reduce((sum: number, sf: any) => sum + parseNum(sf.pendingAmount || sf.Pending_amount || sf.Pending), 0);
    if (sPend > 0) return sPend;
  }
  if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
    const sPend = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => sum + parseNum(sf.Pending_amount || sf.Pending), 0);
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
    const sTotal = d.servicesData.reduce((sum: number, sf: any) => {
      const a = parseNum(sf.totalAmount || sf.Agreement_amount || sf.Total_amount || sf.Total || sf.Amount);
      const b = parseNum(sf.baseAmount || sf.Without_GST || sf.Base);
      const itemTotal = a || (b > 0 ? Number((b * 1.18).toFixed(2)) : 0);
      return sum + itemTotal;
    }, 0);
    if (sTotal > 0) return sTotal;
  }
  if (Array.isArray(d.rawZohoDeal?.Subform_1) && d.rawZohoDeal.Subform_1.length > 0) {
    const sTotal = d.rawZohoDeal.Subform_1.reduce((sum: number, sf: any) => {
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
  const rec = getDealReceivedAmount(d);
  const pend = getDealPendingAmount(d);
  if (rec + pend > 0) return rec + pend;
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
  return (
    d.employeeName ||
    d.salesEmployee ||
    (typeof d.Employee === 'object' && d.Employee !== null ? d.Employee.name : '') ||
    (typeof d.rawZohoDeal?.Employee === 'object' && d.rawZohoDeal.Employee !== null ? d.rawZohoDeal.Employee.name : '') ||
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
  return (
    d.employeeZohoId ||
    d.empId ||
    (typeof d.Employee === 'object' && d.Employee !== null ? String(d.Employee.id || '') : '') ||
    (typeof d.rawZohoDeal?.Employee === 'object' && d.rawZohoDeal.Employee !== null ? String(d.rawZohoDeal.Employee.id || '') : '') ||
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

  const oName = getDealPrimaryBdmName(d).trim().toLowerCase();
  const oId = getDealPrimaryBdmId(d).trim().toLowerCase();

  if (userId && oId && userId === oId) return true;
  if (userName && oName) {
    if (userName === oName) return true;
    if (userName.length >= 3 && oName.includes(userName)) return true;
    if (oName.length >= 3 && userName.includes(oName)) return true;
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
