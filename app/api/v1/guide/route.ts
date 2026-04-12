import { NextResponse } from 'next/server'

const BASE = '/api/v1'

const guide = {
  name: 'Amida API',
  version: '1.0',
  description: 'REST API for managing gigs, invoices, clients and expenses for freelance musicians.',
  authentication: {
    method: 'Bearer token',
    header: 'Authorization: Bearer ak_<your-api-key>',
    how_to_get_key: 'Go to Settings > API in the Amida app to generate an API key with specific scopes.',
  },
  rate_limit: '60 requests per minute per API key',

  workflows: {
    create_gig_and_invoice: {
      description: 'Full workflow: create a gig, mark it complete, create an invoice',
      steps: [
        {
          step: 1,
          action: 'Fetch reference data',
          calls: [
            `GET ${BASE}/gig-types → get gig type IDs and VAT rates`,
            `GET ${BASE}/positions → get position IDs (optional)`,
            `GET ${BASE}/clients → get client IDs`,
          ],
        },
        {
          step: 2,
          action: 'Create a gig',
          call: `POST ${BASE}/gigs`,
          required_fields: {
            gig_type_id: 'UUID from gig-types',
            status: 'tentative|pending|accepted — ask the user',
            currency: 'SEK|EUR|USD|...',
            dates: ['YYYY-MM-DD'],
          },
          optional_fields: {
            client_id: 'UUID',
            position_id: 'UUID',
            fee: 5000,
            travel_expense: 500,
            venue: 'string',
            project_name: 'string',
            notes: 'string',
            invoice_notes: 'string',
          },
        },
        {
          step: 3,
          action: 'Mark gig as completed when done',
          call: `PATCH ${BASE}/gigs/{id}`,
          body: { status: 'completed' },
        },
        {
          step: 4,
          action: 'Create invoice from completed gig',
          call: `POST ${BASE}/invoices`,
          required_fields: { client_id: 'UUID', vat_rate: 25, payment_terms: 30, lines: 'array of line items' },
          note: 'Each line needs: description, quantity, unit_price, vat_rate. System auto-calculates invoice_number, due_date, subtotal, vat_amount, total.',
          example_lines: [
            { description: 'Concert - Mahler 2 - 15 Mar 2026', quantity: 1, unit_price: 5000, vat_rate: 25 },
            { description: 'Travel expense', quantity: 1, unit_price: 500, vat_rate: 25 },
          ],
        },
        {
          step: 5,
          action: 'Mark invoice as paid when payment received',
          call: `PATCH ${BASE}/invoices/{id}`,
          body: { status: 'paid', paid_date: '2026-04-15' },
        },
      ],
    },
    scan_receipt_and_create_expense: {
      description: 'Scan a receipt with AI, create expense, and attach the receipt file',
      steps: [
        {
          step: 1,
          action: 'Scan receipt with AI',
          call: `POST ${BASE}/expenses/scan`,
          note: 'Send multipart/form-data with field "file" (image or PDF, max 10MB). Returns parsed data: date, supplier, amount, currency, category, notes, confidence (0-1). Rate limit: 10 req/min.',
        },
        {
          step: 2,
          action: 'Create expense with scanned data',
          call: `POST ${BASE}/expenses`,
          note: 'Use the parsed data from step 1. Optionally link to a gig with gig_id.',
        },
        {
          step: 3,
          action: 'Attach receipt file to the expense',
          call: `POST ${BASE}/expenses/{id}/receipt`,
          note: 'Upload the same file again to attach it as a receipt image. Send multipart/form-data with field "file".',
        },
      ],
    },
  },

  status_flows: {
    gig: {
      statuses: {
        tentative: "Musician has been asked but hasn't decided yet — awaiting more details",
        pending: 'Musician intends to accept but is waiting for confirmation from the client/orchestra',
        accepted: 'Musician has confirmed and committed to the gig',
        declined: 'Musician has turned down the gig',
        completed: 'Gig is done, ready for invoicing',
        invoiced: 'Invoice has been created and sent',
        paid: 'Payment received',
      },
      transitions: 'tentative→pending→accepted→completed→invoiced→paid (or →declined at any point)',
      ai_hint:
        'When creating a gig, always ask the user which status to set. Common options: tentative (not sure yet), accepted (confirmed), pending (waiting for confirmation). Do not assume a status.',
    },
    invoice: {
      statuses: ['draft', 'sent', 'overdue', 'paid'],
      transitions: 'draft→sent→paid (sent→overdue happens automatically when past due_date)',
    },
  },

  endpoints: [
    { method: 'GET', path: `${BASE}/guide`, scope: 'none', description: 'This documentation (no auth required)' },
    {
      method: 'GET',
      path: `${BASE}/summary`,
      scope: 'any valid key',
      description: 'AI-friendly overview: upcoming gigs, unpaid invoices, recent expenses, yearly stats',
    },

    { method: 'GET', path: `${BASE}/gig-types`, scope: 'any valid key', description: 'List gig types with VAT rates' },
    { method: 'GET', path: `${BASE}/positions`, scope: 'any valid key', description: 'List musician positions' },

    {
      method: 'GET',
      path: `${BASE}/gigs`,
      scope: 'read:gigs',
      description: 'List gigs. Filters: status, client_id, date_from, date_to, limit, offset',
    },
    { method: 'POST', path: `${BASE}/gigs`, scope: 'write:gigs', description: 'Create gig' },
    { method: 'GET', path: `${BASE}/gigs/{id}`, scope: 'read:gigs', description: 'Get single gig with relations' },
    { method: 'PATCH', path: `${BASE}/gigs/{id}`, scope: 'write:gigs', description: 'Update gig (partial)' },
    { method: 'DELETE', path: `${BASE}/gigs/{id}`, scope: 'write:gigs', description: 'Delete gig' },

    {
      method: 'GET',
      path: `${BASE}/clients`,
      scope: 'read:clients',
      description: 'List clients. Filters: search, limit, offset',
    },
    { method: 'POST', path: `${BASE}/clients`, scope: 'write:clients', description: 'Create client' },
    { method: 'GET', path: `${BASE}/clients/{id}`, scope: 'read:clients', description: 'Get single client' },
    { method: 'PATCH', path: `${BASE}/clients/{id}`, scope: 'write:clients', description: 'Update client (partial)' },
    { method: 'DELETE', path: `${BASE}/clients/{id}`, scope: 'write:clients', description: 'Delete client' },

    {
      method: 'GET',
      path: `${BASE}/invoices`,
      scope: 'read:invoices',
      description: 'List invoices. Filters: status, client_id, limit, offset',
    },
    { method: 'POST', path: `${BASE}/invoices`, scope: 'write:invoices', description: 'Create invoice with lines' },
    {
      method: 'GET',
      path: `${BASE}/invoices/{id}`,
      scope: 'read:invoices',
      description: 'Get invoice with lines and client',
    },
    {
      method: 'PATCH',
      path: `${BASE}/invoices/{id}`,
      scope: 'write:invoices',
      description: 'Update invoice (status, paid_date, notes)',
    },
    {
      method: 'DELETE',
      path: `${BASE}/invoices/{id}`,
      scope: 'write:invoices',
      description: 'Delete invoice (reverts linked gigs to completed)',
    },

    {
      method: 'GET',
      path: `${BASE}/expenses`,
      scope: 'read:expenses',
      description: 'List expenses. Filters: category, date_from, date_to, limit, offset',
    },
    { method: 'POST', path: `${BASE}/expenses`, scope: 'write:expenses', description: 'Create expense' },
    { method: 'GET', path: `${BASE}/expenses/{id}`, scope: 'read:expenses', description: 'Get single expense' },
    { method: 'PATCH', path: `${BASE}/expenses/{id}`, scope: 'write:expenses', description: 'Update expense' },
    { method: 'DELETE', path: `${BASE}/expenses/{id}`, scope: 'write:expenses', description: 'Delete expense' },

    {
      method: 'POST',
      path: `${BASE}/expenses/scan`,
      scope: 'write:expenses',
      description:
        'AI-scan receipt image/PDF → returns { date, supplier, amount, currency, category, confidence }. Send multipart/form-data with field "file". Rate limit: 10/min.',
    },
    {
      method: 'GET',
      path: `${BASE}/expenses/{id}/receipt`,
      scope: 'read:expenses',
      description: 'Get signed URL for receipt image (1h expiry)',
    },
    {
      method: 'POST',
      path: `${BASE}/expenses/{id}/receipt`,
      scope: 'write:expenses',
      description: 'Upload receipt file (multipart/form-data, field "file"). Replaces existing receipt.',
    },
    {
      method: 'DELETE',
      path: `${BASE}/expenses/{id}/receipt`,
      scope: 'write:expenses',
      description: 'Delete receipt attachment',
    },

    {
      method: 'GET',
      path: `${BASE}/gigs/{id}/attachments`,
      scope: 'read:gigs',
      description: 'List gig attachments with signed URLs',
    },
    {
      method: 'POST',
      path: `${BASE}/gigs/{id}/attachments`,
      scope: 'write:gigs',
      description:
        'Upload PDF attachment (multipart/form-data, field "file", optional field "category": gig_info|invoice_doc)',
    },
    {
      method: 'DELETE',
      path: `${BASE}/gigs/{id}/attachments/{attachmentId}`,
      scope: 'write:gigs',
      description: 'Delete gig attachment',
    },
  ],

  field_specs: {
    create_gig: {
      required: {
        gig_type_id: 'UUID — get via GET /api/v1/gig-types',
        status:
          'tentative (not decided yet) | pending (waiting for confirmation) | accepted (confirmed) | declined (turned down) | completed (gig is done) — always ask the user',
        currency: 'SEK | EUR | USD | GBP | NOK | DKK',
        dates: 'string[] — at least 1 date in YYYY-MM-DD format',
      },
      optional: {
        client_id: 'UUID — needed for invoicing later',
        position_id: 'UUID — musician role',
        fee: 'number — payment amount in specified currency',
        travel_expense: 'number — travel reimbursement',
        venue: 'string — location name',
        project_name: 'string — concert/project title',
        notes: 'string — internal notes',
        invoice_notes: 'string — text to include on invoice',
        response_deadline: 'string YYYY-MM-DD — deadline to accept/decline',
      },
    },
    create_invoice: {
      required: {
        client_id: 'UUID',
        vat_rate: 'number — typically 0, 6, 12, or 25',
        payment_terms: 'number — days until due',
        lines: 'array of { description: string, quantity: number, unit_price: number, vat_rate: number }',
      },
      auto_calculated: ['invoice_number', 'invoice_date', 'due_date', 'subtotal', 'vat_amount', 'total'],
    },
    create_client: {
      required: {
        name: 'string',
        payment_terms: 'string — number of days as string',
      },
      optional: {
        org_number: 'string — organization number',
        email: 'string — for sending invoices',
        address: 'string',
        reference_person: 'string',
        invoice_language: 'sv | en',
        country_code: 'SE | NO | DK | FI | DE | ...',
        vat_number: 'string — EU VAT number',
      },
    },
    create_expense: {
      required: {
        date: 'string YYYY-MM-DD',
        supplier: 'string — e.g. SJ, IKEA, Spotify',
        amount: 'number',
      },
      optional: {
        currency: 'string — default SEK',
        category:
          'travel | food | hotel | instrument | sheet_music | equipment | office | phone | subscription | accounting | loan | bank | insurance | representation | training | interest | subcontractor | other',
        notes: 'string',
        gig_id: 'UUID — link to specific gig',
      },
    },
  },

  common_ai_tasks: [
    { prompt: 'Summarize my upcoming gigs', call: `GET ${BASE}/summary` },
    {
      prompt: 'Create a gig for concert March 20 at Konserthuset',
      calls: [`GET ${BASE}/clients?search=...`, `GET ${BASE}/gig-types`, `POST ${BASE}/gigs`],
    },
    { prompt: 'Which gigs need invoicing?', call: `GET ${BASE}/gigs?status=completed` },
    { prompt: 'Create invoice for gig X', calls: [`GET ${BASE}/gigs/{id}`, `POST ${BASE}/invoices`] },
    {
      prompt: 'Mark invoice 46 as paid',
      call: `PATCH ${BASE}/invoices/{id} with { status: "paid", paid_date: "..." }`,
    },
    { prompt: 'How much have I invoiced this year?', call: `GET ${BASE}/summary → stats.total_invoiced` },
    { prompt: 'Add a travel expense for a gig', call: `POST ${BASE}/expenses with { gig_id: "..." }` },
    {
      prompt: 'Scan a receipt and create expense',
      calls: [
        `POST ${BASE}/expenses/scan with receipt image → get parsed data`,
        `POST ${BASE}/expenses with parsed data`,
        `POST ${BASE}/expenses/{id}/receipt to attach the receipt file`,
      ],
    },
    { prompt: 'Upload sheet music to a gig', call: `POST ${BASE}/gigs/{id}/attachments with PDF file` },
  ],

  response_format: {
    success: '{ "success": true, "data": { ... } }',
    error: '{ "success": false, "error": "message" }',
    validation_error: '{ "success": false, "error": "Validation failed", "fieldErrors": { "field": ["error"] } }',
    pagination:
      '{ "success": true, "data": { "items": [...], "pagination": { "total": 100, "limit": 100, "offset": 0, "has_more": false } } }',
  },
}

export async function GET() {
  return NextResponse.json(guide)
}
