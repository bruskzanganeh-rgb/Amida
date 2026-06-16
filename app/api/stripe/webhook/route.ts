import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe, getPlanFromPriceId } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const stripe = getStripe()
  const supabase = createAdminClient()

  const body = await request.text()
  const signature = (await headers()).get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: unknown) {
    console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(stripe, supabase, event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(stripe, supabase, event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break
    }
  } catch (err) {
    // Return 500 so Stripe retries — otherwise a failed DB write would leave
    // the subscription permanently out of sync with billing.
    console.error('Stripe webhook handler failed:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutComplete(stripe: Stripe, supabase: SupabaseClient, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  if (!userId) return

  const subscriptionId = session.subscription as string
  const plan = (session.metadata?.plan as 'pro' | 'team') || 'pro'
  const companyId = session.metadata?.company_id || null

  // Fetch the Stripe subscription for period details
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)

  const { error } = await supabase
    .from('subscriptions')
    .update({
      plan,
      status: 'active',
      stripe_subscription_id: subscriptionId,
      stripe_price_id: stripeSub.items.data[0]?.price.id || null,
      current_period_start: new Date(stripeSub.start_date * 1000).toISOString(),
      current_period_end: stripeSub.ended_at ? new Date(stripeSub.ended_at * 1000).toISOString() : null,
      admin_override: false,
      ...(companyId ? { company_id: companyId } : {}),
    })
    .eq('user_id', userId)
  if (error) throw error
}

async function handleSubscriptionUpdate(stripe: Stripe, supabase: SupabaseClient, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!sub) return

  const isActive = ['active', 'trialing'].includes(subscription.status)
  const priceId = subscription.items.data[0]?.price.id
  const plan = isActive ? getPlanFromPriceId(priceId) : 'free'

  // Clear pending_plan when the plan actually changes (scheduled downgrade completed)
  const { data: currentSub } = await supabase
    .from('subscriptions')
    .select('plan, pending_plan')
    .eq('user_id', sub.user_id)
    .single()

  const pendingPlan = currentSub?.pending_plan === plan ? null : currentSub?.pending_plan

  const { error } = await supabase
    .from('subscriptions')
    .update({
      plan,
      status: subscription.status as 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete',
      stripe_price_id: priceId || null,
      current_period_start: new Date(subscription.start_date * 1000).toISOString(),
      current_period_end: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      pending_plan: pendingPlan ?? null,
      admin_override: false,
    })
    .eq('user_id', sub.user_id)
  if (error) throw error
}

async function handleSubscriptionDeleted(supabase: SupabaseClient, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!sub) return

  const { error } = await supabase
    .from('subscriptions')
    .update({
      plan: 'free',
      status: 'canceled',
      stripe_subscription_id: null,
      stripe_price_id: null,
      cancel_at_period_end: false,
      admin_override: false,
    })
    .eq('user_id', sub.user_id)
  if (error) throw error
}
