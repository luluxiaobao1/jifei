// ==========================================================
// 角色演示切换 —— 悬浮按钮的开关行为
// 账单概览与账单分析共用。原先角色栏是页面顶部一整条横栏，
// 占掉约 60px 首屏高度；改为右下角悬浮，点击展开面板。
//
// 只管「开 / 关 / 同步按钮上的角色名」，
// 切角色本身仍由各页 app.js 里的 switchRole() 负责 ——
// 两页的权限模型与重置逻辑不同，不宜合并。
//
// 需在各页 app.js 之后加载：本文件依赖 .role-btn 已绑好点击事件。
// ==========================================================

(function () {
  var fab = document.getElementById('role-fab');
  var pop = document.getElementById('role-pop');
  var name = document.getElementById('role-fab-name');
  if (!fab || !pop) return;

  function open() {
    pop.classList.add('open');
    fab.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
  }

  function close() {
    pop.classList.remove('open');
    fab.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  }

  fab.addEventListener('click', function (e) {
    e.stopPropagation();
    if (pop.classList.contains('open')) close(); else open();
  });

  // 面板内点击不关闭（角色按钮自己会触发关闭，见下）
  pop.addEventListener('click', function (e) { e.stopPropagation(); });

  // 选完角色即收起，并把按钮上的角色名同步为所选项
  pop.querySelectorAll('.role-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (name) name.textContent = btn.textContent.trim();
      close();
    });
  });

  // 点击页面空白处收起
  document.addEventListener('click', function () { close(); });

  // ESC 收起。各页已有 ESC 处理（关弹框、关抽屉），本文件在 app.js 之后加载，
  // 冒泡阶段会排在它们之后；故用捕获阶段抢先接住，面板展开时吞掉这次 ESC，
  // 避免一次按键连关两层。
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !pop.classList.contains('open')) return;
    close();
    e.stopPropagation();
  }, true);

  // 外壳广播 set-role 时（另一个视图切了角色）同步按钮上的角色名
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'set-role' || !name) return;
    var btn = pop.querySelector('.role-btn[data-role="' + e.data.role + '"]');
    if (btn) name.textContent = btn.textContent.trim();
  });
})();
