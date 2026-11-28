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



