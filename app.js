import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Paste your Firebase web app configuration here to enable private cloud sync.
const firebaseConfig = {
  apiKey: "AIzaSyBBclxx_g4uKMTETp9CF69_a-TZJzzP6gU",
  authDomain: "my-schedule-c62f9.firebaseapp.com",
  projectId: "my-schedule-c62f9",
  storageBucket: "my-schedule-c62f9.firebasestorage.app",
  messagingSenderId: "609194181753",
  appId: "1:609194181753:web:8c93da2c541ab8d4b740a8"
};
const ALLOWED_EMAILS = ["c93300@gmail.com", "quinlay.lu@gmail.com"];
const WORKSPACE_ID = "private-shared-workspace";
const DEMO_MODE = !firebaseConfig.apiKey || !firebaseConfig.projectId;

let auth=null, db=null, employees=[], shifts=[], weekOffset=0, viewMode="week", unsubE=null, unsubS=null;
let clockIn=localStorage.getItem("ms_clock_in")||"";
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return iso(d)};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const date=s=>new Date(`${s}T12:00:00`);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const time=s=>{const [h,m]=s.split(":").map(Number),d=new Date();d.setHours(h,m);return d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})};
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2100)}
function demoLoad(){employees=JSON.parse(localStorage.getItem("ms_employees")||"[]");shifts=JSON.parse(localStorage.getItem("ms_shifts")||"[]");if(!employees.length){employees=[{id:"u1",name:"You",role:"Admin"},{id:"u2",name:"Quinlay",role:"Admin"},{id:"e1",name:"James",role:"Team member"},{id:"e2",name:"Michelle",role:"Team member"}];demoSave()}}
function demoSave(){localStorage.setItem("ms_employees",JSON.stringify(employees));localStorage.setItem("ms_shifts",JSON.stringify(shifts))}
function name(id){return employees.find(x=>x.id===id)?.name||"Unknown"}
function duration(s){let [a,b]=[s.start,s.end].map(x=>x.split(":").map(Number));let n=b[0]*60+b[1]-a[0]*60-a[1];if(n<0)n+=1440;return n/60}
function card(s){let d=date(s.date);return `<article class="shift-card" data-edit="${esc(s.id)}"><div class="shift-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString([],{month:"short"})}</small></div><div class="shift-info"><strong>${esc(name(s.employeeId))}</strong><p>${esc(s.role||"Shift")}${s.location?" · "+esc(s.location):""}</p></div><div class="shift-time">${time(s.start)}–${time(s.end)}</div></article>`}
function empty(s){return `<div class="empty-state"><p class="muted">${s}</p></div>`}
function render(){
 $("employeeCount").textContent=employees.length;
 let limit=new Date();limit.setDate(limit.getDate()+7);
 let up=shifts.filter(s=>s.date>=today()&&s.date<=iso(limit)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 $("upcomingCount").textContent=up.length;$("homeShifts").innerHTML=up.slice(0,4).map(card).join("")||empty("No upcoming shifts yet.");
 $("allShifts").innerHTML=[...shifts].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).map(card).join("")||empty("No shifts scheduled.");
 $("employeeList").innerHTML=employees.map(e=>{let h=shifts.filter(s=>s.employeeId===e.id).reduce((v,s)=>v+duration(s),0);return `<div class="employee-row"><div class="initial">${esc(e.name[0]?.toUpperCase()||"?")}</div><div class="employee-meta"><strong>${esc(e.name)}</strong><p>${esc(e.role||"Team member")} · Roster only</p></div><div class="employee-hours">${h.toFixed(1)}h</div></div>`}).join("")||empty("No employees yet.");
 renderCalendar();clockRender();
}
function weekStart(){let d=date(today());d.setDate(d.getDate()-((d.getDay()+6)%7)+weekOffset*7);return d}
function renderCalendar(){
 let first=weekStart(),days;
 if(viewMode==="week")days=Array.from({length:7},(_,i)=>{let d=new Date(first);d.setDate(d.getDate()+i);return d});
 else {let count=new Date(first.getFullYear(),first.getMonth()+1,0).getDate(),offset=(new Date(first.getFullYear(),first.getMonth(),1).getDay()+6)%7;days=Array(offset).fill(null).concat(Array.from({length:count},(_,i)=>new Date(first.getFullYear(),first.getMonth(),i+1)))}
 let last=days.filter(Boolean).at(-1);$("weekLabel").textContent=viewMode==="week"?`${first.toLocaleDateString([],{month:"short",day:"numeric"})} – ${last.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}`:first.toLocaleDateString([],{month:"long",year:"numeric"});
 $("calendar").innerHTML=days.map(d=>{if(!d)return "<div></div>";let key=iso(d),list=shifts.filter(s=>s.date===key);return `<div class="day-cell ${key===today()?"today":""}"><div class="day-name">${d.toLocaleDateString([],{weekday:"short"})}</div><div class="day-number">${d.getDate()}</div>${list.slice(0,3).map(s=>`<span class="day-chip">${esc(name(s.employeeId))} ${esc(s.start)}</span>`).join("")}${list.length>3?`<span class="day-chip">+${list.length-3} more</span>`:""}</div>`}).join("");
}
async function add(type,data){if(DEMO_MODE){data.id=crypto.randomUUID();(type==="employees"?employees:shifts).push(data);demoSave();render()}else await addDoc(collection(db,`workspaces/${WORKSPACE_ID}/${type}`),data)}
async function update(type,id,data){if(DEMO_MODE){Object.assign((type==="employees"?employees:shifts).find(x=>x.id===id),data);demoSave();render()}else await updateDoc(doc(db,`workspaces/${WORKSPACE_ID}/${type}`,id),data)}
async function remove(type,id){if(DEMO_MODE){if(type==="shifts")shifts=shifts.filter(x=>x.id!==id);else employees=employees.filter(x=>x.id!==id);demoSave();render()}else await deleteDoc(doc(db,`workspaces/${WORKSPACE_ID}/${type}`,id))}
function openShift(s=null){$("shiftForm").reset();$("shiftId").value=s?.id||"";$("shiftDialogTitle").textContent=s?"Edit shift":"Add shift";$("deleteShiftBtn").classList.toggle("hidden",!s);$("shiftEmployee").innerHTML=employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");$("shiftDate").value=s?.date||today();$("shiftStart").value=s?.start||"09:00";$("shiftEnd").value=s?.end||"17:00";$("shiftRole").value=s?.role||"";$("shiftLocation").value=s?.location||"";$("shiftNotes").value=s?.notes||"";if(s)$("shiftEmployee").value=s.employeeId;$("shiftError").textContent="";$("shiftDialog").showModal()}
function showPage(p){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));$(`${p}Page`).classList.remove("hidden");document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.page===p))}
function clockRender(){let active=!!clockIn;$("clockStatus").textContent=active?"You are clocked in":"You are clocked out";$("clockBtn").textContent=active?"Clock out":"Clock in";$("clockInfo").textContent=active?`Started ${new Date(clockIn).toLocaleString()}`:"Saved on this device only in this starter build."}
function start(user){
 $("authScreen").classList.add("hidden");$("app").classList.remove("hidden");$("signedInEmail").textContent=user.email||"Demo preview";$("dataMode").textContent=DEMO_MODE?"Local demo — not shared between phones":"Firebase cloud sync";$("todayLabel").textContent=new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric",year:"numeric"});
 if(DEMO_MODE){demoLoad();render()}else{let p=`workspaces/${WORKSPACE_ID}`;unsubE?.();unsubS?.();unsubE=onSnapshot(collection(db,p,"employees"),s=>{employees=s.docs.map(d=>({id:d.id,...d.data()}));render()});unsubS=onSnapshot(collection(db,p,"shifts"),s=>{shifts=s.docs.map(d=>({id:d.id,...d.data()}));render()})}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();let email=$("email").value.trim().toLowerCase();if(!["c93300@gmail.com","quinlay.lu@gmail.com"].includes(email)){$("authMessage").textContent="This email is not authorised.";return}if(DEMO_MODE){$("authMessage").textContent="Cloud sign-in is not configured yet. Complete Firebase setup first.";return}try{await signInWithEmailAndPassword(auth,email,$("password").value)}catch(err){$("authMessage").textContent=err.message}});
