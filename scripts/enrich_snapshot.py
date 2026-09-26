#!/usr/bin/env python3
"""Add DOHMH restaurant counts and DOF commercial-sale medians to the snapshot.

Registry activity labels barely use FOOD SERVICES, so food supply comes from
restaurant inspections. Sale medians are computed only where DOF published
enough arm's-length commercial sales.
"""

from __future__ import annotations

import json
import statistics
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data" / "snapshot.json"
SALES = "https://data.cityofnewyork.us/resource/usep-8jbt.json"
RESTAURANTS = "https://data.cityofnewyork.us/resource/43nn-pn8j.json"

KEYWORDS = {
    "Williamsburg": ["WILLIAMSBURG"],
    "Greenpoint": ["GREENPOINT"],
    "Bushwick": ["BUSHWICK"],
    "Park Slope": ["PARK SLOPE"],
    "Carroll Gardens": ["CARROLL GARDENS", "COBBLE HILL", "GOWANUS", "RED HOOK"],
    "DUMBO": ["DOWNTOWN-FULTON", "DOWNTOWN FULTON", "DUMBO"],
    "Brooklyn Heights": ["BROOKLYN HEIGHTS"],
    "Fort Greene": ["FORT GREENE"],
    "Clinton Hill": ["CLINTON HILL"],
    "Bed-Stuy": ["BEDFORD STUYVESANT"],
    "Crown Heights": ["CROWN HEIGHTS"],
    "Prospect Heights": ["PROSPECT HEIGHTS"],
}


def get(base: str, params: dict):
    url = base + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "leaselens-nyc/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.load(response)


def canonical(name: str) -> str | None:
    upper = name.upper()
    for label, keys in KEYWORDS.items():
        if any(key in upper for key in keys):
            return label
    return None


def main():
    snapshot = json.loads(SNAPSHOT.read_text())
    errors = list(snapshot["meta"].get("errors") or [])

    print("DOF commercial sale medians...")
    try:
        rows = get(
            SALES,
            {
                "$select": "neighborhood, sale_price, sale_date",
                "$where": "borough='3' AND sale_price>'100000' AND commercial_units>'0' AND sale_date>='2023-01-01T00:00:00.000'",
                "$limit": "20000",
            },
        )
        buckets: dict[tuple[str, int], list[float]] = defaultdict(list)
        names: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            label = canonical(row.get("neighborhood") or "")
            if not label or not row.get("sale_date"):
                continue
            price = float(str(row["sale_price"]).replace(",", ""))
            year = int(row["sale_date"][:4])
            buckets[(label, year)].append(price)
            names[label].add(row["neighborhood"])
        trends = []
        for (label, year), prices in sorted(buckets.items()):
            if len(prices) < 8:
                continue
            trends.append(
                {
                    "neighborhood": label,
                    "year": year,
                    "sales": len(prices),
                    "median_price": int(statistics.median(prices)),
                    "provenance": "nyc_open_data",
                    "source": (
                        "DOF Rolling Calendar Sales. Commercial units > 0, price at least $100,000. "
                        f"Median computed from DOF neighborhoods: {', '.join(sorted(names[label]))}."
                    ),
                }
            )
        snapshot["sales_trends"] = trends
        print(f"  trend rows: {len(trends)} from {len(rows)} sales")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"sales trends: {exc}")
        print("  ERR", exc)

    print("DOHMH restaurant counts and nearby sample...")
    existing = {business["id"] for business in snapshot["businesses"]}
    added = 0
    by_neighborhood: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for prop in snapshot["properties"]:
        by_neighborhood[prop["neighborhood"]].append((prop["lat"], prop["lng"]))

    for neighborhood, points in by_neighborhood.items():
        lat = sum(point[0] for point in points) / len(points)
        lng = sum(point[1] for point in points) / len(points)
        # About 800 meters in degrees at NYC's latitude.
        dlat, dlng = 0.0072, 0.0094
        where = (
            f"latitude between {lat - dlat:.6f} and {lat + dlat:.6f} "
            f"AND longitude between {lng - dlng:.6f} and {lng + dlng:.6f}"
        )
        try:
            counted = get(RESTAURANTS, {"$select": "count(distinct camis) as n", "$where": where})
            count = int(counted[0]["n"])
        except Exception as exc:  # noqa: BLE001
            errors.append(f"restaurant count {neighborhood}: {exc}")
            count = None
        for neighborhood_row in snapshot["neighborhoods"]:
            if neighborhood_row["name"] == neighborhood:
                neighborhood_row["restaurant_count"] = count
                neighborhood_row["restaurant_radius_m"] = 800
                neighborhood_row["restaurant_note"] = (
                    "Distinct DOHMH restaurant inspection locations (CAMIS) inside an 800 meter box "
                    "around the center of the storefronts loaded for this neighborhood. "
                    "The Storefront Registry's FOOD SERVICES label is too sparse to measure restaurants, so it is not used here."
                )
        try:
            sample = get(
                RESTAURANTS,
                {
                    "$select": "camis,dba,cuisine_description,latitude,longitude,grade,inspection_date,building,street,boro",
                    "$where": where + " AND dba IS NOT NULL",
                    "$limit": "80",
                },
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"restaurant sample {neighborhood}: {exc}")
            continue
        latest = {}
        for row in sample:
            camis = row.get("camis")
            if not camis or not row.get("latitude"):
                continue
            previous = latest.get(camis)
            if previous is None or (row.get("inspection_date") or "") > (previous.get("inspection_date") or ""):
                latest[camis] = row
        for camis, row in latest.items():
            bid = f"dohmh:{camis}"
            if bid in existing:
                continue
            existing.add(bid)
            snapshot["businesses"].append(
                {
                    "id": bid,
                    "name": row.get("dba"),
                    "category": "food_and_drink",
                    "activity": row.get("cuisine_description") or "Restaurant",
                    "address": " ".join(part for part in [row.get("building"), row.get("street")] if part),
                    "neighborhood": neighborhood,
                    "borough": row.get("boro") or "",
                    "lat": float(row["latitude"]),
                    "lng": float(row["longitude"]),
                    "source": "DOHMH restaurant inspections",
                    "source_dataset": "43nn-pn8j",
                    "provenance": "nyc_open_data",
                    "as_of": (row.get("inspection_date") or "")[:10] or None,
                }
            )
            added += 1
        print(f"  {neighborhood}: restaurants in box={count}, new pins +{len(latest)}")

    snapshot["meta"]["errors"] = errors
    snapshot["meta"]["counts"]["businesses"] = len(snapshot["businesses"])
    snapshot["meta"]["counts"]["sales_trends"] = len(snapshot["sales_trends"])
    snapshot["meta"]["notes"].append(
        "Census ACS was not joined. api.census.gov now requires a key, and none was configured. Household income is left blank rather than estimated."
    )
    snapshot["meta"]["notes"].append(
        "Food-supply comparisons use DOHMH restaurant locations. Storefront Registry FOOD SERVICES counts are not treated as a census of restaurants."
    )
    SNAPSHOT.write_text(json.dumps(snapshot))
    print(f"Added {added} restaurant pins. Businesses now {len(snapshot['businesses'])}.")


if __name__ == "__main__":
    main()
