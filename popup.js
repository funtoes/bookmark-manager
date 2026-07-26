document.getElementById('openManagerBtn').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: 'openManager' });
});

document.getElementById('syncNowBtn').addEventListener('click', async function() {
  var btn = document.getElementById('syncNowBtn');
  btn.textContent = '同步中...';
  btn.disabled = true;

  try {
    var response = await chrome.runtime.sendMessage({ action: 'uploadSync' });
    if (response.success) {
      btn.textContent = '✅ 同步完成';
      setTimeout(function() {
        btn.textContent = '立即同步';
        btn.disabled = false;
      }, 2000);
    } else {
      throw new Error(response.error);
    }
  } catch (err) {
    btn.textContent = '❌ 同步失败';
    setTimeout(function() {
      btn.textContent = '立即同步';
      btn.disabled = false;
    }, 2000);
  }
});

document.getElementById('searchInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    var query = e.target.value.trim();
    if (query) {
      // 先存储搜索词，再打开管理页面
      chrome.storage.local.set({ searchQuery: query }, function() {
        chrome.runtime.sendMessage({ action: 'openManager' });
      });
    }
  }
});