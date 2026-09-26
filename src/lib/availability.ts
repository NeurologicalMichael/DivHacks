import type { Availability } from "./types";

type AvailabilityInput = {
  vacant: boolean;
  reportingYear: string | null;
  reportingYearNum: number | null;
  asOf: string | null;
  leaseExpiration: string | null;
  hasDemoLandlord: boolean;
  hasLandlordOptIn: boolean;
  landlordWindow?: number | null;
};

function daysFromToday(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function availabilityFor(row: AvailabilityInput): Availability {
  const year = row.reportingYearNum ?? 0;
  const filing = row.reportingYear ?? "an unknown reporting year";

  if (row.vacant && year >= 2024) {
    return {
      kind: "reported_vacant",
      label: `Reported vacant on the ${filing} filing`,
      disclaimer:
        "This is the owner-reported status in the NYC Storefront Registry. It is not a brokerage listing, and the space may have been leased since the filing.",
    };
  }

  if (row.leaseExpiration && year >= 2023) {
    const days = daysFromToday(row.leaseExpiration);
    if (days >= -120 && days <= 366) {
      const when = days >= 0 ? `on ${row.leaseExpiration}` : `on ${row.leaseExpiration}, which has passed`;
      return {
        kind: "lease_on_file",
        label: `Lease date on file ${when}`,
        disclaimer: `The date comes from expir_dt_of_most_recent_lease on the ${filing} filing. It does not confirm that the space is listed or will actually become empty.`,
      };
    }
  }

  if (row.hasLandlordOptIn || row.hasDemoLandlord) {
    const windowMonths = row.landlordWindow ?? 6;
    return {
      kind: "landlord_opt_in",
      label: row.hasDemoLandlord
        ? "Demo landlord signal: possible availability within 6 months"
        : `Anonymous landlord signal: possible availability within ${windowMonths} months`,
      disclaimer: row.hasDemoLandlord
        ? "This opt-in is demo data so the workflow is visible. It is not a city record and not a real landlord."
        : "A landlord submitted this privately. Entrepreneurs only see this anonymous line. It is a self-report, not a confirmed listing.",
    };
  }

  if (row.vacant) {
    return {
      kind: "historical_vacancy",
      label: `Vacant on a ${filing} filing`,
      disclaimer:
        "The latest filing in this extract is old enough that LeaseLens does not treat it as evidence of availability in the next 6 months.",
    };
  }

  if (row.leaseExpiration) {
    return {
      kind: "no_date",
      label: `Lease date on file: ${row.leaseExpiration}`,
      disclaimer:
        "That date sits outside the near-term window, so it is not scored as a lease that may end soon. No availability date is estimated.",
    };
  }

  return {
    kind: "no_date",
    label: "No availability date on file",
    disclaimer:
      "LeaseLens does not estimate a date when none is in the registry, a recent vacancy flag, or a landlord opt-in.",
  };
}
