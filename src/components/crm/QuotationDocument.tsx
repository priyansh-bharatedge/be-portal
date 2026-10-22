import React from 'react';
import { BHARATEDGE_LOGO_BASE64 } from '../../services/logoBase64';
import { formatINR, formatDisplayDate } from '../../utils/quotationTemplate';

interface QuotationDocumentProps {
  quotation: any;
  className?: string;
}

export const QuotationDocument: React.FC<QuotationDocumentProps> = ({ quotation, className = '' }) => {
  if (!quotation) return null;

  const fd = quotation.formData || {};
  const clientName = fd.clientName || quotation.client || 'Valued Client';
  const companyName = fd.companyName || quotation.company || '';
  const clientCity = fd.city || '';
  const clientState = fd.state || '';
  const cityState = [clientCity, clientState].filter(Boolean).join(', ');
  const billingAddr = fd.billingAddress || fd.Billing_address || quotation.billingAddress || quotation.Billing_address || '';
  const companyAddr = fd.companyAddress || fd.Company_address || quotation.companyAddress || quotation.Company_address || '';
  const clientPhone = fd.mobile || '';
  const clientEmail = fd.email || '';
  const clientGst = fd.gstNumber || '';
  const clientPan = fd.panCard || fd.companyPan || '';

  const quotationNumber = quotation.id || 'QT-0001';
  const quotationDate = formatDisplayDate(quotation.date);
  const notesText = (quotation.Q_Notes || quotation.q_notes || fd.Q_Notes || fd.q_notes || quotation.notes || fd.notes || quotation.remark || fd.remark || quotation.Remark || fd.Remark || quotation.Description || '').trim();

  // Items
  let items = quotation.servicesData || [];
  if (!items || items.length === 0) {
    if (quotation.service) {
      const rawAmount = Number(String(quotation.amount || '').replace(/[^0-9.-]+/g, '')) || 0;
      const base = rawAmount > 0 ? Math.round(rawAmount / 1.18) : 0;
      items = [{ name: quotation.service, baseAmount: base, quantity: 1 }];
    } else {
      items = [{ name: 'Professional Services & Consulting', baseAmount: 0, quantity: 1 }];
    }
  }

  let calculatedSubtotal = 0;
  items.forEach((item: any) => {
    const qty = item.quantity || 1;
    const totalNum = item.totalAmount ? Number(item.totalAmount) : 0;
    const unitPrice = totalNum > 0
      ? Number(((totalNum / 1.18) / qty).toFixed(2))
      : (typeof item.baseAmount === 'number' ? item.baseAmount : Number(item.baseAmount) || 0);
    calculatedSubtotal += unitPrice * qty;
  });

  const subtotal = quotation.totals?.subtotal !== undefined ? quotation.totals.subtotal : calculatedSubtotal;
  const taxAmount = quotation.totals?.totalGst !== undefined ? quotation.totals.totalGst : Math.round(subtotal * 0.18);
  const grandTotal = quotation.totals?.grandTotal !== undefined ? quotation.totals.grandTotal : (subtotal + taxAmount);

  const amountReceivedNum = quotation.totals?.amountReceived !== undefined
    ? Number(quotation.totals.amountReceived) || 0
    : (Number(String(quotation.received || '').replace(/[^0-9.-]+/g, '')) || 0);

  const pendingAmountNum = quotation.totals?.pendingAmount !== undefined
    ? quotation.totals.pendingAmount
    : (grandTotal - amountReceivedNum);

  return (
    <div className={`relative max-w-4xl mx-auto bg-white rounded-xl shadow-lg border border-orange-200 overflow-hidden font-sans text-gray-800 ${className}`}>
      {/* Decorative corner geometric shapes */}
      <div
        className="absolute top-0 right-0 w-0 h-0 border-solid border-t-0 border-r-[170px] border-b-[170px] border-l-0 border-t-transparent border-r-orange-300 border-b-transparent border-l-transparent opacity-80 pointer-events-none z-10"
        style={{ borderRightColor: '#fdba74' }}
      >
        <div
          className="absolute top-0 right-[-170px] w-0 h-0 border-solid border-t-0 border-r-[125px] border-b-[125px] border-l-0 border-t-transparent border-b-transparent border-l-transparent opacity-95"
          style={{ borderRightColor: '#ea580c' }}
        />
      </div>

      <div
        className="absolute bottom-0 left-0 w-0 h-0 border-solid border-t-[170px] border-r-0 border-b-0 border-l-[170px] border-t-transparent border-r-transparent border-b-transparent border-l-orange-300 opacity-80 pointer-events-none z-10"
        style={{ borderLeftColor: '#fdba74' }}
      >
        <div
          className="absolute bottom-0 left-[-170px] w-0 h-0 border-solid border-t-[125px] border-r-0 border-b-0 border-l-[125px] border-t-transparent border-r-transparent border-b-transparent opacity-95"
          style={{ borderLeftColor: '#ffedd5' }}
        />
      </div>

      {/* Main Document Content */}
      <div className="relative z-20 p-8 sm:p-12">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="flex justify-center items-center mb-2">
            <img
              src={BHARATEDGE_LOGO_BASE64}
              alt="BharatEdge Services"
              className="h-20 sm:h-24 w-auto max-w-[340px] object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide uppercase text-orange-600 mb-1">
            SERVICE QUOTATION
          </h1>
          <div className="text-xs sm:text-sm text-gray-700 font-medium space-y-0.5">
            <div><span className="font-bold text-gray-900">Quotation Number:</span> {quotationNumber}</div>
            <div><span className="font-bold text-gray-900">Date:</span> {quotationDate}</div>
          </div>
        </div>

        {/* From / To Party Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 my-6 pt-2 border-t border-orange-100">
          <div className="text-sm space-y-1">
            <div className="text-xs font-extrabold uppercase text-gray-900 tracking-wider mb-1">FROM:</div>
            <div className="font-bold text-base text-orange-600">bharatedge services</div>
            <div className="text-gray-600 text-xs sm:text-sm leading-relaxed">
              102, SKYLAR BUILDING, Prahlad Nagar,<br />
              Ahmedabad, Gujarat 380015
            </div>
            <div className="text-xs sm:text-sm text-gray-800">
              <span className="font-semibold text-gray-900">Email:</span> sales@bharat-edge.com
            </div>
          </div>

          <div className="text-sm space-y-1 sm:text-right">
            <div className="text-xs font-extrabold uppercase text-gray-900 tracking-wider mb-1">TO:</div>
            <div className="font-bold text-base text-orange-600 capitalize">{clientName}</div>
            {companyName && <div className="text-gray-700 font-semibold text-xs sm:text-sm">{companyName}</div>}
            {companyAddr && <div className="text-gray-600 text-xs sm:text-sm">{companyAddr}</div>}
            {billingAddr ? (
              <div className="text-gray-600 text-xs sm:text-sm">{billingAddr}</div>
            ) : (!companyAddr && cityState ? (
              <div className="text-gray-600 text-xs sm:text-sm">{cityState}</div>
            ) : null)}
            {clientPhone && (
              <div className="text-xs sm:text-sm text-gray-800 pt-1">
                <span className="font-semibold text-gray-900">Phone:</span> {clientPhone}
              </div>
            )}
            {clientEmail && (
              <div className="text-xs sm:text-sm text-gray-800">
                <span className="font-semibold text-gray-900">Email:</span> {clientEmail}
              </div>
            )}
            {clientGst && (
              <div className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">GSTIN:</span> {clientGst}
              </div>
            )}
            {clientPan && (
              <div className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">PAN:</span> {clientPan}
              </div>
            )}
          </div>
        </div>

        {/* Itemized Table */}
        <div className="my-6">
          <div className="text-xs font-extrabold uppercase text-gray-900 tracking-wider mb-2">
            ITEMIZED QUOTATION DETAILS:
          </div>
          <div className="border-1.5 border-orange-600 rounded-lg overflow-hidden shadow-sm" style={{ borderWidth: '1.5px', borderColor: '#ea580c' }}>
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-orange-100/90 text-orange-900 border-b border-orange-300 font-bold">
                  <th className="py-2.5 px-4">Item Description</th>
                  <th className="py-2.5 px-4 text-center">Quantity</th>
                  <th className="py-2.5 px-4 text-right">Unit Price (₹)</th>
                  <th className="py-2.5 px-4 text-right">Total Price (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-200">
                {items.map((item: any, idx: number) => {
                  const qty = item.quantity || 1;
                  const totalNum = item.totalAmount ? Number(item.totalAmount) : 0;
                  const unitPrice = totalNum > 0
                    ? Number(((totalNum / 1.18) / qty).toFixed(2))
                    : (typeof item.baseAmount === 'number' ? item.baseAmount : Number(item.baseAmount) || 0);
                  const itemTotal = unitPrice * qty;
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}>
                      <td className="py-2.5 px-4 font-medium text-gray-900">
                        <div>{item.name || 'Professional Service'}</div>
                        {Boolean((item.notes || item.remarks || item.remark || '').trim()) && (
                          <div className="text-[11px] text-gray-500 font-normal mt-0.5 whitespace-pre-line italic">
                            {(item.notes || item.remarks || item.remark).trim()}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{qty}</td>
                      <td className="py-2.5 px-4 text-right text-gray-800">₹{formatINR(unitPrice)}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-900">₹{formatINR(itemTotal)}</td>
                    </tr>
                  );
                })}

                {/* Calculation Rows */}
                <tr className="bg-orange-50/70 border-t border-orange-200 text-xs sm:text-sm">
                  <td colSpan={3} className="py-2 px-4 text-center font-semibold text-gray-700">Subtotal</td>
                  <td className="py-2 px-4 text-right font-bold text-gray-900">₹{formatINR(subtotal)}</td>
                </tr>
                <tr className="bg-orange-50/70 border-t border-orange-200 text-xs sm:text-sm">
                  <td colSpan={3} className="py-2 px-4 text-center font-semibold text-gray-700">Tax (GST 18%)</td>
                  <td className="py-2 px-4 text-right font-bold text-gray-900">₹{formatINR(taxAmount)}</td>
                </tr>
                {amountReceivedNum > 0 && (
                  <>
                    <tr className="bg-orange-50/70 border-t border-orange-200 text-xs sm:text-sm">
                      <td colSpan={3} className="py-2 px-4 text-center font-semibold text-gray-700">Amount Received</td>
                      <td className="py-2 px-4 text-right font-bold text-emerald-600">₹{formatINR(amountReceivedNum)}</td>
                    </tr>
                    <tr className="bg-orange-50/70 border-t border-orange-200 text-xs sm:text-sm">
                      <td colSpan={3} className="py-2 px-4 text-center font-semibold text-gray-700">Pending Balance</td>
                      <td className="py-2 px-4 text-right font-bold text-amber-600">₹{formatINR(pendingAmountNum)}</td>
                    </tr>
                  </>
                )}
                <tr className="bg-orange-200/80 border-t-2 border-orange-600 text-sm sm:text-base font-extrabold text-orange-950">
                  <td colSpan={3} className="py-3 px-4 text-center font-extrabold text-orange-950">Total Amount</td>
                  <td className="py-3 px-4 text-right font-black text-orange-950">₹{formatINR(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes & Special Instructions */}
        {Boolean(notesText) && (
          <div className="my-5 p-4 rounded-xl bg-orange-50/70 border-l-4 border-l-orange-500 border border-orange-200">
            <div className="text-xs font-extrabold uppercase text-orange-900 tracking-wider mb-1">
              NOTES & SPECIAL INSTRUCTIONS:
            </div>
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
              {notesText}
            </p>
          </div>
        )}

        {/* Terms and Conditions */}
        <div className="my-6">
          <div className="text-xs font-extrabold uppercase text-gray-900 tracking-wider mb-2">
            TERMS AND CONDITIONS:
          </div>
          <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1.5 leading-relaxed">
            <li><span className="font-semibold text-gray-900">Validity:</span> This quotation is valid for 7 days from the date of issue.</li>
            <li><span className="font-semibold text-gray-900">Taxes & Fees:</span> GST @ 18% is applicable as per government statutory guidelines.</li>
            <li><span className="font-semibold text-gray-900">Confidentiality & Support:</span> All project discussions and data remain strictly confidential. For assistance, reach out to support@bharat-edge.com.</li>
            <li><span className="font-semibold text-gray-900">Disclaimer:</span> We provide consultancy services in areas such as pitch deck preparation, financial reporting, business incorporation, certification assistance, funding support, and other professional services related to start-up consultation. Bharatedge Services private limited understand the evolving needs of today's enterprises and strive to offer guidance tailored to their growth. However, we are solely a consultancy service provider and are not affiliated, associated, or in collaboration with any Government or Non-Government Agency, Institution, Organization, or Department.</li>
          </ul>
        </div>

        {/* Signatures Section */}
        <div className="mt-8 pt-4 flex justify-end">
          <div className="text-right min-w-[240px]">
            <div className="text-xs font-medium text-gray-500 mb-8">Prepared By:</div>
            <div className="text-sm sm:text-base font-extrabold text-orange-600 capitalize">bharatedge services</div>
            <div className="text-xs text-gray-500 font-medium">Authorized Signatory / CRM Operations</div>
          </div>
        </div>
      </div>
    </div>
  );
};
