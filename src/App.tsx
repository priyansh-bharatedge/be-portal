import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PageLoader } from './components/ui/PageLoader';
import { ProtectedRoute } from './components/ProtectedRoute';

// ── Always eagerly loaded (tiny, needed immediately) ─────────────────────────
import { Login } from './pages/Login';
import { ModuleSelection } from './pages/ModuleSelection';
import { AppLayout } from './layouts/AppLayout';

// ── CRM Pages (lazy) ──────────────────────────────────────────────────────────
const CrmDashboard     = lazy(() => import('./pages/crm/Dashboard').then(m => ({ default: m.CrmDashboard })));
const Deals            = lazy(() => import('./pages/crm/Deals').then(m => ({ default: m.Deals })));
const DealDetails      = lazy(() => import('./pages/crm/DealDetails').then(m => ({ default: m.DealDetails })));
const Clients          = lazy(() => import('./pages/crm/Clients').then(m => ({ default: m.Clients })));
const Companies        = lazy(() => import('./pages/crm/Companies').then(m => ({ default: m.Companies })));
const CrmDocuments     = lazy(() => import('./pages/crm/Documents').then(m => ({ default: m.Documents })));
const Quotations       = lazy(() => import('./pages/crm/Quotations').then(m => ({ default: m.Quotations })));
const QuotationDetails = lazy(() => import('./pages/crm/QuotationDetails').then(m => ({ default: m.QuotationDetails })));

// ── HRMS Pages (lazy) ─────────────────────────────────────────────────────────
const HrmsDashboard    = lazy(() => import('./pages/hrms/Dashboard').then(m => ({ default: m.HrmsDashboard })));
const Employees        = lazy(() => import('./pages/hrms/Employees').then(m => ({ default: m.Employees })));
const EmployeeDetails  = lazy(() => import('./pages/hrms/EmployeeDetails').then(m => ({ default: m.EmployeeDetails })));
const Attendance       = lazy(() => import('./pages/hrms/Attendance').then(m => ({ default: m.Attendance })));
const Leaves           = lazy(() => import('./pages/hrms/Leaves').then(m => ({ default: m.Leaves })));
const Salary           = lazy(() => import('./pages/hrms/Salary').then(m => ({ default: m.Salary })));
const Calendar         = lazy(() => import('./pages/hrms/Calendar').then(m => ({ default: m.Calendar })));
const Policies         = lazy(() => import('./pages/hrms/Policies').then(m => ({ default: m.Policies })));
const HrmsDocuments    = lazy(() => import('./pages/hrms/Documents').then(m => ({ default: m.Documents })));
const HrmsReports      = lazy(() => import('./pages/hrms/Reports').then(m => ({ default: m.Reports })));
const MyTeam           = lazy(() => import('./pages/hrms/MyTeam').then(m => ({ default: m.MyTeam })));
const DSR              = lazy(() => import('./pages/hrms/Dsr').then(m => ({ default: m.DSR })));

// ── Quality Pages (lazy) ──────────────────────────────────────────────────────
const QualityDashboard = lazy(() => import('./pages/quality/Dashboard').then(m => ({ default: m.QualityDashboard })));
const RaisedQueries    = lazy(() => import('./pages/quality/RaisedQueries').then(m => ({ default: m.RaisedQueries })));
const QualityReports   = lazy(() => import('./pages/quality/Reports').then(m => ({ default: m.Reports })));

// ── Global (lazy) ─────────────────────────────────────────────────────────────
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));

// Suspense wrapper — shown while any lazy chunk is loading
const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/modules" 
            element={
              <ProtectedRoute>
                <ModuleSelection />
              </ProtectedRoute>
            } 
          />

          {/* Main Application Layout wrapper */}
          <Route 
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* CRM Routes */}
            <Route path="/crm/dashboard"      element={<Lazy><CrmDashboard /></Lazy>} />
            <Route path="/crm/quotations"     element={<Lazy><Quotations /></Lazy>} />
            <Route path="/crm/quotations/:id" element={<Lazy><QuotationDetails /></Lazy>} />
            <Route path="/crm/deals"          element={<Lazy><Deals /></Lazy>} />
            <Route path="/crm/deals/:id"      element={<Lazy><DealDetails /></Lazy>} />
            <Route path="/crm/clients"        element={<Lazy><Clients /></Lazy>} />
            <Route path="/crm/companies"      element={<Lazy><Companies /></Lazy>} />
            <Route path="/crm/documents"      element={<Lazy><CrmDocuments /></Lazy>} />

            {/* HRMS Routes */}
            <Route path="/hrms/dashboard"     element={<Lazy><HrmsDashboard /></Lazy>} />
            <Route path="/hrms/my-team"       element={<Lazy><MyTeam /></Lazy>} />
            <Route path="/hrms/employees"     element={<Lazy><Employees /></Lazy>} />
            <Route path="/hrms/employees/:id" element={<Lazy><EmployeeDetails /></Lazy>} />
            <Route path="/hrms/attendance"    element={<Lazy><Attendance /></Lazy>} />
            <Route path="/hrms/dsr"           element={<Lazy><DSR /></Lazy>} />
            <Route path="/hrms/leaves"        element={<Lazy><Leaves /></Lazy>} />
            <Route path="/hrms/salary"        element={<Lazy><Salary /></Lazy>} />
            <Route path="/hrms/calendar"      element={<Lazy><Calendar /></Lazy>} />
            <Route path="/hrms/policies"      element={<Lazy><Policies /></Lazy>} />
            <Route path="/hrms/documents"     element={<Lazy><HrmsDocuments /></Lazy>} />
            <Route path="/hrms/reports"       element={<Lazy><HrmsReports /></Lazy>} />

            {/* Quality Routes */}
            <Route path="/quality/dashboard"  element={<Lazy><QualityDashboard /></Lazy>} />
            <Route path="/quality/queries"    element={<Lazy><RaisedQueries /></Lazy>} />
            <Route path="/quality/reports"    element={<Lazy><QualityReports /></Lazy>} />

            {/* Global */}
            <Route path="/settings"           element={<Lazy><Settings /></Lazy>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
