// ========== XMLHttpRequest Polyfill for Service Worker ==========
if (typeof XMLHttpRequest === 'undefined') {
  class XHRPolyfill {
    constructor() {
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.responseText = '';
      this.responseXML = null;
      this.response = null;
      this.responseHeaders = '';
      this.onload = null;
      this.onerror = null;
      this.onreadystatechange = null;
      this.method = 'GET';
      this.url = '';
      this.requestHeaders = {};
      this.responseType = '';
      this._controller = null;
      this._responseHeadersMap = {};
    }

    open(method, url) {
      this.method = method;
      this.url = url;
      this.readyState = 1;
      if (typeof this.onreadystatechange === 'function') {
        this.onreadystatechange();
      }
    }

    setRequestHeader(key, value) {
      this.requestHeaders[key] = value;
    }

    getAllResponseHeaders() {
      return this.responseHeaders;
    }

    getResponseHeader(name) {
      var lowerName = name.toLowerCase();
      var headers = this.responseHeaders.split('\r\n');
      for (var i = 0; i < headers.length; i++) {
        var header = headers[i];
        if (header.toLowerCase().indexOf(lowerName + ':') === 0) {
          return header.substring(header.indexOf(':') + 1).trim();
        }
      }
      return null;
    }

    send(body) {
      var self = this;
      this.readyState = 2;
      if (typeof this.onreadystatechange === 'function') {
        this.onreadystatechange();
      }

      var controller = new AbortController();
      this._controller = controller;

      var fetchOptions = {
        method: this.method,
        headers: this.requestHeaders,
        signal: controller.signal
      };

      if (body) {
        fetchOptions.body = body;
      }

      fetch(this.url, fetchOptions).then(function(response) {
        self.status = response.status;
        self.statusText = response.statusText;

        self.responseHeaders = '';
        self._responseHeadersMap = {};
        response.headers.forEach(function(value, key) {
          self.responseHeaders += key + ': ' + value + '\r\n';
          self._responseHeadersMap[key.toLowerCase()] = value;
        });

        self.readyState = 3;
        if (typeof self.onreadystatechange === 'function') {
          self.onreadystatechange();
        }

        if (self.responseType === 'arraybuffer') {
          return response.arrayBuffer();
        } else if (self.responseType === 'blob') {
          return response.blob();
        } else {
          return response.text();
        }
      }).then(function(data) {
        if (self.responseType === 'arraybuffer') {
          self.response = data;
          self.responseText = '';
        } else if (self.responseType === 'blob') {
          self.response = data;
          self.responseText = '';
        } else {
          self.responseText = data;
          self.response = data;
          self.responseXML = data;
        }

        self.readyState = 4;
        if (typeof self.onreadystatechange === 'function') {
          self.onreadystatechange();
        }
        if (typeof self.onload === 'function') {
          self.onload();
        }
      }).catch(function(err) {
        self.status = 0;
        self.statusText = err.message || 'Network Error';
        self.readyState = 4;
        self.responseText = '';
        self.responseHeaders = '';
        self.response = null;
        self._responseHeadersMap = {};
        if (typeof self.onreadystatechange === 'function') {
          self.onreadystatechange();
        }
        if (typeof self.onerror === 'function') {
          self.onerror(err);
        }
        if (typeof self.onload === 'function') {
          self.onload();
        }
      });
    }

    abort() {
      if (this._controller) {
        this._controller.abort();
      }
    }
  }

  self.XMLHttpRequest = XHRPolyfill;
}

// ========== 引入 COS SDK ==========
importScripts('lib/cos-js-sdk-v5.min.js');

// ========== 安装初始化 ==========
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Bookmark Manager 已安装');
  var result = await chrome.storage.sync.get(['cosConfig']);
  if (!result.cosConfig) {
    await chrome.storage.sync.set({
      cosConfig: {
        bucket: '',
        region: '',
        secretId: '',
        secretKey: '',
        syncKey: 'bookmarks-sync.json',
        autoSync: false,
        syncInterval: 60
      }
    });
  } else if (result.cosConfig.autoSync) {
    await setupAutoSync(result.cosConfig);
  }
});

