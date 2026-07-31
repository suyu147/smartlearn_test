# chat Memory

## Learning Topics

- 学习Transformer架构原理，包括自注意力机制、多头注意力、位置编码 [^m_seed_l2_001_0] <!--m_seed_l2_001-->
- 研究RAG检索增强生成系统，包括向量数据库选型和Embedding模型对比 [^m_seed_l2_002_0] [^m_seed_l2_002_1] <!--m_seed_l2_002-->
- 学习RLHF人类反馈强化学习，包括PPO算法和Reward Model训练 [^m_seed_l2_003_0] <!--m_seed_l2_003-->
- 学习LLM参数高效微调技术，重点掌握LoRA和QLoRA [^m_seed_l2_004_0] <!--m_seed_l2_004-->
- 开始研究多模态大模型架构，关注GPT-4V和LLaVA [^m_seed_l2_005_0] <!--m_seed_l2_005-->
- 学习使用PyTorch为CIFAR-10实现三层神经网络分类器 [^m_seed_l2_006_0] <!--m_seed_l2_006-->

## Difficulties

- 正弦位置编码的相对位置表示机制难以理解，需要更多直觉解释 [^m_seed_l2_007_0] <!--m_seed_l2_007-->
- PPO的clip机制和KL散度惩罚概念混淆，导致RLHF测验不及格 [^m_seed_l2_008_0] <!--m_seed_l2_008-->
- RAG中chunking策略和reranking的选择缺乏经验 [^m_seed_l2_009_0] <!--m_seed_l2_009-->
- DPO和PPO在LLM对齐中的适用场景区分不清 [^m_seed_l2_010_0] <!--m_seed_l2_010-->

## Questions

- Multi-Head Attention中Q/K/V的维度变换计算流程是什么？ [^m_seed_l2_011_0] <!--m_seed_l2_011-->
- text-embedding-ada-002和bge-large-zh在实际检索效果上有何差异？ [^m_seed_l2_012_0] <!--m_seed_l2_012-->
- LoRA中rank参数如何选择？alpha参数如何影响微调效果？ [^m_seed_l2_013_0] <!--m_seed_l2_013-->
- DPO和PPO在LLM对齐中的优劣对比如何？ [^m_seed_l2_014_0] <!--m_seed_l2_014-->

## Preferences

- 偏好使用代码示例解释数学概念 [^m_seed_l2_015_0] <!--m_seed_l2_015-->
- 学习新概念时希望先看直觉解释再看数学推导 [^m_seed_l2_016_0] <!--m_seed_l2_016-->
- 对模型轻量化和移动端部署感兴趣 [^m_seed_l2_017_0] <!--m_seed_l2_017-->

## Progress

- 成功使用Pinecone搭建了向量检索原型 [^m_seed_l2_018_0] <!--m_seed_l2_018-->
- 用LangChain搭建了完整的RAG管道并跑通了评估 [^m_seed_l2_019_0] <!--m_seed_l2_019-->
- 成功用LoRA对Llama-3-8B进行了中文微调 [^m_seed_l2_020_0] <!--m_seed_l2_020-->
- Transformer基础测验从70分提升到90分，位置编码已掌握 [^m_seed_l2_021_0] <!--m_seed_l2_021-->
- 尝试将约10K参数模型部署到Android移动设备 [^m_seed_l2_022_0] <!--m_seed_l2_022-->

## Context

- 计算机科学大三学生，主修人工智能方向 [^m_seed_l2_023_0] <!--m_seed_l2_023-->
- 具有Python和PyTorch编程基础，熟悉Linux开发环境 [^m_seed_l2_024_0] <!--m_seed_l2_024-->
- 正在进行课程设计项目，需要完成Transformer文本分类系统 [^m_seed_l2_025_0] <!--m_seed_l2_025-->


[^m_seed_l2_001_0]: chat:sess-chat-001
[^m_seed_l2_002_0]: chat:sess-chat-003
[^m_seed_l2_002_1]: chat:sess-chat-004
[^m_seed_l2_003_0]: chat:sess-chat-005
[^m_seed_l2_004_0]: chat:sess-chat-008
[^m_seed_l2_005_0]: chat:sess-chat-010
[^m_seed_l2_006_0]: chat:final-001
[^m_seed_l2_007_0]: chat:sess-chat-001
[^m_seed_l2_008_0]: chat:sess-chat-005
[^m_seed_l2_009_0]: chat:sess-chat-003
[^m_seed_l2_010_0]: chat:sess-chat-009
[^m_seed_l2_011_0]: chat:sess-chat-001
[^m_seed_l2_012_0]: chat:sess-chat-004
[^m_seed_l2_013_0]: chat:sess-chat-008
[^m_seed_l2_014_0]: chat:sess-chat-009
[^m_seed_l2_015_0]: chat:sess-chat-002
[^m_seed_l2_016_0]: chat:sess-chat-007
[^m_seed_l2_017_0]: chat:test-mem-007
[^m_seed_l2_018_0]: chat:sess-chat-003
[^m_seed_l2_019_0]: chat:sess-chat-006
[^m_seed_l2_020_0]: chat:sess-chat-008
[^m_seed_l2_021_0]: quiz:sess-quiz-001
[^m_seed_l2_022_0]: chat:test-mem-003
[^m_seed_l2_023_0]: chat:sess-chat-001
[^m_seed_l2_024_0]: chat:sess-chat-001
[^m_seed_l2_025_0]: cowriter:cw-001