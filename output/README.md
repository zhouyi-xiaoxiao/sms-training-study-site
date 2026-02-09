# 短信培训刷题文档工程

## 目录结构
- `src/`：四份主文档（LaTeX 源文件）
- `style/`：统一排版样式
- `scripts/build_all.sh`：一键编译四份 PDF（并仅保留最终命名）
- `pdf/`：编译后的交付 PDF
- `notes/`：原始转录与后续补充记录（含出版级精修基线与检查清单）

## 一键生成
```bash
cd output
./scripts/build_all.sh
```

## 维护建议
- 新增课程内容时优先更新 `notes/` 与 `src/`。
- 结构、颜色、版式统一在 `style/sms_training_style.sty` 调整。
- 发布前先执行：`notes/RELEASE_CHECKLIST.md`。
- 术语/匿名/版本统一口径见：`notes/PUBLICATION_EDITORIAL_BASELINE.md`。
- 匿名案例映射模板见：`notes/client_anonymization_map.template.csv`。
- 交付目录只保留以下4份：
  - `01-企业短信培训学习手册-专业文稿版.pdf`
  - `02-全知识点-企业短信培训.pdf`
  - `03-企业短信培训题库-学习测评版.pdf`
  - `04-逐字稿-企业短信培训.pdf`
