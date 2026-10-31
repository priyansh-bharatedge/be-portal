import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Briefcase, IndianRupee, TrendingUp, AlertCircle,
  MoreHorizontal, FolderKanban, RefreshCw, CheckCircle2,
  FileText, Send, Sparkles, ArrowUpRight, Crown, Shield,
  Clock, Calendar, Target, Award, ArrowRight, Layers, Flame,
  Trophy, Star, UserCheck, Medal
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import {
  fetchZohoDeals,
  fetchZohoDealById,
  enrichDealFromZohoRecord,
  fetchZohoClients,
  fetchZohoQueries,
  fetchZohoQuotations,
  fetchZohoEmployees
} from '../../services/zohoService';
import { mapZohoRecordToEmployee } from '../../utils/employeeUtils';
import { parseAnyDateToMs } from '../../services/zohoRbacService';
import {
  getDealSplitBreakdown,
  isDealPartnerBdm,
  getDealTotalAmount,
  getDealReceivedAmount,
  getDealPendingAmount,
  isValidServiceName
} from '../../utils/dealSplitUtils';
import { OperationsDashboardView } from '../../components/crm/OperationsDashboardView';
import { SuperAdminDashboardView } from '../../components/crm/SuperAdminDashboardView';
import { SalesHodDashboardView } from '../../components/crm/SalesHodDashboardView';

