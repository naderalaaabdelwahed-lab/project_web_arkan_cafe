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
   ? '<tr><td>'+esc(x.name)+'</td><td>'+Number(x.sort_order||0)+'</td><td><button class="admin-small-btn" data-edit="'+esc(x.id)+'">تعديل</button> <button class="admin-small-btn" data-delete="'+esc(x.id)+'">'+(cat?"حذف":"إخفاء")+'</button></td></tr>'
   : '<tr><td>'+esc(x.name)+'</td><td>'+esc(d.categories.find(c=>String(c.id)===String(x.category_id))?.name||"—")+'</td><td>'+esc(stationLabel(x.preparation_station))+'</td><td>'+money(x.price_minor/100)+'</td><td><span class="admin-status '+(x.is_available===false?"is-off":"is-on")+'">'+(x.is_available===false?"غير متاح":"متاح")+'</span></td><td><button class="admin-small-btn" data-edit="'+esc(x.id)+'">تعديل</button> <button class="admin-small-btn" data-delete="'+esc(x.id)+'">حذف</button></td></tr>'
  ).join("");
  workspace.innerHTML=heading(cat?"أقسام المنيو":"أصناف المنيو",cat?"أضف أقسام المطعم ورتبها":"تحكم في الأصناف والأسعار والقسم ومكان التحضير لكل صنف بشكل مستقل",'<button class="admin-primary" id="new">+ إضافة '+(cat?"قسم":"صنف")+'</button>')+
   table(cat?["اسم القسم","الترتيب","إجراءات"]:["الصنف","القسم","مكان التحضير","السعر","التوفر","إجراءات"],rows||'<tr><td colspan="6">لا توجد بيانات</td></tr>');
  workspace.querySelector("#new").onclick=()=>editMenu(kind,null,d);
  workspace.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editMenu(kind,list.find(x=>String(x.id)===b.dataset.edit),d));
  workspace.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
   const item=list.find(x=>String(x.id)===b.dataset.delete);
   if(!item||!confirm(cat?"حذف القسم؟ لا يمكن حذف قسم يحتوي على أصناف.":"إخفاء الصنف من البيع؟ يمكنك إتاحته مرة أخرى بالتعديل."))return;
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
