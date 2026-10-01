import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Edit, Download, MoreHorizontal, FileText, 
  CheckCircle2, Clock, MapPin, Building2, Phone, Mail, 
  IndianRupee, CreditCard, Receipt
} from 'lucide-react';
import { getDocument } from '../../lib/db';

export const DealDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const saved = localStorage.getItem('be_deals');
  const allDeals = saved ? JSON.parse(saved) : [];
  const deal = allDeals.find((d: any) => d.id === id);

  if (!deal) {
    return (
      <div className="p-8 text-center text-gray-500">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Deal Not Found</h2>
        <p>The deal you are looking for does not exist or has been deleted.</p>
        <button onClick={() => navigate('/crm/deals')} className="mt-4 px-4 py-2 bg-be-orange text-white rounded-lg">Back to Deals</button>
      </div>
    );
  }

  const fd = deal.formData || {};
  const initials = deal.client ? deal.client.substring(0, 2).toUpperCase() : 'NA';
  const services = deal.servicesData || [];

  const handleDownload = async (doc: any) => {
    try {
      const file = await getDocument(doc.id);
      if (file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn('Failed to get real document from DB, falling back to mockup', err);
    }
    
    // Fallback to mockup if file wasn't found in IndexedDB
    const ext = doc.name.split('.').pop()?.toLowerCase() || '';
    let blob;
    
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' });
    } else if (ext === 'pdf') {
      const b64 = 'JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCj4+Cj4+CiAgL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iagoKNCAwIG9iago8PAogIC9UeXBlIC9Gb250CiAgL1N1YnR5cGUgL1R5cGUxCiAgL0Jhc2VGb250IC9UaW1lcy1Sb21hbgo+PgplbmRvYmoKCjUgMCBvYmoKPDwKICAvTGVuZ3RoIDQzCj4+CnN0cmVhbQpCVAovRjEgMTggVGYKMCAwIDAgcmcKNTAgMTAwIFRkCihEZW1vIFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDE1OCAwMDAwMCBuIAowMDAwMDAwMjYwIDAwMDAwIG4gCjAwMDAwMDAzNDkgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDQxCiUlRU9GCg==';
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    } else {
      const content = `This is a mockup download for ${doc.name}.`;
      blob = new Blob([content], { type: 'text/plain' });
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-gray-900">{deal.id}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                deal.status === 'Won' ? 'bg-emerald-100 text-emerald-700' : 
                deal.status === 'Negotiation' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>{deal.status}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Created on {deal.date} by {deal.owner}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Download size={20} />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Edit size={20} />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client & Company */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3">Client & Company Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-be-orange flex items-center justify-center font-bold">{initials}</div>
                  <div>
                    <p className="font-semibold text-gray-900">{deal.client}</p>
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
                    <p className="font-semibold text-gray-900">{deal.company}</p>
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

          {/* Services */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3">Services</h2>
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
                    const gst = totalNum > 0 ? Number((totalNum * 0.18).toFixed(2)) : Number(((Number(s.baseAmount) || 0) * qty * 0.18 / 0.82).toFixed(2));
                    const base = totalNum > 0 ? Number((totalNum - gst).toFixed(2)) : ((Number(s.baseAmount) || 0) * qty);
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
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center text-gray-500">No detailed services found.</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50/50 font-medium">
                    <td colSpan={3} className="px-4 py-3 text-right text-gray-500">Grand Total</td>
                    <td className="px-4 py-3 text-right text-lg text-gray-900 font-bold">{deal.amount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Documents */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3">Documents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {deal.documentsData && deal.documentsData.length > 0 ? (
                deal.documentsData.map((doc: any, idx: number) => {
                  const ext = doc.name.split('.').pop()?.toUpperCase() || 'FILE';
                  const isPdf = ext === 'PDF';
                  const isImg = ['JPG', 'JPEG', 'PNG'].includes(ext);
                  const sizeMb = (doc.size / (1024 * 1024)).toFixed(2);
                  const sizeText = doc.size < 1024 * 1024 ? `${(doc.size / 1024).toFixed(1)} KB` : `${sizeMb} MB`;
                  
                  return (
                    <div key={idx} className="flex items-center p-3 border border-gray-100 rounded-lg hover:shadow-md transition-shadow group cursor-pointer" onClick={() => handleDownload(doc)}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 font-bold text-xs shrink-0
                        ${isPdf ? 'bg-red-50 text-red-500' : isImg ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                        {ext}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate" title={doc.name}>{doc.name}</p>
                        <p className="text-xs text-gray-500">{sizeText}</p>
                      </div>
                      <div className="text-gray-400 group-hover:text-be-orange px-2">
                        <Download size={18} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-1 sm:col-span-2 text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  No documents attached to this deal.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Finance & Timeline */}
        <div className="space-y-6">
          {/* Financial Summary */}
          <div className="card p-6 bg-gradient-to-b from-gray-50 to-white">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <IndianRupee size={20} className="mr-2 text-be-orange" /> Financials
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100">
                <span className="text-sm text-gray-500">Total Value</span>
                <span className="text-lg font-bold text-gray-900">{deal.amount}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-700">
                <div className="flex items-center"><CheckCircle2 size={16} className="mr-2" /> <span className="text-sm font-medium">Received</span></div>
                <span className="text-lg font-bold">{deal.received}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100 text-gray-500">
                <div className="flex items-center"><Clock size={16} className="mr-2" /> <span className="text-sm font-medium">Pending</span></div>
                <span className="text-lg font-bold text-gray-900">{deal.pending}</span>
              </div>

              <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                <button className="w-full flex items-center justify-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                  <CreditCard size={16} className="mr-2" /> Record Payment
                </button>
                <button className="w-full flex items-center justify-center px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                  <Receipt size={16} className="mr-2" /> Generate Invoice
                </button>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Activity</h2>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-emerald-100 text-emerald-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  <CheckCircle2 size={16} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900 text-sm">Deal Won</span>
                    <span className="text-xs text-gray-500">Today 10:30 AM</span>
                  </div>
                  <div className="text-sm text-gray-500">Payment received in full.</div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  <CreditCard size={16} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900 text-sm">Invoice Sent</span>
                    <span className="text-xs text-gray-500">Yesterday</span>
                  </div>
                  <div className="text-sm text-gray-500">INV-2026-042 sent to client.</div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-gray-100 text-gray-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                  <FileText size={16} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900 text-sm">Deal Created</span>
                    <span className="text-xs text-gray-500">25 Sep 2026</span>
                  </div>
                  <div className="text-sm text-gray-500">Deal created by Vrunda F.</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
