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
      Created_Time: new Date(Date.now() - (startIndex + i) * 3600000).toISOString(),
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
    const fields =
      searchParams.get('fields') ||
      req.query?.fields ||
      'id,Deal_Name,Account_Name,Contact_Name,Company_name,Client_Name,Owner,Employee,Stage,Pipeline,Closing_Date,Booking_Date,Created_Time,Modified_Time,Amount,Total_deal_amount_inclusive_of_gst,Deal_Amount,Amount_Without_GST,GST_Amount,Total_Received_Amount,Received_amount,Deal_Received_Amount,Total_Pending_Amount,Pending_amount,Deal_Pending_Amount,amount_if_you_have_kindly_put_0,Choose_Wisely,Service_Name,Service_Count,Subform_1,Client_contact_detail,Mobile,Client_Email_address,Email,Gst_number,Pan_number,Aadhaar_Card,Billing_address,City,State,Branches,Bank_details,Has_Partner_BDM,Partner_BDM_Name,Partner_BDM_Amount,Partner_BDM_ID,Quotation,Probability';

    const page = parseInt(String(pageParam), 10) || 1;
    const perPage = Math.min(
      Math.max(1, parseInt(String(perPageParam), 10) || 100),
      200
    );

    const clientId = process.env.ZOHO_CLIENT_ID || process.env.VITE_ZOHO_CLIENT_ID || '1000.ENHQL8XIKM7Q7AO7PGPY1EUICG80QF';
    const clientSecret = process.env.ZOHO_CLIENT_SECRET || process.env.VITE_ZOHO_CLIENT_SECRET || 'c5659d87156496be12bea1489a7a2f4500c7241131';
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN || process.env.VITE_ZOHO_REFRESH_TOKEN || '1000.bdf58bb9452babb83e6f001ec50ea44f.7c72197a07b2fb22502ce57112cbae91';
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

    // 2. Build Zoho CRM Deals API URL with Pagination & Fields
    const zohoApiUrl = new URL(`${apiBase}/crm/v8/Deals`);

    if (pageToken) {
      zohoApiUrl.searchParams.set('page_token', String(pageToken));
    } else {
      zohoApiUrl.searchParams.set('page', page.toString());
    }

    zohoApiUrl.searchParams.set('per_page', perPage.toString());

    if (fields) {
      zohoApiUrl.searchParams.set('fields', fields);
    }

    // 3. Fetch Total Record Count from Zoho CRM API (actions/count) in parallel
    const countUrl = `${apiBase}/crm/v8/Deals/actions/count`;

    const [crmResponse, countResponse] = await Promise.all([
      fetch(zohoApiUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
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

    // Combine info object with total_records
    const infoObj = {
      ...(crmData.info || {}),
      per_page: perPage,
      page: page,
      count: (crmData.data || []).length,
      total_records: totalRecords ?? crmData.info?.count_total ?? crmData.info?.total ?? null,
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
