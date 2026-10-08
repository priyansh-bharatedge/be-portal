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
  const clientAddress = [clientCity, clientState].filter(Boolean).join(', ');
  const clientPhone = fd.mobile || '';
  const clientEmail = fd.email || '';
  const clientGst = fd.gstNumber || '';
  const clientPan = fd.panCard || fd.companyPan || '';

  const quotationNumber = quotation.id || 'QT-0001';
  const quotationDate = formatDisplayDate(quotation.date);

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
            SALES QUOTATION
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
            <div className="text-xs sm:text-sm text-gray-800 pt-1">
              <span className="font-semibold text-gray-900">Phone:</span> 6357994583
            </div>
            <div className="text-xs sm:text-sm text-gray-800">
              <span className="font-semibold text-gray-900">Email:</span> support@bharat-edge.com
            </div>
          </div>

          <div className="text-sm space-y-1 sm:text-right">
            <div className="text-xs font-extrabold uppercase text-gray-900 tracking-wider mb-1">TO:</div>
            <div className="font-bold text-base text-orange-600 capitalize">{clientName}</div>
            {companyName && <div className="text-gray-700 font-semibold text-xs sm:text-sm">{companyName}</div>}
            {clientAddress && <div className="text-gray-600 text-xs sm:text-sm">{clientAddress}</div>}
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
                      <td className="py-2.5 px-4 font-medium text-gray-900">{item.name || 'Professional Service'}</td>
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

        {/* Terms and Conditions */}
        <div className="my-6">
          <div className="text-xs font-extrabold uppercase text-gray-900 tracking-wider mb-2">
            TERMS AND CONDITIONS:
          </div>
          <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1.5 leading-relaxed">
            <li><span className="font-semibold text-gray-900">Payment Terms:</span> 50% advance upon quotation confirmation, remaining balance due prior to delivery or milestone sign-off.</li>
            <li><span className="font-semibold text-gray-900">Delivery Time:</span> Estimated project onboarding & initiation within 2-5 business days upon receipt of required documentation.</li>
            <li><span className="font-semibold text-gray-900">Validity:</span> This quotation is valid for 30 days from the date of issue.</li>
            <li><span className="font-semibold text-gray-900">Taxes & Fees:</span> GST @ 18% is applicable as per government statutory guidelines.</li>
            <li><span className="font-semibold text-gray-900">Confidentiality & Support:</span> All project discussions and data remain strictly confidential. For assistance, reach out to support@bharat-edge.com.</li>
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
