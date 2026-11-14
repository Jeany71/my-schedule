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

let auth=null, db=null, employees=[], shifts=[], availabilities=[], currentUserEmail="", pendingShiftStatus="", pendingShiftIds=[], pendingAvailabilityDate="", weekOffset=0, viewMode="week", calendarExpanded=false, homeExpanded=false, unsubE=null, unsubS=null, unsubA=null;
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const today=()=>{const d=new Date();return iso(d)};
let selectedScheduleDate=today(), scheduleFilter="mine", scheduleCompact=false, scheduleUserName="", monthOffset=0, chatFilter="all";
let clockIn=localStorage.getItem("ms_clock_in")||"";
const $=id=>document.getElementById(id);
const date=s=>new Date(`${s}T12:00:00`);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const time=s=>{const [h,m]=s.split(":").map(Number),d=new Date();d.setHours(h,m);return d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})};
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2100)}
function demoLoad(){employees=JSON.parse(localStorage.getItem("ms_employees")||"[]");shifts=JSON.parse(localStorage.getItem("ms_shifts")||"[]");availabilities=JSON.parse(localStorage.getItem("ms_availabilities")||"[]");if(!employees.length){employees=[{id:"u1",name:"You",role:"Admin"},{id:"u2",name:"Quinlay",role:"Admin"},{id:"e1",name:"James",role:"Team member"},{id:"e2",name:"Michelle",role:"Team member"}];demoSave()}}
function demoSave(){localStorage.setItem("ms_employees",JSON.stringify(employees));localStorage.setItem("ms_shifts",JSON.stringify(shifts));localStorage.setItem("ms_availabilities",JSON.stringify(availabilities))}
function name(id){return employees.find(x=>x.id===id)?.name||"Unknown"}
function employeeIds(s){return Array.isArray(s.employeeIds)&&s.employeeIds.length?s.employeeIds:[s.employeeId].filter(Boolean)}
function currentEmployeeIdentity(){
 const email=currentUserEmail.trim().toLowerCase();
 if(email==="c93300@gmail.com")return {email,fullName:"jeany lin",firstName:"jeany"};
 if(email==="quinlay.lu@gmail.com")return {email,fullName:"ethan lyu",firstName:"ethan"};
 const fallback=scheduleUserName.trim().toLowerCase().replace(/\s+/g," ");
 return {email,fullName:fallback,firstName:fallback.split(/\s+/)[0]||""};
}
function isMine(s){
 const identity=currentEmployeeIdentity();
 const assigned=employeeIds(s).map(id=>employees.find(e=>e.id===id)).filter(Boolean);
 return assigned.some(employee=>{
  const employeeEmails=[employee.email,employee.ownerEmail,employee.userEmail]
   .filter(Boolean).map(value=>String(value).trim().toLowerCase());
  if(employeeEmails.length)return employeeEmails.includes(identity.email);
  const employeeName=String(employee.name||"").trim().toLowerCase().replace(/\s+/g," ");
  // Employees are roster-only records, so map the signed-in account to its
  // canonical Directory name. Keep first-name matching for legacy records.
  return employeeName===identity.fullName || employeeName===identity.firstName;
 });
}
function selectedAvailability(){return availabilities.filter(a=>(a.ownerEmail||"").toLowerCase()===currentUserEmail)}
function duration(s){let [a,b]=[s.start,s.end].map(x=>x.split(":").map(Number));let n=b[0]*60+b[1]-a[0]*60-a[1];if(n<0)n+=1440;return n/60}
function card(s){
 let d=date(s.date), key=s.date, now=today(), tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
 let dayLabel=key===now?"Today":key===iso(tomorrow)?"Tomorrow":d.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"});
 let employeeName=employeeIds(s).map(name).join(", "), initials=employeeName.split(/\\s+/).map(x=>x[0]||"").join("").slice(0,2).toUpperCase();
 return `<article class="shift-card" data-edit="${esc(s.id)}"><div class="shift-info"><strong>${esc(s.role||"Shift")}</strong><p><b>${dayLabel}</b> &nbsp;${time(s.start)} – ${time(s.end)}</p><p class="shift-person">${esc(employeeName)}</p></div><div class="shift-avatar">${esc(initials)}</div></article>`
}
function empty(s){return `<div class="empty-state"><p class="muted">${s}</p></div>`}
function render(){
 let limit=new Date();limit.setDate(limit.getDate()+7);
 let up=shifts.filter(s=>isMine(s)&&s.date>=today()&&s.date<=iso(limit)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 $("upcomingCount").textContent=up.length;$("homeShifts").innerHTML=up.slice(0,3).map(card).join("")||empty("No upcoming shifts yet.");
 let ws=weekStart(),weekDays=Array.from({length:7},(_,i)=>{let d=new Date(ws);d.setDate(d.getDate()+i);return d;});
 const wh=$("weeklyHours"); if(wh) wh.innerHTML=weekDays.map(d=>{let key=iso(d),hrs=shifts.filter(s=>s.date===key).reduce((n,s)=>n+duration(s),0);return `<div class="week-hour ${key===today()?"today":""}">${d.toLocaleDateString([],{weekday:"short"})}<strong>${hrs?hrs.toFixed(1)+"h":"—"}</strong></div>`}).join("");
 let next=up[0];if($("homeClockShift")){ $("homeClockShift").textContent=next?(next.role||"Scheduled shift") : "No upcoming shift";$("homeClockTime").textContent=next?`${date(next.date).toLocaleDateString([],{weekday:"long",month:"short",day:"numeric"})}  ${time(next.start)} – ${time(next.end)}`:"Your upcoming shifts will appear here"; }
 renderSchedule();
 renderChat();
 $("employeeList").innerHTML=employees.map(e=>{let h=shifts.filter(s=>employeeIds(s).includes(e.id)).reduce((v,s)=>v+duration(s),0);return `<div class="employee-row"><div class="initial">${esc(e.name[0]?.toUpperCase()||"?")}</div><div class="employee-meta"><strong>${esc(e.name)}</strong><p>${esc(e.role||"Team member")} · Roster only</p></div><div class="employee-hours">${h.toFixed(1)}h</div></div>`}).join("")||empty("No employees yet.");
 renderCalendar();clockRender();
}
function weekStart(){let d=date(today());d.setDate(d.getDate()-((d.getDay()+6)%7)+weekOffset*7);return d}
function renderCalendar(){
 const host=$("calendar");
 if(viewMode==="month"){
  const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+monthOffset);
  const first=new Date(base);first.setDate(1-((first.getDay()+6)%7));
  const days=Array.from({length:42},(_,i)=>{let d=new Date(first);d.setDate(first.getDate()+i);return d;});
  $("weekLabel").textContent=base.toLocaleDateString([],{month:"long",year:"numeric"});
  host.classList.add("month-calendar");
  host.innerHTML=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<span class="month-weekday">${x}</span>`).join("")+days.map(d=>{const key=iso(d),has=shifts.some(s=>s.date===key),active=key===selectedScheduleDate;return `<button class="schedule-day month-day ${active?"selected":""} ${key===today()?"today":""} ${d.getMonth()!==base.getMonth()?"outside-month":""}" data-schedule-date="${key}"><span class="daynum">${d.getDate()}</span><span class="daydot" style="visibility:${has?"visible":"hidden"}"></span></button>`}).join("");
 }else{
  let first=weekStart(),days=Array.from({length:7},(_,i)=>{let d=new Date(first);d.setDate(d.getDate()+i);return d;});
  if(!days.some(d=>iso(d)===selectedScheduleDate))selectedScheduleDate=iso(first);
  $("weekLabel").textContent=`${date(selectedScheduleDate).toLocaleDateString([],{weekday:"long",month:"long",day:"numeric",year:"numeric"})}`;
  host.classList.remove("month-calendar");
  host.innerHTML=days.map(d=>{let key=iso(d),active=key===selectedScheduleDate,has=shifts.some(s=>s.date===key);return `<button class="schedule-day ${active?"selected":""} ${key===today()?"today":""}" data-schedule-date="${key}"><span class="weekday">${d.toLocaleDateString([],{weekday:"short"})}</span><span class="daynum">${d.getDate()}</span><span class="daydot" style="visibility:${has?"visible":"hidden"}"></span></button>`}).join("");
 }
 $("scheduleMonthToggle").classList.toggle("active",viewMode==="month");
}
function renderSchedule(){
 renderCalendar();
 const host=$("allShifts"); if(!host)return;
 if(scheduleFilter==="availability") {renderAvailability(host);return;}
 let rangeStart,rangeEnd;
 if(viewMode==="month"||calendarExpanded){
  const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+monthOffset);
  rangeStart=new Date(base.getFullYear(),base.getMonth(),1);
  rangeEnd=calendarExpanded?new Date(base.getFullYear(),base.getMonth()+1,0):new Date(rangeStart);
  if(!calendarExpanded)rangeEnd.setDate(rangeStart.getDate()+27);
 }else{
  rangeStart=date(selectedScheduleDate);
  rangeEnd=new Date(rangeStart);rangeEnd.setDate(rangeEnd.getDate()+27);
 }
 let list=shifts.filter(s=>s.date>=iso(rangeStart)&&s.date<=iso(rangeEnd));
 const q=($("scheduleSearch")?.value||"").trim().toLowerCase();
 if(scheduleFilter==="mine")list=list.filter(isMine);
 if(q)list=list.filter(s=>(s.role||"Shift").toLowerCase().includes(q)||employeeIds(s).map(name).join(" ").toLowerCase().includes(q)||(s.location||"").toLowerCase().includes(q));
 list.sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
 // Each distinct time slot is its own shift card. Records that represent
 // the same slot for multiple employees stay together, while morning and
 // afternoon shifts on the same date remain separate cards.
 const groups=new Map();
 for(const s of list){
  const k=[s.date,s.start,s.end,s.role||"Shift",s.location||"",s.status||"pending"].join("|");
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(s);
 }
 const byDay=new Map();
 for(const group of groups.values()){
  const day=group[0].date;
  if(!byDay.has(day))byDay.set(day,[]);
  byDay.get(day).push(group);
 }
 for(const dayGroups of byDay.values())dayGroups.sort((a,b)=>(a[0].start||"").localeCompare(b[0].start||""));
 const mine=selectedAvailability();
 const days=[];for(let d=new Date(rangeStart);d<=rangeEnd;d.setDate(d.getDate()+1))days.push(iso(d));
 host.innerHTML=days.map(day=>{
  const d=date(day),dayGroups=byDay.get(day)||[];
  const unavailable= scheduleFilter==="mine" ? mine.find(a=>a.startDate<=day&&a.endDate>=day) : null;
  const cards=dayGroups.map(g=>{const first=g[0],ids=g.map(x=>x.id),names=[...new Set(g.flatMap(x=>employeeIds(x).map(name)))],initials=(names[0]||"?").split(/\s+/).map(x=>x[0]||"").join("").slice(0,2).toUpperCase(),status=first.status||"pending",hours=duration(first),durationText=Number.isInteger(hours)?hours+"h":hours.toFixed(1)+"h";return `<article class="schedule-shift-card status-${status}" data-edit="${esc(first.id)}"><div class="schedule-shift-head"><strong class="schedule-shift-title">${esc(first.role||"Shift")}</strong><div class="schedule-avatars"><span class="schedule-avatar">${esc(initials)}</span>${names.length>1?`<span class="schedule-avatar-more">+${names.length-1}</span>`:""}</div></div><div class="schedule-shift-time">${time(first.start)} – ${time(first.end)} (${durationText})</div><p class="schedule-employee-names">${names.map(esc).join(",\n")}</p>${status!=="pending"?`<span class="schedule-status-icon ${status}" aria-label="${status==="confirmed"?"Confirmed":"Rejected"}">${status==="confirmed"?"✓":"×"}</span>`:`<div class="schedule-card-actions"><button class="schedule-reject" data-shift-status="rejected" data-shift-ids="${ids.join(",")}">Reject</button><button class="schedule-confirm" data-shift-status="confirmed" data-shift-ids="${ids.join(",")}">Confirm</button></div>`}</article>`}).join("");
  const availability=unavailable?`<div class="schedule-unavailable"><span>Unavailable</span><b>${unavailable.allDay?"All day":`${time(unavailable.startTime||"09:00")} – ${time(unavailable.endTime||"17:00")}`}</b>${unavailable.note?`<small>${esc(unavailable.note)}</small>`:""}</div>`:"";
  // Keep Add available even when this date already has shifts: a day may
  // contain multiple separate shifts (for example, morning and afternoon).
  const addButton=`<button class="schedule-add-day" data-schedule-add="${day}">＋ Add</button>`;
  return `<section class="schedule-date-group"><div class="schedule-date-label"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString([],{weekday:"short"})}</span></div><div class="schedule-day-content"><div class="schedule-cards">${cards}</div>${availability}${addButton}</div></section>`;
 }).join("");
}

function renderAvailability(host){
 const mine=selectedAvailability(),base=new Date();base.setDate(1);base.setMonth(base.getMonth()+monthOffset);
 const first=new Date(base.getFullYear(),base.getMonth(),1),last=new Date(base.getFullYear(),base.getMonth()+1,0);
 $("weekLabel").textContent=base.toLocaleDateString([],{month:"long",year:"numeric"});
 const rows=[];for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1)){
  const key=iso(d),a=mine.find(x=>x.startDate<=key&&x.endDate>=key);
  const detail=a?(a.kind==="timeoff"?"Time off requested":a.allDay?"Unavailable · all day":`Unavailable · ${time(a.startTime||"09:00")} – ${time(a.endTime||"17:00")}`):"Available · all day";
  rows.push(`<div class="availability-row ${a?"is-unavailable":"is-available"}"><div class="availability-date"><b>${d.getDate()}</b><span>${d.toLocaleDateString([],{weekday:"short"})}</span></div><div class="availability-copy"><strong>${detail}</strong>${a?.note?`<small>${esc(a.note)}</small>`:""}</div><button class="availability-menu" data-availability-date="${key}">•••</button></div>`)
 }
 host.innerHTML=`<div class="availability-heading"><strong>My availability</strong><button id="addAvailabilityBtn" class="primary">＋ Add</button></div><p class="availability-hint">Set the days and times you are available to work.</p><div class="availability-list">${rows.join("")}</div>`;
 $("addAvailabilityBtn").onclick=()=>openAvailability();
}
function openAvailability(kind="unavailable",day=today()){
 $("availabilityForm").reset();$("availabilityKind").value=kind;$("availabilityStartDate").value=day;$("availabilityEndDate").value=day;$("availabilityAllDay").checked=true;$("availabilityTimes").classList.add("hidden");$("availabilityDialogTitle").textContent=kind==="timeoff"?"Request time off":"Declare unavailability";$("availabilityDialog").showModal();
}
async function add(type,data){if(DEMO_MODE){data.id=crypto.randomUUID();(type==="employees"?employees:type==="availability"?availabilities:shifts).push(data);demoSave();render()}else return addDoc(collection(db,`workspaces/${WORKSPACE_ID}/${type}`),data)}
async function update(type,id,data){if(DEMO_MODE){Object.assign((type==="employees"?employees:shifts).find(x=>x.id===id),data);demoSave();render()}else await updateDoc(doc(db,`workspaces/${WORKSPACE_ID}/${type}`,id),data)}
async function remove(type,id){if(DEMO_MODE){if(type==="shifts")shifts=shifts.filter(x=>x.id!==id);else employees=employees.filter(x=>x.id!==id);demoSave();render()}else await deleteDoc(doc(db,`workspaces/${WORKSPACE_ID}/${type}`,id))}
function openShift(s=null){$("shiftForm").reset();$("shiftId").value=s?.id||"";$("shiftDialogTitle").textContent=s?"Edit shift":"Add shift";$("deleteShiftBtn").classList.toggle("hidden",!s);$("shiftEmployeeList").innerHTML=employees.map(e=>`<label class="employee-check"><input type="checkbox" name="shiftEmployees" value="${esc(e.id)}"><span>${esc(e.name)}</span></label>`).join("");$("shiftDate").value=s?.date||today();$("shiftStart").value=s?.start||"09:00";$("shiftEnd").value=s?.end||"17:00";$("shiftRole").value=s?.role||"";$("shiftLocation").value=s?.location||"";$("shiftNotes").value=s?.notes||"";if(s){const chosen=employeeIds(s);document.querySelectorAll('input[name="shiftEmployees"]').forEach(c=>c.checked=chosen.includes(c.value));}$("shiftError").textContent="";$("shiftDialog").showModal()}
function showPage(p){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));$(`${p}Page`).classList.remove("hidden");$("app").classList.toggle("schedule-open",p==="schedule");document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.page===p))}
function clockRender(){let active=!!clockIn;const status=$("clockStatus");if(status)status.textContent=active?"You are clocked in":"You are clocked out";const legacy=$("clockStatusLegacy");if(legacy)legacy.textContent=active?"You are clocked in":"You are clocked out";const btn=$("clockBtn");if(btn){const label=$("clockBtnText");if(label)label.textContent=active?"End shift":"Start shift";else btn.textContent=active?"Clock out":"Clock in";}const info=$("clockInfo");if(info)info.textContent=active?`Started ${new Date(clockIn).toLocaleString()}`:"Time entries are saved on this device."}
function start(user){
 const email=(user.email||"").trim().toLowerCase();currentUserEmail=email;const first=email==="c93300@gmail.com"?"Jeany":email==="quinlay.lu@gmail.com"?"Ethan":(email.split("@")[0]||"there");const displayName=email==="c93300@gmail.com"?"Jeany Lin":email==="quinlay.lu@gmail.com"?"Ethan Lyu":first;scheduleUserName=displayName;
 const initials=first.slice(0,2).toUpperCase();["homeAvatar","profileAvatar"].forEach(id=>{if($(id))$(id).textContent=initials});if($("homeFirstName"))$("homeFirstName").textContent=first;if($("profileName"))$("profileName").textContent=displayName;if($("profileDate"))$("profileDate").textContent=new Date().toLocaleDateString([],{day:"2-digit",month:"2-digit",year:"numeric"});
 $("authScreen").classList.add("hidden");$("app").classList.remove("hidden");$("signedInEmail").textContent=user.email||"Demo preview";$("dataMode").textContent=DEMO_MODE?"Local demo — not shared between phones":"Firebase cloud sync";
 if(DEMO_MODE){demoLoad();render()}else{let p=`workspaces/${WORKSPACE_ID}`;unsubE?.();unsubS?.();unsubA?.();unsubA=onSnapshot(collection(db,p,"availability"),s=>{availabilities=s.docs.map(d=>({id:d.id,...d.data()}));if(scheduleFilter==="availability")renderSchedule()});unsubE=onSnapshot(collection(db,p,"employees"),s=>{employees=s.docs.map(d=>({id:d.id,...d.data()}));render()});unsubS=onSnapshot(collection(db,p,"shifts"),s=>{shifts=s.docs.map(d=>({id:d.id,...d.data()}));render()})}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();let email=$("email").value.trim().toLowerCase();if(!["c93300@gmail.com","quinlay.lu@gmail.com"].includes(email)){$("authMessage").textContent="This email is not authorised.";return}if(DEMO_MODE){$("authMessage").textContent="Cloud sign-in is not configured yet. Complete Firebase setup first.";return}try{await signInWithEmailAndPassword(auth,email,$("password").value)}catch(err){$("authMessage").textContent=err.message}});
$("addShiftBtn").onclick=()=>openShift();$("addEmployeeBtn").onclick=()=>{$("employeeForm").reset();$("employeeDialog").showModal()};
$("shiftForm").addEventListener("submit",async e=>{e.preventDefault();let id=$("shiftId").value,chosen=[...document.querySelectorAll('input[name="shiftEmployees"]:checked')].map(c=>c.value),data={date:$("shiftDate").value,start:$("shiftStart").value,end:$("shiftEnd").value,role:$("shiftRole").value.trim(),location:$("shiftLocation").value.trim(),notes:$("shiftNotes").value.trim()};if(!chosen.length){$("shiftError").textContent="Select at least one employee.";return}try{if(id){data.employeeId=chosen[0];await update("shifts",id,data)}else{for(const employeeId of chosen)await add("shifts",{...data,employeeId});}$("shiftDialog").close();toast("Shift saved")}catch(err){$("shiftError").textContent=err.message}});
$("deleteShiftBtn").onclick=async()=>{let id=$("shiftId").value;if(id&&confirm("Delete this shift?")){await remove("shifts",id);$("shiftDialog").close();toast("Shift deleted")}};
$("employeeForm").addEventListener("submit",async e=>{e.preventDefault();let n=$("employeeName").value.trim();if(!n)return;await add("employees",{name:n,role:$("employeeRole").value.trim()||"Team member"});$("employeeDialog").close();toast("Employee added")});
$("prevWeek").onclick=()=>{if(viewMode==="month"){monthOffset--;const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+monthOffset);selectedScheduleDate=iso(d);}else{weekOffset--;selectedScheduleDate=iso(weekStart())}renderSchedule()};$("nextWeek").onclick=()=>{if(viewMode==="month"){monthOffset++;const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+monthOffset);selectedScheduleDate=iso(d);}else{weekOffset++;selectedScheduleDate=iso(weekStart())}renderSchedule()};
$("scheduleToday").onclick=()=>{weekOffset=0;monthOffset=0;calendarExpanded=false;viewMode="week";selectedScheduleDate=today();renderSchedule()};
$("calendarExpandBtn").onclick=()=>{calendarExpanded=!calendarExpanded;viewMode=calendarExpanded?"month":"week";$("calendarExpandBtn").textContent=calendarExpanded?"Show fewer dates⌃":"Show all dates⌄";renderSchedule()};
$("scheduleMonthToggle").onclick=()=>{viewMode=viewMode==="month"?"week":"month";calendarExpanded=viewMode==="month";$("calendarExpandBtn").textContent=calendarExpanded?"Show fewer dates⌃":"Show all dates⌄";renderSchedule()};
$("scheduleCompact").onclick=()=>{scheduleCompact=!scheduleCompact;$("schedulePage").classList.toggle("compact-schedule",scheduleCompact)};
$("scheduleSearchToggle").onclick=()=>{$("scheduleSearchBox").classList.toggle("hidden");if(!$("scheduleSearchBox").classList.contains("hidden"))$("scheduleSearch").focus()};
$("scheduleSearch").addEventListener("input",renderSchedule);
$("assetsSearch").addEventListener("input",e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll(".asset-card").forEach(card=>card.classList.toggle("hidden",!card.textContent.toLowerCase().includes(q)));document.querySelectorAll(".asset-heading").forEach(h=>{const section=h.nextElementSibling;h.classList.toggle("hidden",!section||![...section.querySelectorAll(".asset-card")].some(c=>!c.classList.contains("hidden")))});});
function renderChat(){const host=$("chatList"),q=$("chatSearch").value.trim().toLowerCase();let people=employees.filter(e=>(e.name||"").toLowerCase().includes(q));if(chatFilter==="groups"||chatFilter==="unread")people=[];const emptyMessage=chatFilter==="groups"?"Group conversations will appear when messaging is connected.":chatFilter==="unread"?"Unread messages will appear when messaging is connected.":"No people found.";host.innerHTML=people.map(e=>`<button class="chat-person" data-chat-person="${esc(e.id)}"><span class="chat-person-avatar">${esc((e.name||"?").split(/\s+/).map(x=>x[0]||"").join("").slice(0,2).toUpperCase())}</span><span class="chat-person-copy"><strong>${esc(e.name||"Team member")}</strong><small>${esc(e.role||"Team member")}</small></span><span class="chat-person-time">›</span></button>`).join("")||`<p class="chat-list-empty">${emptyMessage}</p>`;}
$("chatSearch").addEventListener("input",renderChat);document.querySelectorAll(".chat-filter").forEach(b=>b.onclick=()=>{chatFilter=b.dataset.chatFilter;document.querySelectorAll(".chat-filter").forEach(x=>x.classList.toggle("active",x===b));renderChat()});
$("chatList").addEventListener("click",e=>{const b=e.target.closest("[data-chat-person]");if(!b)return;const person=employees.find(x=>x.id===b.dataset.chatPerson);$("chatPreview").innerHTML=`<div class="chat-preview-icon">${esc((person?.name||"?")[0])}</div><strong>${esc(person?.name||"Team member")}</strong><p>This conversation screen is a visual preview. Messages are not sent or synced yet.</p>`;});
$("chatCompose").onclick=()=>toast("Messaging will be connected in a later build.");
$("scheduleSettings").onclick=()=>toast("Schedule settings will be added next.");
document.querySelectorAll(".schedule-tab").forEach(b=>b.onclick=()=>{scheduleFilter=b.dataset.scheduleFilter;document.querySelectorAll(".schedule-tab").forEach(x=>x.classList.toggle("active",x===b));renderSchedule()});
document.addEventListener("click",async e=>{let day=e.target.closest("[data-schedule-date]");if(day){selectedScheduleDate=day.dataset.scheduleDate;renderSchedule();return}let statusBtn=e.target.closest("[data-shift-status]");if(statusBtn){e.stopPropagation();pendingShiftStatus=statusBtn.dataset.shiftStatus;pendingShiftIds=statusBtn.dataset.shiftIds.split(",");const first=shifts.find(x=>x.id===pendingShiftIds[0]);$("shiftStatusDialogTitle").textContent=pendingShiftStatus==="confirmed"?"Confirm shift?":"Reject shift?";$("shiftStatusDialogCopy").textContent=first?`${first.role||"Shift"} · ${date(first.date).toLocaleDateString([],{month:"short",day:"numeric"})} · ${time(first.start)} – ${time(first.end)}`:"Are you sure?";$("shiftStatusConfirm").textContent=pendingShiftStatus==="confirmed"?"Confirm":"Reject";$("shiftStatusConfirm").className=pendingShiftStatus==="confirmed"?"primary":"danger";$("shiftStatusDialog").showModal();return}let addDay=e.target.closest("[data-schedule-add]");if(addDay){openShift();$("shiftDate").value=addDay.dataset.scheduleAdd;return}let c=e.target.closest("[data-edit]");if(c){let s=shifts.find(x=>x.id===c.dataset.edit);if(s)openShift(s)}let x=e.target.closest("[data-close]");if(x)$(x.dataset.close).close();let n=e.target.closest("[data-page]");if(n)showPage(n.dataset.page);let g=e.target.closest("[data-go]");if(g)showPage(g.dataset.go)});
$("availabilityAllDay").addEventListener("change",e=>$("availabilityTimes").classList.toggle("hidden",e.target.checked));
$("availabilityForm").addEventListener("submit",async e=>{e.preventDefault();const data={ownerEmail:currentUserEmail,kind:$("availabilityKind").value,startDate:$("availabilityStartDate").value,endDate:$("availabilityEndDate").value,allDay:$("availabilityAllDay").checked,startTime:$("availabilityStartTime").value||"09:00",endTime:$("availabilityEndTime").value||"17:00",note:$("availabilityNote").value.trim(),repeat:$("availabilityRepeat").checked,createdAt:new Date().toISOString()};if(data.endDate<data.startDate){$("availabilityError").textContent="End date must be on or after start date.";return}try{await add("availability",data);$("availabilityDialog").close();toast("Availability saved");renderSchedule()}catch(err){$("availabilityError").textContent=err.message}});
document.addEventListener("click",e=>{const m=e.target.closest("[data-availability-date]");if(!m)return;pendingAvailabilityDate=m.dataset.availabilityDate;$("availabilityChoiceDate").textContent=date(pendingAvailabilityDate).toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});$("availabilityChoiceDialog").showModal()});
$("markUnavailableBtn").onclick=()=>{$("availabilityChoiceDialog").close();openAvailability("unavailable",pendingAvailabilityDate)};
$("requestTimeOffBtn").onclick=()=>{$("availabilityChoiceDialog").close();openAvailability("timeoff",pendingAvailabilityDate)};
$("shiftStatusConfirm").onclick=async()=>{for(const id of pendingShiftIds){try{await update("shifts",id,{status:pendingShiftStatus})}catch(err){toast("Could not update shift status: "+err.message);return}}$("shiftStatusDialog").close();toast(pendingShiftStatus==="confirmed"?"Shift confirmed":"Shift rejected");renderSchedule();pendingShiftIds=[]};
$("clockBtn").onclick=()=>{if(clockIn){clockIn="";localStorage.removeItem("ms_clock_in");toast("Clocked out")}else{clockIn=new Date().toISOString();localStorage.setItem("ms_clock_in",clockIn);toast("Clocked in")}clockRender()};
$("signOutBtn").onclick=async()=>{if(!DEMO_MODE)await signOut(auth);unsubE?.();unsubS?.();unsubA?.();$("app").classList.add("hidden");$("authScreen").classList.remove("hidden")};
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
if(!DEMO_MODE){let app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);onAuthStateChanged(auth,u=>{if(u){if(!["c93300@gmail.com","quinlay.lu@gmail.com"].includes((u.email||"").toLowerCase())){signOut(auth);$("authMessage").textContent="This account is not authorised."}else start(u)}else{$("app").classList.add("hidden");$("authScreen").classList.remove("hidden")}})}
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
