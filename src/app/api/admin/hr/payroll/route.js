import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function service(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})}
async function admin(request){const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return {response:NextResponse.json({error:"سجل دخول المدير أولاً."},{status:401})};const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});const {data,error}=await auth.auth.getUser(token);if(error||!data?.user)return {response:NextResponse.json({error:"جلسة غير صالحة."},{status:401})};if(data.user.app_metadata?.account_type==="hr_employee")return {response:NextResponse.json({error:"حساب HR مخصص للحضور والانصراف الشخصي فقط."},{status:403})};const db=service(),{data:row}=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();return row?{db,user:data.user}:{response:NextResponse.json({error:"غير مسموح."},{status:403})}}
export async function GET(request){
 try{
  const a=await admin(request);if(a.response)return a.response;
  const month=new URL(request.url).searchParams.get("month");
  let runQuery=a.db.from("hr_payroll_runs").select("*,hr_payroll_items(*)").order("created_at",{ascending:false});
  if(month){
   if(!/^\d{4}-\d{2}$/.test(month)||Number(month.slice(5,7))<1||Number(month.slice(5,7))>12)
    return NextResponse.json({error:"الشهر غير صحيح."},{status:400});
   const start=month+"-01",end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
   runQuery=runQuery.eq("period_start",start).eq("period_end",end);
  }
  const [{data:runs,error},{data:employees,error:ee},{data:adjustments,error:ae}]=await Promise.all([
   runQuery,
   a.db.from("hr_employees").select("id,full_name,employment_status,termination_date").is("archived_at",null).order("full_name"),
   a.db.from("hr_payroll_adjustments").select("id,employee_id,adjustment_date,amount,adjustment_type,reason").order("adjustment_date",{ascending:false}).limit(100)
  ]);
  if(error)throw error;if(ee)throw ee;if(ae)throw ae;

  let preview=[];
  if(month){
   const start=month+"-01",end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
   const [{data:allEmployees,error:allError},{data:attendance,error:attendanceError},{data:pendingAdjustments,error:pendingError}]=await Promise.all([
    a.db.from("hr_employees").select("id,full_name,employment_status,hire_date,termination_date,monthly_salary,daily_work_hours"),
    a.db.from("hr_attendance").select("employee_id,shift_date,attendance_status,check_in_at,check_out_at,worked_minutes").gte("shift_date",start).lte("shift_date",end),
    a.db.from("hr_payroll_adjustments").select("employee_id,amount,adjustment_type").is("payroll_run_id",null).gte("adjustment_date",start).lte("adjustment_date",end)
   ]);
   if(allError)throw allError;if(attendanceError)throw attendanceError;if(pendingError)throw pendingError;
   const days=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000+1;
   const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
   for(const employee of allEmployees||[]){
    if(employee.hire_date>end||(employee.termination_date&&employee.termination_date<start))continue;
    const empRows=(attendance||[]).filter(row=>row.employee_id===employee.id);
    if(employee.employment_status!=="active"&&!employee.termination_date&&!empRows.length)continue;
    const eligibleStart=employee.hire_date>start?employee.hire_date:start;
    const lastAttendance=empRows.reduce((max,row)=>row.shift_date>max?row.shift_date:max,"");
    const eligibleEnd=employee.termination_date?(employee.termination_date<end?employee.termination_date:end)
      :employee.employment_status==="inactive"?(lastAttendance||""):end;
    if(!eligibleEnd||eligibleEnd<eligibleStart)continue;
    const eligibleDays=(Date.parse(eligibleEnd+"T00:00:00Z")-Date.parse(eligibleStart+"T00:00:00Z"))/86400000+1;
    const eligibleRows=empRows.filter(row=>row.shift_date>=eligibleStart&&row.shift_date<=eligibleEnd
      &&row.attendance_status==="present"&&row.check_in_at&&row.check_out_at);
    const attended=eligibleRows.length;
    const plannedMinutes=Math.round(Number(employee.daily_work_hours||8)*60);
    const workedMinutes=eligibleRows.map(row=>Math.max(0,Math.round((new Date(row.check_out_at)-new Date(row.check_in_at))/60000)));
    const overtime=workedMinutes.reduce((sum,worked)=>sum+Math.max(0,worked-plannedMinutes),0);
    const shortage=workedMinutes.reduce((sum,worked)=>sum+Math.max(0,plannedMinutes-worked),0);
    const netMinutes=overtime-shortage;
    const base=round2((Number(employee.monthly_salary||0)/30)*(attended+Math.floor(attended/7)));
    const hourRate=Number(employee.monthly_salary||0)/(30*Math.max(0.01,Number(employee.daily_work_hours||8)));
    const hourAdjustment=round2(netMinutes/60*hourRate);
    const overtimeAmount=round2(Math.max(0,netMinutes)/60*hourRate);
    const shortageAmount=round2(Math.max(0,-netMinutes)/60*hourRate);
    const empAdjustments=(pendingAdjustments||[]).filter(item=>item.employee_id===employee.id);
    const deductions=round2(empAdjustments.filter(item=>item.adjustment_type==="deduction").reduce((sum,item)=>sum+Number(item.amount||0),0));
    const incentives=round2(empAdjustments.filter(item=>item.adjustment_type==="addition").reduce((sum,item)=>sum+Number(item.amount||0),0));
    const net=round2(base+hourAdjustment-deductions+incentives);
    preview.push({
     employee_id:employee.id,employee_name_snapshot:employee.full_name,monthly_salary:base,
     overtime_amount:overtimeAmount,lateness_deduction:shortageAmount,other_deductions:deductions,
     additions:incentives,paid_leave_days:0,net_salary:net,
     details:{
      contract_monthly_salary:Number(employee.monthly_salary||0),period_days:days,eligible_days:eligibleDays,
      eligible_start:eligibleStart,eligible_end:eligibleEnd,hire_date:employee.hire_date,
      termination_date:employee.termination_date,attended_days:attended,paid_leave_days:0,weekly_paid_rest_days:Math.floor(attended/7),
      paid_days_total:attended+Math.floor(attended/7),daily_work_hours:Number(employee.daily_work_hours||8),
      hour_rate:round2(hourRate),overtime_minutes:overtime,shortage_minutes:shortage,net_minutes:netMinutes,
      weekly_paid_rest_days:Math.floor(attended/7),overtime_amount:overtimeAmount,shortage_amount:shortageAmount,
      hour_adjustment:hourAdjustment,deductions,incentives,
      base_salary_due:base,net_salary:net
     }
    });
   }
  }
  return NextResponse.json({runs:runs||[],employees:employees||[],adjustments:adjustments||[],preview});
 }catch(e){return NextResponse.json({error:e.message||"تعذر تحميل الرواتب."},{status:500})}
}
export async function POST(request){
 try{
  const a=await admin(request);if(a.response)return a.response;
  const b=await request.json();
  if(b.action==="adjustment"){
   const employee_id=String(b.employee_id||""),adjustment_date=String(b.adjustment_date||""),amount=Number(b.amount),adjustment_type=String(b.adjustment_type||""),reason=String(b.reason||"").trim();
   if(!/^[0-9a-f-]{36}$/i.test(employee_id)||!/^(\d{4})-(\d{2})-(\d{2})$/.test(adjustment_date)||!Number.isFinite(amount)||amount<=0||!["addition","deduction"].includes(adjustment_type)||reason.length<2)
    return NextResponse.json({error:"راجع بيانات الإضافة أو الخصم."},{status:400});
   const {data:existingRun,error:runError}=await a.db.from("hr_payroll_runs").select("id,status").lte("period_start",adjustment_date).gte("period_end",adjustment_date).limit(1).maybeSingle();
   if(runError)throw runError;
   if(existingRun)return NextResponse.json({error:"لا يمكن إضافة تعديل على يوم داخل كشف رواتب تم إنشاؤه بالفعل."},{status:409});
   const {data,error}=await a.db.from("hr_payroll_adjustments").insert({employee_id,adjustment_date,amount,adjustment_type,reason,created_by:a.user.id}).select("*").single();
   if(error)throw error;
   return NextResponse.json({adjustment:data},{status:201});
  }
  const start=String(b.period_start||""),end=String(b.period_end||"");
  if(!/^(\d{4})-(\d{2})-(\d{2})$/.test(start)||!/^(\d{4})-(\d{2})-(\d{2})$/.test(end)||end<start)
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