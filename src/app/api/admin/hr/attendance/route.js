import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function service(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})}
async function admin(request){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return {response:NextResponse.json({error:"سجل دخول المدير أولاً."},{status:401})};
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data,error}=await auth.auth.getUser(token);if(error||!data?.user)return {response:NextResponse.json({error:"جلسة غير صالحة."},{status:401})};if(data.user.app_metadata?.account_type==="hr_employee")return {response:NextResponse.json({error:"حساب HR مخصص للحضور والانصراف الشخصي فقط."},{status:403})};
 const db=service(),{data:row}=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
 return row?{db,user:data.user}:{response:NextResponse.json({error:"غير مسموح."},{status:403})};
}
function cairoToUtc(date,time){const [y,m,d]=date.split("-").map(Number),[h,mi]=String(time).slice(0,5).split(":").map(Number),target=Date.UTC(y,m-1,d,h,mi);let g=target;for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(g)).map(x=>[x.type,x.value]));g+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)}return new Date(g)}
function dateAdd(s,n){const d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export async function GET(request){
 try{
  const a=await admin(request);if(a.response)return a.response;const db=a.db;
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const requestedMonth=new URL(request.url).searchParams.get("month")||today.slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(requestedMonth))return NextResponse.json({error:"اختار شهرًا صحيحًا."},{status:400});
  const [year,month]=requestedMonth.split("-").map(Number);
  if(month<1||month>12)return NextResponse.json({error:"اختار شهرًا صحيحًا."},{status:400});
  const from=requestedMonth+"-01";
  const to=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const [{data:employees,error:er},{data:rows,error:re}]=await Promise.all([
   db.from("hr_employees").select("id,full_name,daily_work_hours,hire_date,employment_status,termination_date,monthly_salary,job_title,department").order("full_name"),
   db.from("hr_attendance").select("*,hr_employees(full_name,job_title,department,monthly_salary,daily_work_hours)").gte("shift_date",from).lte("shift_date",to).order("shift_date",{ascending:true}),
  ]);
  if(re)throw re;if(er)throw er;
  const registerEmployees=(employees||[]).filter(e=>e.hire_date<=to&&(!e.termination_date||e.termination_date>=from)&&(e.employment_status==="active"||(rows||[]).some(r=>r.employee_id===e.id)));
  if(registerEmployees.length){
   const registerRows=registerEmployees.map(e=>({employee_id:e.id,month_start:from,month_end:to}));
   const {error:registerError}=await db.from("hr_attendance_monthly_registers").upsert(registerRows,{onConflict:"employee_id,month_start",ignoreDuplicates:true});
   if(registerError)throw registerError;
  }
  const {data:registers,error:registerReadError}=await db.from("hr_attendance_monthly_registers").select("id,employee_id,month_start,month_end,created_at").eq("month_start",from);
  if(registerReadError)throw registerReadError;
  return NextResponse.json({month:requestedMonth,monthStart:from,monthEnd:to,attendance:rows||[],employees:employees||[],registers:registers||[]});
 }catch(e){console.error("HR attendance GET",e);return NextResponse.json({error:e.message||"تعذر تحميل كشف الحضور الشهري."},{status:500})}
}
export async function PATCH(request){
 try{
  const a=await admin(request);if(a.response)return a.response;
  const b=await request.json(),id=String(b.id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"سجل غير صحيح."},{status:400});
  const allowed=["present","absent","unpaid_leave","excused","holiday"];
  const {data:current,error:readError}=await a.db.from("hr_attendance").select("*").eq("id",id).maybeSingle();
  if(readError)throw readError;
  if(!current)return NextResponse.json({error:"سجل الحضور غير موجود."},{status:404});
  const updates={updated_at:new Date().toISOString(),reviewed_by:a.user.id,reviewed_at:new Date().toISOString()};
  if(b.attendance_status!==undefined){
   if(!allowed.includes(b.attendance_status))return NextResponse.json({error:"حالة الحضور غير صحيحة."},{status:400});
   updates.attendance_status=b.attendance_status;
  }
  const parseLocal=(value)=>{
   if(value===null||value==="")return null;
   if(typeof value!=="string"||!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(value))throw new Error("صيغة التاريخ والوقت غير صحيحة.");
   const [date,time]=value.split("T");return cairoToUtc(date,time).toISOString();
  };
  const changesIn=Object.prototype.hasOwnProperty.call(b,"check_in_local");
  const changesOut=Object.prototype.hasOwnProperty.call(b,"check_out_local");
  if(changesIn)updates.check_in_at=parseLocal(b.check_in_local);
  if(changesOut)updates.check_out_at=parseLocal(b.check_out_local);
  const checkIn=changesIn?updates.check_in_at:current.check_in_at;
  const checkOut=changesOut?updates.check_out_at:current.check_out_at;
  if(checkOut&&!checkIn)return NextResponse.json({error:"لا يمكن تسجيل الانصراف بدون وقت حضور."},{status:400});
  if(checkIn&&checkOut&&new Date(checkOut)<=new Date(checkIn))return NextResponse.json({error:"وقت الانصراف لازم يكون بعد وقت الحضور."},{status:400});
  if(changesIn)updates.check_in_method="manager";
  if(changesOut)updates.check_out_method="manager";
  if(changesIn&&checkIn&&b.attendance_status===undefined)updates.attendance_status="present";
  if(changesIn||changesOut||b.attendance_status!==undefined){
   let worked=0,overtime=0,shortage=0;
   if(updates.attendance_status==="present"&&checkIn&&checkOut){
    const elapsed=Math.max(0,Math.round((new Date(checkOut)-new Date(checkIn))/60000));
    worked=elapsed;
    const {data:emp,error:empError}=await a.db.from("hr_employees").select("daily_work_hours").eq("id",current.employee_id).maybeSingle();
    if(empError)throw empError;
    const planned=Math.round(Number(emp?.daily_work_hours||8)*60);
    overtime=Math.max(0,worked-planned);
    shortage=Math.max(0,planned-worked);
   }
   updates.worked_minutes=worked;updates.overtime_minutes=overtime;updates.shortage_minutes=shortage;
   updates.late_minutes=0;
  }
  if(b.notes!==undefined)updates.notes=String(b.notes||"").slice(0,1000)||null;
  else if(changesIn||changesOut)updates.notes=[current.notes,"تعديل وقت الحضور/الانصراف يدويًا بواسطة المدير"].filter(Boolean).join("\\n").slice(0,1000);
  const {data,error}=await a.db.from("hr_attendance").update(updates).eq("id",id).select("*").single();
  if(error)throw error;
  return NextResponse.json({attendance:data});
 }catch(e){console.error("HR attendance PATCH",e);return NextResponse.json({error:e.message||"تعذر تحديث السجل."},{status:400})}
}
export async function POST(request){
 try{
  const a=await admin(request);if(a.response)return a.response;
  const b=await request.json(),employee_id=String(b.employee_id||""),shift_date=String(b.shift_date||"");
  if(!/^[0-9a-f-]{36}$/i.test(employee_id)||!/^(\d{4})-(\d{2})-(\d{2})$/.test(shift_date))
   return NextResponse.json({error:"اختار الموظف والتاريخ."},{status:400});
  const status="absent";
  const {data,error}=await a.db.rpc("hr_review_attendance",{
   p_attendance_id:null,p_employee_id:employee_id,p_shift_date:shift_date,p_status:status,
   p_notes:String(b.notes||"").slice(0,1000),p_reviewed_by:a.user.id
  });
  if(error){
   const statusCode=error.code==="23514"?409:400;
   return NextResponse.json({error:error.message||"تعذر حفظ الحالة."},{status:statusCode});
  }
  return NextResponse.json({attendance:data},{status:201});
 }catch(e){console.error("HR attendance POST",e);return NextResponse.json({error:e.message||"تعذر حفظ الحالة."},{status:400})}
}
