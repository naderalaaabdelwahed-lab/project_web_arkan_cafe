// Floor data and products are loaded from the local SQLite-backed API.
const tables=[
 ...Array.from({length:12},(_,i)=>({area:"indoor",number:i+1})),
 ...Array.from({length:6},(_,i)=>({area:"outdoor",number:i+1}))
];
const orders=[];
const reservations=[];
let products=[];
let menuLoaded=false;
let selectedKey="";
const $=id=>document.getElementById(id);
const apiFetch=(url,options={})=>{
 const headers={...(options.headers||{})};
 const token=window.arkanDesktop?.apiToken;
 if(token)headers["X-Egsoft-Api-Token"]=token;
 return globalThis["fetch"](url,{...options,headers});
};
const key=t=>t.area+":"+t.number;
const fmt=n=>Number(n||0).toLocaleString("ar-EG",{maximumFractionDigits:2});
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const activeOrders=()=>orders.filter(o=>!o.closed&&o.status!=="cancelled"&&o.payment_status!=="paid");
const orderFor=t=>orders.find(o=>!o.closed&&o.area===t.area&&o.number===t.number);
const selectedTable=()=>tables.find(t=>key(t)===selectedKey);
const selectedOrder=()=>{const t=selectedTable();return t?orderFor(t):null};
const isReserved=t=>reservations.some(r=>r.area===t.area&&r.number===t.number);
const total=()=>activeOrders().reduce((s,o)=>s+o.total,0);
function updateActionState(){
 const has=!!selectedOrder(),canAdd=!!selectedTable()&&menuLoaded&&products.length>0;
 document.querySelectorAll("[data-action]").forEach(b=>b.disabled=b.dataset.action==="add"?!canAdd:!has);
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
 <tbody>${o.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${fmt(i.qty)}</td><td>${fmt(i.price)} ج.م</td><td>${fmt(i.qty*i.price)} ج.م</td></tr>`).join("")}</tbody>
 <tfoot><tr><th colspan="3">الإجمالي</th><th>${fmt(o.total)} ج.م</th></tr></tfoot></table></div>`;
}
function refresh(){render();}
function recalc(o){o.total=o.items.reduce((s,i)=>s+i.qty*i.price,0);o.printed=false;}
function targetTable(exclude,allowOccupied=false){
 const value=prompt("اكتب الطاولة المستهدفة بالشكل: داخلية 4 أو خارجية 2");
 if(!value)return null;
 const m=value.trim().match(/^(داخلية|خارجية)\s*(\d+)$/);
 if(!m){alert("اكتبها مثل: داخلية 4 أو خارجية 2");return null;}
 const t={area:m[1]==="داخلية"?"indoor":"outdoor",number:Number(m[2])};
 if(!tables.some(x=>key(x)===key(t))||(!allowOccupied&&orderFor(t))||isReserved(t)||key(t)===exclude){alert("الطاولة غير متاحة.");return null;}
 return t;
}
async function saveOrder(orderId,changes,refreshAfter=true){
 const response=await apiFetch("http://127.0.0.1:4317/api/orders/"+encodeURIComponent(orderId),{
  method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(changes)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"تعذر حفظ تعديل الطلب.");
 if(refreshAfter)await loadConnectedFloorData();
 return result;
}
const orderItemPayload=order=>(order.items||[]).map(item=>({
 menu_item_id:item.menu_item_id,quantity:Number(item.qty),notes:item.notes||""
}));
async function runAction(action){
 const o=selectedOrder(),t=selectedTable();if(!t)return;
 try{
  if(action==="add"&&!o){
   const choices=products.map((p,i)=>(i+1)+") "+p.name+" — "+p.price+" ج.م").join("\n");
   const raw=prompt("اختار أول صنف للطلب الجديد:\n"+choices),p=products[Number(raw)-1];
   if(!p||!p.id||!raw||!Number.isInteger(Number(raw))){alert("اختيار المنتج غير صحيح أو المنيو لم يتم تحميله.");return;}
   const response=await apiFetch("http://127.0.0.1:4317/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_type:"dine_in",table_id:t.id||null,table_number:t.number,table_area:t.area,items:[{menu_item_id:p.id,quantity:1}]})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"تعذر إنشاء الطلب.");
   await loadConnectedFloorData();select(key(t));return;
  }
  if(!o)return;
  if(action==="add"){
   const choices=products.map((p,i)=>(i+1)+") "+p.name+" — "+p.price+" ج.م").join("\n");
   const raw=prompt("اختار رقم المنتج لإضافته:\n"+choices),p=products[Number(raw)-1];
   if(!p||!raw||!Number.isInteger(Number(raw)))return;
   const items=orderItemPayload(o),existing=items.find(i=>String(i.menu_item_id)===String(p.id));
   if(existing)existing.quantity++;else items.push({menu_item_id:p.id,quantity:1,notes:""});
   await saveOrder(o.id,{items});
  }else if(action==="remove-item"){
   const choices=o.items.map((i,n)=>(n+1)+") "+i.name+" (×"+i.qty+")").join("\n");
   const n=Number(prompt("اكتب رقم الصنف المطلوب تقليل كميته أو حذفه:\n"+choices));
   if(!Number.isInteger(n)||n<1||n>o.items.length)return;
   const items=orderItemPayload(o),item=items[n-1];
   if(item.quantity>1)item.quantity--;else items.splice(n-1,1);
   if(!items.length){alert("لا يمكن ترك الطلب بدون أصناف. استخدم إفراغ الطاولة لإلغاء الطلب.");return;}
   await saveOrder(o.id,{items});
  }else if(action==="transfer"||action==="merge"){
   const target=targetTable(key(t),action==="merge");if(!target)return;
   if(action==="transfer"){
    await saveOrder(o.id,{table_id:target.id||null,table_number:target.number,table_area:target.area},false);
    selectedKey=key(target);await loadConnectedFloorData();select(key(target));
   }else{
    const destination=orderFor(target);if(!destination){alert("الطاولة المستهدفة ليس عليها طلب.");return;}
    const items=orderItemPayload(destination);
    for(const item of orderItemPayload(o)){
     const found=items.find(x=>String(x.menu_item_id)===String(item.menu_item_id));
     if(found)found.quantity+=item.quantity;else items.push(item);
    }
    await saveOrder(destination.id,{items},false);
    await saveOrder(o.id,{status:"cancelled"},false);
    await loadConnectedFloorData();select(key(target));
   }
  }else if(action==="transfer-item"){
   if(!o.items.length)return;
   const choices=o.items.map((i,n)=>(n+1)+") "+i.name+" (×"+i.qty+")").join("\n");
   const n=Number(prompt("اكتب رقم الصنف المطلوب نقل وحدة منه:\n"+choices));
   if(!Number.isInteger(n)||n<1||n>o.items.length)return;
   const target=targetTable(key(t));if(!target)return;
   const sourceItems=orderItemPayload(o),moved=sourceItems[n-1];
   if(!moved.menu_item_id){alert("لا يمكن نقل هذا الصنف لأن معرف المنتج غير متوفر.");return;}
   const created=await apiFetch("http://127.0.0.1:4317/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_type:"dine_in",table_id:target.id||null,table_number:target.number,table_area:target.area,items:[{menu_item_id:moved.menu_item_id,quantity:1,notes:moved.notes}]})});
   const createdData=await created.json();if(!created.ok)throw new Error(createdData.error||"تعذر إنشاء الطلب في الطاولة المستهدفة.");
   if(moved.quantity>1)moved.quantity--;else sourceItems.splice(n-1,1);
   if(sourceItems.length)await saveOrder(o.id,{items:sourceItems},false);
   else await saveOrder(o.id,{status:"cancelled"},false);
   await loadConnectedFloorData();select(key(target));
  }else if(action==="cash"||action==="finish"){
   if(!confirm("تأكيد تحصيل كامل قيمة الطلب؟"))return;
   const paymentMethod=action==="cash"?"cash":(prompt("طريقة الدفع: cash أو card أو wallet",o.payment_method||"cash")||"");
   if(!["cash","card","wallet"].includes(paymentMethod)){alert("طريقة الدفع غير صحيحة.");return;}
   const response=await apiFetch("http://127.0.0.1:4317/api/orders/"+encodeURIComponent(o.id)+"/pay",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payment_method:paymentMethod})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"تعذر تسجيل الدفع.");
   await loadConnectedFloorData();
  }else if(action==="discount"){
   const n=Number(prompt("قيمة الخصم بالجنيه:",String(Number(o.discount_minor||0)/100)));
   if(!Number.isFinite(n)||n<0)return;
   await saveOrder(o.id,{discount_minor:Math.round(n*100)});
  }else if(action==="empty"){
   if(confirm("تأكيد إلغاء الطلب وإخلاء الطاولة؟"))await saveOrder(o.id,{status:"cancelled"});
  }else if(action==="print"){
   window.print();
  }
 }catch(error){alert(error.message);}
}
document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>runAction(b.dataset.action)));
$("side-refresh").addEventListener("click",refresh);
$("summary-refresh").addEventListener("click",refresh);
render();
/* Separate takeaway/delivery workspace. The dining-room renderer above stays untouched. */
let channelOrders=[];
let activeChannel="صالة المطعم";
let channelCart=[];
let channelCustomer={name:"",phone:"",address:""};
const normalizeChannelType=type=>String(type||"").toLowerCase().replace(/-/g,"_");
const channelTypeLabel=type=>({dine_in:"صالة",takeaway:"تيك أواي",delivery:"دليفري"}[normalizeChannelType(type)]||type||"—");
const channelStatusLabel=status=>({pending:"جديد",confirmed:"مؤكد",preparing:"قيد التحضير",ready:"جاهز",delivered:"تم التسليم",cancelled:"ملغي",canceled:"ملغي"}[String(status||"").toLowerCase()]||status||"—");
function renderChannel(tab=activeChannel){
 activeChannel=tab;
 const dashboard=document.querySelector(".arkan-floor-dashboard");
 let panel=document.getElementById("channel-demo-panel");
 if(tab==="صالة المطعم"){
  if(dashboard)dashboard.style.display="";
  if(panel)panel.remove();
  return;
 }
 if(dashboard)dashboard.style.display="none";
 if(!panel){
  panel=document.createElement("section");
  panel.id="channel-demo-panel";
  panel.className="pos-channel-workspace";
  const tabs=document.querySelector(".egsoft-pos-page > .tabs");
  if(tabs)tabs.after(panel);
  else document.querySelector(".egsoft-pos-page")?.append(panel);
 }
 if(tab==="الكل"){
  panel.innerHTML=`
   <div class="pos-channel-heading"><h2>كل الأوردرات</h2><button type="button" data-channel-refresh>تحديث</button></div>
   <div class="pos-channel-table-wrap"><table class="pos-channel-orders-table">
    <thead><tr><th>رقم الأوردر</th><th>النوع</th><th>اسم العميل</th><th>الموبايل</th><th>رقم الطاولة</th><th>تفاصيل الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>الدفع</th></tr></thead>
    <tbody>${channelOrders.map(o=>`<tr>
     <td>${esc(o.number||o.id)}</td><td>${esc(channelTypeLabel(o.channel))}</td>
     <td>${esc(o.customer||"—")}</td><td>${esc(o.phone||"—")}</td>
     <td>${normalizeChannelType(o.channel)==="dine_in"?esc(o.tableNumber||"—"):"—"}</td>
     <td>${o.items.map(i=>esc(i.name)+" × "+fmt(i.qty)).join("، ")||"—"}</td>
     <td>${fmt(o.total)} ج.م</td><td>${esc(channelStatusLabel(o.status))}</td>
     <td>${o.payment_status==="paid"?"مدفوع":"غير مدفوع"}</td>
    </tr>`).join("")||'<tr><td colspan="9" class="pos-channel-empty">لا توجد أوردرات حتى الآن.</td></tr>'}</tbody>
   </table></div>`;
  panel.querySelector("[data-channel-refresh]")?.addEventListener("click",async()=>{await loadConnectedFloorData();});
  return;
 }
 const isDelivery=tab==="دليفري";
 panel.innerHTML=`
  <div class="pos-channel-heading"><h2>${isDelivery?"أوردر دليفري جديد":"أوردر تيك أواي جديد"}</h2><button type="button" data-channel-refresh>تحديث المنيو والطلبات</button></div>
  <div class="pos-channel-workspace-grid">
   <section class="pos-channel-menu" aria-label="المنيو">
    <h3>المنيو</h3>
    <div class="pos-channel-products">${products.map(p=>`
     <button type="button" class="pos-channel-product" data-add-product="${esc(p.id)}">
      <span>${esc(p.name)}</span><strong>${fmt(p.price)} ج.م</strong><small>إضافة +</small>
     </button>`).join("")||'<p class="pos-channel-empty">المنيو غير متاح حاليًا.</p>'}</div>
   </section>
   <section class="pos-channel-cart" aria-label="الأوردر">
    <h3>الأوردر</h3>
    ${isDelivery?`<div class="pos-channel-customer-fields">
      <label>اسم العميل<input type="text" data-customer="name" value="${esc(channelCustomer.name)}" placeholder="اسم العميل" /></label>
      <label>رقم الموبايل<input type="tel" data-customer="phone" value="${esc(channelCustomer.phone)}" placeholder="01xxxxxxxxx" /></label>
      <label>عنوان التوصيل<input type="text" data-customer="address" value="${esc(channelCustomer.address)}" placeholder="عنوان التوصيل" /></label>
     </div>`:""}
    <div class="pos-channel-cart-table-wrap"><table class="pos-channel-cart-table">
     <thead><tr><th>الصنف</th><th>العدد</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
     <tbody>${channelCart.map(item=>`<tr>
      <td>${esc(item.name)}</td><td>${fmt(item.qty)}</td><td>${fmt(item.price)} ج.م</td><td>${fmt(item.qty*item.price)} ج.م</td>
      <td><button type="button" data-remove-cart="${esc(item.id)}" aria-label="حذف الصنف">×</button></td>
     </tr>`).join("")||'<tr><td colspan="5" class="pos-channel-empty">اختار الأصناف من المنيو على الشمال.</td></tr>'}</tbody>
    </table></div>
    <div class="pos-channel-cart-total"><span>الإجمالي</span><strong>${fmt(channelCart.reduce((sum,i)=>sum+i.qty*i.price,0))} ج.م</strong></div>
    <button type="button" class="pos-channel-submit" data-submit-channel-order>${isDelivery?"تأكيد أوردر الدليفري":"تأكيد أوردر التيك أواي"}</button>
   </section>
  </div>`;
 panel.querySelector("[data-channel-refresh]")?.addEventListener("click",async()=>{await loadConnectedMenu();await loadConnectedFloorData();});
 panel.querySelectorAll("[data-add-product]").forEach(button=>button.addEventListener("click",()=>{
  const product=products.find(p=>String(p.id)===button.dataset.addProduct);if(!product)return;
  const existing=channelCart.find(i=>String(i.id)===String(product.id));
  if(existing)existing.qty++;else channelCart.push({id:product.id,name:product.name,price:Number(product.price),qty:1});
  renderChannel();
 }));
 panel.querySelectorAll("[data-customer]").forEach(input=>input.addEventListener("input",()=>{channelCustomer[input.dataset.customer]=input.value;}));
 panel.querySelectorAll("[data-remove-cart]").forEach(button=>button.addEventListener("click",()=>{
  channelCart=channelCart.filter(i=>String(i.id)!==button.dataset.removeCart);renderChannel();
 }));
 panel.querySelector("[data-submit-channel-order]")?.addEventListener("click",()=>createChannelOrder(isDelivery?"delivery":"takeaway"));
}
async function createChannelOrder(orderType){
 if(!menuLoaded||!products.length){alert("المنيو لم يتم تحميله بعد.");return;}
 if(!channelCart.length){alert("اختار صنف واحد على الأقل من المنيو.");return;}
 if(orderType==="delivery"&&(!channelCustomer.name.trim()||!channelCustomer.phone.trim()||!channelCustomer.address.trim())){
  alert("اكتب اسم العميل ورقم الموبايل وعنوان التوصيل.");return;
 }
 const items=channelCart.map(item=>({menu_item_id:item.id,quantity:item.qty}));
 try{
  const response=await apiFetch("http://127.0.0.1:4317/api/orders",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({order_type:orderType,customer_name:orderType==="delivery"?channelCustomer.name.trim():"",phone:orderType==="delivery"?channelCustomer.phone.trim():"",address:orderType==="delivery"?channelCustomer.address.trim():"",items})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"تعذر إنشاء الأوردر.");
  channelCart=[];channelCustomer={name:"",phone:"",address:""};
  await loadConnectedFloorData();
  alert("تم حفظ الأوردر بنجاح.");
 }catch(error){alert(error.message);}
}
document.querySelectorAll(".tabs .tab").forEach(tab=>tab.addEventListener("click",()=>{
 document.querySelectorAll(".tabs .tab").forEach(x=>x.classList.remove("active"));
 tab.classList.add("active");
 renderChannel(tab.textContent.trim());
}));
// Load the current menu through the local API. The API refreshes its SQLite
// cache from Supabase when cloud access and read policies are available.
async function loadConnectedMenu(){
 try{
  const response=await apiFetch("http://127.0.0.1:4317/api/menu");
  if(!response.ok)throw new Error("Menu API returned "+response.status);
  const data=await response.json();
  products=Array.isArray(data.items)?data.items.map(item=>({id:item.id,name:item.name,price:Number(item.price_minor)/100})): [];
  menuLoaded=products.length>0;
  render();
 }catch(error){
  console.error("Could not load menu:",error);
 }
}
loadConnectedMenu().then(()=>loadConnectedFloorData());

