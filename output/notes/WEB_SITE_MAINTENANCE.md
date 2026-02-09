# 网站维护说明（多端学习站）

## 站点目录
- 入口页：`docs/index.html`
- 样式：`docs/assets/styles.css`
- 交互：`docs/assets/app.js`
- 数据：`docs/assets/data.json`
- 文稿：`docs/files/*.pdf`
- 发布：`.github/workflows/pages.yml`

## 数据来源
- 知识点：`output/src/knowledge_points_full.tex`
- 题库：`output/src/practice_with_brain_science.tex`
- 构建脚本：`tools/build_web_data.py`

## 每次更新步骤
1. 更新 tex 文稿并重新编译 PDF：`./output/scripts/build_all.sh`
2. 生成网站数据：`python3 tools/build_web_data.py`
3. 同步 PDF 到网站目录：`cp -f output/pdf/*.pdf docs/files/`
4. 语法检查：`node --check docs/assets/app.js`
5. 提交推送后由 GitHub Actions 自动发布 Pages

## 功能说明
- 知识点：搜索 + 标签筛选 + 跳转题库
- 题库：来源/题型/关键词/错题筛选
- 客观题：提交后即时显示“你的答案/判定/正确答案/解释”
- 主观题：显示参考答案 + 本地草稿保存
- 进度：客观题正确率 + 错题列表 + 回看跳转

## 本地验证建议
- 启动静态服务：`python3 -m http.server 8000`
- 访问：`http://127.0.0.1:8000/docs/`
