import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const since=new Date(Date.now()-30*86400000).toISOString();
 const {data,error}=await db.from("ai_usage_logs").select("task,provider,model,input_tokens,output_tokens,total_tokens,estimated_cost_usd,cost_currency,cost_is_estimate,fallback_used,duration_ms,created_at").eq("owner_id",user.id).gte("created_at",since).order("created_at",{ascending:false}).limit(2000);
 if(error)return NextResponse.json({error:"Could not load AI usage. Apply migration 20261126000100 first.",details:error.message},{status:503});
 const rows=data??[],total=(key:"input_tokens"|"output_tokens"|"total_tokens")=>rows.reduce((n,x)=>n+Number(x[key]??0),0);
 const byProvider=Object.values(rows.reduce<Record<string,{provider:string;calls:number;tokens:number;estimatedCostUsd:number;fallbackCalls:number}>>((a,x)=>{const k=x.provider||"unknown";a[k]??={provider:k,calls:0,tokens:0,estimatedCostUsd:0,fallbackCalls:0};a[k].calls++;a[k].tokens+=Number(x.total_tokens??0);a[k].estimatedCostUsd+=Number(x.estimated_cost_usd??0);if(x.fallback_used)a[k].fallbackCalls++;return a;},{}));
 const byDay=Object.values(rows.reduce<Record<string,{date:string;calls:number;tokens:number;estimatedCostUsd:number}>>((a,x)=>{const date=String(x.created_at).slice(0,10);a[date]??={date,calls:0,tokens:0,estimatedCostUsd:0};a[date].calls++;a[date].tokens+=Number(x.total_tokens??0);a[date].estimatedCostUsd+=Number(x.estimated_cost_usd??0);return a;},{})).sort((a,b)=>a.date.localeCompare(b.date));
 const cost=Number(rows.reduce((n,x)=>n+Number(x.estimated_cost_usd??0),0).toFixed(8)),budget=Number(process.env.AI_MONTHLY_BUDGET_USD);
 return NextResponse.json({periodDays:30,calls:rows.length,inputTokens:total("input_tokens"),outputTokens:total("output_tokens"),totalTokens:total("total_tokens"),estimatedCostUsd:cost,currency:rows[0]?.cost_currency??"USD",allCostsEstimated:rows.every(x=>x.cost_is_estimate!==false),fallbackCalls:rows.filter(x=>x.fallback_used).length,budgetUsd:Number.isFinite(budget)&&budget>0?budget:null,budgetUtilization:Number.isFinite(budget)&&budget>0?Number((cost/budget*100).toFixed(1)):null,byProvider,byDay});
}