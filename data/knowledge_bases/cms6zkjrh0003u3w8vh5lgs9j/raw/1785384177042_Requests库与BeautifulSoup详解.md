# Requests 库与 BeautifulSoup 详解

## Requests 库

### 基本用法
```python
import requests

# GET 请求
resp = requests.get("https://api.example.com/data", params={"page": 1})

# POST 请求
resp = requests.post("https://api.example.com/login",
                     json={"user": "admin", "pass": "123"})

# 携带请求头
resp = requests.get(url, headers=headers, proxies=proxies, timeout=10)
```

### 响应对象
```python
resp.status_code      # 状态码
resp.text             # 文本内容
resp.json()           # JSON 解析
resp.content          # 二进制内容
resp.headers          # 响应头
resp.encoding         # 编码
```

### Session 与会话保持
```python
session = requests.Session()
session.headers.update({"User-Agent": "..."})
session.get(url)  # 自动携带 cookie
```

## BeautifulSoup

### 解析 HTML
```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")   # 内置解析器
soup = BeautifulSoup(html, "lxml")          # lxml 解析器（更快）
```

### 查找元素
```python
# CSS 选择器
soup.select("div.content > p.text")
soup.select_one("#title")

# 方法查找
soup.find("div", class_="content")
soup.find_all("a", href=re.compile(r"^/news"))
soup.find_all("li", limit=5)

# 获取属性和文本
tag.text            # 文本内容
tag.get("href")     # 属性值
tag["class"]        # 属性访问
```

### 遍历
```python
tag.parent          # 父节点
tag.children        # 子节点
tag.next_sibling    # 下一个兄弟节点
```
