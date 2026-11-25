// Screen-only demonstration. All state stays in memory; no API/database calls.
const tables=[
 ...Array.from({length:12},(_,i)=>({area:"indoor",number:i+1})),
 ...Array.from({length:6},(_,i)=>({area:"outdoor",number:i+1}))
];
const orders=[
 {id:1042,area:"indoor",number:2,total:285,printed:false,items:[
  {id:1,name:"فطير مشلتت بالجبنة",qty:1,price:85},
  {id:2,name:"مكرونة بشاميل",qty:2,price:95},
  {id:3,name:"شاي",qty:1,price:10}
 ]},
 {id:1043,area:"indoor",number:5,total:340,printed:true,items:[
  {id:4,name:"كفتة مشوية",qty:2,price:160},
  {id:5,name:"كانز",qty:1,price:20}
 ]},
 {id:1044,area:"outdoor",number:1,total:145,printed:false,items:[
  {id:6,name:"وجبة فراخ",qty:1,price:145}
 ]}
];
const reservations=[{area:"indoor",number:3},{area:"outdoor",number:4}];
const products=[{name:"فطير سادة",price:55},{name:"فطير جبنة",price:85},{name:"مكرونة بشاميل",price:95},{name:"كفتة مشوية",price:160},{name:"شاي",price:10},{name:"عصير مانجو",price:35}];
let selectedKey="";
const $=id=>document.getElementById(id);
const key=t=>t.area+":"+t.number;
const fmt=n=>Number(n||0).toLocaleString("ar-EG",{maximumFractionDigits:2});
const activeOrders=()=>orders.filter(o=>!o.closed);
const orderFor=t=>orders.find(o=>!o.closed&&o.area===t.area&&o.number===t.number);
const selectedTable=()=>tables.find(t=>key(t)===selectedKey);
const selectedOrder=()=>{const t=selectedTable();return t?orderFor(t):null};
const isReserved=t=>reservations.some(r=>r.area===t.area&&r.number===t.number);
const total=()=>activeOrders().reduce((s,o)=>s+o.total,0);
function updateActionState(){
 const has=!!selectedOrder();
 document.querySelectorAll("[data-action]").forEach(b=>b.disabled=!has);
}
function render(){
 const opened=activeOrders();
 $("sidebar-total").textContent=fmt(total())+" ج.م";
 $("floor-total").textContent=fmt(total())+" ج.م";
 $("open-count").textContent=opened.length;
 $("floor-open-count").textContent=opened.length+" طاولة مفتوحة";
 $("table-count").textContent=tables.length;
 $("open-list").innerHTML=opened.length?opened.map(o=>`<button type="button" class="${selectedKey===o.area+":"+o.number?"active":""}" data-open="${o.area}:${o.number}"><span>${o.area==="indoor"?"داخلية":"خارجية"}</span><b>${o.number}</b></button>`).join(""):'<small class="pos-no-open-tables">لا توجد طاولات مفتوحة</small>';
 $("table-grid").innerHTML=tables.map(t=>{
  const o=orderFor(t),reserved=isReserved(t),classes=["floor-table-tile",o?(o.printed?"printed":"occupied"):"",!o&&reserved?"reserved":"",selectedKey===key(t)?"selected":""].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}" data-table="${key(t)}"><b>${t.number}</b><small>${o?"مشغولة":reserved?"محجوزة":"متاحة"}</small>${o?`<span class="table-amount">${fmt(o.total)} ج.م</span>`:""}</button>`;
 }).join("");
 $("open-list").querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>select(b.dataset.open)));
 $("table-grid").querySelectorAll("[data-table]").forEach(b=>b.addEventListener("click",()=>select(b.dataset.table)));
 renderPreview();updateActionState();
}
function select(k){selectedKey=k;render();}
function renderPreview(){
 const t=selectedTable(),o=selectedOrder(),box=$("order-preview");
 if(!t){box.innerHTML="<p>اضغط على أي طاولة لعرض الأوردر هنا.</p>";return;}
 const area=t.area==="indoor"?"داخلية":"خارجية";
 if(!o){box.innerHTML=`<h3>الطاولة ${t.number} — ${area}</h3><p>الطاولة ${isReserved(t)?"محجوزة":"متاحة"} — لا يوجد طلب حالي.</p>`;return;}
 box.innerHTML=`<h3>أوردر الطاولة ${o.number} <span class="status-pill">ARK-${o.id}</span></h3>
 <div class="floor-preview-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
 <tbody>${o.items.map(i=>`<tr><td>${i.name}</td><td>${fmt(i.qty)}</td><td>${fmt(i.price)} ج.م</td><td>${fmt(i.qty*i.price)} ج.م</td></tr>`).join("")}</tbody>
 <tfoot><tr><th colspan="3">الإجمالي</th><th>${fmt(o.total)} ج.م</th></tr></tfoot></table></div>`;
}
function refresh(){render();}
function recalc(o){o.total=o.items.reduce((s,i)=>s+i.qty*i.price,0);o.printed=false;}
function targetTable(exclude){
 const value=prompt("اكتب الطاولة المستهدفة بالشكل: داخلية 4 أو خارجية 2");
 if(!value)return null;
 const m=value.trim().match(/^(داخلية|خارجية)\s*(\d+)$/);
 if(!m){alert("اكتبها مثل: داخلية 4 أو خارجية 2");return null;}
 const t={area:m[1]==="داخلية"?"indoor":"outdoor",number:Number(m[2])};
 if(!tables.some(x=>key(x)===key(t))||orderFor(t)||isReserved(t)||key(t)===exclude){alert("الطاولة غير متاحة.");return null;}
 return t;
}
function runAction(action){
 const o=selectedOrder(),t=selectedTable();if(!o||!t)return;
 if(action==="add"){
  const choices=products.map((p,i)=>`${i+1}) ${p.name} — ${p.price} ج.م`).join("\n");
  const raw=prompt("اختار رقم المنتج لإضافته:\n"+choices);const p=products[Number(raw)-1];
  if(!p)return;if(!raw||!Number.isInteger(Number(raw))){alert("اختيار غير صحيح");return;}
  const existing=o.items.find(i=>i.name===p.name);if(existing)existing.qty++;else o.items.push({id:Date.now(),name:p.name,qty:1,price:p.price});recalc(o);
 }else if(action==="remove-item"){
  const choices=o.items.map((i,n)=>`${n+1}) ${i.name} (×${i.qty})`).join("\n");
  const n=Number(prompt("اكتب رقم الصنف المطلوب حذفه:\n"+choices));if(!Number.isInteger(n)||n<1||n>o.items.length)return;
  const item=o.items[n-1];if(item.qty>1)item.qty--;else o.items.splice(n-1,1);recalc(o);
 }else if(action==="transfer"||action==="merge"){
  const target=targetTable(key(t));if(!target)return;
  if(action==="transfer"){o.area=target.area;o.number=target.number;}
  else{const destination=orderFor(target);if(!destination)return;o.items.forEach(i=>{const found=destination.items.find(x=>x.name===i.name&&x.price===i.price);if(found)found.qty+=i.qty;else destination.items.push({...i,id:Date.now()+Math.random()});});recalc(destination);o.closed=true;}
 }else if(action==="transfer-item"){
  if(o.items.length===0)return;const choices=o.items.map((i,n)=>`${n+1}) ${i.name} (×${i.qty})`).join("\n");
  const n=Number(prompt("اكتب رقم الصنف المطلوب نقله:\n"+choices));if(!Number.isInteger(n)||n<1||n>o.items.length)return;
  const target=targetTable(key(t));if(!target)return;const item=o.items[n-1];const moved={...item,qty:1,id:Date.now()};item.qty--;if(item.qty<=0)o.items.splice(n-1,1);
  const newOrder={id:Math.max(1044,...orders.map(x=>x.id))+1,area:target.area,number:target.number,total:0,printed:false,items:[moved]};recalc(o);recalc(newOrder);orders.push(newOrder);
 }else if(action==="cash"||action==="finish"){
  if(confirm("تأكيد إنهاء الأوردر التجريبي؟"))o.closed=true;
 }else if(action==="discount"){
  const n=Number(prompt("قيمة الخصم بالجنيه:", "10"));if(!Number.isFinite(n)||n<=0)return;o.total=Math.max(0,o.total-n);
 }else if(action==="empty"){
  if(confirm("تأكيد إفراغ الطاولة التجريبية؟")){o.closed=true;}
 }else if(action==="print"){
  o.printed=true;alert("تم تغيير حالة الطاولة إلى تم طباعة الفاتورة (تجريبي).");
 }
 render();
}
document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>runAction(b.dataset.action)));
$("side-refresh").addEventListener("click",refresh);
$("summary-refresh").addEventListener("click",refresh);
$("switch-user").addEventListener("click",()=>alert("تبديل المستخدم غير متاح في نسخة العرض التجريبية."));
render();