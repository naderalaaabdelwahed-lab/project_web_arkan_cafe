import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

async function admin(request) {
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token) return {response:NextResponse.json({error:"سجل دخول المدير أولاً."},{status:401})};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!secret) throw new Error("Supabase server configuration is missing.");
 const auth=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data,error}=await auth.auth.getUser(token);
 if(error||!data?.user) return {response:NextResponse.json({error:"جلسة غير صالحة."},{status:401})};
 const db=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:row}=await db.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
 if(!row) return {response:NextResponse.json({error:"غير مسموح."},{status:403})};
 return {db,user:data.user};
}
export async function GET(request){
 try{const a=await admin(request);if(a.response)return a.response;
 const {data,error}=await a.db.from("hr_kiosk_devices").select("id,name,is_active,last_seen_at,created_at").order("created_at",{ascending:false});
 if(error)throw error;return NextResponse.json({devices:data||[]});
 }catch(e){return NextResponse.json({error:e.message||"تعذر تحميل الأجهزة."},{status:500})}
}
export async function POST(request){
 try{const a=await admin(request);if(a.response)return a.response;
 const body=await request.json(),name=String(body.name||"جهاز الحضور").trim().slice(0,80);
 const token=randomBytes(32).toString("hex"),token_hash=createHash("sha256").update(token).digest("hex");
 const {data,error}=await a.db.from("hr_kiosk_devices").insert({name,token_hash,created_by:a.user.id}).select("id,name,is_active,created_at").single();
 if(error)throw error;return NextResponse.json({device:data,device_token:token},{status:201});
 }catch(e){return NextResponse.json({error:e.message||"تعذر إنشاء الجهاز."},{status:400})}
}
export async function PATCH(request){
 try{const a=await admin(request);if(a.response)return a.response;
 const {id,is_active}=await request.json();
 const {data,error}=await a.db.from("hr_kiosk_devices").update({is_active:!!is_active}).eq("id",id).select("id,name,is_active").single();
 if(error)throw error;return NextResponse.json({device:data});
 }catch(e){return NextResponse.json({error:e.message||"تعذر تحديث الجهاز."},{status:400})}
}
