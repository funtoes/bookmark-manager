// ---------- 工具函数 ----------
function flattenBookmarkTree(nodes, parentPath) {
  parentPath = parentPath || [];
  var result = [];
  nodes.forEach(function(node) {
    var isFolder = !!node.children;
    var flatNode = {
      id: node.id,
      title: node.title,
      url: node.url || null,
      isFolder: isFolder,
      parentPath: parentPath.slice(),
      depth: parentPath.length
    };
    result.push(flatNode);
    if (isFolder && node.children) {
      result = result.concat(flattenBookmarkTree(node.children, parentPath.concat([node.title])));
    }
  });
  return result;
}

var flatBookmarkList = [];

function getFlatNodeById(id) {
  return flatBookmarkList.find(function(n) { return n.id === id; });
}

// ---------- 书签数据模型 ----------
async function fetchBookmarkTree() {
  return new Promise(function(resolve) {
    chrome.bookmarks.getTree(function(tree) {
      resolve(tree[0].children || []);
    });
  });
}

// ---------- 树渲染 ----------
var bookmarkTreeData = [];

function renderTree(container, nodes, level) {
  level = level || 0;
  container.innerHTML = '';
  nodes.forEach(function(node) {
    var nodeEl = createNodeElement(node, level);
    container.appendChild(nodeEl);
  });
}

function createNodeElement(node, level) {
  var wrapper = document.createElement('div');
  wrapper.className = 'tree-node';
  wrapper.dataset.id = node.id;

  var header = document.createElement('div');
  header.className = 'tree-node-header';
  header.style.paddingLeft = (12 + level * 12) + 'px';

  // 复选框
  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox';
  checkbox.dataset.id = node.id;
  checkbox.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleNodeSelection(node.id);
  });
  header.appendChild(checkbox);

  var isFolder = !!node.children;
  if (isFolder) {
    var toggle = document.createElement('span');
    toggle.className = 'toggle-icon';
    toggle.textContent = '▶';
    toggle.dataset.expanded = 'false';
    header.appendChild(toggle);
  } else {
    var spacer = document.createElement('span');
    spacer.className = 'toggle-icon';
    spacer.textContent = ' ';
    header.appendChild(spacer);
  }

  var icon = document.createElement('span');
  icon.className = 'node-icon';
  icon.textContent = isFolder ? '📁' : '🔖';
  header.appendChild(icon);

  // 拖拽手柄
  var dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.textContent = '⋮⋮';
  dragHandle.draggable = true;
  header.appendChild(dragHandle);

  var title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = node.title || '(无标题)';
  title.title = node.title || '';
  header.appendChild(title);

  if (isFolder && node.children) {
    var count = document.createElement('span');
    count.className = 'node-count';
    count.textContent = node.children.length;
    header.appendChild(count);
  }

  header.addEventListener('click', async function(e) {
    if (e.target.classList.contains('checkbox')) return;
    if (e.target.classList.contains('drag-handle')) return;
    e.stopPropagation();
    if (isFolder) {
      await selectNode(wrapper, node);
      toggleFolder(wrapper);
    } else {
      if (batchMode) {
        toggleNodeSelection(node.id);
      } else {
        await selectNode(wrapper, node);
        showBookmarkDetail(node);
      }
    }
  });

  wrapper.appendChild(header);

  if (isFolder && node.children) {
    var childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'none';
    node.children.forEach(function(child) {
      var childEl = createNodeElement(child, level + 1);
      childrenContainer.appendChild(childEl);
    });
    wrapper.appendChild(childrenContainer);
  }

  return wrapper;
}

function toggleFolder(wrapper) {
  var toggle = wrapper.querySelector('.toggle-icon');
  var childrenContainer = wrapper.querySelector('.tree-children');
  if (!childrenContainer) return;

  var isExpanded = toggle.dataset.expanded === 'true';
  if (isExpanded) {
    childrenContainer.style.display = 'none';
    toggle.textContent = '▶';
    toggle.dataset.expanded = 'false';
  } else {
    childrenContainer.style.display = 'block';
    toggle.textContent = '▼';
    toggle.dataset.expanded = 'true';
  }
}

var selectedNodeEl = null;
var selectedNodeData = null;

async function selectNode(wrapper, node) {
  if (selectedNodeEl) {
    var prevHeader = selectedNodeEl.querySelector('.tree-node-header');
    if (prevHeader) prevHeader.classList.remove('selected');
  }
  var header = wrapper.querySelector('.tree-node-header');
  if (header) {
    header.classList.add('selected');
    selectedNodeEl = wrapper;

    // 递归获取完整子树
    async function getFullSubTree(nodeId) {
      var results = await new Promise(function(resolve) {
        chrome.bookmarks.getSubTree(nodeId, function(result) {
          resolve(result);
        });
      });
      return results[0];
    }

    try {
      selectedNodeData = await getFullSubTree(node.id);
      console.log('选中节点:', selectedNodeData.title, '后代书签数:', countBookmarks(selectedNodeData));
    } catch (e) {
      console.error('获取节点失败:', e);
      selectedNodeData = node;
    }
  }
}

function countBookmarks(node) {
  if (!node) return 0;
  if (node.url) return 1;
  if (!node.children) return 0;
  var count = 0;
  for (var i = 0; i < node.children.length; i++) {
    count += countBookmarks(node.children[i]);
  }
  return count;
}

// ---------- 全部展开/折叠 ----------
function initExpandCollapseButtons() {
  var expandAllBtn = document.getElementById('expandAllBtn');
  var collapseAllBtn = document.getElementById('collapseAllBtn');

  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', function() {
      console.log('全部展开');
      document.querySelectorAll('.tree-children').forEach(function(el) {
        el.style.display = 'block';
        var parent = el.parentElement;
        var toggle = parent ? parent.querySelector('.toggle-icon') : null;
        if (toggle && toggle.dataset.expanded !== undefined) {
          toggle.textContent = '▼';
          toggle.dataset.expanded = 'true';
        }
      });
    });
  }

  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', function() {
      console.log('全部折叠');
      document.querySelectorAll('.tree-children').forEach(function(el) {
        el.style.display = 'none';
        var parent = el.parentElement;
        var toggle = parent ? parent.querySelector('.toggle-icon') : null;
        if (toggle && toggle.dataset.expanded !== undefined) {
          toggle.textContent = '▶';
          toggle.dataset.expanded = 'false';
        }
      });
    });
  }
}

// ---------- 批量选择状态 ----------
var batchMode = false;
var selectedNodes = new Set();

function enterBatchMode() {
  batchMode = true;
  document.querySelectorAll('.tree-node-header').forEach(function(header) {
    header.classList.add('show-checkbox');
  });
  var batchToolbar = document.getElementById('batchToolbar');
  if (batchToolbar) batchToolbar.classList.remove('hidden');
}

function exitBatchMode() {
  batchMode = false;
  selectedNodes.clear();
  document.querySelectorAll('.tree-node-header').forEach(function(header) {
    header.classList.remove('show-checkbox', 'selected-for-delete');
    var cb = header.querySelector('.checkbox');
    if (cb) cb.checked = false;
  });
  var batchToolbar = document.getElementById('batchToolbar');
  if (batchToolbar) batchToolbar.classList.add('hidden');
  updateBatchCount();
}

