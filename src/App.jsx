import React, { useState, useEffect } from 'react';
import { initializeApp, getApp, deleteApp } from "firebase/app";
// Đã thêm sendPasswordResetEmail vào dòng import
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, updateDoc, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from './firebase';
import './App.css';

// --- HELPER FUNCTIONS ---
const getDaysArray = (month, year) => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1);
const getDayName = (day, month, year) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(year, month - 1, day).getDay()];
const sortEmployees = (list, sortBy) => {
  return [...list].sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = a.name.split(' ').pop(); const nameB = b.name.split(' ').pop();
      return nameA.localeCompare(nameB);
    } else {
      const priority = { "Trưởng Khoa": 1, "Phó Khoa": 2, "Bác sĩ": 3, "Điều dưỡng": 4, "Y tá": 5 };
      return (priority[a.position] || 99) - (priority[b.position] || 99);
    }
  });
};

// --- COMPONENTS ---
const Sidebar = ({ userRole, onLogout, onOpenChangePass, isOpen, onClose }) => (
  <>
    {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span>🏥 HospitalApp</span>
        <span onClick={onClose} style={{cursor:'pointer', fontSize:24, display: window.innerWidth > 768 ? 'none':'block'}}>&times;</span>
      </div>
      <div className="menu-item active">🏠 {userRole === 'ADMIN' ? 'Quản Trị' : 'Trang Chủ'}</div>
      <div className="menu-item" onClick={()=>{onOpenChangePass(); onClose();}}>🔒 Đổi Mật Khẩu</div>
      <div style={{marginTop: 'auto', padding: '20px'}}>
        <button onClick={onLogout} className="btn btn-logout" style={{width: '100%'}}>Đăng Xuất</button>
      </div>
    </div>
  </>
);

const Header = ({ title, email, notifications = [], onMenuClick }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localUnread, setLocalUnread] = useState(0);
  useEffect(() => { setLocalUnread(notifications.length); }, [notifications]);
  const handleBellClick = async () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown && notifications.length > 0) {
      setLocalUnread(0);
      const batch = writeBatch(db);
      notifications.forEach(notif => { const ref = doc(db, "requests", notif.id); batch.update(ref, { isRead: true }); });
      await batch.commit();
    }
  };
  return (
    <div className="top-header">
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <button className="menu-btn" onClick={onMenuClick}>☰</button>
        <h2 style={{margin: 0, fontSize: '16px', color: '#334155'}}>{title}</h2>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
        <div className="notification-container">
          <div className="notification-bell" onClick={handleBellClick}>🔔 {localUnread > 0 && <span className="badge">{localUnread}</span>}</div>
          {showDropdown && (
            <div className="notification-dropdown">
              <div style={{fontWeight:'bold', padding:10, borderBottom:'1px solid #eee'}}>Thông báo mới ({notifications.length})</div>
              {notifications.length === 0 && <div style={{padding:15, color:'#888', textAlign:'center'}}>Không có thông báo mới</div>}
              {notifications.map((n, i) => (
                <div key={i} className="notif-item">
                  <div style={{fontWeight:'bold', color: n.status === 'APPROVED' ? 'green' : 'red'}}>{n.status === 'APPROVED' ? '✅ Đã duyệt' : '❌ Từ chối'}: {n.empName}</div>
                  <div style={{fontSize:12, color:'#555'}}>Ngày {n.day}/{n.month} &rarr; <b>{n.requestType}</b>{n.status === 'REJECTED' && <div>Lý do: {n.rejectReason}</div>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{fontSize: '13px', fontWeight: 500, display: window.innerWidth < 500 ? 'none':'block'}}>{email}</div>
      </div>
    </div>
  );
};

const RequestModal = ({ isOpen, onClose, onSubmit, dateInfo }) => {
  const [reason, setReason] = useState(''); const [type, setType] = useState('X');
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>📝 Gửi yêu cầu</h3>
        <p style={{fontSize:13, color:'#666', marginBottom:10}}>Ngày: {dateInfo.day}/{dateInfo.month}/{dateInfo.year}</p>
        <div className="form-group"><label>Sửa thành:</label><select className="select-box" style={{width:'100%'}} value={type} onChange={e=>setType(e.target.value)}><option value="X">✅ Đi làm (X)</option><option value="P">⚠️ Nghỉ phép (P)</option><option value="KP">❌ Không phép (KP)</option></select></div>
        <div className="form-group"><label>Lý do:</label><input className="login-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nhập lý do..." /></div>
        <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:20}}><button className="btn" onClick={onClose} style={{background:'#f1f5f9', color:'#333'}}>Hủy</button><button className="btn btn-primary" onClick={() => onSubmit(type, reason)}>Gửi</button></div>
      </div>
    </div>
  );
};

// --- MODAL BÁO CÁO ---
const AbsentReportModal = ({ isOpen, onClose, absentList, deptName }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-lg">
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:15}}>
          <h3>📉 Báo cáo vắng mặt</h3>
          <button onClick={onClose} style={{border:'none', background:'none', fontSize:20}}>&times;</button>
        </div>
        <div style={{padding:15, background:'white', border:'1px solid #eee'}}>
           <div className="capture-header" style={{textAlign:'center', marginBottom:20, borderBottom:'2px solid #2563eb', paddingBottom:10}}>
              <div style={{fontSize:20, fontWeight:'bold', textTransform:'uppercase'}}>BÁO CÁO QUÂN SỐ</div>
              <div style={{fontWeight:'bold', marginTop:5}}>Khoa: {deptName || 'Toàn viện'}</div>
              <div style={{fontSize:14, color:'#666'}}>Ngày: {new Date().getDate()}/{new Date().getMonth()+1}/{new Date().getFullYear()}</div>
           </div>
           <table className="request-table" style={{width:'100%', borderCollapse:'collapse'}}>
             <thead><tr style={{background:'#f1f5f9', borderBottom:'2px solid #333'}}><th style={{padding:8, border:'1px solid #ddd'}}>Họ tên</th><th style={{padding:8, border:'1px solid #ddd'}}>Chức vụ</th><th style={{padding:8, border:'1px solid #ddd'}}>Trạng thái</th></tr></thead>
             <tbody>
               {absentList.length === 0 ? (<tr><td colSpan={3} style={{textAlign:'center', padding:20}}>Đi làm đầy đủ! 🎉</td></tr>) : 
               absentList.map((item, i) => (
                 <tr key={i}>
                   <td style={{padding:8, border:'1px solid #ddd'}}>{item.name}</td>
                   <td style={{padding:8, border:'1px solid #ddd'}}>{item.position}</td>
                   <td style={{padding:8, border:'1px solid #ddd', textAlign:'center', fontWeight:'bold', color: item.status==='P'?'#a16207':'#b91c1c'}}>{item.status === 'P' ? 'Nghỉ phép' : 'Vắng / KP'}</td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};

const ChangePasswordModal = ({ isOpen, onClose, onLogout }) => {
  const [oldPass, setOldPass] = useState(''); const [newPass, setNewPass] = useState('');
  const handleChange = async (e) => {
    e.preventDefault(); if(!auth.currentUser) return;
    try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, oldPass)); await updatePassword(auth.currentUser, newPass); alert("Thành công! Đăng nhập lại."); onClose(); onLogout(); } catch (err) { alert("Lỗi: " + err.message); }
  };
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>🔒 Đổi Mật Khẩu</h3>
        <form onSubmit={handleChange}><div className="form-group"><input className="login-input" type="password" placeholder="Mật khẩu cũ" value={oldPass} onChange={e=>setOldPass(e.target.value)} required /></div><div className="form-group"><input className="login-input" type="password" placeholder="Mật khẩu mới" value={newPass} onChange={e=>setNewPass(e.target.value)} required /></div><button className="btn btn-primary" style={{width:'100%'}}>Lưu</button><button type="button" className="btn" onClick={onClose} style={{width:'100%', marginTop:10, background:'#f1f5f9', color:'#333'}}>Hủy</button></form>
      </div>
    </div>
  );
};

