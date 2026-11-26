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
let products=[{name:"فطير سادة",price:55},{name:"فطير جبنة",price:85},{name:"مكرونة بشاميل",price:95},{name:"كفتة مشوية",price:160},{name:"شاي",price:10},{name:"عصير مانجو",price:35}];
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
 box.innerHTML=`<h3>أوردر الطاولة ${o.number} <span class="status-pill">EGS-${o.id}</span></h3>
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
render();
/* Demo order channels: take-away, delivery, and all active tickets */
const channelOrders=[
 {id:2041,channel:"takeaway",customer:"طلب تيك أواي 1",total:210,items:["فطير جبنة","شاي","عصير مانجو"]},
 {id:2042,channel:"takeaway",customer:"طلب تيك أواي 2",total:165,items:["مكرونة بشاميل","كانز"]},
 {id:3041,channel:"delivery",customer:"عميل دليفري (تجريبي)",total:320,items:["كفتة مشوية","فطير سادة","عصير مانجو"]},
 {id:3042,channel:"delivery",customer:"عميل دليفري 2",total:245,items:["وجبة فراخ","شاي"]}
];
function renderChannel(tab){
 const dashboard=document.querySelector(".arkan-floor-dashboard"),note=document.querySelector(".demo-note");
 let panel=document.getElementById("channel-demo-panel");
 if(tab==="صالة المطعم"){dashboard.style.display="";if(panel)panel.remove();note.style.display="";return;}
 dashboard.style.display="none";note.style.display="";
 if(!panel){panel=document.createElement("section");panel.id="channel-demo-panel";panel.className="pos-channel-panel";dashboard.after(panel);}
 let list=tab==="تيك أواي"?channelOrders.filter(o=>o.channel==="takeaway"):tab==="دليفري"?channelOrders.filter(o=>o.channel==="delivery"):channelOrders;
 panel.innerHTML=`<h2>${tab==="تيك أواي"?"طلبات التيك أواي":tab==="دليفري"?"طلبات الدليفري":"كل الطلبات التجريبية"}</h2>
 <div class="pos-channel-grid">${list.map(o=>`<article class="pos-channel-card"><h3>${o.customer}</h3><small>رقم الطلب: ${o.id}</small><ul>${o.items.map(i=>`<li>${i}</li>`).join("")}</ul><strong>${fmt(o.total)} ج.م</strong><button data-channel-done="${o.id}">إنهاء الطلب (تجريبي)</button></article>`).join("")||"<p>لا توجد طلبات.</p>"}</div>`;
 panel.querySelectorAll("[data-channel-done]").forEach(b=>b.addEventListener("click",()=>{const card=b.closest(".pos-channel-card");if(card)card.classList.add("done");b.textContent="تم إنهاؤه";b.disabled=true;}));
}
document.querySelectorAll(".tabs .tab").forEach(tab=>tab.addEventListener("click",()=>{
 document.querySelectorAll(".tabs .tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");renderChannel(tab.textContent.trim());
}));


// Load the current menu through the local API. The API refreshes its SQLite
// cache from Supabase when cloud access and read policies are available.
async function loadConnectedMenu(){
 try{
  const response=await fetch("http://127.0.0.1:4317/api/menu");
  if(!response.ok)throw new Error("Menu API returned "+response.status);
  const data=await response.json();
  if(Array.isArray(data.items)&&data.items.length){
   products=data.items.map(item=>({id:item.id,name:item.name,price:Number(item.price_minor)/100}));
  }
 }catch(error){
  console.error("Could not load menu:",error);
 }
}
loadConnectedMenu();


// Navigate between two independent full-screen views: POS and administration.
const posPage=document.querySelector(".egsoft-pos-page");
const adminPage=document.getElementById("admin-page");
document.getElementById("open-admin").addEventListener("click",()=>{
  posPage.hidden=true;
  adminPage.hidden=false;
  window.scrollTo(0,0);
});
document.getElementById("back-to-pos").addEventListener("click",()=>{
  adminPage.hidden=true;
  posPage.hidden=false;
  window.scrollTo(0,0);
});


(()=> {
 const workspace=document.getElementById("admin-workspace");if(!workspace)return;
 let menu={categories:[],products:[]};
 const money=n=>(Number(n||0)/100).toLocaleString("ar-EG",{maximumFractionDigits:2})+" ج.م";
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function api(path,opt={}){const r=await fetch("http://127.0.0.1:4317"+path,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"تعذر الاتصال");return d;}
 const heading=(t,sub,action="")=>'<div class="admin-page-heading"><div><h1>'+t+'</h1><p>'+sub+'</p></div>'+action+'</div>';
 const table=(heads,rows)=>'<div class="admin-table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
 async function dashboard(){const d=await api("/api/admin/summary");workspace.innerHTML=heading("لوحة الإدارة","ملخص سريع لحالة النظام")+'<div class="admin-kpis"><article><small>الفئات</small><strong>'+d.categories+'</strong></article><article><small>المنتجات</small><strong>'+d.products+'</strong></article><article><small>الطلبات</small><strong>'+d.orders+'</strong></article><article><small>إجمالي المبيعات</small><strong>'+money(d.sales_minor)+'</strong></article></div><div class="admin-panel"><h2>حالة النظام</h2><p>قاعدة البيانات المحلية متصلة. '+(d.cloud?"إعداد Supabase موجود.":"مفتاح Supabase غير مضبوط.")+'</p><p>المنيو يُحفظ محليًا ويظل متاحًا عند انقطاع الإنترنت.</p></div>';}
 async function loadMenu(){menu=await api("/api/admin/menu");}
 async function categoriesPage(){await loadMenu();const rows=menu.categories.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+c.sort_order+'</td><td>'+(c.is_active?"نشطة":"موقوفة")+'</td><td><button class="admin-small-btn" data-c="'+c.id+'">تعديل</button></td></tr>').join("");workspace.innerHTML=heading("الفئات","إضافة وتنظيم فئات المنيو",'<button class="admin-primary" id="add-c">+ فئة جديدة</button>')+table(["اسم الفئة","الترتيب","الحالة","إجراء"],rows||'<tr><td colspan="4">لا توجد فئات</td></tr>');workspace.querySelector("#add-c").onclick=()=>editCategory();workspace.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>editCategory(menu.categories.find(x=>x.id===b.dataset.c)));}
 async function productsPage(){await loadMenu();const rows=menu.products.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(menu.categories.find(c=>c.id===p.category_id)?.name||"—")+'</td><td>'+money(p.price_minor)+'</td><td>'+(p.is_available?"متاح":"موقوف")+'</td><td><button class="admin-small-btn" data-p="'+p.id+'">تعديل</button></td></tr>').join("");workspace.innerHTML=heading("إدارة المنيو والمنتجات","إدارة الأصناف والأسعار",'<button class="admin-primary" id="add-p">+ منتج جديد</button>')+table(["المنتج","الفئة","السعر","الحالة","إجراء"],rows||'<tr><td colspan="5">لا توجد منتجات</td></tr>');workspace.querySelector("#add-p").onclick=()=>editProduct();workspace.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>editProduct(menu.products.find(x=>x.id===b.dataset.p)));}
 async function editCategory(c){const name=prompt("اسم الفئة",c?.name||"");if(name===null)return;const sort=Number(prompt("ترتيب العرض",String(c?.sort_order||0)));if(!Number.isFinite(sort))return;try{await api(c?"/api/admin/categories/"+c.id:"/api/admin/categories",{method:c?"PATCH":"POST",body:JSON.stringify({name,sort_order:sort,is_active:c?.is_active!==false})});await categoriesPage();}catch(e){alert(e.message);}}
 async function editProduct(p){const name=prompt("اسم المنتج",p?.name||"");if(name===null)return;const list=menu.categories.map((c,i)=>(i+1)+") "+c.name).join("\n");const def=p?menu.categories.findIndex(c=>c.id===p.category_id)+1:1;const n=Number(prompt("رقم الفئة:\n"+list,String(def)));const cat=menu.categories[n-1];if(!cat){alert("الفئة غير صحيحة");return;}const price=Number(prompt("السعر بالجنيه",p?String(p.price_minor/100):""));if(!Number.isFinite(price)||price<0)return;const description=prompt("الوصف",p?.description||"")??"";try{await api(p?"/api/admin/products/"+p.id:"/api/admin/products",{method:p?"PATCH":"POST",body:JSON.stringify({name,category_id:cat.id,price,description,is_available:p?.is_available!==false})});await productsPage();}catch(e){alert(e.message);}}
 async function salesPage(){const rows=await api("/api/admin/orders");workspace.innerHTML=heading("المبيعات","الطلبات المسجلة على الجهاز")+table(["رقم الطلب","النوع","الحالة","الإجمالي","التاريخ","المزامنة"],rows.map(o=>'<tr><td>'+esc(o.order_number)+'</td><td>'+esc(o.order_type)+'</td><td>'+esc(o.status)+'</td><td>'+money(o.total_minor)+'</td><td>'+new Date(o.created_at).toLocaleString("ar-EG")+'</td><td>'+esc(o.sync_status)+'</td></tr>').join("")||'<tr><td colspan="6">لا توجد طلبات مسجلة</td></tr>');}
 async function render(section="dashboard"){workspace.innerHTML='<div class="admin-loading">جاري التحميل...</div>';try{if(section==="dashboard")await dashboard();else if(section==="categories")await categoriesPage();else if(["menu","products"].includes(section))await productsPage();else if(["sales","reports"].includes(section))await salesPage();else workspace.innerHTML=heading(section==="employees"?"الموظفون والموارد البشرية":"إعدادات النظام","إدارة الصلاحيات وربط بقية وحدات التشغيل")+'<div class="admin-panel"><p>هذا القسم يحتاج إعداد تسجيل الدخول وصلاحيات المستخدمين قبل تفعيل البيانات الحساسة.</p></div>';}catch(e){workspace.innerHTML=heading("تعذر تحميل البيانات","تأكد من تشغيل الخادم المحلي")+'<div class="admin-panel admin-error">'+esc(e.message)+'</div><button id="retry-admin" class="admin-primary">إعادة المحاولة</button>';workspace.querySelector("#retry-admin").onclick=()=>render(section);}}
 document.querySelectorAll("[data-admin-section]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-admin-section]").forEach(x=>x.classList.toggle("active",x===b));render(b.dataset.adminSection);}));
 document.getElementById("open-admin")?.addEventListener("click",()=>render("dashboard"));render();
})();
