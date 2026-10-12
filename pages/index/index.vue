<template>
	<view class="page-container">
		<!-- 页面上方：操作按钮与状态栏 -->
		<view class="top-bar-card">
			<view class="action-btn-group">
				<button class="btn-main" @tap="handleMainButtonClick" :loading="isUploading">
					<text class="btn-icon" v-if="!isUploading">{{ isVerified ? '📊' : '🔒' }}</text>
					<text class="btn-text">{{ isUploading ? '正在解析导入...' : (isVerified ? '上传Excel并入库' : '验证密码并上传') }}</text>
				</button>
				<button class="btn-share" open-type="share">
					<text class="share-icon">📤</text>
					<text>分享</text>
				</button>
			</view>

			<view class="status-box">
				<view class="status-pill" :class="isVerified ? 'status-unlocked' : 'status-locked'">
					<text class="status-dot"></text>
					<text class="status-label">{{ isVerified ? '已解锁权限' : '待验证密码' }}</text>
				</view>
				<text v-if="isVerified" class="lock-link" @tap="lockAccess">重新锁定</text>
			</view>
		</view>

		<!-- 页面下方：内容展示卡片 -->
		<!-- 纯净 Excel 数据表格（支持输入商品编号查询） -->
		<view class="table-card">
			<!-- 🔍 列表查询条件：输入商品编号查询 -->
			<view class="filter-panel">
				<view class="filter-row">
					<view class="filter-label-wrap">
						<text class="filter-label">商品编号：</text>
					</view>
					<view class="filter-input-wrapper">
						<text class="filter-icon">🔍</text>
						<input 
							class="filter-input" 
							type="text" 
							:value="searchProductCode" 
							placeholder="输入商品编号查询..." 
							placeholder-class="input-placeholder"
							@input="onProductCodeInput"
							@confirm="handleSearch"
						/>
						<text class="clear-input-icon" v-if="searchProductCode" @tap="clearSearch">✕</text>
					</view>
					<view class="filter-actions">
						<button class="btn-filter-search" @tap="handleSearch">
							<text class="btn-filter-icon">🔍</text>
							<text>查询</text>
						</button>
						<button class="btn-filter-reset" v-if="searchProductCode" @tap="clearSearch">
							<text>重置</text>
						</button>
					</view>
				</view>

				<!-- 筛选状态提示条 -->
				<view class="filter-status-tag" v-if="searchProductCode">
					<view class="tag-left">
						<text class="tag-badge">筛选中</text>
						<text class="tag-desc">商品编号包含「<text class="tag-highlight">{{ searchProductCode }}</text>」</text>
					</view>
					<view class="tag-right">
						<text class="tag-count">匹配 {{ displayExcelRecords.length }} 条</text>
						<text class="tag-clear-btn" @tap="clearSearch">清除 ✕</text>
					</view>
				</view>
			</view>

			<!-- 横向可滚动的工整对齐表格 -->
			<scroll-view class="table-scroll-view" scroll-x="true">
				<view class="pure-excel-table">
					<!-- 表头：仅展示 Excel 原始列名 -->
					<view class="excel-tr excel-header-tr">
						<view 
							class="excel-th" 
							v-for="(header, hIdx) in dynamicHeaders" 
							:key="hIdx"
						>
							<text class="excel-cell-text th-font">{{ formatHeader(header) }}</text>
						</view>
					</view>

					<!-- 空数据状态 -->
					<view class="empty-state" v-if="displayExcelRecords.length === 0">
						<text class="empty-icon">{{ searchProductCode ? '🔎' : '📈' }}</text>
						<text class="empty-text">
							{{ searchProductCode ? `未找到商品编号包含「${searchProductCode}」的记录` : '暂无 Excel 数据，点击上方按钮上传 .xlsx / .xls 文件自动解析入库' }}
						</text>
						<button class="btn-reset-empty" v-if="searchProductCode" @tap="clearSearch">重置查询条件</button>
					</view>

					<!-- 数据行：展示过滤后的 Excel 数据 -->
					<view 
						class="excel-tr excel-body-tr" 
						v-for="(row, rIdx) in displayExcelRecords" 
						:key="row._id || rIdx"
						:class="{ 'excel-tr-even': rIdx % 2 === 1 }"
					>
						<view 
							class="excel-td" 
							v-for="(header, hIdx) in dynamicHeaders" 
							:key="hIdx"
						>
							<text class="excel-cell-text">{{ formatCell(row, header) }}</text>
						</view>
					</view>
				</view>
			</scroll-view>
		</view>

		<!-- 密码验证弹窗 -->
		<view class="modal-mask" v-if="showModal" @tap="closePasswordModal">
			<view class="modal-card" @tap.stop="stopEvent">
				<view class="modal-header">
					<text class="modal-title">身份密码验证</text>
					<text class="modal-close" @tap.stop="closePasswordModal">✕</text>
				</view>
				
				<view class="modal-body">
					<text class="modal-desc">请输入验证密码以解锁 Excel 上传与解析：</text>
					<view class="input-wrapper" :class="{ 'has-error': hasError }">
						<input 
							class="pwd-input" 
							type="password" 
							:value="passwordInput"
							placeholder="请输入验证密码" 
							:focus="showModal"
							@confirm="verifyPassword"
							@input="onPasswordInput"
						/>
					</view>
					<text class="error-msg" v-if="hasError">{{ errorMessage }}</text>
				</view>

				<view class="modal-footer">
					<button class="modal-btn btn-cancel" @tap.stop="closePasswordModal">取消</button>
					<button class="modal-btn btn-confirm" @tap.stop="verifyPassword">确认验证</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				envId: 'cloud1-d1gqnxb9p710b6580', // 微信云开发环境ID
				correctPassword: '2026918',         // 验证密码
				showModal: false,                  // 密码弹窗状态
				passwordInput: '',                 // 输入的密码
				isVerified: false,                 // 是否已验证
				hasError: false,                   // 密码错误标识
				errorMessage: '',                  // 错误信息
				isUploading: false,                // 上传与解析状态
				currentTab: 'excel',               // 当前选中的 Tab ('excel' | 'files')
				searchProductCode: '',             // 商品编号查询关键字
				dynamicHeaders: ['商品编号', '商品名称', '规格型号', '库存数量', '单价'], // Excel 默认/原始有序表头
				excelRecords: [],                  // 从云数据库 excel_data 查询到的行数据
				fileList: []                       // 云存储文件列表
			}
		},
		computed: {
			// 按商品编号及字段动态过滤数据列表
			displayExcelRecords() {
				const kw = (this.searchProductCode || '').trim().toLowerCase();
				if (!kw) {
					return this.excelRecords;
				}
				
				return this.excelRecords.filter(row => {
					if (!row) return false;
					
					// 1. 优先匹配包含 "商品编号"、"编号"、"货号"、"条码"、"sku"、"code"、"编码"、"物料" 的字段
					const targetKeys = Object.keys(row).filter(key => {
						if (key.startsWith('_')) return false;
						const lowerKey = key.toLowerCase();
						return lowerKey.includes('编号') || lowerKey.includes('编码') || 
						       lowerKey.includes('货号') || lowerKey.includes('条码') || 
						       lowerKey.includes('code') || lowerKey.includes('sku') || 
						       lowerKey.includes('商品') || lowerKey.includes('物料') ||
						       lowerKey.includes('产品');
					});

					if (targetKeys.length > 0) {
						const matchedTarget = targetKeys.some(key => {
							const val = this.formatCell(row, key).toLowerCase();
							return val.includes(kw);
						});
						if (matchedTarget) return true;
					}

					// 2. 兜底：对该行的所有非系统字段值进行模糊匹配
					return Object.keys(row).some(key => {
						if (key.startsWith('_')) return false;
						const val = this.formatCell(row, key).toLowerCase();
						return val.includes(kw);
					});
				});
			}
		},
		onLoad() {
			// #ifdef MP-WEIXIN
			// 开启右上角“...”菜单中的【发送给朋友】和【分享到朋友圈】
			if (wx.showShareMenu) {
				wx.showShareMenu({
					withShareTicket: true,
					menus: ['shareAppMessage', 'shareTimeline']
				});
			}
			// #endif

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
				title: '商品数据管理 - 快速查询与管理',
				path: '/pages/index/index',
				// imageUrl: '/static/share-cover.png' // 可自定义分享卡片封面图（不填则默认截取当前界面）
			};
		},
		// 2. 微信分享到朋友圈
		onShareTimeline() {
			return {
				title: '商品数据管理 - 快速查询与管理',
				query: '',
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
				this.searchProductCode = e.detail ? e.detail.value : (e.target ? e.target.value : '');
			},
			// 点击查询：调用云接口进行全量数据库查询
			async handleSearch() {
				const kw = (this.searchProductCode || '').trim();
				if (!kw) {
					uni.showToast({ title: '请输入商品编号', icon: 'none' });
					return;
				}
				await this.fetchExcelDatabaseRecords(kw, true);
			},
			// 清空/重置查询条件并重新拉取全量数据
			async clearSearch() {
				this.searchProductCode = '';
				await this.fetchExcelDatabaseRecords('', false);
				uni.showToast({ title: '已重置查询条件', icon: 'none', duration: 1000 });
			},
			// 格式化表头显示内容
			formatHeader(header) {
				if (header === undefined || header === null) return '';
				if (typeof header === 'object') {
					return header.title || header.name || header.w || header.v || Object.values(header)[0] || '';
				}
				return String(header);
			},
			// 格式化单元格数据，防止输出 [object Object]
			formatCell(row, header) {
				if (!row) return '-';
				const key = this.formatHeader(header);
				let val = row[key];
				
				if (val === undefined || val === null || val === '') {
					val = row[key.trim()];
				}
				
				if (val === undefined || val === null || val === '') return '-';

				if (typeof val === 'object') {
					if (val instanceof Date) {
						return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
					}
					if (val.w !== undefined && val.w !== null) return String(val.w);
					if (val.v !== undefined && val.v !== null) return String(val.v);
					if (val.text !== undefined && val.text !== null) return String(val.text);
					for (const k of Object.keys(val)) {
						if (typeof val[k] === 'string' || typeof val[k] === 'number') {
							return String(val[k]);
						}
					}
					return '-';
				}
				return String(val);
			},
			// 初始化微信云开发
			initCloud() {
				// #ifdef MP-WEIXIN
				try {
					if (wx.cloud) {
						wx.cloud.init({
							env: this.envId,
							traceUser: true
						});
					}
				} catch (e) {
					console.error('[微信云开发] 初始化异常:', e);
				}
				// #endif
			},
			// 从云端读取已解析的 Excel 记录（支持全量批量加载与接口级关键字查询）
			async fetchExcelDatabaseRecords(searchKw = '', isManualSearch = false) {
				const kw = (searchKw !== undefined && searchKw !== null ? searchKw : this.searchProductCode || '').trim();

				// 1. 先从本地缓存加载表头和数据（无查询词时）
				if (!kw && (!this.excelRecords || this.excelRecords.length === 0)) {
					try {
						const cachedHeaders = uni.getStorageSync('wechat_excel_headers_' + this.envId);
						if (cachedHeaders && Array.isArray(cachedHeaders) && cachedHeaders.length > 0) {
							this.dynamicHeaders = cachedHeaders.map(h => this.formatHeader(h));
						}

						const localExcelData = uni.getStorageSync('wechat_excel_data_' + this.envId);
						if (localExcelData && Array.isArray(localExcelData) && localExcelData.length > 0) {
							this.excelRecords = localExcelData;
							this.applyOrderedHeaders(localExcelData);
						}
					} catch (e) {}
				}

				// 2. 从云开发接口拉取数据（突破20条限制）
				// #ifdef MP-WEIXIN
				if (wx.cloud) {
					if (isManualSearch) {
						uni.showLoading({ title: kw ? '查询云端中...' : '加载数据中...', mask: true });
					}
					try {
						// 2.1 优先调用云函数接口进行全库检索（单次最高可获取1000条并支持服务端模糊匹配）
						const res = await wx.cloud.callFunction({
							name: 'parseExcel',
							data: {
								action: 'query',
								keyword: kw
							}
						});

						if (res && res.result && res.result.success) {
							const records = res.result.list || [];
							this.excelRecords = records;
							
							if (res.result.headers && Array.isArray(res.result.headers) && res.result.headers.length > 0) {
								this.dynamicHeaders = res.result.headers.map(h => this.formatHeader(h));
								uni.setStorageSync('wechat_excel_headers_' + this.envId, this.dynamicHeaders);
							} else {
								this.applyOrderedHeaders(records);
							}

							if (!kw) {
								uni.setStorageSync('wechat_excel_data_' + this.envId, records);
							}

							if (isManualSearch) {
								uni.hideLoading();
								if (kw) {
									uni.showToast({
										title: records.length > 0 ? `云端查到 ${records.length} 条数据` : `未查到商品编号「${kw}」`,
										icon: records.length > 0 ? 'success' : 'none',
										duration: 2000
									});
								}
							}
							return;
						}
					} catch (callErr) {
						console.log('[云函数 query 调用失败，降级使用客户端分页查询]:', callErr);
					}

					// 2.2 降级方案：客户端数据库批量查询（通过 Promise.all 分页突破 20 条单次限制）
					try {
						const db = wx.cloud.database({ env: this.envId });
						const countRes = await db.collection('excel_data').count();
						const total = countRes.total || 0;

						const MAX_LIMIT = 20; // 小程序端单次限制 20
						const batchTimes = Math.ceil(Math.min(total, 500) / MAX_LIMIT);
						const tasks = [];
						for (let i = 0; i < batchTimes; i++) {
							tasks.push(
								db.collection('excel_data')
									.orderBy('_timestamp', 'desc')
									.skip(i * MAX_LIMIT)
									.limit(MAX_LIMIT)
									.get()
							);
						}
						const batchRes = await Promise.all(tasks);
						const clientData = batchRes.reduce((acc, cur) => acc.concat(cur.data || []), []);

						if (clientData.length > 0) {
							this.excelRecords = clientData;
							this.applyOrderedHeaders(clientData);
							if (!kw) {
								uni.setStorageSync('wechat_excel_data_' + this.envId, clientData);
								uni.setStorageSync('wechat_excel_headers_' + this.envId, this.dynamicHeaders);
							}
						}

						if (isManualSearch) {
							uni.hideLoading();
							const matchCount = this.displayExcelRecords.length;
							uni.showToast({
								title: matchCount > 0 ? `查到 ${matchCount} 条记录` : `未查到商品编号「${kw}」`,
								icon: matchCount > 0 ? 'success' : 'none',
								duration: 2000
							});
						}
					} catch (clientDbErr) {
						console.error('[客户端数据库查询异常]:', clientDbErr);
						if (isManualSearch) {
							uni.hideLoading();
						}
					}
				}
				// #endif
			},
			// 严格按云函数返回或存入的 _headers 确定表头顺序
			applyOrderedHeaders(records) {
				if (!records || records.length === 0) return;
				
				const firstRecord = records[0];
				if (firstRecord && firstRecord._headers && Array.isArray(firstRecord._headers) && firstRecord._headers.length > 0) {
					this.dynamicHeaders = firstRecord._headers.map(h => this.formatHeader(h));
					return;
				}

				const headerList = [];
				const ignoreKeys = ['_id', '_openid', '_sourceFileName', '_fileID', '_sheetName', '_rowIndex', '_importTime', '_timestamp', '_headers', 'id', 'status', 'statusText'];
				
				Object.keys(firstRecord).forEach(key => {
					if (!ignoreKeys.includes(key) && !key.startsWith('_')) {
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
					const localFiles = uni.getStorageSync('wechat_cloud_files_' + this.envId);
					if (localFiles && Array.isArray(localFiles) && localFiles.length > 0) {
						this.fileList = localFiles;
					}
				} catch (e) {}
			},
			savePersistentData() {
				try {
					uni.setStorageSync('wechat_cloud_files_' + this.envId, this.fileList);
					uni.setStorageSync('wechat_excel_data_' + this.envId, this.excelRecords);
					uni.setStorageSync('wechat_excel_headers_' + this.envId, this.dynamicHeaders);
				} catch (e) {}
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
				this.passwordInput = '';
				this.hasError = false;
				this.errorMessage = '';
				this.showModal = true;
			},
			closePasswordModal() {
				this.showModal = false;
				this.passwordInput = '';
				this.hasError = false;
			},
			onPasswordInput(e) {
				const val = e.detail ? e.detail.value : (e.target ? e.target.value : '');
				this.passwordInput = val;
				if (this.hasError) {
					this.hasError = false;
					this.errorMessage = '';
				}
			},
			// 校验密码
			verifyPassword() {
				const inputPwd = (this.passwordInput || '').trim();
				if (!inputPwd) {
					this.hasError = true;
					this.errorMessage = '请输入验证密码';
					uni.showToast({ title: '请输入密码', icon: 'none' });
					return;
				}

				if (inputPwd === this.correctPassword) {
					this.isVerified = true;
					this.showModal = false;
					this.passwordInput = '';
					this.hasError = false;
					uni.showToast({
						title: '验证成功！',
						icon: 'success',
						duration: 1500
					});
					setTimeout(() => {
						this.chooseAndUploadFile();
					}, 400);
				} else {
					this.hasError = true;
					this.errorMessage = '密码错误，请重新输入';
					uni.showToast({
						title: '密码错误',
						icon: 'none',
						duration: 2000
					});
				}
			},
			lockAccess() {
				this.isVerified = false;
				uni.showToast({ title: '已重新锁定', icon: 'none' });
			},
			// 选择文件并上传到微信云存储 + 触发 Excel 云函数解析
			chooseAndUploadFile() {
				// #ifdef MP-WEIXIN
				if (wx.chooseMessageFile) {
					wx.chooseMessageFile({
						count: 3,
						type: 'file',
						extension: ['xlsx', 'xls', 'csv', 'pdf', 'docx', 'png', 'jpg'],
						success: (res) => {
							const files = res.tempFiles || [];
							this.processUploadAndParse(files);
						},
						fail: (err) => {
							console.log('[选择文件取消/失败]', err);
						}
					});
					return;
				}
				// #endif

				// #ifndef MP-WEIXIN
				if (uni.chooseFile) {
					uni.chooseFile({
						count: 1,
						type: 'all',
						success: (res) => {
							this.mockExcelParse(res.tempFiles || []);
						}
					});
				} else {
					uni.showToast({ title: '请在微信开发者工具中测试', icon: 'none' });
				}
				// #endif
			},
			// 处理文件上传并调用云函数解析 Excel
			async processUploadAndParse(files) {
				if (!files || files.length === 0) return;

				this.isUploading = true;
				uni.showLoading({ title: '正在上传云端...', mask: true });

				let excelParsedCount = 0;

				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					const filePath = file.path || file.tempFilePath;
					const fileName = file.name || `excel_${Date.now()}_${i + 1}.xlsx`;
					const ext = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : 'FILE';
					const isExcel = ext === 'XLSX' || ext === 'XLS';

					if (!filePath) continue;

					const cleanName = fileName.replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, '_');
					const cloudPath = `uploads/${Date.now()}_${Math.random().toString(36).slice(-4)}_${cleanName}`;

					try {
						this.initCloud();

						// 1. 上传 Excel 文件到微信云存储
						const uploadRes = await new Promise((resolve, reject) => {
							wx.cloud.uploadFile({
								cloudPath: cloudPath,
								filePath: filePath,
								config: { env: this.envId },
								success: resolve,
								fail: reject
							});
						});

						const fileID = uploadRes.fileID;
						const now = new Date();
						const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

						// 记录到云存储文件列表
						const fileRecord = {
							id: Date.now() + i,
							name: fileName,
							ext: ext,
							size: file.size || 0,
							uploadTime: timeStr,
							cloudPath: cloudPath,
							fileID: fileID,
							timestamp: Date.now(),
							status: 'success',
							statusText: '已存入云端'
						};
						this.fileList.unshift(fileRecord);
						this.savePersistentData();

						// 2. 如果是 Excel 文件，自动调用云函数 parseExcel 解析内容写入云数据库集合 excel_data
						if (isExcel) {
							uni.showLoading({ title: `正在解析 ${fileName}...`, mask: true });

							const parseRes = await wx.cloud.callFunction({
								name: 'parseExcel',
								data: {
									fileID: fileID,
									fileName: fileName
								}
							});

							console.log('[云函数 parseExcel 返回结果]:', parseRes);

							if (parseRes.result && parseRes.result.success) {
								excelParsedCount += parseRes.result.totalCount || 0;
								if (parseRes.result.headers && Array.isArray(parseRes.result.headers) && parseRes.result.headers.length > 0) {
									this.dynamicHeaders = parseRes.result.headers.map(h => this.formatHeader(h));
									uni.setStorageSync('wechat_excel_headers_' + this.envId, this.dynamicHeaders);
								}
								await this.fetchExcelDatabaseRecords();
								this.currentTab = 'excel';
							} else {
								uni.showModal({
									title: 'Excel解析提示',
									content: parseRes.result ? parseRes.result.message : '云函数解析未返回有效数据',
									showCancel: false
								});
							}
						}
					} catch (err) {
						console.error(`处理文件 ${fileName} 失败:`, err);
						uni.showModal({
							title: '上传/解析失败',
							content: `错误: ${err.errMsg || err.message || JSON.stringify(err)}\n\n若更新了云函数，请在微信开发者工具中右键 parseExcel 文件夹点击【上传并部署】`,
							showCancel: false
						});
					}
				}

				this.isUploading = false;
				uni.hideLoading();

				if (excelParsedCount > 0) {
					uni.showToast({
						title: `Excel导入成功！共 ${excelParsedCount} 行数据`,
						icon: 'success',
						duration: 2500
					});
				} else {
					uni.showToast({
						title: '文件上传完成',
						icon: 'success'
					});
				}
			},
			// 非小程序端模拟解析添加
			mockExcelParse(files) {
				const now = new Date();
				const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
				const fileName = files[0] ? files[0].name : '测试数据表.xlsx';
				
				this.dynamicHeaders = ['商品编号', '商品名称', '规格型号', '库存数量', '单价'];
				const mockRows = [
					{ _id: 'm1_' + Date.now(), _sourceFileName: fileName, _importTime: timeStr, _headers: this.dynamicHeaders, '商品编号': 'SP20260901', '商品名称': '智能无线降噪耳机 Pro', '规格型号': '星空黑/高保真', '库存数量': '150', '单价': '499.00' },
					{ _id: 'm2_' + Date.now(), _sourceFileName: fileName, _importTime: timeStr, _headers: this.dynamicHeaders, '商品编号': 'SP20260902', '商品名称': '机械人体工学键盘 K8', '规格型号': '青轴/RGB背光', '库存数量': '88', '单价': '329.00' },
					{ _id: 'm3_' + Date.now(), _sourceFileName: fileName, _importTime: timeStr, _headers: this.dynamicHeaders, '商品编号': 'SP20260903', '商品名称': '超清 4K 便携显示器', '规格型号': '15.6寸/Type-C直连', '库存数量': '42', '单价': '899.00' }
				];

				this.excelRecords = [...mockRows, ...this.excelRecords];
				this.currentTab = 'excel';
				this.savePersistentData();
				uni.showToast({ title: '模拟导入 3 条商品数据', icon: 'success' });
			},
			// 查看/下载文件
			handleFileAction(item) {
				// #ifdef MP-WEIXIN
				if (!item.fileID) {
					uni.showToast({ title: '无有效文件ID', icon: 'none' });
					return;
				}
				uni.showLoading({ title: '获取链接...' });
				wx.cloud.getTempFileURL({
					fileList: [item.fileID],
					success: (res) => {
						uni.hideLoading();
						const fileItem = res.fileList && res.fileList[0];
						if (fileItem && fileItem.tempFileURL) {
							const url = fileItem.tempFileURL;
							uni.showActionSheet({
								itemList: ['复制下载链接', '预览/打开文件'],
								success: (actionRes) => {
									if (actionRes.tapIndex === 0) {
										uni.setClipboardData({
											data: url,
											success: () => uni.showToast({ title: '链接已复制', icon: 'success' })
										});
									} else if (actionRes.tapIndex === 1) {
										uni.showLoading({ title: '加载中...' });
										uni.downloadFile({
											url: url,
											success: (dRes) => {
												uni.hideLoading();
												uni.openDocument({
													filePath: dRes.tempFilePath,
													showMenu: true,
													fail: () => uni.showToast({ title: '无法直接打开', icon: 'none' })
												});
											},
											fail: () => {
												uni.hideLoading();
												uni.showToast({ title: '下载失败', icon: 'none' });
											}
										});
									}
								}
							});
						}
					},
					fail: () => {
						uni.hideLoading();
						uni.showToast({ title: '获取失败', icon: 'none' });
					}
				});
				// #endif
			},
			// 删除云存储文件
			deleteFileRow(item, index) {
				uni.showModal({
					title: '确认删除',
					content: `确定删除文件【${item.name}】吗？`,
					success: (res) => {
						if (res.confirm) {
							// #ifdef MP-WEIXIN
							if (item.fileID) {
								wx.cloud.deleteFile({ fileList: [item.fileID] });
							}
							// #endif
							this.fileList.splice(index, 1);
							this.savePersistentData();
							uni.showToast({ title: '文件已删除', icon: 'none' });
						}
					}
				});
			},
			// 清空所有数据
			clearAllData() {
				uni.showModal({
					title: '确认清空',
					content: '确定清空所有 Excel 数据记录及文件列表吗？',
					success: (res) => {
						if (res.confirm) {
							this.excelRecords = [];
							this.fileList = [];
							this.searchProductCode = '';
							this.savePersistentData();
							uni.showToast({ title: '数据已清空', icon: 'none' });
						}
					}
				});
			},
			formatSize(bytes) {
				if (!bytes || bytes === 0) return '0 B';
				const k = 1024;
				const sizes = ['B', 'KB', 'MB', 'GB'];
				const i = Math.floor(Math.log(bytes) / Math.log(k));
				return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
			}
		}
	}
