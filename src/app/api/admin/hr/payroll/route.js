import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
function service(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})}
async function admin(request){const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return {response:NextResponse.json({error:"سجل دخول المدير أولاً."},{status:401})};const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});const {data,error}=await auth.auth.getUser(token);if(error||!data?.user)return {response:NextResponse.json({error:"جلسة غير صالحة."},{status:401})};const db=service(),{data:row}=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();return row?{db,user:data.user}:{response:NextResponse.json({error:"غير مسموح."},{status:403})}}
export async function GET(request){try{const a=await admin(request);if(a.response)return a.response;const [{data:runs,error},{data:employees,error:ee},{data:adjustments,error:ae}]=await Promise.all([a.db.from("hr_payroll_runs").select("*,hr_payroll_items(*)").order("created_at",{ascending:false}),a.db.from("hr_employees").select("id,full_name").eq("employment_status","active").order("full_name"),a.db.from("hr_payroll_adjustments").select("id,employee_id,adjustment_date,amount,adjustment_type,reason").order("adjustment_date",{ascending:false}).limit(100)]);if(error)throw error;if(ee)throw ee;if(ae)throw ae;return NextResponse.json({runs:runs||[],employees:employees||[],adjustments:adjustments||[]})}catch(e){return NextResponse.json({error:e.message||"تعذر تحميل الرواتب."},{status:500})}}
export async function POST(request){
 try{const a=await admin(request);if(a.response)return a.response;const b=await request.json();
  if(b.action==="adjustment"){
   const employee_id=String(b.employee_id||""),adjustment_date=String(b.adjustment_date||""),amount=Number(b.amount),adjustment_type=String(b.adjustment_type||""),reason=String(b.reason||"").trim();
   if(!/^[0-9a-f-]{36}$/i.test(employee_id)||!/^\d{4}-\d{2}-\d{2}$/.test(adjustment_date)||!Number.isFinite(amount)||amount<=0||!["addition","deduction"].includes(adjustment_type)||reason.length<2)return NextResponse.json({error:"راجع بيانات الإضافة أو الخصم."},{status:400});
   const {data,error}=await a.db.from("hr_payroll_adjustments").insert({employee_id,adjustment_date,amount,adjustment_type,reason,created_by:a.user.id}).select("*").single();if(error)throw error;return NextResponse.json({adjustment:data},{status:201});
  }
  const start=String(b.period_start||""),end=String(b.period_end||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return NextResponse.json({error:"حدد فترة صحيحة."},{status:400});
  const db=a.db;const {data:old}=await db.from("hr_payroll_runs").select("id").eq("period_start",start).eq("period_end",end).maybeSingle();if(old)return NextResponse.json({error:"يوجد كشف رواتب لهذه الفترة بالفعل."},{status:409});
  const [{data:employees,error:ee},{data:attendance,error:ae},{data:adjustments,error:ad}]=await Promise.all([
   db.from("hr_employees").select("*").eq("employment_status","active").lte("hire_date",end),
   db.from("hr_attendance").select("employee_id,shift_date,attendance_status,late_minutes,overtime_minutes,worked_minutes").gte("shift_date",start).lte("shift_date",end),
   db.from("hr_payroll_adjustments").select("*").gte("adjustment_date",start).lte("adjustment_date",end)
  ]);if(ee)throw ee;if(ae)throw ae;if(ad)throw ad;
  const {data:run,error:re}=await db.from("hr_payroll_runs").insert({period_start:start,period_end:end,status:"draft",created_by:a.user.id}).select("*").single();if(re)throw re;
  const days=Math.max(1,Math.round((Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000)+1),items=[];
  for(const emp of employees||[]){const rows=(attendance||[]).filter(x=>x.employee_id===emp.id),adj=(adjustments||[]).filter(x=>x.employee_id===emp.id);
   const dayRate=Number(emp.monthly_salary||0)/30,hourRate=Number(emp.monthly_salary||0)/(Math.max(1,Number(emp.daily_work_hours||8))*26);
   const absent=rows.filter(x=>["absent","unpaid_leave"].includes(x.attendance_status)).length,paidLeave=rows.filter(x=>x.attendance_status==="paid_leave").length;
   const late=rows.reduce((n,x)=>n+Number(x.late_minutes||0),0),overtime=rows.reduce((n,x)=>n+Number(x.overtime_minutes||0),0);
   const latenessDeduction=late/60*hourRate,absenceDeduction=absent*dayRate,overtimeAmount=overtime/60*Number(emp.overtime_hour_rate||0);
   const otherDeductions=adj.filter(x=>x.adjustment_type==="deduction").reduce((n,x)=>n+Number(x.amount),0),additions=adj.filter(x=>x.adjustment_type==="addition").reduce((n,x)=>n+Number(x.amount),0);
   const baseSalary=Number(emp.monthly_salary||0)*Math.min(days,30)/30;
   const net=Math.max(0,baseSalary-latenessDeduction-absenceDeduction+overtimeAmount-otherDeductions+additions);
   items.push({payroll_run_id:run.id,employee_id:emp.id,employee_name_snapshot:emp.full_name,monthly_salary:baseSalary,overtime_amount:overtimeAmount,lateness_deduction:latenessDeduction,other_deductions:otherDeductions+absenceDeduction,additions,paid_leave_days:paidLeave,net_salary:net,details:{period_days:days,absent_days:absent,paid_leave_days:paidLeave,late_minutes:late,overtime_minutes:overtime,absence_deduction:absenceDeduction,adjustments:adj}});
  }
  const {error:ie}=await db.from("hr_payroll_items").insert(items);if(ie){await db.from("hr_payroll_runs").delete().eq("id",run.id);throw ie}
  return NextResponse.json({run,items},{status:201});
 }catch(e){console.error("HR payroll POST",e);return NextResponse.json({error:e.message||"تعذر إنشاء كشف الرواتب."},{status:400})}
}
export async function PATCH(request){try{const a=await admin(request);if(a.response)return a.response;const b=await request.json();if(!/^[0-9a-f-]{36}$/i.test(String(b.id||"")))return NextResponse.json({error:"كشف غير صحيح."},{status:400});const {data,error}=await a.db.from("hr_payroll_runs").update({status:"finalized",finalized_by:a.user.id,finalized_at:new Date().toISOString()}).eq("id",b.id).eq("status","draft").select("*").single();if(error)throw error;return NextResponse.json({run:data})}catch(e){return NextResponse.json({error:e.message||"تعذر اعتماد الكشف."},{status:400})}}