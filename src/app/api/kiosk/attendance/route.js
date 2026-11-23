import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

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
  if(matches.length!==1) return NextResponse.json({error:"الرقم السري غير صحيح."},{status:401});
  const employee=matches[0], now=new Date(), cairoDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  await db.from("hr_kiosk_devices").update({last_seen_at:now.toISOString()}).eq("id",device.id);
  if(action==="check_in"){
   const {data:open}=await db.from("hr_attendance").select("id").eq("employee_id",employee.id).is("check_out_at",null).not("check_in_at","is",null).maybeSingle();
   if(open)return NextResponse.json({error:"أنت مسجل حضور بالفعل ولم تسجل الانصراف."},{status:409});
   const {data:existing}=await db.from("hr_attendance").select("id,check_in_at,check_out_at").eq("employee_id",employee.id).eq("shift_date",cairoDate).maybeSingle();
   if(existing?.check_in_at)return NextResponse.json({error:"تم تسجيل حضورك لهذا اليوم بالفعل."},{status:409});
   const {error:insertError}=await db.from("hr_attendance").insert({employee_id:employee.id,shift_date:cairoDate,check_in_at:now.toISOString(),check_in_method:"pin",attendance_status:"present"});
   if(insertError)throw insertError;
   return NextResponse.json({success:true,employee_name:employee.full_name,action:"check_in",recorded_at:now.toISOString()});
  }
  const {data:openRows,error:openError}=await db.from("hr_attendance").select("id,shift_date,check_in_at").eq("employee_id",employee.id).not("check_in_at","is",null).is("check_out_at",null).order("check_in_at",{ascending:false}).limit(1);
  if(openError)throw openError;
  const open=openRows?.[0];
  if(!open)return NextResponse.json({error:"لا يوجد تسجيل حضور مفتوح لك."},{status:409});
  const minutes=Math.max(0,Math.round((now-new Date(open.check_in_at))/60000));
  const {error:updateError}=await db.from("hr_attendance").update({check_out_at:now.toISOString(),check_out_method:"pin",worked_minutes:minutes,updated_at:now.toISOString()}).eq("id",open.id);
  if(updateError)throw updateError;
  return NextResponse.json({success:true,employee_name:employee.full_name,action:"check_out",recorded_at:now.toISOString(),worked_minutes:minutes});
 } catch(error) {
  console.error("HR kiosk attendance:",error);
  return NextResponse.json({error:"تعذر تسجيل العملية. حاول مرة أخرى أو تواصل مع المدير."},{status:500});
 }
}
