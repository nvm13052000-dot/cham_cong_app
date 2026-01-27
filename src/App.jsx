import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from './firebase';
import './App.css';

// --- HELPER FUNCTIONS ---
const getDaysArray = (month, year) => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1);
const getDayName = (day, month, year) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(year, month - 1, day).getDay()];

// --- MODAL: GỬI YÊU CẦU SỬA CÔNG ---
const RequestModal = ({ isOpen, onClose, onSubmit, dateInfo }) => {
  const [reason, setReason] = useState('');
  const [type, setType] = useState('X');
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>📝 Gửi yêu cầu sửa công</h3>
        <p style={{fontSize:13, color:'#666'}}>Ngày: {dateInfo.day}/{dateInfo.month}/{dateInfo.year}</p>
        <div className="form-group">
          <label>Muốn sửa thành:</label>
          <select className="select-box" style={{width:'100%'}} value={type} onChange={e=>setType(e.target.value)}>
            <option value="X">✅ Đi làm (X)</option>
            <option value="P">⚠️ Nghỉ phép (P)</option>
            <option value="KP">❌ Không phép (KP)</option>
          </select>
        </div>
        <div className="form-group"><label>Lý do:</label><input className="login-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nhập lý do..." /></div>
        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button className="btn" onClick={onClose} style={{background:'#cbd5e1'}}>Hủy</button>
          <button className="btn btn-primary" onClick={() => onSubmit(type, reason)}>Gửi Duyệt</button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL: IMPORT PREVIEW (Mới cho Admin) ---
const ImportPreviewModal = ({ isOpen, onClose, data, onConfirm }) => {
  if (!isOpen || !data) return null;
  const { newRecords, duplicates } = data;
  
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{width: '600px', maxWidth:'90vw'}}>
        <h3>📂 Kết quả phân tích file Excel</h3>
        
        <div style={{marginBottom: 15}}>
          <div style={{color: 'green', fontWeight:'bold'}}>✅ Tìm thấy {newRecords.length} nhân viên mới.</div>
          <div style={{color: duplicates.length > 0 ? 'red' : '#999', fontWeight:'bold'}}>⚠️ Tìm thấy {duplicates.length} nhân viên trùng mã (đã tồn tại).</div>
        </div>

        {duplicates.length > 0 && (
          <div style={{maxHeight: 150, overflow: 'auto', background: '#fff1f2', padding: 10, borderRadius: 4, marginBottom: 15, border: '1px solid #fecaca'}}>
            <strong>Danh sách trùng (Sẽ BỎ QUA không import):</strong>
            <ul style={{margin:0, paddingLeft: 20, fontSize: 13}}>
              {duplicates.map((d, i) => (
                <li key={i}>{d.MaNV} - {d.TenNV} ({d.Khoa})</li>
              ))}
            </ul>
          </div>
        )}

        <p style={{fontSize: 13}}>Hệ thống sẽ chỉ thêm {newRecords.length} nhân viên mới vào danh sách. Bạn có đồng ý?</p>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button className="btn" onClick={onClose} style={{background:'#cbd5e1'}}>Hủy bỏ</button>
          <button className="btn btn-primary" onClick={() => onConfirm(newRecords)} disabled={newRecords.length === 0}>
            Xác nhận Import {newRecords.length} người
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL: ĐỔI MẬT KHẨU ---
const ChangePasswordModal = ({ isOpen, onClose, onLogout }) => {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const handleChange = async (e) => {
    e.preventDefault();
    if(!auth.currentUser) return;
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, oldPass);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPass);
      alert("Đổi mật khẩu thành công! Vui lòng đăng nhập lại."); 
      onClose();
      onLogout(); // Gọi hàm logout có xử lý lưu email
    } catch (err) { alert("Lỗi: " + err.message); }
  };
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>🔒 Đổi Mật Khẩu</h3>
        <form onSubmit={handleChange}>
          <input className="login-input" type="password" placeholder="Mật khẩu cũ" value={oldPass} onChange={e=>setOldPass(e.target.value)} required />
          <input className="login-input" type="password" placeholder="Mật khẩu mới" value={newPass} onChange={e=>setNewPass(e.target.value)} required />
          <button className="btn btn-primary" style={{width:'100%'}}>Lưu Thay Đổi</button>
          <button type="button" className="btn" onClick={onClose} style={{width:'100%', marginTop:10, background:'#eee'}}>Hủy</button>
        </form>
      </div>
    </div>
  );
};