async function loadConnectedFloorData(){
 try{
  const [tableResponse,orderResponse,reservationResponse]=await Promise.all([
   apiFetch("http://127.0.0.1:4317/api/tables"),
   apiFetch("http://127.0.0.1:4317/api/orders"),
   apiFetch("http://127.0.0.1:4317/api/reservations")
  ]);
  if(!tableResponse.ok||!orderResponse.ok||!reservationResponse.ok)return;
  const remoteTables=await tableResponse.json(),remoteOrders=await orderResponse.json(),remoteReservations=await reservationResponse.json();
  if(Array.isArray(remoteTables)&&remoteTables.length){
   tables.splice(0,tables.length,...remoteTables.filter(t=>t.is_active!==false).map(t=>({id:t.id,area:t.area||"indoor",number:Number(t.table_number),capacity:t.capacity,status:t.status})));
  }
  if(Array.isArray(remoteOrders)){
   const active=remoteOrders.filter(o=>!["cancelled","canceled"].includes(String(o.status||"").toLowerCase()));
   const dineIn=active.filter(o=>o.order_type==="dine_in"&&o.table_number!=null);
   orders.splice(0,orders.length,...dineIn.map(o=>({id:o.id,area:o.table_area||"indoor",number:Number(o.table_number),total:Number(o.total_minor||0)/100,discount_minor:Number(o.discount_minor||0),payment_method:o.payment_method||"cash",payment_status:o.payment_status||"unpaid",paid_at:o.paid_at||null,printed:["ready","delivered"].includes(o.status),closed:false,status:o.status,items:(o.items||[]).map(i=>({id:i.id,menu_item_id:i.menu_item_id,name:i.item_name_snapshot,qty:Number(i.quantity),price:Number(i.unit_price_minor||0)/100,notes:i.notes||""}))})));
   channelOrders.splice(0,channelOrders.length,...remoteOrders.map(o=>({id:o.id,number:o.order_number||o.id,channel:String(o.order_type||"").toLowerCase(),customer:o.customer_name||({takeaway:"طلب تيك أواي",delivery:"طلب دليفري",dine_in:"طلب صالة"}[normalizeChannelType(o.order_type)]||"طلب"),phone:o.phone||"",address:o.address||"",tableNumber:o.table_number,total:Number(o.total_minor||0)/100,status:o.status,payment_status:o.payment_status||"unpaid",items:(o.items||[]).map(i=>({name:i.item_name_snapshot||i.product_name||"صنف",qty:Number(i.quantity||1),price:Number(i.unit_price_minor||0)/100}))})));
  }
  if(Array.isArray(remoteReservations)){
   reservations.splice(0,reservations.length,...remoteReservations.filter(r=>["pending","confirmed"].includes(r.status)).map(r=>({area:r.area||"indoor",number:Number(r.table_number)})));
  }
  render();
  if(activeChannel!=="صالة المطعم")renderChannel(activeChannel);
 }catch(error){console.error("Could not load cloud floor data:",error);}
}


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
 const workspace=document.getElementById("admin-workspace"); if(!workspace)return;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const money=n=>Number(n||0).toLocaleString("ar-EG",{maximumFractionDigits:2})+" ج.م";
 async function api(path,opt={}){const r=await apiFetch("http://127.0.0.1:4317"+path,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"تعذر الاتصال بالخادم");return d;}
 const modules={
 tables:{title:"إعدادات الطاولات",db:"restaurant_tables",fields:[["table_number","رقم الطاولة"],["capacity","السعة"],["area","الصالة (indoor/outdoor)"],["status","الحالة"],["display_order","ترتيب العرض"],["is_active","مفعلة"]]},
 "recipe-items":{title:"مكونات الوصفات",db:"inventory_recipe_items",fields:[["recipe_id","معرف الوصفة"],["inventory_item_id","معرف الخامة"],["quantity","الكمية"],["unit_id","معرف الوحدة"],["notes","ملاحظات"]]},
 "purchase-items":{title:"تفاصيل المشتريات",db:"inventory_purchase_items",fields:[["purchase_id","معرف فاتورة الشراء"],["inventory_item_id","معرف الخامة"],["quantity","الكمية"],["unit_cost","تكلفة الوحدة"],["line_total","الإجمالي"]]},
 "employee-shifts":{title:"توزيع الورديات",db:"hr_employee_shift_assignments",fields:[["employee_id","معرف الموظف"],["shift_id","معرف الوردية"],["effective_from","من تاريخ"],["effective_to","إلى تاريخ"],["weekday","يوم الأسبوع"]]},
 "payroll-adjustments":{title:"إضافات وخصومات الرواتب",db:"hr_payroll_adjustments",fields:[["employee_id","معرف الموظف"],["adjustment_type","النوع (bonus/deduction/advance)"],["amount","المبلغ"],["reason","السبب"],["adjustment_date","التاريخ"]]},
 "payroll-items":{title:"تفاصيل كشوف المرتبات",db:"hr_payroll_items",fields:[["payroll_run_id","معرف كشف المرتبات"],["employee_id","معرف الموظف"],["basic_salary","الراتب الأساسي"],["overtime_amount","قيمة الإضافي"],["bonuses","المكافآت"],["deductions","الخصومات"],["net_salary","صافي الراتب"]]},
 "screen-categories":{title:"توزيع الفئات على شاشات التحضير",db:"preparation_screen_categories",fields:[["screen_id","معرف شاشة التحضير"],["category_id","معرف الفئة"]]},
 employees:{title:"الموظفون",db:"hr_employees",fields:[["full_name","اسم الموظف"],["phone","رقم الهاتف"],["job_title","الوظيفة"],["department","القسم"],["hire_date","تاريخ التعيين"],["employment_status","الحالة"],["monthly_salary","الراتب الشهري"],["overtime_hour_rate","سعر الساعة الإضافية"],["daily_work_hours","ساعات العمل اليومية"],["notes","ملاحظات"]]},
suppliers:{title:"الموردون",db:"inventory_suppliers",fields:[["name","اسم المورد"],["phone","رقم الهاتف"],["email","البريد الإلكتروني"],["address","العنوان"],["notes","ملاحظات"]]},
 cash:{title:"الخزينة وحركة النقدية",db:"cash_transactions",fields:[["transaction_type","نوع الحركة"],["amount","المبلغ"],["category","التصنيف"],["description","البيان"],["reference","رقم المرجع"]]},
 reservations:{title:"الحجوزات",db:"reservations",fields:[["customer_name","اسم العميل"],["customer_phone","رقم الهاتف"],["reservation_date","التاريخ"],["reservation_time","الوقت"],["guest_count","عدد الأفراد"],["table_id","الطاولة"],["table_number","رقم الطاولة"],["status","الحالة"],["notes","ملاحظات"]]},
 daily:{title:"إقفال اليومية",db:"business_days",fields:[["business_date","تاريخ اليومية"],["opening_cash","رصيد بداية اليوم"],["expected_cash","النقدية المتوقعة"],["counted_cash","النقدية الفعلية"],["status","الحالة"],["notes","ملاحظات"]]},
 inventory:{title:"المخزون والخامات",db:"inventory_items",fields:[["name","اسم الصنف"],["sku","كود الصنف"],["unit_id","معرف وحدة القياس"],["current_quantity","الرصيد الحالي"],["minimum_quantity","حد إعادة الطلب"],["average_cost","متوسط التكلفة"],["notes","ملاحظات"]]},
 purchases:{title:"المشتريات والموردين",db:"inventory_purchases",fields:[["supplier_id","معرف المورد"],["invoice_number","رقم الفاتورة"],["purchase_date","تاريخ الشراء"],["status","الحالة"],["subtotal","الإجمالي قبل الخصم"],["discount","الخصم"],["tax","الضريبة"],["total","الإجمالي النهائي"],["notes","ملاحظات"]]},
 recipes:{title:"الوصفات والتكلفة",db:"inventory_recipes",fields:[["product_id","معرف المنتج"],["name","اسم الوصفة"],["output_quantity","كمية الناتج"],["notes","ملاحظات"]]},
 attendance:{title:"الحضور والانصراف",db:"hr_attendance",fields:[["employee_id","معرف الموظف"],["shift_date","التاريخ"],["check_in","وقت الحضور"],["check_out","وقت الانصراف"],["worked_minutes","دقائق العمل"],["late_minutes","دقائق التأخير"],["overtime_minutes","الوقت الإضافي"],["attendance_status","الحالة"],["notes","ملاحظات"]]},
shifts:{title:"الورديات",db:"hr_shifts",fields:[["name","اسم الوردية"],["start_time","بداية الوردية"],["end_time","نهاية الوردية"],["crosses_midnight","تتجاوز منتصف الليل"],["break_minutes","الراحة بالدقائق"],["grace_minutes","سماح التأخير"],["is_flexible","مرنة"],["latest_check_in","آخر موعد حضور"],["is_active","نشطة"]]},
 movements:{title:"حركة المخزون",db:"inventory_movements",fields:[["inventory_item_id","معرف صنف المخزون"],["movement_type","نوع الحركة"],["quantity","الكمية"],["unit_cost","تكلفة الوحدة"],["total_cost","التكلفة الإجمالية"],["reference_type","نوع المرجع"],["reference_id","معرف المرجع"],["notes","ملاحظات"]]},
 units:{title:"وحدات القياس",db:"inventory_units",fields:[["name","اسم الوحدة"],["abbreviation","الاختصار"],["base_unit_id","معرف الوحدة الأساسية"],["conversion_factor","معامل التحويل"]]},
 prep:{title:"إعداد شاشات التحضير",db:"preparation_screens",fields:[["name","اسم الشاشة"],["slug","المعرف المختصر"],["station_type","نوع المحطة"],["display_order","ترتيب العرض"],["is_active","مفعلة"]]},
 leave:{title:"أرصدة الإجازات",db:"hr_leave_balances",fields:[["employee_id","معرف الموظف"],["leave_year","السنة"],["entitled_days","الرصيد المستحق"],["used_days","المستخدم"]]},
 payroll:{title:"المرتبات",db:"hr_payroll_runs",fields:[["period_start","بداية الفترة"],["period_end","نهاية الفترة"],["total_amount","إجمالي المرتبات"],["status","الحالة"],["notes","ملاحظات"]]},
 printers:{title:"الطابعات وشاشات التحضير",db:"printers",fields:[["printer_key","المعرف البرمجي"],["name","اسم الطابعة"],["printer_type","نوع الطابعة"],["connection_type","نوع الاتصال"],["ip_address","عنوان IP"],["port","المنفذ"],["paper_width_mm","عرض الورق"],["is_active","مفعلة"],["notes","ملاحظات"]]}
 };
 const heading=(t,sub,action="")=>'<div class="admin-page-heading"><div><h1>'+t+'</h1><p>'+sub+'</p></div>'+action+'</div>';
 const table=(heads,rows)=>'<div class="admin-table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
 async function menuPage(kind){
  const d=await api("/api/admin/menu"),cat=kind==="categories",list=cat?d.categories:d.products;
  const stationLabel=value=>({kitchen:"المطبخ",hall:"الصالة",bar:"المشروبات"}[value]||"المطبخ");
  const rows=list.map(x=>cat
   ? '<tr><td>'+esc(x.name)+'</td><td>'+Number(x.sort_order||0)+'</td><td><button class="admin-small-btn" data-edit="'+esc(x.id)+'">تعديل</button> <button class="admin-small-btn" data-delete="'+esc(x.id)+'">حذف</button></td></tr>'
   : '<tr><td>'+esc(x.name)+'</td><td>'+esc(d.categories.find(c=>String(c.id)===String(x.category_id))?.name||"—")+'</td><td>'+esc(stationLabel(x.preparation_station))+'</td><td>'+money(x.price_minor/100)+'</td><td><span class="admin-status '+(x.is_available===false?"is-off":"is-on")+'">'+(x.is_available===false?"غير متاح":"متاح")+'</span></td><td><button class="admin-small-btn" data-edit="'+esc(x.id)+'">تعديل</button> <button class="admin-small-btn" data-delete="'+esc(x.id)+'">حذف</button></td></tr>'
  ).join("");
  workspace.innerHTML=heading(cat?"أقسام المنيو":"أصناف المنيو",cat?"أضف أقسام المطعم ورتبها":"تحكم في الأصناف والأسعار والقسم ومكان التحضير لكل صنف بشكل مستقل",'<button class="admin-primary" id="new">+ إضافة '+(cat?"قسم":"صنف")+'</button>')+
   table(cat?["اسم القسم","الترتيب","إجراءات"]:["الصنف","القسم","مكان التحضير","السعر","التوفر","إجراءات"],rows||'<tr><td colspan="6">لا توجد بيانات</td></tr>');
  workspace.querySelector("#new").onclick=()=>editMenu(kind,null,d);
  workspace.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editMenu(kind,list.find(x=>String(x.id)===b.dataset.edit),d));
  workspace.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
   const item=list.find(x=>String(x.id)===b.dataset.delete);
   if(!item||!confirm(cat?"حذف القسم؟ لا يمكن حذف قسم يحتوي على أصناف.":"حذف الصنف من المنيو؟"))return;
   try{await api("/api/admin/"+(cat?"categories/":"products/")+encodeURIComponent(item.id),{method:"DELETE"});await menuPage(kind);}
   catch(error){alert(error.message);}
  });
 }
 async function editMenu(kind,item,d){
  const cat=kind==="categories";
  const formTitle=(item?"تعديل ":"إضافة ")+(cat?"قسم":"صنف");
  const categoryOptions=(d.categories||[]).map(c=>'<option value="'+esc(c.id)+'" '+(String(item?.category_id||"")===String(c.id)?"selected":"")+'>'+esc(c.name)+'</option>').join("");
  workspace.innerHTML=heading(formTitle,cat?"أنشئ قسمًا جديدًا أو عدّل اسم وترتيب القسم":"حدد القسم ومكان التحضير لهذا الصنف بشكل مستقل")+
   '<form id="menu-edit-form" class="admin-panel admin-form-card">'+
   '<div class="admin-form-grid">'+
   '<label class="admin-form-field"><span>'+(cat?"اسم القسم":"اسم الصنف")+'</span><input name="name" maxlength="150" required value="'+esc(item?.name||"")+'" placeholder="'+(cat?"مثال: فطائر":"مثال: فطير مشلتت")+'"></label>'+
   (cat
    ? '<label class="admin-form-field"><span>ترتيب العرض</span><input name="sort_order" type="number" min="0" step="1" value="'+Number(item?.sort_order||0)+'"></label>'
    : '<label class="admin-form-field"><span>القسم التابع له</span><select name="category_id" required><option value="">اختر القسم</option>'+categoryOptions+'</select></label>'+
      '<label class="admin-form-field"><span>مكان التحضير</span><select name="preparation_station" required><option value="kitchen" '+((item?.preparation_station||"kitchen")==="kitchen"?"selected":"")+'>المطبخ</option><option value="hall" '+(item?.preparation_station==="hall"?"selected":"")+'>الصالة</option><option value="bar" '+(item?.preparation_station==="bar"?"selected":"")+'>المشروبات</option></select></label>'+
      '<label class="admin-form-field"><span>السعر بالجنيه</span><input name="price" type="number" min="0" step="0.01" required value="'+(item?Number(item.price_minor||0)/100:"")+'" placeholder="0.00"></label>'+
      '<label class="admin-form-field"><span>الوصف</span><textarea name="description" rows="3" maxlength="500" placeholder="وصف اختياري">'+esc(item?.description||"")+'</textarea></label>'+
      '<label class="admin-form-field admin-form-check"><input name="is_available" type="checkbox" '+(item?.is_available===false?"":"checked")+'><span>الصنف متاح للبيع</span></label>'
   )+
   '</div><div class="admin-form-actions"><button class="admin-primary" type="submit">حفظ</button><button class="admin-small-btn" type="button" id="cancel-menu-edit">إلغاء</button></div><p class="admin-error" id="menu-form-error" role="alert"></p></form>';
  const form=workspace.querySelector("#menu-edit-form");
  workspace.querySelector("#cancel-menu-edit").onclick=()=>menuPage(kind);
  form.onsubmit=async event=>{
   event.preventDefault();
   const fd=new FormData(form),name=String(fd.get("name")||"").trim();
   const body={name};
   if(cat) body.sort_order=Number(fd.get("sort_order")||0);
   else {
    body.category_id=String(fd.get("category_id")||"");
    body.preparation_station=String(fd.get("preparation_station")||"kitchen");
    body.price=Number(fd.get("price"));
    body.description=String(fd.get("description")||"");
    body.is_available=fd.get("is_available")==="on";
   }
   const path=(cat?"/api/admin/categories":"/api/admin/products")+(item?"/"+encodeURIComponent(item.id):"");
   const submit=form.querySelector('button[type="submit"]');
   submit.disabled=true;submit.textContent="جاري الحفظ...";
   try{
    await api(path,{method:item?"PATCH":"POST",body:JSON.stringify(body)});
    await menuPage(kind);
   }catch(error){
    const message=workspace.querySelector("#menu-form-error");
    if(message)message.textContent=error.message;
    submit.disabled=false;submit.textContent="حفظ";
   }
  };
 }
 async function recordsPage(key){const m=modules[key],rows=await api("/api/admin/records/"+m.db),fields=m.fields;
 const body=rows.map(r=>'<tr>'+fields.map(f=>'<td>'+esc(r[f[0]]??"—")+'</td>').join("")+'<td><button class="admin-small-btn" data-edit="'+r.id+'">تعديل</button> <button class="admin-small-btn" data-del="'+r.id+'">حذف</button></td></tr>').join("");
 workspace.innerHTML=heading(m.title,"إدارة وحفظ البيانات",'<button class="admin-primary" id="new">+ إضافة سجل</button>')+table(fields.map(f=>f[1]).concat(["إجراءات"]),body||'<tr><td colspan="'+(fields.length+1)+'">لا توجد سجلات حتى الآن</td></tr>');
 workspace.querySelector("#new").onclick=()=>editRecord(key,null);
 workspace.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editRecord(key,rows.find(r=>r.id===b.dataset.edit)));
 workspace.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("تأكيد حذف السجل؟"))return;try{await api("/api/admin/records/"+m.db+"/"+b.dataset.del,{method:"DELETE"});recordsPage(key);}catch(e){alert(e.message);}});
 }
 async function editRecord(key,row){
  const m=modules[key];
  const relations={employee_id:["hr_employees","full_name"],shift_id:["hr_shifts","name"],unit_id:["inventory_units","name"],base_unit_id:["inventory_units","name"],inventory_item_id:["inventory_items","name"],recipe_id:["inventory_recipes","name"],purchase_id:["inventory_purchases","invoice_number"],supplier_id:["inventory_suppliers","name"],screen_id:["preparation_screens","name"],payroll_run_id:["hr_payroll_runs","period_start"],table_id:["restaurant_tables","table_number"]};
  let menu=null;
  const controls=[];
  for(const field of m.fields){
   const keyName=field[0],label=field[1],value=row?.[keyName]??"";
   const boolean=["is_active","is_flexible","crosses_midnight"].includes(keyName);
   const numeric=["table_number","capacity","display_order","guest_count","party_size","opening_cash","expected_cash","counted_cash","quantity","current_quantity","minimum_quantity","average_cost","subtotal","discount","tax","total","output_quantity","unit_cost","line_total","yield_quantity","monthly_salary","overtime_hour_rate","daily_work_hours","break_minutes","grace_minutes","worked_minutes","late_minutes","overtime_minutes","leave_year","entitled_days","used_days","amount","total_amount","conversion_factor","port","paper_width_mm","basic_salary","overtime_amount","bonuses","deductions","net_salary"].includes(keyName);
   const date=["business_date","hire_date","purchase_date","adjustment_date","shift_date","effective_from","effective_to","reservation_date","period_start","period_end"].includes(keyName);
   const time=["reservation_time","start_time","end_time","latest_check_in"].includes(keyName);
   const timestamp=["check_in","check_out"].includes(keyName);
   const longText=["notes","description","address","reason"].includes(keyName);
   let relation=relations[keyName],options=null;
   if(keyName==="category_id"||keyName==="product_id"){
    if(!menu)menu=await api("/api/admin/menu");
    options=keyName==="category_id"?(menu.categories||[]).map(x=>({id:x.id,label:x.name})):(menu.products||[]).map(x=>({id:x.id,label:x.name}));
   }else if(relation){
    try{const list=await api("/api/admin/records/"+relation[0]);options=(list||[]).map(x=>({id:x.id,label:x[relation[1]]||x.name||x.id}));}catch(_){options=[];}
   }
   let control="";
   if(boolean) control='<label class="admin-form-check"><input type="checkbox" name="'+keyName+'" '+((value===""?["is_active"].includes(keyName):value===true||value==="true"||value===1)?"checked":"")+'> نعم</label>';
   else if(options) control='<select name="'+keyName+'"><option value="">— اختر —</option>'+options.map(o=>'<option value="'+esc(o.id)+'" '+(String(value)===String(o.id)?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select>';
   else if(longText) control='<textarea name="'+keyName+'">'+esc(value)+'</textarea>';
   else control='<input name="'+keyName+'" type="'+(date?"date":time?"time":timestamp?"datetime-local":numeric?"number":"text")+'" '+(numeric?'step="any"':'')+' value="'+esc(value)+'">';
   controls.push('<label class="admin-form-field">'+esc(label)+control+'</label>');
  }
  workspace.innerHTML=heading(row?"تعديل سجل":"إضافة سجل",m.title)+'<form id="record-form" class="admin-form-card"><div class="admin-form-grid">'+controls.join("")+'</div><p id="record-error" class="admin-form-error"></p><div class="admin-form-actions"><button class="admin-primary" type="submit">حفظ البيانات</button><button class="admin-small-btn" type="button" id="cancel-record">إلغاء</button></div></form>';
  workspace.querySelector("#cancel-record").onclick=()=>recordsPage(key);
  workspace.querySelector("#record-form").onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,body={};
   for(const field of m.fields){const name=field[0],el=form.elements[name];if(!el)continue;if(el.type==="checkbox")body[name]=el.checked;else if(el.value!=="")body[name]=el.type==="number"?Number(el.value):el.value;}
   try{await api("/api/admin/records/"+m.db+(row?"/"+row.id:""),{method:row?"PATCH":"POST",body:JSON.stringify(body)});await recordsPage(key);}
   catch(error){workspace.querySelector("#record-error").textContent=error.message;}
  };
 }
 async function simplePage(key){if(key==="orders"||key==="sales"){const rows=await api("/api/admin/orders");workspace.innerHTML=heading("الطلبات","الطلبات المسجلة على الجهاز")+table(["رقم الطلب","النوع","الحالة","الإجمالي","التاريخ","المزامنة"],rows.map(o=>'<tr><td>'+esc(o.order_number)+'</td><td>'+esc(o.order_type)+'</td><td>'+esc(o.status)+'</td><td>'+money(o.total_minor/100)+'</td><td>'+new Date(o.created_at).toLocaleString("ar-EG")+'</td><td>'+esc(o.sync_status)+'</td></tr>').join("")||'<tr><td colspan="6">لا توجد طلبات</td></tr>');return;}
 if(key==="kitchen"){const rows=await api("/api/orders");workspace.innerHTML=heading("شاشة المطبخ والبار","تحديث حالات الطلبات")+table(["رقم الطلب","الأصناف","الحالة"],rows.map(o=>'<tr><td>'+esc(o.order_number)+'</td><td>'+o.items.map(i=>esc(i.item_name_snapshot)+" × "+i.quantity).join("، ")+'</td><td><select data-status="'+o.id+'">'+["pending","preparing","ready","delivered","cancelled"].map(s=>'<option value="'+s+'" '+(s===o.status?"selected":"")+'>'+s+'</option>').join("")+'</select></td></tr>').join("")||'<tr><td colspan="3">لا توجد طلبات</td></tr>');workspace.querySelectorAll("[data-status]").forEach(s=>s.onchange=async()=>{try{await api("/api/orders/"+s.dataset.status+"/status",{method:"PATCH",body:JSON.stringify({status:s.value})});}catch(e){alert(e.message);}});return;}
 if(key==="settings"){
  const [cloud,settings]=await Promise.all([api("/api/cloud/status").catch(e=>({connected:false,message:e.message})),api("/api/admin/restaurant-settings")]);
  workspace.innerHTML=heading("إعدادات النظام","إعدادات الصالة والاتصال")+'<div class="admin-panel"><h2>حالة الاتصال</h2><p>Supabase: '+(cloud.connected?"متصل":"غير متصل")+'</p><p>'+esc(cloud.message||"")+'</p></div><form id="restaurant-settings" class="admin-form-card"><h2>إعدادات صالة المطعم</h2><div class="admin-form-grid"><label class="admin-form-field">عدد الطاولات الداخلية<input name="indoor_tables" type="number" min="0" step="1" value="'+settings.indoor_tables+'"></label><label class="admin-form-field">عدد الطاولات الخارجية<input name="outdoor_tables" type="number" min="0" step="1" value="'+settings.outdoor_tables+'"></label><label class="admin-form-field">عدد المقاعد لكل طاولة<input name="seats_per_table" type="number" min="1" step="1" value="'+settings.seats_per_table+'"></label></div><p id="settings-message" class="admin-form-error"></p><div class="admin-form-actions"><button class="admin-primary" type="submit">حفظ الإعدادات</button></div></form>';
  workspace.querySelector("#restaurant-settings").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api("/api/admin/restaurant-settings",{method:"PUT",body:JSON.stringify({indoor_tables:Number(fd.get("indoor_tables")),outdoor_tables:Number(fd.get("outdoor_tables")),seats_per_table:Number(fd.get("seats_per_table"))})});workspace.querySelector("#settings-message").textContent="تم حفظ الإعدادات.";await loadConnectedFloorData();}catch(err){workspace.querySelector("#settings-message").textContent=err.message;}};
  return;
 }
 if(key==="reports"){const d=await api("/api/admin/summary");workspace.innerHTML=heading("التقارير التفصيلية","ملخص الأداء التشغيلي")+'<div class="admin-kpis"><article><small>الفئات</small><strong>'+d.categories+'</strong></article><article><small>المنتجات</small><strong>'+d.products+'</strong></article><article><small>الطلبات</small><strong>'+d.orders+'</strong></article><article><small>المبيعات المسجلة</small><strong>'+money(d.sales_minor/100)+'</strong></article></div>';return;}
 
 }
 async function dashboard(){const d=await api("/api/admin/summary"),cloud=await api("/api/cloud/status").catch(()=>({connected:false}));workspace.innerHTML=heading("لوحة الإدارة","ملخص تشغيل النظام")+'<div class="admin-kpis"><article><small>الفئات</small><strong>'+d.categories+'</strong></article><article><small>المنتجات</small><strong>'+d.products+'</strong></article><article><small>الطلبات</small><strong>'+d.orders+'</strong></article><article><small>إجمالي المبيعات</small><strong>'+money(d.sales_minor/100)+'</strong></article></div><div class="admin-panel"><h2>حالة النظام</h2><p>قاعدة البيانات المحلية متصلة — Supabase: '+(cloud.connected?"متصل":"غير متصل أو يحتاج إعداد مفتاح ومصادقة")+'</p><p>واجهة نقطة البيع لم يتم تعديل تصميمها.</p></div>';}
 async function render(section="dashboard"){workspace.innerHTML='<div class="admin-loading">جاري التحميل...</div>';try{if(section==="dashboard")await dashboard();else if(["menu","products","categories"].includes(section))await menuPage(section==="categories"?"categories":"products");else if(modules[section])await recordsPage(section);else await simplePage(section);}catch(e){workspace.innerHTML=heading("تعذر تحميل القسم",esc(e.message))+'<button class="admin-primary" id="retry">إعادة المحاولة</button>';workspace.querySelector("#retry").onclick=()=>render(section);}}

 async function guardedRender(section="dashboard"){
  try{
   const session=await api("/api/auth/session");
   if(!session.authenticated){
    workspace.innerHTML=heading("تسجيل الدخول","استخدم حسابك الإداري في نظام أركان")+'<form id="admin-login" class="admin-panel" style="max-width:460px;display:grid;gap:14px"><label>البريد الإلكتروني<input name="email" type="email" required autocomplete="username" style="width:100%;padding:12px;margin-top:6px"></label><label>كلمة المرور<input name="password" type="password" required autocomplete="current-password" style="width:100%;padding:12px;margin-top:6px"></label><button class="admin-primary" type="submit">دخول</button><p id="login-error" class="admin-error"></p></form>';
    workspace.querySelector("#admin-login").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:fd.get("email"),password:fd.get("password")})});await loadConnectedFloorData();guardedRender(section);}catch(err){workspace.querySelector("#login-error").textContent=err.message;}};
    return;
   }
   await render(section);
   const bar=document.createElement("div");bar.style.cssText="display:flex;justify-content:flex-end;margin-bottom:12px";
   bar.innerHTML='<button class="admin-small-btn" id="admin-logout">تسجيل الخروج</button>';workspace.prepend(bar);
   workspace.querySelector("#admin-logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});guardedRender("dashboard");};
  }catch(e){workspace.innerHTML=heading("تعذر التحقق من الدخول",esc(e.message));}
 }
 const nav=document.getElementById("admin-nav");
 const sidebarTitle=document.getElementById("admin-sidebar-title");
 const groups={
  sales:{title:"المبيعات",items:[["orders","الطلبات","🧾"],["sales","المبيعات","💰"],["reports","التقارير","📊"],["cash","الخزينة","💳"],["daily","إقفال اليومية","📒"]]},
  menu:{title:"إدارة المنيو",items:[["menu","إدارة المنيو","🍽"],["products","المنتجات","📦"],["categories","الفئات","▤"]]},
  inventory:{title:"إدارة المخزن",items:[["inventory","أصناف المخزون","📦"],["movements","حركة المخزون","🔄"],["units","وحدات القياس","⚖"],["purchases","المشتريات","🚚"],["purchase-items","تفاصيل المشتريات","🧾"],["suppliers","الموردون","🏭"],["recipes","الوصفات والتكلفة","📋"],["recipe-items","مكونات الوصفات","🧩"]]},
  hr:{title:"الموارد البشرية",items:[["employees","الموظفون","👥"],["attendance","الحضور والانصراف","⏱"],["shifts","الورديات","🗓"],["employee-shifts","توزيع الورديات","📅"],["leave","أرصدة الإجازات","🏖"],["payroll","المرتبات","💵"],["payroll-items","تفاصيل كشوف المرتبات","🧾"],["payroll-adjustments","إضافات وخصومات الرواتب","➕"]]},
  operations:{title:"إدارة التشغيل",items:[["tables","إعدادات الطاولات","🪑"],["reservations","الحجوزات","📅"],["kitchen","شاشة المطبخ والبار","👨‍🍳"],["prep","شاشات التحضير","🍳"],["screen-categories","فئات شاشات التحضير","🧩"],["printers","الطابعات","🖨"]]}
 };
 function showMainNavigation(){
  sidebarTitle.textContent="القائمة الرئيسية";
  nav.innerHTML='<button type="button" data-admin-home="dashboard" class="admin-nav-item"><span>▦</span> لوحة الإدارة</button>'+
   Object.entries(groups).map(([key,g])=>'<button type="button" data-admin-group="'+key+'" class="admin-nav-item"><span>'+({sales:"💰",menu:"🍽",inventory:"📦",hr:"👥",operations:"⚙"}[key])+'</span> '+g.title+'</button>').join("")+
   '<button type="button" data-admin-home="settings" class="admin-nav-item"><span>🔧</span> الإعدادات</button><div class="admin-nav-spacer"></div><button type="button" id="back-to-pos" class="admin-nav-item admin-pos-return"><span>↩</span> نقطة البيع</button>';
  nav.querySelectorAll("[data-admin-group]").forEach(b=>b.onclick=()=>showGroup(b.dataset.adminGroup));
  nav.querySelectorAll("[data-admin-home]").forEach(b=>b.onclick=()=>{showMainNavigation();setActiveHome(b.dataset.adminHome);guardedRender(b.dataset.adminHome);});
  document.getElementById("back-to-pos").onclick=()=>{adminPage.hidden=true;posPage.hidden=false;window.scrollTo(0,0);};
 }
 function setActiveHome(section){
  nav.querySelectorAll(".admin-nav-item").forEach(x=>x.classList.toggle("active",x.dataset.adminHome===section));
 }
 function showGroup(key){
  const group=groups[key];if(!group)return;
  sidebarTitle.textContent=group.title;
  nav.innerHTML='<button type="button" class="admin-nav-item admin-nav-back" id="admin-nav-back"><span>→</span> القائمة الرئيسية</button>'+
   '<div class="admin-nav-group-label">'+group.title+'</div>'+
   group.items.map(([section,label,icon],i)=>'<button type="button" data-admin-section="'+section+'" class="admin-nav-item '+(i===0?"active":"")+'"><span>'+icon+'</span> '+label+'</button>').join("")+
   '<div class="admin-nav-spacer"></div><button type="button" id="back-to-pos" class="admin-nav-item admin-pos-return"><span>↩</span> نقطة البيع</button>';
  document.getElementById("admin-nav-back").onclick=showMainNavigation;
  nav.querySelectorAll("[data-admin-section]").forEach(b=>b.onclick=()=>{
   nav.querySelectorAll("[data-admin-section]").forEach(x=>x.classList.toggle("active",x===b));
   guardedRender(b.dataset.adminSection);
  });
  document.getElementById("back-to-pos").onclick=()=>{adminPage.hidden=true;posPage.hidden=false;window.scrollTo(0,0);};
  guardedRender(group.items[0][0]);
 }
 showMainNavigation();
 document.getElementById("open-admin")?.addEventListener("click",()=>{showMainNavigation();guardedRender("dashboard");});
 guardedRender();
})();
