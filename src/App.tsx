import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Login } from './pages/Login';
import { ModuleSelection } from './pages/ModuleSelection';
import { AppLayout } from './layouts/AppLayout';

// CRM Pages
import { CrmDashboard } from './pages/crm/Dashboard';
import { Deals } from './pages/crm/Deals';
import { DealDetails } from './pages/crm/DealDetails';
import { Clients } from './pages/crm/Clients';
import { Companies } from './pages/crm/Companies';
import { Documents } from './pages/crm/Documents';
import { Quotations } from './pages/crm/Quotations';
import { QuotationDetails } from './pages/crm/QuotationDetails';

// HRMS Pages
import { HrmsDashboard } from './pages/hrms/Dashboard';
import { Employees } from './pages/hrms/Employees';
import { EmployeeDetails } from './pages/hrms/EmployeeDetails';
import { Attendance } from './pages/hrms/Attendance';
import { Leaves } from './pages/hrms/Leaves';
import { Salary } from './pages/hrms/Salary';
import { Calendar } from './pages/hrms/Calendar';
import { Policies } from './pages/hrms/Policies';
import { Documents as HrmsDocuments } from './pages/hrms/Documents';
import { Reports as HrmsReports } from './pages/hrms/Reports';
import { MyTeam } from './pages/hrms/MyTeam';
import { DSR } from './pages/hrms/Dsr';

// Quality Pages
import { QualityDashboard } from './pages/quality/Dashboard';
import { Reports as QualityReports } from './pages/quality/Reports';

// Global Settings
import { Settings } from './pages/Settings';
import { RaisedQueries } from './pages/quality/RaisedQueries';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/modules" element={<ModuleSelection />} />
          
          {/* Main Application Layout wrapper */}
          <Route element={<AppLayout />}>
            {/* CRM Routes */}
            <Route path="/crm/dashboard" element={<CrmDashboard />} />
            <Route path="/crm/quotations" element={<Quotations />} />
            <Route path="/crm/quotations/:id" element={<QuotationDetails />} />
            <Route path="/crm/deals" element={<Deals />} />
            <Route path="/crm/deals/:id" element={<DealDetails />} />
            <Route path="/crm/clients" element={<Clients />} />
            <Route path="/crm/companies" element={<Companies />} />
            <Route path="/crm/documents" element={<Documents />} />
            
            {/* HRMS Routes */}
            <Route path="/hrms/dashboard" element={<HrmsDashboard />} />
            <Route path="/hrms/my-team" element={<MyTeam />} />
            <Route path="/hrms/employees" element={<Employees />} />
            <Route path="/hrms/employees/:id" element={<EmployeeDetails />} />
            <Route path="/hrms/attendance" element={<Attendance />} />
            <Route path="/hrms/dsr" element={<DSR />} />
            <Route path="/hrms/leaves" element={<Leaves />} />
            <Route path="/hrms/salary" element={<Salary />} />
            <Route path="/hrms/calendar" element={<Calendar />} />
            <Route path="/hrms/policies" element={<Policies />} />
            <Route path="/hrms/documents" element={<HrmsDocuments />} />
            <Route path="/hrms/reports" element={<HrmsReports />} />
            
            {/* Quality Routes */}
            <Route path="/quality/dashboard" element={<QualityDashboard />} />
            <Route path="/quality/queries" element={<RaisedQueries />} />
            <Route path="/quality/reports" element={<QualityReports />} />
            
            {/* Global */}
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