function toggleNodeSelection(nodeId) {
  if (selectedNodes.has(nodeId)) {
    selectedNodes.delete(nodeId);
    var header = document.querySelector('.tree-node[data-id="' + nodeId + '"] .tree-node-header');
    if (header) {
      header.classList.remove('selected-for-delete');
      var cb = header.querySelector('.checkbox');
      if (cb) cb.checked = false;
    }
  } else {
    selectedNodes.add(nodeId);
    var header = document.querySelector('.tree-node[data-id="' + nodeId + '"] .tree-node-header');
    if (header) {
      header.classList.add('selected-for-delete');
      var cb = header.querySelector('.checkbox');
      if (cb) cb.checked = true;
    }
  }
  updateBatchCount();
  if (!batchMode && selectedNodes.size > 0) {
    enterBatchMode();
  }
  if (batchMode && selectedNodes.size === 0) {
    exitBatchMode();
  }
}

function updateBatchCount() {
  var countEl = document.getElementById('selectedCount');
  if (countEl) {
    countEl.textContent = selectedNodes.size;
  }
}

function selectAll() {
  flatBookmarkList.forEach(function(node) {
    if (!node.isFolder && !selectedNodes.has(node.id)) {
      selectedNodes.add(node.id);
      var header = document.querySelector('.tree-node[data-id="' + node.id + '"] .tree-node-header');
      if (header) {
        header.classList.add('selected-for-delete');
        var cb = header.querySelector('.checkbox');
        if (cb) cb.checked = true;
      }
    }
  });
  updateBatchCount();
  if (!batchMode) enterBatchMode();
}

function deselectAll() {
  selectedNodes.clear();
  document.querySelectorAll('.tree-node-header.selected-for-delete').forEach(function(header) {
    header.classList.remove('selected-for-delete');
    var cb = header.querySelector('.checkbox');
    if (cb) cb.checked = false;
  });
  updateBatchCount();
  exitBatchMode();
}

async function batchDelete() {
  if (selectedNodes.size === 0) return;
  var count = selectedNodes.size;
  if (!confirm('确定要删除选中的 ' + count + ' 个书签吗？此操作不可撤销。')) return;

  var ids = Array.from(selectedNodes);
  var deleted = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      await new Promise(function(resolve, reject) {
        chrome.bookmarks.remove(ids[i], function() {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      deleted++;
    } catch (e) {
      console.error('删除书签失败:', ids[i], e);
    }
  }

  bookmarkTreeData = await fetchBookmarkTree();
  flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
  renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
  bindDragEvents();
  exitBatchMode();
  document.getElementById('contentArea').innerHTML =
    '<p class="placeholder">已成功删除 ' + deleted + ' 个书签。</p>';

  if (deleted < ids.length) {
    alert('部分书签删除失败，已删除 ' + deleted + '/' + ids.length + ' 个。');
  }
}

function initBatchButtons() {
  var selectAllBtn = document.getElementById('selectAllBtn');
  var deselectAllBtn = document.getElementById('deselectAllBtn');
  var batchDeleteBtn = document.getElementById('batchDeleteBtn');

  if (selectAllBtn) selectAllBtn.addEventListener('click', selectAll);
  if (deselectAllBtn) deselectAllBtn.addEventListener('click', deselectAll);
  if (batchDeleteBtn) batchDeleteBtn.addEventListener('click', batchDelete);
}

// 键盘快捷键
document.addEventListener('keydown', function(e) {
  if (e.key === 'Delete' && batchMode && selectedNodes.size > 0) {
    e.preventDefault();
    batchDelete();
  }
  if (e.key === 'Escape' && batchMode) {
    e.preventDefault();
    exitBatchMode();
  }
});

// ---------- 主内容区：书签详情 ----------
function showBookmarkDetail(node) {
  var contentArea = document.getElementById('contentArea');
  if (!contentArea) return;

  var flatNode = getFlatNodeById(node.id);
  var pathStr = flatNode ? flatNode.parentPath.join(' > ') : '';

  contentArea.innerHTML =
    '<div class="detail-card">' +
    '<h2>🔖 ' + escapeHtml(node.title || '(无标题)') + '</h2>' +
    '<div class="detail-field"><label>路径：</label><span>' + escapeHtml(pathStr || '根目录') + '</span></div>' +
    '<div class="detail-field"><label>URL：</label><a href="' + escapeHtml(node.url || '') + '" target="_blank" class="detail-url">' + escapeHtml(node.url || '无') + '</a></div>' +
    '<div class="detail-actions">' +
    '<button id="openBookmarkBtn" class="btn-primary">🌐 打开链接</button>' +
    '<button id="deleteBookmarkBtn" class="btn-danger">🗑️ 删除此书签</button>' +
    '</div></div>';

  var openBtn = document.getElementById('openBookmarkBtn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      if (node.url) chrome.tabs.create({ url: node.url });
    });
  }

  var deleteBtn = document.getElementById('deleteBookmarkBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async function() {
      if (confirm('确定要删除书签「' + node.title + '」吗？')) {
        await new Promise(function(resolve) {
          chrome.bookmarks.remove(node.id, resolve);
        });
        bookmarkTreeData = await fetchBookmarkTree();
        flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
        renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
        bindDragEvents();
        document.getElementById('contentArea').innerHTML =
          '<p class="placeholder">请在左侧选择书签或使用搜索功能。</p>';
      }
    });
  }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 全局搜索 ----------
var searchInput = document.getElementById('globalSearchInput');
var searchResults = [];

if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    var query = e.target.value.trim().toLowerCase();
    if (!query) {
      searchResults = [];
      document.getElementById('contentArea').innerHTML =
        '<p class="placeholder">请在左侧选择书签或使用搜索功能。</p>';
      resetTreeVisibility();
      return;
    }

    searchResults = flatBookmarkList.filter(function(n) {
      return !n.isFolder &&
        (n.title.toLowerCase().includes(query) ||
         (n.url && n.url.toLowerCase().includes(query)));
    });

    filterTreeBySearch(query);
    showSearchResults(query, searchResults);
  });
}

function filterTreeBySearch(query) {
  document.querySelectorAll('.tree-node').forEach(function(nodeEl) {
    var id = nodeEl.dataset.id;
    var flatNode = flatBookmarkList.find(function(n) { return n.id === id; });
    if (!flatNode) { nodeEl.style.display = ''; return; }
    if (flatNode.isFolder) {
      nodeEl.style.display = '';
    } else {
      var match = flatNode.title.toLowerCase().includes(query) ||
                  (flatNode.url && flatNode.url.toLowerCase().includes(query));
      nodeEl.style.display = match ? '' : 'none';
    }
  });
}

function resetTreeVisibility() {
  document.querySelectorAll('.tree-node').forEach(function(el) { el.style.display = ''; });
}

function showSearchResults(query, results) {
  var contentArea = document.getElementById('contentArea');
  if (!contentArea) return;

  if (results.length === 0) {
    contentArea.innerHTML = '<p class="placeholder">未找到与「' + escapeHtml(query) + '」匹配的书签。</p>';
    return;
  }

  var html = '<div class="search-results"><h3>🔍 搜索「' + escapeHtml(query) + '」共 ' + results.length + ' 条结果</h3><ul class="result-list">';

  results.forEach(function(node) {
    html +=
      '<li class="result-item" data-id="' + node.id + '">' +
      '<input type="checkbox" class="result-checkbox" data-id="' + node.id + '" ' + (selectedNodes.has(node.id) ? 'checked' : '') + '>' +
      '<span class="result-icon">🔖</span>' +
      '<div class="result-info">' +
      '<div class="result-title">' + highlightMatch(node.title, query) + '</div>' +
      '<div class="result-url">' + highlightMatch(node.url || '', query) + '</div>' +
      '</div>' +
      '<div class="result-path">' + (node.parentPath.join(' > ') || '根目录') + '</div>' +
      '<div class="result-actions">' +
      '<button class="btn-small btn-primary go-to-bookmark" data-id="' + node.id + '">定位</button>' +
      '<button class="btn-small btn-danger delete-result" data-id="' + node.id + '">删除</button>' +
      '</div></li>';
  });

  html += '</ul></div>';
  contentArea.innerHTML = html;

  bindResultEvents(contentArea);
}

