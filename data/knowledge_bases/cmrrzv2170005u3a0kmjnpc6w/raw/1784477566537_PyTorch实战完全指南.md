---
title: "PyTorch实战完全指南"
topic: "ml-engineering"
subtopic: "pytorch"
difficulty: "intermediate"
tags: ["PyTorch", "训练循环", "DataLoader", "模型保存"]
prerequisites: ["deep-learning"]
created: "2026-07-14"
---

# PyTorch实战完全指南

## 📋 学习目标
- 掌握 PyTorch 的基本概念（Tensor、Autograd）
- 学会构建和训练神经网络
- 掌握 DataLoader 和数据预处理
- 学会模型保存和加载

## 📖 核心概念

### Tensor 基础

Tensor 是 PyTorch 的核心数据结构，类似于 NumPy 的数组，但支持自动微分：

```python
import torch

# 创建 Tensor
x = torch.tensor([1, 2, 3])
y = torch.tensor([[1, 2], [3, 4]])

# 常用操作
z = x + y
z = torch.matmul(x, y)
z = torch.sum(x)
```

### Autograd 自动微分

PyTorch 的自动微分系统：

```python
# 设置 requires_grad=True 启用自动微分
x = torch.tensor(2.0, requires_grad=True)
y = x ** 2 + 3 * x + 1

# 计算梯度
y.backward()

# 查看梯度
print(x.grad)  # 输出: tensor(7.)，因为 dy/dx = 2x + 3，当 x=2 时等于 7
```

### 神经网络模块

使用 `nn.Module` 构建神经网络：

```python
import torch.nn as nn
import torch.nn.functional as F

class Net(nn.Module):
    def __init__(self):
        super(Net, self).__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, 1)
        self.conv2 = nn.Conv2d(32, 64, 3, 1)
        self.dropout1 = nn.Dropout(0.25)
        self.dropout2 = nn.Dropout(0.5)
        self.fc1 = nn.Linear(9216, 128)
        self.fc2 = nn.Linear(128, 10)
    
    def forward(self, x):
        x = self.conv1(x)
        x = F.relu(x)
        x = self.conv2(x)
        x = F.relu(x)
        x = F.max_pool2d(x, 2)
        x = self.dropout1(x)
        x = torch.flatten(x, 1)
        x = self.fc1(x)
        x = F.relu(x)
        x = self.dropout2(x)
        x = self.fc2(x)
        output = F.log_softmax(x, dim=1)
        return output
```

### DataLoader

`DataLoader` 用于批量加载数据：

```python
from torch.utils.data import DataLoader, Dataset

class CustomDataset(Dataset):
    def __init__(self, data, labels):
        self.data = data
        self.labels = labels
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        return self.data[idx], self.labels[idx]

# 创建 DataLoader
dataset = CustomDataset(data, labels)
dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
```

### 优化器

PyTorch 提供多种优化器：

```python
import torch.optim as optim

# SGD 优化器
optimizer = optim.SGD(model.parameters(), lr=0.01, momentum=0.9)

# Adam 优化器
optimizer = optim.Adam(model.parameters(), lr=0.001)

# 学习率调度器
scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.1)
```

## 💻 代码实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

# 1. 准备数据
X_train = torch.randn(1000, 20)  # 1000个样本，每个样本20维
y_train = torch.randint(0, 10, (1000,))  # 10分类

dataset = TensorDataset(X_train, y_train)
dataloader = DataLoader(dataset, batch_size=32, shuffle=True)

# 2. 定义模型
class SimpleMLP(nn.Module):
    def __init__(self, input_dim, hidden_dim, output_dim):
        super(SimpleMLP, self).__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, output_dim)
    
    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        return x

model = SimpleMLP(input_dim=20, hidden_dim=64, output_dim=10)

# 3. 定义损失函数和优化器
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# 4. 训练循环
num_epochs = 10
for epoch in range(num_epochs):
    model.train()  # 设置训练模式
    running_loss = 0.0
    
    for batch_idx, (data, target) in enumerate(dataloader):
        # 前向传播
        output = model(data)
        loss = criterion(output, target)
        
        # 反向传播和优化
        optimizer.zero_grad()  # 清零梯度
        loss.backward()        # 计算梯度
        optimizer.step()       # 更新权重
        
        running_loss += loss.item()
    
    # 计算平均损失
    avg_loss = running_loss / len(dataloader)
    print(f"Epoch {epoch+1}/{num_epochs}, Loss: {avg_loss:.4f}")

# 5. 模型保存
torch.save(model.state_dict(), 'model.pth')

# 6. 模型加载
model = SimpleMLP(input_dim=20, hidden_dim=64, output_dim=10)
model.load_state_dict(torch.load('model.pth'))
model.eval()  # 设置评估模式

# 7. 预测
with torch.no_grad():  # 禁用梯度计算
    test_input = torch.randn(1, 20)
    output = model(test_input)
    predicted = torch.argmax(output, dim=1)
    print("预测结果:", predicted.item())
```

## 🎯 关键要点
- 使用 `nn.Module` 构建神经网络
- `forward` 方法定义前向传播
- 训练循环：前向传播 → 计算损失 → 反向传播 → 更新权重
- `optimizer.zero_grad()` 必须在 `loss.backward()` 之前调用
- 评估时使用 `model.eval()` 和 `torch.no_grad()`

## ❓ 常见问题

Q: `model.train()` 和 `model.eval()` 有什么区别？
A: `train()` 启用 Dropout 和 BatchNorm 的训练模式，`eval()` 禁用它们。

Q: 为什么需要 `optimizer.zero_grad()`？
A: PyTorch 默认会累积梯度，所以每次迭代前需要清零。

## 📚 延伸阅读
- PyTorch 官方文档
- "Deep Learning with PyTorch" - Eli Stevens