// --- COMPONENT: HEADER ---
const Header = ({ title, email, notifications = [] }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localUnread, setLocalUnread] = useState(notifications.length);
  useEffect(() => { setLocalUnread(notifications.length); }, [notifications]);
  return (
    <div className="top-header">
      <h2 style={{margin: 0, fontSize: '18px', color: '#334155'}}>{title}</h2>
      <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
        <div className="notification-container">
          <div className="notification-bell" onClick={()=>{setShowDropdown(!showDropdown); if(!showDropdown) setLocalUnread(0);}}>
            🔔 {localUnread > 0 && <span className="badge">{localUnread}</span>}
          </div>
          {showDropdown && (
            <div className="notification-dropdown">
              <div style={{fontWeight:'bold', paddingBottom:10, borderBottom:'1px solid #eee'}}>Thông báo ({notifications.length})</div>
              {notifications.length === 0 && <div style={{padding:10, fontStyle:'italic', color:'#999'}}>Không có thông báo mới</div>}
              {notifications.map((n, i) => (
                <div key={i} className="notif-item"><div style={{fontWeight:'bold', color:'green'}}>✅ Đã duyệt: {n.empName}</div><div style={{fontSize:12}}>Ngày {n.day}/{n.month} &rarr; <b>{n.requestType}</b></div></div>
              ))}
            </div>
          )}
        </div>
        <div style={{fontSize: '14px', fontWeight: 500}}>{email}</div>
      </div>
    </div>
  );
};

// --- COMPONENT: BẢNG CHẤM CÔNG ---
const AttendanceTable = ({ employees, attendanceData, onCellClick, month, year, pendingKeys = [] }) => {
  const days = getDaysArray(month, year);
  return (
    <div className="matrix-wrapper">
      <table className="matrix-table">
        <thead>
          <tr><th style={{height: 30}}></th>{days.map(d=><th key={d} className={`th-day-name ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend text-weekend':''}`}>{getDayName(d,month,year)}</th>)}<th colSpan={3} style={{background: '#e2e8f0', fontSize:11}}>TỔNG HỢP</th></tr>
          <tr><th style={{top: 38}}>NHÂN VIÊN</th>{days.map(d=><th key={d} style={{top: 38}} className={`th-date-num ${['T7','CN'].includes(getDayName(d,month,year))?'bg-weekend':''}`}>{d}</th>)}<th style={{top:38,color:'green'}}>Công</th><th style={{top:38,color:'#a16207'}}>Phép</th><th style={{top:38,color:'red'}}>KP</th></tr>
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
                  return <td key={d} className={cls} onClick={() => onCellClick && onCellClick(emp, d, status)} style={{cursor: 'pointer'}}>{status}</td>
                })}
                <td className="cell-total" style={{color:'green'}}>{X}</td><td className="cell-total" style={{color:'#a16207'}}>{P}</td><td className="cell-total" style={{color:'red'}}>{KP}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- TRANG: KHOA ---
const DepartmentScreen = ({ userDept, userEmail, onLogout, onOpenChangePass }) => {
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
    if (!reason) return alert("Vui lòng nhập lý do!");
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
      <div className="sidebar"><div className="sidebar-header">📅 Khoa: {userDept}</div><div className="menu-item active">🏠 Chấm Công</div><div className="menu-item" onClick={onOpenChangePass}>🔒 Đổi Mật Khẩu</div><button onClick={onLogout} className="btn btn-logout" style={{margin:'auto 20px 20px', width:'85%'}}>Đăng Xuất</button></div>
      <div className="main-content"><Header title="Bảng Chấm Công" email={userEmail} notifications={notifications} />
        <div className="dashboard-content"><div className="card"><div className="control-bar"><div className="filter-group"><select className="select-box" value={viewMonth} onChange={e=>setViewMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}</select><select className="select-box" value={viewYear} onChange={e=>setViewYear(Number(e.target.value))}><option value={2026}>2026</option><option value={2027}>2027</option></select></div><button className="btn btn-success" onClick={handleExport}>📊 Xuất Excel</button></div><AttendanceTable employees={employees} attendanceData={attendance} onCellClick={handleCellClick} month={viewMonth} year={viewYear} pendingKeys={pendingKeys} /></div></div>
      </div>
      <RequestModal isOpen={modal.isOpen} onClose={()=>setModal({...modal, isOpen:false})} onSubmit={submitRequest} dateInfo={modal} />
    </div>
  );
};

