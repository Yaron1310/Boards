
export interface ProductMapping {
  id: string; // Unique ID for the mapping row itself
  productId: string;
  productName: string;
  planId: string;
  planName?: string;
}

export interface WooProduct {
  id: string;
  name:string;
}

export interface Settings {
  apiKey: string;
  apiUrl: string;
  mappings: ProductMapping[];
}

export interface GymindPlan {
  id: string;
  name: string;
}

export interface ProvisionLog {
  id: number;
  order_id: number;
  customer_name: string;
  customer_email: string;
  product_name: string;
  organization_name: string;
  status: 'success' | 'failed';
  created_at: string;
  response_message?: string;
}
