// Estimated owner spend on trial runs, per UTC day. A run reserves its worst
// case before it starts and settles with what it actually spent when it ends,
// so runs that overlap can't jointly pass the budget.
//
// This lives in server memory: each server instance keeps its own count and a
// restart clears it. That is enough to stop a runaway day on a small demo, not
// to enforce an exact limit across instances. A budget of 0 allows no trial run,
// which is the default.

// Tavily's pay-as-you-go price per credit, so search spend counts against the
// same budget as model spend.
export const TAVILY_USD_PER_CREDIT = 0.008;

// Async, so the count can live somewhere every server instance shares.
export type Reservation = { settle: (actualUsd: number) => Promise<void> };

export type DailyLedger = {
  reserve: (amountUsd: number) => Promise<Reservation | null>;
};

export type MemoryLedger = DailyLedger & { spentTodayUsd: () => number };

export function createDailyLedger(budgetUsd: number, now: () => Date = () => new Date()): MemoryLedger {
  let day = "";
  let settledUsd = 0;
  let reservedUsd = 0;
  const rollOver = () => {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      settledUsd = 0;
    }
  };

  return {
    async reserve(amountUsd) {
      rollOver();
      if (settledUsd + reservedUsd + amountUsd > budgetUsd) return null;
      reservedUsd += amountUsd;
      let settled = false;
      return {
        async settle(actualUsd) {
          if (settled) return;
          settled = true;
          rollOver();
          reservedUsd -= amountUsd;
          settledUsd += Math.max(0, actualUsd);
        },
      };
    },
    spentTodayUsd() {
      rollOver();
      return settledUsd;
    },
  };
}
