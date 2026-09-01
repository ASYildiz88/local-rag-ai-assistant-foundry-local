const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const MOBILE_BREAKPOINT = 900;

function normalizeSavedLevel(value) {
  return value === 'Advanced' ? 'Advanced' : 'Standard';
}

const state = {
  project: null,
  chat: null,
  projects: [],
  chats: [],
  documents: [],
  projectOverviews: [],
  projectMeta: { instructions: '' },
  projectSuggestions: [],
  messages: [],
  level: normalizeSavedLevel(localStorage.getItem('answerLevel')),
  theme: localStorage.getItem('theme') || 'system',
  experience: localStorage.getItem('experience') || 'Simple',
  view: 'chat',
  uploads: [],
  activeFile: null,
  pendingFileAction: null,
  generating: false,
  desktopCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
  mobileSidebarOpen: false,
};

function esc(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char])
  );
}

function toast(text, ms = 3000) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), ms);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the local textarea fallback.
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.select();

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } finally {
    area.remove();
  }

  return copied;
}


function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('theme', theme);
  document.documentElement.dataset.theme = theme;

  $$('#themeToggle button').forEach(button => {
    button.classList.toggle('selected', button.dataset.value === theme);
  });
}

function setExperience(value) {
  state.experience = value;
  localStorage.setItem('experience', value);

  $$('#experienceToggle button').forEach(button => {
    button.classList.toggle('selected', button.dataset.value === value);
  });

  $$('.advanced-only').forEach(element => {
    element.classList.toggle('hidden', value !== 'Advanced');
  });

  if (
    value !== 'Advanced' &&
    (state.view === 'settings' || state.view === 'tests')
  ) {
    showView('chat');
  }

  renderMessages();
}

function setLevel(value) {
  state.level = value === 'Advanced' ? 'Advanced' : 'Standard';
  localStorage.setItem('answerLevel', state.level);
  $('#levelText').textContent = state.level;

  $$('#levelMenu [data-level]').forEach(button => {
    $('.check', button).textContent = button.dataset.level === state.level ? '✓' : '';
  });
}

function autoGrow() {
  const composer = $('#composer');
  composer.style.height = 'auto';
  composer.style.height = Math.min(composer.scrollHeight, 168) + 'px';
}

function scrollBottom(smooth = true) {
  const el = $('#messages');
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

function nearBottom() {
  const el = $('#messages');
  return el.scrollHeight - el.scrollTop - el.clientHeight < 180;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);

  // Read the body exactly once. response.json() consumes the body even when
  // JSON parsing fails, so calling response.text() afterwards caused:
  // "body stream already read".
  const raw = await response.text();
  let payload = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.detail
      || payload?.message
      || raw
      || `Request failed (${response.status})`;

    throw new Error(message);
  }

  return payload ?? {};
}