function highlightMatch(text, query) {
  if (!query || !text) return escapeHtml(text);
  var escaped = escapeHtml(text);
  var regex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locateNodeInTree(id) {
  var flatNode = getFlatNodeById(id);
  if (!flatNode) return;
  var ancestorIds = [];
  function findAncestors(nodes, targetId, pathIds) {
    pathIds = pathIds || [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.id === targetId) { ancestorIds = pathIds.slice(); return true; }
      if (node.children && findAncestors(node.children, targetId, pathIds.concat([node.id]))) return true;
    }
    return false;
  }
  findAncestors(bookmarkTreeData, id);
  ancestorIds.forEach(function(aid) {
    var el = document.querySelector('.tree-node[data-id="' + aid + '"]');
    if (el) {
      var toggle = el.querySelector('.toggle-icon');
      var childrenContainer = el.querySelector('.tree-children');
      if (toggle && toggle.dataset.expanded === 'false' && childrenContainer) {
        childrenContainer.style.display = 'block';
        toggle.textContent = '▼';
        toggle.dataset.expanded = 'true';
      }
    }
  });
  setTimeout(function() {
    var targetEl = document.querySelector('.tree-node[data-id="' + id + '"]');
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var header = targetEl.querySelector('.tree-node-header');
      if (header) {
        if (selectedNodeEl) {
          var prevHeader = selectedNodeEl.querySelector('.tree-node-header');
          if (prevHeader) prevHeader.classList.remove('selected');
        }
        header.classList.add('selected');
        selectedNodeEl = targetEl;
        chrome.bookmarks.get(id, function(results) {
          if (results[0]) showBookmarkDetail(results[0]);
        });
      }
    }
  }, 100);
}

function bindResultEvents(container) {
  container.querySelectorAll('.result-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      e.stopPropagation();
      toggleNodeSelection(e.target.dataset.id);
    });
  });

  container.querySelectorAll('.go-to-bookmark').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      locateNodeInTree(e.target.dataset.id);
    });
  });

  container.querySelectorAll('.delete-result').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      var id = e.target.dataset.id;
      var node = getFlatNodeById(id);
      if (node && confirm('确定要删除书签「' + node.title + '」吗？')) {
        await new Promise(function(resolve) {
          chrome.bookmarks.remove(id, resolve);
        });
        bookmarkTreeData = await fetchBookmarkTree();
        flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
        renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
        bindDragEvents();
        var query = searchInput.value.trim().toLowerCase();
        if (query) {
          searchResults = flatBookmarkList.filter(function(n) {
            return !n.isFolder &&
              (n.title.toLowerCase().includes(query) ||
               (n.url && n.url.toLowerCase().includes(query)));
          });
          showSearchResults(query, searchResults);
        }
      }
    });
  });
}

// 保存并恢复展开状态
function saveExpandedState() {
  var expandedIds = [];
  document.querySelectorAll('.toggle-icon[data-expanded="true"]').forEach(function(toggle) {
    var nodeEl = toggle.closest('.tree-node');
    if (nodeEl && nodeEl.dataset.id) {
      expandedIds.push(nodeEl.dataset.id);
    }
  });
  return expandedIds;
}

function restoreExpandedState(expandedIds) {
  expandedIds.forEach(function(id) {
    var nodeEl = document.querySelector('.tree-node[data-id="' + id + '"]');
    if (nodeEl) {
      var toggle = nodeEl.querySelector('.toggle-icon');
      var childrenContainer = nodeEl.querySelector('.tree-children');
      if (toggle && childrenContainer) {
        toggle.textContent = '▼';
        toggle.dataset.expanded = 'true';
        childrenContainer.style.display = 'block';
      }
    }
  });
}

async function refreshTree() {
  try {
    // 保存展开状态
    var expandedIds = saveExpandedState();
    
    // 重新加载数据
    bookmarkTreeData = await fetchBookmarkTree();
    flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
    
    // 重新渲染
    renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
    bindDragEvents();
    
    // 恢复展开状态
    setTimeout(function() {
      restoreExpandedState(expandedIds);
    }, 50);
  } catch (err) {
    console.error('刷新树失败:', err);
  }
}

// ---------- 拖拽排序 ----------
var draggedNodeId = null;
var draggedNodeEl = null;
var dropTargetEl = null;
var dropPosition = null;

