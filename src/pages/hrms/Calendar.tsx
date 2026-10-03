import { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalIcon, Plus, Trash2, ChevronLeft, ChevronRight, 
  CheckCircle2, Clock, XCircle, AlertCircle, Info, Filter, Users, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { 
  insertZohoCalendarEvent, 
  deleteZohoCalendarEvent, 
  fetchZohoCalendarEvents 
} from '../../services/zohoService';

interface Event {
  id: string;
  title: string;
  date: string;
  type: 'Holiday' | 'Event' | 'Deadline' | 'Present' | 'Absent' | 'Half Day' | 'Late' | 'Leave';
  description?: string;
  empId?: string;
  empName?: string;
  zohoId?: string;
  email?: string;
  tag?: string;
}

const DEFAULT_HOLIDAYS_AND_EVENTS: Event[] = [
  // 2025 - 2027 Holidays (covering standard calendar range)
  { id: 'hol-1', title: 'New Year\'s Day', date: '2026-01-01', type: 'Holiday', description: 'Public Holiday' },
  { id: 'hol-2', title: 'Republic Day', date: '2026-01-26', type: 'Holiday', description: 'National Holiday' },
  { id: 'hol-3', title: 'Maha Shivratri', date: '2026-02-15', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-4', title: 'Holi (Festival of Colors)', date: '2026-03-04', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-5', title: 'Id-ul-Fitr', date: '2026-03-20', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-6', title: 'Mahavir Jayanti', date: '2026-04-01', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-7', title: 'Good Friday', date: '2026-04-03', type: 'Holiday', description: 'Public Holiday' },
  { id: 'hol-8', title: 'Eid al-Adha (Bakrid)', date: '2026-05-27', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-9', title: 'Muharram', date: '2026-06-26', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-10', title: 'Independence Day', date: '2026-08-15', type: 'Holiday', description: 'National Holiday' },
  { id: 'hol-11', title: 'Janmashtami', date: '2026-09-04', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-12', title: 'Milad-un-Nabi', date: '2026-09-24', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-13', title: 'Mahatma Gandhi Jayanti', date: '2026-10-02', type: 'Holiday', description: 'National Holiday' },
  { id: 'hol-14', title: 'Dussehra (Vijayadashami)', date: '2026-10-20', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-15', title: 'Diwali (Deepavali)', date: '2026-11-08', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-16', title: 'Govardhan Puja', date: '2026-11-09', type: 'Holiday', description: 'Restricted Holiday' },
  { id: 'hol-17', title: 'Bhai Dooj', date: '2026-11-10', type: 'Holiday', description: 'Restricted Holiday' },
  { id: 'hol-18', title: 'Guru Nanak Jayanti', date: '2026-11-24', type: 'Holiday', description: 'Gazetted Holiday' },
  { id: 'hol-19', title: 'Christmas Day', date: '2026-12-25', type: 'Holiday', description: 'Public Holiday' }
];

export const Calendar = () => {
  const { currentUser, isSuperAdmin, isHR, isTL, isTM } = useAuth();
  const [customEvents, setCustomEvents] = useState<Event[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('me');
  const [filterCategory, setFilterCategory] = useState<'All' | 'Attendance' | 'Holidays' | 'Leaves' | 'Events'>('All');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(new Date().toISOString().split('T')[0]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ title: '', date: new Date().toISOString().split('T')[0], type: 'Event' as Event['type'], description: '' });
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    // Custom calendar events
    const savedCal = localStorage.getItem('be_calendar');
    if (savedCal) {
      try {
        setCustomEvents(JSON.parse(savedCal));
      } catch (e) {
        setCustomEvents(DEFAULT_HOLIDAYS_AND_EVENTS);
      }
    } else {
      setCustomEvents(DEFAULT_HOLIDAYS_AND_EVENTS);
      localStorage.setItem('be_calendar', JSON.stringify(DEFAULT_HOLIDAYS_AND_EVENTS));
    }

    // Attendance
    const savedAtt = localStorage.getItem('be_attendance');
    if (savedAtt) {
      try { setAttendance(JSON.parse(savedAtt)); } catch (e) {}
    }

    // Leaves
    const savedLeaves = localStorage.getItem('be_leaves');
    if (savedLeaves) {
      try { setLeaves(JSON.parse(savedLeaves)); } catch (e) {}
    }

    // Employees
    const savedEmps = localStorage.getItem('be_employees');
    if (savedEmps) {
      try { setEmployees(JSON.parse(savedEmps)); } catch (e) {}
    }

    // Background fetch live Zoho CRM Company_Calendar events
    fetchZohoCalendarEvents().then(res => {
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setCustomEvents(prev => {
          const merged = [...prev];
          res.data.forEach((item: any) => {
            const zohoIdStr = String(item.id);
            const exists = merged.some(e => e.zohoId === zohoIdStr || (e.title && (e.title ?? '').toLowerCase() === (item.Name || '').toLowerCase() && e.date === item.Date));
            if (!exists && item.Name) {
              merged.push({
                id: `EV-${zohoIdStr.slice(-4)}`,
                title: item.Name,
                date: item.Date || new Date().toISOString().split('T')[0],
                type: (item.Category_Type as Event['type']) || 'Event',
                description: item.Description || '',
                zohoId: zohoIdStr,
                email: item.Email || '',
                tag: item.Tag || ''
              });
            }
          });
          localStorage.setItem('be_calendar', JSON.stringify(merged));
          return merged;
        });
      }
    }).catch(err => console.warn('[Zoho CRM] Calendar fetch warning:', err));
  }, []);

  const saveCustomEvents = (data: Event[]) => {
    setCustomEvents(data);
    localStorage.setItem('be_calendar', JSON.stringify(data));
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = `EV-${Date.now()}`;
    const newEvent: Event = { 
      id: eventId, 
      title: formData.title,
      date: formData.date,
      type: formData.type,
      description: formData.description,
      email: currentUser?.email || 'hr@bharatenterprises.in',
      tag: formData.type
    };

    const updated = [...customEvents, newEvent];
    saveCustomEvents(updated);
    setIsModalOpen(false);
    setFormData({ title: '', date: new Date().toISOString().split('T')[0], type: 'Event', description: '' });

    // Background sync to Zoho CRM Company_Calendar
    try {
      const zohoRes = await insertZohoCalendarEvent(newEvent);
      if (zohoRes.success && zohoRes.zohoId) {
        const withZohoId = updated.map(ev => ev.id === eventId ? { ...ev, zohoId: zohoRes.zohoId } : ev);
        saveCustomEvents(withZohoId);
      }
    } catch (err) {
      console.error('[Zoho CRM] Calendar event sync error:', err);
    }
  };

  const handleDeleteCustomEvent = async (id: string) => {
    const target = customEvents.find(e => e.id === id);
    const updated = customEvents.filter(e => e.id !== id);
    saveCustomEvents(updated);

    // Delete in Zoho CRM in background if zohoId exists
    if (target?.zohoId) {
      try {
        await deleteZohoCalendarEvent(target.zohoId);
      } catch (err) {
        console.error('[Zoho CRM] Calendar delete error:', err);
      }
    }
  };

  // Compile all visible events for the selected employee and filters
  const allEvents = useMemo(() => {
    const result: Event[] = [...customEvents];

    // Target employee ID to filter attendance/leaves
    const targetId = selectedEmpId === 'me' 
      ? (currentUser.empId || currentUser.id)
      : selectedEmpId;

    // 1. Process Attendance records
    attendance.forEach(att => {
      const isMatch = selectedEmpId === 'all' 
        ? true 
        : (att.empId === targetId || (selectedEmpId === 'me' && att.empName === currentUser.name));

      if (isMatch) {
        let attType: Event['type'] = 'Present';
        if (att.status === 'Absent') attType = 'Absent';
        else if (att.status === 'Half Day') attType = 'Half Day';
        else if (att.status === 'Late') attType = 'Late';

        result.push({
          id: `att-${att.id || att.date + att.empId}`,
          title: selectedEmpId === 'all' ? `${att.empName}: ${att.status}` : `Attendance: ${att.status}`,
          date: att.date,
          type: attType,
          description: att.checkIn ? `In: ${att.checkIn} | Out: ${att.checkOut || '--'}` : `Status: ${att.status}`,
          empId: att.empId,
          empName: att.empName
        });
      }
    });

    // 2. Process Approved Leaves
    leaves.filter(l => l.status === 'Approved').forEach(leave => {
      const isMatch = selectedEmpId === 'all' 
        ? true 
        : (leave.empId === targetId || (selectedEmpId === 'me' && leave.empName === currentUser.name));

      if (isMatch && leave.startDate && leave.endDate) {
        try {
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);
          const cur = new Date(start);
          while (cur <= end) {
            const dateStr = cur.toISOString().split('T')[0];
            result.push({
              id: `leave-${leave.id}-${dateStr}`,
              title: selectedEmpId === 'all' ? `${leave.empName} (Leave)` : `On Leave (${leave.type})`,
              date: dateStr,
              type: 'Leave',
              description: `Reason: ${leave.reason || leave.type}`,
              empId: leave.empId,
              empName: leave.empName
            });
            cur.setDate(cur.getDate() + 1);
          }
        } catch (e) {
          // ignore date parse issues
        }
      }
    });

    return result;
  }, [customEvents, attendance, leaves, selectedEmpId, currentUser]);

  // Filter by category
  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
      if (filterCategory === 'All') return true;
      if (filterCategory === 'Attendance') return ['Present', 'Absent', 'Half Day', 'Late'].includes(ev.type);
      if (filterCategory === 'Holidays') return ev.type === 'Holiday';
      if (filterCategory === 'Leaves') return ev.type === 'Leave';
      if (filterCategory === 'Events') return ev.type === 'Event' || ev.type === 'Deadline';
      return true;
    });
  }, [allEvents, filterCategory]);

  const getEventBadgeClass = (type: Event['type']) => {
    switch (type) {
      case 'Present': return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      case 'Late': return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      case 'Half Day': return 'bg-purple-100 text-purple-800 border-purple-300 font-bold';
      case 'Absent': return 'bg-red-100 text-red-800 border-red-300 font-bold';
      case 'Holiday': return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'Leave': return 'bg-yellow-100 text-yellow-900 border-yellow-300 font-bold';
      case 'Deadline': return 'bg-red-50 text-red-700 border-red-200 font-semibold';
      case 'Event':
      default: return 'bg-blue-100 text-blue-800 border-blue-300 font-semibold';
    }
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const selectedDayEvents = filteredEvents.filter(e => e.date === selectedDateStr);
  const sortedUpcomingEvents = [...filteredEvents]
    .filter(e => new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const isFullAdmin = isSuperAdmin || isHR;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <CalIcon className="mr-2 text-be-orange" size={26} /> Company & Attendance Calendar
            </h1>
            <span className="px-3 py-1 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
              Color-Coded Live Hub
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Track daily attendance records, official public holidays, approved leaves, and organizational events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Employee Filter for Admins and TLs */}
          {(isFullAdmin || isTL) && (
            <div className="flex items-center space-x-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs">
              <Users size={14} className="text-gray-400" />
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="bg-transparent font-bold text-gray-800 outline-none text-xs cursor-pointer"
              >
                <option value="me">My Attendance & Records</option>
                {isFullAdmin && <option value="all">All Organization Members</option>}
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.systemRole || emp.dept})
                  </option>
                ))}
              </select>
            </div>
          )}

          {(isFullAdmin || isTL) && (
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="bg-be-orange hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center shadow-md shadow-orange-500/20 transition-all"
            >
              <Plus size={16} className="mr-1.5" /> Add Event
            </button>
          )}
        </div>
      </div>

      {/* Interactive Color Legend & Category Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mr-1 flex items-center">
              <Filter size={12} className="mr-1" /> View:
            </span>
            {(['All', 'Attendance', 'Holidays', 'Leaves', 'Events'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterCategory === cat
                    ? 'bg-be-orange text-white shadow-sm ring-2 ring-be-orange/30'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {cat === 'All' ? 'All Records' : cat}
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-gray-500">
            Selected Day: <span className="font-bold text-gray-900">{selectedDateStr}</span> ({selectedDayEvents.length} items)
          </div>
        </div>

        {/* Color Legend Badges */}
        <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">Color Key:</span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span> Present
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span> Late
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-500 mr-1.5"></span> Half Day
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-800 border border-red-300">
            <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></span> Absent
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-yellow-100 text-yellow-900 border border-yellow-300">
            <span className="w-2 h-2 rounded-full bg-yellow-500 mr-1.5"></span> Approved Leave
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5"></span> Public Holiday
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></span> Company Event
          </span>
        </div>
      </div>

      {/* Main Calendar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Month Grid View */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          {/* Calendar Controls */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-black text-gray-900">
                {currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </h2>
              <button
                onClick={goToToday}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors"
              >
                Today
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button 
                onClick={prevMonth} 
                className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 hover:text-gray-900"
                title="Previous Month"
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                onClick={nextMonth} 
                className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 hover:text-gray-900"
                title="Next Month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          
          {/* 7-Column Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 bg-gray-100 p-2 rounded-2xl border border-gray-200 flex-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-gray-50/80 py-2 text-center text-xs font-extrabold text-gray-500 rounded-lg uppercase tracking-wider">
                {day}
              </div>
            ))}
            
            {blanks.map(b => (
              <div key={`blank-${b}`} className="bg-white/40 min-h-[95px] p-1.5 rounded-xl opacity-40"></div>
            ))}
            
            {days.map(day => {
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = filteredEvents.filter(e => e.date === dateStr);
              const isToday = new Date().toISOString().split('T')[0] === dateStr;
              const isSelected = selectedDateStr === dateStr;
              
              return (
                <div 
                  key={day} 
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`bg-white min-h-[95px] p-1.5 rounded-xl flex flex-col cursor-pointer transition-all duration-150 border ${
                    isSelected
                      ? 'ring-2 ring-be-orange border-be-orange shadow-md bg-orange-50/20'
                      : isToday 
                      ? 'border-orange-300 bg-orange-50/10' 
                      : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday 
                        ? 'bg-be-orange text-white shadow-sm' 
                        : isSelected 
                        ? 'bg-amber-100 text-amber-900 font-black' 
                        : 'text-gray-700'
                    }`}>
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-gray-400">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Day Events Stack */}
                  <div className="flex-1 space-y-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map(ev => (
                      <div 
                        key={ev.id} 
                        className={`text-[10px] px-1.5 py-0.5 rounded-md leading-tight border truncate ${getEventBadgeClass(ev.type)}`} 
                        title={`${ev.title} (${ev.type}) - ${ev.description || ''}`}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[9px] font-bold text-gray-500 pl-1">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details & Upcoming Schedule Sidebar */}
        <div className="space-y-6">
          {/* Day Inspector Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Day Inspector</h3>
                <p className="text-xs text-gray-500">
                  {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <span className="px-2.5 py-1 bg-orange-50 text-be-orange font-bold text-xs rounded-full border border-orange-200">
                {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {selectedDayEvents.map((ev) => (
                <div key={ev.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border ${getEventBadgeClass(ev.type)}`}>
                      {ev.type}
                    </span>
                    {ev.id.startsWith('EV-') && (
                      <button 
                        onClick={() => handleDeleteCustomEvent(ev.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Delete custom event"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <h4 className="font-bold text-gray-900 text-xs">{ev.title}</h4>
                  {ev.description && (
                    <p className="text-[11px] text-gray-500">{ev.description}</p>
                  )}
                </div>
              ))}

              {selectedDayEvents.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-xs">
                  <CalIcon size={28} className="mx-auto text-gray-300 mb-1.5" />
                  No events or attendance logged for this date.
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Schedule Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-[340px]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
              <h3 className="font-extrabold text-gray-900 text-base">Upcoming Schedule</h3>
              <Sparkles size={16} className="text-amber-500" />
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {sortedUpcomingEvents.slice(0, 10).map((ev) => (
                <div 
                  key={ev.id} 
                  onClick={() => setSelectedDateStr(ev.date)}
                  className="p-3 border rounded-xl border-gray-100 hover:border-orange-200 hover:bg-orange-50/20 cursor-pointer transition-all shadow-sm group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-900 text-xs group-hover:text-be-orange transition-colors">{ev.title}</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border shrink-0 ${getEventBadgeClass(ev.type)}`}>
                      {ev.type}
                    </span>
                  </div>
                </div>
              ))}

              {sortedUpcomingEvents.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-10">
                  No upcoming events scheduled.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Custom Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-bold text-gray-900">Add Calendar Event</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <form onSubmit={handleAddEvent} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Event Title</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="e.g. Project Demo, Strategy Sync, Client Presentation"
                    value={formData.title} 
                    onChange={e => setFormData({...formData, title: e.target.value})} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-be-orange focus:ring-2 focus:ring-be-orange/20" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Date</label>
                  <input 
                    required 
                    type="date" 
                    value={formData.date} 
                    onChange={e => setFormData({...formData, date: e.target.value})} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-be-orange focus:ring-2 focus:ring-be-orange/20" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Category / Type</label>
                  <select 
                    required 
                    value={formData.type} 
                    onChange={e => setFormData({...formData, type: e.target.value as any})} 
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-be-orange"
                  >
                    <option value="Event">Company Event</option>
                    <option value="Deadline">Deadline</option>
                    <option value="Holiday">Official Holiday</option>
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Absent">Absent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Description (Optional)</label>
                  <textarea 
                    rows={2}
                    placeholder="Additional notes or meeting agenda..."
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-be-orange"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 bg-be-orange hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20">
                    Add to Calendar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

