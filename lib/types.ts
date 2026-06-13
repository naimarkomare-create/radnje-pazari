export type UserRole = "admin" | "store";

export type Store = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
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
  check_revenue: number;
  card_revenue: number;
  bank_transfer_revenue: number;
  correction_revenue: number;
  edopuna_revenue: number;
  total_revenue: number;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "name"> | null;
};

export type TemperatureReport = {
  id: string;
  store_id: string;
  user_id: string;
  device_id: string | null;
  report_date: string;
  shift: string | null;
  device_name: string;
  temperature: number;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "name"> | null;
};

export type TemperatureDevice = {
  id: string;
  store_id: string;
  name: string;
  device_type: "Frižider" | "Zamrzivač" | "Vitrina" | "Ostalo" | null;
  min_allowed: number | null;
  max_allowed: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  stores?: Pick<Store, "id" | "name"> | null;
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

export type ProduceItem = {
  id: string;
  name: string;
  unit: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type ProduceRequestItem = {
  id: string;
  batch_id: string;
  produce_item_id: string;
  quantity: number;
  created_at: string;
  produce_items?: Pick<ProduceItem, "id" | "name" | "unit" | "sort_order"> | null;
};

export type ProduceRequestBatch = {
  id: string;
  store_id: string;
  user_id: string;
  request_date: string;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "id" | "name"> | null;
  produce_request_items?: ProduceRequestItem[];
};

export type ProduceShelfPhotoCheck = {
  id: string;
  store_id: string;
  user_id: string;
  check_date: string;
  photo_url: string | null;
  storage_path: string | null;
  note: string | null;
  created_at: string;
  stores?: Pick<Store, "id" | "name"> | null;
  signedUrl?: string;
};

export type TaskPriority = "podsetnik" | "vazno" | "hitno";
export type TaskStatus = "pending" | "done" | "late";

export type StoreTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  priority: TaskPriority;
  photo_required: boolean;
  created_by: string | null;
  created_at: string;
  active: boolean;
  source_type: string | null;
  source_key: string | null;
  store_task_assignments?: StoreTaskAssignment[];
};

export type StoreTaskAssignment = {
  id: string;
  task_id: string;
  store_id: string;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  photo_path: string | null;
  photo_url: string | null;
  created_at: string;
  stores?: Pick<Store, "id" | "name"> | null;
  store_tasks?: Omit<StoreTask, "store_task_assignments"> | null;
  signedPhotoUrl?: string;
  computedStatus?: TaskStatus;
};

export type ActionState = {
  ok: boolean;
  message: string;
};

export type BizniSoftSaleAction = {
  id: string;
  source_key: string;
  sale_action_name: string | null;
  action_type: number;
  loyalty_level: number | null;
  storage_id: number | null;
  article_id: number | null;
  article_attribute_id: number | null;
  discount_percent: number | null;
  wholesale_price: number | null;
  retail_price: number | null;
  from_chapter: string | null;
  chapter_to: string | null;
  priority_level: number | null;
  raw: Record<string, unknown>;
  synced_at: string;
};

export type BizniSoftArticle = {
  article_id: number;
  name: string | null;
  barcode: string | null;
  article_code: string | null;
  cat_no: string | null;
  unit: string | null;
  raw: Record<string, unknown>;
  synced_at: string;
};

export type BizniSoftSaleActionWithArticle = BizniSoftSaleAction & {
  article_name: string | null;
  article_barcode: string | null;
  article_code: string | null;
  article_cat_no: string | null;
  article_unit: string | null;
  article_raw: Record<string, unknown> | null;
};
