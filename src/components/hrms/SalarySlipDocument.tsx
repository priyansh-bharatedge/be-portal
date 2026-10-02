import React from 'react';
import { BHARATEDGE_LOGO_BASE64 } from '../../services/logoBase64';
import {
  type SalaryRecord,
  formatINR,
  formatPayPeriod,
  formatDOJ,
  numberToIndianWords
} from '../../utils/salarySlipTemplate';

interface SalarySlipDocumentProps {
  salary: SalaryRecord;
  className?: string;
  isPrintPreview?: boolean;
}

export const SalarySlipDocument: React.FC<SalarySlipDocumentProps> = ({
  salary,
  className = '',
  isPrintPreview = false
}) => {
  if (!salary) return null;

  const payPeriod = salary.payPeriodDisplay || formatPayPeriod(salary.month);
  const doj = salary.dateOfJoining ? formatDOJ(salary.dateOfJoining) : '03-Feb-2026';
  const inWords = salary.netSalaryInWords || numberToIndianWords(salary.netSalary);
  const companyEntity = salary.salaryEntity === 'BSPL'
    ? 'BharatEdge Solutions Private Limited'
    : 'BharatEdge Startup Advisors Private Limited';

  return (
    <div
      className={`bg-white text-slate-900 border-[2.5px] border-black font-sans leading-normal relative select-text ${
        isPrintPreview ? 'shadow-none' : 'shadow-2xl rounded-sm'
      } ${className}`}
      style={{
        maxWidth: '820px',
        margin: '0 auto',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      }}
    >
      {/* 1. Header Section */}
      <div className="flex items-center justify-between border-b-2 border-black p-4 sm:p-5 gap-4">
        <div className="flex-shrink-0 w-44 sm:w-56 flex items-center">
          <img
            src={BHARATEDGE_LOGO_BASE64}
            alt="BharatEdge Logo"
            className="max-h-12 sm:max-h-14 object-contain"
          />
        </div>
        <div className="flex-1 text-center pr-2 sm:pr-4">
          <div className="text-base sm:text-lg font-black text-black uppercase tracking-wide mb-0.5">
            Payslip - {payPeriod}
          </div>
          <div className="text-xs sm:text-sm font-bold text-black mb-0.5">
            {companyEntity}
          </div>
          <div className="text-[10px] sm:text-[11px] font-medium text-slate-800 leading-tight">
            Unit- 505/506 Skylar Building Prahlad Nagar, Ahmedabad, Gujarat 380015
          </div>
        </div>
      </div>

      {/* 2. Employee Meta Information */}
      <div className="border-b-2 border-black p-3 sm:p-4 text-xs sm:text-[12.5px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {/* Row 1 */}
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">EMP ID</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{salary.empId}</span>
          </div>
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Employee Name</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-semibold text-black">{salary.empName}</span>
          </div>

          {/* Row 2 */}
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Date of Joining</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{doj}</span>
          </div>
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Designation</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">
              {salary.designation || 'Business Development Manager'}
            </span>
          </div>

          {/* Row 3 */}
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Pay Period</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{payPeriod}</span>
          </div>
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Department</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{salary.department || 'Sales'}</span>
          </div>

          {/* Row 4 */}
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Present Days</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{salary.presentDays}</span>
          </div>
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Unpaid Leave</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{salary.unpaidLeaveDays}</span>
          </div>

          {/* Row 5 */}
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Paid Leave</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{salary.paidLeaveDays}</span>
          </div>
          <div className="flex items-baseline">
            <span className="font-bold text-black w-32 flex-shrink-0">Total Paid Days</span>
            <span className="font-bold text-black mr-2">:</span>
            <span className="font-medium text-black">{salary.totalPaidDays}</span>
          </div>
        </div>
      </div>

      {/* 3. Earnings & Deductions Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-black font-extrabold text-black">
              <th className="py-2 px-3 text-center border-r-2 border-black w-1/4">Earnings</th>
              <th className="py-2 px-3 text-center border-r-2 border-black w-[18%]">Amount</th>
              <th className="py-2 px-3 text-center border-r-2 border-black w-[32%]">Deductions</th>
              <th className="py-2 px-3 text-center w-1/4">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Row 1 */}
            <tr className="h-7 border-b border-gray-200/50">
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">Basic</td>
              <td className="py-1 px-3.5 text-right border-r-2 border-black font-medium">
                {formatINR(salary.basic)}
              </td>
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                Provident Fund
              </td>
              <td className="py-1 px-3.5 text-right font-medium">
                {formatINR(salary.pf || 0)}
              </td>
            </tr>

            {/* Row 2 */}
            <tr className="h-7 border-b border-gray-200/50">
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                Incentive Pay
              </td>
              <td className="py-1 px-3.5 text-right border-r-2 border-black font-medium">
                {formatINR(salary.incentivePay || 0)}
              </td>
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                Professional Tax
              </td>
              <td className="py-1 px-3.5 text-right font-medium">
                {formatINR(salary.professionalTax || 0)}
              </td>
            </tr>

            {/* Row 3 */}
            <tr className="h-7 border-b border-gray-200/50">
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                {salary.hra > 0 ? 'House Rent Allowance (HRA)' : ''}
              </td>
              <td className="py-1 px-3.5 text-right border-r-2 border-black font-medium">
                {salary.hra > 0 ? formatINR(salary.hra) : ''}
              </td>
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                Unpaid Leaves ({salary.unpaidLeaveDays || 0})
              </td>
              <td className="py-1 px-3.5 text-right font-medium">
                {formatINR(salary.unpaidLeavesDeduction || 0)}
              </td>
            </tr>

            {/* Row 4 */}
            <tr className="h-7 border-b border-gray-200/50">
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                {salary.allowances > 0 ? 'Other Allowances' : ''}
              </td>
              <td className="py-1 px-3.5 text-right border-r-2 border-black font-medium">
                {salary.allowances > 0 ? formatINR(salary.allowances) : ''}
              </td>
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                Talk Time
              </td>
              <td className="py-1 px-3.5 text-right font-medium">
                {formatINR(salary.talkTimeDeduction || 0)}
              </td>
            </tr>

            {/* Row 5 */}
            <tr className="h-7 border-b border-gray-200/50">
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium"></td>
              <td className="py-1 px-3.5 text-right border-r-2 border-black font-medium"></td>
              <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">Hold</td>
              <td className="py-1 px-3.5 text-right font-medium">
                {formatINR(salary.holdDeduction || 0)}
              </td>
            </tr>

            {salary.tds > 0 && (
              <tr className="h-7 border-b border-gray-200/50">
                <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium"></td>
                <td className="py-1 px-3.5 text-right border-r-2 border-black font-medium"></td>
                <td className="py-1 px-3.5 text-left border-r-2 border-black font-medium">
                  TDS / Income Tax
                </td>
                <td className="py-1 px-3.5 text-right font-medium">{formatINR(salary.tds)}</td>
              </tr>
            )}

            {/* Totals Row */}
            <tr className="border-t-2 border-b-2 border-black font-bold text-black bg-white">
              <td className="py-2 px-3.5 text-left border-r-2 border-black font-extrabold">
                Total Gross
              </td>
              <td className="py-2 px-3.5 text-right border-r-2 border-black font-extrabold">
                {formatINR(salary.totalGross)}
              </td>
              <td className="py-2 px-3.5 text-left border-r-2 border-black font-extrabold">
                <div>Total Deductions</div>
                <div className="mt-1">Net Pay</div>
              </td>
              <td className="py-2 px-3.5 text-right font-extrabold">
                <div>{formatINR(salary.totalDeductions)}</div>
                <div className="mt-1">{formatINR(salary.netSalary)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. Net Amount Callout Box */}
      <div className="border-b-2 border-black p-3.5 text-center bg-white">
        <div className="text-base sm:text-lg font-black text-black mb-0.5">
          {formatINR(salary.netSalary)}
        </div>
        <div className="text-xs sm:text-sm font-bold text-black">
          {inWords}
        </div>
      </div>

      {/* 5. Footer & Declaration */}
      <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row justify-between items-center sm:items-end gap-3 text-[11px] text-slate-800">
        <div className="italic font-medium text-center sm:text-left">
          This is a computer-generated document. No signature is required.
        </div>
        <div className="text-center pt-2">
          <div className="w-40 border-t border-black mb-1 mx-auto"></div>
          <div className="text-xs font-bold text-black">Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
};