// ========== 链接检测 ==========
async function checkLinkAvailability(url) {
  var controller = new AbortController();
  var timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    var fetchResp = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);
    return { ok: fetchResp.ok, status: fetchResp.status, error: fetchResp.ok ? null : 'HTTP ' + fetchResp.status };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, status: 0, error: '请求超时' };
    }
    try {
      var controller2 = new AbortController();
      var timeoutId2 = setTimeout(() => controller2.abort(), 10000);
      var fetchResp2 = await fetch(url, {
        method: 'GET',
        signal: controller2.signal,
        redirect: 'follow',
        headers: { 'Range': 'bytes=0-0' }
      });
      clearTimeout(timeoutId2);
      return { ok: fetchResp2.ok, status: fetchResp2.status, error: fetchResp2.ok ? null : 'HTTP ' + fetchResp2.status };
    } catch (err2) {
      return { ok: false, status: 0, error: err2.message || '网络错误' };
    }
  }
}

async function checkLinksBatch(urls, concurrency) {
  concurrency = concurrency || 5;
  var results = [];
  var queue = urls.slice();
  var workerCount = Math.min(concurrency, queue.length);

  async function worker() {
    while (queue.length > 0) {
      var url = queue.shift();
      if (!url) break;
      var result = await checkLinkAvailability(url);
      results.push({ url: url, ok: result.ok, status: result.status, error: result.error });
    }
  }

  var workers = [];
  for (var i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ========== COS 同步功能 ==========
async function getCosConfig() {
  var result = await chrome.storage.sync.get(['cosConfig']);
  return result.cosConfig || null;
}

function createCosClient(config) {
  return new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
    Protocol: 'https:'
  });
}

async function exportBookmarksToJson() {
  var tree = await new Promise(function(resolve) {
    chrome.bookmarks.getTree(function(results) { resolve(results); });
  });
  var syncData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: tree[0]
  };
  return JSON.stringify(syncData, null, 2);
}

// 收集本地所有书签信息（包括文件夹层级和书签 URL）
async function getLocalBookmarkMap() {
  var urlSet = new Set();
  var folderPaths = new Map();

  function collectInfo(nodes, parentId, parentPath) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.url) {
        urlSet.add(node.url);
      } else {
        var folderKey = parentId + '/' + node.title;
        folderPaths.set(folderKey, node.id);
        if (node.children) {
          collectInfo(node.children, node.id, parentPath + '/' + node.title);
        }
      }
    }
  }

  var tree = await new Promise(function(resolve) {
    chrome.bookmarks.getTree(function(results) { resolve(results); });
  });

  for (var i = 0; i < tree[0].children.length; i++) {
    var rootFolder = tree[0].children[i];
    collectInfo(rootFolder.children || [], rootFolder.id, rootFolder.title);
  }

  return { urlSet: urlSet, folderPaths: folderPaths };
}

// 导入书签：只添加本地不存在的书签和文件夹
async function importBookmarksFromJson(data) {
  var remoteBookmarks = data.bookmarks;

  if (!remoteBookmarks || !remoteBookmarks.children) {
    throw new Error('书签数据格式无效');
  }

  console.log('开始导入书签...');

  var localMap = await getLocalBookmarkMap();
  console.log('本地书签 URL 数量:', localMap.urlSet.size);
  console.log('本地文件夹数量:', localMap.folderPaths.size);

  var localTree = await new Promise(function(resolve) {
    chrome.bookmarks.getTree(function(results) { resolve(results); });
  });

  var bookmarksBar = localTree[0].children.find(function(c) { return c.id === '1'; });
  var otherBookmarks = localTree[0].children.find(function(c) { return c.id === '2'; });

  if (!bookmarksBar || !otherBookmarks) {
    throw new Error('无法找到书签栏');
  }

  var remoteBar = remoteBookmarks.children.find(function(c) {
    return c.title === '书签栏' || c.title === 'Bookmarks Bar' || c.id === '1';
  });
  var remoteOther = remoteBookmarks.children.find(function(c) {
    return c.title === '其他书签' || c.title === 'Other Bookmarks' || c.id === '2';
  });

  var totalAdded = 0;
  var totalSkipped = 0;

  if (remoteBar && remoteBar.children) {
    console.log('处理书签栏...');
    var result = await importNodes(remoteBar.children, bookmarksBar.id, localMap);
    totalAdded += result.added;
    totalSkipped += result.skipped;
  }

  if (remoteOther && remoteOther.children) {
    console.log('处理其他书签...');
    var result = await importNodes(remoteOther.children, otherBookmarks.id, localMap);
    totalAdded += result.added;
    totalSkipped += result.skipped;
  }

  console.log('导入完成！新增:', totalAdded, '跳过:', totalSkipped);

  await chrome.storage.local.set({
    lastImportStats: { added: totalAdded, skipped: totalSkipped }
  });
}

