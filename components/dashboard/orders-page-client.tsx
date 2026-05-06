"use client";

import { useState } from "react";
import { TopBar } from "@/components/dashboard/top-bar";
import { OrdersTableClient } from "@/components/dashboard/orders-table-client";

export function OrdersPageClient() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="space-y-3">
      <TopBar
        searchValue={query}
        onSearchChange={setQuery}
        placeholder="Search by ticker, side, quantity, fill status, or time…"
        leftExtras={
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="glass-input h-[42px] rounded-[8px] px-3 text-sm text-zinc-200"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="glass-input h-[42px] rounded-[8px] px-3 text-sm text-zinc-200"
            />
          </>
        }
      />

      <OrdersTableClient query={query} from={from} to={to} />
    </div>
  );
}

