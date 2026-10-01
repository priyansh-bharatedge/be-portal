import { BHARATEDGE_LOGO_BASE64 } from '../services/logoBase64';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface QuotationPrintData {
  id: string;
  date?: string;
  validUntil?: string;
  status?: string;
  client?: string;
  company?: string;
  service?: string;
  amount?: string;
  received?: string;
  pending?: string;
  owner?: string;
  formData?: {
    clientName?: string;
    mobile?: string;
    email?: string;
    gender?: string;
    panCard?: string;
    aadhaarCard?: string;
    city?: string;
    state?: string;
    companyName?: string;
    businessType?: string;
    doi?: string;
    gstNumber?: string;
    companyPan?: string;
    sector?: string;
    industry?: string;
  };
  servicesData?: Array<{
    id?: string;
    name: string;
    totalAmount?: string | number;
    baseAmount?: string | number;
    quantity?: number;
  }>;
  totals?: {
    subtotal?: number;
    totalGst?: number;
    grandTotal?: number;
    amountReceived?: string | number;
    pendingAmount?: number;
  };
}

// Format currency in Indian Rupees style
export const formatINR = (val: number | string | undefined): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

// Format standard date to "DD Month YYYY" (e.g. 26 September 2026)
export const formatDisplayDate = (dateStr?: string): string => {
  try {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) {
      // If already a formatted string like "26 Sept 2026", return as is
      return dateStr || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
};

// Calculate 30 days validity from creation date
export const getValidUntilDate = (dateStr?: string): string => {
  try {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) {
      const today = new Date();
      today.setDate(today.getDate() + 30);
      return today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    const today = new Date();
    today.setDate(today.getDate() + 30);
    return today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
};

export const generateQuotationHTML = (q: QuotationPrintData): string => {
  const fd = q.formData || {};
  const clientName = fd.clientName || q.client || 'Valued Client';
  const companyName = fd.companyName || q.company || '';
  const clientCity = fd.city || '';
  const clientState = fd.state || '';
  const clientAddress = [clientCity, clientState].filter(Boolean).join(', ');
  const clientPhone = fd.mobile || '';
  const clientEmail = fd.email || '';
  const clientGst = fd.gstNumber || '';
  const clientPan = fd.panCard || fd.companyPan || '';

  const quotationNumber = q.id || 'QT-0001';
  const quotationDate = formatDisplayDate(q.date);
  const validUntil = q.validUntil ? formatDisplayDate(q.validUntil) : getValidUntilDate(q.date);

  // Compute item breakdown
  let items = q.servicesData || [];
  if (!items || items.length === 0) {
    if (q.service) {
      // Parse single service
      const rawAmount = Number(String(q.amount || '').replace(/[^0-9.-]+/g, '')) || 0;
      const base = rawAmount > 0 ? Math.round(rawAmount / 1.18) : 0;
      items = [{ name: q.service, baseAmount: base, quantity: 1 }];
    } else {
      items = [{ name: 'Professional Services & Consulting', baseAmount: 0, quantity: 1 }];
    }
  }

  let calculatedSubtotal = 0;
  const renderedRows = items.map((item) => {
    const qty = item.quantity || 1;
    const totalNum = item.totalAmount ? Number(item.totalAmount) : 0;
    const unitPrice = totalNum > 0 
      ? Number(((totalNum * 0.82) / qty).toFixed(2)) 
      : (typeof item.baseAmount === 'number' ? item.baseAmount : Number(item.baseAmount) || 0);
    const totalPrice = unitPrice * qty;
    calculatedSubtotal += totalPrice;

    return `
      <tr>
        <td class="col-desc">${item.name || 'Professional Service'}</td>
        <td class="col-qty">${qty}</td>
        <td class="col-price">₹${formatINR(unitPrice)}</td>
        <td class="col-total">₹${formatINR(totalPrice)}</td>
      </tr>
    `;
  }).join('');

  const subtotal = q.totals?.subtotal !== undefined ? q.totals.subtotal : calculatedSubtotal;
  const taxAmount = q.totals?.totalGst !== undefined ? q.totals.totalGst : Math.round(subtotal * 0.18);
  const grandTotal = q.totals?.grandTotal !== undefined ? q.totals.grandTotal : (subtotal + taxAmount);
  
  const amountReceivedNum = q.totals?.amountReceived !== undefined 
    ? Number(q.totals.amountReceived) || 0 
    : (Number(String(q.received || '').replace(/[^0-9.-]+/g, '')) || 0);

  const pendingAmountNum = q.totals?.pendingAmount !== undefined
    ? q.totals.pendingAmount
    : (grandTotal - amountReceivedNum);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sales Quotation - ${quotationNumber} - BharatEdge Services</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f1f3f6;
      color: #2b2b2b;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      padding: 30px 15px;
    }

    /* Print action bar (hidden on print) */
    .action-toolbar {
      max-width: 800px;
      margin: 0 auto 20px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
      border: 1px solid #e5e7eb;
    }

    .action-toolbar .title-info {
      font-weight: 600;
      color: #374151;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-toolbar .badge {
      background: #fff7ed;
      color: #c2410c;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid #fed7aa;
    }

    .toolbar-buttons {
      display: flex;
      gap: 10px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-print {
      background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(234, 88, 12, 0.3);
    }
    .btn-print:hover {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      transform: translateY(-1px);
    }

    .btn-close {
      background: #f3f4f6;
      color: #4b5563;
    }
    .btn-close:hover {
      background: #e5e7eb;
    }

    /* Page Container with Decorative Corner Gradients */
    .document-wrapper {
      position: relative;
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      border: 1.5px solid #fed7aa;
    }

    /* Decorative corner geometric shapes matching BharatEdge logo colors */
    .corner-decor-top-right {
      position: absolute;
      top: 0;
      right: 0;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 180px 180px 0;
      border-color: transparent #fdba74 transparent transparent;
      opacity: 0.85;
      z-index: 1;
      pointer-events: none;
    }

    .corner-decor-top-right::before {
      content: '';
      position: absolute;
      top: 0;
      right: -180px;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 130px 130px 0;
      border-color: transparent #ea580c transparent transparent;
      opacity: 0.95;
    }

    .corner-decor-bottom-left {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 180px 0 0 180px;
      border-color: transparent transparent transparent #fdba74;
      opacity: 0.85;
      z-index: 1;
      pointer-events: none;
    }

    .corner-decor-bottom-left::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: -180px;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 130px 0 0 130px;
      border-color: transparent transparent transparent #ffedd5;
      opacity: 0.95;
    }

    .quotation-page {
      position: relative;
      z-index: 2;
      padding: 50px 55px;
      background: transparent;
    }

    /* Header & Branding */
    .header-section {
      text-align: center;
      margin-bottom: 22px;
    }

    .logo-container {
      margin-bottom: 6px;
      margin-top: 0;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .logo-img {
      height: 85px;
      max-height: 95px;
      width: auto;
      max-width: 360px;
      object-fit: contain;
    }

    .doc-main-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #ea580c;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .meta-details {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12.5px;
      color: #374151;
      font-weight: 500;
    }

    .meta-details strong {
      font-weight: 700;
      color: #111827;
    }

    /* From / To Section */
    .party-details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 25px;
      padding-top: 15px;
    }

    .party-block {
      line-height: 1.6;
    }

    .party-title {
      font-size: 13px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .party-name {
      font-size: 14px;
      font-weight: 700;
      color: #ea580c;
      margin-bottom: 2px;
      text-transform: capitalize;
    }

    .party-company {
      font-weight: 600;
      color: #374151;
    }

    .party-address {
      color: #4b5563;
      font-size: 12px;
    }

    .party-contact {
      color: #374151;
      font-size: 12px;
      margin-top: 3px;
    }

    .party-tax {
      font-size: 11.5px;
      color: #6b7280;
      margin-top: 2px;
    }

    .to-block {
      text-align: right;
    }

    /* Itemized Table Section */
    .section-heading {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #111827;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      border: 1.5px solid #ea580c;
      border-radius: 6px;
      overflow: hidden;
    }

    .items-table th {
      background-color: #ffedd5;
      color: #9a3412;
      font-weight: 700;
      font-size: 12.5px;
      padding: 10px 14px;
      border: 1px solid #fed7aa;
      text-align: left;
    }

    .items-table th.col-center,
    .items-table td.col-qty {
      text-align: center;
    }

    .items-table th.col-right,
    .items-table td.col-price,
    .items-table td.col-total {
      text-align: right;
    }

    .items-table td {
      padding: 10px 14px;
      border: 1px solid #fed7aa;
      font-size: 12.5px;
      color: #1f2937;
    }

    .items-table tr.item-row:nth-child(even) {
      background-color: #fffcf9;
    }

    .col-desc {
      width: 50%;
      font-weight: 500;
    }

    .col-qty {
      width: 12%;
    }

    .col-price {
      width: 18%;
      font-family: inherit;
    }

    .col-total {
      width: 20%;
      font-weight: 600;
      font-family: inherit;
    }

    /* Summary Calculation Rows */
    .summary-row td {
      background-color: #fff7ed;
      padding: 7px 14px;
      border: 1px solid #fed7aa;
      font-size: 12.5px;
    }

    .summary-row.total-amount-row td {
      background-color: #ffedd5;
      font-size: 13.5px;
      font-weight: 800;
      color: #9a3412;
      padding: 9px 14px;
    }

    .summary-label {
      text-align: center;
      font-weight: 600;
      color: #374151;
    }

    .summary-val {
      text-align: right;
      font-weight: 700;
      color: #111827;
    }

    /* Terms and Conditions */
    .terms-section {
      margin-bottom: 35px;
      line-height: 1.6;
    }

    .terms-list {
      list-style-type: disc;
      padding-left: 20px;
      color: #374151;
      font-size: 11.5px;
    }

    .terms-list li {
      margin-bottom: 4px;
    }

    .terms-list strong {
      color: #111827;
      font-weight: 600;
    }

    /* Signature & Sign-off Section */
    .signatures-section {
      display: flex;
      justify-content: flex-end;
      margin-top: 25px;
      padding-top: 10px;
    }

    .signature-box {
      font-size: 12px;
      min-width: 240px;
      text-align: right;
    }

    .signature-title {
      font-weight: 600;
      color: #4b5563;
      margin-bottom: 35px;
    }

    .signature-name {
      font-size: 13.5px;
      font-weight: 800;
      color: #ea580c;
      text-transform: capitalize;
    }

    .signature-role {
      font-size: 12px;
      color: #4b5563;
      font-weight: 500;
    }

    /* Print Styles */
    @media print {
      body {
        background-color: #ffffff;
        padding: 0;
      }

      .action-toolbar {
        display: none !important;
      }

      .document-wrapper {
        border: none;
        box-shadow: none;
        max-width: 100%;
        margin: 0;
        overflow: visible;
      }

      .quotation-page {
        padding: 20mm 20mm;
      }

      @page {
        size: A4 portrait;
        margin: 0;
      }
    }
  </style>
</head>
<body>

  <!-- Floating action bar for browser preview / download -->
  <div class="action-toolbar">
    <div class="title-info">
      <span>Quotation Document</span>
      <span class="badge">${quotationNumber}</span>
      <span style="color: #9ca3af; font-size: 12px;">(${quotationDate})</span>
    </div>
    <div class="toolbar-buttons">
      <button class="btn btn-print" onclick="window.print()">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
        Print / Save PDF
      </button>
      <button class="btn btn-close" onclick="window.close()">Close Window</button>
    </div>
  </div>

  <!-- Document Page Container -->
  <div class="document-wrapper">
    <!-- Geometric Corner Accents matching the reference design -->
    <div class="corner-decor-top-right"></div>
    <div class="corner-decor-bottom-left"></div>

    <div class="quotation-page">
      <!-- Top Branding and Title Header -->
      <div class="header-section">
        <div class="logo-container">
          <img src="${BHARATEDGE_LOGO_BASE64}" alt="BharatEdge Services" class="logo-img" />
        </div>
        <h1 class="doc-main-title">SALES QUOTATION</h1>
        <div class="meta-details">
          <div><strong>Quotation Number:</strong> ${quotationNumber}</div>
          <div><strong>Date:</strong> ${quotationDate}</div>
        </div>
      </div>

      <!-- Party From / To Details -->
      <div class="party-details-grid">
        <div class="party-block from-block">
          <div class="party-title">From:</div>
          <div class="party-name">bharatedge services</div>
          <div class="party-address">102, SKYLAR BUILDING, Prahlad Nagar,<br>Ahmedabad, Gujarat 380015</div>
          <div class="party-contact"><strong>Phone:</strong> 6357994583</div>
          <div class="party-contact"><strong>Email:</strong> support@bharat-edge.com</div>
        </div>

        <div class="party-block to-block">
          <div class="party-title">To:</div>
          <div class="party-name">${clientName}</div>
          ${companyName ? `<div class="party-company">${companyName}</div>` : ''}
          ${clientAddress ? `<div class="party-address">${clientAddress}</div>` : ''}
          ${clientPhone ? `<div class="party-contact"><strong>Phone:</strong> ${clientPhone}</div>` : ''}
          ${clientEmail ? `<div class="party-contact"><strong>Email:</strong> ${clientEmail}</div>` : ''}
          ${clientGst ? `<div class="party-tax"><strong>GSTIN:</strong> ${clientGst}</div>` : ''}
          ${clientPan ? `<div class="party-tax"><strong>PAN:</strong> ${clientPan}</div>` : ''}
        </div>
      </div>

      <!-- Itemized Table -->
      <div class="section-heading">ITEMIZED QUOTATION DETAILS:</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Item Description</th>
            <th class="col-center">Quantity</th>
            <th class="col-right">Unit Price (₹)</th>
            <th class="col-right">Total Price (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${renderedRows}
          <!-- Calculations Summary -->
          <tr class="summary-row">
            <td colspan="3" class="summary-label">Subtotal</td>
            <td class="summary-val">₹${formatINR(subtotal)}</td>
          </tr>
          <tr class="summary-row">
            <td colspan="3" class="summary-label">Tax (GST 18%)</td>
            <td class="summary-val">₹${formatINR(taxAmount)}</td>
          </tr>
          ${amountReceivedNum > 0 ? `
          <tr class="summary-row">
            <td colspan="3" class="summary-label">Amount Received</td>
            <td class="summary-val" style="color: #059669;">₹${formatINR(amountReceivedNum)}</td>
          </tr>
          <tr class="summary-row">
            <td colspan="3" class="summary-label">Pending Balance</td>
            <td class="summary-val" style="color: #d97706;">₹${formatINR(pendingAmountNum)}</td>
          </tr>
          ` : ''}
          <tr class="summary-row total-amount-row">
            <td colspan="3" class="summary-label" style="font-weight: 800; color: #4a2810;">Total Amount</td>
            <td class="summary-val" style="font-size: 14px; font-weight: 800; color: #4a2810;">₹${formatINR(grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Terms and Conditions -->
      <div class="terms-section">
        <div class="section-heading">TERMS AND CONDITIONS:</div>
        <ul class="terms-list">
          <li><strong>Payment Terms:</strong> 50% advance upon quotation confirmation, remaining balance due prior to delivery or milestone sign-off.</li>
          <li><strong>Delivery Time:</strong> Estimated project onboarding & initiation within 2-5 business days upon receipt of required documentation.</li>
          <li><strong>Validity:</strong> This quotation is valid for 30 days from the date of issue.</li>
          <li><strong>Taxes & Fees:</strong> GST @ 18% is applicable as per government statutory guidelines.</li>
          <li><strong>Confidentiality & Support:</strong> All project discussions and data remain strictly confidential. For assistance, reach out to support@bharat-edge.com.</li>
        </ul>
      </div>

      <!-- Prepared By Signature -->
      <div class="signatures-section">
        <div class="signature-box prepared-box">
          <div class="signature-title">Prepared By:</div>
          <div class="signature-name">bharatedge services</div>
          <div class="signature-role">Authorized Signatory / CRM Operations</div>
        </div>
      </div>
    </div>
  </div>

</body>
</html>`;
};

// Direct PDF Download helper using html2canvas + jsPDF
export const downloadQuotationPDF = async (quotation: QuotationPrintData): Promise<void> => {
  const container = document.createElement('div');
  container.id = 'quotation-pdf-capture-container';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '794px';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';
  container.style.background = '#ffffff';
  
  const fullHtml = generateQuotationHTML(quotation);
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(fullHtml, 'text/html');
  const styleElement = parsedDoc.querySelector('style');
  const documentWrapper = parsedDoc.querySelector('.document-wrapper');
  
  if (styleElement) {
    container.appendChild(styleElement.cloneNode(true));
  }
  if (documentWrapper) {
    container.appendChild(documentWrapper.cloneNode(true));
  } else {
    container.innerHTML = fullHtml;
  }
  
  document.body.appendChild(container);
  
  try {
    if (document.fonts) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    
    const targetElement = container.querySelector('.document-wrapper') as HTMLElement || container;
    
    const canvas = await html2canvas(targetElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794
    });
    
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfPageHeight = pdf.internal.pageSize.getHeight(); // 297mm
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(imgHeight, pdfPageHeight));
    pdf.save(`Quotation_${quotation.id || 'QT'}.pdf`);
  } catch (err) {
    console.error('Direct PDF export error, falling back to print dialog:', err);
    printQuotation(quotation);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};

// Download HTML file helper
export const downloadQuotationHTML = (quotation: QuotationPrintData): void => {
  const htmlContent = generateQuotationHTML(quotation);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Quotation_${quotation.id || 'QT'}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Generate Quotation PDF as a Blob (e.g. for Zoho CRM file attachments)
export const generateQuotationPDFBlob = async (quotation: QuotationPrintData): Promise<Blob> => {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '794px';
  container.style.zIndex = '-9999';
  container.style.pointerEvents = 'none';
  container.style.background = '#ffffff';
  
  const fullHtml = generateQuotationHTML(quotation);
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(fullHtml, 'text/html');
  const styleElement = parsedDoc.querySelector('style');
  const documentWrapper = parsedDoc.querySelector('.document-wrapper');
  
  if (styleElement) {
    container.appendChild(styleElement.cloneNode(true));
  }
  if (documentWrapper) {
    container.appendChild(documentWrapper.cloneNode(true));
  } else {
    container.innerHTML = fullHtml;
  }
  
  document.body.appendChild(container);
  
  try {
    if (document.fonts) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    
    const targetElement = (container.querySelector('.document-wrapper') as HTMLElement) || container;
    
    const canvas = await html2canvas(targetElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794
    });
    
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfPageHeight = pdf.internal.pageSize.getHeight(); // 297mm
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(imgHeight, pdfPageHeight));
    return pdf.output('blob');
  } catch (err) {
    console.error('Direct PDF generation error, returning HTML fallback blob:', err);
    return new Blob([fullHtml], { type: 'application/pdf' });
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};

// Open Quotation in a new tab / print window
export const printQuotation = (quotation: QuotationPrintData): void => {
  const htmlContent = generateQuotationHTML(quotation);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};