// 递归导入节点
async function importNodes(remoteNodes, parentId, localMap) {
  var added = 0;
  var skipped = 0;

  var existingChildren = await new Promise(function(resolve) {
    chrome.bookmarks.getChildren(parentId, function(children) {
      resolve(children || []);
    });
  });

  var existingFolderMap = {};
  var existingUrlSet = new Set();

  existingChildren.forEach(function(child) {
    if (child.url) {
      existingUrlSet.add(child.url);
    } else {
      existingFolderMap[child.title] = child;
    }
  });

  for (var i = 0; i < remoteNodes.length; i++) {
    var remoteNode = remoteNodes[i];

    if (remoteNode.children) {
      var existingFolder = existingFolderMap[remoteNode.title];

      if (existingFolder) {
        console.log('文件夹已存在，合并内容:', remoteNode.title);
        var childResult = await importNodes(remoteNode.children, existingFolder.id, localMap);
        added += childResult.added;
        skipped += childResult.skipped;
      } else {
        try {
          var newFolder = await new Promise(function(resolve, reject) {
            chrome.bookmarks.create({
              parentId: parentId,
              title: remoteNode.title || '未命名文件夹'
            }, function(result) {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(result);
              }
            });
          });

          console.log('创建新文件夹:', remoteNode.title);
          added++;

          existingFolderMap[remoteNode.title] = newFolder;

          var childResult = await importNodes(remoteNode.children, newFolder.id, localMap);
          added += childResult.added;
          skipped += childResult.skipped;
        } catch (err) {
          console.error('创建文件夹失败:', remoteNode.title, err);
        }
      }
    } else if (remoteNode.url) {
      if (existingUrlSet.has(remoteNode.url) || localMap.urlSet.has(remoteNode.url)) {
        console.log('跳过重复书签:', remoteNode.title);
        skipped++;
        continue;
      }

      try {
        await new Promise(function(resolve, reject) {
          chrome.bookmarks.create({
            parentId: parentId,
            title: remoteNode.title || '未命名书签',
            url: remoteNode.url
          }, function(result) {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(result);
            }
          });
        });

        existingUrlSet.add(remoteNode.url);
        localMap.urlSet.add(remoteNode.url);
        added++;
      } catch (err) {
        console.error('创建书签失败:', remoteNode.title, err);
      }
    }
  }

  return { added: added, skipped: skipped };
}

async function uploadToCos() {
  var config = await getCosConfig();
  if (!config || !config.bucket) throw new Error('COS 未配置');
  var jsonData = await exportBookmarksToJson();
  var cos = createCosClient(config);

  return new Promise(function(resolve, reject) {
    console.log('开始上传到 COS...');
    cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: config.syncKey || 'bookmarks-sync.json',
      Body: jsonData
    }, function(err, data) {
      console.log('上传回调:', err ? '失败' : '成功');
      if (err) {
        reject(new Error('COS 上传失败: ' + (err.message || JSON.stringify(err))));
      } else {
        chrome.storage.local.set({ lastSyncTime: Date.now(), lastSyncType: 'upload' }, function() {
          resolve({ success: true, timestamp: Date.now() });
        });
      }
    });
  });
}

