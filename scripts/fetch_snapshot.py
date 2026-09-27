#!/usr/bin/env python3
"""Pull a demo snapshot from NYC public data.

Every row is tagged with its source. Lease dates are copied only when the
Storefront Registry includes them. Nothing in this script invents a filing.
"""

from __future__ import annotations

import json
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "snapshot.json"

STOREFRONT = "https://data.cityofnewyork.us/resource/92iy-9c3n.json"
PLUTO = "https://data.cityofnewyork.us/resource/64uk-42ks.json"
DOB = "https://data.cityofnewyork.us/resource/w9ak-ipjd.json"
SALES = "https://data.cityofnewyork.us/resource/usep-8jbt.json"
LICENSES = "https://data.cityofnewyork.us/resource/w7w3-xahh.json"
RESTAURANTS = "https://data.cityofnewyork.us/resource/43nn-pn8j.json"
PEDESTRIANS = "https://data.cityofnewyork.us/resource/cqsj-cfgu.json"
SUBWAY = "https://data.ny.gov/resource/39hk-dx4f.json"
CENSUS = "https://api.census.gov/data/{year}/acs/acs5"

TODAY = "2026-09-26"

GROUPS = [
    ("Williamsburg", "Brooklyn", ["Williamsburg", "North Side-South Side", "South Williamsburg", "East Williamsburg"]),
    ("Greenpoint", "Brooklyn", ["Greenpoint"]),
    ("Bushwick", "Brooklyn", ["Bushwick (West)", "Bushwick North", "Bushwick South", "Bushwick (East)"]),
    ("Park Slope", "Brooklyn", ["Park Slope", "Park Slope-Gowanus"]),
    ("Carroll Gardens", "Brooklyn", ["Carroll Gardens-Cobble Hill-Gowanus-Red Hook", "Carroll Gardens-Columbia Street-Red Hook"]),
    ("DUMBO", "Brooklyn", ["Downtown Brooklyn-DUMBO-Boerum Hill", "DUMBO-Vinegar Hill-Downtown Brooklyn-Boerum Hill"]),
    ("Brooklyn Heights", "Brooklyn", ["Brooklyn Heights", "Brooklyn Heights-Cobble Hill"]),
    ("Fort Greene", "Brooklyn", ["Fort Greene"]),
    ("Clinton Hill", "Brooklyn", ["Clinton Hill"]),
    ("Bed-Stuy", "Brooklyn", ["Bedford-Stuyvesant (West)", "Bedford-Stuyvesant (East)", "Bedford", "Stuyvesant Heights"]),
    ("Crown Heights", "Brooklyn", ["Crown Heights (North)", "Crown Heights North", "Crown Heights (South)", "Crown Heights South"]),
    ("Prospect Heights", "Brooklyn", ["Prospect Heights"]),
]

BOROUGH_CODE = {
    "MANHATTAN": "1",
    "BRONX": "2",
    "BROOKLYN": "3",
    "QUEENS": "4",
    "STATEN ISLAND": "5",
}
DOB_BOROUGH = {
    "1": "Manhattan",
    "2": "Bronx",
    "3": "Brooklyn",
    "4": "Queens",
    "5": "Staten Island",
}
COUNTY = {
    "Manhattan": "061",
    "Bronx": "005",
    "Brooklyn": "047",
    "Queens": "081",
    "Staten Island": "085",
}

NOTES: list[str] = []


def soda(base: str, params: dict, timeout: int = 90):
    url = base + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "leaselens-nyc/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"{last} :: {url[:180]}")


def year_num(value: str | None) -> int:
    digits = []
    current = ""
    for char in value or "":
        if char.isdigit():
            current += char
        else:
            if len(current) == 4:
                digits.append(int(current))
            current = ""
    if len(current) == 4:
        digits.append(int(current))
    return digits[-1] if digits else 0


def yn(value: str | None) -> bool:
    return (value or "").strip().upper() == "YES"


def categorize(activity: str | None) -> str:
    text = (activity or "").upper()
    if not text or "NO BUSINESS" in text:
        return "vacant_or_unidentified"
    if any(token in text for token in ["FOOD", "RESTAURANT", "DRINKING", "BAR ", "BAR/", "CAFE", "COFFEE", "BAKERY", "EATING"]):
        return "food_and_drink"
    if any(token in text for token in ["GROCERY", "SUPERMARKET", "FOOD STORE", "DELI", "BODEGA"]):
        return "grocery"
    if "RETAIL" in text or "STORE" in text or "CLOTH" in text or "APPAREL" in text:
        return "retail"
    if any(token in text for token in ["SALON", "BEAUTY", "BARBER", "LAUND", "DRY CLEAN", "PERSONAL CARE", "NAIL"]):
        return "personal_services"
    if any(token in text for token in ["HEALTH", "MEDICAL", "DOCTOR", "DENTAL", "PHARM"]):
        return "healthcare"
    if any(token in text for token in ["FITNESS", "GYM", "RECREATION", "SPORT", "YOGA"]):
        return "fitness"
    if "EDUCAT" in text or "SCHOOL" in text or "CHILD CARE" in text:
        return "education"
    if any(token in text for token in ["FINANC", "LEGAL", "REAL ESTATE", "INSURANCE", "ACCOUNT", "PROFESSIONAL", "BROADCAST"]):
        return "professional_services"
    return "other"


