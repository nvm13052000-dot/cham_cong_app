import React, { useState, useEffect } from 'react';
import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, updateDoc, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from './firebase';
import './App.css';

// --- HELPER FUNCTIONS ---
const getDaysArray = (month, year) => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1);
const getDayName = (day, month, year) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(year, month - 1, day).getDay()];
const sortEmployees = (list, sortBy) => {
  if (!list) return [];
  return [...list].sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = a.name ? a.name.split(' ').pop() : ''; 
      const nameB = b.name ? b.name.split(' ').pop() : '';
      return nameA.localeCompare(nameB);
    } else {
      const priority = { "Trưởng Khoa": 1, "Phó Khoa": 2, "Bác sĩ": 3, "Điều dưỡng": 4, "Y tá": 5 };
      return (priority[a.position] || 99) - (priority[b.position] || 99);
    }
  });
};

// Dữ liệu mặc định
const DEFAULT_SYMBOLS = [
  { code: '+', label: 'Lương thời hạn', val: 1, type: 'SALARY', order: 1 },
  { code: 'Ô', label: 'Ốm, điều dưỡng', val: 1, type: 'INSURANCE', order: 2 },
  { code: 'CO', label: 'Con ốm', val: 1, type: 'INSURANCE', order: 3 },
  { code: 'TS', label: 'Thai sản', val: 1, type: 'INSURANCE', order: 4 },
  { code: 'T', label: 'Tai nạn', val: 1, type: 'INSURANCE', order: 5 },
  { code: 'P', label: 'Nghỉ phép', val: 1, type: 'SALARY', order: 6 },
  { code: 'Bc', label: 'Bù chiều', val: 0.5, type: 'SALARY', order: 7 },
  { code: 'Hdh', label: 'Học dài hạn', val: 1, type: 'SALARY', order: 8 },
  { code: 'H', label: 'Hội nghị, học ngắn', val: 1, type: 'SALARY', order: 9 },
  { code: 'Bj', label: 'Nghỉ bù ngày', val: 1, type: 'SALARY', order: 10 },
  { code: 'No', label: 'Nghỉ không lương', val: 1, type: 'UNPAID', order: 11 },
  { code: 'N', label: 'Ngừng việc', val: 1, type: 'SALARY', order: 12 },
  { code: 'Lđ', label: 'Lao động nghĩa vụ', val: 1, type: 'SALARY', order: 13 },
  { code: 'Bs', label: 'Bù sáng', val: 0.5, type: 'SALARY', order: 14 },
  { code: 'Tr', label: 'Trực', val: 1, type: 'SALARY', order: 15 },
  { code: 'Ho', label: 'Học ôn', val: 1, type: 'SALARY', order: 16 },
  { code: 'Hs', label: 'Học sáng', val: 0.5, type: 'SALARY', order: 17 },
  { code: 'Hc', label: 'Học chiều', val: 0.5, type: 'SALARY', order: 18 },
  { code: 'CTs', label: 'Công tác sáng', val: 0.5, type: 'SALARY', order: 19 },
  { code: 'CTc', label: 'Công tác chiều', val: 0.5, type: 'SALARY', order: 20 },
];

// --- COMPONENTS ---
const Sidebar = ({ userRole, onLogout, onOpenChangePass, isOpen, onClose }) => (
  <>
    <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span>🏥 App Chấm Công</span>
        <span onClick={onClose} style={{cursor:'pointer', fontSize:24, display: window.innerWidth > 768 ? 'none':'block'}}>&times;</span>
      </div>
      <div style={{padding: '10px 0'}}>
        <div className="menu-item active" onClick={onClose}>🏠 {userRole === 'ADMIN' ? 'Quản Trị' : 'Trang Chủ'}</div>
        <div className="menu-item" onClick={()=>{onOpenChangePass(); onClose();}}>🔒 Đổi Mật Khẩu</div>
      </div>
      <div style={{marginTop: 'auto', padding: '20px'}}>
        <button onClick={onLogout} className="btn btn-logout" style={{width: '100%'}}>Đăng Xuất</button>
      </div>
    </div>
  </>
);