const AttendanceTable = ({ employees, attendanceData, onCellClick, month, year, pendingKeys = [] }) => {
  const days = getDaysArray(month, year);
  return (
    <div className="matrix-wrapper">
      <table className="matrix-table">
        <thead>
          <tr><th style={{height: 35}}></th>{days.map(d => <th key={d} className={`th-day-name ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{getDayName(d,month,year)}</th>)}<th colSpan={3} style={{background: '#f1f5f9', fontSize:11}}>TỔNG</th></tr>
          <tr><th style={{top: 41}}>NHÂN VIÊN</th>{days.map(d => <th key={d} style={{top: 41}} className={`th-date-num ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{d}</th>)}<th style={{top:41,color:'green'}}>X</th><th style={{top:41,color:'#a16207'}}>P</th><th style={{top:41,color:'red'}}>KP</th></tr>
        </thead>
        <tbody>
          {employees.map(emp => {
            let X=0, P=0, KP=0;
            return (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                {days.map(d => {
                  const key = `${emp.id}_${d}_${month}_${year}`; const status = attendanceData[key] || '-';
                  if(status==='X') X++; if(status==='P') P++; if(status==='KP') KP++;
                  let cls = ['T7','CN'].includes(getDayName(d,month,year)) ? 'bg-weekend' : '';
                  if(status==='X') cls='cell-work'; if(status==='P') cls='cell-leave'; if(status==='KP') cls='cell-kp';
                  if(pendingKeys.includes(key)) cls += ' cell-pending';
                  return <td key={d} className={cls} onClick={() => onCellClick && onCellClick(emp, d, status)}>{status}</td>
                })}
                <td style={{color:'green', fontWeight:'bold'}}>{X}</td><td style={{color:'#a16207', fontWeight:'bold'}}>{P}</td><td style={{color:'red', fontWeight:'bold'}}>{KP}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- SCREENS ---
const DepartmentScreen = ({ userDept, userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [pendingKeys, setPendingKeys] = useState([]); 
  const [notifications, setNotifications] = useState([]);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [modal, setModal] = useState({ isOpen: false, emp: null, day: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [config, setConfig] = useState({ lockDate: 2, limitHour: 10 });

  useEffect(() => {
    const unsubConf = onSnapshot(doc(db, "settings", "config"), (doc) => { if (doc.exists()) setConfig(doc.data()); else setDoc(doc.ref, { lockDate: 2, limitHour: 10 }); });
    getDocs(query(collection(db, "employees"), where("dept", "==", userDept))).then(s => setEmployees(s.docs.map(d => d.data())));
    const unsubAtt = onSnapshot(query(collection(db, "attendance"), where("dept", "==", userDept)), (snap) => {
      const d = {}; snap.forEach(doc => { const dt=doc.data(); d[`${dt.empId}_${dt.day}_${dt.month}_${dt.year}`] = dt.status; }); setAttendance(d);
    });
    const unsubPend = onSnapshot(query(collection(db, "requests"), where("dept", "==", userDept), where("status", "==", "PENDING")), (snap) => {
        setPendingKeys(snap.docs.map(doc => { const d = doc.data(); return `${d.empId}_${d.day}_${d.month}_${d.year}`; }));
    });
    const unsubNotif = onSnapshot(query(collection(db, "requests"), where("dept", "==", userDept), where("status", "in", ["APPROVED", "REJECTED"]), where("isRead", "==", false)), (snap) => setNotifications(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubAtt(); unsubPend(); unsubNotif(); unsubConf(); };
  }, [userDept]);

  const checkIsLocked = (month, year) => {
    const nextYear = month === 12 ? year + 1 : year; const nextMonth = month === 12 ? 1 : month + 1;
    const lockDate = new Date(nextYear, nextMonth - 1, config.lockDate); lockDate.setHours(23, 59, 59);
    return new Date() > lockDate;
  };
  const isLocked = checkIsLocked(viewMonth, viewYear);
  const finalEmployees = sortEmployees(employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.toLowerCase().includes(searchTerm.toLowerCase())), sortBy);

  const handleCellClick = (emp, day, currentStatus) => {
    if (isLocked) return alert(`❌ Đã khóa sổ (Ngày ${config.lockDate})!`);
    const selDate = new Date(viewYear, viewMonth-1, day); const today = new Date(); today.setHours(0,0,0,0);
    if (selDate > today) return alert("Không chấm công tương lai!");
    if (selDate < today || (selDate.getTime() === today.getTime() && new Date().getHours() >= config.limitHour)) setModal({ isOpen: true, emp, day, month: viewMonth, year: viewYear });
    else {
      let next = currentStatus === 'X' ? 'P' : (currentStatus === 'P' ? 'KP' : (currentStatus === 'KP' ? '-' : 'X'));
      setDoc(doc(db, "attendance", `${emp.id}_${day}_${viewMonth}_${viewYear}`), { empId: emp.id, day, month: viewMonth, year: viewYear, dept: emp.dept, status: next });
    }
  };

  const handleBulk = async () => {
    if (isLocked) return alert("Đã khóa sổ!"); 
    if (new Date().getHours() >= config.limitHour) return alert(`Quá ${config.limitHour}h sáng!`);
    if (!confirm("Chấm tất cả đi làm?")) return;
    const day = new Date().getDate();
    const batch = finalEmployees.map(emp => {
      const key = `${emp.id}_${day}_${viewMonth}_${viewYear}`;
      if (!attendance[key]) return setDoc(doc(db, "attendance", key), { empId: emp.id, day, month: viewMonth, year: viewYear, dept: emp.dept, status: 'X' });
      return Promise.resolve();
    });
    await Promise.all(batch); alert("Xong!");
  };

  const submitRequest = async (type, reason) => {
    await addDoc(collection(db, "requests"), { empId: modal.emp.id, empName: modal.emp.name, dept: userDept, day: modal.day, month: modal.month, year: modal.year, reason, requestType: type, status: 'PENDING', isRead: false });
    alert("Đã gửi yêu cầu!"); setModal({ isOpen: false, emp: null, day: null });
  };
  const handleExport = () => {
    const days = getDaysArray(viewMonth, viewYear);
    const data = employees.map(emp => {
      const r = { "Mã NV": emp.id, "Tên NV": emp.name }; let X=0, P=0, KP=0;
      days.forEach(d => { const s = attendance[`${emp.id}_${d}_${viewMonth}_${viewYear}`] || '-'; r[`Ngày ${d}`] = s; if(s==='X') X++; if(s==='P') P++; if(s==='KP') KP++; });
      r["Tổng Công"]=X; r["Phép"]=P; r["KP"]=KP; return r;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "ChamCong"); XLSX.writeFile(wb, `ChamCong_${userDept}_T${viewMonth}.xlsx`);
  }

  return (
    <div className="app-container">
      <Sidebar userRole="KHOA" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title={`Khoa: ${userDept}`} email={userEmail} notifications={notifications} onMenuClick={()=>setSidebarOpen(true)} />
        <div className="dashboard-content">
          <div className="card">
            <div className="toolbar">
              <div className="search-box"><span className="search-icon">🔍</span><input className="search-input" placeholder="Tìm kiếm..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
              <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="name">Tên A-Z</option><option value="position">Chức vụ</option></select>
              {!isLocked && <button className="btn btn-primary" onClick={handleBulk}>⚡ Chấm nhanh</button>}
            </div>
            {isLocked && <div className="lock-badge"><span className="lock-icon">🔒</span> Tháng này đã khóa sổ (Ngày {config.lockDate}).</div>}
            <div className="control-bar">
               <div className="filter-group"><select className="select-box" value={viewMonth} onChange={e=>setViewMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}</select><select className="select-box" value={viewYear} onChange={e=>setViewYear(Number(e.target.value))}>{Array.from({length: 5}, (_, i) => 2026 + i).map(y => <option key={y} value={y}>{y}</option>)}</select></div>
               <button className="btn btn-success" onClick={handleExport}>📥 Excel</button>
            </div>
            <AttendanceTable employees={finalEmployees} attendanceData={attendance} onCellClick={handleCellClick} month={viewMonth} year={viewYear} pendingKeys={pendingKeys} />
          </div>
        </div>
      </div>
      <RequestModal isOpen={modal.isOpen} onClose={()=>setModal({...modal, isOpen:false})} onSubmit={submitRequest} dateInfo={modal} />
    </div>
  );
};

const DirectorScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [requests, setRequests] = useState([]);
  const [selDept, setSelDept] = useState('');
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [absentModalOpen, setAbsentModalOpen] = useState(false);
  const [absentList, setAbsentList] = useState([]);

  useEffect(() => {
    getDocs(collection(db, "employees")).then(snap => {
      const emps = snap.docs.map(d => d.data()); setAllEmployees(emps);
      const depts = [...new Set(emps.map(e => e.dept))]; setDepartments(depts); if (depts.length > 0) setSelDept(depts[0]);
    });
    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      const d = {}; snap.forEach(doc => { const dt=doc.data(); d[`${dt.empId}_${dt.day}_${dt.month}_${dt.year}`] = dt.status; }); setAttendance(d);
    });
    const unsubReq = onSnapshot(query(collection(db, "requests"), where("status", "==", "PENDING")), (snap) => setRequests(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubAtt(); unsubReq(); };
  }, []);

  const handleApprove = async (req) => {
    if(!confirm(`Duyệt cho ${req.empName} sửa thành ${req.requestType}?`)) return;
    await updateDoc(doc(db, "requests", req.id), { status: 'APPROVED' });
    await setDoc(doc(db, "attendance", `${req.empId}_${req.day}_${req.month || 1}_${req.year || 2026}`), { empId: req.empId, day: req.day, month: req.month, year: req.year, dept: req.dept, status: req.requestType || 'X' });
    alert("Đã duyệt!");
  };

  const handleReject = async (req) => {
    const reason = prompt("Lý do từ chối:", "Không hợp lệ"); if(reason === null) return;
    await updateDoc(doc(db, "requests", req.id), { status: 'REJECTED', rejectReason: reason });
    alert("Đã từ chối!");
  };

  const handleShowAbsent = () => {
    const today = new Date(); const d = today.getDate(); const m = today.getMonth()+1; const y = today.getFullYear();
    const list = [];
    const targetEmployees = allEmployees.filter(e => e.dept === selDept);
    targetEmployees.forEach(emp => {
      const key = `${emp.id}_${d}_${m}_${y}`;
      if (attendance[key] !== 'X') list.push({ ...emp, status: attendance[key] || 'KP' });
    });
    setAbsentList(list);
    setAbsentModalOpen(true);
  };

  const finalEmployees = sortEmployees(allEmployees.filter(e => e.dept === selDept && (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.toLowerCase().includes(searchTerm.toLowerCase()))), sortBy);

  const handleExportExcel = () => {
    const days = getDaysArray(selMonth, selYear);
    const data = finalEmployees.map(emp => {
      const r = { "Mã NV": emp.id, "Tên NV": emp.name }; let X=0, P=0, KP=0;
      days.forEach(d => { const s = attendance[`${emp.id}_${d}_${selMonth}_${selYear}`] || '-'; r[`Ngày ${d}`] = s; if(s==='X') X++; if(s==='P') P++; if(s==='KP') KP++; });
      r["Tổng Công"]=X; r["Phép"]=P; r["KP"]=KP; return r;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "ChamCong"); XLSX.writeFile(wb, `CC_${selDept}_T${selMonth}.xlsx`);
  };

  return (
    <div className="app-container">
      <Sidebar userRole="GIAMDOC" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title="Giám Đốc" email={userEmail} onMenuClick={()=>setSidebarOpen(true)} />
        <div className="dashboard-content">
          <div style={{marginBottom: 20}}>
            <button className="btn btn-primary" onClick={handleShowAbsent}>📉 Xem vắng hôm nay</button>
          </div>

          {requests.length > 0 && (
            <div className="card" style={{borderLeft:'5px solid #2563eb'}}>
              <h3>📝 Yêu cầu chờ duyệt ({requests.length})</h3>
              <div style={{overflowX: 'auto'}}>
                <table className="request-table">
                  <thead><tr><th>Khoa</th><th>Nhân viên</th><th>Ngày</th><th>Xin đổi</th><th>Lý do</th><th style={{textAlign:'right'}}>Thao tác</th></tr></thead>
                  <tbody>{requests.map(req => (<tr key={req.id}><td data-label="Khoa">{req.dept}</td><td data-label="NV">{req.empName}</td><td data-label="Ngày">{req.day}/{req.month}</td><td data-label="Đổi thành" style={{fontWeight:'bold', color:req.requestType==='KP'?'red':'green'}}>{req.requestType}</td><td data-label="Lý do">{req.reason}</td><td data-label="Thao tác" style={{textAlign:'right'}}><button className="btn btn-success" style={{marginRight:5}} onClick={()=>handleApprove(req)}>Duyệt</button><button className="btn btn-danger" onClick={()=>handleReject(req)}>Từ chối</button></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="card">
            <div className="toolbar">
              <div className="search-box"><span className="search-icon">🔍</span><input className="search-input" placeholder="Tìm trong khoa..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
              <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="name">Tên A-Z</option><option value="position">Chức vụ</option></select>
            </div>
            <div className="control-bar"><div className="filter-group"><label>Khoa:</label><select className="select-box" value={selDept} onChange={e=>setSelDept(e.target.value)}>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select><label>Tháng:</label><select className="select-box" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}</select></div><button className="btn btn-success" onClick={handleExportExcel}>📥 Excel</button></div>
            <AttendanceTable employees={finalEmployees} attendanceData={attendance} month={selMonth} year={selYear} />
          </div>
        </div>
      </div>
      <AbsentReportModal isOpen={absentModalOpen} onClose={()=>setAbsentModalOpen(false)} absentList={absentList} deptName={selDept} />
    </div>
  );
};

// --- SCREEN 3: ADMIN (Đã thêm lại nút Reset Pass) ---
const AdminScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [config, setConfig] = useState({ lockDate: 2, limitHour: 10 });
  const [newAcc, setNewAcc] = useState({ email: '', pass: '', role: 'KHOA', dept: '' });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const unsubConf = onSnapshot(doc(db, "settings", "config"), (doc) => { if (doc.exists()) setConfig(doc.data()); else setDoc(doc.ref, { lockDate: 2, limitHour: 10 }); });
    const unsubEmp = onSnapshot(collection(db, "employees"), (snap) => setEmployees(snap.docs.map(d => d.data())));
    const unsubAcc = onSnapshot(collection(db, "users"), (snap) => setAccounts(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubEmp(); unsubAcc(); unsubConf(); }
  }, []);

  // --- HÀM GỬI EMAIL RESET (DÀNH CHO MAIL THẬT) ---
  const handleResetPassword = async (email) => {
    if (!confirm(`Gửi email đặt lại mật khẩu cho ${email}?`)) return;
    try {
      await sendPasswordResetEmail(auth, email);
      alert("✅ Đã gửi email thành công! Vui lòng kiểm tra hộp thư.");
    } catch (error) {
      alert("Lỗi: " + error.message);
    }
  };

  const handleUpdateConfig = async () => { await setDoc(doc(db, "settings", "config"), config); alert("Cập nhật cấu hình thành công!"); };
  const handleBackup = async () => {
    alert("Đang tải dữ liệu backup...");
    const empSnap = await getDocs(collection(db, "employees"));
    const attSnap = await getDocs(collection(db, "attendance"));
    const reqSnap = await getDocs(collection(db, "requests"));
    const userSnap = await getDocs(collection(db, "users"));
    const data = { employees: empSnap.docs.map(d => d.data()), attendance: attSnap.docs.map(d => d.data()), requests: reqSnap.docs.map(d => d.data()), users: userSnap.docs.map(d => d.data()), settings: config, backupDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_hospital_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault(); if (newAcc.role === 'KHOA' && !newAcc.dept) return alert("Vui lòng nhập tên Khoa!");
    setIsCreating(true); let secondaryApp = null;
    try {
      secondaryApp = initializeApp(getApp().options, "SecondaryApp");
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newAcc.email, newAcc.pass);
      await setDoc(doc(db, "users", userCredential.user.uid), { email: newAcc.email, role: newAcc.role, dept: newAcc.role === 'KHOA' ? newAcc.dept : '', createdAt: new Date().toISOString() });
      await signOut(secondaryAuth); alert(`✅ Đã tạo tài khoản: ${newAcc.email}`); setNewAcc({ email: '', pass: '', role: 'KHOA', dept: '' });
    } catch (error) { alert("Lỗi: " + error.message); } finally { if (secondaryApp) deleteApp(secondaryApp); setIsCreating(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
      const existingIds = employees.map(e => e.id); let count = 0;
      for (let row of data) {
        if (!row.MaNV || existingIds.includes(String(row.MaNV))) continue;
        await setDoc(doc(db, "employees", String(row.MaNV)), { id: String(row.MaNV), name: row.TenNV, dept: row.Khoa, position: row.ChucVu });
        count++;
      }
      alert(`Đã thêm ${count} nhân viên mới!`);
    };
    reader.readAsBinaryString(file); e.target.value = null;
  };
  const handleDelete = async (id) => { if(confirm("Xóa nhân viên này?")) await deleteDoc(doc(db, "employees", id)); };
  const finalEmployees = sortEmployees(employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.id.toLowerCase().includes(searchTerm.toLowerCase()) || e.dept.toLowerCase().includes(searchTerm.toLowerCase())), sortBy);

  return (
    <div className="app-container">
      <Sidebar userRole="ADMIN" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title="Quản Trị Hệ Thống" email={userEmail} onMenuClick={()=>setSidebarOpen(true)} />
        <div className="dashboard-content">
          <div style={{marginBottom:15, display:'flex', gap:10, flexWrap: 'wrap'}}>
             <button className={`btn ${activeTab==='employees'?'btn-primary':''}`} onClick={()=>setActiveTab('employees')} style={{background:activeTab!=='employees'?'#fff':''}}>Nhân viên</button>
             <button className={`btn ${activeTab==='accounts'?'btn-primary':''}`} onClick={()=>setActiveTab('accounts')} style={{background:activeTab!=='accounts'?'#fff':''}}>DS Tài khoản</button>
             <button className={`btn ${activeTab==='create_acc'?'btn-primary':''}`} onClick={()=>setActiveTab('create_acc')} style={{background:activeTab!=='create_acc'?'#fff':''}}>➕ Tạo Tài Khoản</button>
             <button className={`btn ${activeTab==='config'?'btn-primary':''}`} onClick={()=>setActiveTab('config')} style={{background:activeTab!=='config'?'#fff':''}}>Cấu hình & Backup</button>
          </div>
          
          {activeTab === 'config' && (
            <div className="card">
              <h3>⚙️ Cấu hình hệ thống</h3>
              <div className="config-panel">
                <div className="config-row"><label>Giờ giới hạn (h):</label><input type="number" className="config-input" value={config.limitHour} onChange={e=>setConfig({...config, limitHour: Number(e.target.value)})} /><span style={{fontSize:13, color:'#666'}}>(Sau giờ này nhân viên không được tự chấm)</span></div>
                <div className="config-row"><label>Ngày khóa sổ (DL):</label><input type="number" className="config-input" value={config.lockDate} onChange={e=>setConfig({...config, lockDate: Number(e.target.value)})} /><span style={{fontSize:13, color:'#666'}}>(Ngày của tháng sau sẽ khóa tháng trước)</span></div>
                <button className="btn btn-success" onClick={handleUpdateConfig} style={{marginTop:10}}>Lưu Cấu Hình</button>
              </div>
              <h3>💾 Sao lưu dữ liệu</h3><p style={{fontSize:13, color:'#666'}}>Tải toàn bộ dữ liệu về máy tính.</p><button className="btn btn-primary" onClick={handleBackup}>⬇️ Tải Backup JSON</button>
            </div>
          )}

          {activeTab === 'create_acc' && (
            <div className="card" style={{maxWidth: 500}}>
              <h3>➕ Cấp tài khoản mới</h3>
              <form onSubmit={handleCreateAccount}>
                <div className="form-group"><label>Email đăng nhập:</label><input className="login-input" type="email" placeholder="VD: noitimmach@bvien.com" value={newAcc.email} onChange={e=>setNewAcc({...newAcc, email: e.target.value})} required /></div>
                <div className="form-group"><label>Mật khẩu:</label><input className="login-input" type="text" placeholder="Nhập mật khẩu..." value={newAcc.pass} onChange={e=>setNewAcc({...newAcc, pass: e.target.value})} required /></div>
                <div className="form-group"><label>Loại tài khoản:</label><select className="select-box" style={{width:'100%'}} value={newAcc.role} onChange={e=>setNewAcc({...newAcc, role: e.target.value})}><option value="KHOA">Khoa / Phòng ban</option><option value="GIAMDOC">Giám Đốc (Xem tất cả)</option><option value="ADMIN">Admin (Quản trị)</option></select></div>
                {newAcc.role === 'KHOA' && (<div className="form-group"><label>Tên Khoa (Hiển thị):</label><input className="login-input" type="text" placeholder="VD: Khoa Nội, Phòng Kế Toán..." value={newAcc.dept} onChange={e=>setNewAcc({...newAcc, dept: e.target.value})} required /></div>)}
                <button className="btn btn-success" style={{width:'100%', marginTop: 10}} disabled={isCreating}>{isCreating ? 'Đang tạo...' : 'Tạo Tài Khoản'}</button>
              </form>
            </div>
          )}

          {activeTab === 'employees' && (
            <div className="card">
              <div className="toolbar">
                 <div className="search-box"><span className="search-icon">🔍</span><input className="search-input" placeholder="Tìm tên, mã, hoặc khoa..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
                 <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="name">Tên A-Z</option><option value="position">Chức vụ</option></select>
                 <label className="btn btn-primary" style={{cursor:'pointer', marginLeft:'auto'}}>📂 Import Excel<input type="file" hidden onChange={handleFileUpload} /></label>
              </div>
              <div style={{maxHeight:'60vh', overflow:'auto'}}>
                <table className="request-table">
                  <thead><tr><th>Mã</th><th>Tên</th><th>Khoa</th><th>Chức Vụ</th><th style={{textAlign:'right'}}>Thao tác</th></tr></thead>
                  <tbody>{finalEmployees.map(e => (<tr key={e.id}><td>{e.id}</td><td>{e.name}</td><td>{e.dept}</td><td>{e.position}</td><td style={{textAlign:'right'}}><button className="btn btn-logout" onClick={()=>handleDelete(e.id)}>Xóa</button></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="card"><h3>Danh sách tài khoản ({accounts.length})</h3>
              <table className="request-table" style={{marginTop:10}}>
                <thead><tr><th>Email (ID)</th><th>Quyền</th><th>Tên Khoa</th><th>Mật khẩu</th></tr></thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.id}>
                      <td>{a.email} <br/><span style={{fontSize:11, color:'#888'}}>{a.id}</span></td>
                      <td><span style={{fontWeight:'bold', color:a.role==='ADMIN'?'red':(a.role==='GIAMDOC'?'purple':'blue')}}>{a.role}</span></td>
                      <td>{a.dept||'-'}</td>
                      <td>
                        <button className="btn btn-primary" style={{fontSize:12, padding:'5px 10px'}} onClick={() => handleResetPassword(a.email)}>
                          📧 Reset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState(localStorage.getItem('savedEmail') || '');
  const [loginPass, setLoginPass] = useState('');

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (u) { 
      const s = await getDoc(doc(db, "users", u.uid)); 
      if (s.exists()) { setUser(u); setUserData(s.data()); } else { await signOut(auth); setUser(null); setUserData(null); }
    } else { setUser(null); setUserData(null); }
  }), []);

  const handleLogout = () => { if(user?.email) localStorage.setItem('savedEmail', user.email); signOut(auth); window.location.reload(); };

  if (!user) {
    const handleLogin = async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, loginEmail, loginPass); } catch(err) { alert(err.message); } };
    return (
        <div className="login-container">
            <form onSubmit={handleLogin} className="login-card">
                <div style={{textAlign:'center', marginBottom:20, fontSize:24}}>🏥 Hospital Login</div>
                <div className="form-group"><label>Email:</label><input className="login-input" type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required /></div>
                <div className="form-group"><label>Mật khẩu:</label><input className="login-input" type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required /></div>
                <button className="btn btn-primary" style={{width: '100%', fontSize: '16px', padding: 12}}>ĐĂNG NHẬP</button>
            </form>
        </div>
    );
  }
  if (!userData) return <div className="loading-screen">⏳ Đang tải dữ liệu...</div>;

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