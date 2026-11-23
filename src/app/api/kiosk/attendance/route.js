import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, scryptSync, timingSafeEqual } from "node:crypto";


function cairoParts(date) {
 const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
 return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function cairoDate(date) { const p=cairoParts(date); return p.year+"-"+p.month+"-"+p.day; }
function cairoWeekday(dateString) { return new Date(dateString+"T00:00:00Z").getUTCDay(); }
function cairoLocalToUtc(dateString,timeString) {
 const [y,m,d]=dateString.split("-").map(Number), [hh,mm]=timeString.slice(0,5).split(":").map(Number);
 const target=Date.UTC(y,m-1,d,hh,mm,0);
 let guess=target;
 for(let i=0;i<3;i++){
  const p=cairoParts(new Date(guess));
  const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
  guess += target-represented;
 }
 return new Date(guess);
}
async function assignedShift(db, employeeId, dateString) {
 const weekday=cairoWeekday(dateString);
 const {data:rows,error}=await db.from("hr_employee_shift_assignments").select("id,shift_id,effective_from,effective_to,weekday,hr_shifts(*)").eq("employee_id",employeeId).lte("effective_from",dateString);
 if(error) throw error;
 return (rows||[]).find(a=> (!a.effective_to||a.effective_to>=dateString) && (a.weekday===null||a.weekday===weekday) && a.hr_shifts?.is_active) || null;
}
export async function POST(request) {
 try {
  const deviceToken=request.headers.get("x-ark-kiosk-token")||"";
  if(!/^[a-f0-9]{64}$/i.test(deviceToken)) return NextResponse.json({error:"جهاز الحضور غير مُفعّل."},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret) throw new Error("Supabase server configuration is missing.");
  const db=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const digest=createHash("sha256").update(deviceToken).digest("hex");
  const {data:device,error:deviceError}=await db.from("hr_kiosk_devices").select("id").eq("token_hash",digest).eq("is_active",true).maybeSingle();
  if(deviceError||!device) return NextResponse.json({error:"جهاز الحضور غير مُفعّل."},{status:401});
  const {count:recentFailures,error:rateError}=await db.from("hr_kiosk_attempts").select("id",{count:"exact",head:true}).eq("device_id",device.id).eq("succeeded",false).gte("attempted_at",new Date(Date.now()-5*60*1000).toISOString());
  if(rateError) throw rateError;
  if((recentFailures||0)>=8) return NextResponse.json({error:"تم إيقاف المحاولات مؤقتًا بسبب إدخال أرقام خاطئة متكررة. تواصل مع المدير."},{status:429});
  const body=await request.json(), pin=String(body.pin||""), action=String(body.action||"");
  if(!/^\d{4,8}$/.test(pin)||!["check_in","check_out"].includes(action)) return NextResponse.json({error:"راجع الرقم السري واختيار العملية."},{status:400});
  const {data:employees,error}=await db.from("hr_employees").select("id,full_name,attendance_pin_hash,daily_work_hours").eq("employment_status","active").not("attendance_pin_hash","is",null);
  if(error) throw error;
  const matches=(employees||[]).filter(e=>{
   const [salt,stored]=String(e.attendance_pin_hash||"").split(":");
   if(!salt||!stored)return false;
   const actual=scryptSync(pin,salt,64), expected=Buffer.from(stored,"hex");
   return expected.length===actual.length && timingSafeEqual(actual,expected);
  });
  if(matches.length!==1) { await db.from("hr_kiosk_attempts").insert({device_id:device.id,succeeded:false}); return NextResponse.json({error:"الرقم السري غير صحيح."},{status:401}); }
  await db.from("hr_kiosk_attempts").insert({device_id:device.id,succeeded:true});
  const employee=matches[0], now=new Date(), todayCairo=cairoDate(now);
  await db.from("hr_kiosk_devices").update({last_seen_at:now.toISOString()}).eq("id",device.id);
  if(action==="check_in"){
   const {data:open}=await db.from("hr_attendance").select("id").eq("employee_id",employee.id).is("check_out_at",null).not("check_in_at","is",null).maybeSingle();
   if(open)return NextResponse.json({error:"أنت مسجل حضور بالفعل ولم تسجل الانصراف."},{status:409});
   const assignment=await assignedShift(db,employee.id,todayCairo);
   let shiftDate=todayCairo, shift=assignment?.hr_shifts||null;
   const prev=new Date(Date.parse(todayCairo+"T00:00:00Z")-86400000).toISOString().slice(0,10);
   const prevAssignment=await assignedShift(db,employee.id,prev), prevShift=prevAssignment?.hr_shifts;
   if(prevShift?.crosses_midnight){
    const prevStart=cairoLocalToUtc(prev,prevShift.start_time);
    let prevEnd=cairoLocalToUtc(prev,prevShift.end_time);if(prevEnd<=prevStart)prevEnd=new Date(prevEnd.getTime()+86400000);
    const graceStart=new Date(prevStart.getTime()-Number(prevShift.grace_minutes||0)*60000);
    if(now>=graceStart&&now<=prevEnd){shiftDate=prev;shift=prevShift;}
   }
   const {data:existing}=await db.from("hr_attendance").select("id,check_in_at,check_out_at").eq("employee_id",employee.id).eq("shift_date",shiftDate).maybeSingle();
   if(existing?.check_in_at)return NextResponse.json({error:"تم تسجيل حضورك لهذا اليوم بالفعل."},{status:409});
   let lateMinutes=0;
   if(shift){
    const start=cairoLocalToUtc(shiftDate,shift.start_time);
    lateMinutes=Math.max(0,Math.floor((now-start)/60000)-Number(shift.grace_minutes||0));
   }
   const {error:insertError}=await db.from("hr_attendance").insert({employee_id:employee.id,shift_date:shiftDate,check_in_at:now.toISOString(),check_in_method:"pin",attendance_status:"present",late_minutes:lateMinutes});
   if(insertError)throw insertError;
   return NextResponse.json({success:true,employee_name:employee.full_name,action:"check_in",recorded_at:now.toISOString()});
  }
  const {data:openRows,error:openError}=await db.from("hr_attendance").select("id,shift_date,check_in_at").eq("employee_id",employee.id).not("check_in_at","is",null).is("check_out_at",null).order("check_in_at",{ascending:false}).limit(1);
  if(openError)throw openError;
  const open=openRows?.[0];
  if(!open)return NextResponse.json({error:"لا يوجد تسجيل حضور مفتوح لك."},{status:409});
  const minutes=Math.max(0,Math.round((now-new Date(open.check_in_at))/60000));
  const assignment=await assignedShift(db,employee.id,open.shift_date);
  const shift=assignment?.hr_shifts;
  let overtimeMinutes=0;
  if(shift){
   const start=cairoLocalToUtc(open.shift_date,shift.start_time);
   let end=cairoLocalToUtc(open.shift_date,shift.end_time);
   if(shift.crosses_midnight||end<=start) end=new Date(end.getTime()+86400000);
   const planned=Math.max(0,Math.round((end-start)/60000)-Number(shift.break_minutes||0));
   overtimeMinutes=Math.max(0,minutes-planned);
  } else {
   overtimeMinutes=Math.max(0,minutes-Math.round(Number(employee.daily_work_hours||8)*60));
  }
  const {error:updateError}=await db.from("hr_attendance").update({check_out_at:now.toISOString(),check_out_method:"pin",worked_minutes:minutes,overtime_minutes:overtimeMinutes,updated_at:now.toISOString()}).eq("id",open.id);
  if(updateError)throw updateError;
  return NextResponse.json({success:true,employee_name:employee.full_name,action:"check_out",recorded_at:now.toISOString(),worked_minutes:minutes});
 } catch(error) {
  console.error("HR kiosk attendance:",error);
  return NextResponse.json({error:"تعذر تسجيل العملية. حاول مرة أخرى أو تواصل مع المدير."},{status:500});
 }
}
