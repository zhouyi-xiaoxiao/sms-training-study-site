const STORAGE_KEY = "sms-learning-progress-v1";
const QUIZ_PAGE_SIZE = 10;

const TYPE_LABEL = {
  single: "单选",
  multiple: "多选",
  truefalse: "判断",
  short: "场景/简答",
  flash: "闪卡",
};

const state = {
  data: null,
  ui: {
    tab: "dashboard",
    knowledgeSearch: "",
    knowledgeTag: "全部",
    quizSource: "全部来源",
    quizType: "全部题型",
    quizSearch: "",
    quizWrongOnly: false,
    quizPage: 1,
  },
  progress: {
    records: {},
  },
  cache: {
    allTags: [],
  },
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function escapeHtml(input = "") {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalize(text = "") {
  return String(text).trim().toLowerCase();
}

function letterAt(index) {
  return String.fromCharCode(65 + index);
}

function toPercent(numerator, denominator) {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function isObjective(q) {
  return q.qtype === "single" || q.qtype === "multiple" || q.qtype === "truefalse";
}

function isAutoJudgeObjective(q) {
  return q.qtype === "single" || q.qtype === "truefalse";
}

function parseAnswerLetters(answer) {
  if (Array.isArray(answer)) {
    return answer.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  }
  const raw = String(answer || "").trim();
  if (!raw) return [];
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .split("")
    .filter((ch, idx, arr) => idx === arr.indexOf(ch));
}

function deriveCorrectLetters(q) {
  if (!q.options || !q.options.length) return [];
  if (q.qtype === "single" || q.qtype === "multiple") {
    const direct = parseAnswerLetters(q.answer);
    if (direct.length) return direct;

    const ans = normalize(q.answer);
    const idx = q.options.findIndex((opt) => normalize(opt) === ans);
    return idx >= 0 ? [letterAt(idx)] : [];
  }

  if (q.qtype === "truefalse") {
    const ans = String(q.answer || "").trim();
    if (/^[A-Z]$/i.test(ans)) return [ans.toUpperCase()];
    const idx = q.options.findIndex((opt) => String(opt).trim() === ans);
    return idx >= 0 ? [letterAt(idx)] : [];
  }

  return [];
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function getRecord(qid) {
  return state.progress.records[qid] || null;
}

function upsertRecord(qid, patch) {
  const prev = state.progress.records[qid] || {};
  state.progress.records[qid] = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  persistProgress();
}

function persistProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.records) {
      state.progress = parsed;
    }
  } catch {
    // ignore invalid local storage
  }
}

function resetProgress() {
  state.progress = { records: {} };
  persistProgress();
  renderAll();
}

function setTab(tabName) {
  state.ui.tab = tabName;
  $all(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabName);
  });
  $all(".tab-pane").forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.pane === tabName);
  });
}

function getAllTags() {
  if (state.cache.allTags.length) return state.cache.allTags;
  const tags = [];
  state.data.knowledge.forEach((k) => tags.push(...(k.tags || [])));
  state.data.questions.forEach((q) => tags.push(...(q.tags || [])));
  state.cache.allTags = uniqueSorted(tags);
  return state.cache.allTags;
}

function formatKnowledgeContent(raw = "") {
  const lines = raw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return "<p class=\"hint\">暂无内容。</p>";

  const bullets = lines.filter((line) => /^[-*]\s+/.test(line));
  if (bullets.length >= Math.ceil(lines.length / 2)) {
    const items = bullets
      .map((line) => line.replace(/^[-*]\s+/, "").trim())
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
    return `<ul class=\"compact-list\">${items}</ul>`;
  }

  return `<p>${escapeHtml(lines.join("\n")).replace(/\n/g, "<br />")}</p>`;
}

function getKnowledgeFiltered() {
  const search = normalize(state.ui.knowledgeSearch);
  const tag = state.ui.knowledgeTag;

  return state.data.knowledge.filter((item) => {
    const byTag = tag === "全部" || (item.tags || []).includes(tag);
    if (!byTag) return false;
    if (!search) return true;

    const blob = normalize(
      `${item.chapter} ${item.title} ${item.content} ${(item.tags || []).join(" ")}`
    );
    return blob.includes(search);
  });
}