function renderMarkdown(text = '') {
  let safe = esc(text);
  const blocks = [];

  safe = safe.replace(
    /```([\w+-]*)\n([\s\S]*?)```/g,
    (_, language, code) => {
      const id = blocks.length;
      blocks.push(
        `<pre><button class="code-copy" data-copy-code="${id}" title="Copy code">Copy</button><code data-code-id="${id}">${code}</code></pre>`
      );
      return `@@CODE${id}@@`;
    }
  );

  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  safe = safe.replace(/^(?:- |• )(.+)$/gm, '<div class="md-bullet">• $1</div>');

  safe = safe
    .split(/\n{2,}/)
    .map(part => {
      if (
        part.startsWith('<h') ||
        part.startsWith('<div') ||
        part.startsWith('@@CODE')
      ) {
        return part;
      }
      return `<p>${part.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  safe = safe.replace(/@@CODE(\d+)@@/g, (_, index) => blocks[Number(index)]);
  return safe;
}

function sourceHtml(sources = []) {
  if (!sources.length) return '';

  const scored = sources.filter(source => !source.direct_file && Number.isFinite(source.score));
  const best = scored.length ? Math.max(...scored.map(source => source.score)) : null;
  const confidence = best == null ? 'Indexed file' : best >= 0.68 ? 'High' : best >= 0.50 ? 'Medium' : 'Low';

  return `
    <details class="sources">
      <summary>Sources · ${sources.length} · ${confidence}</summary>
      ${sources.map(source => `
        <div class="source-item">
          <strong>${esc(source.source)}${source.page ? ` · p.${source.page}` : ''} · chunk ${source.chunk_index}</strong>
          <small>${Number.isFinite(source.score) ? `Similarity ${source.score.toFixed(3)}` : 'Indexed document context'}</small>
          <p>${esc((source.content || '').slice(0, 620))}</p>
        </div>
      `).join('')}
    </details>
  `;
}

function attachmentMessageHtml(attachments = []) {
  if (!attachments.length) return '';

  return `
    <div class="message-attachments">
      ${attachments.map(name => {
        const ext = (name.split('.').pop() || '').toUpperCase();
        return `<span class="message-file"><b>${esc(ext || 'FILE')}</b><span>${esc(name)}</span></span>`;
      }).join('')}
    </div>
  `;
}

function thinkingHtml(label = 'Thinking') {
  return `
    <div class="thinking-row">
      <span class="thinking-mark"></span>
      <span class="thinking-label">${esc(label)}</span>
      <span class="thinking-dots"><i></i><i></i><i></i></span>
    </div>
  `;
}

function messageNode(message, index, isLatest) {
  const row = document.createElement('div');
  row.className = `message ${message.role}`;

  const inner = document.createElement('div');
  inner.className = 'message-inner';

  if (message.role === 'assistant') {
    const meta =
      state.experience === 'Advanced' && message.elapsed != null
        ? ` · ${esc(message.level || 'Standard')} · ${esc(message.model || 'local')} · first ${(message.first_token || 0).toFixed(1)}s · total ${(message.elapsed || 0).toFixed(1)}s · ${message.rag_used ? 'RAG on' : 'Local'}`
        : '';

    inner.innerHTML = `
      <div class="assistant-head">
        <div class="ai-avatar">AI</div>
        <div class="assistant-meta">Local AI${meta}</div>
      </div>
      <div class="message-content">${renderMarkdown(message.content || '')}</div>
      ${sourceHtml(message.sources || [])}
    `;

    if (isLatest) {
      const bar = document.createElement('div');
      bar.className = 'actionbar';
      bar.innerHTML = `
        <button title="Copy" aria-label="Copy" data-action="copy">⧉</button>
        <button title="Regenerate" aria-label="Regenerate" data-action="regenerate">↻</button>
        <div class="action-menu-wrap">
          <button title="More" aria-label="More" data-action="menu">⋯</button>
          <div class="popover-menu action-menu hidden">
            <button data-action="shorter">Make shorter</button>
            <button data-action="detail">Add detail</button>
            <button data-action="translate">Translate…</button>
          </div>
        </div>
      `;

      inner.appendChild(bar);

      bar.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;

        if (action === 'copy') {
          const copied = await copyText(message.content || '');
          toast(copied ? 'Copied' : 'Copy failed');
          return;
        }

        if (action === 'menu') {
          $('.action-menu', bar).classList.toggle('hidden');
          return;
        }

        if (action === 'translate') {
          openTranslatePicker();
          return;
        }

        await runAction(action);
      });
    }
  } else {
    inner.innerHTML = `
      ${attachmentMessageHtml(message.attachments || [])}
      <div class="message-content">${renderMarkdown(message.content || '')}</div>
    `;
  }

  row.appendChild(inner);
  return row;
}

function renderMessages() {
  const root = $('#messages');
  root.innerHTML = '';

  const assistantIndexes = state.messages
    .map((message, index) => (message.role === 'assistant' ? index : -1))
    .filter(index => index >= 0);

  const latestAssistant = assistantIndexes.at(-1);

  state.messages.forEach((message, index) => {
    root.appendChild(messageNode(message, index, index === latestAssistant));
  });

  $('#emptyState').classList.toggle('hidden', state.messages.length > 0);
  setTimeout(() => scrollBottom(false), 0);
}

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function applySidebarState() {
  const shell = $('#app');
  const sidebar = $('#sidebar');
  const backdrop = $('#sidebarBackdrop');
  const openButton = $('#openSidebarBtn');
  const collapseButton = $('#collapseBtn');
  const edgeButton = $('#sidebarEdgeBtn');
  const edgePath = $('path', edgeButton);

  if (isMobileLayout()) {
    shell.classList.remove('sidebar-collapsed');

    sidebar.classList.toggle(
      'mobile-open',
      state.mobileSidebarOpen,
    );

    backdrop.classList.toggle(
      'hidden',
      !state.mobileSidebarOpen,
    );

    openButton.style.display = state.mobileSidebarOpen
      ? 'none'
      : 'grid';

    edgeButton.style.display = 'none';

    collapseButton.title = 'Close sidebar';
    collapseButton.setAttribute(
      'aria-label',
      'Close sidebar',
    );

    return;
  }

  state.mobileSidebarOpen = false;
  sidebar.classList.remove('mobile-open');
  backdrop.classList.add('hidden');

  shell.classList.toggle(
    'sidebar-collapsed',
    state.desktopCollapsed,
  );

  openButton.style.display = 'none';
  edgeButton.style.display = 'grid';

  const label = state.desktopCollapsed
    ? 'Expand sidebar'
    : 'Collapse sidebar';

  edgeButton.title = label;
  edgeButton.setAttribute('aria-label', label);

  if (edgePath) {
    edgePath.setAttribute(
      'd',
      state.desktopCollapsed
        ? 'm9 18 6-6-6-6'
        : 'm15 18-6-6 6-6',
    );
  }
}


function closeMobileSidebar() {
  state.mobileSidebarOpen = false;
  applySidebarState();
}

function openMobileSidebar() {
  if (!isMobileLayout()) return;
  state.mobileSidebarOpen = true;
  applySidebarState();
}

function toggleDesktopSidebar() {
  if (isMobileLayout()) {
    closeMobileSidebar();
    return;
  }

  state.desktopCollapsed = !state.desktopCollapsed;
  localStorage.setItem('sidebarCollapsed', String(state.desktopCollapsed));
  applySidebarState();
}

function renderSidebar() {
  const currentProject = state.projects.find(project => project.slug === state.project);
  $('#projectTitle').textContent = currentProject?.name || 'My Project';

  const root = $('#recentChats');
  root.innerHTML = '';

  state.chats.forEach(chat => {
    const row = document.createElement('div');
    row.className = `recent-row ${chat.id === state.chat ? 'active' : ''}`;

    row.innerHTML = `
      <button class="recent-open" title="${esc(chat.title)}">
        ${chat.id === state.chat ? '› ' : ''}${esc(chat.title || 'New chat')}
      </button>
      <button class="recent-delete" title="Delete chat" aria-label="Delete chat">×</button>
    `;

    $('.recent-open', row).onclick = () => selectChat(chat.id);

    $('.recent-delete', row).onclick = event => {
      event.stopPropagation();
      confirmDeleteChat(chat);
    };

    root.appendChild(row);
  });
}

function projectOverview(slug = state.project) {
  return state.projectOverviews.find(project => project.slug === slug) || {
    slug,
    name: state.projects.find(project => project.slug === slug)?.name || 'Project',
    files: 0,
    indexed_files: 0,
    chunks: 0,
    chats: 0,
    context_ready: false,
    instructions: '',
    documents: [],
  };
}

function projectStatusText(project) {
  if (!project.files) return 'Add files to connect project knowledge';
  if (!project.context_ready) return 'Preparing AI context…';
  return `AI context ready · ${project.chunks} chunks`;
}

function openProjectSuggestion(text) {
  showView('chat');
  const composer = $('#composer');
  composer.value = text;
  autoGrow();
  composer.focus();
  composer.setSelectionRange(composer.value.length, composer.value.length);
}

async function saveProjectInstructions() {
  const field = $('#projectInstructions');
  if (!field) return;

  const instructions = field.value.trim();
  const button = $('#saveProjectInstructions');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    await api(`/api/project/${encodeURIComponent(state.project)}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions }),
    });
    await loadState(state.project, state.chat);
    toast('Project instructions saved');
  } catch (error) {
    toast(`Could not save instructions: ${error.message}`, 5000);
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function renderActiveProjectWorkspace() {
  const root = $('#activeProjectWorkspace');
  if (!root) return;

  const project = projectOverview();
  const readyClass = project.context_ready ? 'ready' : '';
  const suggestions = state.projectSuggestions.length
    ? state.projectSuggestions
    : ['Help me plan this project.'];

  root.innerHTML = `
    <div class="project-hero-card">
      <div class="project-hero-copy">
        <span class="eyebrow">ACTIVE AI WORKSPACE</span>
        <div class="project-title-line">
          <h2>${esc(project.name)}</h2>
          <span class="context-state ${readyClass}"><i></i>${esc(projectStatusText(project))}</span>
        </div>
        <p>${project.context_ready
          ? 'Chats in this project automatically check the local project index before answering. High-confidence matches are grounded in your files and show their sources.'
          : 'Add a PDF, DOCX, or TXT file just like a normal chat attachment. Local AI prepares it automatically; then simply ask for a summary or any question.'}
        </p>
      </div>
      <div class="project-hero-actions">
        <button class="primary-btn" id="projectNewChat">＋ New chat</button>
        <button class="secondary-btn" id="projectAddSources">Add sources</button>
        <button class="secondary-btn" id="projectOpenLibrary">Open library</button>
      </div>
    </div>

    <div class="project-metrics">
      <div><span>Sources</span><strong>${project.files}</strong><small>${project.indexed_files || 0} indexed</small></div>
      <div><span>Chunks</span><strong>${project.chunks || 0}</strong><small>SQLite vector index</small></div>
      <div><span>Chats</span><strong>${project.chats || 0}</strong><small>Project-only history</small></div>
      <div><span>Storage</span><strong>Local</strong><small>On this device</small></div>
    </div>

    <div class="project-workspace-grid">
      <section class="workspace-panel instructions-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">PROJECT INSTRUCTIONS</span><h3>How should the AI work here?</h3></div>
          <button id="saveProjectInstructions" class="secondary-btn">Save</button>
        </div>
        <textarea id="projectInstructions" maxlength="1800" placeholder="Example: Answer technically, prefer my project files, cite sources, and call out uncertainty.">${esc(project.instructions || '')}</textarea>
        <small>Applied to chats in this project. Your current message still has priority.</small>
      </section>

      <section class="workspace-panel ask-panel">
        <div class="panel-heading"><div><span class="eyebrow">PROJECT AI</span><h3>What can I ask?</h3></div></div>
        <div class="project-suggestions">
          ${suggestions.map(text => `<button data-project-suggestion="${esc(text)}"><span>↗</span>${esc(text)}</button>`).join('')}
        </div>
      </section>
    </div>
  `;

  $('#projectNewChat').onclick = async () => {
    const chat = await api('/api/chat/new', {
      method: 'POST',
      body: (() => {
        const form = new FormData();
        form.append('project', state.project);
        return form;
      })(),
    });
    state.chat = chat.id;
    await loadState(state.project, chat.id);
    showView('chat');
  };

  $('#projectAddSources').onclick = () => addFilesToProject(state.project);
  $('#projectOpenLibrary').onclick = () => showView('library');
  $('#saveProjectInstructions').onclick = saveProjectInstructions;

  $$('[data-project-suggestion]', root).forEach(button => {
    button.onclick = () => openProjectSuggestion(button.dataset.projectSuggestion);
  });
}

function renderProjects() {
  renderActiveProjectWorkspace();

  const root = $('#projectsList');
  root.innerHTML = '';

  state.projectOverviews.forEach(project => {
    const active = project.slug === state.project;
    const element = document.createElement('article');
    element.className = `project-card ${active ? 'active' : ''}`;

    element.innerHTML = `
      <div class="project-card-head">
        <span class="project-folder-icon">
          <svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/></svg>
        </span>
        <span class="context-mini ${project.context_ready ? 'ready' : ''}"><i></i>${project.context_ready ? 'AI context ready' : 'No context'}</span>
      </div>
      <div class="project-card-copy">
        <strong>${esc(project.name)}</strong>
        <small>${project.files} file${project.files === 1 ? '' : 's'} · ${project.chunks || 0} chunks · ${project.chats || 0} chats</small>
      </div>
      <div class="project-card-actions">
        <button data-open>${active ? 'Open chat' : 'Open workspace'}</button>
        <button data-add-files>Add files</button>
        ${state.projects.length > 1 ? '<button class="delete" data-delete>Delete</button>' : ''}
      </div>
    `;

    $('[data-open]', element).onclick = () => selectProject(project.slug);
    $('[data-add-files]', element).onclick = () => addFilesToProject(project.slug);

    const deleteButton = $('[data-delete]', element);
    if (deleteButton) {
      deleteButton.onclick = () => confirmDeleteProject(project);
    }

    root.appendChild(element);
  });
}


function renderLibrary() {
  const currentProject = state.projects.find(project => project.slug === state.project);

  $('#libraryStats').innerHTML = `
    <div class="stat-card"><span>Files</span><strong>${state.documents.length}</strong></div>
    <div class="stat-card"><span>Indexed chunks</span><strong>${state.ragStats?.chunks || 0}</strong></div>
    <div class="stat-card"><span>Storage</span><strong>Local</strong></div>
  `;

  const root = $('#libraryList');
  root.innerHTML = '';

  if (!state.documents.length) {
    root.innerHTML = `
      <div class="data-card empty-card">
        <div><strong>No project files yet</strong><small>Add a PDF, DOCX, or TXT file.</small></div>
      </div>
    `;
    return;
  }

  state.documents.forEach(file => {
    const element = document.createElement('div');
    element.className = 'data-card';

    const kb = (file.size / 1024).toFixed(1);
    const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();

    element.innerHTML = `
      <div class="file-card-copy">
        <span class="file-type-badge">${esc(ext)}</span>
        <div>
          <strong>${esc(file.name)}</strong>
          <small>${kb} KB · ${file.indexed ? `Ready · ${file.chunks || 0} chunks` : 'Not indexed yet'}</small>
        </div>
      </div>
      <div class="card-actions">
        <button data-preview>Open</button>
        <button class="delete" data-delete>Delete</button>
      </div>
    `;

    $('[data-preview]', element).onclick = () => previewDocument(file.name);
    $('[data-delete]', element).onclick = () => deleteDocument(file.name);
    root.appendChild(element);
  });
}

function renderStatus(runtime) {
  const el = $('#runtimeStatus');
  el.classList.toggle('ready', !!runtime.ready);
  $('span', el).textContent = runtime.ready ? 'Ready' : 'Offline';

  $('#settingsRuntime').textContent = runtime.ready
    ? 'Ready · local server connected'
    : `Offline · ${runtime.detail || 'Foundry Local is unavailable'}`;
}

async function loadState(project = state.project, chat = state.chat) {
  const query = new URLSearchParams();

  if (project) query.set('project', project);
  if (chat) query.set('chat_id', chat);

  const data = await api('/api/state?' + query.toString());

  Object.assign(state, {
    project: data.active_project,
    chat: data.active_chat,
    projects: data.projects,
    chats: data.chats,
    messages: data.messages,
    documents: data.documents,
    ragStats: data.rag_stats || { chunks: 0, sources: 0 },
    projectOverviews: data.project_overviews || [],
    projectMeta: data.active_project_meta || { instructions: '' },
    projectSuggestions: data.project_suggestions || [],
  });

  $('#buildLabel').textContent = 'Build ' + data.build;
  renderStatus(data.runtime);
  renderSidebar();
  renderMessages();
  renderProjects();
  renderLibrary();
  updateFileContext();
}

async function selectProject(slug) {
  state.project = slug;
  state.chat = null;
  state.activeFile = null;
  state.pendingFileAction = null;
  state.uploads = [];
  await loadState(slug, null);
  showView('chat');
  closeMobileSidebar();
}

async function selectChat(id) {
  state.chat = id;
  await loadState(state.project, id);
  showView('chat');
  closeMobileSidebar();
}

function showView(view) {
  state.view = view;

  $$('.view').forEach(section => section.classList.remove('active-view'));
  $('#' + view + 'View').classList.add('active-view');

  $$('.nav-btn[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  if (view === 'projects') renderProjects();
  if (view === 'library') renderLibrary();

  if (isMobileLayout()) {
    closeMobileSidebar();
  }
}

function openModal(content, extraClass = '') {
  $('#modal').className = `modal ${extraClass}`.trim();
  $('#modal').innerHTML = content;
  $('#modalBackdrop').classList.remove('hidden');
}

function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
  $('#modal').className = 'modal';
  $('#modal').innerHTML = '';
}

function confirmDeleteChat(chat) {
  openModal(`
    <h3>Delete chat?</h3>
    <p class="modal-copy">${esc(chat.title)}</p>
    <div class="modal-actions">
      <button class="secondary-btn" id="cancelModal">Cancel</button>
      <button class="danger-btn" id="confirmModal">Delete</button>
    </div>
  `);

  $('#cancelModal').onclick = closeModal;

  $('#confirmModal').onclick = async () => {
    const replacement = await api(
      `/api/chat/${chat.id}?project=${encodeURIComponent(state.project)}`,
      { method: 'DELETE' }
    );

    closeModal();
    await loadState(state.project, replacement.id);
  };
}

function confirmDeleteProject(project) {
  openModal(`
    <h3>Delete project?</h3>
    <p class="modal-copy">${esc(project.name)}</p>
    <div class="modal-actions">
      <button class="secondary-btn" id="cancelModal">Cancel</button>
      <button class="danger-btn" id="confirmModal">Delete</button>
    </div>
  `);

  $('#cancelModal').onclick = closeModal;

  $('#confirmModal').onclick = async () => {
    await api(`/api/project/${project.slug}`, { method: 'DELETE' });

    closeModal();
    state.project = null;
    state.chat = null;

    await loadState();
    showView('chat');
  };
}

async function previewDocument(name) {
  openModal(`
    <div class="preview-loading">
      ${thinkingHtml('Opening document')}
    </div>
  `, 'preview-modal');

  try {
    const data = await api(
      `/api/document/${encodeURIComponent(name)}/preview?project=${encodeURIComponent(state.project)}`
    );

    const meta = [
      data.type,
      data.pages ? `${data.pages} page${data.pages === 1 ? '' : 's'}` : null,
      `${(data.size / 1024).toFixed(1)} KB`,
    ].filter(Boolean).join(' · ');

    $('#modal').innerHTML = `
      <div class="preview-head">
        <div>
          <h3>${esc(data.name)}</h3>
          <small>${esc(meta)}</small>
        </div>
        <button class="icon-btn" id="closePreview" title="Close">×</button>
      </div>
      <div class="document-preview">${esc(data.text || 'No extractable text was found.')}</div>
      ${data.truncated ? '<p class="preview-note">Preview shortened for performance. Open the original to view the full file.</p>' : ''}
      <div class="modal-actions">
        <button class="secondary-btn" id="closePreviewBottom">Close</button>
        <button class="primary-btn" id="openOriginal">Open original</button>
      </div>
    `;

    $('#closePreview').onclick = closeModal;
    $('#closePreviewBottom').onclick = closeModal;

    $('#openOriginal').onclick = () => {
      window.open(
        `/api/document/${encodeURIComponent(name)}/raw?project=${encodeURIComponent(state.project)}`,
        '_blank',
        'noopener,noreferrer'
      );
    };
  } catch (error) {
    $('#modal').innerHTML = `
      <h3>Could not open document</h3>
      <p class="modal-copy">${esc(error.message)}</p>
      <div class="modal-actions">
        <button class="secondary-btn" id="closePreviewBottom">Close</button>
      </div>
    `;
    $('#closePreviewBottom').onclick = closeModal;
  }
}

async function deleteDocument(name) {
  openModal(`
    <h3>Delete file?</h3>
    <p class="modal-copy">${esc(name)}</p>
    <div class="modal-actions">
      <button class="secondary-btn" id="cancelModal">Cancel</button>
      <button class="danger-btn" id="confirmModal">Delete</button>
    </div>
  `);

  $('#cancelModal').onclick = closeModal;

  $('#confirmModal').onclick = async () => {
    closeModal();

    await api(
      `/api/document/${encodeURIComponent(name)}?project=${encodeURIComponent(state.project)}`,
      { method: 'DELETE' }
    );

    await loadState(state.project, state.chat);
    toast('File deleted');
  };
}

function setGenerating(value) {
  state.generating = value;

  $('#sendBtn').disabled = value;
  $('#composer').disabled = value;
  $('#attachBtn').disabled = value;
}

function createStreamingAssistant() {
  const message = {
    role: 'assistant',
    content: '',
    elapsed: 0,
    first_token: 0,
    model: 'local',
    level: state.level,
    rag_used: false,
    sources: [],
  };

  state.messages.push(message);
  renderMessages();

  const root = $('#messages');
  const element = root.lastElementChild;
  const content = $('.message-content', element);

  content.innerHTML = thinkingHtml('Thinking');

  return { msg: message, el: element, content };
}

async function consumeEventStream(response, streamTarget) {
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneMessage = null;
  let receivedToken = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let split;
    while ((split = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      const line = raw.split('\n').find(item => item.startsWith('data: '));
      if (!line) continue;

      const data = JSON.parse(line.slice(6));

      if (data.type === 'status') {
        if (!receivedToken) {
          streamTarget.content.innerHTML = thinkingHtml(data.text || 'Thinking');
        }
      } else if (data.type === 'token') {
        receivedToken = true;
        streamTarget.msg.content += data.text;
        streamTarget.content.innerHTML = renderMarkdown(streamTarget.msg.content);

        if (nearBottom()) scrollBottom(false);
      } else if (data.type === 'metrics') {
        Object.assign(streamTarget.msg, data);
      } else if (data.type === 'done') {
        doneMessage = data.message;
        Object.assign(streamTarget.msg, data.message);
        streamTarget.content.innerHTML = renderMarkdown(streamTarget.msg.content);
      } else if (data.type === 'error') {
        throw new Error(data.message || 'The local answer could not be completed.');
      }
    }
  }

  return doneMessage || streamTarget.msg;
}

function wantsAllProjectFiles(text = '') {
  const low = String(text).toLocaleLowerCase('tr-TR');
  return [
    'all files', 'all documents', 'all project files', 'entire project', 'whole project',
    'tüm dosyalar', 'tum dosyalar', 'bütün dosyalar', 'butun dosyalar',
    'tüm belgeler', 'tum belgeler', 'projedeki tüm dosyalar', 'projedeki tum dosyalar'
  ].some(phrase => low.includes(phrase));
}

function mentionedDocumentNames(text = '') {
  const low = String(text).toLocaleLowerCase('tr-TR');
  return (state.documents || [])
    .map(doc => doc.name)
    .filter(name => {
      const full = String(name).toLocaleLowerCase('tr-TR');
      const stem = full.replace(/\.[^.]+$/, '');
      return low.includes(full) || (stem.length >= 5 && low.includes(stem));
    });
}

function resolveMessageAttachments(text, effectiveFileAction, attachmentOverride) {
  if (Array.isArray(attachmentOverride)) return attachmentOverride;

  // Explicit file names in the question override the current attachment.
  const mentioned = mentionedDocumentNames(text);
  if (mentioned.length) return mentioned;

  // Project-wide retrieval only happens when the user explicitly asks for it.
  if (wantsAllProjectFiles(text)) return [];

  // Default ChatGPT-like behavior: continue with the most recently selected/uploaded file.
  if (state.activeFile?.name) return [state.activeFile.name];

  // If there is no persistent active file yet, use only the newest pending upload.
  if (state.uploads.length) return [state.uploads[state.uploads.length - 1].name];

  return [];
}

async function sendMessage(textOverride = null, fileActionOverride = null, attachmentOverride = null) {
  if (state.generating) return;

  const composer = $('#composer');
  let text = (textOverride ?? composer.value).trim();

  const effectiveFileAction = fileActionOverride || state.pendingFileAction;
  if (effectiveFileAction === 'ask_file' && !text) {
    toast('Type a question about the selected file first', 2800);
    composer.focus();
    return;
  }

  if (!text) {
    toast('Type a message or choose Summarize, Key Facts, Explain, or Ask File', 2600);
    composer.focus();
    return;
  }

  setGenerating(true);

  const attachments = resolveMessageAttachments(text, effectiveFileAction, attachmentOverride);

  state.messages.push({
    role: 'user',
    content: text,
    attachments,
  });

  renderMessages();

  composer.value = '';
  autoGrow();

  state.uploads = [];
  renderAttachments();
  updateFileContext();

  const target = createStreamingAssistant();
  try {
    const response = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: state.project,
        chat_id: state.chat,
        text,
        level: state.level,
        attachments,
        file_action: effectiveFileAction || null,
      }),
    });

    await consumeEventStream(response, target);
    await loadState(state.project, state.chat);
    if (effectiveFileAction === 'ask_file') {
      state.pendingFileAction = null;
      composer.placeholder = 'Message Local AI';
    }
  } catch (error) {
    target.msg.content = `Could not complete the local response: ${error.message}`;
    target.content.innerHTML = renderMarkdown(target.msg.content);
    toast(target.msg.content, 5000);
  } finally {
    setGenerating(false);
    composer.focus();
  }
}

