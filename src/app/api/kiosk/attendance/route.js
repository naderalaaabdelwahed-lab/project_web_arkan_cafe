import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

function dbClient() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret) throw new Error("Supabase server configuration is missing.");
 return createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
}
function cairoParts(date) {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
 return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function cairoDate(date) { const p=cairoParts(date); return p.year+"-"+p.month+"-"+p.day; }
function cairoWeekday(dateString) { return new Date(dateString+"T00:00:00Z").getUTCDay(); }
function cairoLocalToUtc(dateString,timeString) {
 const [y,m,d]=dateString.split("-").map(Number),[hh,mm]=String(timeString).slice(0,5).split(":").map(Number);
 const target=Date.UTC(y,m-1,d,hh,mm,0); let guess=target;
 for(let i=0;i<3;i++){const p=cairoParts(new Date(guess));const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));guess+=target-represented;}
 return new Date(guess);
}
async function authorizedDevice(request,db) {
 const token=request.headers.get("x-ark-kiosk-token")||"";
 if(!/^[a-f0-9]{64}$/i.test(token)) return null;
 const digest=createHash("sha256").update(token).digest("hex");
 const {data,error}=await db.from("hr_kiosk_devices").select("id").eq("token_hash",digest).eq("is_active",true).maybeSingle();
 if(error) throw error;
 return data||null;
}
async function assignedShift(db,employeeId,dateString) {
 const weekday=cairoWeekday(dateString);
 const {data:rows,error}=await db.from("hr_employee_shift_assignments").select("id,shift_id,effective_from,effective_to,weekday,hr_shifts(*)").eq("employee_id",employeeId).lte("effective_from",dateString);
 if(error) throw error;
 return (rows||[]).find(a=>(!a.effective_to||a.effective_to>=dateString)&&(a.weekday===null||a.weekday===weekday)&&a.hr_shifts?.is_active)||null;
}
function validPin(pin,hash) {
 const [salt,stored]=String(hash||"").split(":");
 if(!salt||!stored) return false;
 const actual=scryptSync(pin,salt,64),expected=Buffer.from(stored,"hex");
 return expected.length===actual.length&&timingSafeEqual(actual,expected);
}
export async function GET(request) {
 try {
  const db=dbClient(),device=await authorizedDevice(request,db);
  if(!device) return NextResponse.json({error:"جهاز الحضور غير مُفعّل."},{status:401});
  const {data,error}=await db.from("hr_employees").select("id,full_name,job_title,department").eq("employment_status","active").order("full_name");
  if(error) throw error;
  return NextResponse.json({employees:data||[]});
 } catch(error) {
  console.error("HR kiosk employees:",error);
  return NextResponse.json({error:"تعذر تحميل قائمة الموظفين."},{status:500});
 }
}
export async function POST(request) {
 try {
  const db=dbClient(),device=await authorizedDevice(request,db);
  if(!device) return NextResponse.json({error:"جهاز الحضور غير مُفعّل."},{status:401});
  const {count:recentFailures,error:rateError}=await db.from("hr_kiosk_attempts").select("id",{count:"exact",head:true}).eq("device_id",device.id).eq("succeeded",false).gte("attempted_at",new Date(Date.now()-5*60*1000).toISOString());
  if(rateError) throw rateError;
  if((recentFailures||0)>=8) return NextResponse.json({error:"تم إيقاف المحاولات مؤقتًا بسبب إدخال أرقام خاطئة متكررة. تواصل مع المدير."},{status:429});
  const body=await request.json(),employeeId=String(body.employee_id||""),pin=String(body.pin||""),action=String(body.action||"");
  if(!/^[0-9a-f-]{36}$/i.test(employeeId)||!/^\d{4,8}$/.test(pin)||!["check_in","check_out"].includes(action))
   return NextResponse.json({error:"اختار اسمك والعملية وأدخل الكود الصحيح."},{status:400});
  const {data:employee,error:employeeError}=await db.from("hr_employees").select("id,full_name,attendance_pin_hash,daily_work_hours").eq("id",employeeId).eq("employment_status","active").maybeSingle();
  if(employeeError) throw employeeError;
  if(!employee||!validPin(pin,employee.attendance_pin_hash)) {
   await db.from("hr_kiosk_attempts").insert({device_id:device.id,succeeded:false});
   return NextResponse.json({error:"الكود غير صحيح."},{status:401});
  }
  await db.from("hr_kiosk_attempts").insert({device_id:device.id,succeeded:true});
  const now=new Date(),today=cairoDate(now);
  await db.from("hr_kiosk_devices").update({last_seen_at:now.toISOString()}).eq("id",device.id);
  if(action==="check_in") {
   const assignment=await assignedShift(db,employee.id,today),shift=assignment?.hr_shifts||null;
   const {data:existing,error:existingError}=await db.from("hr_attendance").select("id,check_in_at").eq("employee_id",employee.id).eq("shift_date",today).maybeSingle();
   if(existingError) throw existingError;
   if(existing?.check_in_at) return NextResponse.json({error:"تم تسجيل حضورك لهذا اليوم بالفعل."},{status:409});
   let lateMinutes=0;
   if(shift?.is_flexible&&shift.latest_check_in) {
    const latest=cairoLocalToUtc(today,shift.latest_check_in),cutoff=new Date(latest.getTime()+Number(shift.grace_minutes||0)*60000);
    if(now>cutoff) return NextResponse.json({error:"انتهى وقت الحضور المسموح لهذا الشيفت."},{status:409});
   } else if(shift) {
    const start=cairoLocalToUtc(today,shift.start_time);
    lateMinutes=Math.max(0,Math.floor((now-start)/60000)-Number(shift.grace_minutes||0));
   }
   const payload={employee_id:employee.id,shift_date:today,check_in_at:now.toISOString(),check_in_method:"pin",attendance_status:"present",late_minutes,updated_at:now.toISOString()};
   const {error:saveError}=existing
    ? await db.from("hr_attendance").update(payload).eq("id",existing.id)
    : await db.from("hr_attendance").insert(payload);
   if(saveError) {
    if(saveError.code==="23505") return NextResponse.json({error:"تم تسجيل حضورك لهذا اليوم بالفعل."},{status:409});
    throw saveError;
   }
   return NextResponse.json({success:true,employee_name:employee.full_name,action:"check_in",shift_date:today,recorded_at:now.toISOString()});
  }
  const {data:openRows,error:openError}=await db.from("hr_attendance").select("id,shift_date,check_in_at").eq("employee_id",employee.id).not("check_in_at","is",null).is("check_out_at",null).order("check_in_at",{ascending:false}).limit(1);
  if(openError) throw openError;
  const open=openRows?.[0];
  if(!open) return NextResponse.json({error:"لا يوجد تسجيل حضور مفتوح لك. راجع المدير إذا كنت نسيت تسجيل الحضور."},{status:409});
  const elapsed=Math.max(0,Math.round((now-new Date(open.check_in_at))/60000));
  const assignment=await assignedShift(db,employee.id,open.shift_date),shift=assignment?.hr_shifts||null;
  const breakMinutes=shift?Number(shift.break_minutes||0):0,workedMinutes=Math.max(0,elapsed-breakMinutes);
  let overtimeMinutes=0;
  if(shift) {
   const start=cairoLocalToUtc(open.shift_date,shift.start_time);
   let end=cairoLocalToUtc(open.shift_date,shift.end_time);
   if(shift.crosses_midnight||end<=start) end=new Date(end.getTime()+86400000);
   const planned=Math.max(0,Math.round((end-start)/60000)-breakMinutes);
   overtimeMinutes=Math.max(0,workedMinutes-planned);
  } else overtimeMinutes=Math.max(0,workedMinutes-Math.round(Number(employee.daily_work_hours||8)*60));
  const {error:updateError}=await db.from("hr_attendance").update({check_out_at:now.toISOString(),check_out_method:"pin",worked_minutes:workedMinutes,overtime_minutes:overtimeMinutes,updated_at:now.toISOString()}).eq("id",open.id);
  if(updateError) throw updateError;
  return NextResponse.json({success:true,employee_name:employee.full_name,action:"check_out",shift_date:open.shift_date,recorded_at:now.toISOString(),worked_minutes:workedMinutes});
 } catch(error) {
  console.error("HR kiosk attendance:",error);
  return NextResponse.json({error:"تعذر تسجيل العملية. حاول مرة أخرى أو تواصل مع المدير."},{status:500});
 }
}
