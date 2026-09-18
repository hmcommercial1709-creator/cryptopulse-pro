import { NextRequest } from 'next/server';
import { requireTelegramUser } from '../../../../lib/mini-auth';
import { supabaseSelect } from '../../../../lib/supabase-admin';

type Row={rank:number;telegram_user_id:number;username:string|null;display_name:string|null;qualifying_paid_users:number;accrued_stars:number};

export async function GET(request:NextRequest):Promise<Response>{
  try{
    const viewer=requireTelegramUser(request);
    const [rows,tiers]=await Promise.all([supabaseSelect('cp_referral_leaderboard','select=rank,telegram_user_id,username,display_name,qualifying_paid_users,accrued_stars&order=rank.asc&limit=100') as Promise<Row[]>,supabaseSelect('cp_referral_vip_tiers','select=paid_users_threshold,title,internal_share_permille&order=paid_users_threshold.asc&limit=100')]);
    const safe=rows.map((r)=>({
      rank:Number(r.rank),
      name:r.username?('@'+r.username):(r.display_name?.slice(0,40)??'CryptoPulse user'),
      qualifyingPaidUsers:Number(r.qualifying_paid_users??0),
      accruedStars:Number(r.accrued_stars??0),
      isYou:Number(r.telegram_user_id)===Number(viewer.id),vipTitle:(tiers as Array<{paid_users_threshold:number;title:string}>).filter(t=>Number(t.paid_users_threshold)<=Number(r.qualifying_paid_users)).at(-1)?.title??'Member'
    }));
    const me=safe.find((r)=>r.isYou)??null;
    return Response.json({ok:true,updatedAt:new Date().toISOString(),leaderboard:safe,me},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Unable to load leaderboard.'},{status:400});
  }
}