function bindDragEvents() {
  var treeContainer = document.getElementById('bookmarkTree');
  if (!treeContainer) return;

  treeContainer.addEventListener('dragstart', function(e) {
    var header = e.target.closest('.tree-node-header');
    if (!header) return;

    var nodeEl = header.closest('.tree-node');
    if (!nodeEl) return;

    if (!e.target.classList.contains('drag-handle')) {
      e.preventDefault();
      return;
    }

    draggedNodeId = nodeEl.dataset.id;
    draggedNodeEl = nodeEl;
    nodeEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedNodeId);
    setTimeout(function() {
      if (nodeEl.classList.contains('dragging')) {
        nodeEl.style.opacity = '0.4';
      }
    }, 0);
  });

  treeContainer.addEventListener('dragend', function(e) {
    if (draggedNodeEl) {
      draggedNodeEl.classList.remove('dragging');
      draggedNodeEl.style.opacity = '';
    }
    document.querySelectorAll('.tree-node').forEach(function(el) {
      el.style.borderTop = '';
      el.style.borderBottom = '';
      el.classList.remove('drag-over-folder');
    });
    // 注意：这里不清空 draggedNodeId 等变量，因为 drop 事件中已经保存到局部变量
  });

  treeContainer.addEventListener('dragover', function(e) {
    e.preventDefault();
    if (!draggedNodeId) return;

    e.dataTransfer.dropEffect = 'move';

    document.querySelectorAll('.tree-node').forEach(function(el) {
      el.style.borderTop = '';
      el.style.borderBottom = '';
      el.classList.remove('drag-over-folder');
    });

    var nodeEl = e.target.closest('.tree-node');
    if (!nodeEl || nodeEl.dataset.id === draggedNodeId) return;
    if (isDescendant(draggedNodeId, nodeEl.dataset.id)) return;

    var header = nodeEl.querySelector('.tree-node-header');
    if (!header) return;

    var rect = header.getBoundingClientRect();
    var y = e.clientY;
    var height = rect.height;
    var relativeY = y - rect.top;

    var flatNode = getFlatNodeById(nodeEl.dataset.id);
    var isFolder = flatNode && flatNode.isFolder;

    if (isFolder) {
      if (relativeY < height * 0.25) {
        dropPosition = 'before';
        nodeEl.style.borderTop = '3px solid #6366f1';
      } else if (relativeY > height * 0.75) {
        dropPosition = 'after';
        nodeEl.style.borderBottom = '3px solid #6366f1';
      } else {
        dropPosition = 'inside';
        nodeEl.classList.add('drag-over-folder');
      }
    } else {
      if (relativeY < height * 0.5) {
        dropPosition = 'before';
        nodeEl.style.borderTop = '3px solid #6366f1';
      } else {
        dropPosition = 'after';
        nodeEl.style.borderBottom = '3px solid #6366f1';
      }
    }
    dropTargetEl = nodeEl;
  });

  treeContainer.addEventListener('drop', async function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedNodeId || !dropTargetEl) return;

    var targetId = dropTargetEl.dataset.id;
    if (draggedNodeId === targetId) return;

    var targetFlat = getFlatNodeById(targetId);
    if (!targetFlat) return;

    // 清理指示器
    document.querySelectorAll('.tree-node').forEach(function(el) {
      el.style.borderTop = '';
      el.style.borderBottom = '';
      el.classList.remove('drag-over-folder');
    });

    // 保存拖拽状态
    var moveDraggedId = draggedNodeId;
    var moveTargetId = targetId;
    var movePosition = dropPosition;

    // 清理全局变量
    draggedNodeId = null;
    draggedNodeEl = null;
    dropTargetEl = null;
    dropPosition = null;

    console.log('=== 开始拖拽移动 ===');
    console.log('被拖拽节点ID:', moveDraggedId);
    console.log('目标节点ID:', moveTargetId);
    console.log('放置位置:', movePosition);

    if (movePosition === 'inside' && targetFlat.isFolder) {
      console.log('操作: 移入文件夹内部');
      chrome.bookmarks.move(moveDraggedId, { parentId: moveTargetId }, function(result) {
        if (chrome.runtime.lastError) {
          console.error('移动失败:', chrome.runtime.lastError.message);
        } else {
          console.log('移动成功');
        }
        refreshTree();
      });
      return;
    }

    // 先获取被拖拽节点和目标节点的信息
    chrome.bookmarks.get([moveDraggedId, moveTargetId], function(results) {
      if (chrome.runtime.lastError || !results || results.length < 2) {
        console.error('获取节点信息失败');
        refreshTree();
        return;
      }

      var draggedNode = results[0];
      var targetNode = results[1];

      console.log('被拖拽节点:', draggedNode.title, '父节点ID:', draggedNode.parentId);
      console.log('目标节点:', targetNode.title, '父节点ID:', targetNode.parentId);

      // 如果不在同一父节点下，先移到目标父节点末尾
      if (draggedNode.parentId !== targetNode.parentId) {
        console.log('不同父节点，先移到目标父节点末尾');
        chrome.bookmarks.move(moveDraggedId, { parentId: targetNode.parentId }, function() {
          if (chrome.runtime.lastError) {
            console.error('移到目标父节点失败:', chrome.runtime.lastError.message);
            refreshTree();
            return;
          }
          // 现在在同一父节点下了，重新计算索引
          moveToIndex(moveDraggedId, moveTargetId, movePosition);
        });
      } else {
        // 已经在同一父节点下，直接计算索引
        console.log('已在同一父节点下');
        moveToIndex(moveDraggedId, moveTargetId, movePosition);
      }
    });

    function moveToIndex(draggedId, targetId, position) {
      console.log('=== 计算索引并移动 ===');

      chrome.bookmarks.get([targetId], function(results) {
        if (!results || !results[0]) {
          refreshTree();
          return;
        }
        var parentId = results[0].parentId;

        // 第一步：先移到目标父节点末尾
        chrome.bookmarks.move(draggedId, { parentId: parentId }, function() {
          if (chrome.runtime.lastError) {
            console.error('第一步移动失败:', chrome.runtime.lastError.message);
            refreshTree();
            return;
          }

          // 第二步：获取最新兄弟列表，重新计算索引
          chrome.bookmarks.getChildren(parentId, function(siblings) {
            if (chrome.runtime.lastError) {
              console.error('获取兄弟节点失败');
              refreshTree();
              return;
            }

            siblings = siblings || [];
            console.log('第一步移动后，兄弟节点列表:');
            siblings.forEach(function(s, i) {
              console.log('  [' + i + '] ' + s.title + ' (id=' + s.id + ')');
            });

            // 找到目标节点和拖拽节点的新索引
            var newTargetIndex = -1;
            var newDraggedIndex = -1;
            for (var i = 0; i < siblings.length; i++) {
              if (siblings[i].id === targetId) newTargetIndex = i;
              if (siblings[i].id === draggedId) newDraggedIndex = i;
            }

            console.log('目标节点新索引:', newTargetIndex);
            console.log('拖拽节点新索引:', newDraggedIndex);

            // 计算最终索引
            var finalIndex;
            if (position === 'before') {
              finalIndex = newTargetIndex;
            } else {
              finalIndex = newTargetIndex + 1;
            }

            console.log('计算最终索引:', finalIndex);

            // 如果位置已经正确，跳过
            if (newDraggedIndex === finalIndex) {
              console.log('位置已正确，跳过');
              refreshTree();
              return;
            }

            console.log('第二步移动: index=' + finalIndex);

            chrome.bookmarks.move(draggedId, { index: finalIndex }, function(result) {
              if (chrome.runtime.lastError) {
                console.error('第二步移动失败:', chrome.runtime.lastError.message);
              } else {
                console.log('移动成功！');
              }
              refreshTree();
            });
          });
        });
      });
    }
  });
}

function isDescendant(nodeId, ancestorId) {
  var ancestors = [];
  function findAncestors(nodes, targetId, pathIds) {
    pathIds = pathIds || [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.id === targetId) { ancestors = pathIds.slice(); return true; }
      if (node.children && findAncestors(node.children, targetId, pathIds.concat([node.id]))) return true;
    }
    return false;
  }
  findAncestors(bookmarkTreeData, nodeId);
  return ancestors.includes(ancestorId);
}

// ---------- 智能排序 ----------
var currentSortConfig = { type: 'default', scope: 'all' };
var currentSortCounts = {};

async function getBookmarkVisitCounts(bookmarkIds) {
  var counts = {};
  var flatNodes = flatBookmarkList.filter(function(n) { return !n.isFolder && n.url; });
  var sampleNodes = flatNodes.slice(0, 100);

  for (var i = 0; i < sampleNodes.length; i++) {
    var node = sampleNodes[i];
    if (!node.url) continue;
    try {
      var visits = await new Promise(function(resolve) {
        chrome.history.getVisits({ url: node.url }, function(results) {
          resolve(results || []);
        });
      });
      counts[node.id] = visits.length;
    } catch (e) {
      counts[node.id] = 0;
    }
  }
  return counts;
}

function sortByAlphabetical(bookmarkIds) {
  return bookmarkIds.slice().sort(function(a, b) {
    var nodeA = getFlatNodeById(a);
    var nodeB = getFlatNodeById(b);
    return (nodeA ? nodeA.title : '').localeCompare(nodeB ? nodeB.title : '');
  });
}

function getBookmarkIdsByScope(scope) {
  if (scope === 'all') {
    return flatBookmarkList.filter(function(n) { return !n.isFolder; }).map(function(n) { return n.id; });
  } else if (scope === 'selected' && selectedNodeData) {
    var ids = [];

    function collectIds(node) {
      if (!node) return;
      if (node.children && node.children.length > 0) {
        for (var i = 0; i < node.children.length; i++) {
          collectIds(node.children[i]);
        }
      } else if (node.url) {
        ids.push(node.id);
      }
    }

    console.log('selectedNodeData:', selectedNodeData.title);
    collectIds(selectedNodeData);
    console.log('收集到的书签数:', ids.length);

    return ids;
  }
  return [];
}

