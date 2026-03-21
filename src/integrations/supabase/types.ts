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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          district: string
          id: string
          is_default: boolean
          label: string
          number: string
          postal_code: string
          state: string
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          complement?: string | null
          created_at?: string
          district: string
          id?: string
          is_default?: boolean
          label?: string
          number: string
          postal_code: string
          state: string
          street: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          district?: string
          id?: string
          is_default?: boolean
          label?: string
          number?: string
          postal_code?: string
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      banner_slides: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_desktop: string
          image_mobile: string
          image_tablet: string
          link_url: string | null
          product_id: string | null
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_desktop?: string
          image_mobile?: string
          image_tablet?: string
          link_url?: string | null
          product_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_desktop?: string
          image_mobile?: string
          image_tablet?: string
          link_url?: string | null
          product_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_slides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          active: boolean
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      cart_abandonment_logs: {
        Row: {
          cart_item_count: number
          email_sent_at: string
          id: string
          user_id: string
        }
        Insert: {
          cart_item_count?: number
          email_sent_at?: string
          id?: string
          user_id: string
        }
        Update: {
          cart_item_count?: number
          email_sent_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
          variation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          created_at: string
          customer_address: string | null
          customer_city: string | null
          customer_complement: string | null
          customer_cpf: string
          customer_district: string | null
          customer_email: string
          customer_name: string
          customer_number: string | null
          customer_phone: string | null
          customer_postal_code: string | null
          customer_state: string | null
          customer_user_id: string | null
          delivery_status: string | null
          dosage: string | null
          id: string
          installments: number
          label_url: string | null
          payment_method: string
          product_name: string
          quantity: number
          selected_service_id: number | null
          shipment_id: string | null
          shipping_cost: number | null
          shipping_service: string | null
          shipping_status: string | null
          status: string
          total_value: number
          tracking_code: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_city?: string | null
          customer_complement?: string | null
          customer_cpf: string
          customer_district?: string | null
          customer_email: string
          customer_name: string
          customer_number?: string | null
          customer_phone?: string | null
          customer_postal_code?: string | null
          customer_state?: string | null
          customer_user_id?: string | null
          delivery_status?: string | null
          dosage?: string | null
          id?: string
          installments?: number
          label_url?: string | null
          payment_method?: string
          product_name: string
          quantity?: number
          selected_service_id?: number | null
          shipment_id?: string | null
          shipping_cost?: number | null
          shipping_service?: string | null
          shipping_status?: string | null
          status?: string
          total_value?: number
          tracking_code?: string | null
          tracking_url?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_city?: string | null
          customer_complement?: string | null
          customer_cpf?: string
          customer_district?: string | null
          customer_email?: string
          customer_name?: string
          customer_number?: string | null
          customer_phone?: string | null
          customer_postal_code?: string | null
          customer_state?: string | null
          customer_user_id?: string | null
          delivery_status?: string | null
          dosage?: string | null
          id?: string
          installments?: number
          label_url?: string | null
          payment_method?: string
          product_name?: string
          quantity?: number
          selected_service_id?: number | null
          shipment_id?: string | null
          shipping_cost?: number | null
          shipping_service?: string | null
          shipping_status?: string | null
          status?: string
          total_value?: number
          tracking_code?: string | null
          tracking_url?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_links: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          description: string | null
          id: string
          max_installments: number | null
          pix_discount_percent: number | null
          slug: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          max_installments?: number | null
          pix_discount_percent?: number | null
          slug: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          max_installments?: number | null
          pix_discount_percent?: number | null
          slug?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_logs: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          error_message: string
          error_source: string
          id: string
          order_id: string | null
          payment_method: string | null
          request_payload: Json | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          error_message: string
          error_source?: string
          id?: string
          order_id?: string | null
          payment_method?: string | null
          request_payload?: Json | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          error_message?: string
          error_source?: string
          id?: string
          order_id?: string | null
          payment_method?: string | null
          request_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      popups: {
        Row: {
          active: boolean
          created_at: string
          expires_at: string | null
          id: string
          image_url: string
          product_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url?: string
          product_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url?: string
          product_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "popups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variations: {
        Row: {
          created_at: string
          dosage: string
          id: string
          image_url: string | null
          images: string[] | null
          in_stock: boolean
          is_offer: boolean
          offer_price: number | null
          price: number
          product_id: string
          subtitle: string | null
        }
        Insert: {
          created_at?: string
          dosage: string
          id?: string
          image_url?: string | null
          images?: string[] | null
          in_stock?: boolean
          is_offer?: boolean
          offer_price?: number | null
          price?: number
          product_id: string
          subtitle?: string | null
        }
        Update: {
          created_at?: string
          dosage?: string
          id?: string
          image_url?: string | null
          images?: string[] | null
          in_stock?: boolean
          is_offer?: boolean
          offer_price?: number | null
          price?: number
          product_id?: string
          subtitle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active_ingredient: string | null
          administration_route: string | null
          created_at: string
          description: string | null
          free_shipping: boolean
          free_shipping_min_value: number | null
          frequency: string | null
          id: string
          images: string[] | null
          installments_interest: string | null
          is_bestseller: boolean
          max_installments: number | null
          name: string
          pharma_form: string | null
          pix_discount_percent: number | null
          subtitle: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_ingredient?: string | null
          administration_route?: string | null
          created_at?: string
          description?: string | null
          free_shipping?: boolean
          free_shipping_min_value?: number | null
          frequency?: string | null
          id?: string
          images?: string[] | null
          installments_interest?: string | null
          is_bestseller?: boolean
          max_installments?: number | null
          name: string
          pharma_form?: string | null
          pix_discount_percent?: number | null
          subtitle?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_ingredient?: string | null
          administration_route?: string | null
          created_at?: string
          description?: string | null
          free_shipping?: boolean
          free_shipping_min_value?: number | null
          frequency?: string | null
          id?: string
          images?: string[] | null
          installments_interest?: string | null
          is_bestseller?: boolean
          max_installments?: number | null
          name?: string
          pharma_form?: string | null
          pix_discount_percent?: number | null
          subtitle?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          product_name: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          product_name: string
          rating?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          product_name?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          order_id: string | null
          request_payload: Json | null
          response_payload: Json | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          order_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          order_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_role?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_testimonials: {
        Row: {
          created_at: string
          id: string
          name: string
          thumbnail_url: string | null
          user_id: string
          video_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          thumbnail_url?: string | null
          user_id: string
          video_url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          thumbnail_url?: string | null
          user_id?: string
          video_url?: string
        }
        Relationships: []
      }
      wholesale_prices: {
        Row: {
          created_at: string
          id: string
          min_quantity: number
          price: number
          variation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_quantity: number
          price?: number
          variation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_quantity?: number
          price?: number
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_prices_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
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
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
