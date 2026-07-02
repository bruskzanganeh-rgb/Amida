export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5'
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          created_at: string | null
          estimated_cost_usd: number
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          output_tokens: number
          usage_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_cost_usd: number
          id?: string
          input_tokens: number
          metadata?: Json | null
          model: string
          output_tokens: number
          usage_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          output_tokens?: number
          usage_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: string[]
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          component_stack: string | null
          created_at: string | null
          error_message: string
          error_stack: string | null
          id: string
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string | null
          error_message: string
          error_stack?: string | null
          id?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string | null
          error_message?: string
          error_stack?: string | null
          id?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          client_code: string | null
          company_id: string | null
          country_code: string | null
          created_at: string | null
          email: string | null
          id: string
          invoice_language: string | null
          name: string
          notes: string | null
          org_number: string | null
          payment_terms: number | null
          reference_person: string | null
          updated_at: string | null
          user_id: string | null
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          client_code?: string | null
          company_id?: string | null
          country_code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          invoice_language?: string | null
          name: string
          notes?: string | null
          org_number?: string | null
          payment_terms?: number | null
          reference_person?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          client_code?: string | null
          company_id?: string | null
          country_code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          invoice_language?: string | null
          name?: string
          notes?: string | null
          org_number?: string | null
          payment_terms?: number | null
          reference_person?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'clients_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      companies: {
        Row: {
          address: string
          bank_account: string
          bank_address: string | null
          bankgiro: string | null
          base_currency: string | null
          bic: string | null
          city: string | null
          company_name: string
          country_code: string | null
          created_at: string | null
          email: string
          email_inbound_address: string | null
          gig_visibility: string
          iban: string | null
          id: string
          invoice_prefix: string | null
          late_payment_interest_text: string | null
          logo_url: string | null
          next_invoice_number: number | null
          org_number: string
          our_reference: string | null
          payment_terms_default: number | null
          phone: string
          postal_code: string | null
          show_logo_on_invoice: boolean | null
          updated_at: string | null
          vat_registration_number: string | null
        }
        Insert: {
          address?: string
          bank_account?: string
          bank_address?: string | null
          bankgiro?: string | null
          base_currency?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string
          country_code?: string | null
          created_at?: string | null
          email?: string
          email_inbound_address?: string | null
          gig_visibility?: string
          iban?: string | null
          id?: string
          invoice_prefix?: string | null
          late_payment_interest_text?: string | null
          logo_url?: string | null
          next_invoice_number?: number | null
          org_number?: string
          our_reference?: string | null
          payment_terms_default?: number | null
          phone?: string
          postal_code?: string | null
          show_logo_on_invoice?: boolean | null
          updated_at?: string | null
          vat_registration_number?: string | null
        }
        Update: {
          address?: string
          bank_account?: string
          bank_address?: string | null
          bankgiro?: string | null
          base_currency?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string
          country_code?: string | null
          created_at?: string | null
          email?: string
          email_inbound_address?: string | null
          gig_visibility?: string
          iban?: string | null
          id?: string
          invoice_prefix?: string | null
          late_payment_interest_text?: string | null
          logo_url?: string | null
          next_invoice_number?: number | null
          org_number?: string
          our_reference?: string | null
          payment_terms_default?: number | null
          phone?: string
          postal_code?: string | null
          show_logo_on_invoice?: boolean | null
          updated_at?: string | null
          vat_registration_number?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          category: string
          company_id: string
          description: string | null
          document_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_at: string | null
          user_id: string | null
        }
        Insert: {
          category?: string
          company_id?: string
          description?: string | null
          document_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          description?: string | null
          document_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'company_documents_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      company_invitations: {
        Row: {
          company_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          invited_by: string
          invited_email: string | null
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_by: string
          invited_email?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string
          invited_email?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'company_invitations_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          full_name: string | null
          id: string
          joined_at: string | null
          removed_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          full_name?: string | null
          id?: string
          joined_at?: string | null
          removed_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          full_name?: string | null
          id?: string
          joined_at?: string | null
          removed_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'company_members_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      company_settings: {
        Row: {
          address: string
          bank_account: string
          base_currency: string | null
          calendar_show_all_members: boolean | null
          calendar_token: string | null
          company_name: string
          country_code: string | null
          created_at: string | null
          email: string
          email_inbound_address: string | null
          id: string
          instruments_text: string | null
          invoice_prefix: string | null
          late_payment_interest_text: string | null
          locale: string | null
          logo_url: string | null
          next_invoice_number: number | null
          onboarding_completed: boolean | null
          org_number: string
          our_reference: string | null
          payment_terms_default: number | null
          phone: string
          show_logo_on_invoice: boolean | null
          show_only_my_data: boolean | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
          vat_registration_number: string | null
        }
        Insert: {
          address: string
          bank_account: string
          base_currency?: string | null
          calendar_show_all_members?: boolean | null
          calendar_token?: string | null
          company_name: string
          country_code?: string | null
          created_at?: string | null
          email: string
          email_inbound_address?: string | null
          id?: string
          instruments_text?: string | null
          invoice_prefix?: string | null
          late_payment_interest_text?: string | null
          locale?: string | null
          logo_url?: string | null
          next_invoice_number?: number | null
          onboarding_completed?: boolean | null
          org_number: string
          our_reference?: string | null
          payment_terms_default?: number | null
          phone: string
          show_logo_on_invoice?: boolean | null
          show_only_my_data?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_registration_number?: string | null
        }
        Update: {
          address?: string
          bank_account?: string
          base_currency?: string | null
          calendar_show_all_members?: boolean | null
          calendar_token?: string | null
          company_name?: string
          country_code?: string | null
          created_at?: string | null
          email?: string
          email_inbound_address?: string | null
          id?: string
          instruments_text?: string | null
          invoice_prefix?: string | null
          late_payment_interest_text?: string | null
          locale?: string | null
          logo_url?: string | null
          next_invoice_number?: number | null
          onboarding_completed?: boolean | null
          org_number?: string
          our_reference?: string | null
          payment_terms_default?: number | null
          phone?: string
          show_logo_on_invoice?: boolean | null
          show_only_my_data?: boolean | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_registration_number?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          company_id: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          client_id: string
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contacts_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contacts_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string | null
          date: string
          id: string
          rate: number
          source: string | null
          target_currency: string
          user_id: string | null
        }
        Insert: {
          base_currency: string
          created_at?: string | null
          date: string
          id?: string
          rate: number
          source?: string | null
          target_currency: string
          user_id?: string | null
        }
        Update: {
          base_currency?: string
          created_at?: string | null
          date?: string
          id?: string
          rate?: number
          source?: string | null
          target_currency?: string
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          amount_base: number | null
          attachment_url: string | null
          category: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          date: string
          file_size: number | null
          file_url: string | null
          gig_id: string | null
          id: string
          is_private: boolean
          notes: string | null
          sent_to_accountant_at: string | null
          subtotal: number | null
          supplier: string
          updated_at: string | null
          user_id: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount: number
          amount_base?: number | null
          attachment_url?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          date: string
          file_size?: number | null
          file_url?: string | null
          gig_id?: string | null
          id?: string
          is_private?: boolean
          notes?: string | null
          sent_to_accountant_at?: string | null
          subtotal?: number | null
          supplier: string
          updated_at?: string | null
          user_id?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          amount_base?: number | null
          attachment_url?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          file_size?: number | null
          file_url?: string | null
          gig_id?: string | null
          id?: string
          is_private?: boolean
          notes?: string | null
          sent_to_accountant_at?: string | null
          subtotal?: number | null
          supplier?: string
          updated_at?: string | null
          user_id?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_gig_id_fkey'
            columns: ['gig_id']
            isOneToOne: false
            referencedRelation: 'gigs'
            referencedColumns: ['id']
          },
        ]
      }
      gig_attachments: {
        Row: {
          category: string | null
          company_id: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          gig_id: string
          id: string
          invoice_id: string | null
          uploaded_at: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          gig_id: string
          id?: string
          invoice_id?: string | null
          uploaded_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          gig_id?: string
          id?: string
          invoice_id?: string | null
          uploaded_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'gig_attachments_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gig_attachments_gig_id_fkey'
            columns: ['gig_id']
            isOneToOne: false
            referencedRelation: 'gigs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gig_attachments_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
        ]
      }
      gig_dates: {
        Row: {
          company_id: string | null
          created_at: string | null
          date: string
          gig_id: string
          id: string
          schedule_text: string | null
          sessions: Json | null
          user_id: string | null
          venue: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          date: string
          gig_id: string
          id?: string
          schedule_text?: string | null
          sessions?: Json | null
          user_id?: string | null
          venue?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          date?: string
          gig_id?: string
          id?: string
          schedule_text?: string | null
          sessions?: Json | null
          user_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'gig_dates_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gig_dates_gig_id_fkey'
            columns: ['gig_id']
            isOneToOne: false
            referencedRelation: 'gigs'
            referencedColumns: ['id']
          },
        ]
      }
      gig_types: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          default_description: string | null
          id: string
          is_default: boolean | null
          name: string
          name_en: string | null
          user_id: string | null
          vat_rate: number
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          default_description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          name_en?: string | null
          user_id?: string | null
          vat_rate: number
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          default_description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          name_en?: string | null
          user_id?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: 'gig_types_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      gigs: {
        Row: {
          calendar_event_id: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          date: string
          email_source: string | null
          end_date: string | null
          exchange_rate: number | null
          fee: number | null
          fee_base: number | null
          gig_type_id: string
          id: string
          invoice_notes: string | null
          notes: string | null
          position_id: string | null
          project_name: string | null
          response_date: string | null
          response_deadline: string | null
          start_date: string | null
          status: Database['public']['Enums']['gig_status'] | null
          total_days: number | null
          travel_expense: number | null
          travel_expense_base: number | null
          updated_at: string | null
          user_id: string | null
          venue: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          date: string
          email_source?: string | null
          end_date?: string | null
          exchange_rate?: number | null
          fee?: number | null
          fee_base?: number | null
          gig_type_id: string
          id?: string
          invoice_notes?: string | null
          notes?: string | null
          position_id?: string | null
          project_name?: string | null
          response_date?: string | null
          response_deadline?: string | null
          start_date?: string | null
          status?: Database['public']['Enums']['gig_status'] | null
          total_days?: number | null
          travel_expense?: number | null
          travel_expense_base?: number | null
          updated_at?: string | null
          user_id?: string | null
          venue?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          email_source?: string | null
          end_date?: string | null
          exchange_rate?: number | null
          fee?: number | null
          fee_base?: number | null
          gig_type_id?: string
          id?: string
          invoice_notes?: string | null
          notes?: string | null
          position_id?: string | null
          project_name?: string | null
          response_date?: string | null
          response_deadline?: string | null
          start_date?: string | null
          status?: Database['public']['Enums']['gig_status'] | null
          total_days?: number | null
          travel_expense?: number | null
          travel_expense_base?: number | null
          updated_at?: string | null
          user_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'gigs_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gigs_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gigs_gig_type_id_fkey'
            columns: ['gig_type_id']
            isOneToOne: false
            referencedRelation: 'gig_types'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gigs_position_id_fkey'
            columns: ['position_id']
            isOneToOne: false
            referencedRelation: 'positions'
            referencedColumns: ['id']
          },
        ]
      }
      instrument_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          name_en: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          name_en?: string | null
          slug: string
          sort_order: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          name_en?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      instruments: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          name: string
          sort_order: number
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'instruments_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'instrument_categories'
            referencedColumns: ['id']
          },
        ]
      }
      invitation_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          use_count: number | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          use_count?: number | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          use_count?: number | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      invoice_gigs: {
        Row: {
          company_id: string | null
          created_at: string | null
          gig_id: string
          id: string
          invoice_id: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          gig_id: string
          id?: string
          invoice_id: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          gig_id?: string
          id?: string
          invoice_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_gigs_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_gigs_gig_id_fkey'
            columns: ['gig_id']
            isOneToOne: false
            referencedRelation: 'gigs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_gigs_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string | null
          description: string
          id: string
          invoice_id: string
          is_vat_exempt: boolean | null
          sort_order: number | null
          user_id: string | null
          vat_rate: number | null
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          invoice_id: string
          is_vat_exempt?: boolean | null
          sort_order?: number | null
          user_id?: string | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          is_vat_exempt?: boolean | null
          sort_order?: number | null
          user_id?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_lines_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_reminders: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          message: string | null
          reminder_number: number
          sent_at: string
          sent_to: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          message?: string | null
          reminder_number?: number
          sent_at?: string
          sent_to: string
          subject: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          message?: string | null
          reminder_number?: number
          sent_at?: string
          sent_to?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_reminders_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          company_id: string | null
          created_at: string | null
          currency: string | null
          customer_vat_number: string | null
          due_date: string
          exchange_rate: number | null
          gig_id: string | null
          id: string
          imported_from_pdf: boolean | null
          invoice_date: string
          invoice_number: number
          notes: string | null
          original_pdf_url: string | null
          paid_date: string | null
          pdf_url: string | null
          reference_person_override: string | null
          reverse_charge: boolean | null
          sent_date: string | null
          sent_to_accountant_at: string | null
          status: Database['public']['Enums']['invoice_status'] | null
          subtotal: number
          total: number
          total_base: number | null
          updated_at: string | null
          user_id: string | null
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          client_id: string
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_vat_number?: string | null
          due_date: string
          exchange_rate?: number | null
          gig_id?: string | null
          id?: string
          imported_from_pdf?: boolean | null
          invoice_date: string
          invoice_number: number
          notes?: string | null
          original_pdf_url?: string | null
          paid_date?: string | null
          pdf_url?: string | null
          reference_person_override?: string | null
          reverse_charge?: boolean | null
          sent_date?: string | null
          sent_to_accountant_at?: string | null
          status?: Database['public']['Enums']['invoice_status'] | null
          subtotal: number
          total: number
          total_base?: number | null
          updated_at?: string | null
          user_id?: string | null
          vat_amount: number
          vat_rate: number
        }
        Update: {
          client_id?: string
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_vat_number?: string | null
          due_date?: string
          exchange_rate?: number | null
          gig_id?: string | null
          id?: string
          imported_from_pdf?: boolean | null
          invoice_date?: string
          invoice_number?: number
          notes?: string | null
          original_pdf_url?: string | null
          paid_date?: string | null
          pdf_url?: string | null
          reference_person_override?: string | null
          reverse_charge?: boolean | null
          sent_date?: string | null
          sent_to_accountant_at?: string | null
          status?: Database['public']['Enums']['invoice_status'] | null
          subtotal?: number
          total?: number
          total_base?: number | null
          updated_at?: string | null
          user_id?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_gig_id_fkey'
            columns: ['gig_id']
            isOneToOne: false
            referencedRelation: 'gigs'
            referencedColumns: ['id']
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          joined_at: string | null
          organization_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          organization_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          organization_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'positions_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      sponsor_impressions: {
        Row: {
          created_at: string | null
          id: string
          impression_type: string | null
          invoice_id: string | null
          sponsor_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          impression_type?: string | null
          invoice_id?: string | null
          sponsor_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          impression_type?: string | null
          invoice_id?: string | null
          sponsor_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sponsor_impressions_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sponsor_impressions_sponsor_id_fkey'
            columns: ['sponsor_id']
            isOneToOne: false
            referencedRelation: 'sponsors'
            referencedColumns: ['id']
          },
        ]
      }
      sponsors: {
        Row: {
          active: boolean | null
          created_at: string | null
          display_prefix: string | null
          id: string
          instrument_category_id: string
          logo_url: string | null
          name: string
          priority: number | null
          tagline: string | null
          target_cities: string[] | null
          target_city: string | null
          target_country: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          display_prefix?: string | null
          id?: string
          instrument_category_id: string
          logo_url?: string | null
          name: string
          priority?: number | null
          tagline?: string | null
          target_cities?: string[] | null
          target_city?: string | null
          target_country?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          display_prefix?: string | null
          id?: string
          instrument_category_id?: string
          logo_url?: string | null
          name?: string
          priority?: number | null
          tagline?: string | null
          target_cities?: string[] | null
          target_city?: string | null
          target_country?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sponsors_instrument_category_id_fkey'
            columns: ['instrument_category_id']
            isOneToOne: false
            referencedRelation: 'instrument_categories'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          admin_override: boolean | null
          apple_product_id: string | null
          apple_transaction_id: string | null
          cancel_at_period_end: boolean | null
          company_id: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payment_provider: string
          pending_plan: string | null
          plan: Database['public']['Enums']['subscription_plan']
          status: Database['public']['Enums']['subscription_status']
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_override?: boolean | null
          apple_product_id?: string | null
          apple_transaction_id?: string | null
          cancel_at_period_end?: boolean | null
          company_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_provider?: string
          pending_plan?: string | null
          plan?: Database['public']['Enums']['subscription_plan']
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_override?: boolean | null
          apple_product_id?: string | null
          apple_transaction_id?: string | null
          cancel_at_period_end?: boolean | null
          company_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_provider?: string
          pending_plan?: string | null
          plan?: Database['public']['Enums']['subscription_plan']
          status?: Database['public']['Enums']['subscription_status']
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      supplier_aliases: {
        Row: {
          alias: string
          canonical: string
          company_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          alias: string
          canonical: string
          company_id?: string
          created_at?: string | null
          id?: string
        }
        Update: {
          alias?: string
          canonical?: string
          company_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'supplier_aliases_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      usage_tracking: {
        Row: {
          created_at: string | null
          email_send_count: number | null
          id: string
          invoice_count: number
          month: number
          receipt_scan_count: number
          updated_at: string | null
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string | null
          email_send_count?: number | null
          id?: string
          invoice_count?: number
          month: number
          receipt_scan_count?: number
          updated_at?: string | null
          user_id: string
          year: number
        }
        Update: {
          created_at?: string | null
          email_send_count?: number | null
          id?: string
          invoice_count?: number
          month?: number
          receipt_scan_count?: number
          updated_at?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      user_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_categories_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'instrument_categories'
            referencedColumns: ['id']
          },
        ]
      }
      user_instruments: {
        Row: {
          created_at: string | null
          id: string
          instrument_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instrument_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instrument_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_instruments_instrument_id_fkey'
            columns: ['instrument_id']
            isOneToOne: false
            referencedRelation: 'instruments'
            referencedColumns: ['id']
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          last_active_at: string | null
          started_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          last_active_at?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          last_active_at?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_user_tier: {
        Args: {
          admin_uid: string
          new_plan: Database['public']['Enums']['subscription_plan']
          target_user_id: string
        }
        Returns: boolean
      }
      admin_user_stats: {
        Args: { p_user_ids: string[] }
        Returns: {
          client_count: number
          expense_count: number
          gig_count: number
          gig_type_count: number
          invoice_count: number
          position_count: number
          user_id: string
        }[]
      }
      claim_orphaned_data: { Args: { uid: string }; Returns: undefined }
      company_gig_visibility: { Args: { cid: string }; Returns: string }
      count_by_user: {
        Args: { table_name: string; user_ids: string[] }
        Returns: {
          count: number
          user_id: string
        }[]
      }
      create_client: {
        Args: {
          p_address?: string
          p_client_code?: string
          p_company_id: string
          p_country_code?: string
          p_email?: string
          p_invoice_language?: string
          p_name: string
          p_notes?: string
          p_org_number?: string
          p_payment_terms?: number
          p_reference_person?: string
          p_user_id: string
          p_vat_number?: string
        }
        Returns: string
      }
      create_gig: {
        Args: {
          p_client_id?: string
          p_company_id: string
          p_currency?: string
          p_date: string
          p_end_date?: string
          p_fee?: number
          p_gig_type_id: string
          p_invoice_notes?: string
          p_notes?: string
          p_position_id?: string
          p_project_name?: string
          p_response_deadline?: string
          p_start_date?: string
          p_status?: Database['public']['Enums']['gig_status']
          p_travel_expense?: number
          p_user_id: string
          p_venue?: string
        }
        Returns: string
      }
      get_next_invoice_number: { Args: { cid: string }; Returns: number }
      get_user_company_id: { Args: never; Returns: string }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_company_member: { Args: { cid: string }; Returns: boolean }
      use_invitation_code: {
        Args: { code_value: string; uid: string }
        Returns: boolean
      }
    }
    Enums: {
      gig_status:
        | 'tentative'
        | 'pending'
        | 'accepted'
        | 'declined'
        | 'completed'
        | 'invoiced'
        | 'paid'
        | 'draft'
        | 'cancelled'
      invoice_status: 'draft' | 'sent' | 'paid' | 'overdue'
      subscription_plan: 'free' | 'pro' | 'team'
      subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      gig_status: [
        'tentative',
        'pending',
        'accepted',
        'declined',
        'completed',
        'invoiced',
        'paid',
        'draft',
        'cancelled',
      ],
      invoice_status: ['draft', 'sent', 'paid', 'overdue'],
      subscription_plan: ['free', 'pro', 'team'],
      subscription_status: ['active', 'canceled', 'past_due', 'trialing', 'incomplete'],
    },
  },
} as const