async function applySort() {
  var sortSelect = document.getElementById('sortSelect');
  var sortScope = document.getElementById('sortScope');

  if (!sortSelect || !sortScope) return;

  var sortType = sortSelect.value;
  var sortScopeValue = sortScope.value;
  currentSortConfig = { type: sortType, scope: sortScopeValue };

  var bookmarkIds = getBookmarkIdsByScope(sortScopeValue);

  if (bookmarkIds.length === 0) {
    document.getElementById('contentArea').innerHTML =
      '<p class="placeholder">没有可排序的书签。<br><small>提示：选择"当前选中文件夹"时，请先在左侧点击一个文件夹。</small></p>';
    return;
  }

  var sortedIds;
  var extraInfo = '';

  if (sortType === 'frequent') {
    showSyncToast('正在统计访问次数...');
    var counts = await getBookmarkVisitCounts(bookmarkIds);
    currentSortCounts = counts;
    sortedIds = bookmarkIds.slice().sort(function(a, b) {
      return (counts[b] || 0) - (counts[a] || 0);
    });
    extraInfo = '（按访问次数排序）';
  } else if (sortType === 'recent') {
    var bookmarks = await new Promise(function(resolve) {
      chrome.bookmarks.get(bookmarkIds.slice(0, 200), function(results) {
        resolve(results || []);
      });
    });
    var dateMap = {};
    bookmarks.forEach(function(b) { dateMap[b.id] = b.dateAdded || 0; });
    sortedIds = bookmarkIds.slice().sort(function(a, b) {
      return (dateMap[b] || 0) - (dateMap[a] || 0);
    });
    extraInfo = '（按添加时间排序）';
  } else if (sortType === 'alphabetical') {
    sortedIds = sortByAlphabetical(bookmarkIds);
    extraInfo = '（按字母顺序排序）';
  } else {
    sortedIds = bookmarkIds.slice();
    extraInfo = '（树形结构原始顺序）';
  }

  showSortedResults(sortedIds, sortType, extraInfo, currentSortCounts);
}

function showSortedResults(sortedIds, sortType, extraInfo, visitCounts) {
  currentSortCounts = visitCounts || {};
  var contentArea = document.getElementById('contentArea');
  if (!contentArea) return;

  var nodes = sortedIds
    .map(function(id) { return getFlatNodeById(id); })
    .filter(Boolean)
    .slice(0, 200);

  if (nodes.length === 0) {
    contentArea.innerHTML = '<p class="placeholder">没有找到书签。</p>';
    return;
  }

  var scopeLabel = currentSortConfig.scope === 'selected' ? '当前文件夹' : '所有书签';
  var html = '<div class="sorted-results"><h3>📊 ' + getSortTypeLabel(sortType) + ' ' + extraInfo + ' — ' + scopeLabel + ' (共 ' + nodes.length + ' 条)</h3><ul class="result-list">';

  nodes.forEach(function(node) {
    var statHtml = '';
    if (sortType === 'frequent') {
      statHtml = '<span class="sort-stat">访问 ' + (visitCounts[node.id] || 0) + ' 次</span>';
    }

    html +=
      '<li class="result-item" data-id="' + node.id + '">' +
      '<input type="checkbox" class="result-checkbox" data-id="' + node.id + '" ' + (selectedNodes.has(node.id) ? 'checked' : '') + '>' +
      '<span class="result-icon">🔖</span>' +
      '<div class="result-info">' +
      '<div class="result-title">' + escapeHtml(node.title) + ' ' + statHtml + '</div>' +
      '<div class="result-url">' + escapeHtml(node.url || '') + '</div>' +
      '</div>' +
      '<div class="result-path">' + (node.parentPath.join(' > ') || '根目录') + '</div>' +
      '<div class="result-actions">' +
      '<button class="btn-small btn-primary go-to-bookmark" data-id="' + node.id + '">定位</button>' +
      '<button class="btn-small btn-danger delete-result" data-id="' + node.id + '">删除</button>' +
      '</div></li>';
  });

  html += '</ul></div>';
  contentArea.innerHTML = html;

  bindResultEvents(contentArea);
}

function getSortTypeLabel(type) {
  var labels = {
    'frequent': '使用频率排序',
    'recent': '最近添加排序',
    'alphabetical': '字母顺序排序',
    'default': '默认顺序'
  };
  return labels[type] || '排序';
}

function initSortButton() {
  var applySortBtn = document.getElementById('applySortBtn');
  if (applySortBtn) applySortBtn.addEventListener('click', applySort);
}

// ---------- 重复书签检测 ----------
var duplicateGroups = [];
var keepItems = new Set();
var currentMatchType = 'url';  // 新增：记录当前匹配类型

