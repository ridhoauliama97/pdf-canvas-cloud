export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      api_keys: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          scopes: string[];
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          scopes?: string[];
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          scopes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          brand_color: string;
          created_at: string;
          created_by: string;
          default_font: string;
          id: string;
          industry: string | null;
          logo_url: string | null;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          brand_color?: string;
          created_at?: string;
          created_by: string;
          default_font?: string;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          brand_color?: string;
          created_at?: string;
          created_by?: string;
          default_font?: string;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      batches: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          failed_count: number;
          id: string;
          name: string | null;
          processed_count: number;
          status: string;
          total_count: number;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          name?: string | null;
          processed_count?: number;
          status?: string;
          total_count?: number;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          name?: string | null;
          processed_count?: number;
          status?: string;
          total_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batches_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      batch_items: {
        Row: {
          batch_id: string;
          created_at: string;
          data: Json;
          document_id: string | null;
          error: string | null;
          id: string;
          status: string;
          template_id: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          data?: Json;
          document_id?: string | null;
          error?: string | null;
          id?: string;
          status?: string;
          template_id: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          data?: Json;
          document_id?: string | null;
          error?: string | null;
          id?: string;
          status?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batch_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "batch_items_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      company_members: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          company_id: string;
          created_at: string;
          data_snapshot: Json;
          file_url: string | null;
          generated_by: string | null;
          id: string;
          status: string;
          template_id: string;
          version_id: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          data_snapshot?: Json;
          file_url?: string | null;
          generated_by?: string | null;
          id?: string;
          status?: string;
          template_id: string;
          version_id?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          data_snapshot?: Json;
          file_url?: string | null;
          generated_by?: string | null;
          id?: string;
          status?: string;
          template_id?: string;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          company_id: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          role: Database["public"]["Enums"]["member_role"];
          status: string;
          token: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: string;
          token: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      template_versions: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          data_schema: Json;
          id: string;
          layout: Json;
          note: string | null;
          page: Json;
          sample_data: Json;
          template_id: string;
          version: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          data_schema?: Json;
          id?: string;
          layout?: Json;
          note?: string | null;
          page?: Json;
          sample_data?: Json;
          template_id: string;
          version?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_schema?: Json;
          id?: string;
          layout?: Json;
          note?: string | null;
          page?: Json;
          sample_data?: Json;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_versions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_versions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      webhooks: {
        Row: {
          active: boolean;
          company_id: string;
          created_at: string;
          events: string[];
          id: string;
          secret: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          active?: boolean;
          company_id: string;
          created_at?: string;
          events?: string[];
          id?: string;
          secret: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          active?: boolean;
          company_id?: string;
          created_at?: string;
          events?: string[];
          id?: string;
          secret?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhooks_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          deleted_at: string | null;
          description: string | null;
          doc_type: string;
          id: string;
          name: string;
          page_format: string;
          status: Database["public"]["Enums"]["template_status"];
          updated_at: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          doc_type?: string;
          id?: string;
          name: string;
          page_format?: string;
          status?: Database["public"]["Enums"]["template_status"];
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          doc_type?: string;
          id?: string;
          name?: string;
          page_format?: string;
          status?: Database["public"]["Enums"]["template_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "templates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "templates_current_version_fk";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_workspace: {
        Args: { _industry?: string; _name: string };
        Returns: string;
      };
      has_company_role: {
        Args: {
          _company_id: string;
          _roles: Database["public"]["Enums"]["member_role"][];
        };
        Returns: boolean;
      };
      is_company_member: { Args: { _company_id: string }; Returns: boolean };
      user_owns_storage_path: {
        Args: { _bucket_id: string; _path: string };
        Returns: boolean;
      };
    };
    Enums: {
      member_role: "admin" | "editor" | "developer" | "viewer";
      template_status: "draft" | "published";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      member_role: ["admin", "editor", "developer", "viewer"],
      template_status: ["draft", "published"],
    },
  },
} as const;
