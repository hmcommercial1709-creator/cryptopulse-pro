import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../../lib/mini-auth';
import { supabaseSelect, supabaseUpsert } from '../../../../lib/supabase-admin';

async function ensureUser(user: ReturnType<typeof requireTelegramUser>): Promise<string> {
  const rows = await supabaseUpsert('cp_users', { telegram_user_id:user.id, username:user.username??null, display_name:[user.first_name,user.last_name].filter(Boolean).join(' ')||null, language:user.language_code==='ar'?'ar':'en' }, 'telegram_user_id');
  const id=rows[0]?.id; if(typeof id!=='string') throw new Error('Unable to resolve CryptoPulse user.'); return id;
}
export async function POST(request:NextRequest):Promise<Response>{
  try{
    const user=requireTelegramUser(request);const userId=await ensureUser(user);
    const payments=await supabaseSelect('cp_stars_payments','user_id=eq.'+encodeURIComponent(userId)+'&plan=eq.pro&refunded=eq.false&select=amount_stars,subscription_expiration_date,is_recurring,is_first_recurring&order=created_at.desc&limit=20');
    const latest=payments[0];if(!latest)return Response.json({ok:true,pro:false,subscription:null});
    const expiresAt=typeof latest.subscription_expiration_date==='string'?latest.subscription_expiration_date:null;
    const active=expiresAt?new Date(expiresAt).getTime()>Date.now():true;
    return Response.json({ok:true,pro:active,subscription:{priceStars:Number(latest.amount_stars),expiresAt,isRecurring:Boolean(latest.is_recurring)}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to reconcile Pro.'},{status:400});}
}
