import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function service(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})}
async function admin(request){const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return {response:NextResponse.json({error:"سجل دخول المدير أولاً."},{status:401})};const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});const {data,error}=await auth.auth.getUser(token);if(error||!data?.user)return {response:NextResponse.json({error:"جلسة غير صالحة."},{status:401})};const db=service(),{data:row}=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();return row?{db,user:data.user}:{response:NextResponse.json({error:"غير مسموح."},{status:403})}}
export async function GET(request){try{const a=await admin(request);if(a.response)return a.response;const [{data:runs,error},{data:employees,error:ee},{data:adjustments,error:ae}]=await Promise.all([a.db.from("hr_payroll_runs").select("*,hr_payroll_items(*)").order("created_at",{ascending:false}),a.db.from("hr_employees").select("id,full_name").eq("employment_status","active").order("full_name"),a.db.from("hr_payroll_adjustments").select("id,employee_id,adjustment_date,amount,adjustment_type,reason").order("adjustment_date",{ascending:false}).limit(100)]);if(error)throw error;if(ee)throw ee;if(ae)throw ae;return NextResponse.json({runs:runs||[],employees:employees||[],adjustments:adjustments||[]})}catch(e){return NextResponse.json({error:e.message||"تعذر تحميل الرواتب."},{status:500})}}
export async function POST(request){
 try{
  const a=await admin(request);if(a.response)return a.response;
  const b=await request.json();
  if(b.action==="adjustment"){
   const employee_id=String(b.employee_id||""),adjustment_date=String(b.adjustment_date||""),amount=Number(b.amount),adjustment_type=String(b.adjustment_type||""),reason=String(b.reason||"").trim();
   if(!/^[0-9a-f-]{36}$/i.test(employee_id)||!/^(\\d{4})-(\\d{2})-(\\d{2})$/.test(adjustment_date)||!Number.isFinite(amount)||amount<=0||!["addition","deduction"].includes(adjustment_type)||reason.length<2)
    return NextResponse.json({error:"راجع بيانات الإضافة أو الخصم."},{status:400});
   const {data:existingRun,error:runError}=await a.db.from("hr_payroll_runs").select("id,status").lte("period_start",adjustment_date).gte("period_end",adjustment_date).limit(1).maybeSingle();
   if(runError)throw runError;
   if(existingRun)return NextResponse.json({error:"لا يمكن إضافة تعديل على يوم داخل كشف رواتب تم إنشاؤه بالفعل."},{status:409});
   const {data,error}=await a.db.from("hr_payroll_adjustments").insert({employee_id,adjustment_date,amount,adjustment_type,reason,created_by:a.user.id}).select("*").single();
   if(error)throw error;
   return NextResponse.json({adjustment:data},{status:201});
  }
  const start=String(b.period_start||""),end=String(b.period_end||"");
  if(!/^(\\d{4})-(\\d{2})-(\\d{2})$/.test(start)||!/^(\\d{4})-(\\d{2})-(\\d{2})$/.test(end)||end<start)
   return NextResponse.json({error:"حدد فترة صحيحة."},{status:400});
  const {data,error}=await a.db.rpc("hr_create_payroll_run",{
   p_period_start:start,p_period_end:end,p_created_by:a.user.id
  });
  if(error){
   const status=error.code==="23505"?409:400;
   return NextResponse.json({error:error.message||"تعذر إنشاء كشف الرواتب."},{status});
  }
  return NextResponse.json({run:data.run,items:data.items||[]},{status:201});
 }catch(e){console.error("HR payroll POST",e);return NextResponse.json({error:e.message||"تعذر إنشاء كشف الرواتب."},{status:400})}
}
export async function PATCH(request){try{const a=await admin(request);if(a.response)return a.response;const b=await request.json();if(!/^[0-9a-f-]{36}$/i.test(String(b.id||"")))return NextResponse.json({error:"كشف غير صحيح."},{status:400});const {data,error}=await a.db.from("hr_payroll_runs").update({status:"finalized",finalized_by:a.user.id,finalized_at:new Date().toISOString()}).eq("id",b.id).eq("status","draft").select("*").single();if(error)throw error;return NextResponse.json({run:data})}catch(e){return NextResponse.json({error:e.message||"تعذر اعتماد الكشف."},{status:400})}}