</script>

<style>
	/* 页面基础容器 */
	.page-container {
		min-height: 100vh;
		background-color: #f1f5f9;
		padding: 24rpx 20rpx;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 20rpx;
	}

	/* 顶部操作卡片 */
	.top-bar-card {
		background: #ffffff;
		border-radius: 18rpx;
		padding: 22rpx 24rpx;
		box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 16rpx;
	}

	.action-btn-group {
		display: flex;
		align-items: center;
		gap: 14rpx;
	}

	.btn-main {
		height: 76rpx;
		padding: 0 32rpx;
		background: linear-gradient(135deg, #07c160, #059669);
		color: #ffffff;
		font-size: 27rpx;
		font-weight: 600;
		border-radius: 14rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		box-shadow: 0 6rpx 16rpx rgba(7, 193, 96, 0.28);
	}

	.btn-main:active {
		opacity: 0.9;
		transform: scale(0.98);
	}

	.btn-icon {
		font-size: 28rpx;
		margin-right: 8rpx;
	}

	.btn-share {
		height: 76rpx;
		padding: 0 26rpx;
		background: #f1f5f9;
		color: #475569;
		font-size: 26rpx;
		font-weight: 500;
		border-radius: 14rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1rpx solid #e2e8f0;
	}

	.btn-share:active {
		background: #e2e8f0;
	}

	.share-icon {
		font-size: 26rpx;
		margin-right: 6rpx;
	}

	.status-box {
		display: flex;
		align-items: center;
		gap: 14rpx;
	}

	.status-pill {
		display: flex;
		align-items: center;
		padding: 6rpx 16rpx;
		border-radius: 30rpx;
	}

	.status-locked {
		background-color: #f1f5f9;
	}

	.status-locked .status-dot {
		background-color: #94a3b8;
	}

	.status-locked .status-label {
		color: #64748b;
	}

	.status-unlocked {
		background-color: #ecfdf5;
	}

	.status-unlocked .status-dot {
		background-color: #07c160;
	}

	.status-unlocked .status-label {
		color: #059669;
	}

	.status-dot {
		width: 12rpx;
		height: 12rpx;
		border-radius: 50%;
		margin-right: 8rpx;
	}

	.status-label {
		font-size: 23rpx;
		font-weight: 500;
	}

	.lock-link {
		font-size: 23rpx;
		color: #64748b;
		padding: 6rpx;
		text-decoration: underline;
	}

	/* 表格卡片 */
	.table-card {
		background: #ffffff;
		border-radius: 18rpx;
		padding: 24rpx 20rpx;
		box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	/* 🔍 查询条件筛选栏样式 */
	.filter-panel {
		background: #f8fafc;
		border: 1rpx solid #e2e8f0;
		border-radius: 14rpx;
		padding: 16rpx 18rpx;
		margin-bottom: 20rpx;
		display: flex;
		flex-direction: column;
		gap: 12rpx;
	}

	.filter-row {
		display: flex;
		align-items: center;
		gap: 12rpx;
		flex-wrap: nowrap;
	}

	.filter-label-wrap {
		flex-shrink: 0;
	}

	.filter-label {
		font-size: 26rpx;
		font-weight: 600;
		color: #334155;
		white-space: nowrap;
	}

	.filter-input-wrapper {
		flex: 1;
		height: 68rpx;
		background-color: #ffffff;
		border: 2rpx solid #cbd5e1;
		border-radius: 10rpx;
		display: flex;
		align-items: center;
		padding: 0 14rpx;
		box-sizing: border-box;
		transition: border-color 0.2s ease;
	}

	.filter-input-wrapper:focus-within {
		border-color: #3b82f6;
		box-shadow: 0 0 0 2rpx rgba(59, 130, 246, 0.15);
	}

	.filter-icon {
		font-size: 26rpx;
		margin-right: 8rpx;
		opacity: 0.5;
	}

	.filter-input {
		flex: 1;
		height: 100%;
		font-size: 25rpx;
		color: #1e293b;
	}

	.input-placeholder {
		color: #94a3b8;
		font-size: 24rpx;
	}

	.clear-input-icon {
		font-size: 26rpx;
		color: #94a3b8;
		padding: 6rpx 8rpx;
	}

	.filter-actions {
		display: flex;
		align-items: center;
		gap: 10rpx;
		flex-shrink: 0;
	}

	.btn-filter-search {
		height: 68rpx;
		padding: 0 24rpx;
		background: #3b82f6;
		color: #ffffff;
		font-size: 24rpx;
		font-weight: 600;
		border-radius: 10rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		box-shadow: 0 4rpx 10rpx rgba(59, 130, 246, 0.25);
	}

	.btn-filter-icon {
		font-size: 24rpx;
		margin-right: 6rpx;
	}

	.btn-filter-search:active {
		background: #2563eb;
		transform: scale(0.98);
	}

	.btn-filter-reset {
		height: 68rpx;
		padding: 0 18rpx;
		background: #e2e8f0;
		color: #475569;
		font-size: 24rpx;
		border-radius: 10rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
	}

	.btn-filter-reset:active {
		background: #cbd5e1;
	}

	/* 筛选中提示条 */
	.filter-status-tag {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #eff6ff;
		border: 1rpx dashed #93c5fd;
		border-radius: 8rpx;
		padding: 10rpx 14rpx;
		font-size: 22rpx;
	}

	.tag-left {
		display: flex;
		align-items: center;
		gap: 8rpx;
	}

	.tag-badge {
		background: #3b82f6;
		color: #ffffff;
		font-size: 19rpx;
		padding: 2rpx 8rpx;
		border-radius: 4rpx;
		font-weight: 500;
	}

	.tag-desc {
		color: #1e40af;
	}

	.tag-highlight {
		font-weight: bold;
		color: #1d4ed8;
	}

	.tag-right {
		display: flex;
		align-items: center;
		gap: 12rpx;
	}

	.tag-count {
		color: #2563eb;
		font-weight: 600;
	}

	.tag-clear-btn {
		color: #ef4444;
		cursor: pointer;
		font-weight: 500;
		padding: 2rpx 6rpx;
	}

	.btn-reset-empty {
		margin-top: 16rpx;
		height: 60rpx;
		padding: 0 24rpx;
		background-color: #eff6ff;
		color: #3b82f6;
		font-size: 23rpx;
		border-radius: 10rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
	}

	/* 表格滚动容器 */
	.table-scroll-view {
		width: 100%;
		overflow-x: auto;
	}

	/* 纯净 Excel 表格样式（工整对齐网格） */
	.pure-excel-table {
		min-width: 100%;
		width: max-content;
		display: flex;
		flex-direction: column;
		border: 1rpx solid #e2e8f0;
		border-radius: 12rpx;
		overflow: hidden;
	}

	.excel-tr {
		display: flex;
		flex-direction: row;
		width: 100%;
		border-bottom: 1rpx solid #e2e8f0;
	}

	.excel-tr:last-child {
		border-bottom: none;
	}

	.excel-header-tr {
		background-color: #f1f5f9;
	}

	.excel-th {
		flex: 1;
		min-width: 170rpx;
		padding: 20rpx 16rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		border-right: 1rpx solid #e2e8f0;
		box-sizing: border-box;
		background-color: #f1f5f9;
	}

	.excel-th:last-child {
		border-right: none;
	}

	.th-font {
		font-size: 26rpx;
		font-weight: 600;
		color: #1e293b;
		white-space: nowrap;
	}

	.excel-body-tr {
		background-color: #ffffff;
		transition: background-color 0.15s ease;
	}

	.excel-body-tr:hover, .excel-body-tr:active {
		background-color: #f8fafc;
	}

	.excel-tr-even {
		background-color: #fafbfc;
	}

	.excel-td {
		flex: 1;
		min-width: 170rpx;
		padding: 20rpx 16rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		border-right: 1rpx solid #e2e8f0;
		box-sizing: border-box;
	}

	.excel-td:last-child {
		border-right: none;
	}

	.excel-cell-text {
		font-size: 25rpx;
		color: #334155;
		line-height: 1.4;
		text-align: center;
		word-break: break-all;
	}

	/* 文件列表表格样式 */
	.data-table {
		min-width: 680px;
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	.table-row {
		display: flex;
		align-items: center;
		border-bottom: 1rpx solid #f1f5f9;
	}

	.table-header-row {
		background-color: #f8fafc;
		border-radius: 10rpx;
		font-weight: 600;
	}

	.th {
		padding: 18rpx 14rpx;
		font-size: 25rpx;
		color: #475569;
		text-align: left;
		display: flex;
		align-items: center;
		box-sizing: border-box;
	}

	.table-data-row {
		transition: background-color 0.2s ease;
	}

	.table-data-row:hover, .table-data-row:active {
		background-color: #f8fafc;
	}

	.row-even {
		background-color: #fafbfc;
	}

	.td {
		padding: 18rpx 14rpx;
		font-size: 25rpx;
		color: #334155;
		display: flex;
		align-items: center;
		box-sizing: border-box;
	}

	.cell-id {
		width: 60px;
		min-width: 60px;
		justify-content: center;
		text-align: center;
	}

	.cell-name {
		flex: 1;
		min-width: 180px;
		overflow: hidden;
	}

	.file-icon-mini {
		font-size: 26rpx;
		margin-right: 10rpx;
	}

	.file-name-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #0f172a;
		font-weight: 500;
	}

	.cell-ext {
		width: 75px;
		min-width: 75px;
	}

	.ext-tag {
		font-size: 19rpx;
		background-color: #e2e8f0;
		color: #475569;
		padding: 2rpx 8rpx;
		border-radius: 6rpx;
		font-weight: 600;
	}

	.cell-size {
		width: 85px;
		min-width: 85px;
		color: #64748b;
	}

	.cell-time {
		width: 140px;
		min-width: 140px;
		color: #64748b;
		font-size: 23rpx;
	}

	.cell-status {
		width: 95px;
		min-width: 95px;
	}

	.badge-status {
		font-size: 21rpx;
		padding: 4rpx 10rpx;
		border-radius: 6rpx;
	}

	.badge-status.success {
		background-color: #dcfce7;
		color: #15803d;
	}

	.cell-action {
		width: 90px;
		min-width: 90px;
		justify-content: center;
		gap: 12rpx;
	}

	.action-btn {
		font-size: 23rpx;
		cursor: pointer;
	}

	.link-text {
		color: #07c160;
	}

	.delete-text {
		color: #ef4444;
	}

	/* 空状态 */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 70rpx 20rpx;
	}

	.empty-icon {
		font-size: 56rpx;
		margin-bottom: 12rpx;
	}

	.empty-text {
		font-size: 24rpx;
		color: #94a3b8;
		text-align: center;
		line-height: 1.5;
	}

	/* 密码模态弹窗 */
	.modal-mask {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(15, 23, 42, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(4px);
		padding: 40rpx;
		box-sizing: border-box;
	}

	.modal-card {
		width: 100%;
		max-width: 580rpx;
		background: #ffffff;
		border-radius: 24rpx;
		overflow: hidden;
		box-shadow: 0 20rpx 50rpx rgba(0, 0, 0, 0.2);
		animation: modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes modalFadeIn {
		from {
			opacity: 0;
			transform: scale(0.92) translateY(20rpx);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 30rpx 32rpx 20rpx;
		border-bottom: 1rpx solid #f1f5f9;
	}

	.modal-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #1e293b;
	}

	.modal-close {
		font-size: 32rpx;
		color: #94a3b8;
		padding: 10rpx;
	}

	.modal-body {
		padding: 32rpx;
	}

	.modal-desc {
		font-size: 26rpx;
		color: #64748b;
		margin-bottom: 20rpx;
		display: block;
	}

	.input-wrapper {
		border: 2rpx solid #e2e8f0;
		border-radius: 14rpx;
		background-color: #f8fafc;
		padding: 0 20rpx;
		height: 84rpx;
		display: flex;
		align-items: center;
	}

	.input-wrapper.has-error {
		border-color: #ef4444;
		background-color: #fef2f2;
	}

	.pwd-input {
		width: 100%;
		height: 100%;
		font-size: 28rpx;
		color: #1e293b;
	}

	.error-msg {
		color: #ef4444;
		font-size: 22rpx;
		margin-top: 12rpx;
		display: block;
	}

	.modal-footer {
		display: flex;
		border-top: 1rpx solid #f1f5f9;
		padding: 20rpx 32rpx 30rpx;
		gap: 20rpx;
	}

	.modal-btn {
		flex: 1;
		height: 80rpx;
		font-size: 28rpx;
		font-weight: 600;
		border-radius: 14rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
	}

	.btn-cancel {
		background-color: #f1f5f9;
		color: #64748b;
	}

	.btn-confirm {
		background: linear-gradient(135deg, #07c160, #059669);
		color: #ffffff;
	}
</style>
