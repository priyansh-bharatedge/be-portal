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
import {
  getDealSplitBreakdown,
  isDealPartnerBdm,
  getDealTotalAmount,
  getDealReceivedAmount,
  getDealPendingAmount
} from '../../utils/dealSplitUtils';

export const CrmDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isHOD, isTL, isHR, currentRole, filterRecords } = useAuth();

  // Instant synchronous hydration from localStorage - zero delay, no flash of 0
  const [deals, setDeals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_deals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [quotations, setQuotations] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_quotations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [clients, setClients] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('be_clients');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  const getUserDealReceived = (d: any): number => {
    const breakdown = getDealSplitBreakdown(d, currentUser, isSuperAdmin || isHOD);
    return breakdown.displayReceived;
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
      if (zDeal.Service_Name) {
        serviceName = zDeal.Service_Name;
      } else if (zDeal.Choose_Wisely && zDeal.Choose_Wisely !== 'New Case Booking') {
        serviceName = zDeal.Choose_Wisely;
      } else if (zDeal.Deal_Name && zDeal.Deal_Name.includes(' - ')) {
        const afterHyphen = zDeal.Deal_Name.split(' - ').slice(1).join(' - ').trim();
        if (afterHyphen && !/^\(\d+\)$/.test(afterHyphen)) {
          serviceName = afterHyphen;
        }
      }
      if (!serviceName) serviceName = zDeal.Choose_Wisely || 'General Services';

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
      if (Array.isArray(zDeal.Subform_1) && zDeal.Subform_1.length > 0) {
        zDeal.Subform_1.forEach((sf: any) => {
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

      const pendAmt = findFirstPositive(
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

      const partnerBdmName =
        zDeal.Partner_BDM_Name ||
        zDeal.Partner_BDM_name ||
        zDeal.Partner_BDM_Names ||
        zDeal.partner_bdm_name ||
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
        partnerBdmAmount,
        date: zDeal.Booking_Date ? new Date(zDeal.Booking_Date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        rawDate: zDeal.Booking_Date || zDeal.Created_Time || new Date().toISOString(),
        zohoId: zDeal.id,
        quotationId: zDeal.Quotation?.id || zDeal.quotationId,
        source: zDeal.source || (zDeal.Quotation ? 'Quotation' : 'Direct'),
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
        setEmployees(empsRes.value.data);
        try { localStorage.setItem('be_employees', JSON.stringify(empsRes.value.data)); } catch (e) { }
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
    const dealsToEnrich = deals.slice(0, 20).filter(
      (d: any) => (getDealAmount(d) === 0 || !d.servicesData || d.servicesData.length === 0) &&
        (d.zohoId || (d.id && String(d.id).length > 8))
    );

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
      const fullRec = splitBreakdown.fullReceived;
      const pAmt = splitBreakdown.partnerAmount;
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
      const rec = splitBreakdown.displayReceived;
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

      {/* ========================================================================= */}
      {/* SECTION 1: QUOTATIONS CONVERSION & REVENUE METRICS CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Quotations Sent */}
        <div
          onClick={() => navigate('/crm/quotations')}
          title="Click to view all Quotations in Quotation Hub"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-blue-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 transform group-hover:scale-110 transition-transform">
              <FileText size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              Quotation Hub <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-blue-600 transition-colors">
              {totalQuotationsSent.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Total Quotations Sent</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Total Quoted Value</span>
              <span className="font-extrabold text-gray-900">{formatCurrencyShort(totalQuotationsSentAmount)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Quotations Converted in Deals */}
        <div
          onClick={() => navigate('/crm/deals?tab=From%20Quotations&per_page=200', { state: { tab: 'From Quotations', per_page: 200 } })}
          title="Click to view all Deals converted from Quotations"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-emerald-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-emerald-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 transform group-hover:scale-110 transition-transform">
              <CheckCircle2 size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              {quotationConversionRate}% Converted <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-emerald-600 transition-colors">
              {quotationsConvertedInDeals.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Quotations Converted to Deals</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Conversion Rate</span>
              <span className="font-extrabold text-emerald-600">{quotationConversionRate}% Win Rate</span>
            </div>
          </div>
        </div>

        {/* Card 3: Today's Revenue */}
        <div
          onClick={() => navigate('/crm/deals?filter=today&per_page=200', { state: { filter: 'today', per_page: 200 } })}
          title="Click to view Today's Booked Deals"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-amber-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-amber-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 transform group-hover:scale-110 transition-transform">
              <Clock size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-100 flex items-center gap-1 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              Today: {todayDMY} <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-amber-600 transition-colors">
              {formatCurrencyShort(todayRevenueReceived > 0 ? todayRevenueReceived : todayRevenueBooked)}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Today's Revenue</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Booked Deals Today</span>
              <span className="font-extrabold text-amber-700">{todayDealsList.length} Deals ({formatCurrencyShort(todayRevenueBooked)})</span>
            </div>
          </div>
        </div>

        {/* Card 4: Monthly Revenue */}
        <div
          onClick={() => navigate('/crm/deals?filter=this_month&per_page=200', { state: { filter: 'this_month', per_page: 200 } })}
          title="Click to view This Month's Deals"
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-purple-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group"
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-purple-500/5 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30 transform group-hover:scale-110 transition-transform">
              <Calendar size={22} />
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-100 flex items-center gap-1 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              {currentMonthName} {currentYear} <ArrowUpRight size={12} />
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-3xl font-black text-gray-900 tracking-tight group-hover:text-purple-600 transition-colors">
              {formatCurrencyShort(monthRevenueReceived > 0 ? monthRevenueReceived : monthRevenueBooked)}
            </p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Monthly Revenue ({currentMonthName})</p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Booked Total</span>
              <span className="font-extrabold text-purple-700">{formatCurrencyShort(monthRevenueBooked)} ({monthDealsList.length} deals)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: HOD & SUPER ADMIN TARGET VS ACHIEVEMENT TRACKER */}
      {/* ========================================================================= */}
      {(isSuperAdmin || isHOD) && (
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-gray-700">
          <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 mb-6 pb-6 border-b border-gray-700/60">
            <div>
              <div className="flex items-center space-x-2 text-be-orange font-bold text-xs uppercase tracking-wider mb-1">
                <Target size={16} />
                <span>Executive Performance Tracker ({isSuperAdmin ? 'Company-Wide Target' : `${currentUser.department || 'Department'} Target`})</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Monthly Target Achievement: {currentMonthName} {currentYear}
              </h2>
              <p className="text-xs text-gray-400 mt-1 font-medium">
                {isSuperAdmin
                  ? `Aggregated sales target for ${targetScopeEmployees.length} employees across all departments.`
                  : `Departmental target for ${targetScopeEmployees.length} staff under ${currentUser.name}.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10">
                <div className="text-[10px] text-gray-300 font-bold uppercase">Monthly Target</div>
                <div className="text-lg font-black text-amber-400">₹{totalMonthlyTarget.toLocaleString('en-IN')}</div>
              </div>
              <div
                onClick={() => navigate('/crm/deals?filter=this_month&per_page=200', { state: { filter: 'this_month', per_page: 200 } })}
                title="Click to view all deals booked this month"
                className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 hover:bg-white/20 transition-all cursor-pointer group"
              >
                <div className="text-[10px] text-gray-300 font-bold uppercase flex items-center gap-1">
                  Revenue Booked <ArrowUpRight size={10} className="text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
                <div className="text-lg font-black text-emerald-400">{formatCurrencyShort(monthlyRevenueForTarget)}</div>
              </div>
              <button
                onClick={() => navigate('/hrms/employees')}
                className="px-4 py-2.5 bg-be-orange hover:bg-orange-600 text-white rounded-2xl font-bold text-xs transition-all shadow-md flex items-center"
              >
                <Target size={14} className="mr-1.5" />
                Assign Staff Targets
              </button>
            </div>
          </div>

          {/* Progress Bar & Status */}
          <div className="space-y-3 relative z-10">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="flex items-center text-gray-300">
                Progress to Target: <strong className="text-white ml-1">{targetAchievementPercent}%</strong>
              </span>
              <span className="text-gray-300">
                Remaining to Target: <strong className="text-amber-400">{formatCurrencyShort(Math.max(0, totalMonthlyTarget - monthlyRevenueForTarget))}</strong>
              </span>
            </div>

            <div className="w-full h-4 bg-gray-700/80 rounded-full overflow-hidden p-0.5 shadow-inner border border-gray-600">
              <div
                className="h-full bg-gradient-to-r from-be-orange via-amber-400 to-emerald-400 rounded-full transition-all duration-1000 shadow-lg"
                style={{ width: `${Math.max(5, Math.min(100, targetAchievementPercent))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
              <span>₹0</span>
              <span>₹{(totalMonthlyTarget / 2).toLocaleString('en-IN')} (50%)</span>
              <span>₹{totalMonthlyTarget.toLocaleString('en-IN')} (100% Target)</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: TOP 5 HIGHEST SELLING & RECENT SERVICES LEADERBOARD */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center">
                <Flame size={22} className="text-be-orange mr-2" />
                Top 5 Highest Selling & Most Recent Services
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Top performing products and consulting packages across all closed and live deals. Click any service to view its deals.
            </p>
          </div>

          <button
            onClick={() => navigate('/crm/deals')}
            className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center self-start sm:self-center"
          >
            Explore all services in Deals <ArrowRight size={14} className="ml-1" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {top5Services.map((srv) => {
            const rankColors = [
              'from-amber-500 to-yellow-600 ring-amber-300 text-amber-950 bg-amber-50 border-amber-200', // #1 Gold
              'from-slate-400 to-gray-500 ring-gray-300 text-slate-900 bg-slate-50 border-slate-200',   // #2 Silver
              'from-amber-700 to-orange-800 ring-orange-300 text-orange-950 bg-orange-50 border-orange-200', // #3 Bronze
              'from-purple-500 to-indigo-600 ring-purple-300 text-purple-950 bg-purple-50 border-purple-200', // #4
              'from-blue-500 to-cyan-600 ring-blue-300 text-blue-950 bg-blue-50 border-blue-200',     // #5
            ];
            const badgeStyle = rankColors[srv.rank - 1] || rankColors[0];

            return (
              <div
                key={srv.service}
                onClick={() => navigate('/crm/deals?search=' + encodeURIComponent(srv.service) + '&per_page=200', { state: { search: srv.service, per_page: 200 } })}
                title={`Click to view all deals for "${srv.service}"`}
                className="bg-gradient-to-b from-gray-50/70 to-white rounded-2xl p-4 border border-gray-200/80 shadow-sm hover:shadow-xl hover:border-orange-400 hover:scale-[1.02] transition-all duration-300 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${badgeStyle.split(' ')[0]} ${badgeStyle.split(' ')[1]} text-white flex items-center justify-center font-black text-xs shadow-sm`}>
                      #{srv.rank}
                    </span>
                    <span className="text-[11px] font-extrabold text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-200 flex items-center gap-1 group-hover:border-orange-300 transition-colors">
                      {srv.count} Deals <ArrowUpRight size={10} className="text-be-orange opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </div>

                  <h3 className="font-extrabold text-gray-900 text-sm mb-2 line-clamp-2 min-h-[40px] group-hover:text-be-orange transition-colors">
                    {srv.service}
                  </h3>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <div className="text-[11px] text-gray-400 font-semibold uppercase">Total Deal Value</div>
                    <div className="text-base font-black text-gray-900">
                      {formatCurrencyShort(srv.totalRevenue)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-600">
                    <span>Market Share</span>
                    <span className="text-be-orange">{srv.sharePercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-be-orange to-amber-500 rounded-full"
                      style={{ width: `${Math.max(10, srv.relativePercent)}%` }}
                    />
                  </div>
                  {srv.latestDate && (
                    <div className="text-[10px] text-gray-400 truncate">
                      Recent: {srv.latestDate}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {top5Services.length === 0 && (
            <div className="col-span-5 text-center py-10 text-gray-400">
              <FolderKanban size={36} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-bold text-gray-500">No deal services recorded yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: TOP 5 PERFORMER EMPLOYEES & TOP 5 PERFORMER TEAMS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Top 5 Performer Employees */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
                  <Trophy size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
                    Top 5 Performer Employees
                  </h2>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Highest revenue generated by sales staff. Click any row to view their deals.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/hrms/employees')}
                className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center shrink-0"
              >
                Targets & Staff <ArrowRight size={13} className="ml-1" />
              </button>
            </div>

            <div className="space-y-3">
              {top5PerformerEmployees.map((emp) => {
                const rankBadges = [
                  'bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-amber-500/30', // #1
                  'bg-gradient-to-r from-slate-400 to-gray-600 text-white shadow-gray-400/30',   // #2
                  'bg-gradient-to-r from-amber-700 to-orange-700 text-white shadow-orange-700/30', // #3
                  'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-purple-500/30', // #4
                  'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-blue-500/30'      // #5
                ];
                const badgeClass = rankBadges[emp.rank - 1] || rankBadges[0];

                return (
                  <div
                    key={emp.id + emp.name}
                    onClick={() => navigate('/crm/deals?search=' + encodeURIComponent(emp.name) + '&per_page=200', { state: { search: emp.name, per_page: 200 } })}
                    title={`Click to view deals closed by ${emp.name}`}
                    className="p-4 rounded-2xl border border-gray-100 hover:border-orange-300 bg-gray-50/50 hover:bg-orange-50/40 hover:scale-[1.01] hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow-md shrink-0 ${badgeClass}`}>
                        #{emp.rank}
                      </div>

                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-be-orange to-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                        {emp.avatarInitials}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-extrabold text-sm text-gray-900 truncate group-hover:text-be-orange transition-colors flex items-center gap-1">
                            {emp.name} <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 text-be-orange transition-opacity" />
                          </h4>
                          {emp.rank === 1 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-black rounded-full uppercase shrink-0">
                              ★ Top Performer
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate font-medium">
                          {emp.role} • <span className="text-gray-400">{emp.dept}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-black text-gray-900">
                          {formatCurrencyShort(emp.totalRevenue)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-semibold">
                          {emp.dealsCount} Deals {emp.wonCount > 0 && `(${emp.wonCount} won)`}
                        </div>
                      </div>

                      {emp.monthlyTarget > 0 && (
                        <div className="mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {emp.targetAchievementPercent}% of ₹{Number(emp.monthlyTarget).toLocaleString('en-IN')} target
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {top5PerformerEmployees.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Users size={32} className="mx-auto mb-1 text-gray-300" />
                  <p className="text-xs font-bold text-gray-500">No sales staff deal records yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card B: Top 5 Performer Teams */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                  <Shield size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
                    Top 5 Performer Teams
                  </h2>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Highest closing team leader squads & departments. Click any squad to view deals.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/hrms/my-team')}
                className="text-xs font-bold text-be-orange hover:text-orange-700 flex items-center shrink-0"
              >
                My Team Hub <ArrowRight size={13} className="ml-1" />
              </button>
            </div>

            <div className="space-y-3">
              {top5PerformerTeams.map((team) => {
                const rankBadges = [
                  'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/30',   // #1
                  'bg-gradient-to-r from-slate-400 to-gray-600 text-white shadow-gray-400/30',   // #2
                  'bg-gradient-to-r from-amber-700 to-orange-700 text-white shadow-orange-700/30', // #3
                  'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-purple-500/30', // #4
                  'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-500/30'  // #5
                ];
                const badgeClass = rankBadges[team.rank - 1] || rankBadges[0];

                return (
                  <div
                    key={team.name}
                    onClick={() => navigate('/crm/deals?search=' + encodeURIComponent(team.leadName || team.name) + '&per_page=200', { state: { search: team.leadName || team.name, per_page: 200 } })}
                    title={`Click to view deals for ${team.name}`}
                    className="p-4 rounded-2xl border border-gray-100 hover:border-blue-300 bg-gray-50/50 hover:bg-blue-50/40 hover:scale-[1.01] hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow-md shrink-0 ${badgeClass}`}>
                        #{team.rank}
                      </div>

                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                        <Users size={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-extrabold text-sm text-gray-900 truncate group-hover:text-blue-600 transition-colors flex items-center gap-1">
                            {team.name} <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 text-blue-600 transition-opacity" />
                          </h4>
                          {team.rank === 1 && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-black rounded-full uppercase shrink-0">
                              🏆 Leading Squad
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate font-medium">
                          Lead: <span className="font-bold text-gray-700">{team.leadName}</span> • {team.membersCount} {team.membersCount === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-black text-gray-900">
                          {formatCurrencyShort(team.totalRevenue)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-semibold">
                          {team.dealsCount} Total Deals {team.wonCount > 0 && `(${team.wonCount} won)`}
                        </div>
                      </div>

                      <div className="mt-1 w-24">
                        <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 mb-0.5">
                          <span>Share</span>
                          <span className="text-blue-600">{team.sharePercent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                            style={{ width: `${Math.max(10, team.relativePercent)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {top5PerformerTeams.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Shield size={32} className="mx-auto mb-1 text-gray-300" />
                  <p className="text-xs font-bold text-gray-500">No active team deals yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: REVENUE ANALYTICS & DEAL PIPELINE CHARTS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Revenue Area Chart */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Revenue Breakdown Overview</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Received vs Pending amounts across deals</p>
            </div>
            <div className="flex items-center space-x-4 text-xs font-semibold">
              <span
                onClick={() => navigate('/crm/deals?filter=this_month&per_page=200', { state: { filter: 'this_month', per_page: 200 } })}
                title="Click to view this month's deals"
                className="flex items-center text-emerald-600 cursor-pointer hover:underline"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span>
                Received: {formatCurrencyShort(totalReceivedValue)}
              </span>
              <span
                onClick={() => navigate('/crm/deals?filter=pending&per_page=200', { state: { filter: 'pending', per_page: 200 } })}
                title="Click to view pending amount deals"
                className="flex items-center text-orange-600 cursor-pointer hover:underline"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mr-1.5"></span>
                Pending: {formatCurrencyShort(totalPendingValue)}
              </span>
            </div>
          </div>
          <div className="h-80 w-full flex items-center justify-center">
            {rbacDeals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, undefined]}
                  />
                  <Area type="monotone" dataKey="received" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReceived)" name="Received" />
                  <Area type="monotone" dataKey="pending" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorPending)" name="Pending" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <FolderKanban size={40} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-sm text-gray-500">No revenue data available yet</p>
                <p className="text-xs text-gray-400 mt-1">Deals will populate automatically from database</p>
              </div>
            )}
          </div>
        </div>

        {/* Deals by Status & Queries */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Deal Pipeline Stages</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Click any stage to filter deals</p>
              </div>
            </div>

            {/* Clickable Stage Badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {pipelineCategories.map(cat => {
                const count = rbacDeals.filter(d => cat.matcher(d.stage || d.status || '')).length;
                return (
                  <button
                    key={cat.label}
                    onClick={() => navigate('/crm/deals?search=' + encodeURIComponent(cat.label) + '&per_page=200', { state: { search: cat.label, per_page: 200 } })}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-gray-50 hover:bg-orange-50 text-gray-700 hover:text-be-orange border border-gray-200 hover:border-orange-200 transition-all flex items-center gap-1.5"
                  >
                    <span>{cat.label}</span>
                    <span className="px-1.5 py-0.2 bg-white rounded-full text-[10px] text-gray-500 font-extrabold border border-gray-100">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="w-full min-h-[190px] flex items-center justify-center">
              {rbacDeals.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={pipelineData} layout="vertical" margin={{ top: 0, right: 15, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={100} />
                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" fill="url(#colorBar)" radius={[0, 8, 8, 0]} barSize={16} background={{ fill: '#f1f5f9', radius: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="font-semibold text-xs text-gray-500">Pipeline is currently empty</p>
                </div>
              )}
            </div>
          </div>

          <div
            onClick={() => navigate('/quality/queries?status=Open')}
            title="Click to view all Open Quality Queries"
            className="mt-4 p-4 bg-gradient-to-r from-orange-50 to-rose-50 rounded-2xl border border-orange-100 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer flex items-start shadow-inner group"
          >
            <AlertCircle className="text-be-orange shrink-0 mt-0.5 mr-3 group-hover:scale-110 transition-transform" size={18} />
            <p className="text-xs text-gray-800 leading-relaxed font-medium flex-1">
              <strong>{openQueriesCount} active queries</strong> pending in the Quality module.
            </p>
            <ArrowUpRight size={14} className="text-be-orange opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: RECENT DEALS & RECENT QUOTATIONS TABBED TABLE */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center p-1 bg-gray-100 rounded-2xl border border-gray-200 text-xs font-bold">
              <button
                onClick={() => setRecentTab('deals')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${recentTab === 'deals' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                Recent Deals ({rbacDeals.length})
              </button>
              <button
                onClick={() => setRecentTab('quotations')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${recentTab === 'quotations' ? 'bg-white text-gray-900 shadow-sm font-extrabold' : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                Recent Quotations ({rbacQuotations.length})
              </button>
            </div>
          </div>

          <button
            onClick={() => navigate(recentTab === 'deals' ? '/crm/deals' : '/crm/quotations')}
            className="text-xs font-bold text-be-orange hover:text-orange-700 transition-colors flex items-center"
          >
            View All {recentTab === 'deals' ? 'Deals' : 'Quotations'} →
          </button>
        </div>

        <div className="overflow-x-auto">
          {recentTab === 'deals' ? (
            recentDeals.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-xs">
                  <tr>
                    <th className="px-6 py-4">Deal ID</th>
                    <th className="px-6 py-4">Client</th>
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Received</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                  {recentDeals.map((deal) => {
                    const breakdown = getDealSplitBreakdown(deal, currentUser, isSuperAdmin || isHOD);
                    const dispAmt = `₹${breakdown.displayAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                    const dispRec = `₹${breakdown.displayReceived.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

                    return (
                      <tr
                        key={deal.id}
                        onClick={() => navigate(`/crm/deals/${deal.id}`)}
                        className="hover:bg-orange-50/40 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4 font-bold text-gray-900 font-mono text-xs">{deal.id}</td>
                        <td className="px-6 py-4">{deal.client || deal.company || 'Client'}</td>
                        <td className="px-6 py-4 text-gray-800">{deal.service || 'Service'}</td>
                        <td className="px-6 py-4 font-bold text-gray-900">
                          <div>{dispAmt}</div>
                          {breakdown.splitBadgeText && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              {breakdown.splitBadgeText}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-600">
                          <div>{dispRec}</div>
                          {breakdown.hasPartnerBdm && !isSuperAdmin && !isHOD && (
                            <div className="text-[10px] text-gray-400 font-normal">Pre-GST 50%</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(deal.status)}`}>
                            {deal.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs">{deal.date}</td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => navigate(`/crm/deals/${deal.id}`)} className="p-1.5 text-gray-400 hover:text-be-orange rounded-lg hover:bg-orange-50 transition-colors">
                            <MoreHorizontal size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold text-sm text-gray-500">No deals synchronized yet</p>
              </div>
            )
          ) : (
            recentQuotationsList.length > 0 ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-xs">
                  <tr>
                    <th className="px-6 py-4">Quotation ID</th>
                    <th className="px-6 py-4">Client / Company</th>
                    <th className="px-6 py-4">Quoted Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                  {recentQuotationsList.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => navigate(`/crm/quotations/${q.id}`)}
                      className="hover:bg-orange-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 font-bold text-gray-900 font-mono text-xs">{q.id}</td>
                      <td className="px-6 py-4">{q.client} {q.company && q.company !== 'N/A' ? `(${q.company})` : ''}</td>
                      <td className="px-6 py-4 font-bold text-gray-900">{q.amount}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                          {q.status || 'Sent'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{q.date}</td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => navigate(`/crm/quotations/${q.id}`)} className="p-1.5 text-gray-400 hover:text-be-orange rounded-lg hover:bg-orange-50 transition-colors">
                          <MoreHorizontal size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold text-sm text-gray-500">No quotations created yet</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