function getQuizFiltered() {
  const source = state.ui.quizSource;
  const qtype = state.ui.quizType;
  const search = normalize(state.ui.quizSearch);

  return state.data.questions.filter((q) => {
    if (source !== "全部来源" && q.source !== source) return false;
    if (qtype !== "全部题型" && q.qtype !== qtype) return false;

    if (state.ui.quizWrongOnly) {
      const rec = getRecord(q.id);
      if (!rec || rec.correct !== false) return false;
    }

    if (!search) return true;

    const blob = normalize(
      [q.id, q.source, TYPE_LABEL[q.qtype] || q.qtype, q.stem, (q.options || []).join(" "), q.explanation, (q.tags || []).join(" ")].join(" ")
    );
    return blob.includes(search);
  });
}

function formatObjectiveAnswerText(q, letters) {
  if (!letters || !letters.length) return "未作答";
  const list = letters.map((letter) => {
    const idx = letter.charCodeAt(0) - 65;
    const text = q.options?.[idx] || "";
    return `${letter}. ${text}`;
  });
  return list.join("；");
}

function getSubjectiveReference(q) {
  const direct = String(q.answer || "").trim();
  const fallback = String(q.explanation || "").trim();
  return direct || fallback || "（暂无参考答案）";
}

function renderMetaStats() {
  const objective = state.data.questions.filter(isObjective);
  const answeredObjective = objective.filter((q) => {
    const rec = getRecord(q.id);
    return rec && Array.isArray(rec.userLetters) && rec.userLetters.length;
  });
  const correct = answeredObjective.filter((q) => getRecord(q.id)?.correct === true).length;

  $("#statKnowledge").textContent = state.data.meta.knowledge_count;
  $("#statQuestions").textContent = state.data.meta.question_count;
  $("#statAnswered").textContent = `${answeredObjective.length}/${objective.length}`;
  $("#statCorrectRate").textContent = toPercent(correct, answeredObjective.length);
}

function renderQuickTags() {
  const allTags = getAllTags();
  const holder = $("#quickTags");
  holder.innerHTML = allTags
    .map((tag) => `<button class=\"chip\" data-quick-tag=\"${escapeHtml(tag)}\">${escapeHtml(tag)}</button>`)
    .join("");
}

function renderDashboard() {
  const box = $("#dashboardSummary");
  const bySource = {};
  const byType = {};

  state.data.questions.forEach((q) => {
    bySource[q.source] = (bySource[q.source] || 0) + 1;
    byType[q.qtype] = (byType[q.qtype] || 0) + 1;
  });

  const sourceCards = Object.entries(bySource)
    .map(([name, count]) => `<div class=\"summary-card\"><h3>${escapeHtml(name)}</h3><p>题目 ${count} 道</p></div>`)
    .join("");

  const typeCards = Object.entries(byType)
    .map(([name, count]) => `<div class=\"summary-card\"><h3>${TYPE_LABEL[name] || name}</h3><p>题目 ${count} 道</p></div>`)
    .join("");

  box.innerHTML = [
    `<div class=\"summary-card\"><h3>知识点库</h3><p>${state.data.meta.knowledge_count} 条结构化知识。</p></div>`,
    `<div class=\"summary-card\"><h3>题目总量</h3><p>${state.data.meta.question_count} 道，含客观题与主观题。</p></div>`,
    sourceCards,
    typeCards,
  ].join("");
}

function renderKnowledgeTags() {
  const box = $("#knowledgeTags");
  const tags = ["全部", ...getAllTags()];
  box.innerHTML = tags
    .map((tag) => {
      const active = state.ui.knowledgeTag === tag ? " is-active" : "";
      return `<button class=\"chip${active}\" data-knowledge-tag=\"${escapeHtml(tag)}\">${escapeHtml(tag)}</button>`;
    })
    .join("");
}

