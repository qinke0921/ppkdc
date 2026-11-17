#!/usr/bin/env python3
"""
分线数据导入脚本
用法: python import_lines.py
需要配置环境变量或直接在代码中填写云开发参数
"""

import json
import os
import requests

# ============ 配置区域 ============
# 云开发环境ID
ENV_ID = 'cloudbase-0ga9zc1ub244d4ba'

# API Key (在云开发控制台 -> 环境设置 -> HTTP API 密钥)
# 或者使用 ACCESS_TOKEN (在小程序后台获取)
API_KEY = ''  # 填写你的 API Key

# CSV 文件路径
CSV_FILE = '分线表.csv'
# =================================

LINE_LEVELS = ['国服记录', '顶尖职业', '职业', '强主', '主力', '强一', '一线', '弱一', '强二', '二线', '弱二', '强三', '三线', '娱乐']

def time_to_ms(time_str):
    """时间字符串转毫秒"""
    if not time_str:
        return float('inf')
    try:
        parts = time_str.split('.')
        if len(parts) != 3:
            return float('inf')
        minutes = int(parts[0])
        seconds = int(parts[1])
        ms_str = parts[2].ljust(3, '0')
        ms = int(ms_str)
        return minutes * 60000 + seconds * 1000 + ms
    except:
        return float('inf')

def parse_csv(filepath):
    """解析 CSV 文件"""
    maps = []
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 跳过表头
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        values = line.split(',')
        if len(values) >= 16:
            map_data = {
                'difficulty': values[0],
                'name': values[1]
            }
            for j, level in enumerate(LINE_LEVELS):
                map_data[level] = values[j + 2] if j + 2 < len(values) else ''
            maps.append(map_data)
    
    return maps

def call_cloud_function(name, param=None):
    """调用云函数"""
    url = f"https://{ENV_ID}.service.tcloudbase.com/cgi-bin/tcb invokecloudfunction"
    params = {
        'envid': ENV_ID,
        'name': name,
    }
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    data = {'payload': json.dumps(param or {})}
    
    resp = requests.post(url, params=params, headers=headers, json=data)
    result = resp.json()
    return result

def call_database_add(collection, data):
    """数据库添加"""
    url = f"https://{ENV_ID}.service.tcloudbase.com/tcbdbadd"
    params = {'envid': ENV_ID}
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'collection': collection,
        'data': data
    }
    
    resp = requests.post(url, params=params, headers=headers, json=payload)
    return resp.json()

def call_database_update(collection, id, data):
    """数据库更新"""
    url = f"https://{ENV_ID}.service.tcloudbase.com/tcbdatabaseupdate"
    params = {'envid': ENV_ID}
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'query': {'_id': id},
        'collection': collection,
        'data': data
    }
    
    resp = requests.post(url, params=params, headers=headers, json=payload)
    return resp.json()

def call_database_query(collection, limit=100, skip=0):
    """数据库查询"""
    url = f"https://{ENV_ID}.service.tcloudbase.com/tcbdatabasequery"
    params = {'envid': ENV_ID}
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'collection': collection,
        'limit': limit,
        'skip': skip
    }
    
    resp = requests.post(url, params=params, headers=headers, json=payload)
    return resp.json()

def call_database_delete(collection, id):
    """数据库删除"""
    url = f"https://{ENV_ID}.service.tcloudbase.com/tcbdatabasedelete"
    params = {'envid': ENV_ID}
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'query': {'_id': id},
        'collection': collection
    }
    
    resp = requests.post(url, params=params, headers=headers, json=payload)
    return resp.json()

def get_access_token():
    """获取 access_token (需要小程序 AppID 和 Secret)"""
    APP_ID = ''  # 填写你的小程序 AppID
    SECRET = ''  # 填写你的小程序 Secret
    
    if not APP_ID or not SECRET:
        print("⚠️ 未配置 AppID/Secret，使用 API_KEY 方式")
        return None
    
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APP_ID}&secret={SECRET}"
    resp = requests.get(url)
    data = resp.json()
    return data.get('access_token')

def main():
    print("=" * 50)
    print("分线数据导入工具")
    print("=" * 50)
    
    # 检查 API Key
    if not API_KEY:
        print("❌ 请先配置 API_KEY!")
        print("在云开发控制台 -> 环境设置 -> HTTP API 密钥")
        return
    
    # 解析 CSV
    if not os.path.exists(CSV_FILE):
        print(f"❌ CSV 文件不存在: {CSV_FILE}")
        return
    
    print(f"📖 读取 CSV 文件: {CSV_FILE}")
    maps = parse_csv(CSV_FILE)
    print(f"✓ 解析到 {len(maps)} 条地图数据")
    
    # 这里可以添加数据库操作
    # 由于 HTTP API 有限流，建议分批处理
    
    print("\n📝 提示:")
    print("1. 打开微信开发者工具")
    print("2. 打开云开发控制台 -> 数据库")
    print("3. 手动导入 CSV 数据到 map_data 集合")
    print("\n或者修改脚本配置，使用 HTTP API 批量导入")
    
    # 打印前3条示例
    print("\n📋 数据示例 (前3条):")
    for m in maps[:3]:
        print(f"  - {m['name']} ({m['difficulty']})")
        for level in LINE_LEVELS[:3]:
            print(f"      {level}: {m.get(level, '')}")

if __name__ == '__main__':
    main()