const Header = ({ title, email, notifications = [], onMenuClick, onShowLegend }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const unreadCount = notifications ? notifications.filter(n => !n.isRead).length : 0;

  const handleBellClick = async () => {
    if (showDropdown && unreadCount > 0) {
      const batch = writeBatch(db);
      notifications.filter(n => !n.isRead).forEach(notif => { const ref = doc(db, "requests", notif.id); batch.update(ref, { isRead: true }); });
      await batch.commit();
    }
    setShowDropdown(!showDropdown);
  };

  return (
    <div className="top-header">
      <div style={{display:'flex', alignItems:'center', gap:15}}>
        <button className="menu-btn" onClick={onMenuClick}>☰</button>
        <h2 style={{margin: 0, fontSize: '18px', color: '#1e293b', fontWeight: '700'}}>{title}</h2>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
        <button className="btn" style={{background:'#f1f5f9', color:'#64748b', border:'1px solid #e2e8f0', padding:'8px 12px'}} onClick={onShowLegend}>📖 <span style={{display: window.innerWidth<500?'none':'inline'}}>Ký hiệu</span></button>
        <div className="notification-bell-container" onClick={handleBellClick}>
            <span className="notification-bell">🔔</span>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </div>
          {showDropdown && (
            <div className="notification-dropdown">
              <div className="notif-header">Thông báo ({unreadCount} mới)</div>
              {(!notifications || notifications.length === 0) && <div style={{padding:20, color:'#94a3b8', textAlign:'center'}}>Không có thông báo nào</div>}
              {notifications && notifications.map((n, i) => (
                <div key={i} className={`notif-item ${n.isRead ? 'read' : 'unread'}`}>
                  <div style={{fontWeight:'700', color: n.status === 'APPROVED' ? '#10b981' : '#ef4444', marginBottom: 4}}>
                    {n.status === 'APPROVED' ? '✅ Đã duyệt' : '❌ Từ chối'}: {n.empName}
                  </div>
                  <div style={{fontSize:13, color:'#64748b'}}>
                    Ngày <span style={{fontWeight:600}}>{n.day}/{n.month}</span> &rarr; <b style={{color:'#1e293b'}}>{n.requestType}</b>
                    {n.status === 'REJECTED' && <div style={{marginTop:4, fontStyle:'italic', color:'#ef4444'}}>{n.rejectReason}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};

const LegendModal = ({ isOpen, onClose, symbols }) => {
  if (!isOpen) return null;
  const sortedSymbols = [...symbols].sort((a, b) => (a.order || 99) - (b.order || 99));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>📖 Bảng Ký Hiệu</h3><button onClick={onClose} className="close-btn">&times;</button></div>
        <div className="legend-grid">{sortedSymbols.map(s => (<div key={s.code} className="legend-item"><span className="legend-symbol">{s.code}</span><span className="legend-desc">{s.label}</span></div>))}</div>
      </div>
    </div>
  );
};

const RequestModal = ({ isOpen, onClose, onSubmit, dateInfo, symbols }) => {
  const [reason, setReason] = useState(''); const [type, setType] = useState('');
  const sortedSymbols = [...symbols].sort((a, b) => (a.order || 99) - (b.order || 99));
  useEffect(() => { if(sortedSymbols.length > 0) setType(sortedSymbols[0].code); }, [isOpen, symbols]);

  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header"><h3>📝 Gửi Yêu Cầu ({dateInfo.day}/{dateInfo.month})</h3><button onClick={onClose} className="close-btn">&times;</button></div>
        <div className="form-group"><label>Sửa thành:</label><select className="select-box" style={{width:'100%'}} value={type} onChange={e=>setType(e.target.value)}>{sortedSymbols.map(s => <option key={s.code} value={s.code}>{s.code} - {s.label}</option>)}</select></div>
        <div className="form-group"><label>Lý do (bắt buộc):</label><input className="login-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nhập lý do..." /></div>
        <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:25}}><button className="btn" onClick={onClose}>Hủy bỏ</button><button className="btn btn-primary" onClick={() => onSubmit(type, reason)} disabled={!reason}>Gửi yêu cầu</button></div>
      </div>
    </div>
  );
};

const ChangePasswordModal = ({ isOpen, onClose, onLogout }) => {
  const [oldPass, setOldPass] = useState(''); const [newPass, setNewPass] = useState('');
  const handleChange = async (e) => {
    e.preventDefault(); if(!auth.currentUser) return;
    try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, oldPass)); await updatePassword(auth.currentUser, newPass); alert("Thành công! Vui lòng đăng nhập lại."); onClose(); onLogout(); } catch (err) { alert("Lỗi: " + err.message); }
  };
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header"><h3>🔒 Đổi Mật Khẩu</h3><button onClick={onClose} className="close-btn">&times;</button></div>
        <form onSubmit={handleChange}><div className="form-group"><label>Mật khẩu cũ</label><input className="login-input" type="password" value={oldPass} onChange={e=>setOldPass(e.target.value)} required /></div><div className="form-group"><label>Mật khẩu mới</label><input className="login-input" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} required placeholder="Tối thiểu 6 ký tự" /></div><button className="btn btn-primary" style={{width:'100%', marginTop: 15, padding: 12}}>Lưu thay đổi</button></form>
      </div>
    </div>
  );
};

const AttendanceModal = ({ isOpen, onClose, onSave, dateInfo, symbols }) => {
  const [selected, setSelected] = useState('');
  const sortedSymbols = [...symbols].sort((a, b) => (a.order || 99) - (b.order || 99));
  useEffect(() => { if(sortedSymbols.length > 0) setSelected(sortedSymbols[0].code); }, [isOpen, symbols]);

  if(!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>Chấm công ({dateInfo.day}/{dateInfo.month})</h3><button onClick={onClose} className="close-btn">&times;</button></div>
        <div className="form-group"><label>Chọn trạng thái:</label><select className="select-box" style={{width:'100%'}} value={selected} onChange={e=>setSelected(e.target.value)}>{sortedSymbols.map(s => <option key={s.code} value={s.code}>{s.code} - {s.label}</option>)}</select></div>
        <div style={{display:'flex', gap:10, marginTop:25}}><button className="btn btn-primary" style={{width:'100%', padding:12}} onClick={()=>onSave(selected)}>Lưu lại</button></div>
      </div>
    </div>
  );
}

