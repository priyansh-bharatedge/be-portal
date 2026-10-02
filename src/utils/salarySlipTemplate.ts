import { BHARATEDGE_LOGO_BASE64 } from '../services/logoBase64';

export interface SalaryRecord {
  id: string;
  empId: string;
  empName: string;
  designation?: string;
  department?: string;
  dateOfJoining?: string;
  month: string; // e.g. "2026-08" or "Aug-26"
  payPeriodDisplay?: string; // e.g. "Aug-26"
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  totalPaidDays: number;
  // Earnings
  basic: number;
  incentivePay: number;
  hra: number;
  allowances: number;
  // Deductions
  pf: number;
  professionalTax: number;
  unpaidLeavesDeduction: number;
  talkTimeDeduction: number;
  holdDeduction: number;
  tds: number;
  otherDeductions?: number;
  // Bank / KYC Meta
  bankName?: string;
  bankAccount?: string;
  ifscCode?: string;
  panNumber?: string;
  // Totals
  totalGross: number;
  totalDeductions: number;
  netSalary: number;
  netSalaryInWords?: string;
  status: 'Paid' | 'Pending';
  salaryEntity?: string;
  createdAt?: string;
}

// Convert numbers to Indian Rupees currency words format (e.g., 34800 -> "Thirty-Four Thousand Eight Hundred Only")
export const numberToIndianWords = (num: number): string => {
  if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';

  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 
    'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    let str = '';
    if (n > 9999999) {
      str += inWords(Math.floor(n / 10000000)) + 'Crore ';
      n %= 10000000;
    }
    if (n > 99999) {
      str += inWords(Math.floor(n / 100000)) + 'Lakh ';
      n %= 100000;
    }
    if (n > 999) {
      str += inWords(Math.floor(n / 1000)) + 'Thousand ';
      n %= 1000;
    }
    if (n > 99) {
      str += inWords(Math.floor(n / 100)) + 'Hundred ';
      n %= 100;
    }
    if (n > 0) {
      if (str !== '') str += 'and ';
      if (n < 20) {
        str += a[n];
      } else {
        str += b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10].trim() : '') + ' ';
      }
    }
    return str;
  };

  const whole = Math.floor(num);
  const words = inWords(whole).trim();
  return `${words} Only`;
};

// Format currency in Indian numbering (e.g. 35000 -> "35,000")
export const formatINR = (val: number | string | undefined): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
  return num.toLocaleString('en-IN');
};

// Format Pay Period (e.g. "2026-08" -> "Aug-26")
export const formatPayPeriod = (monthStr?: string): string => {
  if (!monthStr) return 'Aug-26';
  if (!monthStr.includes('-')) return monthStr;
  const parts = monthStr.split('-');
  if (parts.length === 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month)) {
      const d = new Date(year, month - 1, 1);
      const mShort = d.toLocaleString('en-US', { month: 'short' });
      const yShort = String(year).slice(-2);
      return `${mShort}-${yShort}`;
    }
  }
  return monthStr;
};

// Format Date of Joining (e.g. "2026-02-03" -> "03-Feb-2026")
export const formatDOJ = (dateStr?: string): string => {
  if (!dateStr) return '03-Feb-2026';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return dateStr;
  }
};