export const CrmDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isHOD, isTL, isHR, isOperationsHOD, currentRole, filterRecords } = useAuth();

  const isSuperAdminUser = Boolean(
    isSuperAdmin ||
    currentRole === 'Super Admin' ||
    (currentUser?.role as string) === 'Super Admin' ||
    currentUser?.email?.toLowerCase() === 'superadmin@be.com' ||
    currentUser?.email === 'md@bharat-edge.com'
  );

  const [dashboardSection, setDashboardSection] = useState<'superadmin' | 'crm' | 'operations'>(() => {
    if (isSuperAdminUser) return 'superadmin';
    return 'crm';
  });

  // Instant synchronous hydration from localStorage - zero delay, no flash of 0
  const [deals, setDeals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const octStart = new Date('2026-10-01T00:00:00+05:30').getTime();
          return parsed.filter((d: any) => {
            const raw = d.rawZohoDeal || {};
            const ct = d.Booking_Date || raw.Booking_Date || d.Payment_Date || raw.Payment_Date || d.Closing_Date || d.Created_Time || raw.Created_Time || d.date;
            if (!ct) return true;
            const ms = parseAnyDateToMs(ct);
            return ms !== null ? ms >= octStart : true;
          });
        }
      }
    } catch (e) {}
    return [];
  });

  const [quotations, setQuotations] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_quotations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const octStart = new Date('2026-10-01T00:00:00+05:30').getTime();
          return parsed.filter((q: any) => {
            const raw = q.rawZohoDeal || q;
            const ct = q.Created_Time || raw.Created_Time || q.created_time || q.date;
            if (!ct) return true;
            const ms = parseAnyDateToMs(ct);
            return ms !== null ? ms >= octStart : true;
          });
        }
      }
    } catch (e) {}
    return [];
  });

  const [clients, setClients] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_clients');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const octStart = new Date('2026-10-01T00:00:00+05:30').getTime();
          return parsed.filter((c: any) => {
            const raw = c.rawZohoDeal || c;
            const ct = c.Created_Time || raw.Created_Time || c.created_time || c.addedOn;
            if (!ct) return true;
            const ms = parseAnyDateToMs(ct);
            return ms !== null ? ms >= octStart : true;
          });
        }
      }
    } catch (e) {}
    return [];
  });

  const [queries, setQueries] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_queries');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [employees, setEmployees] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_employees');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<'today' | 'month' | 'all'>('month');
  const [recentTab, setRecentTab] = useState<'deals' | 'quotations'>('deals');

  const parseMoney = (val: any) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const num = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
    const parsed = parseFloat(num);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getDealReceived = (d: any): number => {
    return getDealReceivedAmount(d);
  };

  const getDealPending = (d: any): number => {
    return getDealPendingAmount(d);
  };

  const getDealAmount = (d: any): number => {
    return getDealTotalAmount(d);
  };

  // User-scoped deal amounts (handles 50/50 Partner BDM split for individual BDMs)
  // Accounts workflow: received revenue is ONLY calculated and added to BDM revenue after Payment_verifications is verified
  const getUserDealReceived = (d: any): number => {
    const breakdown = getDealSplitBreakdown(d, currentUser, isSuperAdmin || isHOD);
    return breakdown.verifiedDisplayReceived;
  };

  const getUserDealPending = (d: any): number => {
    const breakdown = getDealSplitBreakdown(d, currentUser, isSuperAdmin || isHOD);
    return breakdown.displayPending;
  };

  const getUserDealAmount = (d: any): number => {
    const breakdown = getDealSplitBreakdown(d, currentUser, isSuperAdmin || isHOD);
    return breakdown.displayAmount;
  };

  const formatCurrencyShort = (amount: number) => {
    if (isNaN(amount) || amount === 0) return '₹0';
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)} k`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const mapZohoDeals = (rawDeals: any[]) => {
    return rawDeals.map((zDeal: any) => {
      let clientName = '';
      if (zDeal.Client_Name && typeof zDeal.Client_Name === 'string' && !/^\(\d+\)$/.test(zDeal.Client_Name.trim())) {
        clientName = zDeal.Client_Name.trim();
      } else if (zDeal.Clients && typeof zDeal.Clients === 'object' && zDeal.Clients.name && !/^\(\d+\)$/.test(zDeal.Clients.name.trim())) {
        clientName = zDeal.Clients.name.trim();
      } else if (zDeal.Company_name && !/^\(\d+\)$/.test(zDeal.Company_name.trim())) {
        clientName = zDeal.Company_name.trim();
      } else if (zDeal.Deal_Name) {
        const parts = zDeal.Deal_Name.split(' - ');
        const candidate = parts[0]?.replace(/^\(|\)$/g, '').trim();
        clientName = candidate && !/^\d+$/.test(candidate) ? candidate : 'Client';
      } else {
        clientName = 'Client';
      }

      let serviceName = '';
      if (isValidServiceName(zDeal.Service_Name, clientName, zDeal.Account_Name?.name || zDeal.Company_name, zDeal.id)) {
        serviceName = zDeal.Service_Name.trim();
      } else if (
        zDeal.Choose_Wisely &&
        zDeal.Choose_Wisely !== 'New Case Booking' &&
        isValidServiceName(zDeal.Choose_Wisely, clientName, zDeal.Account_Name?.name || zDeal.Company_name, zDeal.id)
      ) {
        serviceName = zDeal.Choose_Wisely.trim();
      } else if (isValidServiceName(zDeal.Business_plan_selected, clientName, zDeal.Account_Name?.name || zDeal.Company_name, zDeal.id)) {
        serviceName = zDeal.Business_plan_selected.trim();
      } else if (isValidServiceName(zDeal.Item_Name, clientName, zDeal.Account_Name?.name || zDeal.Company_name, zDeal.id)) {
        serviceName = zDeal.Item_Name.trim();
      }
      if (!serviceName) serviceName = 'General Services';

      const formatRupee = (val: number): string => {
        if (!val || isNaN(val) || val <= 0) return '₹0';
        return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
      };

      const findFirstPositive = (...vals: any[]): number => {
        for (const v of vals) {
          if (v === null || v === undefined) continue;
          const num = parseMoney(v);
          if (num > 0) return num;
        }
        return 0;
      };

      // Sum subform services if available
      let subformTotal = 0;
      let subformReceived = 0;
      let subformPending = 0;
      const seenDashSubforms = new Set<string>();
      const uniqueDashSubforms = Array.isArray(zDeal.Subform_1)
        ? zDeal.Subform_1.filter((sf: any) => {
            const nameKey = (sf.Schemas || sf.Schema || sf.Service_Name || sf.Service || sf.Business_plan_selected || '').trim().toLowerCase();
            if (!nameKey) return true;
            if (seenDashSubforms.has(nameKey)) return false;
            seenDashSubforms.add(nameKey);
            return true;
          })
        : [];

      if (uniqueDashSubforms.length > 0) {
        uniqueDashSubforms.forEach((sf: any) => {
          const a = parseMoney(sf.Agreement_amount || sf.totalAmount || sf.Total_amount || sf.Total || sf.Amount);
          const bg = parseMoney(sf.Without_GST || sf.baseAmount || sf.Base);
          const r = parseMoney(sf.Received_amount || sf.Received);
          const p = parseMoney(sf.Pending_amount || sf.Pending);
          subformTotal += a || (bg > 0 ? Number((bg * 1.18).toFixed(2)) : 0);
          subformReceived += r;
          subformPending += p;
        });
      }

      const totalAmt = findFirstPositive(
        zDeal.Total_deal_amount_inclusive_of_gst,
        zDeal.Amount,
        zDeal.Deal_Amount,
        zDeal.Grand_Total,
        zDeal.Grand_total,
        zDeal.GrandTotal,
        zDeal.Total_amount,
        zDeal.Total_Amount,
        zDeal.total_amount,
        zDeal.Agreement_amount,
        zDeal.Agreement_Amount,
        zDeal.Amount_Without_GST ? parseMoney(zDeal.Amount_Without_GST) * 1.18 : 0,
        zDeal.Deal_Amount_Without_GST ? parseMoney(zDeal.Deal_Amount_Without_GST) * 1.18 : 0,
        zDeal.Subtotal ? parseMoney(zDeal.Subtotal) * 1.18 : 0,
        zDeal.Amount_After_disbursement,
        subformTotal,
        zDeal.Total_Received_Amount,
        zDeal.Deal_Received_Amount,
        zDeal.Received_amount,
        zDeal.Received,
        zDeal.amount_if_you_have_kindly_put_0
      );

      const recAmt = findFirstPositive(
        zDeal.Total_Received_Amount,
        zDeal.Deal_Received_Amount,
        zDeal.Received_amount,
        zDeal.Received_Amount,
        zDeal.Received,
        zDeal.Amount_After_disbursement,
        subformReceived
      );

      const pendAmt = (totalAmt > 0 && recAmt >= totalAmt)
        ? 0
        : (totalAmt > 0 && recAmt > 0)
        ? Math.max(0, Number((totalAmt - recAmt).toFixed(2)))
        : findFirstPositive(
            zDeal.Total_Pending_Amount,
            zDeal.Deal_Pending_Amount,
            zDeal.Pending_amount,
            zDeal.Pending_Amount,
            zDeal.Pending,
            subformPending,
            totalAmt > recAmt ? Number((totalAmt - recAmt).toFixed(2)) : 0
          );

      const stage = zDeal.Stage || 'Sales';
      let status = 'New';
      if (stage === 'Closed Won' || stage === 'Won' || stage.includes('Won') || stage === 'Operations executors') {
        status = 'Won';
      } else if (stage === 'Closed Lost' || stage === 'Lost' || stage.includes('Lost')) {
        status = 'Lost';
      } else if (stage.includes('Negotiat')) {
        status = 'Negotiation';
      } else if (stage.includes('Propos')) {
        status = 'Proposal';
      } else if (stage.includes('Qualif')) {
        status = 'Qualified';
      } else {
        status = stage;
      }

      const hasPartnerBdm = Boolean(
        zDeal.Has_Partner_BDM ||
        zDeal.has_partner_bdm ||
        zDeal.Partner_BDM ||
        zDeal.Partner_BDM_Name ||
        zDeal.partner_bdm_name
      );

      const partnerLookup = typeof zDeal.Partner_BDM === 'object' && zDeal.Partner_BDM !== null ? zDeal.Partner_BDM : null;

      const partnerBdmName =
        partnerLookup?.name ||
        zDeal.Partner_BDM_Name ||
        zDeal.Partner_BDM_name ||
        zDeal.Partner_BDM_Names ||
        zDeal.partner_bdm_name ||
        '';

      const partnerBdmId =
        (partnerLookup?.id ? String(partnerLookup.id) : '') ||
        zDeal.Partner_BDM_ID ||
        zDeal.partner_bdm_id ||
        (typeof zDeal.Partner_BDM === 'string' && /^\d+$/.test(zDeal.Partner_BDM) ? zDeal.Partner_BDM : '') ||
        '';

      const partnerBdmEmail =
        partnerLookup?.email ||
        zDeal.Partner_BDM_Email ||
        zDeal.partner_bdm_email ||
        '';

      const partnerBdmAmount = parseMoney(zDeal.Partner_BDM_Amount || zDeal.partner_bdm_amount || (hasPartnerBdm && recAmt > 0 ? (recAmt / 1.18) / 2 : 0));

      const dealOwnerName = (
        (zDeal.Owner && typeof zDeal.Owner === 'object' ? zDeal.Owner.name : zDeal.Owner) ||
        zDeal.Deal_Owner ||
        zDeal.Owner_Name ||
        zDeal.Created_By?.name ||
        zDeal.Created_By ||
        'Managing Director'
      );

      return {
        id: String(zDeal.id || `DL-${Math.floor(1000 + Math.random() * 9000)}`),
        client: clientName,
        company: zDeal.Company_name || clientName || 'Company',
        service: serviceName,
        amount: formatRupee(totalAmt),
        received: formatRupee(recAmt),
        pending: formatRupee(pendAmt),
        rawAmount: totalAmt,
        rawReceived: recAmt,
        rawPending: pendAmt,
        status,
        stage,
        owner: dealOwnerName,
        hasPartnerBdm,
        partnerBdmName,
        partner_bdm_name: partnerBdmName,
        partnerBdmId,
        partner_bdm_id: partnerBdmId,
        partnerBdmEmail,
        partner_bdm_email: partnerBdmEmail,
        partnerBdmAmount,
        date: zDeal.Booking_Date ? new Date(zDeal.Booking_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        rawDate: zDeal.Booking_Date || zDeal.Created_Time || new Date().toISOString(),
        zohoId: zDeal.id,
        quotationId: zDeal.Quotation?.id || zDeal.quotationId,
        source: zDeal.source || (zDeal.Quotation ? 'Quotation' : 'Direct'),
        Payment_verifications: zDeal.Payment_verifications,
        paymentVerified: zDeal.Payment_verifications === true || zDeal.Payment_verifications === 'true' || zDeal.Payment_verifications === 'Verified' || zDeal.Payment_verifications === 'Yes',
        rawZohoDeal: zDeal
      };
    });
  };

  const loadData = async () => {
    setIsRefreshing(true);
    let currentDealsList: any[] = [];

    // 1. Instant load from LocalStorage
    try {
      const savedDeals = localStorage.getItem('be_deals');
      if (savedDeals) {
        const parsed = JSON.parse(savedDeals);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hydrated = parsed.map((d: any) => {
            const a = getDealAmount(d);
            const r = getDealReceived(d);
            const p = getDealPending(d);
            return {
              ...d,
              amount: a > 0 ? `₹${a.toLocaleString('en-IN')}` : (d.amount || '₹0'),
              received: r > 0 ? `₹${r.toLocaleString('en-IN')}` : (d.received || '₹0'),
              pending: p > 0 ? `₹${p.toLocaleString('en-IN')}` : (d.pending || '₹0'),
              rawAmount: a,
              rawReceived: r,
              rawPending: p,
            };
          });
          currentDealsList = hydrated;
          setDeals(hydrated);
        }
      }

      const savedQuotations = localStorage.getItem('be_quotations');
      if (savedQuotations) setQuotations(JSON.parse(savedQuotations));

      const savedClients = localStorage.getItem('be_clients');
      if (savedClients) setClients(JSON.parse(savedClients));

      const savedQueries = localStorage.getItem('be_queries');
      if (savedQueries) setQueries(JSON.parse(savedQueries));

      const savedEmployees = localStorage.getItem('be_employees');
      if (savedEmployees) setEmployees(JSON.parse(savedEmployees));
    } catch (e) { }

    // 2. Fetch live updates from Zoho CRM
    try {
      const [dealsRes, clientsRes, queriesRes, quotationsRes, empsRes] = await Promise.allSettled([
        fetchZohoDeals({ per_page: 200 }),
        fetchZohoClients({ per_page: 200 }),
        fetchZohoQueries(),
        fetchZohoQuotations(),
        fetchZohoEmployees(),
      ]);

      if (dealsRes.status === 'fulfilled' && dealsRes.value.success && Array.isArray(dealsRes.value.data) && dealsRes.value.data.length > 0) {
        const mappedDeals = mapZohoDeals(dealsRes.value.data);

        const dealMap = new Map<string, any>();
        currentDealsList.forEach(d => {
          if (d.zohoId) dealMap.set(String(d.zohoId), d);
          else if (d.id) dealMap.set(String(d.id), d);
        });

        mappedDeals.forEach(d => {
          const key = String(d.zohoId || d.id);
          const existing = dealMap.get(key);
          dealMap.set(key, { ...existing, ...d });
        });

        const mergedList = Array.from(dealMap.values());
        setDeals(mergedList);
        try { localStorage.setItem('be_deals', JSON.stringify(mergedList)); } catch (e) { }
      }

      if (quotationsRes.status === 'fulfilled' && quotationsRes.value.success && Array.isArray(quotationsRes.value.data)) {
        const fetchedQuotations = quotationsRes.value.data.map((z: any) => ({
          id: z.Name?.match(/QT-\d+/)?.[0] || `QT-${String(z.id).slice(-4)}`,
          client: z.Name ? z.Name.split(' - ')[1] || z.Name : 'Client',
          company: z.Company_Name || z.Name?.split(' - ')[0] || 'N/A',
          amount: z.Grand_Total || (z.Subtotal ? `₹${Number(z.Subtotal).toLocaleString()}` : '₹0'),
          status: z.Status || 'Sent',
          date: z.Created_Time ? new Date(z.Created_Time).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
          zohoId: String(z.id),
          zohoStatus: 'synced',
          owner: z.Owner?.name || z.Created_By?.name || (typeof z.Employee === 'object' ? z.Employee?.name : null) || z.Sales_Representative || currentUser?.name || 'Admin',
          Employee: z.Employee,
          employeeId: typeof z.Employee === 'object' ? z.Employee?.id : (z.Employee || z.Employee_ID || ''),
          employeeZohoId: typeof z.Employee === 'object' ? z.Employee?.id : (z.Employee || ''),
          employeeName: typeof z.Employee === 'object' ? z.Employee?.name : (z.Employee_Name || z.Sales_Representative || z.Owner?.name || currentUser?.name || ''),
          salesEmployee: typeof z.Employee === 'object' ? z.Employee?.name : (z.Sales_Representative || z.Owner?.name || currentUser?.name || ''),
        }));

        setQuotations(prev => {
          const seen = new Set(fetchedQuotations.map(f => f.zohoId).filter(Boolean));
          const merged = [...fetchedQuotations, ...prev.filter(p => !p.zohoId || !seen.has(p.zohoId))];
          try { localStorage.setItem('be_quotations', JSON.stringify(merged)); } catch (e) { }
          return merged;
        });
      }

      if (clientsRes.status === 'fulfilled' && clientsRes.value.success && Array.isArray(clientsRes.value.data)) {
        setClients(clientsRes.value.data);
        try { localStorage.setItem('be_clients', JSON.stringify(clientsRes.value.data.slice(0, 2000))); } catch (e) { }
      }

      if (queriesRes.status === 'fulfilled' && queriesRes.value.success && Array.isArray(queriesRes.value.data)) {
        setQueries(queriesRes.value.data);
        try { localStorage.setItem('be_queries', JSON.stringify(queriesRes.value.data.slice(0, 1000))); } catch (e) { }
      }

      if (empsRes.status === 'fulfilled' && empsRes.value.success && Array.isArray(empsRes.value.data)) {
        const mapped = empsRes.value.data.map(mapZohoRecordToEmployee);
        setEmployees(mapped);
        try { 
          localStorage.setItem('be_employees', JSON.stringify(mapped));
          window.dispatchEvent(new Event('be_employees_updated'));
        } catch (e) { }
      }
    } catch (e) {
      console.error('Dashboard Zoho fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Listen for real-time live deal updates from DealDetails view
  useEffect(() => {
    const handleDealUpdate = (e: any) => {
      const updated = e.detail;
      if (!updated) return;
      setDeals(prevDeals => {
        const idx = prevDeals.findIndex(d =>
          d.id === updated.id ||
          d.zohoId === updated.zohoId ||
          d.id === updated.zohoId ||
          d.zohoId === updated.id ||
          (d.id && updated.id && String(d.id).includes(String(updated.id))) ||
          (d.id && updated.zohoId && String(d.id).includes(String(updated.zohoId)))
        );
        if (idx >= 0) {
          const copy = [...prevDeals];
          copy[idx] = { ...copy[idx], ...updated };
          return copy;
        }
        return [updated, ...prevDeals];
      });
    };
    window.addEventListener('be_deals_updated', handleDealUpdate);
    return () => window.removeEventListener('be_deals_updated', handleDealUpdate);
  }, []);

  // Listen to employee changes (e.g. target updates)
  useEffect(() => {
    const handleEmpUpdate = () => {
      const saved = localStorage.getItem('be_employees');
      if (saved) {
        try { setEmployees(JSON.parse(saved)); } catch (e) { }
      }
    };
    window.addEventListener('be_employees_updated', handleEmpUpdate);
    window.addEventListener('storage', handleEmpUpdate);
    return () => {
      window.removeEventListener('be_employees_updated', handleEmpUpdate);
      window.removeEventListener('storage', handleEmpUpdate);
    };
  }, []);

  // Auto-enrich deals on the Dashboard that have ₹0 amounts
  useEffect(() => {
    const dealsToEnrich = deals.slice(0, 20).filter((d: any) => {
      const hasValidService = isValidServiceName(d.service, d.client, d.company, d.id) &&
        d.service !== 'Services' && d.service !== 'Custom Services' && d.service !== 'General Services';
      const hasValidServicesData = Array.isArray(d.servicesData) && d.servicesData.length > 0 &&
        d.servicesData.some((s: any) => isValidServiceName(s.name, d.client, d.company, d.id));
      const needsServiceEnrichment = !hasValidService || !hasValidServicesData;
      const needsAmountEnrichment = getDealAmount(d) === 0;

      return (needsServiceEnrichment || needsAmountEnrichment) &&
        (d.zohoId || (d.id && String(d.id).length > 8));
    });

    if (dealsToEnrich.length === 0) return;

    dealsToEnrich.forEach((d: any) => {
      const targetId = String(d.zohoId || d.id);
      fetchZohoDealById(targetId).then(res => {
        if (res.success && res.data) {
          const enriched = enrichDealFromZohoRecord(res.data, d);
          if (enriched) {
            setDeals(prevDeals => {
              const idx = prevDeals.findIndex(p => p.id === d.id || p.zohoId === d.zohoId || p.id === d.zohoId || p.zohoId === d.id);
              if (idx >= 0) {
                const copy = [...prevDeals];
                copy[idx] = { ...copy[idx], ...enriched };
                return copy;
              }
              return prevDeals;
            });
          }
        }
      }).catch(() => { });
    });
  }, [deals]);

  // Dates & Helpers
  const now = new Date();
  const todayYMD = now.toISOString().split('T')[0];
  const todayDMY = now.toLocaleDateString('en-GB');
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthName = monthNames[currentMonthIdx];

  const isDealToday = (d: any): boolean => {
    const raw = String(d.rawDate || d.date || d.Booking_Date || '');
    if (!raw) return false;
    if (raw.includes(todayYMD) || raw.includes(todayDMY)) return true;
    try {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) {
        return dt.getDate() === now.getDate() && dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
      }
    } catch (e) { }
    return false;
  };

  const isDealThisMonth = (d: any): boolean => {
    const raw = String(d.rawDate || d.date || d.Booking_Date || '');
    if (!raw) return false;
    try {
      const parts = raw.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (m === currentMonthIdx && (!y || y === currentYear)) return true;
      }
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) {
        return dt.getMonth() === currentMonthIdx && dt.getFullYear() === currentYear;
      }
    } catch (e) { }
    return false;
  };

  // =========================================================================
  // RBAC SCOPED DATA
  // =========================================================================
  const rbacDeals = useMemo(() => filterRecords(deals, 'Deals'), [deals, filterRecords, currentUser]);
  const rbacQuotations = useMemo(() => filterRecords(quotations, 'Quotations'), [quotations, filterRecords, currentUser]);
  const rbacClients = useMemo(() => filterRecords(clients, 'Clients'), [clients, filterRecords, currentUser]);
  const rbacQueries = useMemo(() => filterRecords(queries, 'Raised_Queries'), [queries, filterRecords, currentUser]);

  // 1. QUOTATION ANALYTICS
  const totalQuotationsSent = useMemo(() => {
    return rbacQuotations.length;
  }, [rbacQuotations]);

  const totalQuotationsSentAmount = useMemo(() => {
    return rbacQuotations.reduce((sum, q) => sum + parseMoney(q.amount || q.totals?.grandTotal), 0);
  }, [rbacQuotations]);

  const quotationsConvertedInDeals = useMemo(() => {
    const convertedFromQuotations = rbacQuotations.filter(q =>
      q.status === 'Converted' ||
      rbacDeals.some(d =>
        (d.quotationId && (d.quotationId === q.id || d.quotationId === q.zohoId)) ||
        (d.id && d.id === q.id.replace('QT-', 'DL-')) ||
        (d.client && q.formData?.clientName && d.client.toLowerCase() === q.formData.clientName.toLowerCase())
      )
    ).length;

    const dealsWithQuotationSource = rbacDeals.filter(d =>
      d.source === 'Quotation' || d.quotationId || (d.id && d.id.startsWith('DL-QT'))
    ).length;

    return Math.max(convertedFromQuotations, dealsWithQuotationSource);
  }, [rbacQuotations, rbacDeals]);

  const quotationConversionRate = totalQuotationsSent > 0
    ? Math.min(100, Math.round((quotationsConvertedInDeals / totalQuotationsSent) * 100))
    : 0;

  // 2. REVENUE CALCULATIONS (TODAY, MONTH, ALL-TIME)
  const todayDealsList = useMemo(() => rbacDeals.filter(isDealToday), [rbacDeals]);
  const todayRevenueReceived = useMemo(() => todayDealsList.reduce((sum, d) => sum + getUserDealReceived(d), 0), [todayDealsList, currentUser, isSuperAdmin, isHOD]);
  const todayRevenueBooked = useMemo(() => todayDealsList.reduce((sum, d) => sum + getUserDealAmount(d), 0), [todayDealsList, currentUser, isSuperAdmin, isHOD]);

  const monthDealsList = useMemo(() => rbacDeals.filter(isDealThisMonth), [rbacDeals]);
  const monthRevenueReceived = useMemo(() => monthDealsList.reduce((sum, d) => sum + getUserDealReceived(d), 0), [monthDealsList, currentUser, isSuperAdmin, isHOD]);
  const monthRevenueBooked = useMemo(() => monthDealsList.reduce((sum, d) => sum + getUserDealAmount(d), 0), [monthDealsList, currentUser, isSuperAdmin, isHOD]);

  const totalDealValue = useMemo(() => rbacDeals.reduce((sum, d) => sum + getUserDealAmount(d), 0), [rbacDeals, currentUser, isSuperAdmin, isHOD]);
  const totalReceivedValue = useMemo(() => rbacDeals.reduce((sum, d) => sum + getUserDealReceived(d), 0), [rbacDeals, currentUser, isSuperAdmin, isHOD]);
  const totalPendingValue = useMemo(() => rbacDeals.reduce((sum, d) => sum + getUserDealPending(d), 0), [rbacDeals, currentUser, isSuperAdmin, isHOD]);

  // 3. TARGET VS ACHIEVEMENT FOR HOD & SUPER ADMIN
  const targetScopeEmployees = useMemo(() => {
    if (isHOD && currentUser.department) {
      return employees.filter(e => (e.dept || e.formData?.dept || '').toLowerCase() === currentUser.department.toLowerCase());
    }
    return employees;
  }, [employees, isHOD, currentUser]);

  const totalMonthlyTarget = useMemo(() => {
    const targetSum = targetScopeEmployees.reduce((sum, e) => {
      const t = parseMoney(e.monthlyTarget || e.formData?.monthlyTarget || e.target || e.formData?.target);
      return sum + t;
    }, 0);
    // If no targets explicitly configured yet, fallback to a sensible default (e.g. ₹25L for org or ₹10L for HOD)
    return targetSum > 0 ? targetSum : (isHOD ? 1500000 : 3000000);
  }, [targetScopeEmployees, isHOD]);

  const monthlyRevenueForTarget = monthRevenueBooked > 0 ? monthRevenueBooked : monthRevenueReceived;
  const targetAchievementPercent = totalMonthlyTarget > 0
    ? Math.min(100, Math.round((monthlyRevenueForTarget / totalMonthlyTarget) * 100))
    : 0;

  // 4. TOP 5 HIGHEST SELLING & MOST RECENT SERVICES
  const top5Services = useMemo(() => {
    const servicesMap = new Map<string, { service: string; count: number; totalRevenue: number; receivedRevenue: number; latestDate: string }>();

    rbacDeals.forEach((d) => {
      let sName = d.service || d.Choose_Wisely || 'General Consulting';
      if (!sName || sName === 'N/A' || sName === 'Choose Wisely') sName = 'Business Services';

      const current = servicesMap.get(sName) || {
        service: sName,
        count: 0,
        totalRevenue: 0,
        receivedRevenue: 0,
        latestDate: d.date || ''
      };

      const amt = getUserDealAmount(d);
      const rec = getUserDealReceived(d);

      servicesMap.set(sName, {
        service: sName,
        count: current.count + 1,
        totalRevenue: current.totalRevenue + amt,
        receivedRevenue: current.receivedRevenue + rec,
        latestDate: d.date || current.latestDate
      });
    });

    const list = Array.from(servicesMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.count - a.count)
      .slice(0, 5);

    const maxRevenue = list[0]?.totalRevenue || 1;

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      sharePercent: totalDealValue > 0 ? Math.round((item.totalRevenue / totalDealValue) * 100) : 0,
      relativePercent: Math.round((item.totalRevenue / maxRevenue) * 100)
    }));
  }, [rbacDeals, totalDealValue, currentUser, isSuperAdmin, isHOD]);

  // 5. TOP 5 PERFORMER EMPLOYEES (Fair 50/50 split credited to both Primary and Partner BDMs)
  const top5PerformerEmployees = useMemo(() => {
    const perfMap = new Map<string, {
      id: string;
      name: string;
      role: string;
      dept: string;
      dealsCount: number;
      wonCount: number;
      totalRevenue: number;
      receivedRevenue: number;
      monthlyTarget: number;
      avatarInitials: string;
    }>();

    // 1. Pre-populate from employee directory for rich metadata & targets
    employees.forEach(emp => {
      const targetVal = parseMoney(emp.monthlyTarget || emp.formData?.monthlyTarget || emp.target || emp.formData?.target);
      const nameKey = (emp.name || '').trim().toLowerCase();
      if (nameKey) {
        perfMap.set(nameKey, {
          id: emp.id || `EMP-${Math.floor(100 + Math.random() * 900)}`,
          name: emp.name || 'Sales Staff',
          role: emp.role || emp.designation || 'Sales Representative',
          dept: emp.dept || 'Sales',
          dealsCount: 0,
          wonCount: 0,
          totalRevenue: 0,
          receivedRevenue: 0,
          monthlyTarget: targetVal,
          avatarInitials: (emp.name ?? 'TM').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
        });
      }
    });

    // 2. Aggregate deals data by primary owner and Partner BDM
    rbacDeals.forEach(deal => {
      const splitBreakdown = getDealSplitBreakdown(deal, null, true);
      const isSplit = splitBreakdown.hasPartnerBdm;
      const fullAmt = splitBreakdown.fullAmount;
      const fullRec = splitBreakdown.verifiedReceived;
      const pAmt = splitBreakdown.verifiedPartnerAmount;
      const primaryAmt = isSplit ? Math.round(fullAmt / 2) : fullAmt;
      const primaryRec = isSplit ? pAmt : fullRec;

      const isWon = deal.status === 'Won' || deal.stage?.includes('Won') || deal.stage === 'Operations executors';

      const rawOwnerName = (splitBreakdown.primaryName || deal.owner || deal.Deal_Owner || deal.bdm || deal.createdBy || 'Managing Director').trim();
      const ownerKey = rawOwnerName.toLowerCase();

      let ownerEntry = perfMap.get(ownerKey);
      if (!ownerEntry) {
        ownerEntry = {
          id: splitBreakdown.primaryId || `EMP-${Math.floor(100 + Math.random() * 900)}`,
          name: rawOwnerName,
          role: 'Sales Representative',
          dept: 'Sales',
          dealsCount: 0,
          wonCount: 0,
          totalRevenue: 0,
          receivedRevenue: 0,
          monthlyTarget: 0,
          avatarInitials: (rawOwnerName || 'SR').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
        };
        perfMap.set(ownerKey, ownerEntry);
      }

      ownerEntry.dealsCount += 1;
      if (isWon) ownerEntry.wonCount += 1;
      ownerEntry.totalRevenue += primaryAmt;
      ownerEntry.receivedRevenue += primaryRec;

      // Also track Partner BDM contribution (50/50 Split)
      if (isSplit && splitBreakdown.partnerName) {
        const pKey = splitBreakdown.partnerName.trim().toLowerCase();
        let pEntry = perfMap.get(pKey);
        if (!pEntry) {
          pEntry = {
            id: splitBreakdown.partnerId || `EMP-${Math.floor(100 + Math.random() * 900)}`,
            name: splitBreakdown.partnerName,
            role: 'Partner BDM',
            dept: 'Sales',
            dealsCount: 0,
            wonCount: 0,
            totalRevenue: 0,
            receivedRevenue: 0,
            monthlyTarget: 0,
            avatarInitials: (splitBreakdown.partnerName || 'PB').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
          };
          perfMap.set(pKey, pEntry);
        }
        pEntry.dealsCount += 1;
        if (isWon) pEntry.wonCount += 1;
        pEntry.totalRevenue += Math.round(fullAmt / 2);
        pEntry.receivedRevenue += pAmt;
      }
    });

    let list = Array.from(perfMap.values());

    // Sort descending by total closed / pipeline deal value
    const sorted = list
      .filter(e => e.totalRevenue > 0 || e.dealsCount > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.dealsCount - a.dealsCount)
      .slice(0, 5);

    // Fallback if low deals in initial setup: show registered sales employees
    if (sorted.length === 0) {
      const fallback = employees.slice(0, 5).map((emp) => ({
        id: emp.id,
        name: emp.name,
        role: emp.role || 'Sales Representative',
        dept: emp.dept || 'Sales',
        dealsCount: 0,
        wonCount: 0,
        totalRevenue: 0,
        receivedRevenue: 0,
        monthlyTarget: parseMoney(emp.monthlyTarget || emp.target),
        avatarInitials: (emp.name ?? 'TM').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
        targetAchievementPercent: 0,
        relativePercent: 0
      }));
      return fallback.map((item, idx) => ({ ...item, rank: idx + 1 }));
    }

    const maxRev = sorted[0]?.totalRevenue || 1;

    return sorted.map((item, idx) => {
      const achievement = item.monthlyTarget > 0 ? Math.min(100, Math.round((item.totalRevenue / item.monthlyTarget) * 100)) : null;
      return {
        ...item,
        rank: idx + 1,
        targetAchievementPercent: achievement,
        relativePercent: Math.round((item.totalRevenue / maxRev) * 100)
      };
    });
  }, [rbacDeals, employees]);

  // 6. TOP 5 PERFORMER TEAMS & SQUADS
  const top5PerformerTeams = useMemo(() => {
    const teamMap = new Map<string, {
      name: string;
      leadName: string;
      dept: string;
      membersCount: number;
      dealsCount: number;
      wonCount: number;
      totalRevenue: number;
      receivedRevenue: number;
      memberNames: string[];
    }>();

    // 1. Initialize from Team Leaders in HRMS
    employees.forEach(emp => {
      const tlName = (emp.teamLeaderName || emp.formData?.teamLeaderName || '').trim();
      const deptName = emp.dept || emp.formData?.dept || 'Sales';

      const teamKey = tlName ? `Team ${tlName}` : `${deptName} Department`;
      const current = teamMap.get(teamKey) || {
        name: teamKey,
        leadName: tlName || emp.reportingManagerName || (emp.systemRole === 'HOD' ? emp.name : 'Team Leader'),
        dept: deptName,
        membersCount: 0,
        dealsCount: 0,
        wonCount: 0,
        totalRevenue: 0,
        receivedRevenue: 0,
        memberNames: [] as string[]
      };

      if (emp.name && !current.memberNames.includes(String(emp.name))) {
        current.memberNames.push(String(emp.name));
        current.membersCount += 1;
      }
      teamMap.set(teamKey, current);
    });

    // 2. Link deals to team
    rbacDeals.forEach(deal => {
      const splitBreakdown = getDealSplitBreakdown(deal, currentUser, isSuperAdmin || isHOD);
      const amt = splitBreakdown.displayAmount;
      const rec = splitBreakdown.verifiedDisplayReceived;
      const isWon = deal.status === 'Won' || deal.stage?.includes('Won');

      const ownerName = (deal.owner || deal.Deal_Owner || deal.bdm || '').trim().toLowerCase();
      const matchedEmp = employees.find(e => (e.name || '').trim().toLowerCase() === ownerName || (e.id || '').toLowerCase() === ownerName);

      let teamKey = '';
      if (matchedEmp) {
        const tl = matchedEmp.teamLeaderName || matchedEmp.formData?.teamLeaderName;
        teamKey = tl ? `Team ${tl}` : `${matchedEmp.dept || 'Sales'} Department`;
      } else {
        teamKey = deal.team || deal.department ? `${deal.team || deal.department} Team` : 'Direct Sales Team';
      }

      let current = teamMap.get(teamKey);
      if (!current) {
        current = {
          name: teamKey,
          leadName: 'Team Lead',
          dept: 'Sales',
          membersCount: 1,
          dealsCount: 0,
          wonCount: 0,
          totalRevenue: 0,
          receivedRevenue: 0,
          memberNames: [] as string[]
        };
        teamMap.set(teamKey, current);
      }

      current.dealsCount += 1;
      if (isWon) current.wonCount += 1;
      current.totalRevenue += amt;
      current.receivedRevenue += rec;
    });

    const list = Array.from(teamMap.values())
      .filter(t => t.totalRevenue > 0 || t.dealsCount > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.dealsCount - a.dealsCount)
      .slice(0, 5);

    // Fallback if no active teams with deals yet
    if (list.length === 0) {
      const fallbackTeams = [
        { name: 'Sales & Growth Team', leadName: 'Mishal Bhatia (HOD)', dept: 'Sales', membersCount: 3, dealsCount: 0, wonCount: 0, totalRevenue: 0, receivedRevenue: 0, memberNames: [] as string[] },
        { name: 'Corporate Legal & Compliance', leadName: 'Super Admin', dept: 'Legal', membersCount: 2, dealsCount: 0, wonCount: 0, totalRevenue: 0, receivedRevenue: 0, memberNames: [] as string[] },
        { name: 'Business Consulting Squad', leadName: 'Team Leader', dept: 'Consulting', membersCount: 2, dealsCount: 0, wonCount: 0, totalRevenue: 0, receivedRevenue: 0, memberNames: [] as string[] }
      ];
      return fallbackTeams.map((item, idx) => ({ ...item, rank: idx + 1, sharePercent: 0, relativePercent: 0 }));
    }

    const maxRev = list[0]?.totalRevenue || 1;

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      sharePercent: totalDealValue > 0 ? Math.round((item.totalRevenue / totalDealValue) * 100) : 0,
      relativePercent: Math.round((item.totalRevenue / maxRev) * 100)
    }));
  }, [rbacDeals, employees, totalDealValue, currentUser, isSuperAdmin, isHOD]);

  // 7. PIPELINE & CHART DATA
  const pipelineCategories = [
    { label: 'Sales', matcher: (s: string) => s.toLowerCase().includes('sale') || s === 'new' },
    { label: 'Ops Allocator', matcher: (s: string) => s.toLowerCase().includes('allocat') },
    { label: 'Ops Executors', matcher: (s: string) => s.toLowerCase().includes('execut') },
    { label: 'Legal', matcher: (s: string) => s.toLowerCase().includes('legal') },
    { label: 'Account', matcher: (s: string) => s.toLowerCase().includes('account') },
    { label: 'Quality', matcher: (s: string) => s.toLowerCase().includes('qualit') },
    { label: 'Won / Closed', matcher: (s: string) => s.toLowerCase().includes('won') },
  ];

  const pipelineData = pipelineCategories.map(cat => ({
    name: cat.label,
    count: rbacDeals.filter(d => cat.matcher(d.stage || d.status || '')).length
  }));

  // Monthly revenue aggregation
  const monthlyRevenueMap = new Map<string, { received: number; pending: number; total: number }>();

  rbacDeals.forEach(d => {
    let monthLabel = '';
    if (d.date) {
      try {
        const parts = String(d.date).split('/');
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          if (mIdx >= 0 && mIdx < 12) monthLabel = monthNames[mIdx];
        } else {
          const dt = new Date(d.date);
          if (!isNaN(dt.getTime())) monthLabel = monthNames[dt.getMonth()];
        }
      } catch (e) { }
    }
    if (!monthLabel) monthLabel = currentMonthName;

    const current = monthlyRevenueMap.get(monthLabel) || { received: 0, pending: 0, total: 0 };
    const rec = getUserDealReceived(d);
    const tot = getUserDealAmount(d);
    const pend = getUserDealPending(d);
    monthlyRevenueMap.set(monthLabel, {
      received: current.received + rec,
      pending: current.pending + pend,
      total: current.total + tot
    });
  });

  let revenueChartData = monthNames
    .filter(m => monthlyRevenueMap.has(m))
    .map(m => ({
      name: m,
      received: monthlyRevenueMap.get(m)!.received,
      pending: monthlyRevenueMap.get(m)!.pending,
      total: monthlyRevenueMap.get(m)!.total,
    }));

  if (revenueChartData.length === 0) {
    revenueChartData = [
      { name: currentMonthName, received: monthRevenueReceived, pending: monthRevenueBooked - monthRevenueReceived, total: monthRevenueBooked }
    ];
  }

  const recentDeals = rbacDeals.slice(0, 6);
  const recentQuotationsList = rbacQuotations.slice(0, 6);
  const openQueriesCount = rbacQueries.filter(q => q.status !== 'Resolved' && q.status !== 'Closed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Won': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Negotiation': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Proposal': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Operations executors':
      case 'Operations allocator': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'Sales': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const canViewOpsDashboard = Boolean(
    isSuperAdmin ||
    isOperationsHOD ||
    (currentUser?.department && currentUser.department.toLowerCase().includes('operation'))
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header & Role Recognition Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 sm:p-7 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-100/40 via-amber-50/20 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight flex items-center">
              CRM Executive Dashboard
            </h1>

            {canViewOpsDashboard && (
              <div className="flex items-center p-1 bg-gray-100 rounded-2xl border border-gray-200 text-xs font-bold">
                {isSuperAdminUser && (
                  <button
                    onClick={() => setDashboardSection('superadmin')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      dashboardSection === 'superadmin'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm font-black'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Crown size={13} className={dashboardSection === 'superadmin' ? 'text-amber-100' : 'text-amber-500'} />
                    Super Admin
                  </button>
                )}
                <button
                  onClick={() => setDashboardSection('crm')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    dashboardSection === 'crm'
                      ? 'bg-white text-gray-900 shadow-sm font-extrabold'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Sales & CRM
                </button>
                <button
                  onClick={() => setDashboardSection('operations')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    dashboardSection === 'operations'
                      ? 'bg-gradient-to-r from-be-orange to-amber-600 text-white shadow-sm font-extrabold'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Operations HOD
                </button>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-2 font-medium">
            Real-time quotation conversion metrics, daily/monthly revenue insights, target achievements, and top-selling services.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          {/* Timeframe Filter Tabs */}
          <div className="flex items-center p-1 bg-gray-100 rounded-2xl border border-gray-200 text-xs font-bold">
            <button
              onClick={() => setTimeframe('today')}
              className={`px-3 py-1.5 rounded-xl transition-all ${timeframe === 'today' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('month')}
              className={`px-3 py-1.5 rounded-xl transition-all ${timeframe === 'month' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                }`}
            >
              {currentMonthName}
            </button>
            <button
              onClick={() => setTimeframe('all')}
              className={`px-3 py-1.5 rounded-xl transition-all ${timeframe === 'all' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                }`}
            >
              All Time
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={isRefreshing}
            title="Refresh"
            className="flex items-center justify-center p-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={15} className={`${isRefreshing ? 'animate-spin text-be-orange' : 'text-gray-500'}`} />
          </button>
          <button
            onClick={() => navigate('/crm/quotations')}
            className="flex items-center px-4 py-2.5 bg-gradient-to-r from-be-orange to-amber-600 text-white rounded-xl text-xs font-bold hover:from-orange-600 hover:to-amber-700 transition-all shadow-md shadow-orange-500/20"
          >
            <Send size={14} className="mr-1.5" />
            Quotations ({rbacQuotations.length})
          </button>
        </div>
      </div>

      {dashboardSection === 'superadmin' ? (
        <SuperAdminDashboardView />
      ) : dashboardSection === 'operations' ? (
        <OperationsDashboardView />
      ) : (
        <SalesHodDashboardView
          deals={deals}
          employees={employees}
          quotations={quotations}
          clients={clients}
          isRefreshing={isRefreshing}
          onRefresh={loadData}
        />
      
      )}
    </div>
  );
};
