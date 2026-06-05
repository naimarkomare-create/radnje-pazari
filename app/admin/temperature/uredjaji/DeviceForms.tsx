"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  addTemperatureDevice,
  setTemperatureDeviceActive,
  updateTemperatureDevice
} from "@/app/admin/temperature/uredjaji/actions";
import type { ActionState, Store, TemperatureDevice } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };
const deviceTypeOptions = ["Frižider", "Zamrzivač", "Vitrina", "Ostalo"];

export function AddDeviceForm({ stores }: { stores: Store[] }) {
  const [state, action] = useFormState(addTemperatureDevice, initialState);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">Dodaj uređaj</h2>
      <DeviceFields action={action} stores={stores} />
      <FormMessage state={state} />
    </section>
  );
}

export function DeviceEditForm({ device, stores }: { device: TemperatureDevice; stores: Store[] }) {
  const [state, action] = useFormState(updateTemperatureDevice, initialState);

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <input name="id" type="hidden" value={device.id} />
      <DeviceFieldInputs device={device} stores={stores} />
      <FormMessage state={state} />
      <SaveButton />
    </form>
  );
}

export function DeviceActiveButton({ device }: { device: TemperatureDevice }) {
  const [state, action] = useFormState(setTemperatureDeviceActive, initialState);

  return (
    <form action={action} className="space-y-2">
      <input name="id" type="hidden" value={device.id} />
      <input name="active" type="hidden" value={String(!device.active)} />
      <button className="button-secondary w-full" type="submit">
        {device.active ? "Deaktiviraj" : "Aktiviraj"}
      </button>
      <FormMessage state={state} compact />
    </form>
  );
}

function DeviceFields({
  action,
  stores
}: {
  action: (payload: FormData) => void;
  stores: Store[];
}) {
  return (
    <form action={action} className="mt-4 space-y-4">
      <DeviceFieldInputs stores={stores} />
      <SaveButton />
    </form>
  );
}

function DeviceFieldInputs({ device, stores }: { device?: TemperatureDevice; stores: Store[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="field">
        <span className="label">Radnja</span>
        <select className="input" defaultValue={device?.store_id ?? ""} name="store_id" required>
          <option value="" disabled>
            Izaberite radnju
          </option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Naziv uređaja</span>
        <input className="input" defaultValue={device?.name ?? ""} name="name" required />
      </label>
      <label className="field">
        <span className="label">Tip uređaja</span>
        <select className="input" defaultValue={device?.device_type ?? ""} name="device_type">
          <option value="">Bez tipa</option>
          {deviceTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Redosled</span>
        <input className="input" defaultValue={device?.sort_order ?? 0} name="sort_order" step="1" type="number" />
      </label>
      <label className="field">
        <span className="label">Min dozvoljena temperatura</span>
        <input className="input" defaultValue={device?.min_allowed ?? ""} name="min_allowed" step="0.1" type="number" />
      </label>
      <label className="field">
        <span className="label">Max dozvoljena temperatura</span>
        <input className="input" defaultValue={device?.max_allowed ?? ""} name="max_allowed" step="0.1" type="number" />
      </label>
      <label className="flex items-center gap-3 pt-8">
        <input className="size-5" defaultChecked={device?.active ?? true} name="active" type="checkbox" />
        <span className="label">Aktivan</span>
      </label>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary w-full sm:w-auto" disabled={pending} type="submit">
      {pending ? "Čuvanje..." : "Sačuvaj"}
    </button>
  );
}

function FormMessage({ state, compact = false }: { state: ActionState; compact?: boolean }) {
  if (!state.message) return null;
  return (
    <p className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"} ${compact ? "text-xs" : ""}`}>
      {state.message}
    </p>
  );
}