def canonical(nbhd: str | None, borough: str) -> str:
    raw = nbhd or ""
    upper = raw.upper()
    for name, group_borough, aliases in GROUPS:
        if borough == group_borough and upper in {alias.upper() for alias in aliases}:
            return name
    cleaned = raw.replace("  ", " ").strip()
    return cleaned or borough


def property_id(bbl: str, address: str, unit: str) -> str:
    return f"{bbl}|{(address or '').upper()}|{(unit or '').upper()}"


def split_bbl(bbl: str) -> tuple[str, str, str]:
    padded = "".join(ch for ch in bbl if ch.isdigit()).zfill(10)
    return padded[0], str(int(padded[1:6])), str(int(padded[6:10]))


def title_borough(value: str | None) -> str:
    text = (value or "").strip().upper()
    mapping = {
        "MANHATTAN": "Manhattan",
        "BROOKLYN": "Brooklyn",
        "QUEENS": "Queens",
        "BRONX": "Bronx",
        "STATEN ISLAND": "Staten Island",
        "M": "Manhattan",
        "BK": "Brooklyn",
        "Q": "Queens",
        "BX": "Bronx",
        "SI": "Staten Island",
    }
    return mapping.get(text, (value or "").title())


def num(value):
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "").replace("$", ""))
    except ValueError:
        return None


def date_only(value: str | None):
    if not value:
        return None
    return value[:10]


def in_list(values: list[str]) -> str:
    return "(" + ",".join("'" + value.replace("'", "''") + "'" for value in values) + ")"


def filing_as_of(reporting_year: str | None) -> str:
    year = year_num(reporting_year)
    return f"{year}-12-31" if year else "2024-12-31"


def priority(row: dict) -> int:
    score = 0
    if yn(row.get("vacant_on_12_31")) or yn(row.get("vacant_6_30_or_date_sold")):
        score += 5
    lease = date_only(row.get("expir_dt_of_most_recent_lease"))
    if lease and "2026-03-01" <= lease <= "2027-09-26":
        score += 6
    elif lease and "2025-09-26" <= lease <= "2028-09-26":
        score += 2
    sold = date_only(row.get("sold_date"))
    if sold and sold >= "2024-09-26":
        score += 2
    category = categorize(row.get("primary_business_activity"))
    if category == "food_and_drink":
        score += 2
    elif category == "retail":
        score += 1
    if row.get("latitude") and row.get("longitude"):
        score += 1
    return score


def keep_latest(rows: list[dict]) -> dict:
    return max(rows, key=lambda row: (year_num(row.get("reporting_year")), priority(row)))


def fetch_group_rows(aliases: list[str], extra_where: str, limit: int) -> list[dict]:
    where = f"nbhd in {in_list(aliases)} AND latitude IS NOT NULL AND {extra_where}"
    return soda(
        STOREFRONT,
        {
            "$select": "bbl,bin,property_street_address_or,borough,nbhd,zip_code,latitude,longitude,unit,reporting_year,vacant_on_12_31,vacant_6_30_or_date_sold,primary_business_activity,expir_dt_of_most_recent_lease,sold_date,construction_reported,census_tract",
            "$where": where,
            "$limit": str(limit),
        },
    )


