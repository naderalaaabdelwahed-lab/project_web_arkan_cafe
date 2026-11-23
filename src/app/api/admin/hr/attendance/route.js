import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function service(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})}
async function admin(request){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return {response:NextResponse.json({error:"سجل دخول المدير أولاً."},{status:401})};
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data,error}=await auth.auth.getUser(token);if(error||!data?.user)return {response:NextResponse.json({error:"جلسة غير صالحة."},{status:401})};
 const db=service(),{data:row}=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
 return row?{db,user:data.user}:{response:NextResponse.json({error:"غير مسموح."},{status:403})};
}
function cairoToUtc(date,time){const [y,m,d]=date.split("-").map(Number),[h,mi]=String(time).slice(0,5).split(":").map(Number),target=Date.UTC(y,m-1,d,h,mi);let g=target;for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(g)).map(x=>[x.type,x.value]));g+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)}return new Date(g)}
function dateAdd(s,n){const d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export async function GET(request){
 try{
  const a=await admin(request);if(a.response)return a.response;const db=a.db;
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const from=dateAdd(today,-30);
  const [{data:assignments,error:ae},{data:existing,error:ee}]=await Promise.all([
   db.from("hr_employee_shift_assignments").select("employee_id,shift_id,effective_from,effective_to,weekday,hr_shifts(*)").lte("effective_from",today),
   db.from("hr_attendance").select("id,employee_id,shift_date").gte("shift_date",from).lte("shift_date",today)
  ]);if(ae)throw ae;if(ee)throw ee;
  const seen=new Set((existing||[]).map(x=>x.employee_id+"|"+x.shift_date)),pending=[];
  for(let offset=30;offset>=0;offset--){const date=dateAdd(today,-offset),weekday=new Date(date+"T00:00:00Z").getUTCDay();
   for(const x of assignments||[]){const s=x.hr_shifts;if(!s?.is_active||x.effective_from>date||(x.effective_to&&x.effective_to<date)||(x.weekday!==null&&x.weekday!==weekday))continue;
    const end=cairoToUtc(date,s.end_time);if(s.crosses_midnight)end.setTime(end.getTime()+86400000);
    end.setTime(end.getTime()+Number(s.grace_minutes||0)*60000);
    const key=x.employee_id+"|"+date;if(end<new Date()&&!seen.has(key)){pending.push({employee_id:x.employee_id,shift_date:date,attendance_status:"absent_pending"});seen.add(key)}
   }
  }
  if(pending.length){const {error}=await db.from("hr_attendance").upsert(pending,{onConflict:"employee_id,shift_date",ignoreDuplicates:true});if(error)throw error}
  const [{data:rows,error:re},{data:employees,error:er},{data:balances,error:be}]=await Promise.all([
   db.from("hr_attendance").select("*,hr_employees(full_name,job_title,department,monthly_salary)").gte("shift_date",from).lte("shift_date",today).order("shift_date",{ascending:false}),
   db.from("hr_employees").select("id,full_name,paid_leave_days").eq("employment_status","active").order("full_name"),
   db.from("hr_leave_balances").select("employee_id,leave_year,allocated_days,used_days").eq("leave_year",Number(today.slice(0,4)))
  ]);if(re)throw re;if(er)throw er;if(be)throw be;return NextResponse.json({attendance:rows||[],employees:employees||[],leaveBalances:balances||[]});
 }catch(e){console.error("HR attendance GET",e);return NextResponse.json({error:e.message||"تعذر تحميل الحضور."},{status:500})}
}
export async function PATCH(request){
 try{const a=await admin(request);if(a.response)return a.response;const b=await request.json(),id=String(b.id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"سجل غير صحيح."},{status:400});
  const allowed=["present","absent","paid_leave","unpaid_leave","excused","holiday"];
  if(!allowed.includes(b.attendance_status))return NextResponse.json({error:"حالة الحضور غير صحيحة."},{status:400});
  const {data:old,error:oldError}=await a.db.from("hr_attendance").select("employee_id,shift_date,attendance_status").eq("id",id).single();if(oldError)throw oldError;
  const {data,error}=await a.db.from("hr_attendance").update({attendance_status:b.attendance_status,notes:String(b.notes||"").slice(0,1000),reviewed_by:a.user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
  if(error)throw error;
  if(old.attendance_status!==b.attendance_status&&(old.attendance_status==="paid_leave"||b.attendance_status==="paid_leave")){
   const year=Number(old.shift_date.slice(0,4)),delta=b.attendance_status==="paid_leave"?1:-1;
   const [{data:emp,error:empError},{data:balance,error:balanceError}]=await Promise.all([a.db.from("hr_employees").select("paid_leave_days").eq("id",old.employee_id).single(),a.db.from("hr_leave_balances").select("*").eq("employee_id",old.employee_id).eq("leave_year",year).maybeSingle()]);
   if(empError)throw empError;if(balanceError)throw balanceError;
   const allocated=Number(balance?.allocated_days??emp.paid_leave_days??0),used=Math.max(0,Number(balance?.used_days||0)+delta);
   if(used>allocated){await a.db.from("hr_attendance").update({attendance_status:old.attendance_status}).eq("id",id);return NextResponse.json({error:"رصيد الإجازات المدفوعة غير كافٍ."},{status:409});}
   const {error:leaveError}=await a.db.from("hr_leave_balances").upsert({employee_id:old.employee_id,leave_year:year,allocated_days:allocated,used_days:used,updated_at:new Date().toISOString()},{onConflict:"employee_id,leave_year"});
   if(leaveError)throw leaveError;
  }
  return NextResponse.json({attendance:data});
 }catch(e){return NextResponse.json({error:e.message||"تعذر تحديث السجل."},{status:400})}
}
export async function POST(request){
 try{const a=await admin(request);if(a.response)return a.response;const b=await request.json(),employee_id=String(b.employee_id||""),shift_date=String(b.shift_date||"");
  if(!/^[0-9a-f-]{36}$/i.test(employee_id)||!/^\d{4}-\d{2}-\d{2}$/.test(shift_date))return NextResponse.json({error:"اختار الموظف والتاريخ."},{status:400});
  const {data:old}=await a.db.from("hr_attendance").select("attendance_status").eq("employee_id",employee_id).eq("shift_date",shift_date).maybeSingle();
  const status=b.attendance_status==="paid_leave"?"paid_leave":"absent";
  if(status==="paid_leave"&&old?.attendance_status!=="paid_leave"){
   const [{data:emp,error:empError},{data:balance,error:balanceError}]=await Promise.all([a.db.from("hr_employees").select("paid_leave_days").eq("id",employee_id).single(),a.db.from("hr_leave_balances").select("*").eq("employee_id",employee_id).eq("leave_year",Number(shift_date.slice(0,4))).maybeSingle()]);
   if(empError)throw empError;if(balanceError)throw balanceError;
   const allocated=Number(balance?.allocated_days??emp.paid_leave_days??0),used=Number(balance?.used_days||0)+1;
   if(used>allocated)return NextResponse.json({error:"رصيد الإجازات المدفوعة غير كافٍ."},{status:409});
   const {error:leaveError}=await a.db.from("hr_leave_balances").upsert({employee_id,leave_year:Number(shift_date.slice(0,4)),allocated_days:allocated,used_days:used,updated_at:new Date().toISOString()},{onConflict:"employee_id,leave_year"});if(leaveError)throw leaveError;
  }
  const {data,error}=await a.db.from("hr_attendance").upsert({employee_id,shift_date,attendance_status:status,notes:String(b.notes||"").slice(0,1000),reviewed_by:a.user.id,reviewed_at:new Date().toISOString()},{onConflict:"employee_id,shift_date"}).select("*").single();
  if(error)throw error;return NextResponse.json({attendance:data},{status:201});
 }catch(e){return NextResponse.json({error:e.message||"تعذر حفظ الحالة."},{status:400})}
}