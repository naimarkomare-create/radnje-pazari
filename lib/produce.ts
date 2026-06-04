import type { ProduceRequestBatch, Store } from "@/lib/types";

export const PRODUCE_STORE_NAMES = [
  "Radnja 1",
  "Radnja 2",
  "Radnja 3",
  "Radnja 4",
  "Radnja 5",
  "Radnja 6",
  "Radnja 7",
  "Radnja 8",
  "Radnja 9",
  "Radnja 11"
] as const;

export type ProduceMatrixRow = {
  itemId: string;
  itemName: string;
  unit: string;
  sortOrder: number;
  quantities: Record<string, number>;
  total: number;
};

export function sortProduceStores(stores: Store[]) {
  const order = new Map(PRODUCE_STORE_NAMES.map((name, index) => [name, index]));
  return stores
    .filter((store) => order.has(store.name as (typeof PRODUCE_STORE_NAMES)[number]))
    .sort((a, b) => (order.get(a.name as (typeof PRODUCE_STORE_NAMES)[number]) ?? 99) - (order.get(b.name as (typeof PRODUCE_STORE_NAMES)[number]) ?? 99));
}

export function buildProduceMatrix(batches: ProduceRequestBatch[]) {
  const rows = new Map<string, ProduceMatrixRow>();

  for (const batch of batches) {
    const storeName = batch.stores?.name;
    if (!storeName) continue;

    for (const item of batch.produce_request_items ?? []) {
      const produceItem = item.produce_items;
      if (!produceItem || Number(item.quantity) <= 0) continue;

      const current = rows.get(produceItem.id) ?? {
        itemId: produceItem.id,
        itemName: produceItem.name,
        unit: produceItem.unit,
        sortOrder: produceItem.sort_order,
        quantities: {},
        total: 0
      };
      const quantity = Number(item.quantity);
      current.quantities[storeName] = (current.quantities[storeName] ?? 0) + quantity;
      current.total += quantity;
      rows.set(produceItem.id, current);
    }
  }

  return Array.from(rows.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}