def main():
    meta_errors: list[str] = []
    all_aliases = [alias for _, _, aliases in GROUPS for alias in aliases]

    print("Fetching opportunity candidates...")
    opportunity_rows: list[dict] = []
    opportunity_where = (
        "(vacant_on_12_31='YES' OR vacant_6_30_or_date_sold='YES' "
        "OR (expir_dt_of_most_recent_lease >= '2026-03-01' AND expir_dt_of_most_recent_lease <= '2027-09-26') "
        "OR sold_date >= '2024-09-01')"
    )
    for name, borough, aliases in GROUPS:
        try:
            rows = fetch_group_rows(aliases, opportunity_where, 70)
            print(f"  {name}: {len(rows)}")
            for row in rows:
                row["_canonical"] = name
                row["_borough_norm"] = borough
            opportunity_rows.extend(rows)
        except Exception as exc:  # noqa: BLE001
            meta_errors.append(f"opportunities {name}: {exc}")
            print("  ERR", name, exc)

    print("Fetching Manhattan and Queens opportunities...")
    extra_boxes = [
        ("Manhattan", "upper(borough)='MANHATTAN' AND latitude between 40.714 and 40.752 AND longitude between -74.012 and -73.97"),
        ("Queens", "upper(borough)='QUEENS' AND latitude between 40.74 and 40.78 AND longitude between -73.95 and -73.90"),
    ]
    for borough, box in extra_boxes:
        try:
            rows = soda(
                STOREFRONT,
                {
                    "$select": "bbl,bin,property_street_address_or,borough,nbhd,zip_code,latitude,longitude,unit,reporting_year,vacant_on_12_31,vacant_6_30_or_date_sold,primary_business_activity,expir_dt_of_most_recent_lease,sold_date,construction_reported,census_tract",
                    "$where": f"{box} AND latitude IS NOT NULL AND {opportunity_where}",
                    "$limit": "80",
                },
            )
            print(f"  {borough}: {len(rows)}")
            for row in rows:
                row["_canonical"] = canonical(row.get("nbhd"), borough)
                row["_borough_norm"] = borough
            opportunity_rows.extend(rows)
        except Exception as exc:  # noqa: BLE001
            meta_errors.append(f"opportunities {borough}: {exc}")

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in opportunity_rows:
        if not row.get("bbl") or not row.get("property_street_address_or"):
            continue
        key = (row["bbl"], row.get("property_street_address_or", "").upper(), (row.get("unit") or "").upper())
        grouped[key].append(row)

    chosen_keys = []
    per_neighborhood: dict[str, int] = defaultdict(int)
    ranked = sorted(grouped.items(), key=lambda item: priority(keep_latest(item[1])), reverse=True)
    for key, rows in ranked:
        latest = keep_latest(rows)
        neighborhood = latest.get("_canonical") or canonical(latest.get("nbhd"), title_borough(latest.get("borough")))
        cap = 8 if title_borough(latest.get("borough")) == "Brooklyn" else 6
        if per_neighborhood[neighborhood] >= cap:
            continue
        if priority(latest) < 2:
            continue
        per_neighborhood[neighborhood] += 1
        chosen_keys.append(key)
        if len(chosen_keys) >= 108:
            break
    print(f"Selected {len(chosen_keys)} storefronts across {len(per_neighborhood)} neighborhoods")

    print("Fetching filing history for selected tax lots...")
    bbls = sorted({key[0] for key in chosen_keys})
    history_rows: list[dict] = []
    for index in range(0, len(bbls), 25):
        batch = bbls[index : index + 25]
        try:
            rows = soda(
                STOREFRONT,
                {
                    "$select": "bbl,bin,property_street_address_or,borough,nbhd,zip_code,latitude,longitude,unit,reporting_year,vacant_on_12_31,vacant_6_30_or_date_sold,primary_business_activity,expir_dt_of_most_recent_lease,sold_date,construction_reported,census_tract,filing_due_date",
                    "$where": f"bbl in {in_list(batch)}",
                    "$limit": "8000",
                },
            )
            history_rows.extend(rows)
            print(f"  history batch {index // 25 + 1}: {len(rows)}")
        except Exception as exc:  # noqa: BLE001
            meta_errors.append(f"history: {exc}")

    history_by_key: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for row in history_rows:
        key = (row.get("bbl", ""), (row.get("property_street_address_or") or "").upper(), (row.get("unit") or "").upper())
        history_by_key[key].append(row)

    print("Fetching occupied storefronts for nearby-business context...")
    businesses = []
    seen_business = set()
    for name, borough, aliases in GROUPS:
        try:
            rows = fetch_group_rows(
                aliases,
                "reporting_year='2024' AND vacant_on_12_31='NO' AND (vacant_6_30_or_date_sold IS NULL OR vacant_6_30_or_date_sold!='YES') AND primary_business_activity IS NOT NULL AND primary_business_activity!='NO BUSINESS ACTIVITY IDENTIFIED'",
                22,
            )
            for row in rows:
                category = categorize(row.get("primary_business_activity"))
                if category == "vacant_or_unidentified":
                    continue
                bid = "sf:" + property_id(row["bbl"], row.get("property_street_address_or", ""), row.get("unit") or "")
                if bid in seen_business:
                    continue
                seen_business.add(bid)
                businesses.append(
                    {
                        "id": bid,
                        "name": row.get("primary_business_activity"),
                        "category": category,
                        "activity": row.get("primary_business_activity"),
                        "address": row.get("property_street_address_or"),
                        "neighborhood": name,
                        "borough": borough,
                        "lat": float(row["latitude"]),
                        "lng": float(row["longitude"]),
                        "source": "NYC Storefront Registry 2024 filing",
                        "source_dataset": "92iy-9c3n",
                        "provenance": "nyc_open_data",
                        "as_of": "2024",
                    }
                )
        except Exception as exc:  # noqa: BLE001
            meta_errors.append(f"businesses {name}: {exc}")

    print("Fetching restaurant inspections...")
    try:
        inspections = soda(
            RESTAURANTS,
            {
                "$select": "camis,dba,cuisine_description,latitude,longitude,grade,inspection_date,building,street,boro",
                "$where": "latitude between 40.66 and 40.75 AND longitude between -74.02 and -73.90 AND dba IS NOT NULL",
                "$limit": "700",
            },
        )
        by_camis = {}
        for row in inspections:
            camis = row.get("camis")
            if not camis or not row.get("latitude"):
                continue
            previous = by_camis.get(camis)
            if previous is None or (row.get("inspection_date") or "") > (previous.get("inspection_date") or ""):
                by_camis[camis] = row
        for camis, row in by_camis.items():
            businesses.append(
                {
                    "id": f"dohmh:{camis}",
                    "name": row.get("dba"),
                    "category": "food_and_drink",
                    "activity": row.get("cuisine_description") or "Restaurant",
                    "address": " ".join(part for part in [row.get("building"), row.get("street")] if part),
                    "neighborhood": "",
                    "borough": title_borough(row.get("boro")),
                    "lat": float(row["latitude"]),
                    "lng": float(row["longitude"]),
                    "source": "DOHMH restaurant inspections",
                    "source_dataset": "43nn-pn8j",
                    "provenance": "nyc_open_data",
                    "as_of": date_only(row.get("inspection_date")),
                }
            )
        print(f"  restaurants: {len(by_camis)}")
    except Exception as exc:  # noqa: BLE001
        meta_errors.append(f"restaurants: {exc}")
        print("  ERR restaurants", exc)

    print("Fetching neighborhood aggregates...")
    neighborhoods = []
    alias_to_canonical = {}
    for name, borough, aliases in GROUPS:
        for alias in aliases:
            alias_to_canonical[alias.upper()] = (name, borough)

    def pull_counts(year: str, vacant_only: bool):
        where = f"reporting_year='{year}' AND nbhd in {in_list(all_aliases)}"
        if vacant_only:
            where += " AND (vacant_on_12_31='YES' OR vacant_6_30_or_date_sold='YES')"
        rows = soda(
            STOREFRONT,
            {"$select": "nbhd, count(*) as n", "$where": where, "$group": "nbhd", "$limit": "200"},
        )
        totals = defaultdict(int)
        for row in rows:
            mapped = alias_to_canonical.get((row.get("nbhd") or "").upper())
            if mapped:
                totals[mapped[0]] += int(row["n"])
        return totals

    def pull_activities(year: str):
        rows = soda(
            STOREFRONT,
            {
                "$select": "nbhd, primary_business_activity, count(*) as n",
                "$where": f"reporting_year='{year}' AND nbhd in {in_list(all_aliases)}",
                "$group": "nbhd, primary_business_activity",
                "$limit": "5000",
            },
        )
        counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        raw: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for row in rows:
            mapped = alias_to_canonical.get((row.get("nbhd") or "").upper())
            if not mapped:
                continue
            activity = row.get("primary_business_activity") or "UNKNOWN"
            amount = int(row["n"])
            raw[mapped[0]][activity] += amount
            counts[mapped[0]][categorize(activity)] += amount
        return counts, raw

    try:
        vacant_2024 = pull_counts("2024", True)
        total_2024 = pull_counts("2024", False)
        vacant_2023 = pull_counts("2023", True)
        total_2023 = pull_counts("2023", False)
        categories, raw_activities = pull_activities("2024")
        for name, borough, aliases in GROUPS:
            total = total_2024.get(name, 0)
            vacant = vacant_2024.get(name, 0)
            neighborhoods.append(
                {
                    "name": name,
                    "borough": borough,
                    "source_names": aliases,
                    "reporting_year": "2024",
                    "storefronts": total,
                    "vacant": vacant,
                    "vacancy_rate": round(vacant / total, 4) if total else None,
                    "storefronts_2023": total_2023.get(name, 0),
                    "vacant_2023": vacant_2023.get(name, 0),
                    "vacancy_rate_2023": round(vacant_2023.get(name, 0) / total_2023[name], 4) if total_2023.get(name) else None,
                    "categories": dict(categories.get(name, {})),
                    "activities": dict(raw_activities.get(name, {})),
                    "provenance": "nyc_open_data",
                    "source": "NYC Storefront Registry reporting year 2024 (2023 shown for vacancy change). Full neighborhood counts, not the map sample.",
                }
            )
        print(f"  neighborhoods: {len(neighborhoods)}")
    except Exception as exc:  # noqa: BLE001
        meta_errors.append(f"neighborhoods: {exc}")
        print("  ERR neighborhoods", exc)

    print("Fetching PLUTO lot attributes...")
    pluto_by_bbl = {}
    for index in range(0, len(bbls), 20):
        batch = bbls[index : index + 20]
        clauses = " OR ".join(f"bbl='{bbl}.00000000'" for bbl in batch)
        try:
            rows = soda(
                PLUTO,
                {
                    "$select": "bbl,address,bldgclass,landuse,yearbuilt,assesstot,zonedist1,comarea,retailarea,lotarea,bldgarea",
                    "$where": clauses,
                    "$limit": "40",
                },
            )
            for row in rows:
                key = "".join(ch for ch in str(row.get("bbl", "")) if ch.isdigit())[:10]
                pluto_by_bbl[key] = row
            print(f"  pluto batch {index // 20 + 1}: {len(rows)}")
        except Exception as exc:  # noqa: BLE001
            meta_errors.append(f"pluto: {exc}")
            print("  ERR pluto", exc)

    print("Fetching DCWP licenses on those tax lots...")
    licenses = []
    for index in range(0, len(bbls), 30):
        batch = bbls[index : index + 30]
        try:
            rows = soda(
                LICENSES,
                {
                    "$select": "license_nbr,business_name,business_category,license_status,license_creation_date,lic_expir_dd,address_building,address_street_name,address_borough,bbl,latitude,longitude",
                    "$where": f"bbl in {in_list(batch)}",
                    "$limit": "1000",
                },
            )
            licenses.extend(rows)
            print(f"  licenses batch {index // 30 + 1}: {len(rows)}")
        except Exception as exc:  # noqa: BLE001
            meta_errors.append(f"licenses: {exc}")

    print("Fetching DOF sales and DOB filings for matched blocks...")
    blocks_by_borough: dict[str, set[str]] = defaultdict(set)
    for bbl in bbls:
        code, block, _lot = split_bbl(bbl)
        blocks_by_borough[code].add(block)

    sales = []
    for code, blocks in blocks_by_borough.items():
        block_list = sorted(blocks)
        for index in range(0, len(block_list), 15):
            batch = block_list[index : index + 15]
            try:
                rows = soda(
                    SALES,
                    {
                        "$select": "borough,neighborhood,address,block,lot,sale_price,sale_date,building_class_category,commercial_units,building_class_at_time_of",
                        "$where": f"borough='{code}' AND block in {in_list(batch)} AND sale_date >= '2022-01-01T00:00:00.000'",
                        "$limit": "2500",
                    },
                )
                sales.extend(rows)
                print(f"  sales {code} batch: {len(rows)}")
            except Exception as exc:  # noqa: BLE001
                meta_errors.append(f"sales {code}: {exc}")
                print("  ERR sales", exc)

    permits = []
    for code, blocks in blocks_by_borough.items():
        dob_borough = DOB_BOROUGH[code]
        block_list = sorted(blocks, key=lambda value: int(value))
        for index in range(0, len(block_list), 12):
            batch = block_list[index : index + 12]
            try:
                rows = soda(
                    DOB,
                    {
                        "$select": "job_filing_number,filing_status,filing_date,house_no,street_name,borough,block,lot,initial_cost,job_type,job_description",
                        "$where": f"borough='{dob_borough}' AND block in {in_list(batch)} AND filing_date >= '2023-01-01T00:00:00.000'",
                        "$limit": "800",
                    },
                )
                permits.extend(rows)
                print(f"  permits {dob_borough} batch: {len(rows)}")
            except Exception as exc:  # noqa: BLE001
                # job_description is not on every revision of the dataset
                try:
                    rows = soda(
                        DOB,
                        {
                            "$select": "job_filing_number,filing_status,filing_date,house_no,street_name,borough,block,lot,initial_cost,job_type",
                            "$where": f"borough='{dob_borough}' AND block in {in_list(batch)} AND filing_date >= '2023-01-01T00:00:00.000'",
                            "$limit": "800",
                        },
                    )
                    permits.extend(rows)
                    print(f"  permits {dob_borough} batch (no description): {len(rows)}")
                except Exception as inner:  # noqa: BLE001
                    meta_errors.append(f"permits {dob_borough}: {inner}")
                    print("  ERR permits", inner)

    print("Fetching subway stations...")
    stations = []
    try:
        rows = soda(SUBWAY, {"$limit": "600"})
        for row in rows:
            if not row.get("gtfs_latitude"):
                continue
            if row.get("borough") not in {"M", "Bk", "Q", "Bx", "B", "SI"} and title_borough(row.get("borough")) not in COUNTY:
                # MTA uses M, Bk, Q, Bx, SI
                pass
            stations.append(
                {
                    "id": row.get("gtfs_stop_id") or row.get("station_id"),
                    "name": row.get("stop_name"),
                    "routes": row.get("daytime_routes"),
                    "borough": row.get("borough"),
                    "ada": row.get("ada") in {"1", "2", 1, True},
                    "lat": float(row["gtfs_latitude"]),
                    "lng": float(row["gtfs_longitude"]),
                    "source": "MTA Subway Stations",
                    "source_dataset": "39hk-dx4f",
                    "provenance": "nyc_open_data",
                }
            )
        print(f"  stations: {len(stations)}")
    except Exception as exc:  # noqa: BLE001
        meta_errors.append(f"subway: {exc}")

    print("Fetching DOT pedestrian counts...")
    pedestrians = []
    try:
        rows = soda(
            PEDESTRIANS,
            {
                "$where": "within_box(the_geom, 40.78, -74.03, 40.64, -73.90)",
                "$limit": "400",
            },
        )
        count_fields = []
        if rows:
            count_fields = [key for key in rows[0].keys() if any(token in key for token in ["_am", "_pm", "_md"])]
        def field_rank(name: str) -> int:
            digits = "".join(ch for ch in name if ch.isdigit())
            year = int(digits) if digits else 0
            # Prefer later years, then PM counts.
            period = 2 if name.endswith("pm") else 1 if name.endswith("md") else 0
            return year * 10 + period

        count_fields.sort(key=field_rank)
        for row in rows:
            geom = (row.get("the_geom") or {}).get("coordinates") or [None, None]
            chosen = None
            chosen_field = None
            for field in reversed(count_fields):
                value = num(row.get(field))
                if value and value > 0:
                    chosen = int(value)
                    chosen_field = field
                    break
            if not geom[0] or chosen is None:
                continue
            pedestrians.append(
                {
                    "id": str(row.get("objectid") or row.get("loc") or len(pedestrians)),
                    "location": " ".join(
                        part
                        for part in [
                            row.get("street_nam"),
                            "between",
                            row.get("from_stree"),
                            "and",
                            row.get("to_street"),
                        ]
                        if part
                    ),
                    "borough": row.get("borough"),
                    "lat": float(geom[1]),
                    "lng": float(geom[0]),
                    "count": chosen,
                    "count_label": (chosen_field or "count").replace("_", " "),
                    "source": "NYC DOT Bi-Annual Pedestrian Counts",
                    "source_dataset": "cqsj-cfgu",
                    "provenance": "nyc_open_data",
                }
            )
        print(f"  pedestrian locations: {len(pedestrians)}")
    except Exception as exc:  # noqa: BLE001
        meta_errors.append(f"pedestrians: {exc}")
        print("  ERR pedestrians", exc)

    print("Fetching ACS tract income...")
    tract_metrics = []
    acs_year = None
    prior_year = None
    for year, prior in (("2024", "2019"), ("2023", "2018")):
        try:
            for borough_name, county in COUNTY.items():
                if borough_name not in {"Brooklyn", "Manhattan", "Queens"}:
                    continue
                url = CENSUS.format(year=year) + "?" + urllib.parse.urlencode(
                    {
                        "get": "NAME,B19013_001E,B01003_001E",
                        "for": "tract:*",
                        "in": f"state:36 county:{county}",
                    }
                )
                req = urllib.request.Request(url, headers={"User-Agent": "leaselens-nyc/1.0"})
                with urllib.request.urlopen(req, timeout=60) as response:
                    table = json.load(response)
                prior_url = CENSUS.format(year=prior) + "?" + urllib.parse.urlencode(
                    {
                        "get": "B19013_001E",
                        "for": "tract:*",
                        "in": f"state:36 county:{county}",
                    }
                )
                req = urllib.request.Request(prior_url, headers={"User-Agent": "leaselens-nyc/1.0"})
                with urllib.request.urlopen(req, timeout=60) as response:
                    prior_table = json.load(response)
                prior_income = {row[3]: row[0] for row in prior_table[1:]}
                for row in table[1:]:
                    income, population, _name, _state, _county, tract = row[1], row[2], row[0], row[3], row[4], row[5]
                    def clean_stat(value):
                        if value in {None, "", "-666666666", "-999999999", "-222222222", "-333333333"}:
                            return None
                        try:
                            number = int(float(value))
                        except ValueError:
                            return None
                        if number < 0:
                            return None
                        return number

                    tract_metrics.append(
                        {
                            "borough": borough_name,
                            "tract": tract,
                            "population": clean_stat(population),
                            "median_income": clean_stat(income),
                            "median_income_prior": clean_stat(prior_income.get(tract)),
                            "vintage": f"ACS 5-year {year}",
                            "prior_vintage": f"ACS 5-year {prior}",
                            "provenance": "census_acs",
                            "source": "U.S. Census Bureau ACS 5-year, table B19013 median household income and B01003 population",
                        }
                    )
            acs_year = year
            prior_year = prior
            print(f"  ACS {year} tracts: {len(tract_metrics)}")
            break
        except Exception as exc:  # noqa: BLE001
            tract_metrics = []
            meta_errors.append(f"acs {year}: {exc}")
            print("  ERR acs", year, exc)

    sales_trends = []
    trend_buckets: dict[tuple[str, int], list[float]] = defaultdict(list)
    for row in sales:
        price = num(row.get("sale_price")) or 0
        commercial = num(row.get("commercial_units")) or 0
        sold = date_only(row.get("sale_date"))
        neighborhood = (row.get("neighborhood") or "").upper()
        if price < 100000 or commercial <= 0 or not sold or not neighborhood:
            continue
        trend_buckets[(neighborhood, int(sold[:4]))].append(price)
    for (neighborhood, year), prices in sorted(trend_buckets.items()):
        if len(prices) < 5:
            continue
        sales_trends.append(
            {
                "neighborhood": neighborhood,
                "year": year,
                "sales": len(prices),
                "median_price": int(statistics.median(prices)),
                "provenance": "nyc_open_data",
                "source": "DOF Rolling Calendar Sales, commercial_units > 0, price >= $100,000. Median is computed in this extract.",
            }
        )

    properties = []
    events = []
    bbl_to_ids: dict[str, list[str]] = defaultdict(list)
    for key in chosen_keys:
        filings = history_by_key.get(key) or grouped[key]
        latest = keep_latest(filings)
        borough = title_borough(latest.get("borough")) or latest.get("_borough_norm") or "New York"
        neighborhood = latest.get("_canonical") or canonical(latest.get("nbhd"), borough)
        address = latest.get("property_street_address_or")
        unit = latest.get("unit") or ""
        pid = property_id(latest["bbl"], address, unit)
        pluto = pluto_by_bbl.get(latest["bbl"])
        activities = []
        for filing in sorted(filings, key=lambda row: year_num(row.get("reporting_year"))):
            category = categorize(filing.get("primary_business_activity"))
            if category != "vacant_or_unidentified":
                activities.append((year_num(filing.get("reporting_year")), filing.get("primary_business_activity"), category))
        churn_detail = None
        if len(activities) >= 2 and activities[0][2] != activities[-1][2]:
            churn_detail = (
                f"Storefront Registry activity changed from {activities[0][1]} ({activities[0][0]} filing) "
                f"to {activities[-1][1]} ({activities[-1][0]} filing)."
            )
        lease = date_only(latest.get("expir_dt_of_most_recent_lease"))
        properties.append(
            {
                "id": pid,
                "bbl": latest["bbl"],
                "bin": latest.get("bin"),
                "address": address,
                "borough": borough,
                "neighborhood": neighborhood,
                "source_neighborhood": latest.get("nbhd"),
                "zip": latest.get("zip_code"),
                "lat": float(latest["latitude"]),
                "lng": float(latest["longitude"]),
                "unit": unit,
                "reporting_year": latest.get("reporting_year"),
                "reporting_year_num": year_num(latest.get("reporting_year")),
                "as_of": filing_as_of(latest.get("reporting_year")),
                "primary_activity": latest.get("primary_business_activity"),
                "activity_category": categorize(latest.get("primary_business_activity")),
                "vacant_on_1231": yn(latest.get("vacant_on_12_31")),
                "vacant_on_630": yn(latest.get("vacant_6_30_or_date_sold")),
                "lease_expiration": lease,
                "sold_date": date_only(latest.get("sold_date")),
                "construction_reported": yn(latest.get("construction_reported")),
                "census_tract": (latest.get("census_tract") or "").zfill(6)[-6:] if latest.get("census_tract") else None,
                "year_built": int(num(pluto.get("yearbuilt"))) if pluto and num(pluto.get("yearbuilt")) and num(pluto.get("yearbuilt")) > 0 else None,
                "building_class": (pluto or {}).get("bldgclass"),
                "land_use": (pluto or {}).get("landuse"),
                "zoning": (pluto or {}).get("zonedist1"),
                "retail_area": num((pluto or {}).get("retailarea")),
                "commercial_area": num((pluto or {}).get("comarea")),
                "assessed_total": num((pluto or {}).get("assesstot")),
                "lot_area": num((pluto or {}).get("lotarea")),
                "building_area": num((pluto or {}).get("bldgarea")),
                "pluto_matched": bool(pluto),
                "churn_detail": churn_detail,
                "provenance": "nyc_open_data",
                "source_dataset": "NYC Storefront Registry (92iy-9c3n)",
            }
        )
        bbl_to_ids[latest["bbl"]].append(pid)
        for filing in filings:
            as_of = filing_as_of(filing.get("reporting_year"))
            vacant = yn(filing.get("vacant_on_12_31")) or yn(filing.get("vacant_6_30_or_date_sold"))
            events.append(
                {
                    "property_id": pid,
                    "occurred_at": as_of + "T00:00:00Z",
                    "event_type": "storefront_filing",
                    "title": f"{filing.get('reporting_year')} storefront filing",
                    "detail": (
                        f"Vacant on Dec 31: {filing.get('vacant_on_12_31') or 'not reported'}. "
                        f"Vacant on Jun 30 or sale date: {filing.get('vacant_6_30_or_date_sold') or 'not reported'}. "
                        f"Activity: {filing.get('primary_business_activity') or 'not reported'}."
                    ),
                    "source": "NYC Storefront Registry",
                    "provenance": "nyc_open_data",
                    "payload": {"vacant": vacant, "reporting_year": filing.get("reporting_year"), "activity": filing.get("primary_business_activity")},
                }
            )
            filing_lease = date_only(filing.get("expir_dt_of_most_recent_lease"))
            if filing_lease:
                # Anchor timeline to when the filing was reported, not the lease end date.
                # Using the lease end as occurred_at floated far-future dates (e.g. 2038) to the top.
                events.append(
                    {
                        "property_id": pid,
                        "occurred_at": as_of + "T00:00:00Z",
                        "event_type": "lease_date_on_file",
                        "title": "Lease expiration on file",
                        "detail": (
                            f"The {filing.get('reporting_year')} filing reports "
                            f"expir_dt_of_most_recent_lease as {filing_lease}. "
                            "This is an owner-reported registry field, not a confirmed listing."
                        ),
                        "source": "NYC Storefront Registry",
                        "provenance": "nyc_open_data",
                        "payload": {
                            "lease_expiration": filing_lease,
                            "reporting_year": filing.get("reporting_year"),
                        },
                    }
                )
            filing_sale = date_only(filing.get("sold_date"))
            if filing_sale:
                events.append(
                    {
                        "property_id": pid,
                        "occurred_at": as_of + "T00:00:00Z",
                        "event_type": "registry_sale_date",
                        "title": "Sale date on storefront filing",
                        "detail": f"The {filing.get('reporting_year')} filing includes sold_date {filing_sale}.",
                        "source": "NYC Storefront Registry",
                        "provenance": "nyc_open_data",
                        "payload": {"sold_date": filing_sale, "reporting_year": filing.get("reporting_year")},
                    }
                )

    lot_keys = {}
    for bbl, ids in bbl_to_ids.items():
        code, block, lot = split_bbl(bbl)
        lot_keys[(code, block, lot)] = ids
        lot_keys[(DOB_BOROUGH[code], block, lot)] = ids

    clean_permits = []
    for row in permits:
        match = lot_keys.get(((row.get("borough") or ""), str(int(row["block"])) if row.get("block") else "", str(int(row["lot"])) if row.get("lot") else ""))
        if not match:
            continue
        for pid in match:
            clean_permits.append(
                {
                    "id": f"{row.get('job_filing_number')}:{pid}",
                    "property_id": pid,
                    "bbl": next(bbl for bbl, ids in bbl_to_ids.items() if pid in ids),
                    "job_number": row.get("job_filing_number"),
                    "filing_date": date_only(row.get("filing_date")),
                    "status": row.get("filing_status"),
                    "job_type": row.get("job_type"),
                    "description": row.get("job_description"),
                    "initial_cost": num(row.get("initial_cost")),
                    "address": " ".join(part for part in [row.get("house_no"), row.get("street_name")] if part),
                    "provenance": "nyc_open_data",
                    "source": "DOB NOW Build Job Application Filings (w9ak-ipjd)",
                }
            )
            events.append(
                {
                    "property_id": pid,
                    "occurred_at": (date_only(row.get("filing_date")) or "2024-01-01") + "T00:00:00Z",
                    "event_type": "dob_filing",
                    "title": f"DOB filing {row.get('job_type') or ''}".strip(),
                    "detail": (
                        f"Job {row.get('job_filing_number')} filed {date_only(row.get('filing_date'))}. "
                        f"Status: {row.get('filing_status') or 'not stated'}. "
                        f"Joined on the tax lot, not confirmed as this storefront unit."
                    ),
                    "source": "DOB NOW Build",
                    "provenance": "nyc_open_data",
                    "payload": {"job": row.get("job_filing_number")},
                }
            )

    clean_sales = []
    for row in sales:
        code = str(row.get("borough") or "")
        if not row.get("block") or not row.get("lot"):
            continue
        try:
            match = lot_keys.get((code, str(int(float(row["block"]))), str(int(float(row["lot"])))))
        except ValueError:
            match = None
        if not match:
            continue
        price = num(row.get("sale_price"))
        for pid in match:
            clean_sales.append(
                {
                    "id": f"{pid}:{date_only(row.get('sale_date'))}:{price}",
                    "property_id": pid,
                    "bbl": next(bbl for bbl, ids in bbl_to_ids.items() if pid in ids),
                    "sale_date": date_only(row.get("sale_date")),
                    "sale_price": price,
                    "building_class": row.get("building_class_at_time_of"),
                    "category": row.get("building_class_category"),
                    "commercial_units": num(row.get("commercial_units")),
                    "address": row.get("address"),
                    "neighborhood": row.get("neighborhood"),
                    "provenance": "nyc_open_data",
                    "source": "DOF Rolling Calendar Sales (usep-8jbt)",
                }
            )
            events.append(
                {
                    "property_id": pid,
                    "occurred_at": (date_only(row.get("sale_date")) or "2024-01-01") + "T00:00:00Z",
                    "event_type": "dof_sale",
                    "title": "DOF rolling sale",
                    "detail": (
                        f"Sale dated {date_only(row.get('sale_date'))} for {price if price is not None else 'an unparsed price'}. "
                        f"Commercial units on the sale record: {row.get('commercial_units') or 'not stated'}. "
                        f"Joined on the tax lot."
                    ),
                    "source": "DOF Rolling Calendar Sales",
                    "provenance": "nyc_open_data",
                    "payload": {"price": price},
                }
            )

    clean_licenses = []
    for row in licenses:
        ids = bbl_to_ids.get(row.get("bbl") or "")
        if not ids:
            continue
        for pid in ids:
            clean_licenses.append(
                {
                    "id": f"{row.get('license_nbr')}:{pid}",
                    "property_id": pid,
                    "bbl": row.get("bbl"),
                    "business_name": row.get("business_name"),
                    "category": row.get("business_category"),
                    "status": row.get("license_status"),
                    "created_date": date_only(row.get("license_creation_date")),
                    "expiration_date": date_only(row.get("lic_expir_dd")),
                    "provenance": "nyc_open_data",
                    "source": "DCWP Issued Licenses (w7w3-xahh)",
                }
            )
            created = date_only(row.get("license_creation_date"))
            expiration = date_only(row.get("lic_expir_dd"))
            # Anchor timeline to issuance (or past expiration), never a future expiration date.
            today = date.today().isoformat()
            when = created if created and created <= today else None
            if not when and expiration and expiration <= today:
                when = expiration
            if when:
                events.append(
                    {
                        "property_id": pid,
                        "occurred_at": when + "T00:00:00Z",
                        "event_type": "license",
                        "title": f"DCWP license {row.get('license_status') or ''}".strip(),
                        "detail": (
                            f"{row.get('business_name') or 'A business'} — {row.get('business_category') or 'license'}. "
                            f"Status {row.get('license_status') or 'not stated'}. "
                            f"Expiration on file {expiration or 'not stated'}. Joined on the tax lot."
                        ),
                        "source": "DCWP Issued Licenses",
                        "provenance": "nyc_open_data",
                        "payload": {
                            "status": row.get("license_status"),
                            "created_date": created,
                            "expiration_date": expiration,
                        },
                    }
                )

    # De-duplicate events that repeat when multiple filings share a date and title.
    deduped_events = []
    seen_events = set()
    for event in events:
        marker = (event["property_id"], event["event_type"], event["occurred_at"], event["title"], event["detail"])
        if marker in seen_events:
            continue
        seen_events.add(marker)
        deduped_events.append(event)

    snapshot = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "app_as_of": TODAY,
            "notes": [
                "Storefront status, lease dates, sale dates, and business activity come from NYC Open Data dataset 92iy-9c3n when those fields are present.",
                "Lease dates are omitted when the filing does not include expir_dt_of_most_recent_lease. They are never estimated.",
                "PLUTO, DOB, DCWP, and DOF joins are on the tax lot (BBL or borough/block/lot), not a confirmed storefront unit.",
                "Neighborhood vacancy and category mix use full 2023/2024 registry counts for the named neighborhoods.",
                "Map pins are a stratified sample of opportunity storefronts, not every filing in the city.",
                "DOT pedestrian counts are historical screenline observations. The count label includes the dataset column (year and period).",
                "ACS figures describe resident households in the census tract, not commercial rents.",
                "No SpaceXAI or Photon service was available in this environment, so none is wired in.",
            ],
            "errors": meta_errors,
            "counts": {
                "properties": len(properties),
                "events": len(deduped_events),
                "businesses": len(businesses),
                "stations": len(stations),
                "pedestrians": len(pedestrians),
                "permits": len(clean_permits),
                "sales": len(clean_sales),
                "licenses": len(clean_licenses),
                "neighborhoods": len(neighborhoods),
                "sales_trends": len(sales_trends),
                "tracts": len(tract_metrics),
                "pluto_matched": sum(1 for item in properties if item["pluto_matched"]),
                "with_lease_date": sum(1 for item in properties if item["lease_expiration"]),
                "vacant": sum(1 for item in properties if item["vacant_on_1231"] or item["vacant_on_630"]),
            },
            "acs_vintage": acs_year,
            "acs_prior_vintage": prior_year,
        },
        "properties": properties,
        "events": deduped_events,
        "businesses": businesses,
        "stations": stations,
        "pedestrians": pedestrians,
        "permits": clean_permits,
        "sales": clean_sales,
        "licenses": clean_licenses,
        "neighborhoods": neighborhoods,
        "sales_trends": sales_trends,
        "tracts": tract_metrics,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot))
    print(json.dumps(snapshot["meta"]["counts"], indent=2))
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    if meta_errors:
        print("Completed with source errors:")
        for error in meta_errors:
            print(" -", error)


if __name__ == "__main__":
    main()
