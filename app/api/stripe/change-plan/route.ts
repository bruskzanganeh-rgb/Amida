import { createClient } from '@/lib/supabase/server'
import { getStripe, getPlanFromPriceId } from '@/lib/stripe'
import { NextResponse } from 'next/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

const PRICE_IDS: Record<string, string | undefined> = {
  'pro-monthly': process.env.STRIPE_PRO_MONTHLY_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID,
  'pro-yearly': process.env.STRIPE_PRO_YEARLY_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID,
  'team-monthly': process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID,
  'team-yearly': process.env.STRIPE_TEAM_YEARLY_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_TEAM_YEARLY_PRICE_ID,
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success: rl } = rateLimit(`change-plan:${ip}`, 5, 60_000)
  if (!rl) return rateLimitResponse()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { plan, interval } = await request.json()
  if (!plan || !interval) {
    return NextResponse.json({ error: 'plan and interval are required' }, { status: 400 })
  }

  const priceId = PRICE_IDS[`${plan}-${interval}`]
  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan/interval combination' }, { status: 400 })
  }

  const targetPlan = plan as string

  // For team plan, verify the user is a company owner
  if (targetPlan === 'team') {
    const { data: membership } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only company owners can subscribe to team plan' }, { status: 403 })
    }
  }

  // Get current subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  if (!sub?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active Stripe subscription to modify' }, { status: 400 })
  }

  // Determine current plan
  const { data: currentSub } = await supabase.from('subscriptions').select('plan').eq('user_id', user.id).maybeSingle()

  const currentPlan = currentSub?.plan || 'free'
  const isDowngrade = currentPlan === 'team' && targetPlan === 'pro'

  // Block team→pro downgrade while extra members exist. Pro is single-user,
  // so silently letting the schedule activate would either revoke other
  // members or lock them in a paid feature with no plan — both surprising.
  // Force the owner to remove members explicitly first.
  if (isDowngrade) {
    const { data: members } = await supabase
      .from('company_members')
      .select('user_id, role')
      .order('role', { ascending: true }) // owners first if any tie
    const memberCount = members?.length || 0
    if (memberCount > 1) {
      return NextResponse.json(
        {
          error: 'remove_members_first',
          message: `Pro is a single-user plan. Remove ${memberCount - 1} member(s) before downgrading.`,
          memberCount,
        },
        { status: 409 },
      )
    }
  }

  try {
    const stripe = getStripe()
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const itemId = stripeSub.items.data[0]?.id

    if (!itemId) {
      return NextResponse.json({ error: 'No subscription item found' }, { status: 400 })
    }

    if (isDowngrade) {
      // Schedule downgrade at period end using Stripe Subscription Schedules
      const currentPriceId = stripeSub.items.data[0]?.price.id

      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: sub.stripe_subscription_id,
      })

      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: currentPriceId, quantity: 1 }],
            start_date: schedule.phases[0].start_date,
            end_date: schedule.phases[0].end_date,
          },
          {
            items: [{ price: priceId, quantity: 1 }],
          },
        ],
      })

      // Store pending downgrade in DB
      await supabase.from('subscriptions').update({ pending_plan: targetPlan }).eq('user_id', user.id)

      return NextResponse.json({ success: true, scheduled: true, plan: targetPlan })
    } else {
      // Immediate upgrade with proration
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'create_prorations',
      })

      const newPriceId = updated.items.data[0]?.price.id
      await supabase
        .from('subscriptions')
        .update({
          plan: getPlanFromPriceId(newPriceId),
          stripe_price_id: newPriceId,
          pending_plan: null,
        })
        .eq('user_id', user.id)

      return NextResponse.json({ success: true, plan: getPlanFromPriceId(newPriceId) })
    }
  } catch (err: unknown) {
    console.error('Change plan error:', err)
    const message = err instanceof Error ? err.message : 'Failed to change plan'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