// Generate Full Self-Contained Printable HTML for Payslip
export const generateSalarySlipHTML = (sal: SalaryRecord): string => {
  const payPeriod = sal.payPeriodDisplay || formatPayPeriod(sal.month);
  const doj = sal.dateOfJoining ? formatDOJ(sal.dateOfJoining) : '03-Feb-2026';
  const inWords = sal.netSalaryInWords || numberToIndianWords(sal.netSalary);
  const companyEntity = sal.salaryEntity === 'BSPL' 
    ? 'BharatEdge Solutions Private Limited' 
    : 'BharatEdge Startup Advisors Private Limited';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payslip - ${sal.empName} - ${payPeriod}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 30px 15px;
      font-size: 13px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }
    
    .payslip-container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 2.5px solid #000000;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      position: relative;
    }
    
    /* Company Header */
    .header-section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #000000;
      padding: 16px 20px;
      gap: 15px;
    }
    
    .logo-container {
      flex: 0 0 220px;
      display: flex;
      align-items: center;
    }
    
    .logo-container img {
      max-width: 200px;
      max-height: 60px;
      object-fit: contain;
    }
    
    .company-details {
      flex: 1;
      text-align: center;
      padding-right: 15px;
    }
    
    .payslip-heading {
      font-size: 18px;
      font-weight: 800;
      color: #000000;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    
    .company-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 3px;
    }
    
    .company-address {
      font-size: 11px;
      font-weight: 500;
      color: #1e293b;
      line-height: 1.35;
    }
    
    /* Employee Meta Info */
    .meta-section {
      border-bottom: 2px solid #000000;
      padding: 12px 20px;
    }
    
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 30px;
      row-gap: 6px;
    }
    
    .meta-row {
      display: flex;
      font-size: 12.5px;
      align-items: baseline;
    }
    
    .meta-label {
      font-weight: 700;
      color: #000000;
      width: 130px;
      flex-shrink: 0;
    }
    
    .meta-colon {
      font-weight: 700;
      margin-right: 8px;
      color: #000000;
    }
    
    .meta-value {
      font-weight: 500;
      color: #000000;
      flex: 1;
      word-break: break-word;
    }
    
    /* Main Table */
    .salary-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    
    .salary-table th {
      background-color: #ffffff;
      color: #000000;
      font-weight: 800;
      font-size: 13px;
      padding: 8px 14px;
      border-bottom: 2px solid #000000;
      border-right: 2px solid #000000;
      text-transform: capitalize;
    }
    
    .salary-table th:last-child {
      border-right: none;
    }
    
    .salary-table td {
      padding: 7px 14px;
      font-size: 12.5px;
      font-weight: 500;
      color: #000000;
      border-right: 2px solid #000000;
      vertical-align: middle;
    }
    
    .salary-table td:last-child {
      border-right: none;
    }
    
    .salary-table .col-text {
      text-align: left;
    }
    
    .salary-table .col-amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    
    .table-body-row {
      height: 28px;
    }
    
    /* Totals Row */
    .totals-row td {
      font-weight: 800;
      border-top: 2px solid #000000;
      border-bottom: 2px solid #000000;
      padding: 8px 14px;
      background-color: #ffffff;
    }
    
    /* Amount Callout Box */
    .callout-section {
      border-bottom: 2px solid #000000;
      padding: 12px 20px;
      text-align: center;
      background-color: #ffffff;
    }
    
    .net-amount-digits {
      font-size: 16px;
      font-weight: 800;
      color: #000000;
      margin-bottom: 4px;
    }
    
    .net-amount-words {
      font-size: 13.5px;
      font-weight: 800;
      color: #000000;
      letter-spacing: 0.2px;
    }
    
    /* Footer */
    .footer-section {
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 11px;
      color: #475569;
    }
    
    .system-notice {
      max-width: 420px;
      font-style: italic;
      font-weight: 500;
      color: #000000;
    }
    
    .signature-area {
      text-align: center;
      padding-top: 10px;
    }
    
    .sign-line {
      width: 170px;
      border-top: 1px solid #000000;
      margin-bottom: 4px;
    }
    
    .sign-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #000000;
    }

    /* Print styling */
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .payslip-container {
        border: 2px solid #000000 !important;
        box-shadow: none !important;
        width: 100% !important;
        max-width: 100% !important;
        page-break-inside: avoid;
      }
      @page {
        size: A4 portrait;
        margin: 15mm;
      }
    }
  </style>
