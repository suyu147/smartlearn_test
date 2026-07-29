/**
 * Skill Packs — 5 built-in skill definitions for document generation.
 *
 * Built-in skill packs (matching DeepTutor's tutorbot/skills/ system):
 * 1. docx    — Word document generation
 * 2. pdf     — PDF generation
 * 3. pptx    — PowerPoint presentation generation
 * 4. xlsx    — Excel spreadsheet generation
 * 5. skill-creator — Tool for creating new custom skills
 *
 * These skill packs are loaded by the SkillService at bootstrap time
 * and injected into the system prompt when the LLM needs to generate
 * structured documents.
 *
 * Each skill pack has:
 * - name: Canonical identifier
 * - description: What the skill does
 * - content: Full SKILL.md content with instructions
 * - tags: Categorization tags
 * - always: Whether to always include in system prompt
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('SkillPacks');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillPack {
  name: string;
  description: string;
  content: string;
  tags: string[];
  always: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. DOCX Skill Pack
// ---------------------------------------------------------------------------

const DOCX_SKILL: SkillPack = {
  name: 'docx',
  description: 'Generate Word documents (.docx) with structured content, tables, and formatting',
  tags: ['document', 'office', 'writing'],
  always: false,
  content: `# Word Document Generation (DOCX)

## Overview
Generate professional Word documents using the docx library via code_execution.

## When to Use
- User requests a Word document, .docx file, or formal document
- Output needs tables, headers, numbered lists, or professional formatting
- Document will be edited in Microsoft Word or Google Docs

## Implementation Pattern
Use the code_execution tool with the following approach:

\`\`\`python
# Install: pip install python-docx
from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Title
title = doc.add_heading('Document Title', level=0)

# Paragraph with formatting
para = doc.add_paragraph()
run = para.add_run('Bold text')
run.bold = True
para.add_run(' and normal text.')

# Table
table = doc.add_table(rows=3, cols=3, style='Light Grid Accent 1')
table.cell(0, 0).text = 'Header 1'
# ... populate cells

# Save
doc.save('/tmp/output.docx')
print('Document saved to /tmp/output.docx')
\`\`\`

## Guidelines
1. Always set document margins (1 inch / 2.54cm default)
2. Use heading levels consistently (H1 for title, H2 for sections, H3 for subsections)
3. Tables should have header rows with bold formatting
4. Use bullet lists for unordered items, numbered lists for sequential steps
5. Include page breaks between major sections
6. Set font to Calibri 11pt or similar professional font`,
};

// ---------------------------------------------------------------------------
// 2. PDF Skill Pack
// ---------------------------------------------------------------------------

const PDF_SKILL: SkillPack = {
  name: 'pdf',
  description: 'Generate PDF documents with rich content, charts, and custom layouts',
  tags: ['document', 'report', 'publishing'],
  always: false,
  content: `# PDF Generation

## Overview
Generate professional PDF documents using reportlab or fpdf via code_execution.

## When to Use
- User requests a PDF file or printable document
- Output needs precise layout control, charts, or custom styling
- Document is for distribution (not editing)

## Implementation Pattern

### Option A: ReportLab (rich formatting)
\`\`\`python
# Install: pip install reportlab
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, Image
from reportlab.lib.units import cm

doc = SimpleDocTemplate('/tmp/output.pdf', pagesize=A4)
styles = getSampleStyleSheet()
story = []

story.append(Paragraph('Report Title', styles['Title']))
story.append(Spacer(1, 0.5*cm))
story.append(Paragraph('Content here...', styles['BodyText']))

# Table
data = [['Header 1', 'Header 2'], ['Row 1', 'Data']]
table = Table(data)
story.append(table)

doc.build(story)
print('PDF saved to /tmp/output.pdf')
\`\`\`

### Option B: FPDF (simpler)
\`\`\`python
# Install: pip install fpdf2
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font('Helvetica', 'B', 16)
pdf.cell(0, 10, 'Title', ln=True, align='C')
pdf.set_font('Helvetica', '', 12)
pdf.multi_cell(0, 7, 'Content text here...')
pdf.output('/tmp/output.pdf')
print('PDF saved to /tmp/output.pdf')
\`\`\`

## Guidelines
1. Use A4 page size (21cm × 29.7cm) as default
2. Set margins: 2cm all sides
3. Include page numbers in footer
4. Use consistent heading hierarchy
5. For Chinese/CJK text, register a Unicode font first`,
};

// ---------------------------------------------------------------------------
// 3. PPTX Skill Pack
// ---------------------------------------------------------------------------

const PPTX_SKILL: SkillPack = {
  name: 'pptx',
  description: 'Generate PowerPoint presentations with slides, layouts, and visual elements',
  tags: ['presentation', 'office', 'slides'],
  always: false,
  content: `# PowerPoint Presentation Generation (PPTX)

## Overview
Generate professional PowerPoint presentations using python-pptx via code_execution.

## When to Use
- User requests a presentation, slides, or .pptx file
- Content is structured as multiple topics or sections
- Visual communication with bullet points and images

## Implementation Pattern
\`\`\`python
# Install: pip install python-pptx
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation()

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = 'Presentation Title'
slide.placeholders[1].text = 'Subtitle or Author'

# Content slide
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = 'Section Title'
body = slide.placeholders[1].text_frame
body.text = 'First bullet point'
p = body.add_paragraph()
p.text = 'Second bullet point'
p.level = 0

# Two-column slide
slide = prs.slides.add_slide(prs.slide_layouts[3])
slide.shapes.title.text = 'Comparison'
# Left column: placeholders[1], Right column: placeholders[2]

prs.save('/tmp/output.pptx')
print('Presentation saved to /tmp/output.pptx')
\`\`\`

## Slide Layouts
- 0: Title Slide
- 1: Title and Content
- 2: Section Header
- 3: Two Content
- 4: Comparison
- 5: Title Only
- 6: Blank

## Guidelines
1. Limit to 5-7 bullet points per slide
2. Use concise text (max ~6 words per bullet)
3. Title slides for each major section
4. Consistent color scheme (use theme colors)
5. Include a summary/conclusion slide
6. Aim for 10-15 slides for a standard presentation`,
};

// ---------------------------------------------------------------------------
// 4. XLSX Skill Pack
// ---------------------------------------------------------------------------

const XLSX_SKILL: SkillPack = {
  name: 'xlsx',
  description: 'Generate Excel spreadsheets with data, formulas, charts, and formatting',
  tags: ['spreadsheet', 'office', 'data'],
  always: false,
  content: `# Excel Spreadsheet Generation (XLSX)

## Overview
Generate professional Excel spreadsheets using openpyxl via code_execution.

## When to Use
- User requests a spreadsheet, Excel file, or .xlsx
- Data needs tabular organization with formulas or charts
- Output will be analyzed or edited in Excel/Google Sheets

## Implementation Pattern
\`\`\`python
# Install: pip install openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, Reference

wb = Workbook()
ws = wb.active
ws.title = 'Data Sheet'

# Headers with styling
headers = ['Name', 'Value', 'Category']
header_font = Font(bold=True, color='FFFFFF')
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')

for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center')

# Data rows
data = [['Item A', 100, 'Category 1'], ['Item B', 250, 'Category 2']]
for row_idx, row in enumerate(data, 2):
    for col_idx, value in enumerate(row, 1):
        ws.cell(row=row_idx, column=col_idx, value=value)

# Formula
ws.cell(row=4, column=2, value='=SUM(B2:B3)')

# Auto-fit column widths
for col in ws.columns:
    max_length = max(len(str(cell.value or '')) for cell in col)
    ws.column_dimensions[col[0].column_letter].width = max_length + 4

# Chart
chart = BarChart()
chart.title = 'Values by Item'
data_ref = Reference(ws, min_col=2, min_row=1, max_row=3)
cats = Reference(ws, min_col=1, min_row=2, max_row=3)
chart.add_data(data_ref, titles_from_data=True)
chart.set_categories(cats)
ws.add_chart(chart, 'E2')

wb.save('/tmp/output.xlsx')
print('Spreadsheet saved to /tmp/output.xlsx')
\`\`\`

## Guidelines
1. Always set meaningful sheet names (not "Sheet1")
2. Use header styling (bold + background color)
3. Include data validation where appropriate
4. Auto-fit column widths for readability
5. Use named ranges for complex formulas
6. Freeze header row with ws.freeze_panes = 'A2'`,
};

// ---------------------------------------------------------------------------
// 5. Skill Creator Skill Pack
// ---------------------------------------------------------------------------

const SKILL_CREATOR_SKILL: SkillPack = {
  name: 'skill-creator',
  description: 'Create, edit, and manage custom skills for the AI assistant',
  tags: ['meta', 'skill', 'customization'],
  always: false,
  content: `# Skill Creator

## Overview
Create and manage custom skills that extend the AI assistant's capabilities.
Skills are SKILL.md files with YAML frontmatter that provide specialized instructions.

## When to Use
- User wants to create a new custom skill
- User wants to modify or delete existing skills
- User wants to list or browse available skills

## Skill Structure

A skill is a SKILL.md file with:
\`\`\`markdown
---
name: my-skill
description: What this skill does
tags: [tag1, tag2]
always: false
---

# Skill Name

## Overview
Brief description of the skill.

## When to Use
Specific triggers or conditions for activation.

## Instructions
Step-by-step instructions for the AI to follow.

## Examples
Concrete examples of inputs and expected outputs.
\`\`\`

## Frontmatter Fields
- \`name\`: Unique identifier (kebab-case)
- \`description\`: One-line description
- \`tags\`: List of categorization tags
- \`always\`: If true, always included in system prompt

## Operations

### Create Skill
1. Determine the skill name (kebab-case, descriptive)
2. Write clear, structured content
3. Include "When to Use" section
4. Add concrete examples

### Edit Skill
1. Read the current skill content
2. Modify the relevant sections
3. Preserve the frontmatter structure

### Delete Skill
1. Confirm with the user before deleting
2. Remove the skill directory

## Guidelines
1. Skills should be self-contained (no external dependencies)
2. Include specific instructions, not vague guidelines
3. Use concrete examples from the user's domain
4. Keep skills focused — one skill, one purpose
5. Test by asking the AI to perform the skill's task`,
  metadata: {
    scripts: ['init_skill', 'package_skill', 'quick_validate'],
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BUILT_IN_SKILLS: Map<string, SkillPack> = new Map([
  ['docx', DOCX_SKILL],
  ['pdf', PDF_SKILL],
  ['pptx', PPTX_SKILL],
  ['xlsx', XLSX_SKILL],
  ['skill-creator', SKILL_CREATOR_SKILL],
]);

/** Get all built-in skill packs */
export function getBuiltInSkills(): Map<string, SkillPack> {
  return new Map(BUILT_IN_SKILLS);
}

/** Get a specific built-in skill pack by name */
export function getBuiltInSkill(name: string): SkillPack | undefined {
  return BUILT_IN_SKILLS.get(name);
}

/** Get names of all built-in skill packs */
export function getBuiltInSkillNames(): string[] {
  return [...BUILT_IN_SKILLS.keys()];
}

/** Get skill packs that should always be included in system prompt */
export function getAlwaysSkills(): SkillPack[] {
  return [...BUILT_IN_SKILLS.values()].filter((s) => s.always);
}

/**
 * Build a skills summary for system prompt injection.
 * Returns a formatted string listing available skills.
 */
export function buildSkillsSummary(includeContent: boolean = false): string {
  const lines: string[] = ['## Available Skills', ''];

  for (const [name, skill] of BUILT_IN_SKILLS) {
    lines.push(`- **${name}**: ${skill.description}`);
    if (includeContent) {
      lines.push('');
      lines.push(skill.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}