async function detectDuplicates(matchType) {
  // 如果没有传入 matchType，从 DOM 中获取
  if (!matchType) {
    var checkedRadio = document.querySelector('input[name="duplicateMatchType"]:checked');
    matchType = checkedRadio ? checkedRadio.value : 'url';
  }
  
  // 保存当前匹配类型
  currentMatchType = matchType;

  var contentArea = document.getElementById('contentArea');
  if (!contentArea) return;

  contentArea.innerHTML = '<p class="placeholder">正在检测重复书签...</p>';

  // 等待 DOM 更新
  await new Promise(function(resolve) { setTimeout(resolve, 100); });

  var allBookmarks = flatBookmarkList.filter(function(n) { return !n.isFolder && n.url; });

  duplicateGroups = [];
  keepItems.clear();

  if (matchType === 'url') {
    var urlMap = new Map();
    allBookmarks.forEach(function(node) {
      var normalizedUrl = normalizeUrl(node.url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      urlMap.get(normalizedUrl).push(node);
    });
    urlMap.forEach(function(nodes) {
      if (nodes.length > 1) {
        duplicateGroups.push(nodes);
      }
    });
    await enrichWithDateAdded(duplicateGroups);
  } else {
    var processed = new Set();
    for (var i = 0; i < allBookmarks.length; i++) {
      if (processed.has(allBookmarks[i].id)) continue;
      var group = [allBookmarks[i]];
      processed.add(allBookmarks[i].id);
      for (var j = i + 1; j < allBookmarks.length; j++) {
        if (processed.has(allBookmarks[j].id)) continue;
        var similarity = calculateTitleSimilarity(
          allBookmarks[i].title.toLowerCase(),
          allBookmarks[j].title.toLowerCase()
        );
        if (similarity >= 0.8) {
          group.push(allBookmarks[j]);
          processed.add(allBookmarks[j].id);
        }
      }
      if (group.length > 1) {
        duplicateGroups.push(group);
      }
    }
    await enrichWithDateAdded(duplicateGroups);
  }

  duplicateGroups.forEach(function(group) {
    group.sort(function(a, b) { return (a._dateAdded || 0) - (b._dateAdded || 0); });
  });

  renderDuplicatesPanel();
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    var u = url.trim().toLowerCase();
    u = u.replace(/^https?:\/\//, '');
    u = u.replace(/^www\./, '');
    u = u.replace(/\/+$/, '');
    return u;
  } catch (e) {
    return url.trim().toLowerCase();
  }
}

function calculateTitleSimilarity(str1, str2) {
  var len1 = str1.length;
  var len2 = str2.length;
  if (len1 === 0 || len2 === 0) return 0;

  var matrix = [];
  for (var i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (var j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  for (var i = 1; i <= len1; i++) {
    for (var j = 1; j <= len2; j++) {
      var cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  var distance = matrix[len1][len2];
  var maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

async function enrichWithDateAdded(groups) {
  var allIds = [];
  groups.forEach(function(group) {
    group.forEach(function(node) { allIds.push(node.id); });
  });
  if (allIds.length === 0) return;

  return new Promise(function(resolve) {
    chrome.bookmarks.get(allIds.slice(0, 300), function(results) {
      var dateMap = {};
      results.forEach(function(b) { dateMap[b.id] = b.dateAdded || 0; });
      groups.forEach(function(group) {
        group.forEach(function(node) {
          node._dateAdded = dateMap[node.id] || 0;
        });
      });
      resolve();
    });
  });
}

function renderDuplicatesPanel() {
  var contentArea = document.getElementById('contentArea');
  if (!contentArea) return;

  if (duplicateGroups.length === 0) {
    contentArea.innerHTML = '<p class="placeholder">🎉 未发现重复书签！</p>';
    return;
  }

  var totalDuplicates = duplicateGroups.reduce(function(sum, g) { return sum + g.length - 1; }, 0);

    var html = '<div class="duplicates-panel"><h3>🔍 重复书签检测结果</h3>' +
    '<div class="duplicates-options"><span>匹配方式：</span>' +
    '<label><input type="radio" name="duplicateMatchType" value="url" ' + (currentMatchType === 'url' ? 'checked' : '') + '> URL 精确匹配</label>' +
    '<label><input type="radio" name="duplicateMatchType" value="title" ' + (currentMatchType === 'title' ? 'checked' : '') + '> 标题模糊匹配</label>' +
    '<button id="reDetectBtn" class="btn-small">重新检测</button>' +
    '<span style="margin-left: auto; color: #6b7280; font-size: 13px;">共 ' + duplicateGroups.length + ' 组重复</span></div>' +
    '<div class="duplicate-groups-container">';

  duplicateGroups.forEach(function(group, groupIndex) {
    var groupLabel = group[0].url
      ? 'URL: ' + escapeHtml(truncateUrl(group[0].url, 60))
      : '标题相似: ' + escapeHtml(group[0].title);

    html += '<div class="duplicate-group" data-group-index="' + groupIndex + '">' +
      '<div class="duplicate-group-header">' +
      '<h4>📋 第 ' + (groupIndex + 1) + ' 组 (' + group.length + ' 个) - ' + groupLabel + '</h4>' +
      '<button class="keep-btn keep-oldest" data-group="' + groupIndex + '">保留最旧（其余选中）</button></div>' +
      '<div class="duplicate-group-items">';

    group.forEach(function(node) {
      var isKeep = keepItems.has(node.id);
      var dateStr = node._dateAdded
        ? new Date(node._dateAdded).toLocaleString('zh-CN')
        : '未知';
      var itemClass = isKeep ? 'keep-item' : '';

      html += '<div class="result-item ' + itemClass + '" data-id="' + node.id + '">' +
        '<input type="checkbox" class="duplicate-checkbox" data-id="' + node.id + '" data-group="' + groupIndex + '" ' + (!isKeep ? 'checked' : '') + ' ' + (isKeep ? 'disabled' : '') + '>' +
        '<span class="result-icon">' + (isKeep ? '⭐' : '🔖') + '</span>' +
        '<div class="result-info">' +
        '<div class="result-title">' + escapeHtml(node.title) + '</div>' +
        '<div class="result-url">' + escapeHtml(node.url || '') + '</div>' +
        '<div style="font-size: 11px; color: #9ca3af;">添加于: ' + dateStr + '</div></div>' +
        '<div class="result-path">' + (node.parentPath.join(' > ') || '根目录') + '</div>' +
        '<div class="result-actions">' +
        '<button class="btn-small keep-single ' + (isKeep ? 'btn-keep-active' : 'btn-keep') + '" data-id="' + node.id + '" data-group="' + groupIndex + '">' + (isKeep ? '已保留' : '保留此项') + '</button>' +
        '<button class="btn-small go-to-bookmark" data-id="' + node.id + '">定位</button>' +
        '</div></div>';
    });

    html += '</div></div>';
  });

  html += '</div>' +
    '<button id="batchDeleteDuplicatesBtn" class="batch-delete-duplicates-btn">🗑️ 删除选中的重复书签 (<span id="duplicatesDeleteCount">' + countCheckedDuplicates() + '</span> 个)</button>' +
    '</div>';

  contentArea.innerHTML = html;

  bindDuplicatesEvents();
}

function truncateUrl(url, maxLen) {
  if (!url) return '';
  return url.length > maxLen ? url.substring(0, maxLen) + '...' : url;
}

function countCheckedDuplicates() {
  return document.querySelectorAll('.duplicate-checkbox:checked').length;
}

function bindDuplicatesEvents() {
  var reDetectBtn = document.getElementById('reDetectBtn');
  if (reDetectBtn) {
    reDetectBtn.addEventListener('click', function() {
      // 从当前 DOM 中获取选中的匹配方式
      var checkedRadio = document.querySelector('input[name="duplicateMatchType"]:checked');
      var matchType = checkedRadio ? checkedRadio.value : 'url';
      detectDuplicates(matchType);
    });
  }

  document.querySelectorAll('.keep-oldest').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var groupIndex = parseInt(e.target.dataset.group);
      var group = duplicateGroups[groupIndex];
      if (!group || group.length === 0) return;

      var oldestId = group[0].id;
      group.forEach(function(node) { keepItems.delete(node.id); });
      keepItems.add(oldestId);

      renderDuplicatesPanel();
    });
  });

  document.querySelectorAll('.keep-single').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var id = e.target.dataset.id;
      if (keepItems.has(id)) {
        keepItems.delete(id);
      } else {
        keepItems.add(id);
      }
      renderDuplicatesPanel();
    });
  });

  document.querySelectorAll('.duplicate-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var countSpan = document.getElementById('duplicatesDeleteCount');
      if (countSpan) {
        countSpan.textContent = countCheckedDuplicates();
      }
    });
  });

  document.querySelectorAll('.go-to-bookmark').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      locateNodeInTree(e.target.dataset.id);
    });
  });

  var batchDeleteBtn = document.getElementById('batchDeleteDuplicatesBtn');
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', async function() {
      var checkboxes = document.querySelectorAll('.duplicate-checkbox:checked');
      if (checkboxes.length === 0) {
        alert('请至少选择一个要删除的重复书签。');
        return;
      }
      if (!confirm('确定要删除选中的 ' + checkboxes.length + ' 个重复书签吗？此操作不可撤销。')) return;

      var deleted = 0;
      for (var i = 0; i < checkboxes.length; i++) {
        try {
          await new Promise(function(resolve) {
            chrome.bookmarks.remove(checkboxes[i].dataset.id, resolve);
          });
          deleted++;
        } catch (e) {
          console.error('删除失败:', e);
        }
      }

      bookmarkTreeData = await fetchBookmarkTree();
      flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
      renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
      bindDragEvents();

      await detectDuplicates();
    });
  }
}

function initDuplicateButton() {
  var detectDuplicatesBtn = document.getElementById('detectDuplicatesBtn');
  if (detectDuplicatesBtn) {
    detectDuplicatesBtn.addEventListener('click', function() {
      detectDuplicates('url');  // 默认使用 URL 精确匹配
    });
  }
}

// ---------- 失效链接检测 ----------
var deadLinksResults = [];
var isDetecting = false;

async function detectDeadLinks() {
  if (isDetecting) return;
  isDetecting = true;

  var contentArea = document.getElementById('contentArea');
  if (!contentArea) { isDetecting = false; return; }

  var allBookmarks = flatBookmarkList.filter(function(n) { return !n.isFolder && n.url; });
  if (allBookmarks.length === 0) {
    contentArea.innerHTML = '<p class="placeholder">没有可检测的书签。</p>';
    isDetecting = false;
    return;
  }

  deadLinksResults = allBookmarks.map(function(b) {
    return {
      id: b.id,
      title: b.title,
      url: b.url,
      parentPath: b.parentPath,
      status: 'checking',
      httpStatus: null,
      error: null
    };
  });

  renderDeadLinksPanel('checking');

  var urls = deadLinksResults.map(function(r) { return r.url; }).filter(Boolean);

  try {
    var response = await chrome.runtime.sendMessage({
      action: 'checkLinksBatch',
      urls: urls,
      concurrency: 8
    });

    if (response.error) {
      throw new Error(response.error);
    }

    var resultMap = new Map();
    response.results.forEach(function(r) { resultMap.set(r.url, r); });

    deadLinksResults.forEach(function(item) {
      var result = resultMap.get(item.url);
      if (result) {
        item.status = result.ok ? 'alive' : 'dead';
        item.httpStatus = result.status;
        item.error = result.error;
      } else {
        item.status = 'dead';
        item.error = '未获取到检测结果';
      }
    });

  } catch (err) {
    console.error('批量检测失败:', err);
    deadLinksResults.forEach(function(item) {
      if (item.status === 'checking') {
        item.status = 'dead';
        item.error = err.message || '检测失败';
      }
    });
  }

  isDetecting = false;
  renderDeadLinksPanel('done');
}