function openTranslatePicker() {
  const languages = [
    'English', 'Turkish', 'German', 'French', 'Spanish', 'Italian',
    'Portuguese', 'Arabic', 'Russian', 'Chinese', 'Japanese', 'Korean',
  ];

  openModal(`
    <div class="preview-head">
      <div>
        <h3>Translate answer</h3>
        <small>Choose the target language.</small>
      </div>
      <button class="icon-btn" id="closeTranslatePicker" title="Close">×</button>
    </div>
    <div id="translateLanguageList" class="library-picker-list"></div>
  `);

  $('#closeTranslatePicker').onclick = closeModal;

  const root = $('#translateLanguageList');

  languages.forEach(language => {
    const button = document.createElement('button');
    button.className = 'library-picker-item';
    button.innerHTML = `
      <span class="file-type-badge">文</span>
      <span><strong>${esc(language)}</strong><small>Translate the latest answer</small></span>
      <span class="picker-plus">›</span>
    `;

    button.onclick = async () => {
      closeModal();
      await runAction('translate', language);
    };

    root.appendChild(button);
  });
}


async function runAction(action, targetLanguage = null) {
  if (state.generating) return;

  setGenerating(true);
  const target = createStreamingAssistant();

  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: state.project,
        chat_id: state.chat,
        action,
        level: state.level,
        target_language: targetLanguage,
      }),
    });

    await consumeEventStream(response, target);
    await loadState(state.project, state.chat);
  } catch (error) {
    state.messages.pop();
    renderMessages();
    toast(`Action failed: ${error.message}`, 5000);
  } finally {
    setGenerating(false);
  }
}


