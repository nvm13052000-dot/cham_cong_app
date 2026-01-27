import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from './firebase';
import './App.css';

// --- HELPER FUNCTIONS ---
const getDaysArray = (month, year) => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1);
const getDayName = (day, month, year) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(year, month - 1, day).getDay()];

// --- COMPONENT: SIDEBAR (Responsive) ---
const Sidebar = ({ userRole, onLogout, onOpenChangePass, isOpen, onClose }) => (
  <>
    {/* Màn che đen khi mở menu trên mobile */}
    {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
    
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span>🏥 HospitalApp</span>
        {/* Nút đóng trên mobile */}
        <span onClick={onClose} style={{cursor:'pointer', fontSize:24, display: window.innerWidth > 768 ? 'none':'block'}}>&times;</span>
      </div>
      
      <div className="menu-item active">🏠 Trang Chủ</div>
      {userRole === 'ADMIN' && <div className="menu-item">🔧 Quản trị</div>}
      <div className="menu-item" onClick={()=>{onOpenChangePass(); onClose();}}>🔒 Đổi Mật Khẩu</div>
      
      <div style={{marginTop: 'auto', padding: '20px'}}>
        <button onClick={onLogout} className="btn btn-logout" style={{width: '100%'}}>Đăng Xuất</button>
      </div>
    </div>
  </>
);

// --- COMPONENT: HEADER (Có nút Menu) ---
const Header = ({ title, email, notifications = [], onMenuClick }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localUnread, setLocalUnread] = useState(notifications.length);
  useEffect(() => { setLocalUnread(notifications.length); }, [notifications]);

  return (
    <div className="top-header">
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        {/* Nút Hamburger cho Mobile */}
        <button className="menu-btn" onClick={onMenuClick}>☰</button>
        <h2 style={{margin: 0, fontSize: '16px', color: '#334155'}}>{title}</h2>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
        <div className="notification-container">
          <div className="notification-bell" onClick={()=>{setShowDropdown(!showDropdown); if(!showDropdown) setLocalUnread(0);}}>
            🔔 {localUnread > 0 && <span className="badge">{localUnread}</span>}
          </div>
          {showDropdown && (
            <div className="notification-dropdown">
              <div style={{fontWeight:'bold', padding:10, borderBottom:'1px solid #eee'}}>Thông báo ({notifications.length})</div>
              {notifications.length === 0 && <div style={{padding:15, color:'#888', textAlign:'center'}}>Không có tin mới</div>}
              {notifications.map((n, i) => (
                <div key={i} className="notif-item">
                  <div style={{fontWeight:'bold', color:'green'}}>✅ Đã duyệt: {n.empName}</div>
                  <div style={{fontSize:12, color:'#555'}}>Ngày {n.day}/{n.month} &rarr; <b>{n.requestType}</b></div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Ẩn email trên mobile cho đỡ chật */}
        <div style={{fontSize: '13px', fontWeight: 500, display: window.innerWidth < 500 ? 'none':'block'}}>{email}</div>
      </div>
    </div>
  );
};

// --- CÁC MODAL (Giữ nguyên logic) ---
const RequestModal = ({ isOpen, onClose, onSubmit, dateInfo }) => {
  const [reason, setReason] = useState('');
  const [type, setType] = useState('X');
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>📝 Gửi yêu cầu</h3>
        <p style={{fontSize:13, color:'#666', marginBottom:10}}>Ngày: {dateInfo.day}/{dateInfo.month}/{dateInfo.year}</p>
        <div className="form-group">
          <label>Sửa thành:</label>
          <select className="select-box" style={{width:'100%'}} value={type} onChange={e=>setType(e.target.value)}>
            <option value="X">✅ Đi làm (X)</option>
            <option value="P">⚠️ Nghỉ phép (P)</option>
            <option value="KP">❌ Không phép (KP)</option>
          </select>
        </div>
        <div className="form-group"><label>Lý do:</label><input className="login-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nhập lý do..." /></div>
        <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:20}}>
          <button className="btn" onClick={onClose} style={{background:'#f1f5f9', color:'#333'}}>Hủy</button>
          <button className="btn btn-primary" onClick={() => onSubmit(type, reason)}>Gửi</button>
        </div>
      </div>
    </div>
  );
};

const ChangePasswordModal = ({ isOpen, onClose, onLogout }) => {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const handleChange = async (e) => {
    e.preventDefault(); if(!auth.currentUser) return;
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, oldPass));
      await updatePassword(auth.currentUser, newPass);
      alert("Thành công! Vui lòng đăng nhập lại."); onClose(); onLogout();
    } catch (err) { alert("Lỗi: " + err.message); }
  };
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>🔒 Đổi Mật Khẩu</h3>
        <form onSubmit={handleChange}>
          <div className="form-group"><input className="login-input" type="password" placeholder="Mật khẩu cũ" value={oldPass} onChange={e=>setOldPass(e.target.value)} required /></div>
          <div className="form-group"><input className="login-input" type="password" placeholder="Mật khẩu mới" value={newPass} onChange={e=>setNewPass(e.target.value)} required /></div>
          <button className="btn btn-primary" style={{width:'100%'}}>Lưu</button>
          <button type="button" className="btn" onClick={onClose} style={{width:'100%', marginTop:10, background:'#f1f5f9', color:'#333'}}>Hủy</button>
        </form>
      </div>
    </div>
  );
};

