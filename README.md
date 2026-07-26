# bookmark-manager
chrome浏览器书签管理插件，使用腾讯云对象存储COS 云同步。
## 主要功能
- COS 云同步：上传/下载书签、自动定时同步、设置页面配置
- 书签树管理：多级目录折叠展开、可视化浏览
- 全局搜索：模糊匹配标题和 URL，快速定位
- 智能排序：按使用频率、最近添加、字母顺序排序
- 重复检测：URL 精确匹配 / 标题模糊匹配，批量删除
- 失效检测：并发 HTTP 检测，批量删除失效链接

## 安装使用说明
- 打开 Chrome，访问 chrome://extensions/
- 开启右上角「开发者模式」
- 点击「加载已解压的扩展程序」，选择 bookmark-manager 文件夹
- 安装后点击工具栏插件图标，进入 popup
- 点击「打开完整管理器」使用全部功能
- 右键插件图标 →「选项」进入 COS 设置页，配置腾讯云存储桶参数

## 文件清单
bookmark-manager/
├── manifest.json
├── background.js       （含 COSClient 类 + 后台逻辑）
├── popup.html
├── popup.js
├── popup.css
├── manager.html
├── manager.js          （管理功能）
├── manager.css
├── options.html
├── options.js
├── lib/
│   └── cos-js-sdk-v5.min.js