function countRelatedByTags(tags = []) {
  if (!tags.length) return 0;
  return state.data.questions.filter((q) => (q.tags || []).some((tag) => tags.includes(tag))).length;
}

function renderKnowledgeList() {
  const list = $("#knowledgeList");
  const filtered = getKnowledgeFiltered();

  if (!filtered.length) {
    list.innerHTML = `<div class=\"panel\"><p class=\"hint\">没有匹配结果，建议清空筛选后重试。</p></div>`;
    return;
  }

  list.innerHTML = filtered
    .map((item) => {
      const relatedCount = countRelatedByTags(item.tags || []);
      const primaryTag = (item.tags || [])[0] || "综合";
      return `
      <article class=\"knowledge-card\" id=\"k-${escapeHtml(item.id)}\">
        <div class=\"meta-line\">
          <span class=\"meta-badge\">${escapeHtml(item.chapter)}</span>
          ${(item.tags || []).map((tag) => `<span class=\"meta-badge\">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class=\"knowledge-content\">${formatKnowledgeContent(item.content)}</div>
        <div class=\"tool-row\">
          <button class=\"ghost-btn\" data-action=\"go-quiz-tag\" data-tag=\"${escapeHtml(primaryTag)}\">练习本主题题目（${relatedCount}）</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderQuizFilterOptions() {
  const sourceSelect = $("#quizSourceFilter");
  const typeSelect = $("#quizTypeFilter");

  const sources = uniqueSorted(state.data.questions.map((q) => q.source));
  sourceSelect.innerHTML = [
    `<option value=\"全部来源\">全部来源</option>`,
    ...sources.map((source) => `<option value=\"${escapeHtml(source)}\">${escapeHtml(source)}</option>`),
  ].join("");

  typeSelect.innerHTML = [
    `<option value=\"全部题型\">全部题型</option>`,
    ...Object.entries(TYPE_LABEL).map(([value, label]) => `<option value=\"${value}\">${label}</option>`),
  ].join("");

  sourceSelect.value = state.ui.quizSource;
  typeSelect.value = state.ui.quizType;
}

function buildPageList(totalPages, current) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (current <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
  if (current >= totalPages - 3) return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", current - 1, current, current + 1, "...", totalPages];
}

function renderPager(container, total, page) {
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(total / QUIZ_PAGE_SIZE));
  const pages = buildPageList(totalPages, page);

  container.innerHTML = `
    <div class=\"pager-info\">共 ${total} 题 · 第 ${page}/${totalPages} 页</div>
    <div class=\"page-buttons\">
      <button class=\"page-btn\" data-page=\"${Math.max(1, page - 1)}\" ${page === 1 ? "disabled" : ""}>上一页</button>
      ${pages
        .map((p) =>
          p === "..."
            ? `<span class=\"page-ellipsis\">…</span>`
            : `<button class=\"page-btn${p === page ? " is-active" : ""}\" data-page=\"${p}\">${p}</button>`
        )
        .join("")}
      <button class=\"page-btn\" data-page=\"${Math.min(totalPages, page + 1)}\" ${page === totalPages ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function renderObjectiveOptions(q, record) {
  const correctLetters = deriveCorrectLetters(q);
  const userLetters = Array.isArray(record?.userLetters) ? record.userLetters : [];

  const inputType = q.qtype === "multiple" ? "checkbox" : "radio";

  return `
    <div class=\"option-list\">
      ${(q.options || [])
        .map((opt, idx) => {
          const letter = letterAt(idx);
          const checked = userLetters.includes(letter) ? "checked" : "";

          let optionClass = "option-item";
          if (record && Array.isArray(record.userLetters) && record.userLetters.length) {
            if (correctLetters.includes(letter)) optionClass += " correct";
            if (userLetters.includes(letter) && !correctLetters.includes(letter)) optionClass += " wrong";
          }

          return `
            <label class=\"${optionClass}\">
              <input type=\"${inputType}\" name=\"q-${escapeHtml(q.id)}\" value=\"${letter}\" data-qid=\"${escapeHtml(q.id)}\" ${checked} />
              <span><strong>${letter}.</strong> ${escapeHtml(opt)}</span>
            </label>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderObjectiveAnswerBox(q, record) {
  if (!record || !Array.isArray(record.userLetters) || !record.userLetters.length) return "";
  const correctLetters = deriveCorrectLetters(q);
  const yourAnswer = formatObjectiveAnswerText(q, record.userLetters);
  const stdAnswer = formatObjectiveAnswerText(q, correctLetters);
  const verdict = record.correct ? "回答正确" : "回答错误";
  const cls = record.correct ? "ok" : "bad";

  return `
    <div class=\"answer-box ${cls}\">
      <div class=\"answer-grid\">
        <div class=\"answer-key\">你的答案</div>
        <div class=\"answer-value\">${escapeHtml(yourAnswer)}</div>
        <div class=\"answer-key\">判定</div>
        <div class=\"answer-value\">${verdict}</div>
        <div class=\"answer-key\">正确答案</div>
        <div class=\"answer-value\">${escapeHtml(stdAnswer)}</div>
      </div>
      ${q.explanation ? `<div class=\"answer-line\"><strong>解释</strong>：${escapeHtml(q.explanation)}</div>` : ""}
    </div>
  `;
}

function renderSubjectiveBlock(q, record) {
  const text = record?.subjectiveText || "";
  const shown = Boolean(record?.revealed);
  const reference = getSubjectiveReference(q);

  return `
    <div class=\"subjective-box\">
      <textarea data-input=\"subjective\" data-qid=\"${escapeHtml(q.id)}\" placeholder=\"先自行作答，再点击显示参考答案\">${escapeHtml(text)}</textarea>
      <div class=\"tool-row\">
        <button class=\"ghost-btn\" data-action=\"toggle-reference\" data-qid=\"${escapeHtml(q.id)}\">${shown ? "隐藏参考答案" : "显示参考答案"}</button>
      </div>
      ${
        shown
          ? `<div class=\"answer-box\">
              <div class=\"answer-grid\">
                <div class=\"answer-key\">你的作答</div>
                <div class=\"answer-value\">${escapeHtml(text || "（未填写）")}</div>
                <div class=\"answer-key\">参考答案</div>
                <div class=\"answer-value\">${escapeHtml(reference).replace(/\n/g, "<br />")}</div>
              </div>
            </div>`
          : ""
      }
    </div>
  `;
}

function renderQuestionCard(q) {
  const record = getRecord(q.id);
  const autoJudge = isAutoJudgeObjective(q);

  return `
    <article class=\"question-card\" id=\"q-${escapeHtml(q.id)}\">
      <div class=\"meta-line\">
        <span class=\"meta-badge\">${escapeHtml(q.id)}</span>
        <span class=\"meta-badge\">${escapeHtml(q.source)}</span>
        <span class=\"meta-badge\">${TYPE_LABEL[q.qtype] || q.qtype}</span>
        ${(q.tags || []).map((tag) => `<span class=\"meta-badge\">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <h3 class=\"question-stem\">${escapeHtml(q.stem)}</h3>
      ${
        isObjective(q)
          ? `
            ${renderObjectiveOptions(q, record)}
            <div class=\"tool-row\">
              ${
                autoJudge
                  ? `<span class=\"hint inline-hint\">点击选项后自动判题</span>`
                  : `<button class=\"solid-btn\" data-action=\"submit-objective\" data-qid=\"${escapeHtml(q.id)}\">提交答案</button>`
              }
              <button class=\"ghost-btn\" data-action=\"clear-answer\" data-qid=\"${escapeHtml(q.id)}\">清空重做</button>
              <button class=\"ghost-btn\" data-action=\"go-knowledge\" data-tag=\"${escapeHtml((q.tags || ["综合"])[0])}\">看相关知识点</button>
            </div>
            ${renderObjectiveAnswerBox(q, record)}
          `
          : `
            ${renderSubjectiveBlock(q, record)}
            <div class=\"tool-row\">
              <button class=\"ghost-btn\" data-action=\"go-knowledge\" data-tag=\"${escapeHtml((q.tags || ["综合"])[0])}\">看相关知识点</button>
            </div>
          `
      }
    </article>
  `;
}

function renderQuizList() {
  const filtered = getQuizFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / QUIZ_PAGE_SIZE));
  if (state.ui.quizPage > totalPages) state.ui.quizPage = totalPages;
  if (state.ui.quizPage < 1) state.ui.quizPage = 1;

  const start = (state.ui.quizPage - 1) * QUIZ_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + QUIZ_PAGE_SIZE);

  renderPager($("#quizPager"), filtered.length, state.ui.quizPage);
  renderPager($("#quizPagerBottom"), filtered.length, state.ui.quizPage);

  const list = $("#quizList");
  if (!pageItems.length) {
    list.innerHTML = `<div class=\"panel\"><p class=\"hint\">当前筛选下没有题目，建议重置筛选条件。</p></div>`;
    return;
  }

  list.innerHTML = pageItems.map(renderQuestionCard).join("");
}

