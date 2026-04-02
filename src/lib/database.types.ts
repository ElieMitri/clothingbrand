export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          price: number;
          description: string;
          image_url: string;
          category: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price: number;
          description: string;
          image_url: string;
          category: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          price?: number;
          description?: string;
          image_url?: string;
          category?: string;
          created_at?: string;
        };
      };
      carts: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          size: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          size: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          size?: string;
          quantity?: number;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          items: {
            product_id: string;
            size: string;
            quantity: number;
            price: number;
          }[];
          total: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          items: {
            product_id: string;
            size: string;
            quantity: number;
            price: number;
          }[];
          total: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          items?: {
            product_id: string;
            size: string;
            quantity: number;
            price: number;
          }[];
          total?: number;
          status?: string;
          created_at?: string;
        };
      };
    };
  };
}