async function uploadFiles(
  files,
  attachToComposer = true,
  projectOverride = null,
) {
  if (!files.length) return;

  const targetProject = projectOverride || state.project;
  const form = new FormData();
  form.append('project', targetProject);

  [...files].forEach(file => form.append('files', file));

  toast('Uploading and reading file…', 1400);

  try {
    const data = await api('/api/upload', {
      method: 'POST',
      body: form,
    });

    if (attachToComposer && data.files.length) {
      const newest = data.files[data.files.length - 1];
      state.activeFile = newest;
      state.pendingFileAction = null;
      state.uploads = [newest];
      const composer = $('#composer');
      if (composer) composer.placeholder = 'Message Local AI';
    }

    if (targetProject === state.project) {
      await loadState(state.project, state.chat);
      renderAttachments();
    }

    if (data.ready_for_chat) {
      toast(`File ready · ${data.chunks || 0} text chunks`, 2400);
    } else if (data.indexed === false) {
      toast(data.index_error || 'The file could not be prepared.', 6000);
    } else {
      toast('File ready');
    }
  } catch (error) {
    toast(`Upload failed: ${error.message}`, 8000);
  }
}

function addFilesToProject(projectSlug) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.multiple = true;
  picker.accept = '.pdf,.docx,.txt';

  picker.onchange = async () => {
    if (!picker.files?.length) return;

    await uploadFiles(
      picker.files,
      false,
      projectSlug,
    );

    toast('Project files added');

    if (projectSlug === state.project) {
      renderLibrary();
    }

    picker.remove();
  };

  document.body.appendChild(picker);
  picker.click();
}