function getDocPreviewPath(doc) {
  return doc?.web || doc?.file || "";
}

function renderDocLibrary() {
  const docs = state.data.documents || [];
  const cards = $("#docCards");
  const select = $("#docPreviewSelect");

  cards.innerHTML = docs
    .map(
      (doc) => {
        const previewPath = getDocPreviewPath(doc);
        return `
      <article class=\"doc-card\">
        <h3>${escapeHtml(doc.title)}</h3>
        <p>${escapeHtml(doc.desc || "")}</p>
        <div class=\"tool-row\">
          <button class=\"ghost-btn\" data-action=\"preview-doc\" data-doc=\"${escapeHtml(doc.id)}\">站内预览</button>
          <a class=\"solid-btn as-link\" href=\"${escapeHtml(previewPath)}\" target=\"_blank\" rel=\"noopener\">在线阅读</a>
        </div>
      </article>`;
      }
    )
    .join("");

  select.innerHTML = docs
    .map((doc) => `<option value=\"${escapeHtml(doc.id)}\">${escapeHtml(doc.title)}</option>`)
    .join("");

  if (docs.length) {
    const current = select.value || docs[0].id;
    select.value = current;
    updateDocPreview(current);
  }
}

function updateDocPreview(docId) {
  const docs = state.data.documents || [];
  const target = docs.find((doc) => doc.id === docId) || docs[0];
  if (!target) return;
  const previewPath = getDocPreviewPath(target);

  $("#docPreviewFrame").src = previewPath;
  $("#docOpenNew").href = previewPath;
  $("#docPreviewSelect").value = target.id;
}

