import {randomBytes,scrypt as scryptCallback} from "node:crypto";
import {promisify} from "node:util";
import {NextRequest,NextResponse} from "next/server";
import {createSupabaseAdminClient,getAppUser} from "@/lib/auth/session";
export const runtime="nodejs";
const scrypt=promisify(scryptCallback);
export async function GET(){
 const actor=await getAppUser();if(!actor||!["owner","admin"].includes(actor.role||""))return NextResponse.json({error:"Forbidden."},{status:403});
 const {data,error}=await createSupabaseAdminClient().from("app_users").select("id,email,display_name,role,created_at,last_login_at").order("created_at");
 if(error)return NextResponse.json({error:"Could not load application users."},{status:500});
 return NextResponse.json({users:data||[]});
}
export async function POST(request:NextRequest){
 const actor=await getAppUser();if(!actor||!["owner","admin"].includes(actor.role||""))return NextResponse.json({error:"Forbidden."},{status:403});
 let body:{email?:unknown;password?:unknown;displayName?:unknown;role?:unknown};
 try{body=await request.json();}catch{return NextResponse.json({error:"Invalid request body."},{status:400});}
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const password=typeof body.password==="string"?body.password:"";
 const displayName=typeof body.displayName==="string"?body.displayName.trim().slice(0,80):null;
 const role=body.role==="admin"?"admin":"member";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Enter a valid email."},{status:400});
 if(password.length<12||password.length>256)return NextResponse.json({error:"Password must contain at least 12 characters."},{status:400});
 const salt=randomBytes(16);const key=await scrypt(password,salt,64) as Buffer;
 const passwordHash=`scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
 const db=createSupabaseAdminClient();
 const {data:existing,error:lookupError}=await db.from("app_users").select("id,password_hash").eq("email",email).maybeSingle();
 if(lookupError)return NextResponse.json({error:"Could not verify account."},{status:500});
 if(existing?.password_hash)return NextResponse.json({error:"An account with this email already exists."},{status:409});
 let result;
 if(existing){result=await db.from("app_users").update({password_hash:passwordHash,display_name:displayName,role,updated_at:new Date().toISOString()}).eq("id",existing.id).select("id,email,display_name,role").single();}
 else{result=await db.from("app_users").insert({email,password_hash:passwordHash,display_name:displayName,role}).select("id,email,display_name,role").single();}
 if(result.error)return NextResponse.json({error:"Could not create application account."},{status:500});
 return NextResponse.json({user:result.data}, {status:201});
}