</head>
<body>
  <div class="payslip-container">
    <!-- Header Section -->
    <div class="header-section">
      <div class="logo-container">
        <img src="${BHARATEDGE_LOGO_BASE64}" alt="BharatEdge Logo" />
      </div>
      <div class="company-details">
        <div class="payslip-heading">Payslip - ${payPeriod}</div>
        <div class="company-title">${companyEntity}</div>
        <div class="company-address">Unit- 505/506 Skylar Building Prahlad Nagar, Ahmedabad, Gujarat 380015</div>
      </div>
    </div>
    
    <!-- Meta Information Section -->
    <div class="meta-section">
      <div class="meta-grid">
        <!-- Left Column -->
        <div class="meta-row">
          <span class="meta-label">EMP ID</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.empId}</span>
        </div>
        <!-- Right Column -->
        <div class="meta-row">
          <span class="meta-label">Employee Name</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.empName}</span>
        </div>
        
        <div class="meta-row">
          <span class="meta-label">Date of Joining</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${doj}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Designation</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.designation || 'Business Development Manager'}</span>
        </div>
        
        <div class="meta-row">
          <span class="meta-label">Pay Period</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${payPeriod}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Department</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.department || 'Sales'}</span>
        </div>
        
        <div class="meta-row">
          <span class="meta-label">Present Days</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.presentDays}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Unpaid Leave</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.unpaidLeaveDays}</span>
        </div>
        
        <div class="meta-row">
          <span class="meta-label">Paid Leave</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.paidLeaveDays}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Total Paid Days</span>
          <span class="meta-colon">:</span>
          <span class="meta-value">${sal.totalPaidDays}</span>
        </div>
      </div>
    </div>
    
    <!-- Table Section -->
    <table class="salary-table">
      <thead>
        <tr>
          <th style="width: 25%; text-align: center;">Earnings</th>
          <th style="width: 18%; text-align: center;">Amount</th>
          <th style="width: 32%; text-align: center;">Deductions</th>
          <th style="width: 25%; text-align: center;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr class="table-body-row">
          <td class="col-text">Basic</td>
          <td class="col-amount">${formatINR(sal.basic)}</td>
          <td class="col-text">Provident Fund</td>
          <td class="col-amount">${formatINR(sal.pf || 0)}</td>
        </tr>
        <tr class="table-body-row">
          <td class="col-text">Incentive Pay</td>
          <td class="col-amount">${formatINR(sal.incentivePay || 0)}</td>
          <td class="col-text">Professional Tax</td>
          <td class="col-amount">${formatINR(sal.professionalTax || 0)}</td>
        </tr>
        <tr class="table-body-row">
          <td class="col-text">${sal.hra > 0 ? 'House Rent Allowance (HRA)' : ''}</td>
          <td class="col-amount">${sal.hra > 0 ? formatINR(sal.hra) : ''}</td>
          <td class="col-text">Unpaid Leaves (${sal.unpaidLeaveDays || 0})</td>
          <td class="col-amount">${formatINR(sal.unpaidLeavesDeduction || 0)}</td>
        </tr>
        <tr class="table-body-row">
          <td class="col-text">${sal.allowances > 0 ? 'Other Allowances' : ''}</td>
          <td class="col-amount">${sal.allowances > 0 ? formatINR(sal.allowances) : ''}</td>
          <td class="col-text">Talk Time</td>
          <td class="col-amount">${formatINR(sal.talkTimeDeduction || 0)}</td>
        </tr>
        <tr class="table-body-row">
          <td class="col-text"></td>
          <td class="col-amount"></td>
          <td class="col-text">Hold</td>
          <td class="col-amount">${formatINR(sal.holdDeduction || 0)}</td>
        </tr>
        ${sal.tds > 0 ? `
        <tr class="table-body-row">
          <td class="col-text"></td>
          <td class="col-amount"></td>
          <td class="col-text">TDS / Income Tax</td>
          <td class="col-amount">${formatINR(sal.tds)}</td>
        </tr>` : ''}
        
        <!-- Totals Row -->
        <tr class="totals-row">
          <td class="col-text">Total Gross</td>
          <td class="col-amount">${formatINR(sal.totalGross)}</td>
          <td class="col-text">
            <div>Total Deductions</div>
            <div style="margin-top: 4px;">Net Pay</div>
          </td>
          <td class="col-amount">
            <div>${formatINR(sal.totalDeductions)}</div>
            <div style="margin-top: 4px;">${formatINR(sal.netSalary)}</div>
          </td>
        </tr>
      </tbody>
    </table>
    
    <!-- Amount Callout Box -->
    <div class="callout-section">
      <div class="net-amount-digits">${formatINR(sal.netSalary)}</div>
      <div class="net-amount-words">${inWords}</div>
    </div>
    
    <!-- Footer Section -->
    <div class="footer-section">
      <div class="system-notice">
        This is a computer-generated document. No signature is required.
      </div>
      <div class="signature-area">
        <div class="sign-line"></div>
        <div class="sign-title">Authorized Signatory</div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

// Direct browser print launcher
export const printSalarySlip = (sal: SalaryRecord): void => {
  const html = generateSalarySlipHTML(sal);
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  } else {
    // Fallback: create an iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 500);
    }
  }
};

// Direct HTML Download
export const downloadSalarySlipHTML = (sal: SalaryRecord): void => {
  const payPeriod = sal.payPeriodDisplay || formatPayPeriod(sal.month);
  const html = generateSalarySlipHTML(sal);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Payslip_${sal.empId}_${sal.empName.replace(/\s+/g, '_')}_${payPeriod}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
