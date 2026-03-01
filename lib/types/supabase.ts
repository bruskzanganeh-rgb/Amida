export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      activity_events: {
        Row: {
          id: string
          user_id: string
          event_type: string
          entity_type: string | null
          entity_id: string | null
          metadata: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          event_type: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          event_type?: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          id: string
          user_id: string
          granted_at: string | null
          granted_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          granted_at?: string | null
          granted_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          granted_at?: string | null
          granted_by?: string | null
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          id: string
          created_at: string | null
          usage_type: string
          model: string
          input_tokens: number
          output_tokens: number
          estimated_cost_usd: number
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string | null
          usage_type: string
          model: string
          input_tokens: number
          output_tokens: number
          estimated_cost_usd: number
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string | null
          usage_type?: string
          model?: string
          input_tokens?: number
          output_tokens?: number
          estimated_cost_usd?: number
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          id: string
          user_id: string
          name: string
          key_hash: string
          key_prefix: string
          scopes: string[]
          is_active: boolean
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          key_hash: string
          key_prefix: string
          scopes?: string[]
          is_active?: boolean
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          key_hash?: string
          key_prefix?: string
          scopes?: string[]
          is_active?: boolean
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: number
          table_name: string
          record_id: string
          action: string
          old_data: Json | null
          new_data: Json | null
          changed_fields: string[] | null
          user_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          table_name: string
          record_id: string
          action: string
          old_data?: Json | null
          new_data?: Json | null
          changed_fields?: string[] | null
          user_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          table_name?: string
          record_id?: string
          action?: string
          old_data?: Json | null
          new_data?: Json | null
          changed_fields?: string[] | null
          user_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          org_number: string | null
          client_code: string | null
          address: string | null
          payment_terms: number | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          email: string | null
          reference_person: string | null
          invoice_language: string | null
          user_id: string | null
          country_code: string | null
          vat_number: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          name: string
          org_number?: string | null
          client_code?: string | null
          address?: string | null
          payment_terms?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          email?: string | null
          reference_person?: string | null
          invoice_language?: string | null
          user_id?: string | null
          country_code?: string | null
          vat_number?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          org_number?: string | null
          client_code?: string | null
          address?: string | null
          payment_terms?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          email?: string | null
          reference_person?: string | null
          invoice_language?: string | null
          user_id?: string | null
          country_code?: string | null
          vat_number?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          company_name: string
          org_number: string
          address: string
          postal_code: string | null
          city: string | null
          email: string
          phone: string
          bank_account: string
          logo_url: string | null
          country_code: string | null
          vat_registration_number: string | null
          late_payment_interest_text: string | null
          show_logo_on_invoice: boolean | null
          our_reference: string | null
          invoice_prefix: string | null
          next_invoice_number: number | null
          payment_terms_default: number | null
          base_currency: string | null
          email_provider: string | null
          email_inbound_address: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_user: string | null
          smtp_password: string | null
          smtp_from_email: string | null
          smtp_from_name: string | null
          dropbox_access_token: string | null
          dropbox_refresh_token: string | null
          dropbox_token_expires_at: string | null
          dropbox_account_id: string | null
          dropbox_connected_at: string | null
          gig_visibility: string
          created_at: string | null
          updated_at: string | null
          bankgiro: string | null
          iban: string | null
          bic: string | null
        }
        Insert: {
          id?: string
          company_name?: string
          org_number?: string
          address?: string
          postal_code?: string | null
          city?: string | null
          email?: string
          phone?: string
          bank_account?: string
          logo_url?: string | null
          country_code?: string | null
          vat_registration_number?: string | null
          late_payment_interest_text?: string | null
          show_logo_on_invoice?: boolean | null
          our_reference?: string | null
          invoice_prefix?: string | null
          next_invoice_number?: number | null
          payment_terms_default?: number | null
          base_currency?: string | null
          email_provider?: string | null
          email_inbound_address?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          smtp_password?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          dropbox_access_token?: string | null
          dropbox_refresh_token?: string | null
          dropbox_token_expires_at?: string | null
          dropbox_account_id?: string | null
          dropbox_connected_at?: string | null
          gig_visibility?: string
          created_at?: string | null
          updated_at?: string | null
          bankgiro?: string | null
          iban?: string | null
          bic?: string | null
        }
        Update: {
          id?: string
          company_name?: string
          org_number?: string
          address?: string
          postal_code?: string | null
          city?: string | null
          email?: string
          phone?: string
          bank_account?: string
          logo_url?: string | null
          country_code?: string | null
          vat_registration_number?: string | null
          late_payment_interest_text?: string | null
          show_logo_on_invoice?: boolean | null
          our_reference?: string | null
          invoice_prefix?: string | null
          next_invoice_number?: number | null
          payment_terms_default?: number | null
          base_currency?: string | null
          email_provider?: string | null
          email_inbound_address?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          smtp_password?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          dropbox_access_token?: string | null
          dropbox_refresh_token?: string | null
          dropbox_token_expires_at?: string | null
          dropbox_account_id?: string | null
          dropbox_connected_at?: string | null
          gig_visibility?: string
          created_at?: string | null
          updated_at?: string | null
          bankgiro?: string | null
          iban?: string | null
          bic?: string | null
        }
        Relationships: []
      }
      company_invitations: {
        Row: {
          id: string
          company_id: string
          token: string
          invited_by: string
          invited_email: string | null
          used_by: string | null
          used_at: string | null
          expires_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          token?: string
          invited_by: string
          invited_email?: string | null
          used_by?: string | null
          used_at?: string | null
          expires_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          token?: string
          invited_by?: string
          invited_email?: string | null
          used_by?: string | null
          used_at?: string | null
          expires_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          id: string
          company_id: string
          user_id: string
          role: string
          joined_at: string | null
          removed_at: string | null
          full_name: string | null
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role?: string
          joined_at?: string | null
          removed_at?: string | null
          full_name?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          role?: string
          joined_at?: string | null
          removed_at?: string | null
          full_name?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          id: string
          company_name: string
          org_number: string
          address: string
          email: string
          phone: string
          bank_account: string
          logo_url: string | null
          invoice_prefix: string | null
          next_invoice_number: number | null
          payment_terms_default: number | null
          email_inbound_address: string | null
          created_at: string | null
          updated_at: string | null
          dropbox_access_token: string | null
          dropbox_refresh_token: string | null
          dropbox_token_expires_at: string | null
          dropbox_account_id: string | null
          dropbox_connected_at: string | null
          vat_registration_number: string | null
          late_payment_interest_text: string | null
          show_logo_on_invoice: boolean | null
          our_reference: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_user: string | null
          smtp_password: string | null
          smtp_from_email: string | null
          smtp_from_name: string | null
          base_currency: string | null
          user_id: string | null
          onboarding_completed: boolean | null
          locale: string | null
          email_provider: string | null
          country_code: string | null
          calendar_token: string | null
          calendar_show_all_members: boolean | null
          instruments_text: string | null
        }
        Insert: {
          id?: string
          company_name: string
          org_number: string
          address: string
          email: string
          phone: string
          bank_account: string
          logo_url?: string | null
          invoice_prefix?: string | null
          next_invoice_number?: number | null
          payment_terms_default?: number | null
          email_inbound_address?: string | null
          created_at?: string | null
          updated_at?: string | null
          dropbox_access_token?: string | null
          dropbox_refresh_token?: string | null
          dropbox_token_expires_at?: string | null
          dropbox_account_id?: string | null
          dropbox_connected_at?: string | null
          vat_registration_number?: string | null
          late_payment_interest_text?: string | null
          show_logo_on_invoice?: boolean | null
          our_reference?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          smtp_password?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          base_currency?: string | null
          user_id?: string | null
          onboarding_completed?: boolean | null
          locale?: string | null
          email_provider?: string | null
          country_code?: string | null
          calendar_token?: string | null
          calendar_show_all_members?: boolean | null
          instruments_text?: string | null
        }
        Update: {
          id?: string
          company_name?: string
          org_number?: string
          address?: string
          email?: string
          phone?: string
          bank_account?: string
          logo_url?: string | null
          invoice_prefix?: string | null
          next_invoice_number?: number | null
          payment_terms_default?: number | null
          email_inbound_address?: string | null
          created_at?: string | null
          updated_at?: string | null
          dropbox_access_token?: string | null
          dropbox_refresh_token?: string | null
          dropbox_token_expires_at?: string | null
          dropbox_account_id?: string | null
          dropbox_connected_at?: string | null
          vat_registration_number?: string | null
          late_payment_interest_text?: string | null
          show_logo_on_invoice?: boolean | null
          our_reference?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          smtp_password?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          base_currency?: string | null
          user_id?: string | null
          onboarding_completed?: boolean | null
          locale?: string | null
          email_provider?: string | null
          country_code?: string | null
          calendar_token?: string | null
          calendar_show_all_members?: boolean | null
          instruments_text?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          client_id: string
          name: string
          email: string | null
          phone: string | null
          role: string | null
          created_at: string | null
          user_id: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          email?: string | null
          phone?: string | null
          role?: string | null
          created_at?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          role?: string | null
          created_at?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      contract_audit: {
        Row: {
          id: string
          contract_id: string
          event_type: string
          actor_email: string | null
          ip_address: string | null
          user_agent: string | null
          document_hash_sha256: string | null
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          contract_id: string
          event_type: string
          actor_email?: string | null
          ip_address?: string | null
          user_agent?: string | null
          document_hash_sha256?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          contract_id?: string
          event_type?: string
          actor_email?: string | null
          ip_address?: string | null
          user_agent?: string | null
          document_hash_sha256?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          id: string
          company_id: string | null
          contract_number: string
          tier: string
          annual_price: number
          currency: string
          billing_interval: string
          vat_rate_pct: number
          contract_start_date: string
          contract_duration_months: number
          custom_terms: Json | null
          signer_name: string
          signer_email: string
          signer_title: string | null
          signing_token: string | null
          token_expires_at: string | null
          status: string
          document_hash_sha256: string | null
          signed_document_hash_sha256: string | null
          unsigned_pdf_path: string | null
          signed_pdf_path: string | null
          signature_image_path: string | null
          sent_at: string | null
          viewed_at: string | null
          signed_at: string | null
          created_at: string | null
          updated_at: string | null
          reviewer_name: string | null
          reviewer_email: string | null
          reviewer_title: string | null
          reviewer_token: string | null
          reviewer_token_expires_at: string | null
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          contract_number: string
          tier: string
          annual_price: number
          currency?: string
          billing_interval?: string
          vat_rate_pct?: number
          contract_start_date: string
          contract_duration_months?: number
          custom_terms?: Json | null
          signer_name: string
          signer_email: string
          signer_title?: string | null
          signing_token?: string | null
          token_expires_at?: string | null
          status?: string
          document_hash_sha256?: string | null
          signed_document_hash_sha256?: string | null
          unsigned_pdf_path?: string | null
          signed_pdf_path?: string | null
          signature_image_path?: string | null
          sent_at?: string | null
          viewed_at?: string | null
          signed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          reviewer_name?: string | null
          reviewer_email?: string | null
          reviewer_title?: string | null
          reviewer_token?: string | null
          reviewer_token_expires_at?: string | null
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          contract_number?: string
          tier?: string
          annual_price?: number
          currency?: string
          billing_interval?: string
          vat_rate_pct?: number
          contract_start_date?: string
          contract_duration_months?: number
          custom_terms?: Json | null
          signer_name?: string
          signer_email?: string
          signer_title?: string | null
          signing_token?: string | null
          token_expires_at?: string | null
          status?: string
          document_hash_sha256?: string | null
          signed_document_hash_sha256?: string | null
          unsigned_pdf_path?: string | null
          signed_pdf_path?: string | null
          signature_image_path?: string | null
          sent_at?: string | null
          viewed_at?: string | null
          signed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          reviewer_name?: string | null
          reviewer_email?: string | null
          reviewer_title?: string | null
          reviewer_token?: string | null
          reviewer_token_expires_at?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          id: string
          base_currency: string
          target_currency: string
          rate: number
          date: string
          source: string | null
          created_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          base_currency: string
          target_currency: string
          rate: number
          date: string
          source?: string | null
          created_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          base_currency?: string
          target_currency?: string
          rate?: number
          date?: string
          source?: string | null
          created_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          date: string
          supplier: string
          amount: number
          category: string | null
          gig_id: string | null
          file_url: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          currency: string | null
          amount_base: number | null
          attachment_url: string | null
          dropbox_synced: boolean | null
          dropbox_path: string | null
          subtotal: number | null
          vat_rate: number | null
          vat_amount: number | null
          user_id: string | null
          company_id: string | null
          file_size: number | null
        }
        Insert: {
          id?: string
          date: string
          supplier: string
          amount: number
          category?: string | null
          gig_id?: string | null
          file_url?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          currency?: string | null
          amount_base?: number | null
          attachment_url?: string | null
          dropbox_synced?: boolean | null
          dropbox_path?: string | null
          subtotal?: number | null
          vat_rate?: number | null
          vat_amount?: number | null
          user_id?: string | null
          company_id?: string | null
          file_size?: number | null
        }
        Update: {
          id?: string
          date?: string
          supplier?: string
          amount?: number
          category?: string | null
          gig_id?: string | null
          file_url?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          currency?: string | null
          amount_base?: number | null
          attachment_url?: string | null
          dropbox_synced?: boolean | null
          dropbox_path?: string | null
          subtotal?: number | null
          vat_rate?: number | null
          vat_amount?: number | null
          user_id?: string | null
          company_id?: string | null
          file_size?: number | null
        }
        Relationships: []
      }
      gig_attachments: {
        Row: {
          id: string
          gig_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          uploaded_at: string | null
          category: string | null
          invoice_id: string | null
          user_id: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          gig_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          uploaded_at?: string | null
          category?: string | null
          invoice_id?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          gig_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          uploaded_at?: string | null
          category?: string | null
          invoice_id?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      gig_dates: {
        Row: {
          id: string
          gig_id: string
          date: string
          created_at: string | null
          user_id: string | null
          schedule_text: string | null
          sessions: Json | null
          company_id: string | null
        }
        Insert: {
          id?: string
          gig_id: string
          date: string
          created_at?: string | null
          user_id?: string | null
          schedule_text?: string | null
          sessions?: Json | null
          company_id?: string | null
        }
        Update: {
          id?: string
          gig_id?: string
          date?: string
          created_at?: string | null
          user_id?: string | null
          schedule_text?: string | null
          sessions?: Json | null
          company_id?: string | null
        }
        Relationships: []
      }
      gig_types: {
        Row: {
          id: string
          name: string
          vat_rate: number
          color: string | null
          default_description: string | null
          is_default: boolean | null
          created_at: string | null
          user_id: string | null
          name_en: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          name: string
          vat_rate: number
          color?: string | null
          default_description?: string | null
          is_default?: boolean | null
          created_at?: string | null
          user_id?: string | null
          name_en?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          vat_rate?: number
          color?: string | null
          default_description?: string | null
          is_default?: boolean | null
          created_at?: string | null
          user_id?: string | null
          name_en?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      gigs: {
        Row: {
          id: string
          client_id: string | null
          gig_type_id: string
          date: string
          venue: string | null
          fee: number | null
          travel_expense: number | null
          status: Database['public']['Enums']['gig_status'] | null
          response_date: string | null
          notes: string | null
          calendar_event_id: string | null
          email_source: string | null
          created_at: string | null
          updated_at: string | null
          start_date: string | null
          end_date: string | null
          total_days: number | null
          project_name: string | null
          position_id: string | null
          response_deadline: string | null
          invoice_notes: string | null
          currency: string | null
          fee_base: number | null
          travel_expense_base: number | null
          exchange_rate: number | null
          user_id: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          gig_type_id: string
          date: string
          venue?: string | null
          fee?: number | null
          travel_expense?: number | null
          status?: Database['public']['Enums']['gig_status'] | null
          response_date?: string | null
          notes?: string | null
          calendar_event_id?: string | null
          email_source?: string | null
          created_at?: string | null
          updated_at?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          project_name?: string | null
          position_id?: string | null
          response_deadline?: string | null
          invoice_notes?: string | null
          currency?: string | null
          fee_base?: number | null
          travel_expense_base?: number | null
          exchange_rate?: number | null
          user_id?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string | null
          gig_type_id?: string
          date?: string
          venue?: string | null
          fee?: number | null
          travel_expense?: number | null
          status?: Database['public']['Enums']['gig_status'] | null
          response_date?: string | null
          notes?: string | null
          calendar_event_id?: string | null
          email_source?: string | null
          created_at?: string | null
          updated_at?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          project_name?: string | null
          position_id?: string | null
          response_deadline?: string | null
          invoice_notes?: string | null
          currency?: string | null
          fee_base?: number | null
          travel_expense_base?: number | null
          exchange_rate?: number | null
          user_id?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      instrument_categories: {
        Row: {
          id: string
          name: string
          slug: string
          sort_order: number
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort_order: number
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          created_at?: string | null
        }
        Relationships: []
      }
      instruments: {
        Row: {
          id: string
          name: string
          category_id: string
          sort_order: number
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          category_id: string
          sort_order: number
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          category_id?: string
          sort_order?: number
          created_at?: string | null
        }
        Relationships: []
      }
      invitation_codes: {
        Row: {
          id: string
          code: string
          created_by: string | null
          used_by: string | null
          used_at: string | null
          expires_at: string | null
          max_uses: number | null
          use_count: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          code: string
          created_by?: string | null
          used_by?: string | null
          used_at?: string | null
          expires_at?: string | null
          max_uses?: number | null
          use_count?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          code?: string
          created_by?: string | null
          used_by?: string | null
          used_at?: string | null
          expires_at?: string | null
          max_uses?: number | null
          use_count?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      invoice_gigs: {
        Row: {
          id: string
          invoice_id: string
          gig_id: string
          created_at: string | null
          user_id: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          gig_id: string
          created_at?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          gig_id?: string
          created_at?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          id: string
          invoice_id: string
          description: string
          amount: number
          is_vat_exempt: boolean | null
          sort_order: number | null
          created_at: string | null
          vat_rate: number | null
          user_id: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          description: string
          amount: number
          is_vat_exempt?: boolean | null
          sort_order?: number | null
          created_at?: string | null
          vat_rate?: number | null
          user_id?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          description?: string
          amount?: number
          is_vat_exempt?: boolean | null
          sort_order?: number | null
          created_at?: string | null
          vat_rate?: number | null
          user_id?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      invoice_reminders: {
        Row: {
          id: string
          invoice_id: string
          user_id: string
          sent_to: string
          subject: string
          message: string | null
          reminder_number: number
          sent_at: string
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          user_id?: string
          sent_to: string
          subject: string
          message?: string | null
          reminder_number?: number
          sent_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          user_id?: string
          sent_to?: string
          subject?: string
          message?: string | null
          reminder_number?: number
          sent_at?: string
          created_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          gig_id: string | null
          client_id: string
          invoice_number: number
          invoice_date: string
          due_date: string
          paid_date: string | null
          subtotal: number
          vat_rate: number
          vat_amount: number
          total: number
          pdf_url: string | null
          sent_date: string | null
          status: Database['public']['Enums']['invoice_status'] | null
          imported_from_pdf: boolean | null
          original_pdf_url: string | null
          created_at: string | null
          updated_at: string | null
          reference_person_override: string | null
          notes: string | null
          currency: string | null
          exchange_rate: number | null
          total_base: number | null
          user_id: string | null
          customer_vat_number: string | null
          reverse_charge: boolean | null
          company_id: string | null
        }
        Insert: {
          id?: string
          gig_id?: string | null
          client_id: string
          invoice_number: number
          invoice_date: string
          due_date: string
          paid_date?: string | null
          subtotal: number
          vat_rate: number
          vat_amount: number
          total: number
          pdf_url?: string | null
          sent_date?: string | null
          status?: Database['public']['Enums']['invoice_status'] | null
          imported_from_pdf?: boolean | null
          original_pdf_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          reference_person_override?: string | null
          notes?: string | null
          currency?: string | null
          exchange_rate?: number | null
          total_base?: number | null
          user_id?: string | null
          customer_vat_number?: string | null
          reverse_charge?: boolean | null
          company_id?: string | null
        }
        Update: {
          id?: string
          gig_id?: string | null
          client_id?: string
          invoice_number?: number
          invoice_date?: string
          due_date?: string
          paid_date?: string | null
          subtotal?: number
          vat_rate?: number
          vat_amount?: number
          total?: number
          pdf_url?: string | null
          sent_date?: string | null
          status?: Database['public']['Enums']['invoice_status'] | null
          imported_from_pdf?: boolean | null
          original_pdf_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          reference_person_override?: string | null
          notes?: string | null
          currency?: string | null
          exchange_rate?: number | null
          total_base?: number | null
          user_id?: string | null
          customer_vat_number?: string | null
          reverse_charge?: boolean | null
          company_id?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string | null
          joined_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: string | null
          joined_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string | null
          joined_at?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          category: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          category?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          category?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          key: string
          value: string
          updated_at: string | null
        }
        Insert: {
          key: string
          value: string
          updated_at?: string | null
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          id: string
          name: string
          sort_order: number | null
          created_at: string | null
          user_id: string | null
          company_id: string | null
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number | null
          created_at?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number | null
          created_at?: string | null
          user_id?: string | null
          company_id?: string | null
        }
        Relationships: []
      }
      sponsor_impressions: {
        Row: {
          id: string
          sponsor_id: string
          user_id: string
          invoice_id: string | null
          impression_type: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          sponsor_id: string
          user_id: string
          invoice_id?: string | null
          impression_type?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          sponsor_id?: string
          user_id?: string
          invoice_id?: string | null
          impression_type?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      sponsors: {
        Row: {
          id: string
          name: string
          logo_url: string | null
          tagline: string | null
          website_url: string | null
          instrument_category_id: string
          active: boolean | null
          priority: number | null
          display_prefix: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          tagline?: string | null
          website_url?: string | null
          instrument_category_id: string
          active?: boolean | null
          priority?: number | null
          display_prefix?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          tagline?: string | null
          website_url?: string | null
          instrument_category_id?: string
          active?: boolean | null
          priority?: number | null
          display_prefix?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan: Database['public']['Enums']['subscription_plan']
          status: Database['public']['Enums']['subscription_status']
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          updated_at: string | null
          company_id: string | null
          pending_plan: string | null
          admin_override: boolean | null
        }
        Insert: {
          id?: string
          user_id: string
          plan?: Database['public']['Enums']['subscription_plan']
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          company_id?: string | null
          pending_plan?: string | null
          admin_override?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string
          plan?: Database['public']['Enums']['subscription_plan']
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          company_id?: string | null
          pending_plan?: string | null
          admin_override?: boolean | null
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          id: string
          user_id: string
          year: number
          month: number
          invoice_count: number
          receipt_scan_count: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          year: number
          month: number
          invoice_count?: number
          receipt_scan_count?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          year?: number
          month?: number
          invoice_count?: number
          receipt_scan_count?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_instruments: {
        Row: {
          id: string
          user_id: string
          instrument_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          instrument_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          instrument_id?: string
          created_at?: string | null
        }
        Relationships: []
      }
      user_categories: {
        Row: {
          id: string
          user_id: string
          category_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          category_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          category_id?: string
          created_at?: string | null
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          id: string
          user_id: string
          started_at: string | null
          last_active_at: string | null
          ended_at: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          started_at?: string | null
          last_active_at?: string | null
          ended_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          started_at?: string | null
          last_active_at?: string | null
          ended_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_user_company_id: {
        Args: Record<string, never>
        Returns: string
      }
      is_admin: {
        Args: { uid: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { cid: string }
        Returns: boolean
      }
      get_next_invoice_number: {
        Args: { cid: string }
        Returns: number
      }
      company_gig_visibility: {
        Args: { cid: string }
        Returns: string
      }
      admin_set_user_tier: {
        Args: { admin_uid: string; target_user_id: string; new_plan: Database['public']['Enums']['subscription_plan'] }
        Returns: boolean
      }
      use_invitation_code: {
        Args: { code_value: string; uid: string }
        Returns: boolean
      }
      claim_orphaned_data: {
        Args: { uid: string }
        Returns: undefined
      }
    }
    Enums: {
      gig_status: 'tentative' | 'pending' | 'accepted' | 'declined' | 'completed' | 'invoiced' | 'paid' | 'draft'
      invoice_status: 'draft' | 'sent' | 'paid' | 'overdue'
      subscription_plan: 'free' | 'pro' | 'team'
      subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
