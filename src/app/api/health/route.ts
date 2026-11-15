import { NextResponse } from "next/server";
import { getAIConfiguration } from "@/lib/ai/provider";
export const runtime="nodejs";
export async function GET(){const ai=getAIConfiguration();return NextResponse.json({status:"ok",application:"industrial-hub",integrations:{supabase:process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?"configured":"missing_credentials",ai:ai.configured?"configured":"missing_credentials",aiPrimary:ai.primary,aiFallback:ai.fallback,n8n:process.env.N8N_BASE_URL&&process.env.N8N_WEBHOOK_SECRET?"configured":"missing_credentials",youtube:process.env.YOUTUBE_API_KEY?"configured":"missing_credentials"},timestamp:new Date().toISOString()})}
