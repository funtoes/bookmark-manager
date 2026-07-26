// 加载已保存的配置
(async function loadSettings() {
  const result = await chrome.storage.sync.get(['cosConfig']);
  const config = result.cosConfig || {};
  
  document.getElementById('bucketInput').value = config.bucket || '';
  document.getElementById('regionInput').value = config.region || '';
  document.getElementById('secretIdInput').value = config.secretId || '';
  document.getElementById('secretKeyInput').value = config.secretKey || '';
  document.getElementById('syncKeyInput').value = config.syncKey || 'bookmarks-sync.json';
  document.getElementById('autoSyncCheck').checked = config.autoSync || false;
  document.getElementById('syncIntervalInput').value = config.syncInterval || 60;
  
  document.getElementById('syncIntervalGroup').style.display = config.autoSync ? 'block' : 'none';
})();

// 自动同步开关切换
document.getElementById('autoSyncCheck').addEventListener('change', (e) => {
  document.getElementById('syncIntervalGroup').style.display = e.target.checked ? 'block' : 'none';
});

// 显示状态消息
function showStatus(message, type = 'info') {
  const el = document.getElementById('statusMessage');
  el.textContent = message;
  el.className = `status ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// 保存设置
document.getElementById('saveBtn').addEventListener('click', async () => {
  const config = {
    bucket: document.getElementById('bucketInput').value.trim(),
    region: document.getElementById('regionInput').value.trim(),
    secretId: document.getElementById('secretIdInput').value.trim(),
    secretKey: document.getElementById('secretKeyInput').value.trim(),
    syncKey: document.getElementById('syncKeyInput').value.trim() || 'bookmarks-sync.json',
    autoSync: document.getElementById('autoSyncCheck').checked,
    syncInterval: parseInt(document.getElementById('syncIntervalInput').value) || 60
  };

  if (!config.bucket || !config.region || !config.secretId || !config.secretKey) {
    showStatus('请填写完整的 COS 配置信息', 'error');
    return;
  }

  await chrome.storage.sync.set({ cosConfig: config });
  
  // 通知 background 更新自动同步 alarm
  chrome.runtime.sendMessage({ action: 'updateAutoSync', config });
  
  showStatus('✅ 设置已保存', 'success');
});

// 测试连接
document.getElementById('testBtn').addEventListener('click', async () => {
  const config = {
    bucket: document.getElementById('bucketInput').value.trim(),
    region: document.getElementById('regionInput').value.trim(),
    secretId: document.getElementById('secretIdInput').value.trim(),
    secretKey: document.getElementById('secretKeyInput').value.trim(),
    syncKey: document.getElementById('syncKeyInput').value.trim() || 'bookmarks-sync.json'
  };

  if (!config.bucket || !config.region || !config.secretId || !config.secretKey) {
    showStatus('请先填写完整的 COS 配置', 'error');
    return;
  }

  try {
    showStatus('正在测试连接...', 'info');
    
    const response = await chrome.runtime.sendMessage({
      action: 'testCosConnection',
      config
    });

    if (response.success) {
      showStatus('✅ 连接成功！可以正常上传/下载。', 'success');
    } else {
      showStatus(`❌ 连接失败：${response.error}`, 'error');
    }
  } catch (e) {
    showStatus(`❌ 连接失败：${e.message}`, 'error');
  }
});