const AttendanceTable = ({ employees, attendanceData, onCellClick, month, year, pendingKeys = [], symbols }) => {
  const days = getDaysArray(month, year);
  const calculateTotals = (empId) => {
    let salary = 0; let unpaid = 0; let insurance = 0;
    days.forEach(d => {
      const key = `${empId}_${d}_${month}_${year}`; const code = attendanceData[key];
      if (code) { const sym = symbols.find(s => s.code === code); if (sym) { if (sym.type === 'SALARY') salary += Number(sym.val); if (sym.type === 'UNPAID') unpaid += Number(sym.val); if (sym.type === 'INSURANCE') insurance += Number(sym.val); } }
    });
    return { salary, unpaid, insurance };
  };

  return (
    <div className="matrix-wrapper">
      <table className="matrix-table">
        <thead>
          <tr><th style={{height: 35}}></th>{days.map(d => <th key={d} className={`th-day-name ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{getDayName(d,month,year)}</th>)}<th colSpan={3} style={{background: '#f1f5f9', color:'#1e293b', letterSpacing:'1px'}}>TỔNG</th></tr>
          <tr><th style={{top: 35}}>NHÂN VIÊN</th>{days.map(d => <th key={d} style={{top: 35}} className={`th-date-num ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{d}</th>)}<th className="col-total col-salary" style={{top:35}}>LTG</th><th className="col-total col-unpaid" style={{top:35}}>KoL</th><th className="col-total col-insurance" style={{top:35}}>BH</th></tr>
        </thead>
        <tbody>
          {employees.map(emp => {
            const totals = calculateTotals(emp.id);
            return (
              <tr key={emp.id}>
                <td title={emp.name}>{emp.name}</td>
                {days.map(d => {
                  const key = `${emp.id}_${d}_${month}_${year}`; const status = attendanceData[key] || '';
                  let cls = ['T7','CN'].includes(getDayName(d,month,year)) ? 'bg-weekend' : '';
                  if(status) cls = 'cell-work'; if(pendingKeys.includes(key)) cls += ' cell-pending';
                  return <td key={d} className={cls} onClick={() => onCellClick && onCellClick(emp, d, status)}>{status}</td>
                })}
                <td className="col-total col-salary">{totals.salary > 0 ? totals.salary : '-'}</td><td className="col-total col-unpaid">{totals.unpaid > 0 ? totals.unpaid : '-'}</td><td className="col-total col-insurance">{totals.insurance > 0 ? totals.insurance : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- SCREEN 1: KHOA ---
const DepartmentScreen = ({ userDept, userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [pendingKeys, setPendingKeys] = useState([]); 
  const [notifications, setNotifications] = useState([]);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [modal, setModal] = useState({ isOpen: false, emp: null, day: null }); 
  const [attModal, setAttModal] = useState({ isOpen: false, emp: null, day: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [config, setConfig] = useState({ lockDate: 2, limitHour: 10 });
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    if (!userDept) return;
    const unsubConf = onSnapshot(doc(db, "settings", "config"), (doc) => { if (doc.exists()) setConfig(doc.data()); });
    const unsubSym = onSnapshot(doc(db, "settings", "symbols"), (doc) => { if (doc.exists() && doc.data().list) setSymbols(doc.data().list); });
    getDocs(query(collection(db, "employees"), where("dept", "==", userDept))).then(s => setEmployees(s.docs.map(d => d.data())));
    const unsubAtt = onSnapshot(query(collection(db, "attendance"), where("dept", "==", userDept)), (snap) => {
      const d = {}; snap.forEach(doc => { const dt=doc.data(); d[`${dt.empId}_${dt.day}_${dt.month}_${dt.year}`] = dt.status; }); setAttendance(d);
    });
    const unsubPend = onSnapshot(query(collection(db, "requests"), where("dept", "==", userDept), where("status", "==", "PENDING")), (snap) => {
        setPendingKeys(snap.docs.map(doc => { const d = doc.data(); return `${d.empId}_${d.day}_${d.month}_${d.year}`; }));
    });
    const unsubNotif = onSnapshot(query(collection(db, "requests"), where("dept", "==", userDept), where("status", "in", ["APPROVED", "REJECTED"])), (snap) => {
      setNotifications(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });
    return () => { unsubAtt(); unsubPend(); unsubNotif(); unsubConf(); unsubSym(); };
  }, [userDept]);

  const checkIsLocked = (month, year) => {
    const nextYear = month === 12 ? year + 1 : year; const nextMonth = month === 12 ? 1 : month + 1;
    const lockDate = new Date(nextYear, nextMonth - 1, config.lockDate); lockDate.setHours(23, 59, 59);
    return new Date() > lockDate;
  };
  const isLocked = checkIsLocked(viewMonth, viewYear);
  const finalEmployees = sortEmployees(employees.filter(e => e.name && e.name.toLowerCase().includes(searchTerm.toLowerCase())), sortBy);

  const handleCellClick = (emp, day, currentStatus) => {
    if (isLocked) return alert(`❌ Đã khóa sổ (Ngày ${config.lockDate})!`);
    const selDate = new Date(viewYear, viewMonth-1, day); const today = new Date(); today.setHours(0,0,0,0);
    if (selDate > today) return alert("Không chấm công tương lai!");
    if (selDate < today || (selDate.getTime() === today.getTime() && new Date().getHours() >= config.limitHour)) setModal({ isOpen: true, emp, day, month: viewMonth, year: viewYear });
    else setAttModal({ isOpen: true, emp, day, month: viewMonth, year: viewYear });
  };

  const handleSaveAttendance = (code) => {
    setDoc(doc(db, "attendance", `${attModal.emp.id}_${attModal.day}_${viewMonth}_${viewYear}`), { empId: attModal.emp.id, day: attModal.day, month: viewMonth, year: viewYear, dept: attModal.emp.dept, status: code });
    setAttModal({ isOpen: false, emp: null, day: null });
  };

  const submitRequest = async (type, reason) => {
    if(!reason.trim()) return alert("Vui lòng nhập lý do!");
    await addDoc(collection(db, "requests"), { empId: modal.emp.id, empName: modal.emp.name, dept: userDept, day: modal.day, month: modal.month, year: modal.year, reason, requestType: type, status: 'PENDING', isRead: false, createdAt: Date.now() });
    alert("Đã gửi yêu cầu thành công!"); setModal({ isOpen: false, emp: null, day: null });
  };

  const handleExport = () => {
    const days = getDaysArray(viewMonth, viewYear);
    const data = employees.map(emp => {
      const r = { "Mã NV": emp.id, "Tên NV": emp.name };
      let salary = 0, unpaid = 0, insurance = 0;
      days.forEach(d => { 
        const code = attendance[`${emp.id}_${d}_${viewMonth}_${viewYear}`] || ''; r[`Ngày ${d}`] = code; 
        if (code) { const sym = symbols.find(s => s.code === code); if (sym) { if (sym.type === 'SALARY') salary += Number(sym.val); if (sym.type === 'UNPAID') unpaid += Number(sym.val); if (sym.type === 'INSURANCE') insurance += Number(sym.val); } }
      });
      r["Lương TG"] = salary; r["Ko Lương"] = unpaid; r["BHXH"] = insurance; return r;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "ChamCong"); XLSX.writeFile(wb, `ChamCong_${userDept}_T${viewMonth}_${viewYear}.xlsx`);
  }

  if (!userDept) return <div className="loading-screen"><div className="loading-spinner"></div>Đang tải dữ liệu...</div>;

  return (
    <div className="app-container">
      <Sidebar userRole="KHOA" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title={`Khoa: ${userDept}`} email={userEmail} notifications={notifications} onMenuClick={()=>setSidebarOpen(true)} onShowLegend={()=>setLegendOpen(true)} />
        <div className="dashboard-content">
          <div className="card">
            <div className="control-bar">
               <div className="filter-group"><select className="select-box" value={viewMonth} onChange={e=>setViewMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}</select><select className="select-box" value={viewYear} onChange={e=>setViewYear(Number(e.target.value))}>{Array.from({length: 5}, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}</select></div>
               <button className="btn btn-success" onClick={handleExport}>📥 Xuất Excel</button>
            </div>
            <div className="toolbar">
              <div className="search-box"><span className="search-icon">🔍</span><input className="search-input" placeholder="Tìm tên nhân viên..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
              <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="name">Sắp xếp: Tên A-Z</option><option value="position">Sắp xếp: Chức vụ</option></select>
              {isLocked && <div style={{background:'#fef2f2', color:'#ef4444', padding:'8px 12px', borderRadius:6, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:5}}>🔒 Đã khóa sổ</div>}
            </div>
            <AttendanceTable employees={finalEmployees} attendanceData={attendance} onCellClick={handleCellClick} month={viewMonth} year={viewYear} pendingKeys={pendingKeys} symbols={symbols} />
          </div>
        </div>
      </div>
      <RequestModal isOpen={modal.isOpen} onClose={()=>setModal({...modal, isOpen:false})} onSubmit={submitRequest} dateInfo={modal} symbols={symbols} />
      <AttendanceModal isOpen={attModal.isOpen} onClose={()=>setAttModal({...attModal, isOpen:false})} onSave={handleSaveAttendance} dateInfo={attModal} symbols={symbols} />
      <LegendModal isOpen={legendOpen} onClose={()=>setLegendOpen(false)} symbols={symbols} />
    </div>
  );
};

// --- SCREEN 2: GIAMDOC ---
const DirectorScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [requests, setRequests] = useState([]);
  const [selDept, setSelDept] = useState('ALL');
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [legendOpen, setLegendOpen] = useState(false);
  const [todayStats, setTodayStats] = useState({ total: 0, present: 0, unpaid: 0 });

  useEffect(() => {
    const unsubSym = onSnapshot(doc(db, "settings", "symbols"), (doc) => { if (doc.exists() && doc.data().list) setSymbols(doc.data().list); });
    getDocs(collection(db, "employees")).then(snap => {
      const emps = snap.docs.map(d => d.data()); setAllEmployees(emps);
      const depts = [...new Set(emps.map(e => e.dept))]; setDepartments(depts); 
    });
    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      const d = {}; snap.forEach(doc => { const dt=doc.data(); d[`${dt.empId}_${dt.day}_${dt.month}_${dt.year}`] = dt.status; }); setAttendance(d);
    });
    const unsubReq = onSnapshot(query(collection(db, "requests"), where("status", "==", "PENDING")), (snap) => setRequests(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubAtt(); unsubReq(); unsubSym(); };
  }, []);

  useEffect(() => {
    if (allEmployees.length === 0) return;
    const today = new Date(); const d = today.getDate(); const m = today.getMonth()+1; const y = today.getFullYear();
    let present = 0, unpaid = 0;
    allEmployees.forEach(emp => {
      const key = `${emp.id}_${d}_${m}_${y}`; const code = attendance[key];
      if (code) { const sym = symbols.find(s => s.code === code); if (sym && sym.type === 'SALARY') present++; else unpaid++; } else unpaid++;
    });
    setTodayStats({ total: allEmployees.length, present, unpaid });
  }, [attendance, allEmployees, symbols]);

  const handleApprove = async (req) => {
    if(!confirm(`Duyệt yêu cầu của ${req.empName}?`)) return;
    await updateDoc(doc(db, "requests", req.id), { status: 'APPROVED', isRead: false, createdAt: Date.now() }); 
    await setDoc(doc(db, "attendance", `${req.empId}_${req.day}_${req.month || 1}_${req.year || 2026}`), { empId: req.empId, day: req.day, month: req.month, year: req.year, dept: req.dept, status: req.requestType });
    alert("Đã duyệt!");
  };
  const handleReject = async (req) => {
    const reason = prompt("Nhập lý do từ chối:"); if(reason===null) return;
    await updateDoc(doc(db, "requests", req.id), { status: 'REJECTED', rejectReason: reason, isRead: false, createdAt: Date.now() });
  };
  const finalEmployees = sortEmployees(allEmployees.filter(e => (selDept === 'ALL' || e.dept === selDept) && e.name && (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.toLowerCase().includes(searchTerm.toLowerCase()))), sortBy);

  const handleExportExcel = () => {
    const days = getDaysArray(selMonth, selYear);
    const data = finalEmployees.map(emp => {
      const r = { "Mã NV": emp.id, "Tên NV": emp.name, "Khoa": emp.dept }; let salary=0, unpaid=0, insurance=0;
      days.forEach(d => { 
        const code = attendance[`${emp.id}_${d}_${selMonth}_${selYear}`] || ''; r[`Ngày ${d}`] = code;
        if(code) { const sym = symbols.find(s=>s.code===code); if(sym) { if(sym.type==='SALARY') salary+=Number(sym.val); if(sym.type==='UNPAID') unpaid+=Number(sym.val); if(sym.type==='INSURANCE') insurance+=Number(sym.val); } }
      });
      r["Lương TG"]=salary; r["Ko Lương"]=unpaid; r["BHXH"]=insurance; return r;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "ChamCong"); XLSX.writeFile(wb, `BaoCao_TongHop_T${selMonth}_${selYear}.xlsx`);
  };

  const cardStyle = { background: '#fff', padding: '20px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)', flex: 1, minWidth: 160, textAlign:'left', border:'1px solid #e2e8f0' };
  const statValue = { fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 8 };
  const statLabel = { fontSize: 14, color: '#64748b', fontWeight: 600 };
  
  return (
    <div className="app-container">
      <Sidebar userRole="GIAMDOC" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title="Tổng Quan Giám Đốc" email={userEmail} onMenuClick={()=>setSidebarOpen(true)} onShowLegend={()=>setLegendOpen(true)} />
        <div className="dashboard-content">
          <div style={{display:'flex', gap:20, flexWrap:'wrap', marginBottom: 25}}>
            <div style={{...cardStyle}}><div style={{...statValue, color:'#2563eb'}}>{todayStats.total}</div><div style={statLabel}>Tổng nhân sự</div></div>
            <div style={{...cardStyle}}><div style={{...statValue, color:'#10b981'}}>{todayStats.present}</div><div style={statLabel}>Đi làm hôm nay</div></div>
            <div style={{...cardStyle}}><div style={{...statValue, color:'#ef4444'}}>{todayStats.unpaid}</div><div style={statLabel}>Vắng / Ko lương</div></div>
          </div>

          {requests.length > 0 && (
            <div className="card" style={{borderLeft:'4px solid #2563eb'}}><h3>📝 Yêu cầu chờ duyệt ({requests.length})</h3>
              <table className="request-table">
                <thead><tr><th>Khoa</th><th>NV</th><th>Ngày</th><th>Đổi thành</th><th>Thao tác</th></tr></thead>
                <tbody>{requests.map(req => (<tr key={req.id}><td data-label="Khoa">{req.dept}</td><td data-label="NV" style={{fontWeight:600}}>{req.empName}</td><td data-label="Ngày">{req.day}/{req.month}</td><td data-label="Đổi" style={{color:'#10b981', fontWeight:'bold', fontSize:14}}>{req.requestType}</td><td data-label="Thao tác" style={{textAlign:'right'}}><div style={{display:'flex', gap:10, justifyContent:'flex-end'}}><button className="btn btn-success" onClick={()=>handleApprove(req)}>Chấp nhận</button><button className="btn btn-danger" onClick={()=>handleReject(req)}>Từ chối</button></div></td></tr>))}</tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h3>Dữ liệu chấm công toàn viện</h3>
            <div className="control-bar">
              <div className="filter-group">
                <label style={{fontWeight:600, fontSize:14, color:'#64748b'}}>Khoa:</label>
                <select className="select-box" value={selDept} onChange={e=>setSelDept(e.target.value)} style={{minWidth: 180, fontWeight:600}}><option value="ALL">Tất cả các khoa</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select>
                <label style={{fontWeight:600, fontSize:14, color:'#64748b', marginLeft:15}}>Tháng:</label>
                <select className="select-box" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}</select>
              </div>
              <button className="btn btn-success" onClick={handleExportExcel}>📥 Xuất Báo Cáo</button>
            </div>
            <div className="toolbar">
              <div className="search-box"><span className="search-icon">🔍</span><input className="search-input" placeholder="Tìm nhân viên..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
              <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="name">Sắp xếp: Tên A-Z</option><option value="position">Sắp xếp: Chức vụ</option></select>
            </div>
            <AttendanceTable employees={finalEmployees} attendanceData={attendance} month={selMonth} year={selYear} symbols={symbols} />
          </div>
        </div>
      </div>
      <LegendModal isOpen={legendOpen} onClose={()=>setLegendOpen(false)} symbols={symbols} />
    </div>
  );
};

// --- SCREEN 3: ADMIN (GIAO DIỆN ĐẸP HƠN) ---
const AdminScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]); 
  const [config, setConfig] = useState({ lockDate: 2, limitHour: 10 });
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [newAcc, setNewAcc] = useState({ email: '', pass: '', role: 'KHOA', dept: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    const unsubConf = onSnapshot(doc(db, "settings", "config"), (doc) => { if (doc.exists()) setConfig(doc.data()); });
    const unsubSym = onSnapshot(doc(db, "settings", "symbols"), (doc) => { 
        if (doc.exists() && doc.data().list) {
            const sortedList = doc.data().list.sort((a, b) => (a.order || 99) - (b.order || 99));
            setSymbols(sortedList); 
        }
    });
    const unsubEmp = onSnapshot(collection(db, "employees"), (snap) => setEmployees(snap.docs.map(d => d.data())));
    const unsubAcc = onSnapshot(collection(db, "users"), (snap) => setAccounts(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubEmp(); unsubAcc(); unsubConf(); unsubSym(); }
  }, []);

  const moveItem = (index, direction) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= symbols.length) return;
      const newList = [...symbols]; const temp = newList[index]; newList[index] = newList[targetIndex]; newList[targetIndex] = temp; setSymbols(newList);
  };

  const handleUpdateConfig = async () => { await setDoc(doc(db, "settings", "config"), config); alert("Đã lưu cấu hình!"); };
  const handleUpdateSymbols = async () => { const symbolsWithOrder = symbols.map((s, idx) => ({ ...s, order: idx + 1 })); await setDoc(doc(db, "settings", "symbols"), { list: symbolsWithOrder }); setSymbols(symbolsWithOrder); alert("Đã cập nhật ký hiệu!"); };
  const handleResetSymbols = () => { if(confirm("Khôi phục danh sách ký hiệu gốc?")) setSymbols(DEFAULT_SYMBOLS); };
  const handleDeleteAccount = async (id, email) => { if (!confirm(`Xóa tài khoản ${email}?`)) return; try { await deleteDoc(doc(db, "users", id)); alert("Đã xóa!"); } catch (err) { alert(err.message); } };
  const handleResetPassword = async (email) => { if (!confirm(`Gửi mail reset cho ${email}?`)) return; try { await sendPasswordResetEmail(auth, email); alert("Đã gửi mail!"); } catch (err) { alert(err.message); } };
  const handleCreateAccount = async (e) => { e.preventDefault(); if (newAcc.role === 'KHOA' && !newAcc.dept) return alert("Vui lòng nhập tên Khoa!"); setIsCreating(true); let secondaryApp = null; try { secondaryApp = initializeApp(getApp().options, "SecondaryApp"); const secondaryAuth = getAuth(secondaryApp); const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newAcc.email, newAcc.pass); await setDoc(doc(db, "users", userCredential.user.uid), { email: newAcc.email, role: newAcc.role, dept: newAcc.role === 'KHOA' ? newAcc.dept : '', createdAt: new Date().toISOString() }); await signOut(secondaryAuth); alert(`Đã tạo: ${newAcc.email}`); setNewAcc({ email: '', pass: '', role: 'KHOA', dept: '' }); } catch (error) { alert("Lỗi: " + error.message); } finally { if (secondaryApp) deleteApp(secondaryApp); setIsCreating(false); } };
  const handleFileUpload = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = async (evt) => { const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]); const existingIds = employees.map(e => e.id); let count = 0; for (let row of data) { if (!row.MaNV || existingIds.includes(String(row.MaNV))) continue; await setDoc(doc(db, "employees", String(row.MaNV)), { id: String(row.MaNV), name: row.TenNV, dept: row.Khoa, position: row.ChucVu }); count++; } alert(`Đã thêm ${count} nhân viên!`); }; reader.readAsBinaryString(file); e.target.value = null; };
  const handleDeleteEmployee = async (id) => { if(confirm("Xóa nhân viên này?")) await deleteDoc(doc(db, "employees", id)); };
  const changeSymbol = (idx, field, val) => { const newSyms = [...symbols]; newSyms[idx][field] = val; setSymbols(newSyms); };
  const finalEmployees = sortEmployees(employees.filter(e => e.name && (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.toLowerCase().includes(searchTerm.toLowerCase()) || e.dept.toLowerCase().includes(searchTerm.toLowerCase()))), sortBy);

  const tabStyle = (tabName) => ({ background: activeTab===tabName ? '#2563eb' : 'white', color: activeTab===tabName ? 'white' : '#64748b', border: activeTab===tabName ? 'none' : '1px solid #e2e8f0' });

  return (
    <div className="app-container">
      <Sidebar userRole="ADMIN" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title="Quản Trị Hệ Thống" email={userEmail} onMenuClick={()=>setSidebarOpen(true)} onShowLegend={()=>{}} />
        <div className="dashboard-content">
          <div style={{marginBottom:25, display:'flex', gap:10, flexWrap: 'wrap', paddingBottom:20, borderBottom:'1px solid #e2e8f0'}}>
             <button className="btn" style={tabStyle('employees')} onClick={()=>setActiveTab('employees')}>👥 Nhân viên</button>
             <button className="btn" style={tabStyle('accounts')} onClick={()=>setActiveTab('accounts')}>🔑 Tài khoản</button>
             <button className="btn" style={tabStyle('create_acc')} onClick={()=>setActiveTab('create_acc')}>➕ Cấp tài khoản</button>
             <button className="btn" style={tabStyle('symbols')} onClick={()=>setActiveTab('symbols')}>🔣 Ký hiệu công</button>
             <button className="btn" style={tabStyle('config')} onClick={()=>setActiveTab('config')}>⚙️ Cấu hình</button>
          </div>
          
          {activeTab === 'config' && (
            <div className="admin-form-container">
              <h3>⚙️ Cấu hình hệ thống</h3>
              <div className="config-container">
                <div className="config-item"><label>Giờ khóa sổ (Sáng)</label><input type="number" className="config-input" value={config.limitHour} onChange={e=>setConfig({...config, limitHour: Number(e.target.value)})} /></div>
                <div className="config-item"><label>Ngày khóa sổ tháng</label><input type="number" className="config-input" value={config.lockDate} onChange={e=>setConfig({...config, lockDate: Number(e.target.value)})} /></div>
                <button className="btn btn-success" onClick={handleUpdateConfig} style={{height:45, marginTop: 'auto', padding:'0 25px'}}>💾 Lưu cấu hình</button>
              </div>
              <p style={{marginTop:20, fontSize:14, color:'#64748b', textAlign:'center'}}>* Ví dụ: Ngày khóa sổ là 2, thì đến hết ngày 2 tháng sau sẽ không thể chấm công cho tháng trước đó.</p>
            </div>
          )}

          {activeTab === 'symbols' && (
            <div className="card">
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:20, alignItems:'center'}}><h3>🔣 Quản lý ký hiệu chấm công</h3><div style={{display:'flex', gap:15}}><button className="btn" onClick={handleResetSymbols}>Khôi phục gốc</button><button className="btn btn-success" onClick={handleUpdateSymbols}>💾 Lưu thay đổi</button></div></div>
              <div className="matrix-wrapper" style={{height: 'calc(100vh - 350px)'}}>
                <table className="request-table">
                  <thead><tr><th style={{width:80}}>Thứ tự</th><th style={{width:100}}>Mã hiển thị</th><th>Mô tả đầy đủ</th><th style={{width:120}}>Giá trị công</th><th style={{width:180}}>Nhóm tính tổng</th></tr></thead>
                  <tbody>{symbols.map((s, idx) => (<tr key={s.code}><td data-label="TT" style={{display:'flex', gap:10, alignItems:'center'}}><span style={{fontWeight:700, width:20}}>{idx+1}</span><div style={{display:'flex', flexDirection:'column'}}><button style={{border:'none', background:'none', cursor:'pointer', color:'#94a3b8', padding:2, lineHeight:1, fontSize:18}} onClick={()=>moveItem(idx,-1)}>▴</button><button style={{border:'none', background:'none', cursor:'pointer', color:'#94a3b8', padding:2, lineHeight:1, fontSize:18}} onClick={()=>moveItem(idx,1)}>▾</button></div></td><td data-label="Mã"><input value={s.code} onChange={e=>changeSymbol(idx,'code',e.target.value)} className="config-input" style={{width:'100%'}}/></td><td data-label="Mô tả"><input value={s.label} onChange={e=>changeSymbol(idx,'label',e.target.value)} className="login-input"/></td><td data-label="Giá trị"><input type="number" step="0.5" value={s.val} onChange={e=>changeSymbol(idx,'val',e.target.value)} className="config-input" style={{width:'100%'}}/></td><td data-label="Nhóm"><select value={s.type} onChange={e=>changeSymbol(idx,'type',e.target.value)} className="select-box" style={{width:'100%'}}><option value="SALARY">Lương thời gian</option><option value="UNPAID">Nghỉ không lương</option><option value="INSURANCE">Chế độ BHXH</option></select></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'create_acc' && (
            <div className="admin-form-container">
                <h3>➕ Cấp tài khoản mới</h3>
                <form onSubmit={handleCreateAccount}>
                  <div className="form-row">
                    <div className="form-group"><label>Email đăng nhập</label><input className="login-input" type="email" value={newAcc.email} onChange={e=>setNewAcc({...newAcc, email: e.target.value})} required placeholder="VD: khoanoi@benhvien.com" /></div>
                    <div className="form-group"><label>Mật khẩu</label><input className="login-input" type="text" value={newAcc.pass} onChange={e=>setNewAcc({...newAcc, pass: e.target.value})} required placeholder="Tối thiểu 6 ký tự" /></div>
                  </div>
                  <div className="form-group"><label>Loại tài khoản</label><select className="select-box" style={{width:'100%', padding: 12}} value={newAcc.role} onChange={e=>setNewAcc({...newAcc, role: e.target.value})}><option value="KHOA">Khoa / Phòng ban</option><option value="GIAMDOC">Ban Giám Đốc</option><option value="ADMIN">Quản trị viên hệ thống</option></select></div>
                  {newAcc.role === 'KHOA' && (<div className="form-group"><label>Tên Khoa (Hiển thị)</label><input className="login-input" type="text" value={newAcc.dept} onChange={e=>setNewAcc({...newAcc, dept: e.target.value})} required placeholder="VD: Khoa Nội Tổng Hợp" /></div>)}
                  <button className="btn btn-success" style={{width:'100%', marginTop: 25, padding: 14, fontSize: 16}} disabled={isCreating}>{isCreating ? '⏳ Đang xử lý...' : '✨ Tạo Tài Khoản Ngay'}</button>
                </form>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="card"><h3>Danh sách tài khoản hệ thống ({accounts.length})</h3>
              <div className="matrix-wrapper" style={{height: 'calc(100vh - 300px)'}}>
                <table className="request-table"><thead><tr><th>Email đăng nhập</th><th>Quyền hạn</th><th>Khoa phụ trách</th><th style={{textAlign:'right'}}>Thao tác</th></tr></thead>
                  <tbody>{accounts.map(a => (<tr key={a.id}><td data-label="Email" style={{fontWeight:600}}>{a.email}</td><td data-label="Quyền"><span style={{fontWeight:700, padding:'4px 10px', borderRadius:6, background: a.role==='ADMIN'?'#fee2e2':(a.role==='GIAMDOC'?'#dbeafe':'#f1f5f9'), color: a.role==='ADMIN'?'#dc2626':(a.role==='GIAMDOC'?'#2563eb':'#64748b')}}>{a.role}</span></td><td data-label="Khoa">{a.dept||'-'}</td><td data-label="Thao tác" style={{textAlign:'right'}}><div style={{display:'flex', gap:10, justifyContent:'flex-end'}}><button className="btn btn-primary" style={{fontSize:13, padding:'8px 12px'}} onClick={()=>handleResetPassword(a.email)}>📧 Gửi mail reset</button><button className="btn btn-logout" style={{fontSize:13, padding:'8px 12px'}} onClick={()=>handleDeleteAccount(a.id, a.email)}>🗑️ Xóa</button></div></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'employees' && (
            <div className="card">
              <h3>Danh sách nhân sự toàn viện ({finalEmployees.length})</h3>
              <div className="toolbar" style={{marginTop:20, marginBottom:20}}>
                 <div className="search-box"><span className="search-icon">🔍</span><input className="search-input" placeholder="Tìm theo tên, mã, hoặc khoa..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
                 <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="name">Sắp xếp: Tên A-Z</option><option value="position">Sắp xếp: Chức vụ</option></select>
                 <label className="btn btn-primary" style={{cursor:'pointer', marginLeft:'auto'}}>📂 Nhập từ Excel<input type="file" hidden onChange={handleFileUpload} accept=".xlsx, .xls" /></label>
              </div>
              <div className="matrix-wrapper" style={{height: 'calc(100vh - 380px)'}}>
                <table className="request-table">
                  <thead><tr><th>Mã NV</th><th>Họ và Tên</th><th>Khoa / Phòng</th><th>Chức Vụ</th><th style={{textAlign:'right'}}>Hành động</th></tr></thead>
                  <tbody>{finalEmployees.map(e => (<tr key={e.id}><td data-label="Mã" style={{fontWeight:700}}>{e.id}</td><td data-label="Tên" style={{fontWeight:600, color:'#1e293b'}}>{e.name}</td><td data-label="Khoa">{e.dept}</td><td data-label="Chức vụ">{e.position}</td><td data-label="Hành động" style={{textAlign:'right'}}><button className="btn btn-logout" style={{fontSize:13, padding:'8px 12px'}} onClick={()=>handleDeleteEmployee(e.id)}>🗑️ Xóa nhân viên</button></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState(localStorage.getItem('savedEmail') || '');
  const [loginPass, setLoginPass] = useState('');

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (u) { 
      const s = await getDoc(doc(db, "users", u.uid)); 
      if (s.exists()) { setUser(u); setUserData(s.data()); } 
      else { await signOut(auth); setUser(null); setUserData(null); alert("Tài khoản chưa được phân quyền!"); }
    } else { setUser(null); setUserData(null); }
    setLoading(false);
  }), []);

  const handleLogout = () => { if(user?.email) localStorage.setItem('savedEmail', user.email); signOut(auth); window.location.reload(); };

  if (loading) return <div className="loading-screen"><div className="loading-spinner"></div>Đang khởi tạo hệ thống...</div>;

  if (!user) {
    const handleLogin = async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, loginEmail, loginPass); } catch(err) { alert("Lỗi đăng nhập: " + err.message); } };
    return (
      <div className="login-container">
        <form onSubmit={handleLogin} className="login-card">
          <div className="login-icon">🏥</div>
          <div className="login-title">Hệ Thống Chấm Công</div>
          <div className="form-group" style={{textAlign:'left'}}>
            <label>Email đăng nhập</label>
            <input className="login-input" type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required placeholder="name@example.com" style={{padding:'14px'}}/>
          </div>
          <div className="form-group" style={{textAlign:'left'}}>
            <label>Mật khẩu</label>
            <input className="login-input" type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required placeholder="••••••••" style={{padding:'14px'}}/>
          </div>
          <button className="btn btn-primary login-btn">ĐĂNG NHẬP</button>
        </form>
      </div>
    );
  }

  return (
    <>
      {userData.role === 'KHOA' && <DepartmentScreen userDept={userData.dept} userEmail={user.email} onLogout={handleLogout} onOpenChangePass={()=>setChangePassOpen(true)} />}
      {userData.role === 'GIAMDOC' && <DirectorScreen userEmail={user.email} onLogout={handleLogout} onOpenChangePass={()=>setChangePassOpen(true)} />}
      {userData.role === 'ADMIN' && <AdminScreen userEmail={user.email} onLogout={handleLogout} onOpenChangePass={()=>setChangePassOpen(true)} />}
      <ChangePasswordModal isOpen={changePassOpen} onClose={()=>setChangePassOpen(false)} onLogout={handleLogout} />
    </>
  );
}

export default App;