function renderAttachments() {
  const tray = $('#attachmentTray');
  tray.innerHTML = '';
  tray.classList.toggle('hidden', state.uploads.length === 0);

  state.uploads.forEach((file, index) => {
    const element = document.createElement('div');
    element.className = `attachment-chip ${file.kind === 'attachment' ? 'image-chip' : ''}`;

    const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();

    element.innerHTML = `
      <b>${esc(ext)}</b>
      <span>${esc(file.name)}</span>
      <button title="Remove" aria-label="Remove">×</button>
    `;

    $('button', element).onclick = () => {
      const removed = state.uploads[index];
      state.uploads.splice(index, 1);
      if (state.activeFile && removed && state.activeFile.name === removed.name) {
        state.activeFile = null;
        state.pendingFileAction = null;
      }
      renderAttachments();
      updateFileContext();
    };

    tray.appendChild(element);
  });
}

function updateFileContext() {
  const parts = [];
  const overview = projectOverview();

  if (state.documents.length) {
    parts.push(`${state.documents.length} indexed file${state.documents.length === 1 ? '' : 's'} · ${state.ragStats?.chunks || 0} chunks`);
  }
  if (state.activeFile) {
    parts.push(`Active: ${state.activeFile.name}`);
  }

  if (overview.context_ready) {
    parts.push('Project AI context ready');
  }

  $('#fileContext').textContent = parts.join(' · ');

  const badge = $('#projectContextBadge');
  if (badge) {
    badge.classList.toggle('hidden', !overview.context_ready);
    if (overview.context_ready) {
      $('b', badge).textContent = `Project context · ${overview.files} source${overview.files === 1 ? '' : 's'}`;
    }
  }

  const subtitle = $('#emptySubtitle');
  if (subtitle) {
    subtitle.textContent = overview.context_ready
      ? 'Ask normally — this project checks its indexed files automatically and shows sources when they are used.'
      : 'Ask anything, or add project files to create a private local knowledge workspace.';
  }
}


