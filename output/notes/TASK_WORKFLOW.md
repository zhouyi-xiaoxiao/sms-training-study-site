# 后续任务工作流（复用）

1. 更新原始资料：先补到 `notes/`（若是 `docx`/`pptx`，先抽取文本并留存来源信息）。
2. 更新源文档：在 `src/` 对应 tex 内修改。
3. 局部编译：`./scripts/build_one.sh <file.tex>`。
4. 全量编译：`./scripts/build_all.sh`。
5. 日志检查：确认编译日志无 `Overfull/Underfull`。
6. 发布检查：按 `RELEASE_CHECKLIST.md` 逐项核对。
7. 检查输出：`pdf/` 下四份文件是否更新。

## 网站更新与发布（GitHub Pages）
1. 题库/知识点有变更后，先重编 PDF（同上流程）。
2. 运行数据构建脚本：`python3 tools/build_web_data.py`。
3. 同步文稿到站点目录：`cp -f output/pdf/*.pdf docs/files/`。
4. 本地检查关键文件：
   - `docs/index.html`
   - `docs/assets/styles.css`
   - `docs/assets/app.js`
   - `docs/assets/data.json`
5. 语法/资源检查：
   - `node --check docs/assets/app.js`
   - 校验 `docs/files/*.pdf` 与 `data.json.documents` 一致
6. 提交并推送到 `main/master`，GitHub Actions 将自动发布 `docs/` 到 Pages。
7. 发布后回归：
   - 知识点筛选可用
   - 客观题判题可用
   - 主观题答案显示可用
   - PDF 在线预览/新标签打开可用

## 四份主文档职责
- `original_complete.tex`：课程原文修订本（完整语境）。
- `knowledge_points_full.tex`：知识点总表（结构化索引）。
- `practice_with_brain_science.tex`：题库与答案（训练闭环，含扩展消息类型专题）。
- `verbatim_transcript.tex`：逐字稿（原始口语转录）。

## 发布口径文件
- `PUBLICATION_EDITORIAL_BASELINE.md`：术语、匿名、规则版本统一基线。
- `client_anonymization_map.template.csv`：案例匿名映射模板（受控使用）。
- `RELEASE_CHECKLIST.md`：交付前核对清单。