function renderProgress() {
  const board = $("#progressBoard");
  const wrongList = $("#wrongList");

  const objectiveQs = state.data.questions.filter(isObjective);
  const objectiveAnswered = objectiveQs.filter((q) => {
    const rec = getRecord(q.id);
    return rec && Array.isArray(rec.userLetters) && rec.userLetters.length;
  });
  const objectiveCorrect = objectiveAnswered.filter((q) => getRecord(q.id)?.correct === true).length;

  const byType = {};
  objectiveQs.forEach((q) => {
    const type = q.qtype;
    byType[type] ||= { total: 0, answered: 0, correct: 0 };
    byType[type].total += 1;
    const rec = getRecord(q.id);
    if (rec && Array.isArray(rec.userLetters) && rec.userLetters.length) {
      byType[type].answered += 1;
      if (rec.correct === true) byType[type].correct += 1;
    }
  });

  const subjectiveViewed = state.data.questions.filter((q) => !isObjective(q)).filter((q) => Boolean(getRecord(q.id)?.revealed)).length;

  board.innerHTML = [
    `<article class=\"progress-card\"><h3>客观题完成度</h3><p>${objectiveAnswered.length}/${objectiveQs.length}</p></article>`,
    `<article class=\"progress-card\"><h3>客观题正确率</h3><p>${toPercent(objectiveCorrect, objectiveAnswered.length)}</p></article>`,
    `<article class=\"progress-card\"><h3>主观题已查看参考答案</h3><p>${subjectiveViewed}</p></article>`,
    ...Object.entries(byType).map(
      ([type, item]) =>
        `<article class=\"progress-card\"><h3>${TYPE_LABEL[type] || type}</h3><p>${item.answered}/${item.total} · 正确率 ${toPercent(item.correct, item.answered)}</p></article>`
    ),
  ].join("");

  const wrongItems = objectiveQs.filter((q) => getRecord(q.id)?.correct === false);
  if (!wrongItems.length) {
    wrongList.innerHTML = `<p class=\"hint\">当前没有错题，继续保持。</p>`;
  } else {
    wrongList.innerHTML = wrongItems
      .map((q) => {
        const rec = getRecord(q.id);
        const correct = formatObjectiveAnswerText(q, deriveCorrectLetters(q));
        const yours = formatObjectiveAnswerText(q, rec.userLetters || []);
        return `
          <article class=\"wrong-item\">
            <div class=\"meta-line\">
              <span class=\"meta-badge\">${escapeHtml(q.id)}</span>
              <span class=\"meta-badge\">${TYPE_LABEL[q.qtype] || q.qtype}</span>
            </div>
            <div>${escapeHtml(q.stem)}</div>
            <div class=\"answer-grid\">
              <div class=\"answer-key\">你的答案</div>
              <div class=\"answer-value\">${escapeHtml(yours)}</div>
              <div class=\"answer-key\">正确答案</div>
              <div class=\"answer-value\">${escapeHtml(correct)}</div>
            </div>
            <div class=\"tool-row\">
              <button class=\"ghost-btn\" data-action=\"jump-to-question\" data-qid=\"${escapeHtml(q.id)}\">去订正</button>
              <button class=\"ghost-btn\" data-action=\"go-knowledge\" data-tag=\"${escapeHtml((q.tags || ["综合"])[0])}\">回看知识点</button>
            </div>
          </article>
        `;
      })
      .join("");
  }
}