function openLibraryPicker() {
  if (!state.documents.length) {
    toast('Your Library is empty');
    return;
  }

  openModal(`
    <div class="preview-head">
      <div>
        <h3>Add from Library</h3>
        <small>Select a project document to use in your next message.</small>
      </div>
      <button class="icon-btn" id="closeLibraryPicker" title="Close">×</button>
    </div>
    <div id="libraryPickerList" class="library-picker-list"></div>
  `);

  $('#closeLibraryPicker').onclick = closeModal;

  const root = $('#libraryPickerList');

  state.documents.forEach(file => {
    const button = document.createElement('button');
    button.className = 'library-picker-item';

    const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();

    button.innerHTML = `
      <span class="file-type-badge">${esc(ext)}</span>
      <span><strong>${esc(file.name)}</strong><small>${(file.size / 1024).toFixed(1)} KB · Indexed</small></span>
      <span class="picker-plus">＋</span>
    `;

    button.onclick = () => {
      state.activeFile = {
        name: file.name,
        kind: 'document',
        mime: '',
        indexed: !!file.indexed,
        chunks: file.chunks || 0,
      };
      state.pendingFileAction = null;
      state.uploads = [state.activeFile];
      renderAttachments();
      updateFileContext();
      closeModal();
      $('#composer').focus();
    };

    root.appendChild(button);
  });
}

