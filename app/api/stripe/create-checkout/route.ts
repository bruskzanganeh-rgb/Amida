import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'
import { createCheckoutSchema } from '@/lib/schemas/stripe'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`checkout:${ip}`, 5, 60_000)
  if (!success) return rateLimitResponse()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createCheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const { priceId, plan, trial } = parsed.data

  // Get or create Stripe customer
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  let customerId = subscription?.stripe_customer_id

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id

    await supabase.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', user.id)
  }

  // For team plan, verify the user is a company owner
  let companyId: string | undefined
  if (plan === 'team') {
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only company owners can subscribe to team plan' }, { status: 403 })
    }
    companyId = membership.company_id
  }

  // Check if user is eligible for trial (never had a Stripe subscription)
  const canTrial = trial && !subscription?.stripe_customer_id

  // Create Checkout Session
  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    ...(canTrial ? { subscription_data: { trial_period_days: 14 } } : {}),
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgrade=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgrade=canceled`,
    metadata: {
      user_id: user.id,
      plan: plan || 'pro',
      ...(companyId ? { company_id: companyId } : {}),
    },
  })

  return NextResponse.json({ url: session.url })
}
