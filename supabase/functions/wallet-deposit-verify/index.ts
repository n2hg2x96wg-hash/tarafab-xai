import { createClient } from 'npm:@supabase/supabase-js@2'
import { createPublicClient, http, formatEther, type Hash } from 'npm:viem@2'
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'npm:viem@2/chains'
const CHAINS = { 1: mainnet, 8453: base, 42161: arbitrum, 10: optimism, 137: polygon, 56: bsc } as const
const PUBLIC_RPC: Record<number,string> = { 1:'https://ethereum-rpc.publicnode.com',8453:'https://mainnet.base.org',42161:'https://arb1.arbitrum.io/rpc',10:'https://mainnet.optimism.io',137:'https://polygon-bor-rpc.publicnode.com',56:'https://bsc-dataseed.bnbchain.org' }
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, HASH=/^0x[0-9a-fA-F]{64}$/
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!, ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!, SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
Deno.serve(async req=>{
  if(req.method!=='POST') return json({error:'Method not allowed.'},405)
  const auth=req.headers.get('Authorization')||''
  if(!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(auth)) return json({error:'Please sign in again.'},401)
  const caller=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:who,error:whoErr}=await caller.auth.getUser()
  if(whoErr||!who?.user) return json({error:'Please sign in again.'},401)
  let body:Record<string,unknown>
  try{body=await req.json()}catch{return json({error:'Invalid request.'},400)}
  const intentId=String(body.intent_id||''), txHash=String(body.tx_hash||'').trim()
  if(!UUID.test(intentId)||!HASH.test(txHash)) return json({error:'Invalid deposit verification request.'},400)
  const service=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:intent,error:intentErr}=await service.from('wallet_deposit_intents')
    .select('id,user_id,chain_id,network,symbol,from_address,receiving_address,requested_amount,status,expires_at')
    .eq('id',intentId).eq('user_id',who.user.id).maybeSingle()
  if(intentErr) return json({error:'Deposit verification is temporarily unavailable.'},503)
  if(!intent) return json({error:'Deposit request not found.'},404)
  if(intent.status==='completed') return json({status:'completed'})
  if(new Date(intent.expires_at).getTime()<Date.now()) return json({error:'This deposit request expired. Start a new transfer.',status:'expired'},410)
  const chain=CHAINS[intent.chain_id as keyof typeof CHAINS], rpc=PUBLIC_RPC[intent.chain_id]
  if(!chain||!rpc) return json({error:'This network is not supported for verification yet.'},400)
  try{
    const client=createPublicClient({chain,transport:http(Deno.env.get('WALLET_RPC_'+intent.chain_id)||rpc,{timeout:12000,retryCount:1})})
    const tx=await client.getTransaction({hash:txHash as Hash})
    if(tx.chainId!==intent.chain_id) return json({error:'That transaction belongs to a different network.'},400)
    if(String(tx.from).toLowerCase()!==String(intent.from_address).toLowerCase()) return json({error:'The transaction sender does not match your linked wallet.'},400)
    if(!tx.to||String(tx.to).toLowerCase()!==String(intent.receiving_address).toLowerCase()) return json({error:'The transaction was not sent to the Tarafab receiving address.'},400)
    const actual=Number(formatEther(tx.value))
    const requested=Number(intent.requested_amount)
    if(!Number.isFinite(actual)||actual<=0||!Number.isFinite(requested)||actual+1e-15<requested) return json({error:'The transaction amount is lower than the transfer request.',status:'amount_mismatch'},400)
    const receipt=await client.getTransactionReceipt({hash:txHash as Hash})
    if(receipt.status!=='success') return json({error:'The blockchain transaction failed or was reverted.',status:'failed'},400)
    const currentBlock=await client.getBlockNumber()
    const confirmations=Number(currentBlock-receipt.blockNumber+1n)
    const {data:cfg}=await service.from('wallet_deposit_configs').select('confirmations').eq('chain_id',intent.chain_id).eq('asset','native').eq('enabled',true).maybeSingle()
    const required=Math.max(1,Number(cfg?.confirmations||1))
    if(confirmations<required){
      await service.from('wallet_deposit_intents').update({status:'pending_verification',tx_hash:txHash.toLowerCase(),updated_at:new Date().toISOString()}).eq('id',intent.id)
      return json({status:'pending_verification',confirmations,required_confirmations:required})
    }
    const {data,error}=await service.rpc('wallet_credit_verified_deposit',{p_intent_id:intent.id,p_tx_hash:txHash.toLowerCase(),p_actual_amount:actual})
    if(error) return json({error:'The deposit could not be credited.',status:'failed'},409)
    return json(data||{status:'completed'})
  }catch(e){console.error('wallet-deposit-verify:',e instanceof Error?e.name:'provider error');return json({error:'The blockchain could not be reached right now. Try verification again shortly.',status:'provider_unavailable'},503)}
})