function renderTestResults(data) {
  const summary = $('#testSummary');
  const resultsRoot = $('#testResults');

  summary.classList.remove('hidden');
  summary.innerHTML = `
    <div>
      <span>Passed</span>
      <strong>${data.passed}/${data.total}</strong>
    </div>
    <div>
      <span>Pass rate</span>
      <strong>${Math.round(data.pass_rate * 100)}%</strong>
    </div>
    <div>
      <span>Total time</span>
      <strong>${Number(data.total_seconds || 0).toFixed(2)}s</strong>
    </div>
    <div>
      <span>Indexed chunks</span>
      <strong>${data.rag_stats?.chunks || 0}</strong>
    </div>
  `;

  resultsRoot.innerHTML = '';

  data.results.forEach(result => {
    const card = document.createElement('div');
    card.className = `evaluation-card ${result.passed ? 'pass' : 'fail'}`;

    const sourceText = (result.sources || [])
      .map(source => `${source.source}${source.page ? ` p.${source.page}` : ''} · ${Number(source.score).toFixed(3)}`)
      .join(' · ');

    card.innerHTML = `
      <div class="evaluation-head">
        <div>
          <strong>${esc(result.label)}</strong>
          <small>${esc(result.expected)} · similarity ${Number(result.best_similarity || 0).toFixed(3)}</small>
        </div>
        <span class="result-badge">${result.passed ? 'PASS' : 'CHECK'}</span>
      </div>

      ${result.question ? `<p class="test-question">${esc(result.question)}</p>` : ''}
      <p class="test-answer">${esc(result.answer || '')}</p>

      <div class="test-meta">
        Retrieval ${Number(result.retrieval_seconds || 0).toFixed(3)}s
        · Generation ${Number(result.generation_seconds || 0).toFixed(3)}s
        ${sourceText ? ` · ${esc(sourceText)}` : ''}
      </div>
    `;

    resultsRoot.appendChild(card);
  });
}


async function runEvaluation() {
  const answerable = $('#answerableQuestion').value.trim();
  const unanswerable = $('#unanswerableQuestion').value.trim();
  const threshold = Number($('#testThreshold').value || 0.35);

  if (!answerable || !unanswerable) {
    toast('Enter both test questions', 3500);
    return;
  }

  const button = $('#runTestsBtn');
  button.disabled = true;
  button.textContent = 'Running…';

  $('#testSummary').classList.add('hidden');
  $('#testResults').innerHTML = thinkingHtml('Running local evaluation');

  try {
    const data = await api('/api/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: state.project,
        answerable_question: answerable,
        unanswerable_question: unanswerable,
        threshold,
      }),
    });

    renderTestResults(data);
  } catch (error) {
    $('#testResults').innerHTML = '';
    toast(`Evaluation failed: ${error.message}`, 5000);
  } finally {
    button.disabled = false;
    button.textContent = 'Run evaluation';
  }
}


function toggleAttachMenu() {
  $('#attachMenu').classList.toggle('hidden');
  $('#levelMenu').classList.add('hidden');
}