function renderDeadLinksPanel(state) {
  var contentArea = document.getElementById('contentArea');
  if (!contentArea) return;

  var total = deadLinksResults.length;
  var dead = deadLinksResults.filter(function(r) { return r.status === 'dead'; }).length;
  var alive = deadLinksResults.filter(function(r) { return r.status === 'alive'; }).length;
  var progressPercent = total > 0 ? Math.round(((dead + alive) / total) * 100) : 0;

  var html = '<div class="dead-links-panel"><h3>🔗 失效链接检测</h3>';

  if (state === 'checking') {
    html += '<div class="dead-links-progress"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + progressPercent + '%"></div></div>' +
      '<div class="progress-text">已检测 ' + (dead + alive) + '/' + total + '，失效 ' + dead + ' 个，正常 ' + alive + ' 个...</div></div>';
  }

  if (state === 'done') {
    html += '<div class="detection-summary">' +
      '<div class="stat-card dead-stat"><div class="stat-number">' + dead + '</div><div class="stat-label">失效链接</div></div>' +
      '<div class="stat-card alive-stat"><div class="stat-number">' + alive + '</div><div class="stat-label">正常链接</div></div>' +
      '</div>';
  }

  html += '<div style="margin-bottom:12px;display:flex;gap:8px;">' +
    '<button class="btn-small filter-dead-btn active" data-filter="dead">仅失效 (' + dead + ')</button>' +
    '<button class="btn-small filter-dead-btn" data-filter="all">全部 (' + total + ')</button>' +
    '<button class="btn-small filter-dead-btn" data-filter="alive">仅正常 (' + alive + ')</button>' +
    '<span style="margin-left:auto;">' +
    '<button id="selectAllDeadBtn" class="btn-small">全选失效</button>' +
    '<button id="batchDeleteDeadBtn" class="btn-small btn-danger" ' + (dead === 0 ? 'disabled' : '') + '>🗑️ 批量删除失效 (' + dead + ')</button>' +
    '</span></div>';

  html += '<div class="dead-links-list" id="deadLinksList">';

  deadLinksResults.forEach(function(item) {
    var statusClass = item.status === 'dead' ? 'dead' : (item.status === 'alive' ? 'alive' : 'checking');
    var statusLabel = item.status === 'dead' ? '❌ 失效' : (item.status === 'alive' ? '✅ 正常' : '⏳ 检测中');
    var statusDetail = item.error || (item.httpStatus ? 'HTTP ' + item.httpStatus : '');

    html += '<div class="result-item dead-link-item ' + statusClass + '" data-id="' + item.id + '" data-status="' + item.status + '">' +
      '<input type="checkbox" class="dead-link-checkbox" data-id="' + item.id + '" ' + (item.status === 'dead' ? 'checked' : '') + ' ' + (item.status === 'checking' ? 'disabled' : '') + '>' +
      '<span class="result-icon">' + (item.status === 'dead' ? '💀' : (item.status === 'alive' ? '✅' : '⏳')) + '</span>' +
      '<div class="result-info">' +
      '<div class="result-title">' + escapeHtml(item.title) + '</div>' +
      '<div class="result-url">' + escapeHtml(item.url || '') + '</div></div>' +
      '<span class="dead-link-status ' + statusClass + '">' + statusLabel + ' ' + escapeHtml(statusDetail) + '</span>' +
      '<div class="result-actions">' +
      '<button class="btn-small go-to-bookmark" data-id="' + item.id + '">定位</button>' +
      '<button class="btn-small btn-danger delete-dead-single" data-id="' + item.id + '">删除</button>' +
      '</div></div>';
  });

  html += '</div></div>';

  contentArea.innerHTML = html;

  bindDeadLinksEvents();
}

function bindDeadLinksEvents() {
  document.querySelectorAll('.filter-dead-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      document.querySelectorAll('.filter-dead-btn').forEach(function(b) { b.classList.remove('active'); });
      e.target.classList.add('active');

      var filter = e.target.dataset.filter;
      document.querySelectorAll('.dead-link-item').forEach(function(item) {
        var status = item.dataset.status;
        if (filter === 'all') {
          item.style.display = '';
        } else if (filter === 'dead') {
          item.style.display = status === 'dead' ? '' : 'none';
        } else if (filter === 'alive') {
          item.style.display = status === 'alive' ? '' : 'none';
        }
      });
    });
  });

  var selectAllDeadBtn = document.getElementById('selectAllDeadBtn');
  if (selectAllDeadBtn) {
    selectAllDeadBtn.addEventListener('click', function() {
      document.querySelectorAll('.dead-link-item[data-status="dead"] .dead-link-checkbox')
        .forEach(function(cb) { cb.checked = true; });
    });
  }

  var batchDeleteDeadBtn = document.getElementById('batchDeleteDeadBtn');
  if (batchDeleteDeadBtn) {
    batchDeleteDeadBtn.addEventListener('click', async function() {
      var checkboxes = document.querySelectorAll('.dead-link-checkbox:checked');
      if (checkboxes.length === 0) {
        alert('请至少选择一个要删除的失效书签。');
        return;
      }
      if (!confirm('确定要删除选中的 ' + checkboxes.length + ' 个失效书签吗？此操作不可撤销。')) return;

      var deleted = 0;
      for (var i = 0; i < checkboxes.length; i++) {
        try {
          await new Promise(function(resolve) {
            chrome.bookmarks.remove(checkboxes[i].dataset.id, resolve);
          });
          deleted++;
        } catch (e) {
          console.error('删除失败:', e);
        }
      }

      bookmarkTreeData = await fetchBookmarkTree();
      flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
      renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
      bindDragEvents();

      var deletedIds = new Set();
      checkboxes.forEach(function(cb) { deletedIds.add(cb.dataset.id); });
      deadLinksResults = deadLinksResults.filter(function(r) { return !deletedIds.has(r.id); });
      renderDeadLinksPanel('done');
    });
  }

  document.querySelectorAll('.delete-dead-single').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      var id = e.target.dataset.id;
      var item = deadLinksResults.find(function(r) { return r.id === id; });
      if (item && confirm('确定要删除书签「' + item.title + '」吗？')) {
        await new Promise(function(resolve) {
          chrome.bookmarks.remove(id, resolve);
        });
        bookmarkTreeData = await fetchBookmarkTree();
        flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
        renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
        bindDragEvents();
        deadLinksResults = deadLinksResults.filter(function(r) { return r.id !== id; });
        renderDeadLinksPanel('done');
      }
    });
  });

  document.querySelectorAll('.go-to-bookmark').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      locateNodeInTree(e.target.dataset.id);
    });
  });

  document.querySelectorAll('.dead-link-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var count = document.querySelectorAll('.dead-link-checkbox:checked').length;
      var batchBtn = document.getElementById('batchDeleteDeadBtn');
      if (batchBtn) {
        batchBtn.textContent = '🗑️ 批量删除失效 (' + count + ')';
        batchBtn.disabled = count === 0;
      }
    });
  });
}