// --- TRANG: GIÁM ĐỐC ---
const DirectorScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
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
      <div className="sidebar"><div className="sidebar-header">👨‍⚕️ Giám Đốc</div><div className="menu-item active">📊 Tổng Quan</div><div className="menu-item" onClick={onOpenChangePass}>🔒 Đổi Mật Khẩu</div><button onClick={onLogout} className="btn btn-logout" style={{margin:'auto 20px 20px', width:'85%'}}>Đăng Xuất</button></div>
      <div className="main-content"><Header title="Dashboard Quản Lý" email={userEmail} />
        <div className="dashboard-content">
          {requests.length > 0 && (<div className="card" style={{borderLeft:'5px solid #2563eb'}}><h3>📝 Yêu cầu cần duyệt ({requests.length})</h3><div style={{maxHeight: 200, overflow:'auto'}}><table className="matrix-table"><thead><tr><th>Khoa</th><th>NV</th><th>Ngày</th><th>Xin đổi thành</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>{requests.map(req => (<tr key={req.id}><td>{req.dept}</td><td>{req.empName}</td><td>{req.day}/{req.month}/{req.year}</td><td style={{fontWeight:'bold', color: req.requestType==='KP'?'red':'green'}}>{req.requestType}</td><td>{req.reason}</td><td><button className="btn btn-success" onClick={()=>handleApprove(req)}>Duyệt</button></td></tr>))}</tbody></table></div></div>)}
          <div className="card"><div className="control-bar"><div className="filter-group"><label>Khoa:</label><select className="select-box" value={selDept} onChange={e=>setSelDept(e.target.value)}>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select><label>Tháng:</label><select className="select-box" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}</select><select className="select-box" value={selYear} onChange={e=>setSelYear(Number(e.target.value))}><option value={2026}>2026</option><option value={2027}>2027</option></select></div><button className="btn btn-success" onClick={handleExportExcel}>📥 Xuất Excel</button></div><AttendanceTable employees={allEmployees.filter(e => e.dept === selDept)} attendanceData={attendance} month={selMonth} year={selYear} /></div>
        </div>
      </div>
    </div>
  );
};

