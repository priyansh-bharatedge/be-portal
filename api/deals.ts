import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper function to derive Zoho API base URL from Datacenter Accounts URL
function getZohoApiBaseUrl(datacenterUrl: string): string {
  if (process.env.ZOHO_API_BASE_URL || process.env.VITE_ZOHO_API_URL) {
    return (process.env.ZOHO_API_BASE_URL || process.env.VITE_ZOHO_API_URL || '').replace(/\/$/, '');
  }

  const cleanUrl = (datacenterUrl || '').toLowerCase().trim().replace(/\/$/, '');

  if (cleanUrl.endsWith('.zoho.in')) return 'https://www.zohoapis.in';
  if (cleanUrl.endsWith('.zoho.eu')) return 'https://www.zohoapis.eu';
  if (cleanUrl.endsWith('.zoho.com.au')) return 'https://www.zohoapis.com.au';
  if (cleanUrl.endsWith('.zoho.jp')) return 'https://www.zohoapis.jp';
  if (cleanUrl.endsWith('.zoho.ca')) return 'https://www.zohoapis.ca';

  // Default to US region (.com)
  return 'https://www.zohoapis.com';
}

// October 2026 Filter Constants for CRM REST API
const OCTOBER_2026_CRITERIA = '(Created_Time:greater_equal:2026-10-01T00:00:00+05:30)';
const OCTOBER_2026_START_MS = new Date('2026-10-01T00:00:00+05:30').getTime();

function combineWithOctoberFilter(existingCriteria?: string | null): string {
  if (!existingCriteria || !existingCriteria.trim()) {
    return OCTOBER_2026_CRITERIA;
  }
  const trimmed = existingCriteria.trim();
  if (trimmed.includes('Created_Time:greater_equal:2026-10-01')) {
    return trimmed;
  }
  const wrapped = trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed : `(${trimmed})`;
  return `((${OCTOBER_2026_CRITERIA})and${wrapped})`;
}

