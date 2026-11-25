// Frontend-only floor screen demo. No database, API, or Supabase calls.
const tables = [
  ...Array.from({length:12},(_,i)=>({area:"indoor",number:i+1})),
  ...Array.from({length:6},(_,i)=>({area:"outdoor",number:i+1}))
];
const orders = [
  {id:1042,area:"indoor",number:2,total:285,printed:false,items:[
    {name:"فطير مشلتت بالجبنة TEST",qty:1,price:85},
    {name:"مكرونة بشاميل TEST",qty:2,price:95},
    {name:"شاي TEST",qty:1,price:10}
  ]},
  {id:1043,area:"indoor",number:5,total:340,printed:true,items:[
    {name:"كفتة مشوية TEST",qty:2,price:160},
    {name:"كانز TEST",qty:1,price:20}
  ]},
  {id:1044,area:"outdoor",number:1,total:145,printed:false,items:[
    {name:"وجبة فراخ TEST",qty:1,price:145}
  ]}
];
const reservations = [{area:"indoor",number:3},{area:"outdoor",number:4}];
let selectedKey = "";
const money = n => Number(n||0).toLocaleString("ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2});
const key = t => t.area+":"+t.number;
const orderAt = t => orders.find(o=>o.area===t.area&&o.number===t.number);
const reserved = t => reservations.some(r=>r.area===t.area&&r.number===t.number);
const active = () => orders.filter(o=>!o.closed);
const total = () => active().reduce((s,o)=>s+o.total,0);
const el = id => document.getElementById(id);

function render(){
 const opened=active();
 el("sidebar-total").innerHTML=money(total())+" <span>ج.م</span>";
 el("floor-total").textContent=money(total())+" ج.م";
 el("open-count").textContent=opened.length;
 el("floor-open-count").textContent=opened.length+" طاولة مفتوحة";
 el("table-count").textContent=tables.length;
 el("open-list").innerHTML=opened.length?opened.map(o=>`<button class="${selectedKey===o.area+":"+o.number?"active":""}" data-open="${o.area}:${o.number}"><span>${o.area==="indoor"?"داخلية":"خارجية"}</span><b>طاولة ${o.number}</b></button>`).join(""):'<small class="pos-no-open-tables">لا توجد طاولات مفتوحة</small>';
 el("table-grid").innerHTML=tables.map(t=>{
   const o=orderAt(t),isReserved=reserved(t),k=key(t);
   const cls=[ "floor-table-tile",o?(o.printed?"printed":"occupied"):"",!o&&isReserved?"reserved":"",selectedKey===k?"selected":"" ].filter(Boolean).join(" ");
   const status=o?"مشغولة":isReserved?"محجوزة":"متاحة";
   return `<button class="${cls}" data-table="${k}"><b>${t.number}</b><small>${t.area==="indoor"?"داخلية":"خارجية"} · ${status}</small>${o?`<span class="table-amount">${money(o.total)} ج.م</span>`:""}${o&&o.printed?'<span class="status-pill">تم طباعة الفاتورة</span>':""}</button>`;
 }).join("");
 el("open-list").querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>select(b.dataset.open)));
 el("table-grid").querySelectorAll("[data-table]").forEach(b=>b.addEventListener("click",()=>select(b.dataset.table)));
 renderPreview();
}
function select(k){selectedKey=k;render();}
function renderPreview(){
 const t=tables.find(x=>key(x)===selectedKey),o=t&&orderAt(t),box=el("order-preview");
 if(!t){box.innerHTML='<h3>تفاصيل الطاولة</h3><p>اضغط على أي طاولة لعرض الأوردر هنا.</p>';return;}
 const label=t.area==="indoor"?"داخلية":"خارجية";
 if(!o){box.innerHTML=`<h3>طاولة ${t.number} — ${label}</h3><p>الطاولة متاحة — لا يوجد أوردر حالي.</p>`;return;}
 box.innerHTML=`<h3>أوردر الطاولة ${t.number} <span class="status-pill">ARK-${o.id}</span></h3>
 <div class="floor-preview-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
 <tbody>${o.items.map(i=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>${money(i.price)} ج.م</td><td>${money(i.qty*i.price)} ج.م</td></tr>`).join("")}</tbody>
 <tfoot><tr><th colspan="3">الإجمالي</th><th>${money(o.total)} ج.م</th></tr></tfoot></table></div>`;
}
function refresh(){render();const n=el("notice");n.hidden=false;n.style.background="#edf7ef";n.style.borderColor="#cde5d4";n.style.color="#246c45";n.textContent="تم تحديث بيانات العرض التجريبي.";setTimeout(()=>{n.hidden=true;},1800);}
el("refresh").addEventListener("click",refresh);
el("side-refresh").addEventListener("click",refresh);
el("summary-refresh").addEventListener("click",refresh);
render();