// --- TRANG: ADMIN (Nâng cấp) ---
const AdminScreen = ({ userEmail, onLogout, onOpenChangePass }) => {
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' or 'accounts'
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]); // Danh sách user (lấy từ Firestore users collection)
  const [importPreview, setImportPreview] = useState(null); // Data for modal

  useEffect(() => {
    // Load Employees
    const unsubEmp = onSnapshot(collection(db, "employees"), (snap) => setEmployees(snap.docs.map(d => d.data())));
    // Load Accounts (Khoa/Giamdoc accounts stored in 'users' collection)
    const unsubAcc = onSnapshot(collection(db, "users"), (snap) => setAccounts(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubEmp(); unsubAcc(); }
  }, []);

  // Xử lý đọc file Excel
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      
      // Lọc trùng: So sánh Mã NV trong file với Mã NV đang có trong DB
      const existingIds = employees.map(e => e.id);
      const duplicates = [];
      const newRecords = [];

      data.forEach(row => {
        if (!row.MaNV) return; // Bỏ qua dòng lỗi
        if (existingIds.includes(String(row.MaNV))) {
          duplicates.push({ MaNV: row.MaNV, TenNV: row.TenNV, Khoa: row.Khoa });
        } else {
          newRecords.push(row);
        }
      });
      // Mở Modal Preview
      setImportPreview({ duplicates, newRecords });
    };
    reader.readAsBinaryString(file);
    e.target.value = null; // Reset input file
  };

  const confirmImport = async (newRecords) => {
    for (let emp of newRecords) {
      await setDoc(doc(db, "employees", String(emp.MaNV)), {
        id: String(emp.MaNV), name: emp.TenNV, dept: emp.Khoa, position: emp.ChucVu
      });
    }
    alert(`Đã thêm thành công ${newRecords.length} nhân viên!`);
    setImportPreview(null);
  };

  const handleDeleteEmployee = async (id) => {
    if(confirm("Bạn có chắc chắn muốn xóa nhân viên này?")) {
      await deleteDoc(doc(db, "employees", id));
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">🔧 ADMIN</div>
        <div className={`menu-item ${activeTab==='employees'?'active':''}`} onClick={()=>setActiveTab('employees')}>👥 QL Nhân Viên</div>
        <div className={`menu-item ${activeTab==='accounts'?'active':''}`} onClick={()=>setActiveTab('accounts')}>🔐 QL Tài Khoản</div>
        <div className="menu-item" onClick={onOpenChangePass}>🔒 Đổi Mật Khẩu</div>
        <button onClick={onLogout} className="btn btn-logout" style={{margin:'auto 20px 20px', width:'85%'}}>Đăng Xuất</button>
      </div>
      <div className="main-content">
        <Header title="Quản Trị Hệ Thống" email={userEmail} />
        <div className="dashboard-content">
          
          {/* TAB: NHÂN VIÊN */}
          {activeTab === 'employees' && (
            <div className="card">
              <div className="control-bar">
                <h3>Danh sách nhân viên ({employees.length})</h3>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <label className="btn btn-primary" style={{cursor:'pointer', display:'flex', alignItems:'center'}}>
                    📂 Import Excel
                    <input type="file" hidden accept=".xlsx, .xls" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
              <p style={{fontSize:13, color:'#666'}}>* Import sẽ tự động phát hiện mã trùng.</p>
              
              <div style={{maxHeight: '70vh', overflow:'auto', border: '1px solid #eee'}}>
                <table className="matrix-table" style={{minWidth: '100%'}}>
                  <thead><tr><th>Mã NV</th><th>Tên NV</th><th>Khoa</th><th>Chức Vụ</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {employees.map(e => (
                      <tr key={e.id}>
                        <td>{e.id}</td><td style={{textAlign:'left', paddingLeft:10}}>{e.name}</td><td>{e.dept}</td><td>{e.position}</td>
                        <td><button className="btn btn-logout" onClick={()=>handleDeleteEmployee(e.id)}>Xóa</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: TÀI KHOẢN */}
          {activeTab === 'accounts' && (
            <div className="card">
              <h3>Danh sách tài khoản quản lý ({accounts.length})</h3>
              <p style={{fontSize:13, color:'#666'}}>* Đây là các tài khoản Khoa/Giám đốc đã được cấp quyền trong hệ thống.</p>
              <table className="matrix-table" style={{marginTop: 15, minWidth: '100%'}}>
                <thead><tr><th>UID (Mã User)</th><th>Quyền (Role)</th><th>Tên Khoa (Nếu có)</th></tr></thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id}>
                      <td style={{fontSize:12, color:'#888'}}>{acc.id}</td>
                      <td><span style={{fontWeight:'bold', color: acc.role==='ADMIN'?'red':'blue'}}>{acc.role}</span></td>
                      <td>{acc.dept || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL IMPORT PREVIEW */}
      <ImportPreviewModal 
        isOpen={!!importPreview} 
        data={importPreview} 
        onClose={()=>setImportPreview(null)} 
        onConfirm={confirmImport} 
      />
    </div>
  );
};

// --- MAIN APP ---
function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [changePassOpen, setChangePassOpen] = useState(false);
  
  // State quản lý email đã lưu
  const [savedEmail, setSavedEmail] = useState(localStorage.getItem('savedEmail') || '');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Khi component load, nếu có savedEmail thì điền vào
  useEffect(() => { if(savedEmail) setLoginEmail(savedEmail); }, [savedEmail]);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (u) {
      setUser(u);
      const s = await getDoc(doc(db, "users", u.uid));
      if (s.exists()) setUserData(s.data());
    } else { setUser(null); setUserData(null); }
  }), []);

  const handleLogout = () => {
    // 1. Lưu email hiện tại vào localStorage trước khi thoát
    if (user && user.email) {
      localStorage.setItem('savedEmail', user.email);
    }
    // 2. Thoát
    signOut(auth);
    window.location.reload(); 
  };

  if (!user) {
    const handleLogin = async (e) => { 
      e.preventDefault(); 
      try { await signInWithEmailAndPassword(auth, loginEmail, loginPass); } 
      catch(err) { alert(err.message); } 
    };
    return (
        <div className="login-container">
            <form onSubmit={handleLogin} className="login-card">
                <div className="login-title">🔧 Quản Trị Hệ Thống</div>
                <div style={{marginBottom:15}}>
                  <label style={{fontSize:13, fontWeight:'bold', color:'#555'}}>Email:</label>
                  <input className="login-input" type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required />
                </div>
                <div style={{marginBottom:15}}>
                  <label style={{fontSize:13, fontWeight:'bold', color:'#555'}}>Mật khẩu:</label>
                  <input className="login-input" type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required placeholder="Nhập mật khẩu..." />
                </div>
                <button className="btn btn-primary" style={{width: '100%', fontSize: '16px'}}>ĐĂNG NHẬP</button>
            </form>
        </div>
    );
  }

  if (!userData) return <div>Loading...</div>;

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