// Generate realistic mock deals when env variables are placeholder/unset
function generateMockDeals(page: number, perPage: number) {
  const totalMockRecords = 10485;
  const stages = [
    'Qualification',
    'Needs Analysis',
    'Value Proposition',
    'Proposal/Price Quote',
    'Negotiation/Review',
    'Closed Won',
    'Closed Lost',
    'Legal',
    'Operations allocator',
    'Operations executors',
  ];
  const accounts = [
    'Acme Global Inc',
    'Nexus Tech Solutions',
    'Apex Cloud Systems',
    'Vanguard Logistics',
    'Horizon Financial',
    'Starlight Media',
    'Pinnacle Healthcare',
    'Omni Retail Services',
  ];
  const dealPrefixes = [
    'Enterprise License',
    'Cloud Migration',
    'SaaS Subscription',
    'MSME CERTIFICATE',
    'SEED SUPPORT SCHEME',
    'DEEPTECH AVISHKAR MISSION',
    'DIRECTOR REMOVAL',
  ];

  const startIndex = (page - 1) * perPage;
  const mockDeals = [];

  for (let i = 0; i < perPage && startIndex + i < totalMockRecords; i++) {
    const id = 10000000000 + startIndex + i + 1;
    const stageIndex = (startIndex + i) % stages.length;
    const accountIndex = (startIndex + i) % accounts.length;
    const prefixIndex = (startIndex + i) % dealPrefixes.length;
    const amount = (startIndex + i) % 3 === 0 ? null : Math.floor(15000 + ((startIndex + i) * 3570) % 250000);
    const date = new Date(Date.now() + ((i * 3) % 90) * 86400000)
      .toISOString()
      .split('T')[0];

    mockDeals.push({
      id: id.toString(),
      Deal_Name: `${dealPrefixes[prefixIndex]} - Record #${startIndex + i + 1}`,
      Stage: stages[stageIndex],
      Amount: amount,
      Closing_Date: date,
      Account_Name: {
        name: accounts[accountIndex],
        id: `acc_${accountIndex + 1}`,
      },
      Probability: stages[stageIndex] === 'Closed Won' ? 100 : stages[stageIndex] === 'Closed Lost' ? 0 : 60,
      Created_Time: new Date(OCTOBER_2026_START_MS + (startIndex + i) * 3600000).toISOString(),
    });
  }

  const hasMore = startIndex + mockDeals.length < totalMockRecords;

  return {
    data: mockDeals,
    info: {
      per_page: perPage,
      page: page,
      count: mockDeals.length,
      total_records: totalMockRecords,
      more_records: hasMore,
      next_page_token: hasMore ? `mock_token_page_${page + 1}` : null,
      previous_page_token: page > 1 ? `mock_token_page_${page - 1}` : null,
    },
    isMockData: true,
  };
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

export default async function dealsHandler(req: any, res: any) {
  try {
    const url = req.url || '';
    const urlObj = new URL(url, `http://${req.headers?.host || 'localhost'}`);
    const searchParams = urlObj.searchParams;

    const pageParam = searchParams.get('page') || req.query?.page || '1';
    const perPageParam = searchParams.get('per_page') || req.query?.per_page || '100';
    const pageToken = searchParams.get('page_token') || req.query?.page_token || null;

    const DEFAULT_DEAL_FIELDS =
      'id,Deal_Name,Account_Name,Contact_Name,Company,Company_Name,Client_Name,Clients,Owner,Employee,Stage,Pipeline,Closing_Date,Booking_Date,Payment_Date,Created_Time,Modified_Time,Amount,Total_deal_amount_inclusive_of_gst,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Total_Pending_Amount,Pending_amount,amount_if_you_have_kindly_put_0,Choose_Wisely,Service_Name,Service_Count,Subform_1,Legal,Client_contact_detail,Client_Email_address,Gst_number,Pan_number,Aadhaar_Card,Billing_address,Company_address,City,State,Bank_details,Accounts_remark,Partner_BDM,Has_Partner_BDM,Partner_BDM_Amount,Partner_BDM_ID,Quotation,Payment_verifications,Deal_payment_screenshot';

    const MILESTONE_DEAL_FIELDS =
      'id,R1_Received_amount23,R1_Received_Screenshot,R1_Received_by_BDM1,R1_Received_by_BDM2,R1_Payment_Verification,R1_Bank_type,R1_Legal_verification,R2_Received_amount12,R2_Received_Screenshot,R2_Received_by_BDM1,R2_Received_by_BDM2,R2_Payment_Verification,R2_Bank_type,R2_Legal_verification,DPR_status_change_date,R3_Received_amount,R3_Received_Screenshot,R3_Received_by_BDM1,R3_Received_by_BDM2,R3_Payment_Verification,R3_Bank_type,R3_Legal_verification,Date_of_status_change,R4_Received_amount,R4_Received_Screenshot,R4_Payment_Verification,R4_Bank_type,R4_Legal_verification,Date_of_status_change_f,R5_Received_amount,R5_Payment_Verification,R5_Bank_type,R5_Legal_verification,Document_collection_Pitch_deck_creation_DPR_date,R6_Received_amount,R6_Payment_Verification,R6_Bank_type,R6_Legal_verification,Document_sent_date,R7_Received_amount,R7_Payment_Verification,R7_Bank_type,R7_Legal_verification,Finance_status_change_date,R8_Received_amount,R8_Payment_Verification,R8_Bank_type,R8_Legal_verification,Date_of_financedate_change';

    const rawFields = searchParams.get('fields') || req.query?.fields || null;
    const isCustomFields = rawFields && rawFields !== DEFAULT_DEAL_FIELDS;
    const fields = isCustomFields ? rawFields : DEFAULT_DEAL_FIELDS;

    const page = parseInt(String(pageParam), 10) || 1;
    const perPage = Math.min(
      Math.max(1, parseInt(String(perPageParam), 10) || 100),
      200
    );

    const clientId = process.env.ZOHO_CLIENT_ID || process.env.VITE_ZOHO_CLIENT_ID || '1000.ENHQL8XIKM7Q7AO7PGPY1EUICG80QF';
    const clientSecret = process.env.ZOHO_CLIENT_SECRET || process.env.VITE_ZOHO_CLIENT_SECRET || 'c5659d87156496be12bea1489a7a2f4500c7241131';
    let refreshToken = process.env.ZOHO_REFRESH_TOKEN || process.env.VITE_ZOHO_REFRESH_TOKEN || '';
    if (!refreshToken || refreshToken.includes('bdf58bb945')) {
      refreshToken = '1000.b141fe7e5414313d6b2ba2744c90c4fe.dc33224ff49bf2843512fbe58dce982c';
    }
    const datacenterUrl =
      process.env.ZOHO_DATACENTER_URL || process.env.VITE_ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';

    // Validate environment setup
    const isConfigured =
      clientId &&
      clientSecret &&
      refreshToken &&
      clientId !== 'your_zoho_client_id_here' &&
      clientSecret !== 'your_zoho_client_secret_here' &&
      refreshToken !== 'your_zoho_refresh_token_here';

    if (!isConfigured) {
      console.warn(
        'Zoho credentials not configured in .env. Falling back to mock dataset for preview.'
      );
      const mockResult = generateMockDeals(page, perPage);
      return res.status(200).json({
        success: true,
        ...mockResult,
        warning:
          'Running with mock data. Please configure ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env for live Zoho CRM data.',
      });
    }

    // 1. Fetch Fresh Access Token using Refresh Token (with caching)
    const now = Date.now();
    let accessToken = cachedToken;

    if (!accessToken || tokenExpiry <= now + 60000) {
      const authDomain = datacenterUrl.replace(/\/$/, '');
      const tokenEndpoint = `${authDomain}/oauth/v2/token`;

      const tokenParams = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      });

      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      const tokenData: any = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('Zoho Auth Error:', tokenData);
        return res.status(tokenResponse.status || 401).json({
          error: 'Authentication failed with Zoho OAuth Server',
          details: tokenData.error || tokenData.message || 'Invalid credentials or refresh token',
        });
      }

      accessToken = tokenData.access_token;
      cachedToken = accessToken;
      tokenExpiry = now + (Number(tokenData.expires_in) || 3600) * 1000;
    }

    const apiBase = getZohoApiBaseUrl(datacenterUrl);
    const rawCriteria = searchParams.get('criteria') || req.query?.criteria || '';
    const criteria = combineWithOctoberFilter(rawCriteria);

    // 2. Build Zoho CRM Deals API URL with Pagination & Fields (Search endpoint with October 2026 filter)
    let zohoApiUrl = new URL(`${apiBase}/crm/v8/Deals/search`);
    zohoApiUrl.searchParams.set('criteria', String(criteria));

    if (pageToken) {
      zohoApiUrl.searchParams.set('page_token', String(pageToken));
    } else {
      zohoApiUrl.searchParams.set('page', page.toString());
    }

    zohoApiUrl.searchParams.set('per_page', perPage.toString());
    zohoApiUrl.searchParams.set('fields', fields);

    // Parallel Milestone URL to fetch R1-R8 payment slots within Zoho's 50-field limit
    let zohoMilestoneUrl: URL | null = null;
    if (!isCustomFields) {
      zohoMilestoneUrl = new URL(`${apiBase}/crm/v8/Deals/search`);
      zohoMilestoneUrl.searchParams.set('criteria', String(criteria));
      if (pageToken) zohoMilestoneUrl.searchParams.set('page_token', String(pageToken));
      else zohoMilestoneUrl.searchParams.set('page', page.toString());
      zohoMilestoneUrl.searchParams.set('per_page', perPage.toString());
      zohoMilestoneUrl.searchParams.set('fields', MILESTONE_DEAL_FIELDS);
    }

    // 3. Fetch Total Record Count from Zoho CRM API (actions/count) with criteria
    const countUrl = `${apiBase}/crm/v8/Deals/actions/count?criteria=${encodeURIComponent(criteria)}`;

    const [crmFetchResult, milestoneFetchResult, countFetchResult] = await Promise.all([
      fetch(zohoApiUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
      zohoMilestoneUrl
        ? fetch(zohoMilestoneUrl.toString(), {
            method: 'GET',
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }).catch((err) => {
            console.warn('[Zoho Deals] Milestone fetch error:', err);
            return null;
          })
        : Promise.resolve(null),
      fetch(countUrl, {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }).catch((err) => {
        console.warn('Actions count fetch error:', err);
        return null;
      }),
    ]);

    let crmResponse = crmFetchResult;
    let milestoneResponse = milestoneFetchResult;
    let countResponse = countFetchResult;

    // Retry once if token expired
    if (crmResponse.status === 401 || (countResponse && countResponse.status === 401)) {
      cachedToken = null;
      accessToken = null;
      // Re-fetch token and retry
      const authDomain = datacenterUrl.replace(/\/$/, '');
      const tokenEndpoint = `${authDomain}/oauth/v2/token`;
      const tokenParams = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      });
      const retryTokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      const retryTokenData: any = await retryTokenRes.json();
      if (retryTokenRes.ok && retryTokenData.access_token) {
        accessToken = retryTokenData.access_token;
        cachedToken = accessToken;
        tokenExpiry = now + (Number(retryTokenData.expires_in) || 3600) * 1000;
        const [retryCrm, retryMilestone, retryCount] = await Promise.all([
          fetch(zohoApiUrl.toString(), {
            method: 'GET',
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }),
          zohoMilestoneUrl
            ? fetch(zohoMilestoneUrl.toString(), {
                method: 'GET',
                headers: {
                  Authorization: `Zoho-oauthtoken ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              }).catch(() => null)
            : Promise.resolve(null),
          fetch(countUrl, {
            method: 'GET',
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }).catch(() => null),
        ]);
        crmResponse = retryCrm;
        milestoneResponse = retryMilestone;
        countResponse = retryCount;
      }
    }

    // Fallback: If search endpoint failed with 400 or 404, fallback to standard Deals list
    if (!crmResponse.ok && criteria && (crmResponse.status === 400 || crmResponse.status === 404)) {
      console.warn(`[Zoho Deals] Search endpoint failed (${crmResponse.status}), falling back to standard list`);
      const fallbackUrl = new URL(`${apiBase}/crm/v8/Deals`);
      if (pageToken) fallbackUrl.searchParams.set('page_token', String(pageToken));
      else fallbackUrl.searchParams.set('page', page.toString());
      fallbackUrl.searchParams.set('per_page', perPage.toString());
      fallbackUrl.searchParams.set('fields', fields);

      let fallbackMilestoneUrl: URL | null = null;
      if (zohoMilestoneUrl) {
        fallbackMilestoneUrl = new URL(`${apiBase}/crm/v8/Deals`);
        if (pageToken) fallbackMilestoneUrl.searchParams.set('page_token', String(pageToken));
        else fallbackMilestoneUrl.searchParams.set('page', page.toString());
        fallbackMilestoneUrl.searchParams.set('per_page', perPage.toString());
        fallbackMilestoneUrl.searchParams.set('fields', MILESTONE_DEAL_FIELDS);
      }

      const [fallbackRes, fallbackMilestoneRes] = await Promise.all([
        fetch(fallbackUrl.toString(), {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        }),
        fallbackMilestoneUrl
          ? fetch(fallbackMilestoneUrl.toString(), {
              headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
            }).catch(() => null)
          : Promise.resolve(null)
      ]);

      if (fallbackRes.ok || fallbackRes.status === 204) {
        crmResponse = fallbackRes;
        if (fallbackMilestoneRes) milestoneResponse = fallbackMilestoneRes;
      }
    }

    let totalRecords: number | null = null;
    if (countResponse && countResponse.ok) {
      try {
        const countData: any = await countResponse.json();
        if (countData && countData.count !== undefined) {
          totalRecords = parseInt(String(countData.count), 10);
        }
      } catch (err) {
        console.warn('Error parsing count response:', err);
      }
    }

    // Handle 204 No Content (No records found)
    if (crmResponse.status === 204) {
      return res.status(200).json({
        success: true,
        data: [],
        info: {
          per_page: perPage,
          page: page,
          count: 0,
          total_records: totalRecords ?? 0,
          more_records: false,
          next_page_token: null,
          previous_page_token: null,
        },
        isMockData: false,
      });
    }

    const crmData: any = await crmResponse.json();

    if (!crmResponse.ok) {
      console.error('Zoho CRM API Error:', crmData);
      return res.status(crmResponse.status).json({
        error: 'Failed to fetch deal records from Zoho CRM',
        details: crmData.message || crmData.code || 'Zoho API returned an error status.',
      });
    }

    // Parse milestone response and merge into core deal records
    if (milestoneResponse && milestoneResponse.ok && milestoneResponse.status === 200) {
      try {
        const milestoneData: any = await milestoneResponse.json();
        if (Array.isArray(crmData?.data) && Array.isArray(milestoneData?.data)) {
          const milestoneMap = new Map<string, any>();
          milestoneData.data.forEach((m: any) => {
            if (m && m.id) milestoneMap.set(String(m.id), m);
          });
          crmData.data.forEach((deal: any) => {
            if (deal && deal.id) {
              const m = milestoneMap.get(String(deal.id));
              if (m) {
                Object.assign(deal, m);
              }
            }
          });
        }
      } catch (e) {
        console.warn('[Zoho Deals] Error merging milestone data:', e);
      }
    }

    // Dual-layer defense: strictly enforce October 2026 Created_Time filter on returned records
    if (Array.isArray(crmData.data)) {
      crmData.data = crmData.data.filter((deal: any) => {
        if (!deal) return false;
        const ct = deal.Created_Time || deal.created_time || deal.CreatedTime;
        if (!ct) return true;
        const createdMs = new Date(ct).getTime();
        return !isNaN(createdMs) ? createdMs >= OCTOBER_2026_START_MS : true;
      });
    }

    // Combine info object with total_records
    const infoObj = {
      ...(crmData.info || {}),
      per_page: perPage,
      page: page,
      count: (crmData.data || []).length,
      total_records: totalRecords ?? crmData.info?.count_total ?? crmData.info?.total ?? (crmData.data || []).length,
      more_records: crmData.info?.more_records ?? false,
      next_page_token: crmData.info?.next_page_token || null,
    };

    return res.status(200).json({
      success: true,
      data: crmData.data || [],
      info: infoObj,
      isMockData: false,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error occurred';
    console.error('API Error [/api/deals]:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      details: errorMessage,
    });
  }
}
