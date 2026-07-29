---
title: "Transformer架构全解"
topic: "deep-learning"
subtopic: "transformers"
difficulty: "advanced"
tags: ["Transformer", "Self-Attention", "BERT", "GPT"]
prerequisites: ["deep-learning"]
created: "2026-07-14"
---

# Transformer架构全解

## 📋 学习目标
- 理解 Transformer 的核心架构
- 掌握自注意力机制的原理
- 理解多头注意力的优势
- 了解 BERT 和 GPT 的区别

## 📖 核心概念

### Transformer 架构

Transformer 由编码器和解码器两部分组成：

**编码器**：
- 输入嵌入层 + 位置编码
- N 个编码器层（每层包含多头自注意力 + 前馈神经网络）
- 残差连接和层归一化

**解码器**：
- 输出嵌入层 + 位置编码
- N 个解码器层（每层包含掩码多头自注意力 + 多头交叉注意力 + 前馈神经网络）
- 残差连接和层归一化

### 自注意力机制

自注意力机制计算输入序列中每个位置与其他位置的相关性：

$$ \text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V $$

其中：
- Q（Query）：查询向量
- K（Key）：键向量
- V（Value）：值向量
- $d_k$：键向量的维度（用于缩放）

### 缩放点积注意力

为什么需要 $\sqrt{d_k}$？
- 当 $d_k$ 较大时，$QK^T$ 的值会很大
- softmax 函数的梯度会趋近于零（梯度消失）
- 除以 $\sqrt{d_k}$ 可以缓解这个问题

### 多头注意力

多头注意力将输入分成多个子空间，每个头学习不同的表示：

$$ \text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \dots, \text{head}_h)W^O $$

其中 $\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$

### 位置编码

Transformer 没有循环结构，需要显式注入位置信息：

$$ PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right) $$
$$ PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right) $$

### BERT vs GPT

| 特性 | BERT | GPT |
|------|------|-----|
| 架构 | 仅编码器 | 仅解码器 |
| 训练方式 | 双向（掩码语言模型） | 单向（自回归） |
| 主要任务 | 分类、问答、NER | 生成、续写、对话 |
| 输入 | 双向上下文 | 左到右序列 |

## 💻 代码实现

```python
import numpy as np

class MultiHeadAttention:
    def __init__(self, d_model, num_heads):
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        
        # 权重矩阵
        self.W_Q = np.random.randn(d_model, d_model) * 0.01
        self.W_K = np.random.randn(d_model, d_model) * 0.01
        self.W_V = np.random.randn(d_model, d_model) * 0.01
        self.W_O = np.random.randn(d_model, d_model) * 0.01
    
    def split_heads(self, x, batch_size):
        # 将输入分成多个头
        return x.reshape(batch_size, -1, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
    
    def scaled_dot_product_attention(self, Q, K, V, mask=None):
        # 计算注意力分数
        scores = np.matmul(Q, K.transpose(-1, -2)) / np.sqrt(self.d_k)
        
        # 应用掩码（用于解码器）
        if mask is not None:
            scores = scores + mask
        
        # softmax 归一化
        attention_weights = np.exp(scores) / np.sum(np.exp(scores), axis=-1, keepdims=True)
        
        # 加权求和
        output = np.matmul(attention_weights, V)
        return output, attention_weights
    
    def forward(self, Q, K, V, mask=None):
        batch_size = Q.shape[0]
        
        # 线性变换
        Q = np.matmul(Q, self.W_Q)
        K = np.matmul(K, self.W_K)
        V = np.matmul(V, self.W_V)
        
        # 分成多个头
        Q = self.split_heads(Q, batch_size)
        K = self.split_heads(K, batch_size)
        V = self.split_heads(V, batch_size)
        
        # 计算注意力
        output, attention_weights = self.scaled_dot_product_attention(Q, K, V, mask)
        
        # 合并多头
        output = output.transpose(0, 2, 1, 3).reshape(batch_size, -1, self.d_model)
        
        # 输出线性变换
        output = np.matmul(output, self.W_O)
        return output, attention_weights

# 使用示例
batch_size = 2
seq_len = 4
d_model = 64
num_heads = 4

# 随机输入
Q = np.random.randn(batch_size, seq_len, d_model)
K = np.random.randn(batch_size, seq_len, d_model)
V = np.random.randn(batch_size, seq_len, d_model)

# 创建多头注意力层
attention = MultiHeadAttention(d_model, num_heads)
output, attn_weights = attention.forward(Q, K, V)
print("输出形状:", output.shape)
print("注意力权重形状:", attn_weights.shape)
```

## 🎯 关键要点
- Transformer 的核心是自注意力机制
- 多头注意力允许模型同时关注不同位置的不同特征
- 位置编码为模型提供序列顺序信息
- BERT 是双向模型，GPT 是单向模型

## ❓ 常见问题

Q: Transformer 为什么比 RNN 好？
A: Transformer 可以并行处理整个序列，而 RNN 需要逐个处理，训练效率更高。

Q: 为什么需要残差连接？
A: 残差连接有助于缓解梯度消失问题，使深层网络更容易训练。

## 📚 延伸阅读
- "Attention Is All You Need" - Vaswani et al.
- BERT 论文 - Devlin et al.
- GPT 系列论文
