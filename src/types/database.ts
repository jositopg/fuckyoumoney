export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type DisplayCurrency = 'EUR' | 'USD' | 'GBP'
export type AssetType =
  | 'stock'
  | 'etf'
  | 'crypto'
  | 'commodity'
  | 'real_estate'
  | 'cash'
  | 'bond'
  | 'pension'
  | 'other'
export type TickerSource = 'yahoo' | 'coingecko'
export type LiabilityType =
  | 'mortgage'
  | 'personal_loan'
  | 'car_loan'
  | 'credit_card'
  | 'student_loan'
  | 'other'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          name: string | null
          display_currency: DisplayCurrency
        }
        Insert: {
          id: string
          email?: string | null
          name?: string | null
          display_currency?: DisplayCurrency
        }
        Update: {
          id?: string
          email?: string | null
          name?: string | null
          display_currency?: DisplayCurrency
        }
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          user_id: string
          name: string
          type: AssetType
          ticker: string | null
          ticker_source: TickerSource | null
          quantity: number
          purchase_price: number | null
          purchase_date: string | null
          manual_value: number | null
          currency: string
          institution: string | null
          country: string | null
          notes: string | null
          is_liquid: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: AssetType
          ticker?: string | null
          ticker_source?: TickerSource | null
          quantity?: number
          purchase_price?: number | null
          purchase_date?: string | null
          manual_value?: number | null
          currency?: string
          institution?: string | null
          country?: string | null
          notes?: string | null
          is_liquid?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: AssetType
          ticker?: string | null
          ticker_source?: TickerSource | null
          quantity?: number
          purchase_price?: number | null
          purchase_date?: string | null
          manual_value?: number | null
          currency?: string
          institution?: string | null
          country?: string | null
          notes?: string | null
          is_liquid?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      liabilities: {
        Row: {
          id: string
          user_id: string
          name: string
          type: LiabilityType
          balance: number
          original_amount: number | null
          interest_rate: number | null
          monthly_payment: number | null
          start_date: string | null
          end_date: string | null
          currency: string
          institution: string | null
          notes: string | null
          is_current: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: LiabilityType
          balance?: number
          original_amount?: number | null
          interest_rate?: number | null
          monthly_payment?: number | null
          start_date?: string | null
          end_date?: string | null
          currency?: string
          institution?: string | null
          notes?: string | null
          is_current?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: LiabilityType
          balance?: number
          original_amount?: number | null
          interest_rate?: number | null
          monthly_payment?: number | null
          start_date?: string | null
          end_date?: string | null
          currency?: string
          institution?: string | null
          notes?: string | null
          is_current?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          symbol: string
          price: number
          currency: string
          change_pct: number | null
          source: string | null
          last_updated: string
        }
        Insert: {
          symbol: string
          price: number
          currency?: string
          change_pct?: number | null
          source?: string | null
          last_updated?: string
        }
        Update: {
          symbol?: string
          price?: number
          currency?: string
          change_pct?: number | null
          source?: string | null
          last_updated?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      display_currency: DisplayCurrency
      asset_type: AssetType
      ticker_source: TickerSource
      liability_type: LiabilityType
    }
    CompositeTypes: Record<string, never>
  }
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type AssetRow = Database['public']['Tables']['assets']['Row']
export type AssetInsert = Database['public']['Tables']['assets']['Insert']
export type LiabilityRow = Database['public']['Tables']['liabilities']['Row']
export type LiabilityInsert = Database['public']['Tables']['liabilities']['Insert']
