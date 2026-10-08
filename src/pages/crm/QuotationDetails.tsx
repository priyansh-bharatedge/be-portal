import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Phone, Mail, MapPin, Building2, IndianRupee, Printer, FileText, Eye, X, ExternalLink } from 'lucide-react';
import { downloadQuotationPDF, printQuotation } from '../../utils/quotationTemplate';
import { QuotationDocument } from '../../components/crm/QuotationDocument';

export const QuotationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const saved = localStorage.getItem('be_quotations');
  const allQuotations = saved ? JSON.parse(saved) : [];
  const [quotation] = useState<any>(() => allQuotations.find((q: any) => q.id === id));

  if (!quotation) {
    return (
      <div className="p-8 text-center text-gray-500">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Quotation Not Found</h2>
        <p>The quotation you are looking for does not exist or has been deleted.</p>
        <button onClick={() => navigate('/crm/quotations')} className="mt-4 px-4 py-2 bg-be-orange text-white rounded-lg">Back to Quotations</button>
      </div>
    );
  }

  const fd = quotation.formData || {};
  const initials = quotation.client ? quotation.client.substring(0, 2).toUpperCase() : 'NA';
  const services = quotation.servicesData || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-gray-900">{quotation.id}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {quotation.status || 'Draft'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Created on {quotation.date} by {quotation.owner || 'Admin'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsPreviewOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg flex items-center space-x-1.5 text-sm font-semibold shadow-sm transition-colors"
            title="Open Full Quotation Preview"
          >
            <Eye size={16} className="text-orange-600" /> <span>View Quotation</span>
          </button>
          <button 
            onClick={() => downloadQuotationPDF(quotation)}
            className="px-4 py-2 bg-be-orange text-white rounded-lg flex items-center space-x-2 text-sm font-semibold shadow-sm hover:bg-be-orangeHover transition-colors"
            title="Download Quotation PDF"
          >
            <Download size={18} /> <span>Download PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3">Client & Company Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-be-orange flex items-center justify-center font-bold">{initials}</div>
                  <div>
                    <p className="font-semibold text-gray-900">{quotation.client}</p>
                    <p className="text-sm text-gray-500">Primary Contact</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <p className="flex items-center"><Phone size={16} className="mr-2 text-gray-400" /> {fd.mobile || 'N/A'}</p>
                  <p className="flex items-center"><Mail size={16} className="mr-2 text-gray-400" /> {fd.email || 'N/A'}</p>
                  <p className="flex items-center"><MapPin size={16} className="mr-2 text-gray-400" /> {fd.city || 'N/A'}, {fd.state || 'N/A'}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Building2 size={20} /></div>
                  <div>
                    <p className="font-semibold text-gray-900">{quotation.company}</p>
                    <p className="text-sm text-gray-500">{fd.businessType || 'Business'}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <p className="flex items-center"><span className="w-20 text-gray-500">GSTIN:</span> {fd.gstNumber || 'N/A'}</p>
                  <p className="flex items-center"><span className="w-20 text-gray-500">PAN:</span> {fd.panCard || 'N/A'}</p>
                  <p className="flex items-center"><span className="w-20 text-gray-500">Aadhaar:</span> {fd.aadhaarCard || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3">Services & Pricing Breakdown</h2>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Base Amount</th>
                    <th className="px-4 py-3 text-right">GST (18%)</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-800">
                  {services.length > 0 ? services.map((s: any, idx: number) => {
                    const qty = s.qty || s.quantity || 1;
                    const totalNum = s.totalAmount ? (Number(s.totalAmount) * qty) : 0;
                    const base = Number(s.baseAmount) ? (Number(s.baseAmount) * qty) : (totalNum > 0 ? Number((totalNum / 1.18).toFixed(2)) : 0);
                    const gst = totalNum > 0 ? Number((totalNum - base).toFixed(2)) : Number((base * 0.18).toFixed(2));
                    const finalTotal = totalNum > 0 ? totalNum : Number((base + gst).toFixed(2));
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-medium">{s.name} {qty > 1 ? `x${qty}` : ''}</td>
                        <td className="px-4 py-3 text-right">₹{base.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right">₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right font-semibold">₹{finalTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={4} className="px-4 py-3 text-center text-gray-500">No detailed services found.</td></tr>
                  )}
                  <tr className="bg-gray-50/50 font-medium">
                    <td colSpan={3} className="px-4 py-3 text-right text-gray-500">Grand Total</td>
                    <td className="px-4 py-3 text-right text-lg text-gray-900 font-bold">{quotation.amount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Financials Card */}
          <div className="card p-6 bg-gradient-to-b from-gray-50 to-white">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <IndianRupee size={20} className="mr-2 text-be-orange" /> Financial Summary
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100">
                <span className="text-sm text-gray-500">Total Quotation Value</span>
                <span className="text-lg font-bold text-gray-900">{quotation.amount}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100">
                <span className="text-sm text-gray-500">Amount Received</span>
                <span className="text-base font-semibold text-emerald-600">{quotation.received || '₹0'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100">
                <span className="text-sm text-gray-500">Pending Amount</span>
                <span className="text-base font-semibold text-orange-600">{quotation.pending || quotation.amount}</span>
              </div>
            </div>
          </div>

          {/* Quotation Document Section (Small Action Box) */}
          <div className="card p-6 border border-orange-100 bg-white">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center justify-between">
              <span className="flex items-center">
                <FileText size={18} className="mr-2 text-be-orange" /> Quotation Document
              </span>
              <span className="text-[11px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                PDF Format
              </span>
            </h2>

            {/* Document preview card */}
            <div 
              onClick={() => setIsPreviewOpen(true)}
              className="p-3.5 bg-gradient-to-br from-orange-50/60 to-white rounded-xl border border-orange-200/80 hover:border-orange-400 transition-all cursor-pointer group mb-4 shadow-sm"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
                    Quotation_{quotation.id}.pdf
                  </p>
                  <p className="text-[11px] text-gray-500">Official BharatEdge Proposal</p>
                </div>
                <ExternalLink size={14} className="text-gray-400 group-hover:text-orange-600 transition-colors" />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => setIsPreviewOpen(true)}
                className="w-full py-2.5 px-3 bg-white hover:bg-orange-50 text-gray-800 hover:text-orange-700 border border-gray-200 hover:border-orange-300 rounded-lg flex items-center justify-center space-x-2 text-xs font-semibold shadow-sm transition-all"
              >
                <Eye size={15} className="text-orange-600" />
                <span>Open Quotation</span>
              </button>

              <button
                onClick={() => downloadQuotationPDF(quotation)}
                className="w-full py-2.5 px-3 bg-be-orange hover:bg-be-orangeHover text-white rounded-lg flex items-center justify-center space-x-2 text-xs font-semibold shadow-sm transition-all"
              >
                <Download size={15} />
                <span>Download PDF</span>
              </button>

              <button
                onClick={() => printQuotation(quotation)}
                className="w-full py-2 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg flex items-center justify-center space-x-2 text-[11px] font-medium transition-colors"
              >
                <Printer size={13} />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Document Preview Modal */}
      {isPreviewOpen && (
        <div 
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <div className="bg-gray-100 w-full max-w-4xl h-[92vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col my-auto">
            {/* Modal Header */}
            <div className="bg-white px-5 sm:px-6 py-3.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0 z-10 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 text-be-orange flex items-center justify-center flex-shrink-0">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Sales Quotation Preview — {quotation.id}
                  </h3>
                  <p className="text-xs text-gray-500">Official BharatEdge Document</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-2.5">
                <button
                  onClick={() => printQuotation(quotation)}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg flex items-center space-x-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title="Print or Save as PDF"
                >
                  <Printer size={14} /> <span>Print</span>
                </button>
                <button
                  onClick={() => downloadQuotationPDF(quotation)}
                  className="px-3.5 py-1.5 bg-be-orange hover:bg-be-orangeHover text-white rounded-lg flex items-center space-x-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title="Download Quotation PDF"
                >
                  <Download size={14} /> <span>Download PDF</span>
                </button>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-1"
                  title="Close (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable Document View */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 flex flex-col items-center">
              <div className="w-full max-w-3xl pb-12">
                <QuotationDocument quotation={quotation} className="shadow-2xl" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
