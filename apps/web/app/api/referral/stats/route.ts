import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../../lib/mini-auth';
import { supabaseSelect, supabaseUpsert } from '../../../../lib/supabase-admin';
async function ensureUser(user: ReturnType<typeof requireTelegramUser>): Promise<string> {
  const rows=await supabaseUpsert('cp_users',{telegram_user_id:user.id,username:user.username??null,display_name:[user.first_name,user.last_name].filter(Boolean).join(' ')||null,language:user.language_code==='ar'?'ar':'en'},'telegram_user_id');
  const id=rows[0]?.id;if(typeof id!=='string')throw new Error('Unable to resolve CryptoPulse user.');return id;
}
export async function GET(request:NextRequest):Promise<Response>{
  try{
    const user=requireTelegramUser(request);const userId=await ensureUser(user);
    const [dRows,nRows,cRows,lRows]=await Promise.all([
      supabaseSelect('cp_referral_stats','referrer_user_id=eq.'+encodeURIComponent(userId)+'&select=referrals,activated_referrals,shared_referrals,first_referral_at&limit=1'),
      supabaseSelect('cp_paid_referral_network_stats','root_user_id=eq.'+encodeURIComponent(userId)+'&select=paid_network_users,network_users&limit=1'),
      supabaseSelect('cp_referral_reward_claims','user_id=eq.'+encodeURIComponent(userId)+'&select=paid_users_threshold,reward_stars,status,qualifying_paid_users,created_at,paid_at&order=paid_users_threshold.asc&limit=100'),
      supabaseSelect('cp_referral_reward_levels','select=paid_users_threshold,reward_stars&order=paid_users_threshold.asc&limit=100')
    ]);
    const d=dRows[0]??{},n=nRows[0]??{};
    return Response.json({ok:true,referrals:Number(d.referrals??0),activatedReferrals:Number(d.activated_referrals??0),sharedReferrals:Number(d.shared_referrals??0),paidNetworkUsers:Number(n.paid_network_users??0),networkUsers:Number(n.network_users??0),levels:lRows.map(r=>({threshold:Number(r.paid_users_threshold),stars:Number(r.reward_stars)})),rewards:cRows.map(r=>({threshold:Number(r.paid_users_threshold),stars:Number(r.reward_stars),status:r.status,qualifyingPaidUsers:Number(r.qualifying_paid_users),createdAt:r.created_at,paidAt:r.paid_at??null}))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to load referral stats.'},{status:400});}
}
