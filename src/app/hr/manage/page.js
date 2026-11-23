"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";
const items=[
 ["/hr/manage/attendance-code","⌁","تسجيل الحضور بالكود","تسجيل حضور الموظف أو انصرافه باستخدام كوده الشخصي المكوّن من 6 أرقام","فتح شاشة التسجيل"],
 ["/hr/employees","♙","شؤون الموظفين","إضافة الموظفين وتحديث ملفاتهم وإنشاء حساب HR منفصل لكل موظف","إدارة الموظفين"],
 ["/hr/shifts","◷","الشيفتات","إنشاء مواعيد العمل وتوزيع الشيفتات على الموظفين","إعداد الشيفتات"],
 ["/hr/attendance","✓","الحضور والانصراف","متابعة سجلات الحضور والغياب وتصحيح أوقات التسجيل","مراجعة الحضور"],
 ["/hr/payroll","ج.م","الرواتب","حساب كشوف الرواتب والإضافي والخصومات والمكافآت","إدارة الرواتب"]
];
export default function HrManagement(){
 const router=useRouter();const [ok,setOk]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;supabase.rpc("is_admin").then(({data,error})=>{if(!active)return;if(error||data!==true)router.replace("/hr");else setOk(true);setLoading(false);});return()=>{active=false;};},[router]);
 if(loading)return <main className="hr-content">جارٍ التحقق من الصلاحيات...</main>;
 if(!ok)return null;
 return <main className="hr-content">
  <header className="hr-page-heading"><span style={{color:"#c9a45c",fontSize:12,fontWeight:800,letterSpacing:2}}>ARKAN · HUMAN RESOURCES</span><h1>إدارة الموارد البشرية</h1><p>كل أدوات إدارة فريق العمل في مكان واحد، منفصلة عن حسابات وصلاحيات نظام التشغيل والمخزن.</p></header>
  <section className="hr-panel" style={{background:"linear-gradient(115deg,#302416,#1c1711)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,flexWrap:"wrap"}}>
   <div><h2 style={{margin:"0 0 8px",color:"#f4e9d8"}}>إدارة فريق ARKAN</h2><p style={{margin:0,color:"#ad9e88",lineHeight:1.8}}>حسابات HR مخصصة للحضور والانصراف فقط، ولا تمنح الموظف صلاحية دخول لوحة الإدارة.</p></div>
   <Link href="/hr/employees" className="hr-action" style={{textDecoration:"none"}}>＋ إضافة موظف</Link>
  </section>
  <section className="hr-stat-grid">{items.map(([href,icon,title,desc,action])=><Link key={href} href={href} className="hr-panel" style={{textDecoration:"none",color:"#f4e9d8",display:"grid",gap:12,transition:"transform .2s,border-color .2s"}}><span style={{width:46,height:46,display:"grid",placeItems:"center",borderRadius:12,background:"#c9a45c20",border:"1px solid #8b6d3c",color:"#e4bd75",fontWeight:900,fontSize:19}}>{icon}</span><div><h2 style={{fontSize:19,margin:"0 0 8px"}}>{title}</h2><p style={{fontSize:13,color:"#ad9e88",lineHeight:1.8,margin:0}}>{desc}</p></div><span style={{color:"#d6b875",fontWeight:800,fontSize:13,marginTop:5}}>{action} ←</span></Link>)}</section>
 </main>;
}