$("addShiftBtn").onclick=()=>openShift();$("addEmployeeBtn").onclick=()=>{$("employeeForm").reset();$("employeeDialog").showModal()};
$("shiftForm").addEventListener("submit",async e=>{e.preventDefault();let id=$("shiftId").value,data={employeeId:$("shiftEmployee").value,date:$("shiftDate").value,start:$("shiftStart").value,end:$("shiftEnd").value,role:$("shiftRole").value.trim(),location:$("shiftLocation").value.trim(),notes:$("shiftNotes").value.trim()};if(!data.employeeId){$("shiftError").textContent="Add an employee first.";return}try{if(id)await update("shifts",id,data);else await add("shifts",data);$("shiftDialog").close();toast("Shift saved")}catch(err){$("shiftError").textContent=err.message}});
$("deleteShiftBtn").onclick=async()=>{let id=$("shiftId").value;if(id&&confirm("Delete this shift?")){await remove("shifts",id);$("shiftDialog").close();toast("Shift deleted")}};
$("employeeForm").addEventListener("submit",async e=>{e.preventDefault();let n=$("employeeName").value.trim();if(!n)return;await add("employees",{name:n,role:$("employeeRole").value.trim()||"Team member"});$("employeeDialog").close();toast("Employee added")});
$("prevWeek").onclick=()=>{weekOffset--;renderCalendar()};$("nextWeek").onclick=()=>{weekOffset++;renderCalendar()};
document.querySelectorAll(".view-option").forEach(b=>b.onclick=()=>{viewMode=b.dataset.view;document.querySelectorAll(".view-option").forEach(x=>x.classList.toggle("active",x===b));renderCalendar()});
document.addEventListener("click",e=>{let c=e.target.closest("[data-edit]");if(c){let s=shifts.find(x=>x.id===c.dataset.edit);if(s)openShift(s)}let x=e.target.closest("[data-close]");if(x)$(x.dataset.close).close();let n=e.target.closest("[data-page]");if(n)showPage(n.dataset.page);let g=e.target.closest("[data-go]");if(g)showPage(g.dataset.go)});
$("clockBtn").onclick=()=>{if(clockIn){clockIn="";localStorage.removeItem("ms_clock_in");toast("Clocked out")}else{clockIn=new Date().toISOString();localStorage.setItem("ms_clock_in",clockIn);toast("Clocked in")}clockRender()};
$("signOutBtn").onclick=async()=>{if(!DEMO_MODE)await signOut(auth);unsubE?.();unsubS?.();$("app").classList.add("hidden");$("authScreen").classList.remove("hidden")};
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
if(!DEMO_MODE){let app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);onAuthStateChanged(auth,u=>{if(u){if(!["c93300@gmail.com","quinlay.lu@gmail.com"].includes((u.email||"").toLowerCase())){signOut(auth);$("authMessage").textContent="This account is not authorised."}else start(u)}else{$("app").classList.add("hidden");$("authScreen").classList.remove("hidden")}})}
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
