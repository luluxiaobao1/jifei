(function () {
  var VIEW_LABEL = { overview: '账单概览', detail: '账单详情', analysis: '账单分析' };
  var currentView = 'overview';

  var frames = {};
  document.querySelectorAll('.view-frame').forEach(function (f) {
    frames[f.dataset.view] = f;
  });

  // 非首屏视图懒加载：首次切换时才注入 src，避免首屏加载多套脚本
  function ensureLoaded(view) {
    var frame = frames[view];
    if (frame && !frame.src && frame.dataset.src) {
      frame.src = frame.dataset.src;
    }
  }

  // 子页图表依赖真实宽高，隐藏时测量为 0，切回后需要触发一次重绘
  function nudgeResize(view) {
    var frame = frames[view];
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.dispatchEvent(new Event('resize'));
    } catch (e) { /* 跨域时忽略 */ }
  }

  // 所有视图共享同一个演示角色
  var currentRoleKey = 'master';

  function pushRole(view, role) {
    var frame = frames[view];
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'set-role', role: role }, '*');
  }

  function switchView(view) {
    if (!VIEW_LABEL[view]) return;
    currentView = view;

    ensureLoaded(view);

    document.querySelectorAll('.view-frame').forEach(function (f) {
      f.classList.toggle('active', f.dataset.view === view);
    });

    // 侧边栏二级菜单联动
    document.querySelectorAll('.submenu-item').forEach(function (item) {
      if (item.dataset.view) {
        item.classList.toggle('active', item.dataset.view === view);
      } else {
        item.classList.remove('active');
      }
    });

    // 面包屑联动
    document.getElementById('crumb-current').textContent = VIEW_LABEL[view];
    document.title = VIEW_LABEL[view] + ' - 360智汇云';

    // 下一帧再触发重绘，确保 iframe 已获得真实尺寸
    requestAnimationFrame(function () { nudgeResize(view); });
  }

  // 侧边栏「账单概览 / 账单详情 / 账单分析」点击切换视图
  document.querySelectorAll('.submenu-item[data-view]').forEach(function (item) {
    item.addEventListener('click', function () {
      switchView(item.dataset.view);
    });
  });

  // 子页角色切换后：同步外壳顶部角色显示，并广播给其他视图
  window.addEventListener('message', function (e) {
    if (!e.data) return;

    // 账单概览页悬浮按钮：请求打开账单分析抽屉
    if (e.data.type === 'open-analysis-drawer') {
      openDrawer();
      return;
    }
    // 抽屉内子页请求关闭（如 ESC）
    if (e.data.type === 'close-analysis-drawer') {
      closeDrawer();
      return;
    }

    if (e.data.type !== 'role-change') return;

    var el = document.getElementById('role-display');
    if (el && e.data.label) el.textContent = e.data.label;

    if (e.data.role) {
      currentRoleKey = e.data.role;
      Object.keys(frames).forEach(function (v) {
        if (frames[v].contentWindow !== e.source) pushRole(v, currentRoleKey);
      });
      // 抽屉内的账单分析视图同样保持角色一致
      if (drawerFrame && drawerFrame.contentWindow !== e.source) {
        pushDrawerRole(currentRoleKey);
      }
    }
  });

  // iframe 懒加载完成后补推当前角色，保证各视图状态一致
  document.querySelectorAll('.view-frame').forEach(function (f) {
    f.addEventListener('load', function () {
      pushRole(f.dataset.view, currentRoleKey);
    });
  });

  // ====== 外壳自身的菜单交互 ======
  document.querySelectorAll('.menu-group > .menu-item').forEach(function (item) {
    item.addEventListener('click', function () {
      item.parentElement.classList.toggle('expanded');
    });
  });

  document.querySelectorAll('.icon-item').forEach(function (item) {
    item.addEventListener('click', function () {
      document.querySelectorAll('.icon-item').forEach(function (i) {
        i.classList.remove('active');
      });
      item.classList.add('active');
    });
  });

  switchView('overview');

  // ====== 账单分析 右侧抽屉 ======
  var drawerMask = document.getElementById('drawer-mask');
  var drawer = document.getElementById('analysis-drawer');
  var drawerFrame = document.getElementById('frame-drawer-analysis');
  var drawerLoaded = false;

  // 首次打开时注入 src（懒加载），避免首屏加载账单分析脚本
  function ensureDrawerLoaded() {
    if (!drawerLoaded && drawerFrame && !drawerFrame.src && drawerFrame.dataset.src) {
      drawerFrame.src = drawerFrame.dataset.src;
      drawerLoaded = true;
    }
  }

  // 推送给抽屉内视图当前角色
  function pushDrawerRole(role) {
    if (!drawerFrame || !drawerFrame.contentWindow) return;
    drawerFrame.contentWindow.postMessage({ type: 'set-role', role: role }, '*');
  }

  function openDrawer() {
    ensureDrawerLoaded();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerMask.classList.add('open');
    // 抽屉由 iframe 内的按钮触发，此时焦点在子页；
    // 主动收回焦点，ESC 才能被外壳页监听到
    drawerClose.focus();
    // 抽屉打开后触发一次重绘，图表依赖真实宽高
    requestAnimationFrame(function () {
      try {
        drawerFrame.contentWindow.dispatchEvent(new Event('resize'));
      } catch (e) { /* 跨域时忽略 */ }
    });
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerMask.classList.remove('open');
  }

  var drawerClose = document.getElementById('drawer-close');
  drawerClose.addEventListener('click', closeDrawer);
  drawerMask.addEventListener('click', closeDrawer);

  // ESC 关闭抽屉
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // 抽屉 iframe 加载完成后补推当前角色，保证分析页状态一致
  if (drawerFrame) {
    drawerFrame.addEventListener('load', function () {
      pushDrawerRole(currentRoleKey);
    });
  }
})();
