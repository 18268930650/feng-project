"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  data() {
    return {
      envId: "cloud1-d1gqnxb9p710b6580",
      // 微信云开发环境ID
      correctPassword: "2026918",
      // 验证密码
      showModal: false,
      // 密码弹窗状态
      passwordInput: "",
      // 输入的密码
      isVerified: false,
      // 是否已验证
      hasError: false,
      // 密码错误标识
      errorMessage: "",
      // 错误信息
      isUploading: false,
      // 上传与解析状态
      currentTab: "excel",
      // 当前选中的 Tab ('excel' | 'files')
      searchProductCode: "",
      // 商品编号查询关键字
      dynamicHeaders: ["商品编号", "商品名称", "规格型号", "库存数量", "单价"],
      // Excel 默认/原始有序表头
      excelRecords: [],
      // 从云数据库 excel_data 查询到的行数据
      fileList: []
      // 云存储文件列表
    };
  },
  computed: {
    // 按商品编号及字段动态过滤数据列表
    displayExcelRecords() {
      const kw = (this.searchProductCode || "").trim().toLowerCase();
      if (!kw) {
        return this.excelRecords;
      }
      return this.excelRecords.filter((row) => {
        if (!row)
          return false;
        const targetKeys = Object.keys(row).filter((key) => {
          if (key.startsWith("_"))
            return false;
          const lowerKey = key.toLowerCase();
          return lowerKey.includes("编号") || lowerKey.includes("编码") || lowerKey.includes("货号") || lowerKey.includes("条码") || lowerKey.includes("code") || lowerKey.includes("sku") || lowerKey.includes("商品") || lowerKey.includes("物料") || lowerKey.includes("产品");
        });
        if (targetKeys.length > 0) {
          const matchedTarget = targetKeys.some((key) => {
            const val = this.formatCell(row, key).toLowerCase();
            return val.includes(kw);
          });
          if (matchedTarget)
            return true;
        }
        return Object.keys(row).some((key) => {
          if (key.startsWith("_"))
            return false;
          const val = this.formatCell(row, key).toLowerCase();
          return val.includes(kw);
        });
      });
    }
  },
  onLoad() {
    if (common_vendor.wx$1.showShareMenu) {
      common_vendor.wx$1.showShareMenu({
        withShareTicket: true,
        menus: ["shareAppMessage", "shareTimeline"]
      });
    }
    this.initCloud();
    this.loadPersistentData();
    this.fetchExcelDatabaseRecords();
  },
  onShow() {
    this.loadPersistentData();
    this.fetchExcelDatabaseRecords();
  },
  // 1. 微信分享给好友 / 微信群
  onShareAppMessage(res) {
    return {
      title: "商品数据管理 - 快速查询与管理",
      path: "/pages/index/index"
      // imageUrl: '/static/share-cover.png' // 可自定义分享卡片封面图（不填则默认截取当前界面）
    };
  },
  // 2. 微信分享到朋友圈
  onShareTimeline() {
    return {
      title: "商品数据管理 - 快速查询与管理",
      query: ""
      // imageUrl: '/static/share-cover.png' // 可自定义朋友圈卡片封面图
    };
  },
  methods: {
    stopEvent(e) {
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }
    },
    // 商品编号输入事件
    onProductCodeInput(e) {
      this.searchProductCode = e.detail ? e.detail.value : e.target ? e.target.value : "";
    },
    // 点击查询：调用云接口进行全量数据库查询
    async handleSearch() {
      const kw = (this.searchProductCode || "").trim();
      if (!kw) {
        common_vendor.index.showToast({ title: "请输入商品编号", icon: "none" });
        return;
      }
      await this.fetchExcelDatabaseRecords(kw, true);
    },
    // 清空/重置查询条件并重新拉取全量数据
    async clearSearch() {
      this.searchProductCode = "";
      await this.fetchExcelDatabaseRecords("", false);
      common_vendor.index.showToast({ title: "已重置查询条件", icon: "none", duration: 1e3 });
    },
    // 格式化表头显示内容
    formatHeader(header) {
      if (header === void 0 || header === null)
        return "";
      if (typeof header === "object") {
        return header.title || header.name || header.w || header.v || Object.values(header)[0] || "";
      }
      return String(header);
    },
    // 格式化单元格数据，防止输出 [object Object]
    formatCell(row, header) {
      if (!row)
        return "-";
      const key = this.formatHeader(header);
      let val = row[key];
      if (val === void 0 || val === null || val === "") {
        val = row[key.trim()];
      }
      if (val === void 0 || val === null || val === "")
        return "-";
      if (typeof val === "object") {
        if (val instanceof Date) {
          return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
        }
        if (val.w !== void 0 && val.w !== null)
          return String(val.w);
        if (val.v !== void 0 && val.v !== null)
          return String(val.v);
        if (val.text !== void 0 && val.text !== null)
          return String(val.text);
        for (const k of Object.keys(val)) {
          if (typeof val[k] === "string" || typeof val[k] === "number") {
            return String(val[k]);
          }
        }
        return "-";
      }
      return String(val);
    },
    // 初始化微信云开发
    initCloud() {
      try {
        if (common_vendor.wx$1.cloud) {
          common_vendor.wx$1.cloud.init({
            env: this.envId,
            traceUser: true
          });
        }
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/index/index.vue:311", "[微信云开发] 初始化异常:", e);
      }
    },
    // 从云端读取已解析的 Excel 记录（支持全量批量加载与接口级关键字查询）
    async fetchExcelDatabaseRecords(searchKw = "", isManualSearch = false) {
      const kw = (searchKw !== void 0 && searchKw !== null ? searchKw : this.searchProductCode || "").trim();
      if (!kw && (!this.excelRecords || this.excelRecords.length === 0)) {
        try {
          const cachedHeaders = common_vendor.index.getStorageSync("wechat_excel_headers_" + this.envId);
          if (cachedHeaders && Array.isArray(cachedHeaders) && cachedHeaders.length > 0) {
            this.dynamicHeaders = cachedHeaders.map((h) => this.formatHeader(h));
          }
          const localExcelData = common_vendor.index.getStorageSync("wechat_excel_data_" + this.envId);
          if (localExcelData && Array.isArray(localExcelData) && localExcelData.length > 0) {
            this.excelRecords = localExcelData;
            this.applyOrderedHeaders(localExcelData);
          }
        } catch (e) {
        }
      }
      if (common_vendor.wx$1.cloud) {
        if (isManualSearch) {
          common_vendor.index.showLoading({ title: kw ? "查询云端中..." : "加载数据中...", mask: true });
        }
        try {
          const res = await common_vendor.wx$1.cloud.callFunction({
            name: "parseExcel",
            data: {
              action: "query",
              keyword: kw
            }
          });
          if (res && res.result && res.result.success) {
            const records = res.result.list || [];
            this.excelRecords = records;
            if (res.result.headers && Array.isArray(res.result.headers) && res.result.headers.length > 0) {
              this.dynamicHeaders = res.result.headers.map((h) => this.formatHeader(h));
              common_vendor.index.setStorageSync("wechat_excel_headers_" + this.envId, this.dynamicHeaders);
            } else {
              this.applyOrderedHeaders(records);
            }
            if (!kw) {
              common_vendor.index.setStorageSync("wechat_excel_data_" + this.envId, records);
            }
            if (isManualSearch) {
              common_vendor.index.hideLoading();
              if (kw) {
                common_vendor.index.showToast({
                  title: records.length > 0 ? `云端查到 ${records.length} 条数据` : `未查到商品编号「${kw}」`,
                  icon: records.length > 0 ? "success" : "none",
                  duration: 2e3
                });
              }
            }
            return;
          }
        } catch (callErr) {
          common_vendor.index.__f__("log", "at pages/index/index.vue:379", "[云函数 query 调用失败，降级使用客户端分页查询]:", callErr);
        }
        try {
          const db = common_vendor.wx$1.cloud.database({ env: this.envId });
          const countRes = await db.collection("excel_data").count();
          const total = countRes.total || 0;
          const MAX_LIMIT = 20;
          const batchTimes = Math.ceil(Math.min(total, 500) / MAX_LIMIT);
          const tasks = [];
          for (let i = 0; i < batchTimes; i++) {
            tasks.push(
              db.collection("excel_data").orderBy("_timestamp", "desc").skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
            );
          }
          const batchRes = await Promise.all(tasks);
          const clientData = batchRes.reduce((acc, cur) => acc.concat(cur.data || []), []);
          if (clientData.length > 0) {
            this.excelRecords = clientData;
            this.applyOrderedHeaders(clientData);
            if (!kw) {
              common_vendor.index.setStorageSync("wechat_excel_data_" + this.envId, clientData);
              common_vendor.index.setStorageSync("wechat_excel_headers_" + this.envId, this.dynamicHeaders);
            }
          }
          if (isManualSearch) {
            common_vendor.index.hideLoading();
            const matchCount = this.displayExcelRecords.length;
            common_vendor.index.showToast({
              title: matchCount > 0 ? `查到 ${matchCount} 条记录` : `未查到商品编号「${kw}」`,
              icon: matchCount > 0 ? "success" : "none",
              duration: 2e3
            });
          }
        } catch (clientDbErr) {
          common_vendor.index.__f__("error", "at pages/index/index.vue:422", "[客户端数据库查询异常]:", clientDbErr);
          if (isManualSearch) {
            common_vendor.index.hideLoading();
          }
        }
      }
    },
    // 严格按云函数返回或存入的 _headers 确定表头顺序
    applyOrderedHeaders(records) {
      if (!records || records.length === 0)
        return;
      const firstRecord = records[0];
      if (firstRecord && firstRecord._headers && Array.isArray(firstRecord._headers) && firstRecord._headers.length > 0) {
        this.dynamicHeaders = firstRecord._headers.map((h) => this.formatHeader(h));
        return;
      }
      const headerList = [];
      const ignoreKeys = ["_id", "_openid", "_sourceFileName", "_fileID", "_sheetName", "_rowIndex", "_importTime", "_timestamp", "_headers", "id", "status", "statusText"];
      Object.keys(firstRecord).forEach((key) => {
        if (!ignoreKeys.includes(key) && !key.startsWith("_")) {
          headerList.push(this.formatHeader(key));
        }
      });
      if (headerList.length > 0) {
        this.dynamicHeaders = headerList;
      }
    },
    // 读取文件列表持久化存储
    async loadPersistentData() {
      try {
        const localFiles = common_vendor.index.getStorageSync("wechat_cloud_files_" + this.envId);
        if (localFiles && Array.isArray(localFiles) && localFiles.length > 0) {
          this.fileList = localFiles;
        }
      } catch (e) {
      }
    },
    savePersistentData() {
      try {
        common_vendor.index.setStorageSync("wechat_cloud_files_" + this.envId, this.fileList);
        common_vendor.index.setStorageSync("wechat_excel_data_" + this.envId, this.excelRecords);
        common_vendor.index.setStorageSync("wechat_excel_headers_" + this.envId, this.dynamicHeaders);
      } catch (e) {
      }
    },
    // 顶部主按钮点击
    handleMainButtonClick() {
      if (!this.isVerified) {
        this.openPasswordModal();
      } else {
        this.chooseAndUploadFile();
      }
    },
    openPasswordModal() {
      this.passwordInput = "";
      this.hasError = false;
      this.errorMessage = "";
      this.showModal = true;
    },
    closePasswordModal() {
      this.showModal = false;
      this.passwordInput = "";
      this.hasError = false;
    },
    onPasswordInput(e) {
      const val = e.detail ? e.detail.value : e.target ? e.target.value : "";
      this.passwordInput = val;
      if (this.hasError) {
        this.hasError = false;
        this.errorMessage = "";
      }
    },
    // 校验密码
    verifyPassword() {
      const inputPwd = (this.passwordInput || "").trim();
      if (!inputPwd) {
        this.hasError = true;
        this.errorMessage = "请输入验证密码";
        common_vendor.index.showToast({ title: "请输入密码", icon: "none" });
        return;
      }
      if (inputPwd === this.correctPassword) {
        this.isVerified = true;
        this.showModal = false;
        this.passwordInput = "";
        this.hasError = false;
        common_vendor.index.showToast({
          title: "验证成功！",
          icon: "success",
          duration: 1500
        });
        setTimeout(() => {
          this.chooseAndUploadFile();
        }, 400);
      } else {
        this.hasError = true;
        this.errorMessage = "密码错误，请重新输入";
        common_vendor.index.showToast({
          title: "密码错误",
          icon: "none",
          duration: 2e3
        });
      }
    },
    lockAccess() {
      this.isVerified = false;
      common_vendor.index.showToast({ title: "已重新锁定", icon: "none" });
    },
    // 选择文件并上传到微信云存储 + 触发 Excel 云函数解析
    chooseAndUploadFile() {
      if (common_vendor.wx$1.chooseMessageFile) {
        common_vendor.wx$1.chooseMessageFile({
          count: 3,
          type: "file",
          extension: ["xlsx", "xls", "csv", "pdf", "docx", "png", "jpg"],
          success: (res) => {
            const files = res.tempFiles || [];
            this.processUploadAndParse(files);
          },
          fail: (err) => {
            common_vendor.index.__f__("log", "at pages/index/index.vue:546", "[选择文件取消/失败]", err);
          }
        });
        return;
      }
    },
    // 处理文件上传并调用云函数解析 Excel
    async processUploadAndParse(files) {
      if (!files || files.length === 0)
        return;
      this.isUploading = true;
      common_vendor.index.showLoading({ title: "正在上传云端...", mask: true });
      let excelParsedCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = file.path || file.tempFilePath;
        const fileName = file.name || `excel_${Date.now()}_${i + 1}.xlsx`;
        const ext = fileName.includes(".") ? fileName.split(".").pop().toUpperCase() : "FILE";
        const isExcel = ext === "XLSX" || ext === "XLS";
        if (!filePath)
          continue;
        const cleanName = fileName.replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, "_");
        const cloudPath = `uploads/${Date.now()}_${Math.random().toString(36).slice(-4)}_${cleanName}`;
        try {
          this.initCloud();
          const uploadRes = await new Promise((resolve, reject) => {
            common_vendor.wx$1.cloud.uploadFile({
              cloudPath,
              filePath,
              config: { env: this.envId },
              success: resolve,
              fail: reject
            });
          });
          const fileID = uploadRes.fileID;
          const now = /* @__PURE__ */ new Date();
          const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const fileRecord = {
            id: Date.now() + i,
            name: fileName,
            ext,
            size: file.size || 0,
            uploadTime: timeStr,
            cloudPath,
            fileID,
            timestamp: Date.now(),
            status: "success",
            statusText: "已存入云端"
          };
          this.fileList.unshift(fileRecord);
          this.savePersistentData();
          if (isExcel) {
            common_vendor.index.showLoading({ title: `正在解析 ${fileName}...`, mask: true });
            const parseRes = await common_vendor.wx$1.cloud.callFunction({
              name: "parseExcel",
              data: {
                fileID,
                fileName
              }
            });
            common_vendor.index.__f__("log", "at pages/index/index.vue:634", "[云函数 parseExcel 返回结果]:", parseRes);
            if (parseRes.result && parseRes.result.success) {
              excelParsedCount += parseRes.result.totalCount || 0;
              if (parseRes.result.headers && Array.isArray(parseRes.result.headers) && parseRes.result.headers.length > 0) {
                this.dynamicHeaders = parseRes.result.headers.map((h) => this.formatHeader(h));
                common_vendor.index.setStorageSync("wechat_excel_headers_" + this.envId, this.dynamicHeaders);
              }
              await this.fetchExcelDatabaseRecords();
              this.currentTab = "excel";
            } else {
              common_vendor.index.showModal({
                title: "Excel解析提示",
                content: parseRes.result ? parseRes.result.message : "云函数解析未返回有效数据",
                showCancel: false
              });
            }
          }
        } catch (err) {
          common_vendor.index.__f__("error", "at pages/index/index.vue:653", `处理文件 ${fileName} 失败:`, err);
          common_vendor.index.showModal({
            title: "上传/解析失败",
            content: `错误: ${err.errMsg || err.message || JSON.stringify(err)}

若更新了云函数，请在微信开发者工具中右键 parseExcel 文件夹点击【上传并部署】`,
            showCancel: false
          });
        }
      }
      this.isUploading = false;
      common_vendor.index.hideLoading();
      if (excelParsedCount > 0) {
        common_vendor.index.showToast({
          title: `Excel导入成功！共 ${excelParsedCount} 行数据`,
          icon: "success",
          duration: 2500
        });
      } else {
        common_vendor.index.showToast({
          title: "文件上传完成",
          icon: "success"
        });
      }
    },
    // 非小程序端模拟解析添加
    mockExcelParse(files) {
      const now = /* @__PURE__ */ new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const fileName = files[0] ? files[0].name : "测试数据表.xlsx";
      this.dynamicHeaders = ["商品编号", "商品名称", "规格型号", "库存数量", "单价"];
      const mockRows = [
        { _id: "m1_" + Date.now(), _sourceFileName: fileName, _importTime: timeStr, _headers: this.dynamicHeaders, "商品编号": "SP20260901", "商品名称": "智能无线降噪耳机 Pro", "规格型号": "星空黑/高保真", "库存数量": "150", "单价": "499.00" },
        { _id: "m2_" + Date.now(), _sourceFileName: fileName, _importTime: timeStr, _headers: this.dynamicHeaders, "商品编号": "SP20260902", "商品名称": "机械人体工学键盘 K8", "规格型号": "青轴/RGB背光", "库存数量": "88", "单价": "329.00" },
        { _id: "m3_" + Date.now(), _sourceFileName: fileName, _importTime: timeStr, _headers: this.dynamicHeaders, "商品编号": "SP20260903", "商品名称": "超清 4K 便携显示器", "规格型号": "15.6寸/Type-C直连", "库存数量": "42", "单价": "899.00" }
      ];
      this.excelRecords = [...mockRows, ...this.excelRecords];
      this.currentTab = "excel";
      this.savePersistentData();
      common_vendor.index.showToast({ title: "模拟导入 3 条商品数据", icon: "success" });
    },
    // 查看/下载文件
    handleFileAction(item) {
      if (!item.fileID) {
        common_vendor.index.showToast({ title: "无有效文件ID", icon: "none" });
        return;
      }
      common_vendor.index.showLoading({ title: "获取链接..." });
      common_vendor.wx$1.cloud.getTempFileURL({
        fileList: [item.fileID],
        success: (res) => {
          common_vendor.index.hideLoading();
          const fileItem = res.fileList && res.fileList[0];
          if (fileItem && fileItem.tempFileURL) {
            const url = fileItem.tempFileURL;
            common_vendor.index.showActionSheet({
              itemList: ["复制下载链接", "预览/打开文件"],
              success: (actionRes) => {
                if (actionRes.tapIndex === 0) {
                  common_vendor.index.setClipboardData({
                    data: url,
                    success: () => common_vendor.index.showToast({ title: "链接已复制", icon: "success" })
                  });
                } else if (actionRes.tapIndex === 1) {
                  common_vendor.index.showLoading({ title: "加载中..." });
                  common_vendor.index.downloadFile({
                    url,
                    success: (dRes) => {
                      common_vendor.index.hideLoading();
                      common_vendor.index.openDocument({
                        filePath: dRes.tempFilePath,
                        showMenu: true,
                        fail: () => common_vendor.index.showToast({ title: "无法直接打开", icon: "none" })
                      });
                    },
                    fail: () => {
                      common_vendor.index.hideLoading();
                      common_vendor.index.showToast({ title: "下载失败", icon: "none" });
                    }
                  });
                }
              }
            });
          }
        },
        fail: () => {
          common_vendor.index.hideLoading();
          common_vendor.index.showToast({ title: "获取失败", icon: "none" });
        }
      });
    },
    // 删除云存储文件
    deleteFileRow(item, index) {
      common_vendor.index.showModal({
        title: "确认删除",
        content: `确定删除文件【${item.name}】吗？`,
        success: (res) => {
          if (res.confirm) {
            if (item.fileID) {
              common_vendor.wx$1.cloud.deleteFile({ fileList: [item.fileID] });
            }
            this.fileList.splice(index, 1);
            this.savePersistentData();
            common_vendor.index.showToast({ title: "文件已删除", icon: "none" });
          }
        }
      });
    },
    // 清空所有数据
    clearAllData() {
      common_vendor.index.showModal({
        title: "确认清空",
        content: "确定清空所有 Excel 数据记录及文件列表吗？",
        success: (res) => {
          if (res.confirm) {
            this.excelRecords = [];
            this.fileList = [];
            this.searchProductCode = "";
            this.savePersistentData();
            common_vendor.index.showToast({ title: "数据已清空", icon: "none" });
          }
        }
      });
    },
    formatSize(bytes) {
      if (!bytes || bytes === 0)
        return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: !$data.isUploading
  }, !$data.isUploading ? {
    b: common_vendor.t($data.isVerified ? "📊" : "🔒")
  } : {}, {
    c: common_vendor.t($data.isUploading ? "正在解析导入..." : $data.isVerified ? "上传Excel并入库" : "验证密码并上传"),
    d: common_vendor.o((...args) => $options.handleMainButtonClick && $options.handleMainButtonClick(...args)),
    e: $data.isUploading,
    f: common_vendor.t($data.isVerified ? "已解锁权限" : "待验证密码"),
    g: common_vendor.n($data.isVerified ? "status-unlocked" : "status-locked"),
    h: $data.isVerified
  }, $data.isVerified ? {
    i: common_vendor.o((...args) => $options.lockAccess && $options.lockAccess(...args))
  } : {}, {
    j: $data.searchProductCode,
    k: common_vendor.o((...args) => $options.onProductCodeInput && $options.onProductCodeInput(...args)),
    l: common_vendor.o((...args) => $options.handleSearch && $options.handleSearch(...args)),
    m: $data.searchProductCode
  }, $data.searchProductCode ? {
    n: common_vendor.o((...args) => $options.clearSearch && $options.clearSearch(...args))
  } : {}, {
    o: common_vendor.o((...args) => $options.handleSearch && $options.handleSearch(...args)),
    p: $data.searchProductCode
  }, $data.searchProductCode ? {
    q: common_vendor.o((...args) => $options.clearSearch && $options.clearSearch(...args))
  } : {}, {
    r: $data.searchProductCode
  }, $data.searchProductCode ? {
    s: common_vendor.t($data.searchProductCode),
    t: common_vendor.t($options.displayExcelRecords.length),
    v: common_vendor.o((...args) => $options.clearSearch && $options.clearSearch(...args))
  } : {}, {
    w: common_vendor.f($data.dynamicHeaders, (header, hIdx, i0) => {
      return {
        a: common_vendor.t($options.formatHeader(header)),
        b: hIdx
      };
    }),
    x: $options.displayExcelRecords.length === 0
  }, $options.displayExcelRecords.length === 0 ? common_vendor.e({
    y: common_vendor.t($data.searchProductCode ? "🔎" : "📈"),
    z: common_vendor.t($data.searchProductCode ? `未找到商品编号包含「${$data.searchProductCode}」的记录` : "暂无 Excel 数据，点击上方按钮上传 .xlsx / .xls 文件自动解析入库"),
    A: $data.searchProductCode
  }, $data.searchProductCode ? {
    B: common_vendor.o((...args) => $options.clearSearch && $options.clearSearch(...args))
  } : {}) : {}, {
    C: common_vendor.f($options.displayExcelRecords, (row, rIdx, i0) => {
      return {
        a: common_vendor.f($data.dynamicHeaders, (header, hIdx, i1) => {
          return {
            a: common_vendor.t($options.formatCell(row, header)),
            b: hIdx
          };
        }),
        b: row._id || rIdx,
        c: rIdx % 2 === 1 ? 1 : ""
      };
    }),
    D: $data.showModal
  }, $data.showModal ? common_vendor.e({
    E: common_vendor.o((...args) => $options.closePasswordModal && $options.closePasswordModal(...args)),
    F: $data.passwordInput,
    G: $data.showModal,
    H: common_vendor.o((...args) => $options.verifyPassword && $options.verifyPassword(...args)),
    I: common_vendor.o((...args) => $options.onPasswordInput && $options.onPasswordInput(...args)),
    J: $data.hasError ? 1 : "",
    K: $data.hasError
  }, $data.hasError ? {
    L: common_vendor.t($data.errorMessage)
  } : {}, {
    M: common_vendor.o((...args) => $options.closePasswordModal && $options.closePasswordModal(...args)),
    N: common_vendor.o((...args) => $options.verifyPassword && $options.verifyPassword(...args)),
    O: common_vendor.o((...args) => $options.stopEvent && $options.stopEvent(...args)),
    P: common_vendor.o((...args) => $options.closePasswordModal && $options.closePasswordModal(...args))
  }) : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render]]);
_sfc_main.__runtimeHooks = 6;
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/index/index.js.map
