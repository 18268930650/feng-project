"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const common_vendor = require("./common/vendor.js");
if (!Math) {
  "./pages/index/index.js";
}
const _sfc_main = {
  onLaunch: function() {
    common_vendor.index.__f__("log", "at App.vue:4", "App Launch");
    if (common_vendor.wx$1.cloud) {
      common_vendor.wx$1.cloud.init({
        env: "cloud1-d1gqnxb9p710b6580",
        traceUser: true
      });
      common_vendor.index.__f__("log", "at App.vue:11", "微信云开发环境初始化完成: cloud1-d1gqnxb9p710b6580");
    } else {
      common_vendor.index.__f__("error", "at App.vue:13", "请使用 2.2.3 或以上的基础库以使用微信云能力");
    }
  },
  onShow: function() {
    common_vendor.index.__f__("log", "at App.vue:18", "App Show");
  },
  onHide: function() {
    common_vendor.index.__f__("log", "at App.vue:21", "App Hide");
  }
};
function createApp() {
  const app = common_vendor.createSSRApp(_sfc_main);
  return {
    app
  };
}
createApp().app.mount("#app");
exports.createApp = createApp;
//# sourceMappingURL=../.sourcemap/mp-weixin/app.js.map
