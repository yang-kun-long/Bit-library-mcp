import json
from pathlib import Path
from typing import Dict, Any

class RuleManager:
    def __init__(self, rules_dir: str = "../extension/rules"):
        self.rules_dir = Path(rules_dir)
        self.rules_cache: Dict[str, Any] = {}

    def load_rule(self, site: str, database: str) -> dict:
        """加载规则文件"""
        cache_key = f"{site}:{database}"

        if cache_key in self.rules_cache:
            return self.rules_cache[cache_key]

        rule_file = self.rules_dir / f"{site}.json"
        if not rule_file.exists():
            raise FileNotFoundError(f"规则文件不存在: {rule_file}")

        with open(rule_file, 'r', encoding='utf-8') as f:
            rules = json.load(f)

        if database not in rules.get('databases', {}):
            raise KeyError(f"数据库 {database} 不存在于 {site} 的规则中")

        db_rule = rules['databases'][database]
        self.rules_cache[cache_key] = db_rule
        return db_rule

    def save_rule(self, site: str, rules: dict):
        """保存规则文件"""
        rule_file = self.rules_dir / f"{site}.json"
        rule_file.parent.mkdir(parents=True, exist_ok=True)

        with open(rule_file, 'w', encoding='utf-8') as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)

        # 清除缓存
        self.rules_cache.clear()
