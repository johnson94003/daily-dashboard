#!/usr/bin/env python3
"""
deploy.py — 部署到 GitHub Pages（推到 gh-pages 分支）

用法：
  python3 deploy.py
"""

import subprocess
import sys
import shutil
from pathlib import Path
import tempfile

ROOT = Path(__file__).parent


def get_remote_url() -> str:
    r = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True, text=True, cwd=ROOT
    )
    return r.stdout.strip()


def get_pages_url(remote_url: str) -> str:
    url = remote_url.rstrip("/").removesuffix(".git")
    if "github.com/" in url:
        slug = url.split("github.com/")[-1]
    elif "github.com:" in url:
        slug = url.split("github.com:")[-1]
    else:
        return ""
    # 去掉可能夾帶在 https://token@github.com/ 的 token
    if "@" in slug:
        slug = slug.split("@")[-1] if "/" not in slug.split("@")[0] else slug
    parts = slug.split("/")
    if len(parts) == 2:
        return f"https://{parts[0]}.github.io/{parts[1]}"
    return ""


def deploy():
    remote_url = get_remote_url()
    if not remote_url:
        print("❌ 無法取得 git remote URL，請先設定 origin")
        sys.exit(1)

    pages_url = get_pages_url(remote_url)
    print("\n📦 部署到 GitHub Pages...")
    print(f"   Remote: {remote_url}")
    if pages_url:
        print(f"   URL: {pages_url}")

    # 要部署的內容
    files = ["css", "js", "icons", "manifest.json", "sw.js"]
    for html in ROOT.glob("*.html"):
        files.append(html.name)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for f in files:
            src = ROOT / f
            dst = tmp_path / f
            if src.is_dir():
                shutil.copytree(src, dst)
            elif src.is_file():
                shutil.copy(src, dst)

        # GitHub Pages 不要跑 Jekyll
        (tmp_path / ".nojekyll").write_text("")

        def run(cmd, **kw):
            return subprocess.run(cmd, cwd=tmp_path, check=True, **kw)

        run(["git", "init", "-q"])
        run(["git", "checkout", "-q", "-b", "gh-pages"])
        run(["git", "add", "."])
        run(["git", "commit", "-q", "-m", "Deploy"])
        run(["git", "remote", "add", "origin", remote_url])
        print("\n🚀 推送到 gh-pages 分支（force push）...")
        run(["git", "push", "-q", "-f", "origin", "gh-pages"])

    print("\n✅ 部署完成！")
    if pages_url:
        print(f"\n🌐 訪問網址：{pages_url}")
        print("   （首次部署需 1-2 分鐘 GitHub Pages 才會生效）")


if __name__ == "__main__":
    deploy()