function initDeadLinkButton() {
  var detectDeadLinksBtn = document.getElementById('detectDeadLinksBtn');
  if (detectDeadLinksBtn) detectDeadLinksBtn.addEventListener('click', detectDeadLinks);
}

// ---------- 同步面板功能 ----------
var toastTimer = null;
function showSyncToast(message) {
  var oldToast = document.getElementById('syncToast');
  if (oldToast) oldToast.remove();

  var toast = document.createElement('div');
  toast.id = 'syncToast';
  toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #1f2937; color: white; padding: 10px 20px; border-radius: 8px; font-size: 14px; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
  toast.textContent = message;
  document.body.appendChild(toast);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

async function refreshSyncStatus() {
  var card = document.getElementById('syncStatusCard');
  if (!card) return;

  var status = await chrome.runtime.sendMessage({ action: 'getSyncStatus' });
  var cosConfig = await chrome.storage.sync.get(['cosConfig']);
  var config = cosConfig.cosConfig || {};

  var lastSyncTime = status.lastSyncTime
    ? new Date(status.lastSyncTime).toLocaleString('zh-CN')
    : '从未同步';
  var lastSyncType = status.lastSyncType === 'upload' ? '上传' :
                     status.lastSyncType === 'download' ? '下载' : '—';

  card.innerHTML =
    '<h4 style="margin-bottom:8px;">📊 同步状态</h4>' +
    '<div class="status-row"><span class="status-label">上次同步：</span><span class="status-value">' + lastSyncTime + ' (' + lastSyncType + ')</span></div>' +
    '<div class="status-row"><span class="status-label">COS 配置：</span><span class="status-value">' + (config.bucket ? config.bucket + ' (' + config.region + ')' : '未配置') + '</span></div>' +
    '<div class="status-row"><span class="status-label">自动同步：</span><span class="status-value">' + (config.autoSync ? '已启用 (间隔 ' + config.syncInterval + ' 分钟)' : '未启用') + '</span></div>' +
    '<button id="openOptionsFromStatusBtn" class="btn-small btn-primary" style="margin-top:10px;">⚙️ 修改设置</button>';
  card.style.display = 'block';

  var openBtn = document.getElementById('openOptionsFromStatusBtn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      chrome.runtime.openOptionsPage();
    });
  }
}

function initSyncButtons() {
  var uploadSyncBtn = document.getElementById('uploadSyncBtn');
  if (uploadSyncBtn) {
    uploadSyncBtn.addEventListener('click', async function() {
      try {
        showSyncToast('正在上传书签到云端...');
        var response = await chrome.runtime.sendMessage({ action: 'uploadSync' });
        if (response.success) {
          showSyncToast('✅ 上传成功！');
          refreshSyncStatus();
        } else {
          showSyncToast('❌ 上传失败：' + (response.error || '未知错误'));
        }
      } catch (e) {
        showSyncToast('❌ 上传失败：' + e.message);
      }
    });
  }

  var downloadSyncBtn = document.getElementById('downloadSyncBtn');
  if (downloadSyncBtn) {
    downloadSyncBtn.addEventListener('click', async function() {
      if (!confirm('从云端下载将追加本地没有的书签，确定继续？')) return;
      try {
        showSyncToast('正在从云端下载书签...');
        var response = await chrome.runtime.sendMessage({ action: 'downloadSync' });
        if (response.success) {
          showSyncToast('✅ ' + (response.message || '下载成功！'));
          bookmarkTreeData = await fetchBookmarkTree();
          flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
          renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
          bindDragEvents();
          refreshSyncStatus();
        } else {
          showSyncToast('❌ 下载失败：' + (response.error || '未知错误'));
        }
      } catch (e) {
        showSyncToast('❌ 下载失败：' + e.message);
      }
    });
  }

  var openOptionsBtn = document.getElementById('openOptionsBtn');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', function() {
      chrome.runtime.openOptionsPage();
    });
  }

  var quickUploadBtn = document.getElementById('quickUploadBtn');
  if (quickUploadBtn) {
    quickUploadBtn.addEventListener('click', function() {
      if (uploadSyncBtn) uploadSyncBtn.click();
    });
  }

  var quickDownloadBtn = document.getElementById('quickDownloadBtn');
  if (quickDownloadBtn) {
    quickDownloadBtn.addEventListener('click', function() {
      if (downloadSyncBtn) downloadSyncBtn.click();
    });
  }

  var showSyncStatusBtn = document.getElementById('showSyncStatusBtn');
  if (showSyncStatusBtn) {
    showSyncStatusBtn.addEventListener('click', async function() {
      var card = document.getElementById('syncStatusCard');
      if (card) {
        card.style.display = card.style.display === 'none' ? 'block' : 'none';
        if (card.style.display === 'block') {
          await refreshSyncStatus();
        }
      }
    });
  }
}

// ---------- 动态注入样式 ----------
var additionalStyles = document.createElement('style');
additionalStyles.textContent =
  '.detail-card { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }' +
  '.detail-card h2 { margin-bottom: 16px; font-size: 20px; }' +
  '.detail-field { margin-bottom: 12px; display: flex; gap: 8px; }' +
  '.detail-field label { font-weight: 600; color: #374151; min-width: 50px; }' +
  '.detail-url { color: #2563eb; word-break: break-all; }' +
  '.detail-actions { margin-top: 20px; display: flex; gap: 12px; }' +
  '.btn-primary { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }' +
  '.btn-primary:hover { background: #4338ca; }' +
  '.btn-danger { background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }' +
  '.btn-danger:hover { background: #dc2626; }' +
  '.btn-small { padding: 4px 10px; font-size: 12px; border-radius: 4px; }' +
  '.search-results { background: white; border-radius: 8px; padding: 20px; }' +
  '.search-results h3 { margin-bottom: 16px; font-size: 16px; color: #374151; }' +
  '.result-list { list-style: none; padding: 0; }' +
  '.result-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }' +
  '.result-item:last-child { border-bottom: none; }' +
  '.result-checkbox { margin-right: 2px; }' +
  '.result-icon { font-size: 18px; }' +
  '.result-info { flex: 1; min-width: 0; }' +
  '.result-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
  '.result-url { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
  '.result-path { font-size: 11px; color: #9ca3af; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
  '.result-actions { display: flex; gap: 4px; flex-shrink: 0; }' +
  'mark { background: #fef08a; padding: 0 2px; border-radius: 2px; }';
document.head.appendChild(additionalStyles);

// ---------- 初始加载 ----------
(async function init() {
  bookmarkTreeData = await fetchBookmarkTree();
  flatBookmarkList = flattenBookmarkTree(bookmarkTreeData);
  renderTree(document.getElementById('bookmarkTree'), bookmarkTreeData);
  bindDragEvents();

  initExpandCollapseButtons();
  initBatchButtons();
  initSortButton();
  initDuplicateButton();
  initDeadLinkButton();
  initSyncButtons();

  // 监听排序范围切换
  var sortScopeSelect = document.getElementById('sortScope');
  if (sortScopeSelect) {
    sortScopeSelect.addEventListener('change', function() {
      if (this.value === 'selected' && !selectedNodeData) {
        showSyncToast('请先在左侧点击选择一个文件夹');
        this.value = 'all';
      }
    });
  }

  chrome.storage.local.get(['searchQuery'], function(result) {
    if (result.searchQuery && searchInput) {
      searchInput.value = result.searchQuery;
      searchInput.dispatchEvent(new Event('input'));
      chrome.storage.local.remove('searchQuery');
    }
  });
})();