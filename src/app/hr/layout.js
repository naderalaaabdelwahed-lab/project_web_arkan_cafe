"use client";
import "./hr.css";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";

const adminLinks=[
 ["/hr/manage","⌂","الرئيسية"],
 ["/hr/employees","♙","شؤون الموظفين"],
 ["/hr/shifts","◷","الشيفتات"],
 ["/hr/attendance","◷","الحضور والانصراف"],
 ["/hr/payroll","ج.م","الرواتب"]
];
const employeeLinks=[
 ["/hr","⌂","الرئيسية"],
 ["/hr/attendance","◷","تسجيل الحضور والانصراف"]
];
export default function HrLayout({children}){
 const pathname=usePathname(),router=useRouter();
 const [role,setRole]=useState("checking");
 useEffect(()=>{
  let active=true;
  async function verify(){
   const {data:{session},error}=await supabase.auth.getSession();
   if(!active)return;
   if(error||!session){setRole("guest");if(pathname!=="/hr")router.replace("/hr");return;}
   const {data:isAdmin,error:adminError}=await supabase.rpc("is_admin");
   if(!active)return;
   if(!adminError&&isAdmin===true){setRole("admin");if(pathname==="/hr")router.replace("/hr/manage");return;}
   if(session.user?.app_metadata?.account_type!=="hr_employee"){setRole("guest");router.replace("/admin");return;}
   setRole("employee");
   if(pathname!=="/hr"&&pathname!=="/hr/attendance"){router.replace("/hr");return;}
  }
  verify();
  const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>verify());
  return()=>{active=false;subscription.unsubscribe();};
 },[pathname,router]);
 if(role==="checking"&&pathname!=="/hr")return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#100d0b",color:"#e4bd75"}}>جارٍ التحقق من حساب HR...</main>;
 if(role==="checking"||role==="guest")return children;
 const links=role==="admin"?adminLinks:employeeLinks;
 async function logout(){await supabase.auth.signOut();router.replace("/hr");router.refresh();}
 return <div className="hr-shell" dir="rtl">
  <aside className="hr-sidebar">
   <Link href={role==="admin"?"/hr/manage":"/hr"} className="hr-brand">ARKAN<span>.</span> HR</Link>
   <p className="hr-sidebar-caption">{role==="admin"?"إدارة الموارد البشرية":"بوابة الموظفين"}</p>
   <nav className="hr-nav">{links.map(([href,icon,label])=><Link key={href} href={href} className={pathname===href?"active":""}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>
   <div className="hr-sidebar-bottom">ARKAN HR SYSTEM<br/>{role==="admin"?"إدارة شؤون العاملين":"الحضور والانصراف فقط"}<button type="button" onClick={logout} style={{display:"block",width:"100%",marginTop:12,padding:"10px 12px",border:"1px solid #66512f",borderRadius:9,background:"#c9a45c18",color:"#e8d5b1",cursor:"pointer",font:"inherit"}}>تسجيل الخروج</button></div>
  </aside>
  <section className="hr-main">{children}</section>
 </div>;
}
