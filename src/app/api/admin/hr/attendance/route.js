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
 try{
  const a=await admin(request);if(a.response)return a.response;
  const b=await request.json(),id=String(b.id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"سجل غير صحيح."},{status:400});
  const allowed=["present","absent","paid_leave","unpaid_leave","excused","holiday"];
  const {data:current,error:readError}=await a.db.from("hr_attendance").select("*,hr_employee_shift_assignments:hr_employee_shift_assignments!left(shift_id,hr_shifts(*))").eq("id",id).maybeSingle();
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
  if(checkIn&&checkOut&&new Date(checkOut)<=new Date(checkIn))return NextResponse.json({error:"وقت الانصراف لازم يكون بعد وقت الحضور."},{status:400});
  if(changesIn)updates.check_in_method="manager";
  if(changesOut)updates.check_out_method="manager";
  if(changesIn||changesOut){
   let worked=0,overtime=0,late=Number(current.late_minutes||0);
   const {data:assignment,error:shiftError}=await a.db.from("hr_employee_shift_assignments").select("hr_shifts(*)").eq("employee_id",current.employee_id).lte("effective_from",current.shift_date).or("effective_to.is.null,effective_to.gte."+current.shift_date).order("effective_from",{ascending:false}).limit(1).maybeSingle();
   if(shiftError)throw shiftError;
   const shift=assignment?.hr_shifts;
   if(checkIn&&checkOut){
    const elapsed=Math.max(0,Math.round((new Date(checkOut)-new Date(checkIn))/60000));
    worked=Math.max(0,elapsed-Number(shift?.break_minutes||0));
    if(shift){
     const start=cairoToUtc(current.shift_date,shift.start_time);
     let end=cairoToUtc(current.shift_date,shift.end_time);
     if(shift.crosses_midnight||end<=start)end=new Date(end.getTime()+86400000);
     const planned=Math.max(0,Math.round((end-start)/60000)-Number(shift.break_minutes||0));
     overtime=Math.max(0,worked-planned);
     if(changesIn)late=Math.max(0,Math.floor((new Date(checkIn)-start)/60000)-Number(shift.grace_minutes||0));
    } else {
     const {data:emp}=await a.db.from("hr_employees").select("daily_work_hours").eq("id",current.employee_id).maybeSingle();
     overtime=Math.max(0,worked-Math.round(Number(emp?.daily_work_hours||8)*60));
    }
   } else {worked=0;overtime=0;}
   updates.worked_minutes=worked;updates.overtime_minutes=overtime;
   if(changesIn)updates.late_minutes=late;
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
  const status=b.attendance_status==="paid_leave"?"paid_leave":"absent";
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
