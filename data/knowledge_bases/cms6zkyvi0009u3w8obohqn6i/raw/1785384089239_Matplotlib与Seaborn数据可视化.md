# Matplotlib 与 Seaborn 数据可视化

## Matplotlib 基础

```python
import matplotlib.pyplot as plt

# 折线图
plt.plot(x, y, label="趋势", color="red", linestyle="--")
plt.xlabel("X轴")
plt.ylabel("Y轴")
plt.title("标题")
plt.legend()
plt.show()

# 保存图片
plt.savefig("chart.png", dpi=300, bbox_inches="tight")
```

## 子图
```python
fig, axes = plt.subplots(2, 2, figsize=(10, 8))
axes[0, 0].plot(x, y)
axes[0, 1].scatter(x, y)
```

## 常用图表类型

| 图表 | 函数 | 适用场景 |
|------|------|----------|
| 折线图 | `plot()` | 趋势变化 |
| 散点图 | `scatter()` | 相关性 |
| 柱状图 | `bar()` | 类别对比 |
| 直方图 | `hist()` | 分布 |
| 饼图 | `pie()` | 占比 |
| 箱线图 | `boxplot()` | 异常值 |

## Seaborn 高级可视化

```python
import seaborn as sns

# 美观的默认样式
sns.set_theme(style="whitegrid")

# 统计图
sns.barplot(data=df, x="category", y="value")
sns.boxplot(data=df, x="group", y="value")
sns.histplot(data=df, x="age", kde=True)

# 相关性热图
sns.heatmap(df.corr(), annot=True, cmap="coolwarm")

# 成对关系图
sns.pairplot(df, hue="species")

# 小提琴图
sns.violinplot(data=df, x="group", y="value")
```

## 样式配置

```python
plt.rcParams["font.sans-serif"] = ["SimHei"]    # 中文显示
plt.rcParams["axes.unicode_minus"] = False       # 负号显示
sns.set_palette("husl")                          # 调色板
```