// --- BẢNG CHẤM CÔNG (Responsive) ---
const AttendanceTable = ({ employees, attendanceData, onCellClick, month, year, pendingKeys = [] }) => {
  const days = getDaysArray(month, year);
  return (
    <div className="matrix-wrapper">
      <table className="matrix-table">
        <thead>
          <tr>
            <th style={{height: 35}}></th>
            {days.map(d => <th key={d} className={`th-day-name ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{getDayName(d,month,year)}</th>)}
            <th colSpan={3} style={{background: '#f1f5f9', fontSize:11}}>TỔNG</th>
          </tr>
          <tr>
            <th style={{top: 41}}>NHÂN VIÊN</th>
            {days.map(d => <th key={d} style={{top: 41}} className={`th-date-num ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{d}</th>)}
            <th style={{top:41,color:'green'}}>X</th><th style={{top:41,color:'#a16207'}}>P</th><th style={{top:41,color:'red'}}>KP</th>
          </tr>
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

// --- MAIN SCREENS ---
const DepartmentScreen = ({ userDept, userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile Menu State
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [pendingKeys, setPendingKeys] = useState([]); 
  const [notifications, setNotifications] = useState([]);
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [modal, setModal] = useState({ isOpen: false, emp: null, day: null });

  useEffect(() => {
    getDocs(query(collection(db, "employees"), where("dept", "==", userDept))).then(s => setEmployees(s.docs.map(d => d.data())));
    const unsubAtt = onSnapshot(query(collection(db, "attendance"), where("dept", "==", userDept)), (snap) => {
      const d = {}; snap.forEach(doc => { const dt=doc.data(); d[`${dt.empId}_${dt.day}_${dt.month}_${dt.year}`] = dt.status; }); setAttendance(d);
    });
    const unsubPend = onSnapshot(query(collection(db, "requests"), where("dept", "==", userDept), where("status", "==", "PENDING")), (snap) => {
      setPendingKeys(snap.docs.map(doc => { const d = doc.data(); return `${d.empId}_${d.day}_${d.month}_${d.year}`; }));
    });
    const unsubNotif = onSnapshot(query(collection(db, "requests"), where("dept", "==", userDept), where("status", "==", "APPROVED")), (snap) => setNotifications(snap.docs.map(d => d.data())));
    return () => { unsubAtt(); unsubNotif(); unsubPend(); };
  }, [userDept]);

  const handleCellClick = (emp, day, currentStatus) => {
    const selDate = new Date(viewYear, viewMonth-1, day); const today = new Date(); today.setHours(0,0,0,0);
    if (selDate > today) return alert("Không chấm công tương lai!");
    const isLocked = selDate < today || (selDate.getTime() === today.getTime() && new Date().getHours() >= 10);
    if (isLocked) setModal({ isOpen: true, emp, day, month: viewMonth, year: viewYear });
    else {
      let next = currentStatus === 'X' ? 'P' : (currentStatus === 'P' ? 'KP' : (currentStatus === 'KP' ? '-' : 'X'));
      setDoc(doc(db, "attendance", `${emp.id}_${day}_${viewMonth}_${viewYear}`), { empId: emp.id, day, month: viewMonth, year: viewYear, dept: emp.dept, status: next });
    }
  };

  const submitRequest = async (type, reason) => {
    if (!reason) return alert("Nhập lý do!");
    await addDoc(collection(db, "requests"), { empId: modal.emp.id, empName: modal.emp.name, dept: userDept, day: modal.day, month: modal.month, year: modal.year, reason, requestType: type, status: 'PENDING' });
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
            <div className="control-bar">
              <div className="filter-group">
                <select className="select-box" value={viewMonth} onChange={e=>setViewMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}</select>
                <select className="select-box" value={viewYear} onChange={e=>setViewYear(Number(e.target.value))}><option value={2026}>2026</option><option value={2027}>2027</option></select>
              </div>
              <button className="btn btn-success" onClick={handleExport}>📥 Excel</button>
            </div>
            <AttendanceTable employees={employees} attendanceData={attendance} onCellClick={handleCellClick} month={viewMonth} year={viewYear} pendingKeys={pendingKeys} />
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
    await updateDoc(doc(db, "requests", req.id), { status: 'APPROVED' });
    await setDoc(doc(db, "attendance", `${req.empId}_${req.day}_${req.month || 1}_${req.year || 2026}`), { empId: req.empId, day: req.day, month: req.month, year: req.year, dept: req.dept, status: req.requestType || 'X' });
    alert("Đã duyệt!");
  };

  const handleExportExcel = () => {
    const filteredEmps = allEmployees.filter(e => e.dept === selDept); const days = getDaysArray(selMonth, selYear);
    const data = filteredEmps.map(emp => {
      const row = { "Mã NV": emp.id, "Tên NV": emp.name }; let X=0, P=0, KP=0;
      days.forEach(d => { const s = attendance[`${emp.id}_${d}_${selMonth}_${selYear}`] || '-'; row[`Ngày ${d}`] = s; if(s==='X') X++; if(s==='P') P++; if(s==='KP') KP++; });
      row["Tổng Công"]=X; row["Phép"]=P; row["KP"]=KP; return row;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "ChamCong"); XLSX.writeFile(wb, `CC_${selDept}_T${selMonth}.xlsx`);
  };

  return (
    <div className="app-container">
      <Sidebar userRole="GIAMDOC" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title="Giám Đốc" email={userEmail} onMenuClick={()=>setSidebarOpen(true)} />
        <div className="dashboard-content">
          {requests.length > 0 && (<div className="card" style={{borderLeft:'5px solid #2563eb'}}><h3>📝 Chờ duyệt ({requests.length})</h3><div style={{maxHeight: 200, overflow:'auto'}}><table className="matrix-table"><thead><tr><th>Khoa</th><th>NV</th><th>Ngày</th><th>Xin đổi</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>{requests.map(req => (<tr key={req.id}><td>{req.dept}</td><td>{req.empName}</td><td>{req.day}/{req.month}</td><td style={{fontWeight:'bold', color: req.requestType==='KP'?'red':'green'}}>{req.requestType}</td><td>{req.reason}</td><td><button className="btn btn-success" onClick={()=>handleApprove(req)}>Duyệt</button></td></tr>))}</tbody></table></div></div>)}
          <div className="card">
            <div className="control-bar"><div className="filter-group"><select className="select-box" value={selDept} onChange={e=>setSelDept(e.target.value)}>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="select-box" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}</select></div><button className="btn btn-success" onClick={handleExportExcel}>📥 Excel</button></div>
            <AttendanceTable employees={allEmployees.filter(e => e.dept === selDept)} attendanceData={attendance} month={selMonth} year={selYear} />
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]); 

  useEffect(() => {
    const unsubEmp = onSnapshot(collection(db, "employees"), (snap) => setEmployees(snap.docs.map(d => d.data())));
    const unsubAcc = onSnapshot(collection(db, "users"), (snap) => setAccounts(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubEmp(); unsubAcc(); }
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
      const existingIds = employees.map(e => e.id);
      let count = 0;
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

  return (
    <div className="app-container">
      <Sidebar userRole="ADMIN" isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={onLogout} onOpenChangePass={onOpenChangePass} />
      <div className="main-content">
        <Header title="Admin" email={userEmail} onMenuClick={()=>setSidebarOpen(true)} />
        <div className="dashboard-content">
          <div style={{marginBottom:15, display:'flex', gap:10}}>
             <button className={`btn ${activeTab==='employees'?'btn-primary':''}`} onClick={()=>setActiveTab('employees')} style={{background:activeTab!=='employees'?'#fff':''}}>Nhân viên</button>
             <button className={`btn ${activeTab==='accounts'?'btn-primary':''}`} onClick={()=>setActiveTab('accounts')} style={{background:activeTab!=='accounts'?'#fff':''}}>Tài khoản</button>
          </div>
          
          {activeTab === 'employees' && (
            <div className="card">
              <div className="control-bar"><h3>Nhân viên ({employees.length})</h3><label className="btn btn-primary">📂 Import<input type="file" hidden onChange={handleFileUpload} /></label></div>
              <div style={{maxHeight:'60vh', overflow:'auto'}}><table className="matrix-table" style={{width:'100%'}}><thead><tr><th>Mã</th><th>Tên</th><th>Khoa</th><th>Xóa</th></tr></thead><tbody>{employees.map(e => (<tr key={e.id}><td>{e.id}</td><td style={{textAlign:'left', paddingLeft:10}}>{e.name}</td><td>{e.dept}</td><td><button className="btn btn-logout" style={{padding:'5px 10px'}} onClick={()=>handleDelete(e.id)}>X</button></td></tr>))}</tbody></table></div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="card"><h3>Tài khoản hệ thống ({accounts.length})</h3><table className="matrix-table" style={{width:'100%', marginTop:10}}><thead><tr><th>UID</th><th>Quyền</th><th>Khoa</th></tr></thead><tbody>{accounts.map(a => (<tr key={a.id}><td style={{fontSize:11, color:'#888'}}>{a.id}</td><td><span style={{fontWeight:'bold', color:a.role==='ADMIN'?'red':'blue'}}>{a.role}</span></td><td>{a.dept||'-'}</td></tr>))}</tbody></table></div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- APP ROOT ---
function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState(localStorage.getItem('savedEmail') || '');
  const [loginPass, setLoginPass] = useState('');

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (u) { setUser(u); const s = await getDoc(doc(db, "users", u.uid)); if (s.exists()) setUserData(s.data()); } 
    else { setUser(null); setUserData(null); }
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

  if (!userData) return <div style={{padding:20, textAlign:'center'}}>Loading...</div>;

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