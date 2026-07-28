export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      clicks: {
        Row: {
          clicked_at: string
          id: string
          ip: string | null
          job_id: string
          subscriber_id: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          ip?: string | null
          job_id: string
          subscriber_id?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          ip?: string | null
          job_id?: string
          subscriber_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clicks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clicks_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          error: string | null
          id: string
          job_id: string
          message_id: number | null
          sent_at: string
          subscriber_id: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["delivery_channel"]
          error?: string | null
          id?: string
          job_id: string
          message_id?: number | null
          sent_at?: string
          subscriber_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["delivery_channel"]
          error?: string | null
          id?: string
          job_id?: string
          message_id?: number | null
          sent_at?: string
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          broadcast_at: string | null
          city: string | null
          description: string | null
          employment_type: string | null
          external_id: string
          id: string
          job_type: string | null
          pay_rate: string | null
          posted_at: string | null
          raw: Json | null
          region: Database["public"]["Enums"]["job_region"]
          scraped_at: string
          state: string | null
          title: string
          url: string
          warehouse: string | null
        }
        Insert: {
          broadcast_at?: string | null
          city?: string | null
          description?: string | null
          employment_type?: string | null
          external_id: string
          id?: string
          job_type?: string | null
          pay_rate?: string | null
          posted_at?: string | null
          raw?: Json | null
          region: Database["public"]["Enums"]["job_region"]
          scraped_at?: string
          state?: string | null
          title: string
          url: string
          warehouse?: string | null
        }
        Update: {
          broadcast_at?: string | null
          city?: string | null
          description?: string | null
          employment_type?: string | null
          external_id?: string
          id?: string
          job_type?: string | null
          pay_rate?: string | null
          posted_at?: string | null
          raw?: Json | null
          region?: Database["public"]["Enums"]["job_region"]
          scraped_at?: string
          state?: string | null
          title?: string
          url?: string
          warehouse?: string | null
        }
        Relationships: []
      }
      search_queries: {
        Row: {
          active: boolean
          city: string | null
          created_at: string
          id: string
          keyword: string | null
          region: Database["public"]["Enums"]["job_region"]
        }
        Insert: {
          active?: boolean
          city?: string | null
          created_at?: string
          id?: string
          keyword?: string | null
          region: Database["public"]["Enums"]["job_region"]
        }
        Update: {
          active?: boolean
          city?: string | null
          created_at?: string
          id?: string
          keyword?: string | null
          region?: Database["public"]["Enums"]["job_region"]
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          chat_id: number
          cities: string[]
          first_name: string | null
          id: string
          joined_at: string
          keywords: string[]
          last_active_at: string
          regions: Database["public"]["Enums"]["job_region"][]
          status: Database["public"]["Enums"]["sub_status"]
          telegram_user_id: number
          username: string | null
        }
        Insert: {
          chat_id: number
          cities?: string[]
          first_name?: string | null
          id?: string
          joined_at?: string
          keywords?: string[]
          last_active_at?: string
          regions?: Database["public"]["Enums"]["job_region"][]
          status?: Database["public"]["Enums"]["sub_status"]
          telegram_user_id: number
          username?: string | null
        }
        Update: {
          chat_id?: number
          cities?: string[]
          first_name?: string | null
          id?: string
          joined_at?: string
          keywords?: string[]
          last_active_at?: string
          regions?: Database["public"]["Enums"]["job_region"][]
          status?: Database["public"]["Enums"]["sub_status"]
          telegram_user_id?: number
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      delivery_channel: "channel" | "dm"
      job_region: "US" | "UK"
      sub_status: "active" | "paused" | "stopped" | "banned"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      delivery_channel: ["channel", "dm"],
      job_region: ["US", "UK"],
      sub_status: ["active", "paused", "stopped", "banned"],
    },
  },
} as const
