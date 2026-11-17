#!/usr/bin/env python3
"""
从 https://www.one-drift-pass.com/map 对应的后台接口抓取：
- 侧边栏全部竞速地图名称（及 id、难度等列表字段）
- 每张地图右侧分线表：国服记录与各分线时间

输出为 CSV（UTF-8 带 BOM），Excel 可直接双击打开。

站点前端使用 baseURL `/api`，本脚本直接请求同源 API，无需浏览器。
列表与详情当前为公开接口；若日后需登录，可传入车手号与密码获取 JWT。
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from typing import Any

import requests

DEFAULT_ORIGIN = "https://www.one-drift-pass.com"
DEFAULT_CATEGORY = "speed"
DEFAULT_LIST_LIMIT = 500


def login(session: requests.Session, origin: str, rider_number: str, password: str) -> str:
    url = f"{origin.rstrip('/')}/api/auth/login"
    r = session.post(
        url,
        json={"riderNumber": rider_number, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    if not body.get("success") or not body.get("data"):
        raise RuntimeError(f"登录失败: {body}")
    token = body["data"].get("token")
    if not token:
        raise RuntimeError(f"登录响应无 token: {body}")
    return token


def fetch_all_maps(
    session: requests.Session,
    origin: str,
    category: str,
    page_limit: int,
) -> list[dict[str, Any]]:
    origin = origin.rstrip("/")
    all_rows: list[dict[str, Any]] = []
    page = 1
    total: int | None = None

    while True:
        url = f"{origin}/api/map/list"
        params: dict[str, Any] = {
            "page": page,
            "limit": page_limit,
            "category": category,
        }
        r = session.get(url, params=params, timeout=60)
        r.raise_for_status()
        body = r.json()
        if not body.get("success"):
            raise RuntimeError(f"map/list 失败: {body}")

        chunk = body.get("data") or []
        if not isinstance(chunk, list):
            raise RuntimeError(f"map/list 返回的 data 不是列表: {body}")

        if total is None:
            total = int(body.get("total") or 0)

        all_rows.extend(chunk)

        if total and len(all_rows) >= total:
            break
        if len(chunk) < page_limit:
            break
        page += 1
        time.sleep(0.15)

    return all_rows


def fetch_map_detail(
    session: requests.Session,
    origin: str,
    map_id: str,
) -> dict[str, Any]:
    url = f"{origin.rstrip('/')}/api/map/detail"
    r = session.get(url, params={"id": map_id}, timeout=60)
    r.raise_for_status()
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(f"map/detail 失败 id={map_id}: {body}")
    data = body.get("data")
    if not isinstance(data, dict):
        raise RuntimeError(f"map/detail 无有效 data id={map_id}: {body}")
    return data


def main() -> int:
    p = argparse.ArgumentParser(description="爬取一拖过 /map 分线表（API）")
    p.add_argument("--origin", default=DEFAULT_ORIGIN, help="站点根地址")
    p.add_argument("--category", default=DEFAULT_CATEGORY, help="地图分类，与网页一致默认 speed")
    p.add_argument("--limit", type=int, default=DEFAULT_LIST_LIMIT, help="map/list 每页条数")
    p.add_argument("--rider-number", default="", help="车手号，非空则先登录并带 Token 请求")
    p.add_argument("--password", default="", help="登录密码（与车手号同时使用）")
    p.add_argument(
        "-o",
        "--output",
        default="map_data.csv",
        help="输出 CSV 路径，默认当前目录 map_data.csv；传 - 则写到 stdout",
    )
    p.add_argument("--delay", type=float, default=0.12, help="每张详情请求间隔秒，避免过快")
    args = p.parse_args()

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "one-drift-map-scraper/1.0 (+https://www.one-drift-pass.com/map)",
            "Accept": "application/json",
        }
    )

    if args.rider_number or args.password:
        if not args.rider_number or not args.password:
            print("错误：--rider-number 与 --password 需同时提供", file=sys.stderr)
            return 2
        token = login(session, args.origin, args.rider_number, args.password)
        session.headers["Authorization"] = f"Bearer {token}"

    maps = fetch_all_maps(session, args.origin, args.category, args.limit)

    # 与网页侧边栏一致：按难度 R/L3/L2/L1 再按 star 排序（见前端 map 页逻辑）
    difficulty_order = {"R": 1, "L3": 2, "L2": 3, "L1": 4}

    def sort_key(m: dict[str, Any]) -> tuple[int, int, str]:
        d = m.get("difficulty") or ""
        star = int(m.get("star") or 0)
        return (difficulty_order.get(str(d), 99), -star, str(m.get("name") or ""))

    maps_sorted = sorted(maps, key=sort_key)

    tier_columns: list[str] = []
    tier_seen: set[str] = set()
    rows_data: list[tuple[dict[str, Any], dict[str, Any]]] = []

    for i, m in enumerate(maps_sorted):
        mid = m.get("id")
        if not mid:
            continue
        detail = fetch_map_detail(session, args.origin, str(mid))
        for t in detail.get("tiers") or []:
            n = t.get("name")
            if n and str(n) not in tier_seen:
                tier_columns.append(str(n))
                tier_seen.add(str(n))
        rows_data.append((m, detail))
        if i + 1 < len(maps_sorted) and args.delay > 0:
            time.sleep(args.delay)

    base_headers = [
        "地图ID",
        "地图名称",
        "难度",
        "星数",
        "地图编码",
        "主题",
        "列表最快成绩",
    ]
    ms_headers = [f"{h}_毫秒" for h in tier_columns]
    headers = base_headers + tier_columns + ms_headers

    csv_rows: list[list[Any]] = []
    for m, detail in rows_data:
        tier_by_name: dict[str, dict[str, Any]] = {}
        for t in detail.get("tiers") or []:
            n = t.get("name")
            if n:
                tier_by_name[str(n)] = t
        base = [
            m.get("id", ""),
            m.get("name", ""),
            m.get("difficulty", ""),
            m.get("star", ""),
            m.get("mapCode", ""),
            m.get("theme") or "",
            m.get("fastestRecord") or "",
        ]
        times = [tier_by_name.get(col, {}).get("record") or "" for col in tier_columns]
        mss = [tier_by_name.get(col, {}).get("recordMs") or "" for col in tier_columns]
        csv_rows.append(base + times + mss)

    out_path = args.output.strip()
    if out_path == "-":
        w = csv.writer(sys.stdout, lineterminator="\n")
        w.writerow(headers)
        w.writerows(csv_rows)
        print(f"共 {len(csv_rows)} 行", file=sys.stderr)
    else:
        with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(headers)
            w.writerows(csv_rows)
        print(f"已写入 {out_path}，共 {len(csv_rows)} 张地图", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
