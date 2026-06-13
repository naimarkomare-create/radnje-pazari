"use client";

import { useState, useTransition } from "react";
import { createSaleActionGroupTask } from "@/app/admin/biznisoft-akcije/actions";

export function CreateGroupTaskButton({ groupKey }: { groupKey: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function onCreate() {
    setMessage("");
    startTransition(async () => {
      const result = await createSaleActionGroupTask(groupKey);
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-2">
      <button className="button-primary" disabled={isPending} onClick={onCreate} type="button">
        {isPending ? "Kreiranje..." : "Napravi zadatak za ovu akciju"}
      </button>
      {message ? <p className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{message}</p> : null}
    </div>
  );
}