async function downloadFromCos() {
  var config = await getCosConfig();
  if (!config || !config.bucket) throw new Error('COS 未配置');
  var cos = createCosClient(config);

  return new Promise(function(resolve, reject) {
    console.log('开始从 COS 下载...');
    cos.getObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: config.syncKey || 'bookmarks-sync.json',
      ResponseType: 'text'
    }, function(err, data) {
      console.log('下载回调:', err ? '失败' : '成功');

      if (err) {
        if (err.statusCode === 404) {
          reject(new Error('COS 上未找到同步文件，请先上传一次书签。'));
        } else {
          reject(new Error('COS 下载失败: ' + (err.message || JSON.stringify(err))));
        }
        return;
      }

      console.log('=== COS 返回的 data 对象 ===');
      console.log('data 的 keys:', Object.keys(data));
      console.log('data.Body 类型:', typeof data.Body);

      var fileContent = data.Body || data.response || data.Response || data.body;

      if (!fileContent) {
        if (typeof data === 'string') {
          fileContent = data;
        } else {
          console.error('完整 data 对象:', data);
          reject(new Error('无法获取文件内容，请查看控制台'));
          return;
        }
      }

      console.log('文件内容长度:', fileContent.length);
      console.log('文件前200字符:', fileContent.substring(0, 200));

      try {
        var parsed = JSON.parse(fileContent);
        if (!parsed.bookmarks) {
          reject(new Error('书签数据格式无效：缺少 bookmarks 字段'));
          return;
        }

        console.log('开始导入书签...');
        importBookmarksFromJson(parsed).then(function() {
          chrome.storage.local.get(['lastImportStats'], function(result) {
            var stats = result.lastImportStats || { added: 0, skipped: 0 };
            var msg = '书签已从云端恢复';
            if (stats.added > 0) msg += '，新增 ' + stats.added + ' 个';
            if (stats.skipped > 0) msg += '，跳过 ' + stats.skipped + ' 个重复';

            chrome.storage.local.set({ lastSyncTime: Date.now(), lastSyncType: 'download' }, function() {
              resolve({
                success: true,
                timestamp: Date.now(),
                message: msg
              });
            });
          });
        }).catch(function(importErr) {
          reject(new Error('书签导入失败: ' + importErr.message));
        });
      } catch (parseErr) {
        console.error('JSON 解析失败:', parseErr);
        reject(new Error('JSON 解析失败: ' + parseErr.message));
      }
    });
  });
}

async function setupAutoSync(config) {
  await chrome.alarms.clear('cosAutoSync');
  if (config && config.autoSync) {
    chrome.alarms.create('cosAutoSync', {
      periodInMinutes: config.syncInterval || 60
    });
    console.log('自动同步已启用，间隔 ' + (config.syncInterval || 60) + ' 分钟');
  }
}

chrome.alarms.onAlarm.addListener(async function(alarm) {
  if (alarm.name === 'cosAutoSync') {
    try {
      await uploadToCos();
      console.log('自动同步完成:', new Date().toISOString());
    } catch (err) {
      console.error('自动同步失败:', err);
    }
  }
});

// ========== 消息监听 ==========
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息:', request.action);

  if (request.action === 'openManager') {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'checkLink') {
    checkLinkAvailability(request.url)
      .then(function(result) { sendResponse(result); })
      .catch(function(err) { sendResponse({ ok: false, status: 0, error: err.message }); });
    return true;
  }

  if (request.action === 'checkLinksBatch') {
    checkLinksBatch(request.urls, request.concurrency || 5)
      .then(function(results) { sendResponse({ results: results }); })
      .catch(function(err) { sendResponse({ error: err.message }); });
    return true;
  }

  if (request.action === 'uploadSync') {
    uploadToCos()
      .then(function(result) { sendResponse(result); })
      .catch(function(err) { sendResponse({ success: false, error: err.message }); });
    return true;
  }

  if (request.action === 'downloadSync') {
    downloadFromCos()
      .then(function(result) { sendResponse(result); })
      .catch(function(err) { sendResponse({ success: false, error: err.message }); });
    return true;
  }

  if (request.action === 'testCosConnection') {
    var testConfig = request.config;
    console.log('测试 COS 连接...');
    try {
      var cos = new COS({
        SecretId: testConfig.secretId,
        SecretKey: testConfig.secretKey,
        Protocol: 'https:'
      });

      cos.putObject({
        Bucket: testConfig.bucket,
        Region: testConfig.region,
        Key: '_test_connection_.tmp',
        Body: 'test'
      }, function(err, data) {
        console.log('测试连接:', err ? '失败' : '成功');
        if (err) {
          sendResponse({ success: false, error: err.message || JSON.stringify(err) });
        } else {
          cos.deleteObject({
            Bucket: testConfig.bucket,
            Region: testConfig.region,
            Key: '_test_connection_.tmp'
          }, function(delErr) {
            if (delErr) {
              sendResponse({ success: true, warning: '测试文件已上传但删除失败' });
            } else {
              sendResponse({ success: true });
            }
          });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  if (request.action === 'updateAutoSync') {
    setupAutoSync(request.config).then(function() { sendResponse({ success: true }); });
    return true;
  }

  if (request.action === 'getSyncStatus') {
    chrome.storage.local.get(['lastSyncTime', 'lastSyncType'], function(result) {
      sendResponse(result);
    });
    return true;
  }

  return false;
});

// ========== 启动时初始化 alarm ==========
(async function initAlarm() {
  var result = await chrome.storage.sync.get(['cosConfig']);
  if (result.cosConfig && result.cosConfig.autoSync) {
    await setupAutoSync(result.cosConfig);
  }
})();