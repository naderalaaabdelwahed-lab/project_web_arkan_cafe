"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {supabase} from "@/lib/supabase";
export default function HrLayout({children}){
 const pathname=usePathname();const [isAdmin,setIsAdmin]=useState(false);
 useEffect(()=>{let active=true;supabase.rpc("is_admin").then(({data})=>{if(active)setIsAdmin(data===true);});return()=>{active=false;};},[]);
 return <><header dir="rtl" style={{background:"#0c141b",borderBottom:"1px solid #344657",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",color:"#fff"}}>
  <Link href="/hr" style={{fontWeight:900,fontSize:20,color:"#d6a44d",textDecoration:"none"}}>ARKAN HR</Link>
  {isAdmin?<nav style={{display:"flex",gap:14,flexWrap:"wrap"}}>{[["/hr/manage","الرئيسية"],["/hr/employees","شؤون الموظفين"],["/hr/shifts","الشيفتات"],["/hr/attendance","الحضور والانصراف"],["/hr/payroll","الرواتب"]].map(([href,label])=><Link key={href} href={href} style={{color:pathname===href?"#d6a44d":"#e8edf2",textDecoration:"none"}}>{label}</Link>)}</nav>:<span style={{color:"#aebdca"}}>بوابة الموظفين</span>}
 </header>{children}</>;
}
