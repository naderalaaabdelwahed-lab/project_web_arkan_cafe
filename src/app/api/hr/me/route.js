import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function clients() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!publishable||!secret) throw new Error("Supabase server configuration is missing.");
  return {
    auth:createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false}}),
    db:createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}})
  };
}
async function context(request) {
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  if(!token) return {response:NextResponse.json({error:"سجل الدخول إلى حساب الموظف أولاً."},{status:401})};
  const {auth,db}=clients();
  const {data,error}=await auth.auth.getUser(token);
  if(error||!data?.user) return {response:NextResponse.json({error:"جلسة الدخول غير صالحة."},{status:401})};
  const {data:employee,error:employeeError}=await db.from("hr_employees")
    .select("id,full_name,job_title,department,employment_status,monthly_salary,username,auth_user_id")
    .eq("auth_user_id",data.user.id).maybeSingle();
  if(employeeError) throw employeeError;
  if(!employee||employee.employment_status!=="active") return {response:NextResponse.json({error:"هذا الحساب غير مرتبط بموظف نشط. تواصل مع الإدارة."},{status:403})};
  return {db,employee};
}
function cairoParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));
}
function cairoDate(date) { const p=cairoParts(date); return p.year+"-"+p.month+"-"+p.day; }
function weekday(dateString) { return new Date(dateString+"T00:00:00Z").getUTCDay(); }
function localToUtc(dateString,timeString) {
  const [y,m,d]=dateString.split("-").map(Number),[hh,mm]=String(timeString).slice(0,5).split(":").map(Number);
  const target=Date.UTC(y,m-1,d,hh,mm,0); let guess=target;
  for(let i=0;i<3;i++){const p=cairoParts(new Date(guess));const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);guess+=target-represented;}
  return new Date(guess);
}
async function getShift(db,employeeId,date) {
  const {data,error}=await db.from("hr_employee_shift_assignments").select("id,shift_id,effective_from,effective_to,weekday,hr_shifts(*)")
    .eq("employee_id",employeeId).lte("effective_from",date);
  if(error) throw error;
  return (data||[]).find(a=>(!a.effective_to||a.effective_to>=date)&&(a.weekday===null||a.weekday===weekday(date))&&a.hr_shifts?.is_active)||null;
}
export async function GET(request) {
  try {
    const auth=await context(request); if(auth.response)return auth.response;
    const today=cairoDate(new Date());
    const [attendance,assignment]=await Promise.all([
      auth.db.from("hr_attendance").select("id,shift_date,check_in_at,check_out_at,attendance_status,late_minutes,overtime_minutes,worked_minutes")
        .eq("employee_id",auth.employee.id).order("shift_date",{ascending:false}).limit(30),
      getShift(auth.db,auth.employee.id,today)
    ]);
    if(attendance.error)throw attendance.error;
    return NextResponse.json({employee:auth.employee,attendance:attendance.data||[],today,shift:assignment?.hr_shifts||null});
  } catch(error) {
    console.error("HR self GET:",error);
    return NextResponse.json({error:"تعذر تحميل بيانات حسابك."},{status:500});
  }
}
export async function POST(request) {
  try {
    const auth=await context(request); if(auth.response)return auth.response;
    const body=await request.json(),action=String(body.action||"");
    if(!["check_in","check_out"].includes(action))return NextResponse.json({error:"عملية غير صحيحة."},{status:400});
    const now=new Date(),today=cairoDate(now);
    if(action==="check_in") {
      const assignment=await getShift(auth.db,auth.employee.id,today),shift=assignment?.hr_shifts||null;
      const {data:existing,error}=await auth.db.from("hr_attendance").select("id,check_in_at")
        .eq("employee_id",auth.employee.id).eq("shift_date",today).maybeSingle();
      if(error)throw error;
      if(existing?.check_in_at)return NextResponse.json({error:"تم تسجيل حضورك لهذا اليوم بالفعل."},{status:409});
      let lateMinutes=0;
      if(shift?.is_flexible&&shift.latest_check_in) {
        const cutoff=new Date(localToUtc(today,shift.latest_check_in).getTime()+Number(shift.grace_minutes||0)*60000);
        if(now>cutoff)return NextResponse.json({error:"انتهى وقت الحضور المسموح لهذا الشيفت."},{status:409});
      } else if(shift) {
        lateMinutes=Math.max(0,Math.floor((now-localToUtc(today,shift.start_time))/60000)-Number(shift.grace_minutes||0));
      }
      const values={employee_id:auth.employee.id,shift_date:today,check_in_at:now.toISOString(),check_in_method:"account",attendance_status:"present",late_minutes,updated_at:now.toISOString()};
      const saved=existing
        ? await auth.db.from("hr_attendance").update(values).eq("id",existing.id)
        : await auth.db.from("hr_attendance").insert(values);
      if(saved.error){if(saved.error.code==="23505")return NextResponse.json({error:"تم تسجيل حضورك لهذا اليوم بالفعل."},{status:409});throw saved.error;}
      return NextResponse.json({success:true,action,recorded_at:now.toISOString(),shift_date:today});
    }
    const {data:rows,error}=await auth.db.from("hr_attendance").select("id,shift_date,check_in_at")
      .eq("employee_id",auth.employee.id).not("check_in_at","is",null).is("check_out_at",null).order("check_in_at",{ascending:false}).limit(1);
    if(error)throw error;
    const open=rows?.[0];
    if(!open)return NextResponse.json({error:"لا يوجد حضور مفتوح. لا يمكن تسجيل الانصراف قبل الحضور."},{status:409});
    const assignment=await getShift(auth.db,auth.employee.id,open.shift_date),shift=assignment?.hr_shifts||null;
    const elapsed=Math.max(0,Math.round((now-new Date(open.check_in_at))/60000));
    const breakMinutes=Number(shift?.break_minutes||0),worked=Math.max(0,elapsed-breakMinutes);
    let planned=Number(auth.employee.daily_work_hours||8)*60;
    if(shift) {
      const start=localToUtc(open.shift_date,shift.start_time); let end=localToUtc(open.shift_date,shift.end_time);
      if(shift.crosses_midnight||end<=start)end=new Date(end.getTime()+86400000);
      planned=Math.max(0,Math.round((end-start)/60000)-breakMinutes);
    }
    const {error:updateError}=await auth.db.from("hr_attendance").update({
      check_out_at:now.toISOString(),check_out_method:"account",worked_minutes:worked,overtime_minutes:Math.max(0,worked-planned),updated_at:now.toISOString()
    }).eq("id",open.id);
    if(updateError)throw updateError;
    return NextResponse.json({success:true,action,recorded_at:now.toISOString(),shift_date:open.shift_date,worked_minutes:worked});
  } catch(error) {
    console.error("HR self attendance POST:",error);
    return NextResponse.json({error:"تعذر تسجيل الحضور أو الانصراف. حاول مرة أخرى."},{status:500});
  }
}
