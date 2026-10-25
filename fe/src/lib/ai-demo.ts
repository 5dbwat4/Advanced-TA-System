type DemoIntent = {
  id: string
  keywords: string[]
  reply: string
}

const INTENTS: DemoIntent[] = [
  {
    id: 'demo-checkoff',
    keywords: ['演示抽题', '演示验收'],
    reply: `**现场抽题**

1. 打开「验收」页面，选择当前实验。
2. 点击「开始验收」，系统会按设置随机抽取题目。
3. 学生作答时，可在右侧逐题打分并填写附言。
4. 完成后点击「保存」，成绩会同步到成绩表。

该流程只展示步骤，不会真的修改你的数据。`,
  },
  {
    id: 'demo-report',
    keywords: ['演示报告批改', '演示批改', '演示评分'],
    reply: `**报告批改**

1. 打开「报告」页面，选择一个学生。
2. 左侧查看提交的 PDF，右侧加载评分标准。
3. 点击「AI 预评分」可让模型逐条判断是否命中并生成附言。
4. 人工复核后点击「保存」，成绩写入成绩表。

未配置 API Key 时会给出示例判断，结果需人工复核。`,
  },
  {
    id: 'create-experiment',
    keywords: ['创建实验', '新建实验', '建立实验', '实验怎么建'],
    reply: `**创建实验**

1. 进入左侧导航「实验」。
2. 点击右上角「新建实验」。
3. 填写实验编号、标题，并选择要绑定的题目集。
4. 保存后可在实验详情里设置验收/报告截止时间与学在浙大同步。`,
  },
  {
    id: 'question-bank',
    keywords: ['题目', '题库', '导入题', '新建题'],
    reply: `**题目与题库**

- 「题目」页面用于搜索、新建和编辑单道题目。
- 「题库」页面用于把题目组织成题目集，并绑定到实验。
- 新建实验前，建议先在题库里准备好题目集。
- 报告评分标准与题目集相互独立，需要单独创建。`,
  },
  {
    id: 'report-grading',
    keywords: ['报告', '批改', '评分', '成绩'],
    reply: `**报告批改与评分**

1. 进入「报告」，选择实验和学生。
2. 在右侧加载评分标准，逐条勾选命中的扣分/加分项。
3. 「AI 预评分」会根据 PDF 和评分标准给出建议，仍需人工复核。
4. 保存后成绩会出现在「成绩」页面，也可同步到学在浙大。`,
  },
  {
    id: 'checkoff',
    keywords: ['验收', '抽题', '签到'],
    reply: `**验收与签到**

- 「验收」支持随机抽题、手动选题和多设备协作。
- 「签到」用于课堂签到，可生成二维码或链接。
- 抽题数量、单/多设备等偏好在「设置 → 偏好设置」中调整。`,
  },
  {
    id: 'ai-settings',
    keywords: ['ai能力', 'ai设置', '模型名称', 'apikey', 'baseurl'],
    reply: `**AI 能力设置**

在「设置 → AI 能力」中填写：

- **API Key**：兼容 OpenAI 接口的密钥；
- **Base URL**：例如 \`https://api.openai.com/v1\`；
- **模型名称**：例如 \`gpt-4o-mini\`。

三项都可留空，配置只保存在当前浏览器。`,
  },
  {
    id: 'navigation',
    keywords: ['打开', '带我去', '怎么去', '导航', '入口', '在哪里'],
    reply: `**页面入口**

- 实验：左侧「实验」
- 题库 / 题目：左侧「题目」「题库」
- 验收：左侧「验收」
- 报告批改：左侧「报告」
- 成绩：左侧「成绩」
- 设置：左下角头像或「更多 → 设置」

在移动端可通过底部导航或「更多」进入。`,
  },
  {
    id: 'demo',
    keywords: ['演示', 'demo', '示例'],
    reply: `**可以试试这些问题**

- 「现场抽题」：查看验收流程
- 「报告批改」：查看报告 AI 预评分流程
- 「怎么创建实验」
- 「题库怎么用」
- 「报告怎么评分」
- 「AI 能力怎么配置」

我只回答以上主题，其他问题会提示可用的输入。`,
  },
]

const FALLBACK = `当前我只响应以下主题：

- 现场抽题 / 报告批改
- 怎么创建实验
- 题库与题目怎么用
- 报告怎么评分
- 验收与签到
- AI 能力怎么配置
- 页面入口与导航

请换一种问法，或到「设置 → AI 能力」填写 API Key 后使用你自己的模型。`

export const DEMO_SUGGESTIONS = ['报告怎么评分', '怎么创建实验', 'AI 能力怎么配置']

export function demoReply(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!normalized) return FALLBACK

  const matched = INTENTS.filter((intent) =>
    intent.keywords.some((keyword) => normalized.includes(keyword.toLowerCase().replace(/\s+/g, ''))),
  )
  if (matched.length === 0) return FALLBACK

  matched.sort((a, b) => {
    const aLength = Math.max(...a.keywords.map((keyword) => keyword.length))
    const bLength = Math.max(...b.keywords.map((keyword) => keyword.length))
    return bLength - aLength
  })
  return matched[0].reply
}
