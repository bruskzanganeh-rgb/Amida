import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST() {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // Get all categories for the prompt
  const { data: categories } = await supabase.from('instrument_categories').select('id, name, slug').order('sort_order')

  if (!categories) {
    return NextResponse.json({ error: 'Could not load categories' }, { status: 500 })
  }

  // Get users with non-empty instruments_text + their email/company_name
  const { data: settings } = await supabase
    .from('company_settings')
    .select('user_id, instruments_text, email, company_name')
    .neq('instruments_text', '')

  if (!settings || settings.length === 0) {
    return NextResponse.json({ results: [], message: 'No free text to analyze' })
  }

  // Get existing user_categories to find unmatched users
  const userIds = settings.map((s) => s.user_id).filter((id): id is string => id != null)
  const { data: existingUc } = await supabase.from('user_categories').select('user_id').in('user_id', userIds)

  const usersWithCategories = new Set((existingUc || []).map((uc) => uc.user_id))

  // Filter to users who have free text but no categories
  const unmatchedUsers = settings.filter(
    (s) => s.user_id && !usersWithCategories.has(s.user_id) && s.instruments_text?.trim(),
  )

  if (unmatchedUsers.length === 0) {
    return NextResponse.json({ results: [], message: 'All users with free text already have categories' })
  }

  // Build the AI prompt — match to CATEGORIES, not instruments
  const categoryList = categories.map((c) => `- ${c.name} (id: ${c.id}, slug: ${c.slug})`).join('\n')

  const userEntries = unmatchedUsers
    .slice(0, 50)
    .map((u, idx) => `${idx + 1}. user_id: "${u.user_id}" → "${u.instruments_text}"`)
    .join('\n')

  const prompt = `You are analyzing free-text entries from freelancers describing their skills/instruments/profession. Match each entry to the most appropriate category.

Available categories:
${categoryList}

Users to analyze:
${userEntries}

For each user, analyze their free text and suggest category matches. Return a JSON array:
[
  {
    "user_id": "...",
    "matches": [
      {
        "text": "the original text fragment",
        "category_id": "uuid of best matching category, or null if no match",
        "category_name": "category name or null",
        "confidence": 0.0-1.0
      }
    ]
  }
]

Rules:
- Split comma-separated texts into individual items
- Match variations: "barockviolin" → Stråk, "piccolo" → Blås, "fotograf" → check if category exists
- If no category matches, set category_id to null
- Confidence: 1.0 = exact match, 0.7-0.9 = close variation, 0.3-0.6 = weak match, 0.0 = no match
- Return ONLY valid JSON, no markdown`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse AI response', raw: responseText }, { status: 500 })
    }

    const results = JSON.parse(jsonMatch[0])

    // Enrich results with email and company_name
    const settingsMap = new Map(unmatchedUsers.map((u) => [u.user_id, u]))
    for (const r of results) {
      const userSettings = settingsMap.get(r.user_id)
      r.email = userSettings?.email || null
      r.company_name = userSettings?.company_name || null
    }

    return NextResponse.json({
      results,
      analyzed: unmatchedUsers.length,
      tokens: { input: message.usage.input_tokens, output: message.usage.output_tokens },
    })
  } catch (err) {
    console.error('AI analysis error:', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }
}
