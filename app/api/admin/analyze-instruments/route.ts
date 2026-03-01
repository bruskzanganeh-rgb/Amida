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

  // Get all instrument categories and instruments for the prompt
  const [{ data: categories }, { data: instruments }] = await Promise.all([
    supabase.from('instrument_categories').select('id, name, slug').order('sort_order'),
    supabase.from('instruments').select('id, name, category_id').order('sort_order'),
  ])

  if (!categories || !instruments) {
    return NextResponse.json({ error: 'Could not load instrument data' }, { status: 500 })
  }

  // Get users with non-empty instruments_text who have few or no user_instruments
  const { data: settings } = await supabase
    .from('company_settings')
    .select('user_id, instruments_text')
    .neq('instruments_text', '')

  if (!settings || settings.length === 0) {
    return NextResponse.json({ results: [], message: 'No free text instruments to analyze' })
  }

  // Get existing user_instruments to find unmatched users
  const userIds = settings.map((s) => s.user_id).filter((id): id is string => id != null)
  const { data: existingUi } = await supabase.from('user_instruments').select('user_id').in('user_id', userIds)

  const usersWithInstruments = new Set((existingUi || []).map((ui) => ui.user_id))

  // Filter to users who have free text but no structured instruments
  const unmatchedUsers = settings.filter(
    (s) => s.user_id && !usersWithInstruments.has(s.user_id) && s.instruments_text?.trim(),
  )

  if (unmatchedUsers.length === 0) {
    return NextResponse.json({ results: [], message: 'All users with free text already have structured instruments' })
  }

  // Build the AI prompt
  const categoryList = categories.map((c) => `- ${c.name} (slug: ${c.slug})`).join('\n')
  const instrumentList = instruments
    .map((i) => {
      const cat = categories.find((c) => c.id === i.category_id)
      return `- ${i.name} (id: ${i.id}, category: ${cat?.name || 'unknown'})`
    })
    .join('\n')

  const userEntries = unmatchedUsers
    .slice(0, 50) // Limit batch size
    .map((u, idx) => `${idx + 1}. user_id: "${u.user_id}" → "${u.instruments_text}"`)
    .join('\n')

  const prompt = `You are analyzing free-text instrument entries from musicians. Match each entry to existing instruments and categories.

Available instrument categories:
${categoryList}

Available instruments in database:
${instrumentList}

Users with free-text instruments to analyze:
${userEntries}

For each user, analyze their free text and suggest matches. Return a JSON array:
[
  {
    "user_id": "...",
    "matches": [
      {
        "text": "the original text fragment",
        "instrument_id": "uuid or null if no exact match",
        "instrument_name": "matched instrument name or null",
        "category_slug": "category slug",
        "category_name": "category name",
        "confidence": 0.0-1.0
      }
    ]
  }
]

Rules:
- Split comma-separated texts into individual instruments
- Match variations like "barockviolin" → Violin (Stråk), "piccolo" → Flöjt (Blås)
- If no exact instrument match, set instrument_id to null but still assign a category
- Confidence: 1.0 = exact match, 0.7-0.9 = close variation, 0.5-0.7 = likely match
- Return ONLY valid JSON, no markdown`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse the JSON response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse AI response', raw: responseText }, { status: 500 })
    }

    const results = JSON.parse(jsonMatch[0])

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