function renderAll() {
  renderMetaStats();
  renderQuickTags();
  renderDashboard();
  renderKnowledgeTags();
  renderKnowledgeList();
  renderQuizFilterOptions();
  renderQuizList();
  renderDocLibrary();
  renderProgress();
}

function bindTabEvents() {
  $all(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  $all("[data-tab-trigger]").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tabTrigger));
  });
}

function bindKnowledgeEvents() {
  $("#knowledgeSearch").addEventListener("input", (e) => {
    state.ui.knowledgeSearch = e.target.value;
    renderKnowledgeList();
  });

  $("#knowledgeClear").addEventListener("click", () => {
    state.ui.knowledgeSearch = "";
    $("#knowledgeSearch").value = "";
    state.ui.knowledgeTag = "全部";
    renderKnowledgeTags();
    renderKnowledgeList();
  });

  $("#knowledgeTags").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-knowledge-tag]");
    if (!btn) return;
    state.ui.knowledgeTag = btn.dataset.knowledgeTag;
    renderKnowledgeTags();
    renderKnowledgeList();
  });

  $("#knowledgeList").addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-action='go-quiz-tag']");
    if (!trigger) return;
    const tag = trigger.dataset.tag || "";
    state.ui.quizSearch = tag;
    state.ui.quizPage = 1;
    $("#quizSearch").value = tag;
    setTab("quiz");
    renderQuizList();
  });
}

