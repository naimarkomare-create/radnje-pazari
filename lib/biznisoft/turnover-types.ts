export type BizniSoftTurnoverStore = {
  storeId: string;
  storeNumber: number | null;
  storeName: string;
  amount: number | null;
};

export type BizniSoftTurnoverSnapshot = {
  businessDate: string;
  currency: "RSD";
  total: number;
  stores: BizniSoftTurnoverStore[];
  representedStores: number;
  mappingComplete: boolean;
  fetchedAt: string;
  source: "biznisoft";
  warnings: string[];
};

export type BizniSoftTurnoverResult = BizniSoftTurnoverSnapshot & {
  stale: boolean;
  refreshing: boolean;
  warning: string | null;
};
