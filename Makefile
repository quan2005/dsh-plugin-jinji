# 所有命令从仓库根目录运行；不安装任何依赖。
.PHONY: check lint test test-plugin test-server test-browser serve

check: lint test  ## 提交前必跑：静态检查 + 单元/冒烟测试

lint:  ## Python 静态检查（需要 uv；未安装时跳过并提示）
	@if command -v uvx >/dev/null 2>&1; then uvx ruff check .; \
	else echo "跳过 ruff：未找到 uvx（https://docs.astral.sh/uv/）"; fi

test: test-plugin test-server

test-plugin:  ## DSH 插件语法检查与冒烟测试
	npm --prefix dsh-plugin run check

test-server:  ## Python 服务单元测试（临时 journal，不读真实笔记）
	python3 -m unittest discover -s server/tests -v

test-browser:  ## 浏览器回归（需要 Python Playwright + Chromium；DSH 回归还需本机安装 DeepSeek Harness）
	python3 server/tests/browser_monthly.py
	python3 dsh-plugin/scripts/browser-regression.py
	python3 dsh-plugin/scripts/style-regression.py

serve:  ## 本地独立启动阅读器 http://127.0.0.1:4417
	python3 server/server.py
