# SOURCE_NOTES

本项目原始素材来自一次多日企业短信内部培训的中文口语转录文本。

## 新增来源（2026-02-09）
- `../消息类型介绍.docx`
- 用途：补充“消息类型”模块（USSD、二进制短信、闪信细化）
- 处理方式：使用 `textutil` 抽取文本后，整合进学习版文档与题库专题章节
- `src/knowledge_points_full.tex`、`src/practice_with_brain_science.tex`
- 用途：构建网站知识点与题库数据（`docs/assets/data.json`）
- 处理方式：脚本化解析 `tools/build_web_data.py`

## 已做处理
- 口语化冗余删除
- 错别字与断句修复
- 章节化重排
- 知识点结构化提取
- 题库化与答案化
- 新增外部资料并入（消息类型扩展）
- 计费口径统一更新（`<=67` / `>67` 按67分片）
- 题库答案对齐与解释强化（逐题左题右答）
- 网站化产出（多端学习站 + Pages 发布）

## 后续补充建议
- 若有新增录音转录，请先追加到本目录并标明日期。
- 若有新增外部文档（docx/pptx/pdf），请先抽取文本并记录来源路径、抽取命令、整合范围。
- 再按以下顺序更新：
  1) `src/original_complete.tex`
  2) `src/knowledge_points_full.tex`
  3) `src/practice_with_brain_science.tex`
