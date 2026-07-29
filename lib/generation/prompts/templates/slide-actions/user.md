Elements: {{elements}}
Title: {{title}}
Key Points: {{keyPoints}}
Description: {{description}}
{{courseContext}}
{{agents}}
{{userProfile}}

**Language Requirement**: Generated speech content must be in the same language as the key points above.

Output as a JSON array directly (no explanation, no code fences, 5-10 segments):
[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","agentId":"teacher","content":"开场讲解内容"},{"type":"text","agentId":"student-curious","content":"提问内容"},{"type":"text","agentId":"teacher","content":"回答并继续讲解"}]