function bind() {
  $('#newChatBtn').onclick = async () => {
    const form = new FormData();
    form.append('project', state.project);

    const chat = await api('/api/chat/new', {
      method: 'POST',
      body: form,
    });

    state.chat = chat.id;
    await loadState(state.project, chat.id);
    showView('chat');
  };

  $$('.nav-btn[data-view]').forEach(button => {
    button.onclick = () => showView(button.dataset.view);
  });

  $$('#experienceToggle button').forEach(button => {
    button.onclick = () => setExperience(button.dataset.value);
  });

  $$('#themeToggle button').forEach(button => {
    button.onclick = () => setTheme(button.dataset.value);
  });

  $('#levelBtn').onclick = event => {
    event.stopPropagation();
    $('#levelMenu').classList.toggle('hidden');
    $('#attachMenu').classList.add('hidden');
  };

  $$('#levelMenu [data-level]').forEach(button => {
    button.onclick = () => {
      setLevel(button.dataset.level);
      $('#levelMenu').classList.add('hidden');
    };
  });

  $('#attachBtn').onclick = event => {
    event.stopPropagation();
    toggleAttachMenu();
  };

  $('#uploadDeviceBtn').onclick = () => {
    $('#attachMenu').classList.add('hidden');
    $('#fileInput').click();
  };

  $('#addLibraryBtn').onclick = () => {
    $('#attachMenu').classList.add('hidden');
    openLibraryPicker();
  };

  $('#fileInput').onchange = async event => {
    await uploadFiles(event.target.files, true);
    event.target.value = '';
  };

  $('#libraryUploadBtn').onclick = () => $('#libraryInput').click();

  $('#libraryInput').onchange = async event => {
    await uploadFiles(event.target.files, false);
    event.target.value = '';
    renderLibrary();
  };

  document.addEventListener('click', event => {
    if (!event.target.closest('.level-menu-wrap')) {
      $('#levelMenu').classList.add('hidden');
    }

    if (!event.target.closest('.attach-menu-wrap')) {
      $('#attachMenu').classList.add('hidden');
    }

    $$('.action-menu').forEach(menu => {
      if (!menu.parentElement.contains(event.target)) {
        menu.classList.add('hidden');
      }
    });
  });

  $('#composer').addEventListener('input', autoGrow);

  $('#composer').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  $('#sendBtn').onclick = () => sendMessage();

  $('.starter-grid').addEventListener('click', async event => {
    const button = event.target.closest('[data-file-action]');
    if (!button) return;

    const action = button.dataset.fileAction;
    if (!state.activeFile) {
      toast('Attach a file first — no project file is auto-selected', 3200);
      $('#fileInput').click();
      return;
    }

    const prompts = {
      summarize: 'Summarize the attached document clearly, covering the main points.',
      key_facts: 'Extract the key facts from the attached document. Use concise bullets and preserve important names, numbers, and dates.',
      explain: 'Explain the attached document simply and clearly, including the important ideas I need to understand.',
    };

    if (action === 'ask_file') {
      state.pendingFileAction = 'ask_file';
      const composer = $('#composer');
      composer.value = '';
      composer.placeholder = `Ask a question about ${state.activeFile.name}…`;
      autoGrow();
      composer.focus();
      return;
    }

    state.pendingFileAction = null;
    await sendMessage(prompts[action], action, [state.activeFile.name]);
  });

  $('#createProjectBtn').onclick = () => {
    openModal(`
      <h3>New project</h3>
      <input id="projectName" placeholder="Project name" />
      <div class="modal-actions">
        <button class="secondary-btn" id="cancelModal">Cancel</button>
        <button class="primary-btn" id="confirmModal">Create</button>
      </div>
    `);

    $('#cancelModal').onclick = closeModal;

    $('#confirmModal').onclick = async () => {
      const name = $('#projectName').value.trim() || 'New Project';

      const project = await api('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      closeModal();
      await selectProject(project.slug);
    };

    $('#projectName').focus();
  };

  $('#runTestsBtn').onclick = runEvaluation;

  $('#reconnectBtn').onclick = async () => {
    toast('Reconnecting…', 1200);

    try {
      const data = await api('/api/runtime/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });

      renderStatus(data);
      toast(data.ready ? 'Foundry Local is ready' : 'Foundry Local is offline', 3000);
    } catch (error) {
      toast(error.message, 5000);
    }
  };

  $('#modalBackdrop').onclick = event => {
    if (event.target === $('#modalBackdrop')) closeModal();
  };
  $('#collapseBtn').onclick = () => {
    if (isMobileLayout()) {
      closeMobileSidebar();
    }
  };

  $('#sidebarEdgeBtn').onclick = toggleDesktopSidebar;

  $('#openSidebarBtn').onclick = () => {
    if (isMobileLayout()) {
      openMobileSidebar();
    }
  };

  $('#sidebarBackdrop').onclick = closeMobileSidebar;

  $('#messages').addEventListener('scroll', () => {
    $('#scrollBottomBtn').classList.toggle('hidden', nearBottom());
  });

  $('#scrollBottomBtn').onclick = () => scrollBottom();

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMobileSidebar();
      $('#levelMenu').classList.add('hidden');
      $('#attachMenu').classList.add('hidden');

      if (!$('#modalBackdrop').classList.contains('hidden')) {
        closeModal();
      }
    }
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-code]');
    if (!button) return;

    const code = $(
      `[data-code-id="${button.dataset.copyCode}"]`,
      button.parentElement
    );

    const copied = await copyText(code.textContent);
    toast(copied ? 'Code copied' : 'Copy failed');
  });

  let resizeTimer = null;
  const layoutMedia = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  const scheduleResponsiveSync = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!isMobileLayout()) state.mobileSidebarOpen = false;
      applySidebarState();
    }, 40);
  };

  window.addEventListener('resize', scheduleResponsiveSync);
  window.addEventListener('orientationchange', scheduleResponsiveSync);

  if (layoutMedia.addEventListener) {
    layoutMedia.addEventListener('change', () => {
      state.mobileSidebarOpen = false;
      applySidebarState();
    });
  }
}

async function warmupInBackground() {
  try {
    await fetch('/api/warmup', { method: 'POST' });
  } catch {
    // Silent by design: warm-up must never block the interface.
  }
}

async function init() {
  setTheme(state.theme);
  setExperience(state.experience);
  setLevel(state.level);
  bind();
  applySidebarState();

  try {
    await loadState();
  } catch (error) {
    toast(`Startup failed: ${error.message}`, 6000);
  }

  autoGrow();
  warmupInBackground();
}

init();
