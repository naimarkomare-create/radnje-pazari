export type UserRole = "admin" | "store";

export type Store = {
  id: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  store_id: string | null;
  created_at: string;
  stores?: Pick<Store, "id" | "name"> | null;
};

export type DailyRevenueReport = {
  id: string;
  store_id: string;
  user_id: string;
  report_date: string;
  shift: string | null;
  cash_revenue: number;
  card_revenue: number;
  total_revenue: number;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "name"> | null;
};

export type TemperatureReport = {
  id: string;
  store_id: string;
  user_id: string;
  report_date: string;
  device_name: string;
  temperature: number;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "name"> | null;
};

export type ProduceRequest = {
  id: string;
  store_id: string;
  user_id: string;
  request_date: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "name"> | null;
};

export type ActionState = {
  ok: boolean;
  message: string;
};
