"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import AdminAttendancePage from "@/app/admin/hr/attendance/page";
import EmployeeAttendance from "./EmployeeAttendance";
export default function HrAttendanceRoute(){
 const [admin,setAdmin]=useState(null);
 useEffect(()=>{let active=true;supabase.rpc("is_admin").then(({data,error})=>{if(active)setAdmin(!error&&data===true);});return()=>{active=false;};},[]);
 if(admin===null)return <main className="hr-content">جارٍ تحميل صفحة الحضور...</main>;
 return admin?<AdminAttendancePage/>:<EmployeeAttendance/>;
}
