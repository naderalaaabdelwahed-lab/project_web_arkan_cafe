"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";
const items=[["/hr/employees","شؤون الموظفين","ملفات الموظفين وإنشاء حسابات الدخول"],["/hr/shifts","الشيفتات","إنشاء الشيفتات وتكليف الموظفين"],["/hr/attendance","الحضور والانصراف","مراجعة السجلات والغياب وتصحيح الأوقات"],["/admin/hr/payroll","الرواتب","حساب الرواتب والمراجعة والتسوية"]];
export default function HrManagement(){
 const router=useRouter();const [ok,setOk]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{supabase.rpc("is_admin").then(({data,error})=>{if(error||data!==true)router.replace("/hr");else setOk(true);setLoading(false);});},[router]);
 if(loading)return <main dir="rtl" style={{padding:30,color:"white"}}>جارٍ التحقق من الصلاحيات...</main>;
 if(!ok)return null;
 return <main dir="rtl" style={{minHeight:"100vh",background:"#101820",color:"#fff",padding:28}}><div style={{maxWidth:1100,margin:"auto"}}><h1>إدارة الموارد البشرية</h1><p style={{color:"#aebdca"}}>إدارة مستقلة لشؤون العاملين داخل ARKAN.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:16,marginTop:24}}>{items.map(([href,title,desc])=><Link key={href} href={href} style={{background:"#1b2935",border:"1px solid #405365",borderRadius:14,padding:22,color:"white",textDecoration:"none"}}><h2>{title}</h2><p style={{color:"#aebdca"}}>{desc}</p><b style={{color:"#d6a44d"}}>فتح القسم ←</b></Link>)}</div><p style={{marginTop:25}}><Link href="/admin" style={{color:"#d6a44d"}}>العودة إلى لوحة الأدمن</Link></p></div></main>;
}