function bindSidebarEvents() {
  $("#quickTags").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick-tag]");
    if (!btn) return;
    const tag = btn.dataset.quickTag;
    state.ui.knowledgeTag = tag;
    state.ui.knowledgeSearch = "";
    $("#knowledgeSearch").value = "";
    renderKnowledgeTags();
    renderKnowledgeList();
    setTab("knowledge");
  });

  $("#btnStartWrong").addEventListener("click", () => {
    state.ui.quizWrongOnly = true;
    state.ui.quizPage = 1;
    $("#quizWrongOnly").checked = true;
    setTab("quiz");
    renderQuizList();
  });

  $("#btnResetProgress").addEventListener("click", () => {
    const ok = window.confirm("确认清空所有练习记录吗？");
    if (!ok) return;
    resetProgress();
    $("#quizWrongOnly").checked = false;
    $("#quizSearch").value = state.ui.quizSearch;
  });
}

function bindQuizFilterEvents() {
  $("#quizSourceFilter").addEventListener("change", (e) => {
    state.ui.quizSource = e.target.value;
    state.ui.quizPage = 1;
    renderQuizList();
  });

  $("#quizTypeFilter").addEventListener("change", (e) => {
    state.ui.quizType = e.target.value;
    state.ui.quizPage = 1;
    renderQuizList();
  });

  $("#quizSearch").addEventListener("input", (e) => {
    state.ui.quizSearch = e.target.value;
    state.ui.quizPage = 1;
    renderQuizList();
  });

  $("#quizWrongOnly").addEventListener("change", (e) => {
    state.ui.quizWrongOnly = Boolean(e.target.checked);
    state.ui.quizPage = 1;
    renderQuizList();
  });

  $("#quizClearFilter").addEventListener("click", () => {
    state.ui.quizSource = "全部来源";
    state.ui.quizType = "全部题型";
    state.ui.quizSearch = "";
    state.ui.quizWrongOnly = false;
    state.ui.quizPage = 1;
    $("#quizSourceFilter").value = state.ui.quizSource;
    $("#quizTypeFilter").value = state.ui.quizType;
    $("#quizSearch").value = "";
    $("#quizWrongOnly").checked = false;
    renderQuizList();
  });
}

function gradeObjectiveQuestion(q, userLetters) {
  const correctLetters = deriveCorrectLetters(q).sort();
  const user = [...userLetters].sort();

  if (q.qtype === "single" || q.qtype === "truefalse") {
    return user.length === 1 && correctLetters.length === 1 && user[0] === correctLetters[0];
  }

  if (q.qtype === "multiple") {
    if (user.length !== correctLetters.length) return false;
    return user.every((letter, idx) => letter === correctLetters[idx]);
  }

  return false;
}

function commitObjectiveAnswer(q, checkedLetters) {
  const correct = gradeObjectiveQuestion(q, checkedLetters);
  upsertRecord(q.id, {
    userLetters: checkedLetters,
    correct,
  });
  renderMetaStats();
  renderQuizList();
  renderProgress();
}

function bindQuizActionEvents() {
  const list = $("#quizList");

  list.addEventListener("click", (e) => {
    const pageBtn = e.target.closest(".page-btn");
    if (pageBtn && pageBtn.dataset.page) {
      state.ui.quizPage = Number(pageBtn.dataset.page);
      renderQuizList();
      return;
    }

    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;

    const action = trigger.dataset.action;
    const qid = trigger.dataset.qid;

    if (action === "submit-objective") {
      const q = state.data.questions.find((item) => item.id === qid);
      if (!q) return;
      const card = trigger.closest(".question-card");
      const checked = Array.from(card.querySelectorAll(`input[name='q-${CSS.escape(q.id)}']:checked`)).map((el) => el.value);
      if (!checked.length) {
        window.alert("请先选择答案后再提交。");
        return;
      }
      commitObjectiveAnswer(q, checked);
      return;
    }

    if (action === "clear-answer") {
      if (!qid) return;
      const rec = getRecord(qid);
      if (!rec) return;
      upsertRecord(qid, {
        userLetters: [],
        correct: null,
      });
      renderMetaStats();
      renderQuizList();
      renderProgress();
      return;
    }

    if (action === "toggle-reference") {
      const q = state.data.questions.find((item) => item.id === qid);
      if (!q) return;
      const rec = getRecord(q.id) || {};
      upsertRecord(q.id, {
        subjectiveText: rec.subjectiveText || "",
        revealed: !rec.revealed,
      });
      renderQuizList();
      renderProgress();
      return;
    }

    if (action === "go-knowledge") {
      const tag = trigger.dataset.tag || "全部";
      state.ui.knowledgeTag = tag;
      state.ui.knowledgeSearch = "";
      $("#knowledgeSearch").value = "";
      renderKnowledgeTags();
      renderKnowledgeList();
      setTab("knowledge");
      return;
    }
  });

  // draft text autosave
  list.addEventListener("input", (e) => {
    const input = e.target.closest("textarea[data-input='subjective']");
    if (!input) return;
    const qid = input.dataset.qid;
    const rec = getRecord(qid) || {};
    upsertRecord(qid, {
      ...rec,
      subjectiveText: input.value,
    });
  });

  // single / truefalse objective questions: auto judge when one option is chosen
  list.addEventListener("change", (e) => {
    const input = e.target.closest(".option-list input[data-qid]");
    if (!input) return;

    const qid = input.dataset.qid;
    const q = state.data.questions.find((item) => item.id === qid);
    if (!q || !isAutoJudgeObjective(q)) return;

    const card = input.closest(".question-card");
    if (!card) return;
    const checked = Array.from(card.querySelectorAll(`input[name='q-${CSS.escape(q.id)}']:checked`)).map((el) => el.value);
    if (!checked.length) return;
    commitObjectiveAnswer(q, checked);
  });

  const pagerTop = $("#quizPager");
  const pagerBottom = $("#quizPagerBottom");
  [pagerTop, pagerBottom].forEach((pager) => {
    pager.addEventListener("click", (e) => {
      const btn = e.target.closest(".page-btn");
      if (!btn || !btn.dataset.page) return;
      state.ui.quizPage = Number(btn.dataset.page);
      renderQuizList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function bindLibraryEvents() {
  $("#docCards").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='preview-doc']");
    if (!btn) return;
    updateDocPreview(btn.dataset.doc);
  });

  $("#docPreviewSelect").addEventListener("change", (e) => {
    updateDocPreview(e.target.value);
  });
}

function bindProgressEvents() {
  $("#wrongList").addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;

    if (action === "jump-to-question") {
      const qid = trigger.dataset.qid;
      if (!qid) return;
      state.ui.quizSearch = qid;
      state.ui.quizWrongOnly = false;
      state.ui.quizPage = 1;
      $("#quizSearch").value = qid;
      $("#quizWrongOnly").checked = false;
      setTab("quiz");
      renderQuizList();
      return;
    }

    if (action === "go-knowledge") {
      const tag = trigger.dataset.tag || "全部";
      state.ui.knowledgeTag = tag;
      state.ui.knowledgeSearch = "";
      $("#knowledgeSearch").value = "";
      renderKnowledgeTags();
      renderKnowledgeList();
      setTab("knowledge");
    }
  });
}

async function boot() {
  const res = await fetch("assets/data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`无法加载数据: ${res.status}`);
  state.data = await res.json();

  loadProgress();
  bindTabEvents();
  bindSidebarEvents();
  bindKnowledgeEvents();
  bindQuizFilterEvents();
  bindQuizActionEvents();
  bindLibraryEvents();
  bindProgressEvents();

  $("#knowledgeSearch").value = state.ui.knowledgeSearch;
  $("#quizSearch").value = state.ui.quizSearch;
  $("#quizWrongOnly").checked = state.ui.quizWrongOnly;

  renderAll();
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `
    <main style="padding:24px; font-family: sans-serif;">
      <h1>页面加载失败</h1>
      <p>请检查 <code>docs/assets/data.json</code> 是否存在且格式正确。</p>
      <pre>${escapeHtml(String(err.message || err))}</pre>
    </main>
  `;
});
